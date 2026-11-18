import {useEffect,useState} from 'react';
import type {Screen,Project} from '../core/model';
import {Icon} from './Icon';

type Caption=Screen['captions'][number];
type Media=Project['media'][string];
export type AudioSegment={id:string,start:number,duration:number,sourceStart:number,media:Media,movable?:boolean};
function Waveform({media,sourceStart,duration,fps}:{media:Media,sourceStart:number,duration:number,fps:number}){
 const [peaks,setPeaks]=useState<number[]>([]);
 useEffect(()=>{
  let current=true;const context=new AudioContext();setPeaks([]);
  const bytes=Uint8Array.from(atob(media.data),character=>character.charCodeAt(0));
  void context.decodeAudioData(bytes.buffer).then(audio=>{
   if(!current)return;const samples=audio.getChannelData(0).subarray(Math.round(sourceStart/fps*audio.sampleRate),Math.round((sourceStart+duration)/fps*audio.sampleRate)),size=Math.max(1,Math.ceil(samples.length/80));
   setPeaks(Array.from({length:80},(_,index)=>{let peak=0;for(let sample=index*size;sample<Math.min(samples.length,(index+1)*size);sample+=Math.max(1,Math.floor(size/64)))peak=Math.max(peak,Math.abs(samples[sample]));return peak;}));
  }).catch(()=>{}).finally(()=>{if(context.state!=='closed')void context.close();});
  return ()=>{current=false;if(context.state!=='closed')void context.close();};
 },[media.data,media.type,sourceStart,duration,fps]);
 return <svg className="audio-waveform" viewBox="0 0 160 20" preserveAspectRatio="none" aria-hidden="true">{peaks.map((peak,index)=><rect key={index} x={index*2} y={10-Math.max(1,peak*9)} width="2" height={Math.max(2,peak*18)}/>)}</svg>;
}

export function TimelineMedia({screen,media,frame,selectedCaption,onSeek,onCaption,onEditCaption,onCaptionChange,onAudio,audioSegments,onAudioMove,fps,snap}:{snap?:(frame:number,excluded?:number[])=>number,screen:Screen,media?:Media,frame:number,selectedCaption:string,onSeek:(frame:number)=>void,onCaption:(id:string)=>void,onEditCaption:()=>void,onCaptionChange:(caption:Caption)=>void,onAudio:()=>void,audioSegments?:AudioSegment[],onAudioMove?:(start:number)=>void,fps:number}){
 const segments=audioSegments??(media?[{id:'audio',media,start:screen.narration.offset??0,duration:screen.narration.duration??screen.duration,sourceStart:screen.narration.sourceStart??0}]:[]);
 if(!segments.length&&!screen.captions.length)return null;
 return <div className="timeline-media" aria-label="Audio and captions">
  {segments.length>0&&<div className="track media-track audio-track"><div className="track-label"><Icon name="audio"/><span>Audio</span></div><div className="track-lane">{segments.map(segment=><button key={segment.id} className={`audio-block ${segment.movable?'movable':''}`} aria-label={`Audio: ${segment.media.name}`} title={segment.media.name} style={{left:`${segment.start/screen.duration*100}%`,width:`${Math.min(segment.duration,screen.duration-segment.start)/screen.duration*100}%`}} onKeyDown={event=>{if(event.key==='Enter'){onAudio();onSeek(segment.start);}}} onPointerDown={event=>{
   if(event.button!==0)return;event.preventDefault();onAudio();const target=event.currentTarget,lane=target.parentElement!,x=event.clientX;target.setPointerCapture(event.pointerId);
   const position=(nextX:number)=>{const value=segment.start+Math.round((nextX-x)/lane.clientWidth*screen.duration);return Math.max(0,snap&&!event.altKey?snap(value,[segment.start,segment.start+segment.duration]):value);};
   const move=(event:PointerEvent)=>{if(segment.movable)target.style.left=`${position(event.clientX)/screen.duration*100}%`;};
   const clean=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',finish);target.removeEventListener('pointercancel',cancel);target.style.left=`${segment.start/screen.duration*100}%`;};
   const finish=(event:PointerEvent)=>{clean();const start=position(event.clientX);if(segment.movable&&start!==segment.start)onAudioMove?.(start);else{const box=lane.getBoundingClientRect();onSeek(Math.max(0,Math.min(screen.duration-1,Math.round((event.clientX-box.left)/box.width*screen.duration))));}};
   const cancel=()=>clean();target.addEventListener('pointermove',move);target.addEventListener('pointerup',finish);target.addEventListener('pointercancel',cancel);
  }}><span>{segment.media.name}</span><Waveform media={segment.media} sourceStart={segment.sourceStart} duration={segment.duration} fps={fps}/></button>)}<div className="playhead" style={{left:`${frame/screen.duration*100}%`}}/></div></div>}
  {screen.captions.length>0&&<div className="track media-track caption-track"><div className="track-label"><Icon name="captions"/><span>Captions</span></div><div className="track-lane">{screen.captions.map((caption,index)=><div key={caption.id} className={`caption-clip ${caption.id===selectedCaption?'selected':''}`} data-caption-id={caption.id} role="button" tabIndex={0} aria-pressed={caption.id===selectedCaption} aria-label={`Caption ${index+1}: ${caption.text||'Untitled'}`} title={caption.text} style={{left:`${caption.start/screen.duration*100}%`,width:`${(caption.end-caption.start)/screen.duration*100}%`}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();onCaption(caption.id);onSeek(caption.start);onEditCaption();}}} onDoubleClick={()=>{onCaption(caption.id);onEditCaption();}} onPointerDown={event=>{
   if(event.button!==0)return;event.preventDefault();event.stopPropagation();onCaption(caption.id);
   const target=event.currentTarget,lane=target.parentElement!,startX=event.clientX,scale=screen.duration/lane.clientWidth,edge=(event.target as HTMLElement).dataset.captionEdge;
   target.setPointerCapture(event.pointerId);
   const next=(x:number)=>{const raw=Math.round((x-startX)*scale),anchor=edge==='end'?caption.end:caption.start,delta=snap&&!event.altKey?snap(anchor+raw,[caption.start,caption.end])-anchor:raw;if(edge==='start')return {...caption,start:Math.max(0,Math.min(caption.end-1,caption.start+delta)),draft:false};if(edge==='end')return {...caption,end:Math.max(caption.start+1,caption.end+delta),draft:false};const start=Math.max(0,caption.start+delta);return {...caption,start,end:start+caption.end-caption.start,draft:false};};
   const restore=()=>{target.style.left=`${caption.start/screen.duration*100}%`;target.style.width=`${(caption.end-caption.start)/screen.duration*100}%`;};
   const move=(event:PointerEvent)=>{const value=next(event.clientX);target.style.left=`${value.start/screen.duration*100}%`;target.style.width=`${(value.end-value.start)/screen.duration*100}%`;};
   const clean=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',finish);target.removeEventListener('pointercancel',cancel);};
   const finish=(event:PointerEvent)=>{clean();restore();const value=next(event.clientX);if(value.start!==caption.start||value.end!==caption.end)onCaptionChange(value);else onSeek(caption.start);};
   const cancel=()=>{clean();restore();};
   target.addEventListener('pointermove',move);target.addEventListener('pointerup',finish);target.addEventListener('pointercancel',cancel);
  }}><span data-caption-edge="start" className="caption-trim caption-trim-start"/><span className="caption-clip-text">{caption.text||'Caption'}</span><span data-caption-edge="end" className="caption-trim caption-trim-end"/></div>)}<div className="playhead" style={{left:`${frame/screen.duration*100}%`}}/></div></div>}
 </div>;
}
