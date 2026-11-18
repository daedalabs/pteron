import {adjacentBoundary} from '../core/timeline-navigation';
import {Icon} from './Icon';
import {MarkerControls} from './MarkerControls';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {type Clip,type Screen} from '../core/model';
import {snapCandidates,snapFrame,snapClipDelta} from '../core/timeline-editing';
import {Button} from '../components/ui/button';

export type BatchAction='move'|'trim'|'duplicate'|'stagger'|'delete';
export type TimelineMarker={id:string,frame:number,label:string};
export type EditingProps={loopSelection?:boolean,onLoopSelection?:(range:{start:number,end:number}|null)=>void,onBatch?:(ids:string[],action:BatchAction,frames:number)=>unknown,onMarkerPut?:(marker:TimelineMarker)=>unknown,onMarkerDelete?:(id:string)=>unknown};
export function useTimelineEditing({screen,frame,selectedClip,scroller,onClip,onChange,onSeek,onBatch}:{screen:Screen,frame:number,selectedClip:string,scroller:RefObject<HTMLDivElement|null>,onClip:(clip:Clip)=>void,onChange:(clip:Clip)=>unknown,onSeek:(frame:number)=>void,onBatch?:EditingProps['onBatch']}){
 const [selection,setSelection]=useState<string[]>([]),[snapping,setSnapping]=useState(true),[guide,setGuide]=useState<number>();
 useEffect(()=>{setSelection(current=>current.filter(id=>screen.clips.some(clip=>clip.id===id)));},[screen.clips]);
 useEffect(()=>{if(selectedClip)setSelection(current=>current.includes(selectedClip)?current:[selectedClip]);},[selectedClip]);
 const candidates=snapCandidates(screen,frame,selection);
 const snap=(value:number,excluded:number[]=[])=>{if(!snapping)return Math.round(value);const width=scroller.current?.querySelector('.ruler-time')?.getBoundingClientRect().width??640;return snapFrame(value,candidates.filter(candidate=>!excluded.includes(candidate)),8/width*screen.duration);};
 const at=(x:number,el:HTMLElement)=>{const box=el.getBoundingClientRect();return Math.max(0,Math.min(screen.duration-1,Math.round((x-box.left)/box.width*screen.duration)));};
 const scrub=(event:React.PointerEvent<HTMLDivElement>)=>{
  if(event.button!==0||(event.target as Element).closest('.clip,.layer-range,.timeline-marker'))return;event.preventDefault();const target=event.currentTarget;target.setPointerCapture(event.pointerId);
  const seek=(x:number,alt:boolean)=>onSeek(Math.min(screen.duration-1,alt?at(x,target):snap(at(x,target))));seek(event.clientX,event.altKey);
  const move=(event:PointerEvent)=>seek(event.clientX,event.altKey),finish=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',finish);target.removeEventListener('pointercancel',finish);};
  target.addEventListener('pointermove',move);target.addEventListener('pointerup',finish);target.addEventListener('pointercancel',finish);
 };
 const dragClip=(clip:Clip)=>(event:React.PointerEvent<HTMLDivElement>)=>{
  if(event.button!==0)return;event.stopPropagation();event.preventDefault();
  const modified=event.ctrlKey||event.metaKey||event.shiftKey;
  const ids=modified?(selection.includes(clip.id)?selection.filter(id=>id!==clip.id):[...selection,clip.id]):selection.includes(clip.id)?selection:[clip.id];
  setSelection(ids);
  const primary=ids.includes(clip.id)?clip:screen.clips.find(value=>value.id===ids.at(-1));
  if(primary)onClip(primary);
  if(modified)return;
  const selected=screen.clips.filter(value=>ids.includes(value.id)),target=event.currentTarget,lane=target.parentElement!,x=event.clientX,resize=(event.target as HTMLElement).classList.contains('clip-handle'),scale=screen.duration/lane.clientWidth;
  target.setPointerCapture(event.pointerId);
  const delta=(ev:PointerEvent)=>{
   const raw=Math.round((ev.clientX-x)*scale);let next=raw;
   if(!ev.altKey&&snapping){const result=snapClipDelta(clip.start,clip.duration,raw,candidates.filter(value=>value!==clip.start&&value!==clip.start+clip.duration),8*scale,resize);next=result.delta;setGuide(result.frame);}
   return Math.max(resize?1-Math.min(...selected.map(value=>value.duration)):-Math.min(...selected.map(value=>value.start)),next);
  };
  const elements=selected.map(value=>({clip:value,element:scroller.current?.querySelector<HTMLElement>(`[data-clip-id="${CSS.escape(value.id)}"]`)}));
  const restore=()=>{for(const {clip,element} of elements)if(element){element.style.left=`${clip.start/screen.duration*100}%`;element.style.width=`${clip.duration/screen.duration*100}%`;}setGuide(undefined);};
  const move=(ev:PointerEvent)=>{const offset=delta(ev);for(const {clip,element} of elements)if(element){if(resize)element.style.width=`${(clip.duration+offset)/screen.duration*100}%`;else element.style.left=`${(clip.start+offset)/screen.duration*100}%`;}};
  const clean=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',finish);target.removeEventListener('pointercancel',cancel);};
  const finish=(ev:PointerEvent)=>{clean();const offset=delta(ev);restore();if(ev.clientX===x||offset===0){onSeek(at(ev.clientX,lane));return;}if(ids.length>1&&onBatch)onBatch(ids,resize?'trim':'move',offset);else onChange({...clip,...(resize?{duration:clip.duration+offset}:{start:clip.start+offset})});};
  const cancel=()=>{clean();restore();};target.addEventListener('pointermove',move);target.addEventListener('pointerup',finish);target.addEventListener('pointercancel',cancel);
 };
 const selectClip=(clip:Clip)=>{setSelection([clip.id]);onClip(clip);};
 return {selection,snap,scrub,dragClip,selectClip,snapping,setSnapping,guide};
}

