import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProjectStore} from '../src/core/store';
import {newProject,clipSchema} from '../src/core/model';
import {evaluate,evaluateClip,layerSpans,motionPhase} from '../src/core/motion';
import {svgObjects} from '../src/core/svg';
import {initializeGeometry,selectionInfo} from '../src/core/selection';
import {encodeProject,decodeProject} from '../src/core/persistence';
await initializeGeometry();
function setup(){
 const store=new ProjectStore(newProject('Timing',320,240)),screenId=store.snapshot.screens[0].id;
 const dispatch=(command:Record<string,unknown>)=>store.dispatch({screenId,...command},store.snapshot.revision,'mcp');
 dispatch({type:'artwork.import',svg:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect data-name="Tile" x="40" y="50" width="80" height="40" fill="#ff00ff"/><rect data-name="Static" x="200" y="50" width="40" height="40" fill="#00ffff"/></svg>'});
 const [objectId,staticId]=svgObjects(store.snapshot.screens[0].svg).map(object=>object.id),screen=()=>store.snapshot.screens[0];
 const put=(id:string,preset:string,start:number,duration=12)=>dispatch({type:'clip.put',clip:{id,objectId,preset,start,duration}});
 return {store,screenId,objectId,staticId,dispatch,screen,put};
}
test('future entrance never changes earlier frames and a different-property re-entry resets exit state',()=>{
 const {objectId,screen,put}=setup();put('out','Fade out',10);put('in','Slide',40);
 assert.equal(evaluate(screen(),5)[objectId].visible,1);assert.equal(evaluate(screen(),5)[objectId].opacity,1);assert.equal(evaluate(screen(),5)[objectId].x,0);
 assert.equal(evaluate(screen(),21)[objectId].visible,0);assert.equal(evaluate(screen(),30)[objectId].visible,0);
 assert.equal(evaluate(screen(),40)[objectId].visible,1);assert.equal(evaluate(screen(),40)[objectId].opacity,1);assert.equal(evaluate(screen(),40)[objectId].y,-120);
 assert.equal(evaluate(screen(),51)[objectId].y,0);assert.equal(evaluate(screen(),89)[objectId].visible,1);
 assert.deepEqual(layerSpans(screen(),objectId).map(({start,end})=>[start,end]),[[0,22],[40,90]]);
});
test('entrance begins on its own frame, every exit hides on its final sample, and endpoints settle',()=>{
 const {objectId,screen,put}=setup();put('in','Pop',20);
 assert.equal(evaluate(screen(),19)[objectId].visible,0);assert.equal(evaluate(screen(),20)[objectId].visible,1);assert.equal(evaluate(screen(),31)[objectId].scaleX,1);
 for(const preset of ['Fade out','Sink','Slide out','Shrink','Zoom out','Drift out','Spin out','Erase']){
  assert.equal(motionPhase(preset),'exit');const s={...screen(),clips:[clipSchema.parse({id:'exit',objectId,preset,start:78,duration:12})]};
  assert.equal(evaluate(s,88)[objectId].visible,1);assert.equal(evaluate(s,89)[objectId].visible,0);
 }
 const fade=clipSchema.parse({id:'one',objectId,preset:'Fade',start:4,duration:1});assert.equal(evaluateClip(fade,4).opacity,1);
});
test('range movement carries nested motions atomically, rejected trims retain history and FPS retimes ranges',()=>{
 const {store,objectId,dispatch,screen,put}=setup();put('in','Fade',10);put('out','Fade out',50);
 const range=layerSpans(screen(),objectId)[0];dispatch({type:'layer.span.put',objectId,span:{...range,start:20,end:72},moveClips:true});
 assert.deepEqual(screen().clips.map(clip=>clip.start),[20,60]);const before=store.snapshot,history=store.history;
 assert.throws(()=>dispatch({type:'layer.span.put',objectId,span:{...range,start:20,end:65}}),/fit inside/);assert.deepEqual(store.snapshot,before);assert.deepEqual(store.history,history);
 assert.equal(evaluate(screen(),19)[objectId].visible,0);assert.equal(evaluate(screen(),71)[objectId].visible,0);
 assert.deepEqual(decodeProject(encodeProject(store.snapshot)),store.snapshot);
 dispatch({type:'project.settings',width:320,height:240,fps:60});assert.deepEqual(screen().lifetimes[objectId].map(({start,end})=>[start,end]),[[40,144]]);
 dispatch({type:'history.undo'});assert.deepEqual(store.snapshot.screens,before.screens);
 dispatch({type:'layer.span.delete',objectId,spanId:range.id});assert.equal(screen().clips.length,0);assert.equal(evaluate(screen(),40)[objectId].visible,0);
 dispatch({type:'history.undo'});assert.deepEqual(store.snapshot.screens,before.screens);
});
test('new screens carry survivors with identity and final pose, excluding exits and old narration/motions',()=>{
 const {store,screenId,objectId,staticId,dispatch,put}=setup();put('out','Fade out',78);
 dispatch({type:'clip.put',clip:{id:'rotate',objectId:staticId,preset:'Rotate',start:0,duration:12,intensity:.25}});
 dispatch({type:'screen.add',afterScreenId:screenId,name:'Continued'});const next=store.snapshot.screens[1];
 assert.equal(next.clips.length,0);assert.equal(next.captions.length,0);assert.deepEqual(next.narration,{script:''});assert.equal(next.links[staticId],screenId);
 assert.ok(!svgObjects(next.svg).some(object=>object.id===objectId));assert.equal(svgObjects(next.svg)[0].id,staticId);assert.match(svgObjects(next.svg)[0].attributes.transform,/rotate\(90\)/);
 assert.deepEqual(selectionInfo(next.svg,[staticId]).bounds,{x:200,y:50,width:40,height:40});
 dispatch({type:'history.undo'});assert.equal(store.snapshot.screens.length,1);
});
test('opposite phases and motion inside a hidden gap reject without dropping editable work',()=>{
 const {store,objectId,dispatch,put}=setup();put('out','Fade out',10);const before=store.snapshot;
 assert.throws(()=>put('overlap','Slide',15),/Entrance and exit/);assert.deepEqual(store.snapshot,before);
 assert.throws(()=>put('hidden','Pulse',30),/outside.*visibility/);assert.deepEqual(store.snapshot,before);
 assert.throws(()=>dispatch({type:'layer.span.put',objectId:'missing',span:{id:'range',start:0,end:20}}),/not found/);assert.deepEqual(store.snapshot,before);
});
test('clipboard preserves visibility ranges with fresh identities',()=>{
 const {store,objectId,dispatch,screen}=setup();dispatch({type:'layer.span.put',objectId,span:{id:'range',start:10,end:50}});
 dispatch({type:'object.duplicate',objectIds:[objectId]});const fresh=svgObjects(screen().svg).find(object=>![objectId].includes(object.id)&&object.name==='Tile')!;
 assert.notEqual(fresh.id,objectId);assert.deepEqual(screen().lifetimes[fresh.id].map(({start,end})=>[start,end]),[[10,50]]);assert.notEqual(screen().lifetimes[fresh.id][0].id,'range');
});
