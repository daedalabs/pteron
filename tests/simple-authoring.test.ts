import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject,uuid} from '../src/core/model';
import {ProjectStore} from '../src/core/store';
import {encodeProject,decodeProject} from '../src/core/persistence';
import {svgObjects} from '../src/core/svg';
import {adjacentBoundary} from '../src/core/timeline-navigation';
import {ProjectService} from '../src/core/service';
import {atomicCopy} from '../src/core/persistence';
import {mkdtemp,readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('saved shape assets survive packages, insert with fresh IDs and share undo',()=>{
 const store=new ProjectStore(newProject('Assets',320,240));const screenId=store.snapshot.screens[0].id;
 const run=(command:unknown)=>store.dispatch(command,store.snapshot.revision);
 run({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="20" height="20" fill="#123456"/></g></svg>'});
 const objectIds=[svgObjects(store.snapshot.screens[0].svg)[0].id],assetId=uuid();
 run({type:'asset.capture',screenId,objectIds,assetId,name:'Tile'});
 assert.equal(store.snapshot.assets?.[0].name,'Tile');
 assert.deepEqual(decodeProject(encodeProject(store.snapshot)),store.snapshot);
 const before=store.snapshot.screens[0].svg;
 run({type:'asset.insert',screenId,assetId});
 const objects=svgObjects(store.snapshot.screens[0].svg);
 assert.equal(new Set(objects.map(object=>object.id)).size,objects.length);
 assert.equal(objects.filter(object=>object.type==='rect').length,2);
 run({type:'history.undo'});assert.equal(store.snapshot.screens[0].svg,before);
 run({type:'asset.delete',assetId});assert.equal(store.snapshot.assets?.length,0);
});

test('audio trimming retains the original source, reslices scenes, rejects overflow and undoes',()=>{
 const store=new ProjectStore(newProject());const screenId=store.snapshot.screens[0].id;
 const run=(command:unknown)=>store.dispatch(command,store.snapshot.revision);
 run({type:'timeline.audio.attach',mediaId:'audio',name:'voice.wav',mime:'audio/wav',data:'AA==',start:0,duration:150});
 run({type:'timeline.audio.trim',sourceStart:30,duration:90});
 assert.equal(store.snapshot.timelineAudio?.sourceDuration,150);
 assert.equal(store.snapshot.screens[0].narration.sourceStart,30);
 const before=store.snapshot;assert.throws(()=>run({type:'timeline.audio.trim',sourceStart:100,duration:90}),/original duration/);assert.deepEqual(store.snapshot,before);
 run({type:'project.settings',width:1080,height:1920,fps:60});
 assert.equal(store.snapshot.timelineAudio?.sourceStart,60);assert.equal(store.snapshot.timelineAudio?.sourceDuration,300);
 run({type:'history.undo'});run({type:'history.undo'});assert.equal(store.snapshot.timelineAudio?.duration,150);
 assert.equal(store.snapshot.screens[0].id,screenId);
});

test('timing navigation reaches exact boundaries without producing an invalid end frame',()=>{
 const screen=newProject().screens[0];screen.cues=[{id:'cue',frame:20,review:false}];
 screen.clips=[{id:'clip',objectId:'shape',preset:'Fade',start:30,duration:20,intensity:1,repetitions:1,direction:'up',easing:'smooth'}];
 assert.equal(adjacentBoundary(screen,20,1),30);assert.equal(adjacentBoundary(screen,50,-1),30);
 assert.equal(adjacentBoundary(screen,89,1),89);assert.equal(adjacentBoundary(screen,0,-1),0);
});

test('bulk presets and keyboard nudges reject locked targets without partial edits',()=>{
 const store=new ProjectStore(newProject()),screenId=store.snapshot.screens[0].id;
 const run=(command:unknown)=>store.dispatch(command,store.snapshot.revision);
 run({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/><rect x="40" width="20" height="20"/></svg>'});
 const ids=svgObjects(store.snapshot.screens[0].svg).map(object=>object.id);
 run({type:'motion.apply',screenId,objectIds:ids,start:0,settings:{preset:'Pulse',duration:20}});
 assert.equal(store.snapshot.screens[0].clips.length,2);
 run({type:'object.edit',screenId,objectId:ids[1],attributes:{'data-locked':'true'}});
 const before=store.snapshot;
 assert.throws(()=>run({type:'motion.apply',screenId,objectIds:ids,start:40,settings:{preset:'Pulse',duration:20}}),/locked/);
 assert.throws(()=>run({type:'object.nudge',screenId,objectIds:ids,x:10,y:0}),/locked/);
 assert.deepEqual(store.snapshot,before);
});

test('failed export copies preserve the destination and recovery inspection does not mutate history',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pteron-safe-export-')),destination=join(dir,'video.mp4');
 await writeFile(destination,'previous');await assert.rejects(atomicCopy(join(dir,'missing.mp4'),destination));
 assert.equal(await readFile(destination,'utf8'),'previous');assert.deepEqual(await readdir(dir),['video.mp4']);
 const source=join(dir,'rendered.mp4');await writeFile(source,'complete');await atomicCopy(source,destination);assert.equal(await readFile(destination,'utf8'),'complete');
 const service=new ProjectService(join(dir,'recovery.pteron'));
 service.recoveryHistory.autosaveIntervalMs=0;
 assert.deepEqual(await service.call('recovery.info'),{available:false});
 await service.call('command',{revision:0,command:{type:'project.rename',name:'Recovered shapes'}});
 const before=await service.call('state'),info=await service.call('recovery.info');
 assert.equal(info.name,'Recovered shapes');assert.equal(info.available,true);assert.deepEqual(await service.call('state'),before);

 const list=await service.call('recovery.list');
 assert.equal(list.versions.length>=1,true);
 assert.deepEqual(await service.call('state'),before);

 const olderId=list.versions[0].id;
 const readResult=await service.call('recovery.read',{id:olderId});
 assert.equal(readResult.name,'Recovered shapes');assert.ok(typeof readResult.svg==='string');
 assert.deepEqual(await service.call('state'),before);

 await service.call('command',{revision:1,command:{type:'project.rename',name:'Second name'}});
 assert.equal(service.store.snapshot.revision,2);

 const restored=await service.call('recover',{revision:2,id:olderId});
 assert.equal(restored.revision,3);
 assert.equal(service.store.snapshot.name,'Recovered shapes');

 await service.call('command',{revision:3,command:{type:'history.undo'}});
 assert.equal(service.store.snapshot.name,'Second name');

 const updatedList=await service.call('recovery.list');
 assert.ok(updatedList.versions.some((v:{name:string,reason:string})=>v.name==='Second name'&&v.reason==='replace'));
});

test('custom motion applies to a selection atomically and retains seconds across FPS changes',()=>{
 const store=new ProjectStore(newProject());const screenId=store.snapshot.screens[0].id;
 const run=(command:unknown)=>store.dispatch(command,store.snapshot.revision);
 run({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/><circle cx="50" cy="50" r="10"/></svg>'});
 const ids=svgObjects(store.snapshot.screens[0].svg).map(object=>object.id),clipId=uuid(),presetId=uuid();
 run({type:'clip.put',screenId,clip:{id:clipId,objectId:ids[0],preset:'Pulse',start:0,duration:30,intensity:.7}});
 run({type:'motionPreset.capture',screenId,clipId,presetId,name:'Soft pulse'});
 run({type:'project.settings',width:1080,height:1920,fps:60});
 run({type:'motionPreset.apply',screenId,presetId,objectIds:ids,start:120});
 const clips=store.snapshot.screens[0].clips.filter(clip=>clip.start===120);
 assert.equal(clips.length,2);assert.ok(clips.every(clip=>clip.duration===60&&clip.intensity===.7));
 const before=store.snapshot;
 assert.throws(()=>run({type:'motionPreset.apply',screenId,presetId,objectIds:ids,start:120}),/overlap/);
 assert.deepEqual(store.snapshot,before);
 run({type:'history.undo'});assert.equal(store.snapshot.screens[0].clips.length,1);
});