export function TimelineEditingTools({screen,frame,editing,onBatch,onMarkerPut,onMarkerDelete,onSeek,loopSelection,onLoopSelection}:{screen:Screen,frame:number,editing:ReturnType<typeof useTimelineEditing>,onSeek:(frame:number)=>void}&EditingProps){
 const [amount,setAmount]=useState(1);
 const snapButton=useRef<HTMLButtonElement>(null);
 const selected=screen.clips.filter(clip=>editing.selection.includes(clip.id));
 const count=selected.length;
 const selectionLabel=`${count} ${count===1?'clip':'clips'} selected`;
 return <div className="timeline-edit-tools" role="group" aria-label="Timeline editing tools">
  <Button ref={snapButton} className="icon-button" variant="ghost" aria-label="Snap timing" aria-pressed={editing.snapping} hint={editing.snapping?'Timing snapping on · Hold Alt to bypass':'Enable snapping to timing boundaries'} onClick={()=>editing.setSnapping(value=>!value)}><Icon name="snap"/></Button>
  {([-1,1] as const).map(direction=><Button key={direction} className="icon-button" variant="ghost" aria-label={direction<0?'Previous timing boundary':'Next timing boundary'} hint={direction<0?'Jump to the previous timing boundary':'Jump to the next timing boundary'} onClick={()=>onSeek(adjacentBoundary(screen,frame,direction))}><Icon name={direction<0?'previous':'next'}/></Button>)}
  <Button className="icon-button" variant="ghost" aria-label="Fit timeline" hint="Fit the entire timeline to the window" onClick={event=>event.currentTarget.closest('.timeline')?.querySelector('.timeline-scroll')?.dispatchEvent(new CustomEvent('pteron:timeline-fit',{detail:{start:0,end:screen.duration,duration:screen.duration}}))}><Icon name="fit"/></Button>
  <Button className="icon-button" variant="ghost" aria-label="Zoom to selected clips" hint={count?'Fit the selected clips to the window':'Select clips to zoom to their range'} disabled={!count} onClick={event=>event.currentTarget.closest('.timeline')?.querySelector('.timeline-scroll')?.dispatchEvent(new CustomEvent('pteron:timeline-fit',{detail:{start:Math.min(...selected.map(clip=>clip.start)),end:Math.max(...selected.map(clip=>clip.start+clip.duration)),duration:screen.duration}}))}><Icon name="search"/></Button>
  {onBatch&&<span className="clip-selection-count" role="status" aria-label={selectionLabel}>{count||''}</span>}
  {onBatch&&count>0&&<div className="clip-batch-tools" role="group" aria-label="Selected clips">
   <input type="number" aria-label="Batch frames" title="Frames to shift, trim, or space apart" value={amount} step="1" onChange={event=>setAmount(Number.isFinite(event.currentTarget.valueAsNumber)?Math.round(event.currentTarget.valueAsNumber):0)}/>
   <span className="batch-unit" aria-hidden="true">f</span>
   {([['move','Shift'],['trim','Trim'],['stagger','Stagger']] as const).map(([action,verb])=>{
    const label=`${verb} selected clips`;
    return <Button className="icon-button batch-action" key={action} aria-label={label} title={label} variant="ghost" onClick={()=>onBatch(editing.selection,action,amount)}><Icon name={action}/><span className="tool-label">{verb}</span></Button>;
   })}
   <Button className="icon-button batch-action" variant="ghost" aria-label="Duplicate clips" title="Duplicate clips" onClick={()=>{
    const end=Math.max(...selected.map(clip=>clip.start+clip.duration));
    const start=Math.min(...selected.map(clip=>clip.start));
    return onBatch(editing.selection,'duplicate',end-start);
   }}><Icon name="copy"/><span className="tool-label">Duplicate</span></Button>
   <Button className="icon-button batch-action" variant="ghost" aria-label="Delete clips" title="Delete clips" onClick={()=>{
    snapButton.current?.focus();
    return onBatch(editing.selection,'delete',0);
   }}><Icon name="trash"/><span className="tool-label">Delete</span></Button>
  </div>}
  {onLoopSelection&&<Button className="icon-button batch-action" variant="ghost" aria-label="Loop selected clips" hint={loopSelection?'Stop looping the selected range':count?'Repeat playback over the selected clips':'Select clips to loop their range'} aria-pressed={Boolean(loopSelection)} disabled={!count&&!loopSelection} onClick={()=>onLoopSelection(loopSelection?null:{start:Math.min(...selected.map(clip=>clip.start)),end:Math.max(...selected.map(clip=>clip.start+clip.duration))})}><Icon name="loop"/><span className="tool-label">Loop</span></Button>}
  <MarkerControls screen={screen} frame={frame} onMarkerPut={onMarkerPut} onMarkerDelete={onMarkerDelete} onSeek={onSeek}/>
 </div>;
}
