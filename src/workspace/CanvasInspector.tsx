import type {Project,Screen} from '../core/model';
import {canvasBackground} from '../core/svg';
import {ProjectFormatSettings} from './ProjectFormatSettings';

export function CanvasInspector({project,screen,command}:{project:Project,screen:Screen,command:(command:unknown)=>Promise<unknown>}){
 const color=canvasBackground(screen.svg);
 const change=(value:string)=>{if(/^#[0-9a-f]{6}$/i.test(value)&&value.toLowerCase()!==color.toLowerCase())void command({type:'canvas.background',screenId:screen.id,color:value});};
 return <section className="inspector canvas-inspector" aria-label="Canvas properties">
  <h3>Canvas</h3>
  <div className="canvas-background" role="group" aria-label="Background color"><span className="canvas-background-label">Background color</span><div className="canvas-background-fields">
   <input aria-label="Canvas background color" type="color" value={color} onChange={event=>change(event.target.value)}/>
   <input aria-label="Canvas background hex" key={screen.id+color} defaultValue={color} maxLength={7} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}} onBlur={event=>{const value=event.currentTarget.value;if(/^#[0-9a-f]{6}$/i.test(value))change(value);else event.currentTarget.value=color;}}/>
  </div></div>
  <ProjectFormatSettings project={project} onApply={async format=>Boolean(await command({type:'project.settings',...format}))}/>
 </section>;
}
