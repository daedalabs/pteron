import {useEffect,useState} from 'react';
import type {Project} from '../core/model';
import {Button} from '../components/ui/button';

type Format=Pick<Project,'width'|'height'|'fps'>;
export function ProjectFormatSettings({project,onApply}:{project:Project,onApply:(format:Format)=>Promise<boolean>}){
 const [width,setWidth]=useState(String(project.width)),[height,setHeight]=useState(String(project.height)),[fps,setFps]=useState(String(project.fps)),[busy,setBusy]=useState(false);
 useEffect(()=>{setWidth(String(project.width));setHeight(String(project.height));setFps(String(project.fps));},[project.width,project.height,project.fps]);
 const changed=Number(width)!==project.width||Number(height)!==project.height||Number(fps)!==project.fps;
 return <form className="project-format" onSubmit={async event=>{event.preventDefault();setBusy(true);try{await onApply({width:Number(width),height:Number(height),fps:Number(fps)});}finally{setBusy(false);}}}>
  <div className="field-grid"><label>Width<input aria-label="Project width" type="number" min={16} max={8192} step={1} required value={width} onChange={event=>setWidth(event.target.value)}/></label><label>Height<input aria-label="Project height" type="number" min={16} max={8192} step={1} required value={height} onChange={event=>setHeight(event.target.value)}/></label></div>
  <div className="project-format-actions">
   <label>Frame rate (fps)<input aria-label="Project frame rate" type="number" min={1} max={120} step={1} required value={fps} onChange={event=>setFps(event.target.value)}/></label>
   <Button type="submit" reserveLabel="Applying…" disabled={busy||!changed}>{busy?'Applying…':'Apply'}</Button>
  </div>
 </form>;
}
