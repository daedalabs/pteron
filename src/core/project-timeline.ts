import {uuid,type Project,type Screen} from './model';
import {contentDuration} from './screen-duration';

export function screenOffsets(project:Project){let offset=0;return project.screens.map(screen=>{const start=offset;offset+=screen.duration;return {screen,start,end:offset};});}
export function timelineCaptions(project:Project){return [...(project.timelineCaptions??[]),...screenOffsets(project).flatMap(({screen,start})=>screen.captions.filter(caption=>!caption.sourceCaptionId).map(caption=>({...caption,start:caption.start+start,end:caption.end+start})))].sort((a,b)=>a.start-b.start||a.end-b.end);}

/** Compile overall media into local views without splitting or duplicating source audio. */
export function syncProjectTimeline(project:Project){
 if(!project.timelineAudio&&project.timelineCaptions===undefined)return;
 for(const screen of project.screens)screen.duration=contentDuration(screen);
 const total=project.screens.reduce((sum,screen)=>sum+screen.duration,0);
 const end=Math.max(total,project.timelineAudio?project.timelineAudio.start+project.timelineAudio.duration:0,...(project.timelineCaptions??[]).map(caption=>caption.end));
 project.screens.at(-1)!.duration+=end-total;
 for(const {screen,start,end} of screenOffsets(project)){
  const previous=screen.captions.filter(caption=>caption.sourceCaptionId);
  screen.captions=screen.captions.filter(caption=>!caption.sourceCaptionId);
  for(const caption of project.timelineCaptions??[]){
   const left=Math.max(caption.start,start),right=Math.min(caption.end,end);if(right<=left)continue;
   const old=previous.find(value=>value.sourceCaptionId===caption.id);
   screen.captions.push({...caption,id:old?.id??uuid(),sourceCaptionId:caption.id,start:left-start,end:right-start,...(old?.text===caption.text&&old.vector?{vector:old.vector,vectorText:old.vectorText??old.text}:{})});
  }
  if(screen.narration.timeline)screen.narration={script:screen.narration.script};
  const audio=project.timelineAudio;if(!audio)continue;
  const left=Math.max(audio.start,start),right=Math.min(audio.start+audio.duration,end);
  if(right>left)screen.narration={script:screen.narration.script,mediaId:audio.mediaId,duration:right-left,offset:left-start,sourceStart:(audio.sourceStart??0)+left-audio.start,timeline:true};
 }
}

export function parseSrt(source:string,fps:number):Screen['captions']{
 const text=source.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();if(!text)throw new Error('The SRT file is empty');
 const stamp=(h:string,m:string,s:string,ms:string)=>{if(Number(m)>59||Number(s)>59)throw new Error('Invalid SRT timestamp');return Math.round(((Number(h)*3600+Number(m)*60+Number(s))*1000+Number(ms))*fps/1000);};
 return text.split(/\n[ \t]*\n/).map((block,index)=>{
  const lines=block.split('\n');if(/^\d+$/.test(lines[0].trim()))lines.shift();
  const match=lines.shift()?.match(/^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})\s*$/);
  if(!match||!lines.length)throw new Error(`Invalid SRT cue ${index+1}`);
  const start=stamp(...match.slice(1,5) as [string,string,string,string]),end=stamp(...match.slice(5,9) as [string,string,string,string]);
  if(end<=start)throw new Error(`SRT cue ${index+1} is shorter than one output frame`);
  return {id:uuid(),start,end,text:lines.join('\n'),draft:false};
 });
}
