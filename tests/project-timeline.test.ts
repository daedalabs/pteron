import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {newProject} from '../src/core/model';
import {ProjectStore} from '../src/core/store';
import {ProjectService} from '../src/core/service';
import {svgObjects} from '../src/core/svg';
import {parseSrt,screenOffsets} from '../src/core/project-timeline';
import {encodeProject,decodeProject} from '../src/core/persistence';

test('automatic screen length grows and shrinks with independent layer endpoints',()=>{
 const store=new ProjectStore(newProject());const screenId=store.snapshot.screens[0].id;
 const dispatch=(command:any)=>store.dispatch({screenId,...command},store.snapshot.revision);
 dispatch({type:'artwork.import',svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="10" height="10"/><rect x="20" width="10" height="10"/></svg>'});
 const [a,b]=svgObjects(store.snapshot.screens[0].svg);
 dispatch({type:'layer.span.put',objectId:a.id,span:{id:'a',start:0,end:120}});dispatch({type:'layer.span.put',objectId:b.id,span:{id:'b',start:0,end:60}});
 assert.equal(store.snapshot.screens[0].duration,120);
 dispatch({type:'layer.span.put',objectId:a.id,span:{id:'a',start:0,end:30}});assert.equal(store.snapshot.screens[0].duration,60);
 dispatch({type:'history.undo'});assert.equal(store.snapshot.screens[0].duration,120);
 dispatch({type:'history.redo'});assert.equal(store.snapshot.screens[0].duration,60);
 dispatch({type:'object.group',objectIds:[a.id,b.id]});assert.equal(store.snapshot.screens[0].duration,60,'An untimed container must not add a hold');
});

test('SRT is imported on the overall clock, projected at boundaries and exported once',async context=>{
 const directory=await mkdtemp(join(tmpdir(),'pteron-timeline-'));
 const service=new ProjectService(join(directory,'recovery.pteron'));
 context.after(async()=>{
  await service.flush().catch(()=>{});
  await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 });
 let p=service.store.snapshot;const first=p.screens[0].id;
 await service.call('command',{revision:p.revision,command:{type:'screen.add',afterScreenId:first,name:'Second'}});
 p=service.store.snapshot;const source='1\n00:00:02,667 --> 00:00:03,667\nAcross\nthe cut\n';
 await service.call('srt.import',{source,revision:p.revision});p=service.store.snapshot;
 assert.equal(p.timelineCaptions?.length,1);assert.deepEqual(p.screens.map(screen=>screen.captions.map(caption=>[caption.start,caption.end])),[[[80,90]],[[0,20]]]);
 assert.equal(p.screens[0].captions[0].sourceCaptionId,p.screens[1].captions[0].sourceCaptionId);
 assert.equal(service.srt().match(/-->/g)?.length,1);assert.match(service.srt(),/00:00:02,667 --> 00:00:03,667/);
 const local=p.screens[1].captions[0];await service.call('command',{revision:p.revision,command:{type:'caption.put',screenId:p.screens[1].id,caption:{...local,text:'Edited'}}});p=service.store.snapshot;
 assert.equal(p.timelineCaptions![0].text,'Edited');assert.deepEqual([p.timelineCaptions![0].start,p.timelineCaptions![0].end],[80,110]);
 assert.deepEqual(p.screens.map(screen=>screen.captions[0].text),['Edited','Edited']);
 const before=service.store.snapshot;await assert.rejects(service.call('srt.import',{source:'broken',revision:before.revision}),/Invalid SRT/);assert.deepEqual(service.store.snapshot,before);
 assert.throws(()=>parseSrt('1\n00:00:00,033 --> 00:00:00,034\nToo short',30),/output frame/);
});

test('one audio source is sliced again when a screen boundary moves; undo and FPS keep offsets',()=>{
 const store=new ProjectStore(newProject()),first=store.snapshot.screens[0].id;
 const dispatch=(command:any)=>store.dispatch(command,store.snapshot.revision);
 dispatch({type:'artwork.import',screenId:first,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="10" height="10"/></svg>'});
 const object=svgObjects(store.snapshot.screens[0].svg)[0];dispatch({type:'screen.add',afterScreenId:first,name:'Second'});
 dispatch({type:'timeline.audio.attach',mediaId:'sound',name:'audio.wav',mime:'audio/wav',data:'AAAA',start:15,duration:150});
 let p=store.snapshot;assert.deepEqual(p.screens.map(screen=>[screen.narration.offset,screen.narration.sourceStart,screen.narration.duration]),[[15,0,75],[0,75,75]]);
 dispatch({type:'layer.span.put',screenId:first,objectId:object.id,span:{id:'short',start:0,end:60}});
 p=store.snapshot;assert.deepEqual(screenOffsets(p).map(entry=>[entry.start,entry.end]),[[0,60],[60,165]]);
 assert.deepEqual(p.screens.map(screen=>[screen.narration.sourceStart,screen.narration.duration]),[[0,45],[45,105]]);
 assert.equal(Object.keys(p.media).length,1);
 assert.deepEqual(decodeProject(encodeProject(p)),p,'Overall sources and their screen slices survive save/reopen');
 dispatch({type:'history.undo'});assert.equal(store.snapshot.screens[1].narration.sourceStart,75);
 dispatch({type:'history.redo'});dispatch({type:'project.settings',width:1080,height:1920,fps:60});
 p=store.snapshot;assert.deepEqual(p.timelineAudio,{mediaId:'sound',start:30,duration:300});assert.equal(p.screens[1].narration.sourceStart,90);
});

test('an existing local caption can move onto the overall clock without duplication or losing undo',()=>{
 const store=new ProjectStore(newProject()),screenId=store.snapshot.screens[0].id;
 const dispatch=(command:any)=>store.dispatch(command,store.snapshot.revision);
 dispatch({type:'caption.put',screenId,caption:{id:'old',start:0,end:30,text:'Old cue',draft:false}});
 dispatch({type:'screen.add',afterScreenId:screenId,name:'Next'});const before=store.snapshot;
 dispatch({type:'timeline.caption.promote',screenId,captionId:'old',caption:{id:'old',start:20,end:50,text:'Moved cue',draft:false}});
 const p=store.snapshot;assert.equal(p.screens[0].duration,30);assert.equal(p.timelineCaptions?.length,1);
 assert.deepEqual(p.screens.map(screen=>screen.captions.map(caption=>[caption.start,caption.end,caption.sourceCaptionId])),[[[20,30,'old']],[[0,20,'old']]]);
 dispatch({type:'history.undo'});assert.deepEqual(store.snapshot.screens,before.screens);assert.equal(store.snapshot.timelineCaptions,undefined);
});
