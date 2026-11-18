import {type Project,type Screen,uuid} from './model';
import {screenOffsets} from './project-timeline';

export function snapCandidates(screen:Screen,playhead:number,excluded:string[]=[]){
 const values=new Set([0,screen.duration,playhead,...screen.cues.map(cue=>cue.frame),...screen.captions.flatMap(cue=>[cue.start,cue.end])]);
 for(const clip of screen.clips)if(!excluded.includes(clip.id)){values.add(clip.start);values.add(clip.start+clip.duration);}
 for(const ranges of Object.values(screen.lifetimes))for(const range of ranges){values.add(range.start);values.add(range.end);}
 return [...values].sort((a,b)=>a-b);
}
export function snapFrame(value:number,candidates:number[],tolerance:number){
 let best=Math.round(value),distance=tolerance;
 for(const candidate of candidates){const next=Math.abs(candidate-value);if(next<=distance){best=candidate;distance=next;}}
 return best;
}
export function snapClipDelta(start:number,duration:number,delta:number,candidates:number[],tolerance:number,resize=false){
 let result=delta,distance=Infinity,frame:number|undefined;
 for(const edge of resize?[start+duration]:[start,start+duration]){
  const value=snapFrame(edge+delta,candidates,tolerance),offset=value-edge;
  if(candidates.includes(value)&&Math.abs(offset-delta)<distance){result=offset;distance=Math.abs(offset-delta);frame=value;}
 }
 return {delta:result,frame};
}
export type ClipReference={screenId:string,clipId:string};
export function editClips(project:Project,items:ClipReference[],action:'move'|'trim'|'duplicate'|'stagger'|'delete',frames:number){
 const keys=new Set<string>(),offsets=screenOffsets(project);
 const selected=items.map(item=>{
  const key=`${item.screenId}:${item.clipId}`;if(keys.has(key))throw new Error('Select each clip once');keys.add(key);
  const entry=offsets.find(entry=>entry.screen.id===item.screenId),clip=entry?.screen.clips.find(clip=>clip.id===item.clipId);
  if(!entry||!clip)throw new Error('Selected clip no longer exists');return {...entry,clip};
 }).sort((a,b)=>a.start+a.clip.start-b.start-b.clip.start);
 const first=selected[0].start+selected[0].clip.start;
 if(action==='stagger'&&frames<0)throw new Error('Stagger spacing must be nonnegative');
 for(const [i,{screen,clip,start}] of selected.entries()){
  if(action==='delete'){screen.clips=screen.clips.filter(value=>value.id!==clip.id);continue;}
  const next={...clip};
  if(action==='trim')next.duration+=frames;
  else next.start=action==='stagger'?first+i*frames-start:clip.start+frames;
  if(next.start<0||next.duration<1)throw new Error('The selection would start before its scene or have an empty clip');
  if(action==='duplicate'){next.id=uuid();screen.clips.push(next);}else Object.assign(clip,next);
  screen.duration=Math.max(screen.duration,next.start+next.duration);
 }
 return new Set(selected.map(item=>item.screen.id));
}
