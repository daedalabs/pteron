import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectStore} from '../src/core/store';
import {ProjectService} from '../src/core/service';
import {newProject,clipSchema} from '../src/core/model';
import {svgObjects} from '../src/core/svg';
import {textOutlines} from '../electron/text-outlines';
import {motionDefaults} from '../src/core/motion-defaults';

test('text conversion retains identity, animation, source and undo; unsupported labels preserve all work',()=>{
 const store=new ProjectStore(newProject());const screenId=store.snapshot.screens[0].id;
 store.dispatch({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg"><text data-name="Label" x="10" y="60" font-family="Arial" font-size="40">AV office</text><text x="10" y="100" font-family="Missing font">Other</text></svg>'},0);
 const objects=svgObjects(store.snapshot.screens[0].svg),id=objects[0].id,other=objects[1].id;
 store.dispatch({type:'clip.put',screenId,clip:clipSchema.parse({id:'pulse',objectId:id,preset:'Pulse',start:0,duration:20})},store.snapshot.revision);
 const before=store.snapshot;
 assert.throws(()=>textOutlines(before.screens[0].svg,[id,other]),/Unsupported outline font/);assert.deepEqual(store.snapshot,before);
 store.dispatch({type:'object.outline',screenId,objectIds:[id]},store.snapshot.revision,'manual',{},undefined,textOutlines(before.screens[0].svg,[id]));
 const outlined=svgObjects(store.snapshot.screens[0].svg).find(object=>object.id===id)!;assert.equal(outlined.type,'path');assert.equal(outlined.attributes['data-text-source'],'AV office');assert.deepEqual(store.snapshot.screens[0].clips,before.screens[0].clips);
 store.dispatch({type:'history.undo'},store.snapshot.revision);assert.equal(store.snapshot.screens[0].svg,before.screens[0].svg);
});

test('continuity preview is read-only and stale preview application rejects',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pteron-continuity-preview-')),path=join(directory,'recovery.pteron'),service=new ProjectService(path);
 const command=(command:unknown)=>service.call('command',{command,revision:service.store.snapshot.revision});
 const sourceId=service.store.snapshot.screens[0].id;
 await command({type:'artwork.import',screenId:sourceId,svg:'<svg xmlns="http://www.w3.org/2000/svg"><rect x="10" width="20" height="20"/></svg>'});
 await command({type:'screen.add',name:'Next'});const screenId=service.store.snapshot.screens[1].id,id=svgObjects(service.store.snapshot.screens[1].svg)[0].id;
 await command({type:'object.unlink',screenId,objectIds:[id]});await command({type:'object.edit',screenId,objectId:id,attributes:{x:'70'}});
 const before=await service.call('state'),bytes=await readFile(path),link={type:'object.link',screenId,sourceScreenId:sourceId,objectIds:[id]};
 const preview=await service.call('command.preview',{revision:before.project.revision,command:link});
 assert.equal(svgObjects(preview.project.screens[1].svg)[0].attributes.x,'10');assert.deepEqual(await service.call('state'),before);assert.deepEqual(await readFile(path),bytes);
 await command({type:'project.rename',name:'Later edit'});
 await assert.rejects(service.call('command',{revision:preview.baseRevision,command:link}),/Stale revision/);
});

test('new motion defaults adapt to size and short scenes without altering existing evaluator inputs',()=>{
 const screen=newProject().screens[0];
 const small=motionDefaults('Bounce',{x:0,y:0,width:16,height:16},screen,30),large=motionDefaults('Bounce',{x:0,y:0,width:600,height:600},screen,30);
 assert.ok(small.intensity<large.intensity);assert.ok(small.duration<large.duration);
 const short={...screen,duration:5,durationBase:5};assert.equal(motionDefaults('Pulse',{x:0,y:0,width:50,height:50},short,30).duration,5);
 assert.ok(motionDefaults('Pulse',{x:0,y:0,width:600,height:600},screen,30).intensity<1);
});
