import type {Project} from '../core/model';
import {Button} from '../components/ui/button';
import {Icon} from './Icon';

export function AudioTrim({project,command}:{project:Project,command:(command:unknown)=>Promise<unknown>}){
 const audio=project.timelineAudio;if(!audio)return null;
 return <form className="audio-trim" key={`${audio.mediaId}:${audio.sourceStart}:${audio.duration}:${project.fps}`} onSubmit={async event=>{event.preventDefault();const fields=new FormData(event.currentTarget);await command({type:'timeline.audio.trim',sourceStart:Math.round(Number(fields.get('source'))*project.fps),duration:Math.round(Number(fields.get('duration'))*project.fps)});}}>
  <div className="field-grid"><label>In (s)<input name="source" aria-label="Audio source in seconds" type="number" min={0} step={1/project.fps} defaultValue={Number(((audio.sourceStart??0)/project.fps).toFixed(6))}/></label><label>Duration (s)<input name="duration" aria-label="Audio duration seconds" type="number" min={1/project.fps} step={1/project.fps} defaultValue={Number((audio.duration/project.fps).toFixed(6))}/></label></div>
  <Button type="submit" className="icon-button" variant="ghost" aria-label="Trim narration" title="Trim narration"><Icon name="trim"/></Button>
 </form>;
}
