import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadProject} from '../src/core/persistence';
import {svgObjects,parseSvg} from '../src/core/svg';
import {createEvaluator} from '../src/core/motion';

test('bundled showcase has independent scenes, editable group/child motion and portable original media',async()=>{
 const project=await loadProject('examples/small-idea.pteron');
 assert.equal(project.name,'Small idea, big motion');assert.equal(project.fps,30);
 assert.deepEqual(project.screens.map(s=>s.name),['Spark','Build','Rhythm','Together','Story','Bloom']);
 assert.ok(project.screens.reduce((n,s)=>n+s.duration,0)<600);
 const narration=JSON.parse(await readFile('examples/media/narration.json','utf8')).scenes;
 assert.ok(project.timelineAudio,'One continuous audio track crosses scene boundaries');
 const identities=new Set<string>();
 for(const screen of project.screens){
  const objects=svgObjects(screen.svg);
  assert.equal(objects.filter(o=>o.name==='Background').length,1,'No inherited artwork hidden behind a new scene');
  assert.equal(objects.filter(o=>o.name==='Title').length,1);
  for(const object of objects){assert.ok(!identities.has(object.id));identities.add(object.id);}
  assert.ok(!parseSvg(screen.svg).elements.some(el=>el.localName==='text'),'Lettering uses editable paths supported by export');
  assert.ok(screen.clips.length>=5);assert.ok(screen.captions.length>=1);
  const speech=narration[project.screens.indexOf(screen)];
  assert.equal(screen.narration.script,speech.script);
  assert.equal(screen.captions.map(c=>c.text).join(' '),speech.script,'Captions transcribe every spoken word verbatim');
  assert.deepEqual(screen.captions.map(({text,start,end})=>({text,start,end})),speech.captions);
  let word=0;screen.captions.forEach((c,i)=>{assert.ok(c.start<c.end&&c.end<=screen.duration);if(i)assert.ok(screen.captions[i-1].end<=c.start,'Caption phrases never overlap');const count=c.text.split(' ').length;assert.equal(c.start,speech.words[word].start);assert.ok(Math.abs(c.end-speech.words[word+count-1].end)<=1,'Cue ends within one frame of its last spoken word');word+=count;});
  assert.ok(!objects.some(o=>o.name==='Signature'),'No wordmark in artwork');
  assert.ok(screen.narration.script);assert.ok(screen.narration.mediaId);
  const audio=project.media[screen.narration.mediaId!];assert.equal(audio.type,'audio/wav');
  assert.equal(Buffer.from(audio.data,'base64').subarray(0,4).toString(),'RIFF');
  assert.ok((screen.narration.duration??0)<=screen.duration);
  assert.equal(screen.duration,screen.narration.duration,'Connected narration has no inserted scene silence');
 }
 const together=project.screens[3],objects=svgObjects(together.svg);
 const flower=objects.find(o=>o.name==='Flower')!,petals=objects.find(o=>o.name==='Petals')!,center=objects.find(o=>o.name==='Flower center')!;
 assert.equal(petals.parentId,flower.id);assert.equal(center.parentId,flower.id);
 const sample=createEvaluator(together);const clip=together.clips.find(c=>c.objectId===center.id&&c.preset==='Pulse')!;assert.ok(sample(clip.start+Math.floor((clip.duration-1)/2))[center.id].scaleX>1);
});
