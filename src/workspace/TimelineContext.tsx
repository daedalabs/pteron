import type {Project,Screen} from '../core/model';
import {screenOffsets} from '../core/project-timeline';
import {Button} from '../components/ui/button';
import {Maximize2,Minimize2} from 'lucide-react';

export type TimelineItemKind='clip'|'caption';
export type TimelineSelection={
 name:string;
 timing?:{owner:string,start:number,end:number};
 onEdit?:()=>void;
};

export function TimelineContext({project,screen,frame,main,onMain,onScene,focused,onToggleFocus,selection}:{project:Project,screen:Screen,frame:number,main:boolean,onMain:()=>void,onScene:()=>void,focused:boolean,onToggleFocus:()=>void,selection?:TimelineSelection}){
 const entries=screenOffsets(project),entry=entries.find(value=>value.screen.id===screen.id)!;
 const total=entries.at(-1)!.end,absolute=entry.start+frame;
 return <div className="timeline-context" aria-label="Timeline location">
  <nav aria-label="Timeline scope"><button aria-label="Show Main timeline" aria-current={main?'page':undefined} onClick={onMain}>Main</button><span aria-hidden="true">/</span><button aria-label={`Edit current scene: ${screen.name}`} aria-current={!main?'page':undefined} onClick={onScene}>{screen.name}</button></nav>
  {selection&&<div className="timeline-selection" role="status" aria-label="Timeline selection">
   <strong title={selection.name}>{selection.name}</strong>
   {selection.timing&&<div className="timeline-selection-detail">
    <span title={selection.timing.owner}>{selection.timing.owner}</span>
    <span aria-label={`In frame ${selection.timing.start}, out frame ${selection.timing.end}, duration ${selection.timing.end-selection.timing.start} frames`}>
     {selection.timing.start}–{selection.timing.end}f · {selection.timing.end-selection.timing.start}f duration
    </span>
   </div>}
  </div>}
  <span className="timeline-location" aria-label={`Scene starts at ${entry.start} frames; video playhead ${absolute} of ${total} frames`} title={`Scene: ${entry.start}–${entry.end}f in video · ${(entry.start/project.fps).toFixed(2)}–${(entry.end/project.fps).toFixed(2)}s`}>
   <span>{main?'Scene starts':'Starts'} {entry.start}f</span><span>Video {absolute} / {total}f · {(absolute/project.fps).toFixed(2)}s</span>
  </span>
  {focused&&selection?.onEdit&&<Button className="timeline-edit-selected" variant="outline" onClick={selection.onEdit}>Edit selected</Button>}
  <Button className="icon-button timeline-focus-toggle" variant="ghost" aria-label="Timeline focus mode" aria-pressed={focused} title={focused?'Restore workspace':'Focus timeline'} onClick={onToggleFocus}>
   {focused?<Minimize2 aria-hidden="true"/>:<Maximize2 aria-hidden="true"/>}
  </Button>
 </div>;
}
