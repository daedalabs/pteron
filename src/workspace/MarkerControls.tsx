import {useEffect,useState} from 'react';
import {uuid,type Screen} from '../core/model';
import {Button} from '../components/ui/button';
import {SettingsPopover} from '../components/ui/settings-popover';
import {Icon} from './Icon';
import type {EditingProps} from './TimelineEditing';

export const markerName=(marker:{frame:number,label?:string})=>marker.label?.trim()?`Marker: ${marker.label}`:`Marker at ${marker.frame}f`;
export function MarkerControls({screen,frame,onMarkerPut,onMarkerDelete,onSeek}:{screen:Screen,frame:number,onSeek:(frame:number)=>void}&EditingProps){
 const [open,setOpen]=useState(false),[selected,setSelected]=useState(''),[label,setLabel]=useState(''),[position,setPosition]=useState(0),[pending,setPending]=useState(false);
 const markers=screen.cues.filter(cue=>cue.frame===frame),marker=screen.cues.find(cue=>cue.id===selected);
 useEffect(()=>{setSelected('');setOpen(false);},[screen.id]);
 useEffect(()=>{if(marker){setLabel(marker.label??'');setPosition(marker.frame);}else setSelected('');},[marker?.id,marker?.label,marker?.frame]);
 if(!onMarkerPut)return null;
 const add=async()=>{setPending(true);try{await onMarkerPut({id:uuid(),frame,label:''});}finally{onSeek(frame);setPending(false);}};
 return <div className="marker-tools"><SettingsPopover label="Timeline markers" className="marker-popover" side="top" open={open} onOpenChange={next=>{if(!next){setOpen(false);return;}if(pending)return;if(markers.length){setSelected(markers[0].id);setOpen(true);}else void add();}} trigger={<Button className="icon-button" variant="ghost" aria-label={markers.length?'Edit marker':'Add marker'} title={markers.length?`Edit marker at ${frame}f · optional name`:`Add marker at ${frame}f`} disabled={pending} aria-busy={pending}><Icon name={markers.length?'marker':'marker-add'}/></Button>}>
 <div className="marker-popover-heading"><strong>Marker</strong><Button variant="ghost" className="icon-button" aria-label="Close markers" title="Close markers" onClick={()=>setOpen(false)}><Icon name="close"/></Button></div>
 {markers.length>1&&<div className="marker-list" aria-label="Markers at this frame">{markers.map(cue=><button key={cue.id} aria-label={`Edit marker ${cue.label?.trim()||`at ${cue.frame}f`}`} aria-pressed={selected===cue.id} title={markerName(cue)} onClick={()=>{setSelected(cue.id);onSeek(cue.frame);}}><Icon name="marker"/><span>{cue.label?.trim()||`${cue.frame}f`}</span>{cue.label?.trim()&&<small>{cue.frame}f</small>}</button>)}</div>}
 {marker&&<form className="marker-editor" onSubmit={async event=>{event.preventDefault();setPending(true);try{const result=await onMarkerPut({id:marker.id,frame:position,label:label.trim()});if(result){setOpen(false);onSeek(position);}else onSeek(frame);}finally{setPending(false);}}}><label>Name <span className="muted">optional</span><input autoFocus aria-label="Marker name" maxLength={200} value={label} placeholder="Optional" onChange={event=>setLabel(event.target.value)}/></label><label>Frame<input aria-label="Marker frame" type="number" required min="0" max={screen.duration-1} step="1" value={position} onChange={event=>setPosition(Number.isFinite(event.currentTarget.valueAsNumber)?event.currentTarget.valueAsNumber:0)}/></label><div className="marker-editor-actions"><Button type="button" variant="ghost" className="icon-button" aria-label="Delete marker" title="Delete marker" disabled={!onMarkerDelete||pending} onClick={async()=>{setPending(true);try{if(await onMarkerDelete?.(marker.id)){setSelected('');setOpen(false);}onSeek(frame);}finally{setPending(false);}}}><Icon name="trash"/></Button><Button type="submit" className="icon-button" disabled={pending} aria-label="Save marker" title="Save marker"><Icon name="check"/></Button></div></form>}
 </SettingsPopover></div>;
}
