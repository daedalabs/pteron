import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProjectStore} from '../src/core/store';
import {newProject} from '../src/core/model';
import {svgObjects} from '../src/core/svg';
import {encodeProject,decodeProject} from '../src/core/persistence';
import {ProjectService} from '../src/core/service';

test('format settings retain identities, retime seconds, roundtrip and undo atomically',()=>{
 const store=new ProjectStore(newProject('Format',320,480)),screenId=store.snapshot.screens[0].id;
 const dispatch=(command:unknown)=>store.dispatch(command,store.snapshot.revision,'mcp');
 dispatch({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect x="20" y="30" width="50" height="60" fill="none" stroke="#ff0000" stroke-width="4"/></svg>'});
 const objectId=svgObjects(store.snapshot.screens[0].svg)[0].id;
 dispatch({type:'clip.put',screenId,clip:{id:'motion',objectId,preset:'Slide',start:15,duration:30}});
 dispatch({type:'caption.put',screenId,caption:{id:'caption',start:15,end:45,text:'One second',draft:false}});
 dispatch({type:'cue.put',screenId,cue:{id:'cue',frame:30,review:false}});
 dispatch({type:'object.edit',screenId,objectId,attributes:{'stroke-opacity':'0.25'}});
 dispatch({type:'object.copy',screenId,objectIds:[objectId]});
 const before=store.snapshot,history=store.history.undo;
 dispatch({type:'project.settings',width:640,height:360,fps:60});
 let p=store.snapshot,s=p.screens[0];
 assert.equal(p.fps,60);assert.equal(s.duration,180);assert.deepEqual([s.clips[0].start,s.clips[0].duration],[30,60]);
 assert.deepEqual([s.captions[0].start,s.captions[0].end],[30,90]);assert.equal(s.cues[0].frame,60);assert.equal(s.cues[0].review,true);
 assert.deepEqual(svgObjects(s.svg),svgObjects(before.screens[0].svg));assert.match(s.svg,/viewBox="0 0 640 360"/);
 assert.deepEqual(decodeProject(encodeProject(p)),p);assert.equal(store.history.undo,history+1);
 dispatch({type:'history.undo'});assert.deepEqual(store.snapshot.screens,before.screens);assert.equal(store.snapshot.fps,30);
 dispatch({type:'history.redo'});assert.equal(store.snapshot.fps,60);
 dispatch({type:'object.paste',screenId});s=store.snapshot.screens[0];assert.equal(s.clips[1].duration,60,'clipboard timing uses its source FPS');
 dispatch({type:'screen.add',name:'Next'});assert.equal(store.snapshot.screens[1].duration,180);
 p=store.snapshot;
 for(const format of [{width:0,height:360,fps:60},{width:640,height:360,fps:0},{width:640,height:360,fps:29.97},{width:640,height:360,fps:121}])assert.throws(()=>dispatch({type:'project.settings',...format}));
 assert.deepEqual(store.snapshot,p);
 assert.throws(()=>dispatch({type:'object.edit',screenId,objectId,attributes:{'stroke-opacity':'1.1'}}),/Alpha/);assert.deepEqual(store.snapshot,p);
});

test('retimed SRT uses project FPS with cumulative screen offsets',()=>{
 const service=new ProjectService('unused'),store=service.store,screenId=store.snapshot.screens[0].id;
 store.dispatch({type:'caption.put',screenId,caption:{id:'caption',start:15,end:45,text:'Hello',draft:false}},0);
 store.dispatch({type:'screen.duplicate',screenId},1);const before=service.srt();
 store.dispatch({type:'project.settings',width:1920,height:1080,fps:24},2);
 assert.equal(service.srt(),before);assert.match(service.srt(),/00:00:02,000 --> 00:00:03,000/);
});

test('unrepresentable retiming and nonstandard canvas resize preserve editable work',()=>{
 const store=new ProjectStore(newProject('Tiny',320,480)),screenId=store.snapshot.screens[0].id;
 const dispatch=(command:unknown)=>store.dispatch(command,store.snapshot.revision);
 dispatch({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>'});
 const objectId=svgObjects(store.snapshot.screens[0].svg)[0].id;
 for(let start=0;start<2;start++)dispatch({type:'clip.put',screenId,clip:{id:'clip'+start,objectId,preset:'Pulse',start,duration:1}});
 const before=store.snapshot;assert.throws(()=>dispatch({type:'project.settings',width:320,height:480,fps:1}),/overlap/);assert.deepEqual(store.snapshot,before);
 dispatch({type:'artwork.commit',screenId,svg:before.screens[0].svg.replace('viewBox="0 0 320 480"','viewBox="0 0 160 240"')});
 const custom=store.snapshot;assert.throws(()=>dispatch({type:'project.settings',width:640,height:480,fps:30}),/nonstandard/);assert.deepEqual(store.snapshot,custom);
});
