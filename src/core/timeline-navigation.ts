import type {Screen} from './model';

export function timingBoundaries(screen:Screen){
 return [...new Set([0,screen.duration-1,...screen.cues.map(cue=>cue.frame),...screen.clips.flatMap(clip=>[clip.start,clip.start+clip.duration]),...Object.values(screen.lifetimes).flatMap(ranges=>ranges.flatMap(range=>[range.start,range.end])),...screen.captions.flatMap(caption=>[caption.start,caption.end])])].filter(value=>value>=0&&value<screen.duration).sort((a,b)=>a-b);
}
export function adjacentBoundary(screen:Screen,frame:number,direction:-1|1){
 const values=timingBoundaries(screen);
 return direction===-1?values.findLast(value=>value<frame)??0:values.find(value=>value>frame)??screen.duration-1;
}
