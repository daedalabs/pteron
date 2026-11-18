import {test} from 'node:test';
import {z} from 'zod';
import {commandSchema} from '../src/core/commands';
import assert from 'node:assert/strict';
import {ProjectStore} from '../src/core/store';
import {newProject} from '../src/core/model';
import {svgObjects} from '../src/core/svg';
import {evaluate,evaluateClip} from '../src/core/motion';
import {initializeGeometry,motionGeometry,bakeMotionSvg,selectionInfo} from '../src/core/selection';
import {snapFrame,snapCandidates,snapClipDelta} from '../src/core/timeline-editing';
import {encodeProject,decodeProject} from '../src/core/persistence';
await initializeGeometry();
function setup(){
 const store=new ProjectStore(newProject('Motion',320,240)),screenId=store.snapshot.screens[0].id;
 const dispatch=(command:unknown)=>store.dispatch(command,store.snapshot.revision,'mcp');
 dispatch({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg"><g data-name="Array"><rect data-name="A" x="20" y="20" width="20" height="20" fill="#ff00ff"/><rect data-name="B" x="70" y="20" width="20" height="20"/><rect data-name="C" x="120" y="20" width="20" height="20"/></g><rect data-name="Target" x="200" y="120" width="40" height="40"/></svg>'});
 const objects=svgObjects(store.snapshot.screens[0].svg),id=(name:string)=>objects.find(object=>object.name===name)!.id;
 const put=(clip:Record<string,unknown>)=>dispatch({type:'clip.put',screenId,clip:{id:'clip',objectId:id('A'),preset:'Pulse',start:0,duration:12,...clip}});
 return {store,screenId,dispatch,id,put,screen:()=>store.snapshot.screens[0]};
}
test('batch edits preserve relative timing and roll back every scene on conflict',()=>{
 const {store,screenId,dispatch,id,put,screen}=setup();put({id:'a',objectId:id('A'),start:10});put({id:'b',objectId:id('B'),start:15});
 const items=['a','b'].map(clipId=>({screenId,clipId}));const before=store.snapshot,h=store.history;
 dispatch({type:'clips.batch',items,action:'move',frames:5});assert.deepEqual(screen().clips.map(clip=>clip.start),[15,20]);assert.equal(store.history.undo,h.undo+1);
 dispatch({type:'history.undo'});assert.deepEqual(store.snapshot.screens,before.screens);
 dispatch({type:'clips.batch',items,action:'duplicate',frames:30});assert.equal(screen().clips.length,4);assert.deepEqual(screen().clips.slice(2).map(clip=>clip.start),[40,45]);assert.ok(screen().clips.slice(2).every(clip=>!['a','b'].includes(clip.id)));
 const saved=store.snapshot,history=store.history;assert.throws(()=>dispatch({type:'clips.batch',items,action:'move',frames:-40}),/before/);assert.deepEqual(store.snapshot,saved);assert.deepEqual(store.history,history);
 assert.throws(()=>dispatch({type:'clips.batch',items,action:'duplicate',frames:1}),/overlap/);assert.deepEqual(store.snapshot,saved);
 dispatch({type:'clips.batch',items,action:'stagger',frames:6});assert.deepEqual(screen().clips.slice(0,2).map(clip=>clip.start),[10,16]);
});
test('named narration markers snap exactly and survive package, FPS and undo',()=>{
 const {store,dispatch,screen,put}=setup();put({start:10});dispatch({type:'timeline.marker.put',marker:{id:'compare',frame:35,label:'Compare values'}});
 assert.deepEqual(decodeProject(encodeProject(store.snapshot)),store.snapshot);
 assert.equal(snapFrame(34,[0,35,50],2),35);assert.equal(snapFrame(31,[0,35],2),31);assert.ok(snapCandidates(screen(),20).includes(22));
 assert.deepEqual(snapClipDelta(10,12,47,[0,40,52,60,900],6),{delta:50,frame:60});
 dispatch({type:'project.settings',width:320,height:240,fps:60});assert.equal(store.snapshot.timelineMarkers![0].frame,70);
 dispatch({type:'history.undo'});assert.equal(store.snapshot.timelineMarkers![0].frame,35);
 dispatch({type:'timeline.marker.delete',markerId:'compare'});assert.equal(store.snapshot.timelineMarkers!.length,0);
});
test('unnamed markers keep their identity through naming, clearing, retiming and package history',()=>{
 const schema=z.toJSONSchema(commandSchema,{io:'input'}) as any;
 const marker=(schema.oneOf??schema.anyOf).find((variant:any)=>variant.properties?.type?.const==='timeline.marker.put');
 assert.deepEqual(marker.properties.marker.required,['id','frame'],'MCP advertises names as optional too');
 const {store,dispatch}=setup();const history=store.history.undo;
 dispatch({type:'timeline.marker.put',marker:{id:'point',frame:5}});
 assert.deepEqual(store.snapshot.timelineMarkers,[{id:'point',frame:5,label:''}]);assert.equal(store.history.undo,history+1);
 assert.deepEqual(decodeProject(encodeProject(store.snapshot)),store.snapshot);
 dispatch({type:'timeline.marker.put',marker:{id:'point',frame:5,label:'Compare'}});
 dispatch({type:'timeline.marker.put',marker:{id:'point',frame:5,label:''}});assert.equal(store.snapshot.timelineMarkers![0].label,'');
 dispatch({type:'history.undo'});assert.equal(store.snapshot.timelineMarkers![0].label,'Compare');
 dispatch({type:'history.redo'});assert.equal(store.snapshot.timelineMarkers![0].label,'');
 dispatch({type:'project.settings',width:320,height:240,fps:60});assert.deepEqual(store.snapshot.timelineMarkers,[{id:'point',frame:10,label:''}]);
 dispatch({type:'timeline.marker.delete',markerId:'point'});assert.deepEqual(store.snapshot.timelineMarkers,[]);
 dispatch({type:'history.undo'});assert.deepEqual(store.snapshot.timelineMarkers,[{id:'point',frame:10,label:''}]);
});
test('stagger reveals children at independent integer frames and rejects conflicting child fades',()=>{
 const {screenId,dispatch,id,put,screen,store}=setup();put({objectId:id('Array'),preset:'Stagger',duration:18,stagger:4});
 assert.equal(evaluate(screen(),0)[id('A')].opacity,0);assert.equal(evaluate(screen(),3)[id('B')].opacity,0);assert.ok(evaluate(screen(),5)[id('B')].opacity>0);assert.equal(evaluate(screen(),7)[id('C')].opacity,0);assert.equal(evaluate(screen(),17)[id('C')].opacity,1);
 const before=store.snapshot;assert.throws(()=>put({id:'conflict',objectId:id('B'),preset:'Fade',start:4,duration:8}),/overlap/);assert.deepEqual(store.snapshot,before);
 dispatch({type:'project.settings',width:320,height:240,fps:60});assert.equal(screen().clips[0].stagger,8);
});
test('long group reveals keep untimed children alive through the authored parent endpoint',()=>{
 const {store,screenId,dispatch,put,screen}=setup();
 dispatch({type:'artwork.import',screenId,svg:`<svg xmlns="http://www.w3.org/2000/svg"><g data-name="Long array">${Array.from({length:100},(_,index)=>`<rect data-name="Item ${index}" x="${index*4}" width="3" height="10"/>`).join('')}</g></svg>`});
 const objects=svgObjects(screen().svg),group=objects.find(object=>object.name==='Long array')!,last=objects.find(object=>object.name==='Item 99')!;
 put({objectId:group.id,preset:'Stagger',start:50,duration:309,stagger:3});assert.equal(screen().duration,359);assert.equal(evaluate(screen(),358)[last.id].visible,1);assert.equal(evaluate(screen(),358)[last.id].opacity,1);
 dispatch({type:'clip.delete',screenId,clipId:'clip'});assert.equal(screen().duration,90,'Removing parent motion restores the natural hold without a duration feedback loop');
});
test('smooth match compiles actual target geometry; crossfade uses complementary source and receiver opacity',()=>{
 const {put,id,screen,store}=setup();put({preset:'Smooth match',objectId:id('A'),targetObjectId:id('Target'),duration:11,easing:'linear'});
 assert.deepEqual(screen().clips[0].match,[2,0,0,2,160,80]);
 assert.equal(evaluate(screen(),0)[id('Target')].opacity,0);assert.equal(evaluate(screen(),10)[id('A')].visible,0);assert.equal(evaluate(screen(),10)[id('Target')].opacity,1);
 put({preset:'Crossfade replacement',objectId:id('A'),targetObjectId:id('Target'),duration:11,easing:'linear'});
 assert.equal(evaluate(screen(),5)[id('A')].opacity,.5);assert.equal(evaluate(screen(),5)[id('Target')].opacity,.5);
 const before=store.snapshot;assert.throws(()=>put({targetObjectId:id('Array'),preset:'Smooth match'}),/contain/);assert.deepEqual(store.snapshot,before);
});
test('custom paths, rotation pivots and drawing use deterministic samples',()=>{
 const {put,id,screen}=setup();put({preset:'Rotate',duration:11,from:{x:0,y:0},to:{x:100,y:0},control:{x:50,y:100},pivot:{x:0,y:0},easing:'linear'});
 const pose=evaluate(screen(),5)[id('A')];assert.equal(pose.x,50);assert.equal(pose.y,50);assert.equal(pose.pivotX,0);assert.equal(pose.rotation,180);
 put({preset:'Write on',duration:11,easing:'linear'});assert.equal(evaluate(screen(),5)[id('A')].draw,.5);assert.equal(evaluate(screen(),5)[id('A')].opacity,1);
 const c=screen().clips[0];assert.equal(evaluateClip({...c,preset:'Color highlight'},10).highlight,0);
 const geometry=motionGeometry(screen().svg,id('A'));assert.deepEqual(geometry.parentCenter,{x:30,y:30});
});
test('future replacements and repeated reveals do not hide earlier animation epochs',()=>{
 const {put,id,screen}=setup();put({id:'first',objectId:id('A'),preset:'Crossfade replacement',targetObjectId:id('Target'),start:0,duration:11,easing:'linear'});put({id:'second',objectId:id('A'),preset:'Crossfade replacement',targetObjectId:id('Target'),start:30,duration:11,easing:'linear'});
 assert.equal(evaluate(screen(),5)[id('Target')].opacity,.5);assert.equal(evaluate(screen(),20)[id('Target')].opacity,1);assert.equal(evaluate(screen(),30)[id('Target')].opacity,0);assert.equal(evaluate(screen(),30)[id('A')].visible,1);
});
test('named equation terms move by correspondence and highlight only selected terms',()=>{
 const {store,screenId,dispatch,put,screen}=setup();
 for(const [index,equationId] of ['one','two'].entries())dispatch({type:'equation.commit',screenId,equation:{id:equationId,source:index?'x+1':'x',terms:{},svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 10"><path d="M0 0H10V10H0Z"/><path d="M20 0H30V10H20Z"/></svg>`}});
 const objects=svgObjects(screen().svg),roots=['one','two'].map(equationId=>objects.find(object=>object.equationId===equationId)!),glyphs=roots.map(root=>objects.filter(object=>object.parentId===root.id&&object.type==='path'));
 dispatch({type:'object.edit',screenId,objectId:roots[1].id,attributes:{transform:'translate(100 50)'}});
 for(const [index,root] of roots.entries())dispatch({type:'equation.terms',screenId,equationId:root.equationId,terms:{x:glyphs[index][0].id,other:glyphs[index][1].id}});
 put({objectId:roots[0].id,preset:'Match terms',targetObjectId:roots[1].id,duration:11,easing:'linear',terms:['x']});assert.equal(screen().clips[0].matches!.length,1);const startBounds=selectionInfo(screen().svg,[glyphs[0][0].id]).bounds!,midBounds=selectionInfo(bakeMotionSvg(screen().svg,evaluate(screen(),5)),[glyphs[0][0].id]).bounds!;assert.ok(Math.abs(midBounds.x-startBounds.x-50)<1e-8);
 put({objectId:roots[0].id,preset:'Highlight terms',targetObjectId:undefined,duration:11,easing:'linear',terms:['x']});
 assert.equal(evaluate(screen(),5)[glyphs[0][0].id].highlight,1);assert.equal(evaluate(screen(),5)[glyphs[0][1].id].highlight,0);assert.equal(evaluate(screen(),10)[glyphs[0][0].id].highlight,0);
 assert.deepEqual(decodeProject(encodeProject(store.snapshot)),store.snapshot);
});
