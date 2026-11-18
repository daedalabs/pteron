import {markerName} from './MarkerControls';
import type {CSSProperties} from 'react';
import {useTimelineNavigation} from './navigation';
import {useTimelineEditing,TimelineEditingTools,type EditingProps} from './TimelineEditing';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {layerSpans,clipCategory} from '../core/motion';
import {LayerRange} from './LayerRange';
import {TimelineMedia,type AudioSegment} from './TimelineMedia';
import type {Clip,Screen,LayerSpan,Project} from '../core/model';
import {Button} from '../components/ui/button';
import {Icon} from './Icon';
import type {TimelineItemKind,TimelineSelection} from './TimelineContext';
type Layer={id:string,name:string,parentId?:string,depth:number,hasChildren:boolean,summary?:boolean};
export type TimelineSelectionProps={
 context:(selection?:TimelineSelection)=>ReactNode;
 activeItem?:TimelineItemKind;
 onEditItem:(kind:TimelineItemKind)=>void;
};
type Props=EditingProps&TimelineSelectionProps&{
 fps:number,screen:Screen,layers:Layer[],frame:number,playing:boolean,selectedClip:string,selectedSpan:string,revealClip:string,selectedLayer:string,
 onOpenScene?:(id:string)=>void,media?:Project['media'][string],audioSegments?:AudioSegment[],onAudioMove?:(start:number)=>void,
 selectedCaption:string,onCaption:(id:string)=>void,onCaptionChange:(caption:Screen['captions'][number])=>void,onAudio:()=>void,
 onSpan:(objectId:string,span:LayerSpan)=>void,onSpanChange:(objectId:string,span:LayerSpan,moveClips:boolean)=>void,
 onSeek:(frame:number)=>void,onToggle:()=>void,onReset:()=>void,onLayer:(id:string)=>void,onClip:(clip:Clip)=>void,onChange:(clip:Clip)=>unknown
};
export function Timeline(props:Props){
 const {fps,screen,layers,frame,playing,selectedClip,selectedSpan,revealClip,onSpan,onSpanChange,onSeek,onToggle,onReset,onLayer,onClip,onChange,selectedLayer,media,selectedCaption,onCaption,onCaptionChange,onAudio,audioSegments,onAudioMove,context,activeItem,onEditItem,onOpenScene,onBatch,onMarkerPut,onMarkerDelete,loopSelection,onLoopSelection}=props;
 const scroller=useRef<HTMLDivElement>(null),revealed=useRef('');useTimelineNavigation(scroller,screen.id);
 useEffect(()=>{if(!playing)return;const region=scroller.current,ruler=region?.querySelector('.ruler-time'),label=region?.querySelector('.timeline-controls');if(!region||!ruler||!label)return;const width=ruler.getBoundingClientRect().width,x=frame/screen.duration*width,available=region.clientWidth-label.getBoundingClientRect().width;if(x<region.scrollLeft+20||x>region.scrollLeft+available-20)region.scrollLeft=Math.max(0,x-available*.35);},[playing,frame,screen.duration]);
 const editing=useTimelineEditing({screen,frame,selectedClip,scroller,onClip,onChange,onSeek,onBatch});
 const [expandedGroups,setExpandedGroups]=useState<Set<string>>(new Set());
 const [rulerWidth,setRulerWidth]=useState(640);
 useEffect(()=>{const area=scroller.current,ruler=area?.querySelector<HTMLElement>('.ruler-time');if(!area||!ruler)return;const update=()=>{setRulerWidth(ruler.clientWidth);area.style.scrollPaddingTop=`${area.querySelector('.ruler')?.getBoundingClientRect().height??42}px`;area.style.scrollPaddingBottom=`${area.querySelector('.timeline-media')?.getBoundingClientRect().height??0}px`;};const observer=new ResizeObserver(update);observer.observe(ruler);const media=area.querySelector('.timeline-media');if(media)observer.observe(media);update();return()=>observer.disconnect();},[screen.id,Boolean(media),audioSegments?.length,screen.captions.length]);
 const tickSteps=[1,2,3,5,10,15,20,30,45,60,90,120,150,300,450,600,900,1200,1800,3600,5400,10800,18000,36000,54000,108000,216000];
 const tickStep=tickSteps.find(step=>step>=screen.duration/Math.max(1,Math.floor(rulerWidth/60)))??216000;
 const ticks=Array.from({length:Math.floor(screen.duration/tickStep)+1},(_,i)=>i*tickStep);
 if(ticks.at(-1)!<screen.duration){if((screen.duration-ticks.at(-1)!)/screen.duration*rulerWidth<70&&ticks.length>1)ticks.pop();ticks.push(screen.duration);}
 const hierarchyKey=layers.map(layer=>`${layer.id}:${layer.parentId??''}`).join('|');
 useEffect(()=>{setExpandedGroups(current=>{const next=new Set(current);let parent=layers.find(layer=>layer.id===selectedLayer)?.parentId;while(parent){next.add(parent);parent=layers.find(layer=>layer.id===parent)?.parentId;}return next.size===current.size?current:next;});},[selectedLayer,screen.id,hierarchyKey]);
 const visibleLayers:Layer[]=[];
 const append=(parentId?:string)=>{const siblings=layers.filter(item=>item.parentId===parentId);for(const layer of (!parentId&&layers.some(layer=>layer.summary)?siblings:siblings.reverse())){visibleLayers.push(layer);if(expandedGroups.has(layer.id))append(layer.id);}};append();
 const toggleGroup=(id:string)=>setExpandedGroups(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
 useEffect(()=>{if(!revealClip||revealed.current===revealClip)return;const clip=scroller.current?.querySelector<HTMLElement>(`[data-clip-id="${CSS.escape(revealClip)}"]`);if(!clip)return;revealed.current=revealClip;clip.closest('.track')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});},[revealClip,screen.clips,visibleLayers]);
 const scrub=editing.scrub;
 const clip=activeItem==='clip'&&editing.selection.length===1?screen.clips.find(clip=>clip.id===editing.selection[0]):undefined;
 const caption=activeItem==='caption'?screen.captions.find(caption=>caption.id===selectedCaption):undefined;
 const selection:TimelineSelection|undefined=clip?{
  name:clip.preset,
  timing:{owner:layers.find(layer=>layer.id===clip.objectId)?.name??'Layer',start:clip.start,end:clip.start+clip.duration},
  onEdit:()=>onEditItem('clip')
 }:caption?{
  name:caption.text.trim()||'Untitled caption',
  timing:{owner:'Captions',start:caption.start,end:caption.end},
  onEdit:()=>onEditItem('caption')
 }:activeItem==='clip'&&editing.selection.length>1?{name:`${editing.selection.length} clips selected`}:undefined;
 return <section className="timeline" aria-label="Timeline">{context(selection)}<TimelineEditingTools screen={screen} frame={frame} editing={editing} onBatch={onBatch} onMarkerPut={onMarkerPut} onMarkerDelete={onMarkerDelete} onSeek={onSeek} loopSelection={loopSelection} onLoopSelection={onLoopSelection}/>
  <div className="timeline-scroll" tabIndex={0} aria-label="Timeline workspace" ref={scroller} onKeyDown={event=>{if((event.key==='Delete'||event.key==='Backspace')&&editing.selection.length&&onBatch&&!(event.target as Element).closest('input,textarea')){event.preventDefault();onBatch(editing.selection,'delete',0);}}}>
   <div className="timeline-content"><div className="ruler"><span className="timeline-controls" aria-label="Timeline controls"><Button aria-label={playing?'Pause':'Play'} title={playing?'Pause':'Play'} variant="ghost" onClick={onToggle}><Icon name={playing?'pause':'play'}/></Button><span className="timecode" aria-label={`${frame} of ${screen.duration} frames; ${(frame/fps).toFixed(2)} of ${(screen.duration/fps).toFixed(2)} seconds`}><span>{frame} / {screen.duration}f</span><span>{(frame/fps).toFixed(2)} / {(screen.duration/fps).toFixed(2)}s</span></span><Button aria-label="Reset playback" title="Reset playback" variant="ghost" onClick={onReset}><Icon name="reset"/></Button></span>
    <div className="ruler-time" role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={screen.duration-1} aria-valuenow={frame} aria-valuetext={`${frame} frames; ${(frame/fps).toFixed(2)} seconds`} tabIndex={0} onPointerDown={scrub} onKeyDown={event=>{const values:Record<string,number>={ArrowLeft:frame-1,ArrowDown:frame-1,ArrowRight:frame+1,ArrowUp:frame+1,PageUp:frame-fps,PageDown:frame+fps,Home:0,End:screen.duration-1};if(event.key in values){event.preventDefault();onSeek(Math.max(0,Math.min(screen.duration-1,values[event.key])));}}}>
     {ticks.map(tick=><span key={tick} style={{left:`${tick/screen.duration*100}%`,transform:tick===screen.duration?'translateX(-100%)':undefined}}><span>{tick}f</span><span>{Number((tick/fps).toFixed(2))}s</span></span>)}
     {screen.cues.map(cue=><button key={cue.id} className="timeline-marker" aria-label={markerName(cue)} title={cue.label?.trim()?`${cue.label} · ${cue.frame}f`:`${cue.frame}f`} style={{left:`${cue.frame/screen.duration*100}%`}} onPointerDown={event=>event.stopPropagation()} onClick={()=>onSeek(cue.frame)}><Icon name="marker"/></button>)}
     <div className="ruler-playhead" style={{left:`${frame/screen.duration*100}%`}}/>{editing.guide!==undefined&&<div className="snap-guide" style={{left:`${editing.guide/screen.duration*100}%`}}><span className="snap-guide-label">{editing.guide}f</span></div>}
    </div></div>
    {!visibleLayers.length&&<div className="timeline-empty">Draw artwork to add a track</div>}
    {visibleLayers.map(layer=><div key={layer.id} className={`track ${layer.hasChildren?'group-track':''} ${selectedLayer===layer.id?'selected-track':''}`} data-object-id={layer.id} data-parent-id={layer.parentId} data-depth={layer.depth}>
     <div className="track-label" style={{'--track-indent':`${4+layer.depth*16}px`} as CSSProperties}>{layer.hasChildren?<button className="track-expand" aria-label={`${!expandedGroups.has(layer.id)?'Expand':'Collapse'} ${layer.name} in timeline`} aria-expanded={expandedGroups.has(layer.id)} onClick={()=>toggleGroup(layer.id)}><Icon name={!expandedGroups.has(layer.id)?'chevron-right':'chevron'}/></button>:<span className="track-expand-spacer"/>}{layer.summary&&<span className="track-scene-mark" aria-hidden="true"><Icon name="screens"/></span>}<button className="track-name" title={layer.name} aria-pressed={selectedLayer===layer.id} onClick={()=>onLayer(layer.id)}><span>{layer.name}</span></button>{layer.summary&&onOpenScene&&<button className="scene-open" aria-label={`Edit ${layer.name} scene`} title="Open scene timeline" onClick={()=>onOpenScene(layer.id)}><Icon name="chevron-right"/></button>}</div>
     <div className="track-lane" onPointerDown={scrub}>{layer.summary?<button className="screen-band" onPointerDown={event=>event.stopPropagation()} aria-label={layer.name} style={{left:`${(screen.lifetimes[layer.id]?.[0]?.start??0)/screen.duration*100}%`,width:`${((screen.lifetimes[layer.id]?.[0]?.end??0)-(screen.lifetimes[layer.id]?.[0]?.start??0))/screen.duration*100}%`}} onClick={()=>onLayer(layer.id)}>{layer.name}</button>:layerSpans(screen,layer.id).map(span=><LayerRange key={span.id} screen={screen} objectId={layer.id} name={layer.name} span={span} selected={selectedSpan===span.id} snap={value=>editing.snap(value,[span.start,span.end])} onSeek={onSeek} onSelect={()=>onSpan(layer.id,span)} onChange={(next,moveClips)=>onSpanChange(layer.id,next,moveClips)}/>)}
      {screen.clips.filter(clip=>clip.objectId===layer.id).map(clip=>{const category=clipCategory(clip.preset);return <div key={clip.id} data-clip-id={clip.id} data-category={category} tabIndex={0} role="button" aria-label={`${clip.preset} clip`} aria-pressed={editing.selection.includes(clip.id)} className={`clip clip-${category} ${editing.selection.includes(clip.id)?'selected':''}`} style={{left:`${clip.start/screen.duration*100}%`,width:`${clip.duration/screen.duration*100}%`}} onKeyDown={event=>{
       if(event.key==='Enter'||event.key===' '){event.preventDefault();editing.selectClip(clip);onSeek(clip.start);if(event.key==='Enter')onEditItem('clip');}
      }} onDoubleClick={event=>{
       if(event.ctrlKey||event.metaKey||event.shiftKey)return;
       editing.selectClip(clip);onEditItem('clip');
      }} onPointerDown={editing.dragClip(clip)}>{clip.preset}<span className="clip-handle"/></div>;})}
      <div className="playhead" style={{left:`${frame/screen.duration*100}%`}}/>{editing.guide!==undefined&&<div className="snap-guide" style={{left:`${editing.guide/screen.duration*100}%`}}><span className="snap-guide-label">{editing.guide}f</span></div>}
     </div></div>)}
   </div>
   <TimelineMedia fps={fps} snap={editing.snap} audioSegments={audioSegments} onAudioMove={onAudioMove} screen={screen} media={media} frame={frame} selectedCaption={selectedCaption} onSeek={onSeek} onCaption={onCaption} onEditCaption={()=>onEditItem('caption')} onCaptionChange={onCaptionChange} onAudio={onAudio}/>
  </div>
 </section>;
}
