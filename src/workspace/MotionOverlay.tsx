import {useEffect,useState} from 'react';
import type {Clip} from '../core/model';
type Point={x:number,y:number};
type Geometry={bounds:{x:number,y:number,width:number,height:number},parentMatrix:number[],parentCenter:Point};

export function MotionOverlay({screenId,revision,clip,width,height,zoom,onChange,onError}:{screenId:string,revision:number,clip:Clip,width:number,height:number,zoom:number,onChange:(patch:Partial<Clip>)=>unknown,onError:(message:string)=>void}){
 const [geometry,setGeometry]=useState<Geometry>(),[draft,setDraft]=useState<Partial<Clip>>({});
 useEffect(()=>{let current=true;setGeometry(undefined);setDraft({});void window.pteron.call('motion.geometry',{screenId,objectId:clip.objectId}).then(value=>{if(current)setGeometry(value);}).catch(error=>{if(current)onError(String(error));});return()=>{current=false;};},[screenId,revision,clip.id,clip.objectId]);
 if(!geometry)return null;
 const value={...clip,...draft},m=geometry.parentMatrix,center={x:m[0]*geometry.parentCenter.x+m[2]*geometry.parentCenter.y+m[4],y:m[1]*geometry.parentCenter.x+m[3]*geometry.parentCenter.y+m[5]};
 const world=(point:Point,offset=true)=>({x:(offset?center.x:m[4])+m[0]*point.x+m[2]*point.y,y:(offset?center.y:m[5])+m[1]*point.x+m[3]*point.y});
 const local=(point:Point,offset=true)=>{const x=point.x-(offset?center.x:m[4]),y=point.y-(offset?center.y:m[5]),det=m[0]*m[3]-m[1]*m[2];return {x:Math.round((m[3]*x-m[2]*y)/det*1000)/1000,y:Math.round((-m[1]*x+m[0]*y)/det*1000)/1000};};
 const from=world(value.from??{x:0,y:0}),to=world(value.to??{x:120,y:0}),control=value.control?world(value.control):{x:(from.x+to.x)/2,y:(from.y+to.y)/2},pivot=world(value.pivot??geometry.parentCenter,false);
 const drag=(key:'from'|'to'|'control'|'pivot')=>(event:React.PointerEvent<SVGCircleElement>)=>{
  if(event.button!==0)return;event.preventDefault();event.stopPropagation();const target=event.currentTarget,svg=target.ownerSVGElement!;target.setPointerCapture(event.pointerId);let patch:Partial<Clip>|undefined;
  const update=(event:PointerEvent)=>{const box=svg.getBoundingClientRect(),point={x:(event.clientX-box.left)/box.width*width,y:(event.clientY-box.top)/box.height*height};patch={[key]:local(point,key!=='pivot')};setDraft(patch);};
  const clean=()=>{target.removeEventListener('pointermove',update);target.removeEventListener('pointerup',finish);target.removeEventListener('pointercancel',cancel);};
  const finish=()=>{clean();if(patch)onChange(patch);setDraft({});};const cancel=()=>{clean();setDraft({});};target.addEventListener('pointermove',update);target.addEventListener('pointerup',finish);target.addEventListener('pointercancel',cancel);
 };
 const handle=(key:'from'|'to'|'control'|'pivot',point:Point,label:string)=><circle key={key} className={`motion-handle motion-${key}`} cx={point.x} cy={point.y} r={7/zoom} role="slider" tabIndex={0} aria-label={label} aria-valuetext={`${point.x.toFixed(1)}, ${point.y.toFixed(1)} project pixels`} onPointerDown={drag(key)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const pointLocal=key==='pivot'?(clip.pivot??geometry.parentCenter):key==='control'?(clip.control??local(control)):clip[key]??{x:0,y:0};onChange({[key]:{x:pointLocal.x+(event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0),y:pointLocal.y+(event.key==='ArrowUp'?-1:event.key==='ArrowDown'?1:0)}});}}/>;
 return <svg className="motion-overlay" aria-label="Visual motion controls" viewBox={`0 0 ${width} ${height}`}>
  {value.from&&value.to&&<><path className="motion-path" d={`M${from.x} ${from.y} Q${control.x} ${control.y} ${to.x} ${to.y}`} vectorEffect="non-scaling-stroke"/><path className="motion-guide" d={`M${from.x} ${from.y} L${control.x} ${control.y} L${to.x} ${to.y}`} vectorEffect="non-scaling-stroke"/>{handle('from',from,'Motion start position')}{handle('to',to,'Motion end position')}{handle('control',control,'Motion curve control')}</>}
  {handle('pivot',pivot,'Rotation pivot')}
 </svg>;
}
