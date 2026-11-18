import {test} from 'node:test';import assert from 'node:assert/strict';
import {narrationClock,syncNarration} from '../src/workspace/narration-playback';
import {newProject,newScreen,projectSchema} from '../src/core/model';
import {decodeProject,encodeProject} from '../src/core/persistence';
import {ProjectStore} from '../src/core/store';
import {captionLayout,captionPose,captionVectorKey} from '../src/core/caption-style';
function fixture(){let time=0,seeks=0;const audio={get currentTime(){return time;},set currentTime(value:number){time=value;seeks++;},paused:true,play:async()=>{audio.paused=false;},pause:()=>{audio.paused=true;}};return {audio,clock:narrationClock(),advance:(value:number)=>time=value,seeks:()=>seeks};}
test('normal playback scheduler jitter does not repeatedly seek buffered narration',()=>{
 const f=fixture();for(let frame=0;frame<120;frame++){f.advance(Math.max(0,frame/30-.08));syncNarration(f.audio,f.clock,{key:'voice',time:frame/30,playing:true,active:true,fps:30},frame*1000/30);}
 assert.equal(f.seeks(),0);assert.equal(f.audio.paused,false);
});
test('pause, scrubbing, resume and screen/source boundaries synchronize precisely',()=>{
 const f=fixture(),sync=(time:number,playing:boolean,key='a',active=true)=>syncNarration(f.audio,f.clock,{key,time,playing,active,fps:30},time*1000);
 sync(2,false);assert.equal(f.audio.currentTime,2);assert.equal(f.audio.paused,true);
 sync(3,true);assert.equal(f.audio.currentTime,3);assert.equal(f.audio.paused,false);
 sync(.5,true,'b');assert.equal(f.audio.currentTime,.5);
 sync(.7,true,'b',false);assert.equal(f.audio.paused,true);
 sync(1,true,'b');assert.equal(f.audio.currentTime,1);assert.equal(f.audio.paused,false);
});
test('large playback drift corrects with a cooldown rather than a seek every frame',()=>{
 const f=fixture();for(let frame=0;frame<90;frame++){f.advance(0);syncNarration(f.audio,f.clock,{key:'a',time:frame/30,playing:true,active:true,fps:30},frame*1000/30);}
 assert.ok(f.seeks()>=2&&f.seeks()<=3);
});
test('project narration settings round-trip and undo without changing any scene timing',()=>{
 const project=newProject();
 project.screens.push(newScreen(project.width,project.height,'Second scene'));
 const legacy=decodeProject(encodeProject(project));
 assert.equal(legacy.narrationMix,undefined);
 const store=new ProjectStore(legacy);
 const mix={volume:40,muted:true};
 assert.throws(()=>store.dispatch({type:'narration.mix',mix:{...mix,volume:101}},0));
 assert.equal(store.snapshot.revision,0);
 const edited=store.dispatch({type:'narration.mix',mix},0,'mcp');
 assert.deepEqual(decodeProject(encodeProject(edited)).narrationMix,mix);
 assert.deepEqual(edited.screens,legacy.screens);
 const undone=store.dispatch({type:'history.undo'},edited.revision);
 assert.equal(undone.narrationMix,undefined);
 assert.deepEqual(store.dispatch({type:'history.redo'},undone.revision).narrationMix,mix);
});
test('caption style is shared, undoable and sampled on the original cue clock',()=>{
 const store=new ProjectStore(newProject());
 const style={font:'Georgia',variant:'Italic',size:125,entrance:'Pop'} as const;
 const legacy={font:style.font,size:style.size,entrance:style.entrance};
 const legacyProject=projectSchema.parse({...store.snapshot,captionStyle:legacy});
 assert.equal(legacyProject.captionStyle?.variant,'Bold');
 assert.throws(()=>store.dispatch({type:'narration.settings',style:{...style,entrance:'Bounce'}},0));
 const edited=store.dispatch({type:'narration.settings',style},0,'mcp');
 assert.deepEqual(decodeProject(encodeProject(edited)).captionStyle,style);
 assert.equal(captionLayout(edited).glyphHeight,65);
 assert.notEqual(captionVectorKey(edited,['Caption']),captionVectorKey(legacyProject,['Caption']));
 const source={id:'cue',start:89,end:110,text:'A cue across two scenes',draft:false};
 const sources=new Map([[source.id,source]]);
 const first={...source,id:'first',sourceCaptionId:source.id,start:89,end:90};
 const second={...source,id:'second',sourceCaptionId:source.id,start:0,end:20};
 assert.ok(captionPose(edited,first,89,0,sources).scale<1);
 assert.equal(captionPose(edited,second,0,90,sources).scale,captionPose(edited,source,90,0,sources).scale);
 assert.ok(captionPose(edited,second,2,90,sources).scale>1);
 assert.equal(captionPose(edited,second,4,90,sources).scale,1);
 const short={...source,end:90};
 assert.equal(captionPose(edited,short,89,0,sources).scale,1);
 assert.equal(store.dispatch({type:'history.undo'},edited.revision).captionStyle,undefined);
 const regular=store.dispatch({type:'narration.settings',style:{font:'Arial',variant:'Regular',size:100,entrance:'None'}},store.snapshot.revision);
 assert.equal(regular.captionStyle?.variant,'Regular');
});
