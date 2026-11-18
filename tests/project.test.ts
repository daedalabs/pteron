import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../src/core/store';
import { newProject, clipSchema, presets } from '../src/core/model';
import { svgObjects,importSvg } from '../src/core/svg';
import { evaluate, evaluateClip, sampledPlan } from '../src/core/motion';
import { encodeProject,decodeProject,saveProject,loadProject } from '../src/core/persistence';
import {ProjectService} from '../src/core/service';
const fixture='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><svg x="10" y="20" width="100" height="80" viewBox="0 0 200 160"><g id="group"><rect id="r" width="40" height="20" fill="#ff00ff"/></g></svg></svg>';
test('editor structural layer is preserved without a duplicate component track',()=>{const svg=importSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="layer"><title>Layer 1</title><rect width="40" height="20"/></g></svg>');assert.equal(svgObjects(svg).length,1);assert.equal(svgObjects(svg)[0].name,'Rectangle');assert.match(svg,/class="layer /);});
test('screen drag reorder is atomic, undoable and preserves content and identities',()=>{const store=new ProjectStore(newProject('Order'));for(const name of ['Two','Three'])store.dispatch({type:'screen.add',name},store.snapshot.revision);const before=store.snapshot,first=before.screens[0];store.dispatch({type:'screen.reorder',screenId:first.id,index:2},before.revision,'mcp');assert.deepEqual(store.snapshot.screens.map(s=>s.id),[before.screens[1].id,before.screens[2].id,first.id]);assert.deepEqual(store.snapshot.screens[2],first);store.dispatch({type:'history.undo'},store.snapshot.revision);assert.deepEqual(store.snapshot.screens,before.screens);const saved=store.snapshot;assert.throws(()=>store.dispatch({type:'screen.reorder',screenId:first.id,index:8},saved.revision),/outside/);assert.deepEqual(store.snapshot,saved);});
test('equation is a source-linked shape whose identity, transform, fill and clips survive recompilation',()=>{const store=new ProjectStore(newProject('Math')),screenId=store.snapshot.screens[0].id;const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 10"><path d="M0 0H30V10H0Z" fill="black"/></svg>';const commit=(source:string,vector=svg)=>store.dispatch({type:'equation.commit',screenId,equation:{id:'eq',source,svg:vector,terms:{}}},store.snapshot.revision);commit('x');const object=svgObjects(store.snapshot.screens[0].svg).find(o=>o.equationId==='eq')!;assert.ok(object);store.dispatch({type:'object.edit',screenId,objectId:object.id,attributes:{transform:'translate(20 30)',fill:'#ffffff'}},store.snapshot.revision);store.dispatch({type:'clip.put',screenId,clip:{id:'motion',objectId:object.id,preset:'Press',start:0,duration:18}},store.snapshot.revision);commit('x+1',svg.replace('30 10','60 10'));const next=store.snapshot.screens[0],updated=svgObjects(next.svg).find(o=>o.equationId==='eq')!;assert.equal(updated.id,object.id);assert.equal(updated.attributes.transform,'translate(20 30)');assert.equal(updated.attributes.fill,'#ffffff');assert.equal(next.clips[0].objectId,object.id);assert.equal(next.equations[0].compiledSource,'x+1');const saved=store.snapshot;assert.throws(()=>commit('broken','<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'));assert.deepEqual(store.snapshot,saved);store.dispatch({type:'history.undo'},saved.revision);assert.equal(store.snapshot.screens[0].equations[0].source,'x');});
function setup(){const store=new ProjectStore(newProject('Test',320,480));const screenId=store.snapshot.screens[0].id;store.dispatch({type:'artwork.import',screenId,svg:fixture},0);return {store,screenId,objectId:svgObjects(store.snapshot.screens[0].svg).find(o=>o.type==='rect')!.id};}
test('package roundtrip retains editable nested geometry and identities',()=>{const {store}=setup(),p=store.snapshot;assert.deepEqual(decodeProject(encodeProject(p)),p);assert.match(p.screens[0].svg,/viewBox="0 0 200 160"/);});
test('stale and invalid commands leave project and history intact',()=>{const {store,screenId,objectId}=setup();const before=store.snapshot,h=store.history;assert.throws(()=>store.dispatch({type:'object.edit',screenId,objectId,attributes:{fill:'red'}},0),/Stale/);assert.throws(()=>store.dispatch({type:'object.edit',screenId,objectId,attributes:{onclick:'x'}},1),/cannot/);assert.deepEqual(store.snapshot,before);assert.deepEqual(store.history,h);});
test('manual and MCP edits share monotonic revisions and undo redo',()=>{const {store,screenId,objectId}=setup();store.dispatch({type:'object.edit',screenId,objectId,attributes:{fill:'#00ff00'}},1,'mcp');store.dispatch({type:'history.undo'},2);assert.match(store.snapshot.screens[0].svg,/#ff00ff/);store.dispatch({type:'history.redo'},3);assert.match(store.snapshot.screens[0].svg,/#00ff00/);assert.equal(store.snapshot.revision,4);assert.equal(store.activity[1].source,'mcp');});
test('same property conflicts reject; relative scale and translation compose',()=>{const {store,screenId,objectId}=setup();const put=(id:string,preset:string,start=0)=>store.dispatch({type:'clip.put',screenId,clip:{id,objectId,preset,start,duration:18}},store.snapshot.revision);put('a','Slide');put('b','Pulse');assert.throws(()=>put('c','Drift'),/overlap/);put('c','Drift',18);assert.throws(()=>store.dispatch({type:'screen.update',screenId,duration:10},store.snapshot.revision),/truncate/);assert.equal(store.snapshot.screens[0].clips.length,3);});
test('all preset samples are finite, deterministic and frame indexed',()=>{const {store,objectId}=setup(),screen=store.snapshot.screens[0];for(const preset of presets){const clip=clipSchema.parse({id:'clip',objectId,preset,start:5,duration:12});screen.clips=[clip];const plan=sampledPlan(screen);assert.equal(plan.length,screen.duration);for(const sample of plan){assert.equal(sample.frame,plan.indexOf(sample));assert.deepEqual(sample.objects,evaluate(screen,sample.frame));for(const pose of Object.values(sample.objects))for(const value of Object.values(pose))assert.ok(Number.isFinite(value));}}});
test('motion endpoint and repeat settling',()=>{const c=clipSchema.parse({id:'c',objectId:'o',preset:'Press',start:10,duration:18,repetitions:2});assert.equal(evaluateClip(c,10).scaleY,1);assert.equal(evaluateClip(c,28).scaleY,1);assert.ok(evaluateClip(c,14).scaleY<1);});
test('fresh imports separate identities and untrusted active content rejects',()=>{const a=importSvg(fixture),b=importSvg(a);assert.notEqual(svgObjects(a)[0].id,svgObjects(b)[0].id);for(const svg of ['<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><rect onload="x"/></svg>','<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>'])assert.throws(()=>importSvg(svg));});
test('atomic package and recovery preserve latest committed project',async()=>{const dir=await mkdtemp(join(tmpdir(),'pteron-'));const {store}=setup(),path=join(dir,'test.pteron');await saveProject(path,store.snapshot);assert.deepEqual(await loadProject(path),store.snapshot);await assert.rejects(saveProject(path,{...store.snapshot,width:0}));assert.deepEqual(await loadProject(path),store.snapshot);assert.ok((await readFile(path)).length>0);});
test('service recovery and combined SRT include cumulative screen offsets',async()=>{const dir=await mkdtemp(join(tmpdir(),'pteron-')),service=new ProjectService(join(dir,'recovery.pteron'));let p=service.store.snapshot;await service.call('command',{revision:p.revision,command:{type:'caption.put',screenId:p.screens[0].id,caption:{id:'cap',start:0,end:30,text:'Hello',draft:false}}});p=service.store.snapshot;await service.call('command',{revision:p.revision,command:{type:'screen.duplicate',screenId:p.screens[0].id}});assert.match(service.srt(),/00:00:01,000 --> 00:00:02,000/);assert.equal((await loadProject(service.recoveryPath)).revision,2);});
test('creating a project clears the previously opened save path',async()=>{const dir=await mkdtemp(join(tmpdir(),'pteron-')),service=new ProjectService(join(dir,'recovery.pteron'));service.path=join(dir,'existing.pteron');await service.call('command',{revision:service.store.snapshot.revision,command:{type:'project.create',name:'Untitled',width:1080,height:1920}});assert.equal(service.path,undefined);});

test('layer ancestry follows authored groups through structural wrappers and nested viewports',()=>{
 const svg=importSvg('<svg xmlns="http://www.w3.org/2000/svg"><defs><path d="M0 0L1 1"/></defs><g class="layer"><g data-name="Parent"><svg width="20" height="20"><g class="pteron-editor-wrapper"><rect data-name="Child" width="10" height="10"/></g></svg></g></g></svg>');
 const objects=svgObjects(svg),parent=objects.find(o=>o.name==='Parent')!,child=objects.find(o=>o.name==='Child')!;
 assert.equal(objects.length,2);assert.equal(parent.parentId,undefined);assert.equal(child.parentId,parent.id);
 assert.deepEqual(svgObjects(importSvg(svg,false)).map(o=>[o.id,o.parentId]),objects.map(o=>[o.id,o.parentId]));
});

test('individual rectangle corners retain identity, dimensions, history and package data',()=>{
 const {store,screenId,objectId}=setup();const edit=(attributes:Record<string,string|null>)=>store.dispatch({type:'object.edit',screenId,objectId,attributes},store.snapshot.revision,'mcp');
 edit({'data-corners':'1,2,3,4','stroke-dasharray':'8 4','stroke-linecap':'round'});
 let object=svgObjects(store.snapshot.screens[0].svg).find(o=>o.id===objectId)!;assert.equal(object.type,'rect');assert.match(object.attributes.d,/A 2 2/);assert.equal(object.attributes['data-corners'],'1,2,3,4');
 edit({width:'80'});object=svgObjects(store.snapshot.screens[0].svg).find(o=>o.id===objectId)!;assert.match(object.attributes.d,/H 78/);
 assert.deepEqual(decodeProject(encodeProject(store.snapshot)),store.snapshot);
 const before=store.snapshot;assert.throws(()=>edit({'data-corners':'-1,2,3,4'}),/nonnegative/);assert.deepEqual(store.snapshot,before);
 store.dispatch({type:'history.undo'},store.snapshot.revision);assert.equal(svgObjects(store.snapshot.screens[0].svg).find(o=>o.id===objectId)!.attributes.width,'40');
});
test('appending a draft at the last caption end extends a full screen and undo restores it',()=>{
 const store=new ProjectStore(newProject()),screenId=store.snapshot.screens[0].id;
 store.dispatch({type:'caption.put',screenId,caption:{id:'first',start:0,end:90,text:'First',draft:true}},0);
 store.dispatch({type:'caption.put',screenId,caption:{id:'next',start:90,end:91,text:'',draft:true}},1);
 assert.equal(store.snapshot.screens[0].duration,91);assert.equal(store.snapshot.screens[0].captions[1].text,'');
 store.dispatch({type:'history.undo'},2);assert.equal(store.snapshot.screens[0].duration,90);assert.equal(store.snapshot.screens[0].captions.length,1);
});
test('layer copy/paste and cut preserve placement, clips, nested IDs, references and shared history',()=>{
 const {store,screenId,objectId}=setup();const dispatch=(command:unknown)=>store.dispatch(command,store.snapshot.revision,'mcp');
 dispatch({type:'clip.put',screenId,clip:{id:'move',objectId,preset:'Slide',start:0,duration:20}});
 const before=store.snapshot,history=store.history;
 dispatch({type:'object.copy',screenId,objectIds:[objectId]});assert.deepEqual(store.snapshot,before);assert.deepEqual(store.history,history);
 dispatch({type:'object.paste',screenId});let screen=store.snapshot.screens[0],objects=svgObjects(screen.svg);const clone=objects.find(o=>o.type==='rect'&&o.id!==objectId)!;assert.ok(clone);assert.equal(clone.attributes.width,'40');assert.equal(screen.clips.length,2);assert.equal(screen.clips[1].objectId,clone.id);assert.notEqual(screen.clips[1].id,'move');assert.equal(objects.length,3);
 dispatch({type:'history.undo'});assert.equal(store.snapshot.screens[0].svg,before.screens[0].svg);
 dispatch({type:'object.cut',screenId,objectIds:[objectId]});assert.ok(!svgObjects(store.snapshot.screens[0].svg).some(o=>o.id===objectId));assert.equal(store.snapshot.screens[0].clips.length,0);
 dispatch({type:'object.paste',screenId});assert.equal(store.snapshot.screens[0].clips.length,1);
 dispatch({type:'history.undo'});dispatch({type:'history.undo'});assert.equal(store.snapshot.screens[0].svg,before.screens[0].svg);
});
test('group preserves children and clips; mixed parents and locked mutations fail atomically',()=>{
 const {store,screenId,objectId}=setup();const dispatch=(command:unknown)=>store.dispatch(command,store.snapshot.revision);const before=store.snapshot;
 dispatch({type:'object.group',screenId,objectIds:[objectId]});const object=svgObjects(store.snapshot.screens[0].svg).find(o=>o.id===objectId)!;assert.notEqual(object.parentId,svgObjects(before.screens[0].svg).find(o=>o.id===objectId)!.parentId);
 dispatch({type:'history.undo'});assert.equal(store.snapshot.screens[0].svg,before.screens[0].svg);
 dispatch({type:'object.edit',screenId,objectId,attributes:{'data-locked':'true'}});const locked=store.snapshot;
 assert.throws(()=>dispatch({type:'object.cut',screenId,objectIds:[objectId]}),/locked/);assert.deepEqual(store.snapshot,locked);assert.throws(()=>dispatch({type:'object.group',screenId,objectIds:[objectId]}),/locked/);
});
test('duplicated equations keep source with fresh equation, object and internal reference identities',()=>{
 const store=new ProjectStore(newProject()),screenId=store.snapshot.screens[0].id;const dispatch=(command:unknown)=>store.dispatch(command,store.snapshot.revision);
 dispatch({type:'equation.commit',screenId,equation:{id:'equation',source:'x',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10V10Z"/></svg>',terms:{}}});
 const object=svgObjects(store.snapshot.screens[0].svg).find(o=>o.equationId==='equation')!;
 dispatch({type:'object.duplicate',screenId,objectIds:[object.id]});const s=store.snapshot.screens[0];assert.equal(s.equations.length,2);assert.notEqual(s.equations[1].id,'equation');assert.equal(s.equations[1].source,'x');assert.ok(svgObjects(s.svg).some(o=>o.equationId===s.equations[1].id));assert.deepEqual(decodeProject(encodeProject(store.snapshot)),JSON.parse(JSON.stringify(store.snapshot)));
});
test('clipboard remaps referenced definitions and grouping rejects different parents without loss',()=>{
 const store=new ProjectStore(newProject()),screenId=store.snapshot.screens[0].id;const dispatch=(command:unknown)=>store.dispatch(command,store.snapshot.revision);
 dispatch({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><g><rect width="10" height="20" fill="url(#paint)"/></g><circle r="10"/></svg>'});
 const objects=svgObjects(store.snapshot.screens[0].svg),rect=objects.find(o=>o.type==='rect')!,circle=objects.find(o=>o.type==='circle')!;
 const before=store.snapshot;assert.throws(()=>dispatch({type:'object.group',screenId,objectIds:[rect.id,circle.id]}),/same parent/);assert.deepEqual(store.snapshot,before);
 dispatch({type:'object.copy',screenId,objectIds:[rect.id]});assert.equal(store.clipboardAvailable,true);dispatch({type:'object.paste',screenId});
 const copy=svgObjects(store.snapshot.screens[0].svg).find(o=>o.type==='rect'&&o.id!==rect.id)!;assert.notEqual(copy.attributes.fill,rect.attributes.fill);const ref=copy.attributes.fill.slice(5,-1);assert.ok(store.snapshot.screens[0].svg.includes(`id="${ref}"`));
});
