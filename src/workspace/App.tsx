import {AudioTrim} from './AudioTrim';
import {ActivityPanel} from './ActivityPanel';
import {CreateProjectModal} from './CreateProjectModal';
import {RecoveryPreview} from './RecoveryPreview';
import {SavedLibrary} from './SavedLibrary';
import {ApplicationHeader,CommandPalette} from './ApplicationHeader';
import {ApplicationHelp} from './ApplicationHelp';
import {applicationMenus,flattenActions,shortcutAction,type Action,type MenuState} from './application-actions';
import {MotionOverlay} from './MotionOverlay';
import {EquationTerms} from './EquationTerms';
import {TimelineContext,type TimelineItemKind,type TimelineSelection} from './TimelineContext';
import {ContinuityInspector} from './ContinuityInspector';
import {CanvasInspector} from './CanvasInspector';
import {canvasTools,toolShortcut} from './tool-shortcuts';
import {narrationClock,syncNarration} from './narration-playback';
import {useCanvasNavigation} from './navigation';
import {LayerMenu} from './LayerMenu';
import {LayerLabel,layerFilterPattern} from './LayerLabel';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Icon} from './Icon';
import {DockPanel} from '../components/ui/dock-panel';
import {ScreensPanel} from './ScreensPanel';
import {ProjectFormatSettings} from './ProjectFormatSettings';
import {NarrationSettings} from './NarrationSettings';
import {MotionLibrary} from './MotionLibrary';
import {Timeline} from './Timeline';
import {CaptionEditor} from './CaptionEditor';
import {CaptionPreview} from './CaptionPreview';
import {OverallTimeline} from './OverallTimeline';
import {screenOffsets,timelineCaptions} from '../core/project-timeline';
import {ResizeHandle} from '../components/ui/resize-handle';
import {LayerTimingInspector} from './LayerTimingInspector';
import {ClipInspector} from './ClipInspector';
import {MultiSelectionInspector} from './MultiSelectionInspector';
import {ShapeInspector} from './ShapeInspector';
import {EquationEditor} from './EquationEditor';
import type {SvgObject} from '../core/svg';
import defaultEquationSvg from '../assets/default-equation.svg?raw';
import {Button} from '../components/ui/button';
import {InspectorSection} from '../components/ui/inspector-section';
import {SegmentedControl} from '../components/ui/segmented-control';
import {Modal} from '../components/ui/dialog';
import { type Project,type Clip,type LayerSpan,uuid,clipSchema,defaultNarrationMix,defaultCaptionStyle } from '../core/model';
import {createEvaluator,evaluate,layerSpans} from '../core/motion';
type Layer=SvgObject;
function friendlyError(error:unknown){
 const raw=error instanceof Error?error.message:String(error);
 const message=raw.replace(/^Error invoking remote method ['"]pteron['"]:\s*Error:\s*/,'');
 if(/clips overlap on the same property/i.test(message))return 'Motion overlap · move or delete the conflicting clip';
 return message;
}
const commandLabels:Record<string,string>={
 'object.edit':'Edit shape',
 'object.delete':'Delete shape',
 'object.create':'Create shape',
 'object.nudge':'Nudge shape',
 'object.outline':'Text to outlines',
 'object.alignSelection':'Align selection',
 'clip.put':'Set animation clip',
 'clip.delete':'Delete animation clip',
 'clips.batch':'Batch edit clips',
 'screen.add':'Add scene',
 'screen.duplicate':'Duplicate scene',
 'screen.delete':'Delete scene',
 'screen.reorder':'Reorder scenes',
 'screen.update':'Rename scene',
 'history.undo':'Undo',
 'history.redo':'Redo',
 'canvas.background':'Canvas background',
 'project.create':'Create project',
 'project.open':'Open project',
 'project.settings':'Project settings',
 'project.rename':'Rename project',
 'caption.put':'Update caption',
 'layer.span.put':'Layer timing',
 'motion.apply':'Apply motion preset',
 'cue.put':'Add marker',
};
function formatCommandName(cmd:string){return commandLabels[cmd]??cmd;}
export function App(){
 const [project,setProject]=useState<Project>(),[screenId,setScreenId]=useState(''),[layers,setLayers]=useState<Layer[]>([]),[selected,setSelected]=useState(''),[clipId,setClipId]=useState(''),[error,setError]=useState(''),[status,setStatus]=useState('Ready'),[frame,setFrame]=useState(0),[playing,setPlaying]=useState(false),[ready,setReady]=useState(false),[modal,setModal]=useState(false),[history,setHistory]=useState({undo:0,redo:0}),[tab,setTab]=useState('Properties'),[activity,setActivity]=useState<any[]>([]);
 const [spanId,setSpanId]=useState(''),[captionId,setCaptionId]=useState(''),[allView,setAllView]=useState(false);
 const previewing=useRef(false);
 const pendingFocus=useRef<{screenId:string,frame:number,objectId?:string,clipId?:string,spanId?:string}|undefined>(undefined);
 const [canvasBacking,setCanvasBacking]=useState('#ffffff');
 const [editorVersion,setEditorVersion]=useState(0);
 const iframe=useRef<HTMLIFrameElement>(null),latest=useRef(project),screenRef=useRef(screenId),playRef=useRef(false);
 const [jobs,setJobs]=useState<any[]>([]),[equationDraft,setEquationDraft]=useState(false),[equationDraftId,setEquationDraftId]=useState('');
 const [canvasSnap,setCanvasSnap]=useState(true);
 const [mode,setMode]=useState('select'),[leftWidth,setLeftWidth]=useState(160),[layersWidth,setLayersWidth]=useState(180),[rightWidth,setRightWidth]=useState(290),[timelineHeight,setTimelineHeight]=useState(()=>Math.round(Math.min(320,Math.max(220,innerHeight*.3)))),[layersFor,setLayersFor]=useState(''),[revealClip,setRevealClip]=useState('');
 const [settings,setSettings]=useState('');
 const [exportChoosing,setExportChoosing]=useState(false),exportRequest=useRef(false);
 const [savedDocument,setSavedDocument]=useState<{path?:string,dirty:boolean}>({dirty:true}),[recentProjects,setRecentProjects]=useState<{path:string,name:string,missing:boolean}[]>([]),[recentWarning,setRecentWarning]=useState<string>(),[applicationInfo,setApplicationInfo]=useState<any>(),[fullscreen,setFullscreen]=useState(false),[maximized,setMaximized]=useState(false);
 const [activeMenu,setActiveMenu]=useState(''),[paletteOpen,setPaletteOpen]=useState(false),[loopScene,setLoopScene]=useState(false),[textEditing,setTextEditing]=useState(false);
 const [loopRange,setLoopRange]=useState<{start:number,end:number}>();
 useEffect(()=>setLoopRange(undefined),[project?.id,project?.revision]);
 const loopRef=useRef(loopScene);loopRef.current=loopScene;
 const [panels,setPanels]=useState({scenes:true,layers:true,inspector:true,timeline:true});
 const [timelineFocused,setTimelineFocused]=useState(false);
 const [activeTimelineItem,setActiveTimelineItem]=useState<TimelineItemKind>();
 const [timelineEditorRequest,setTimelineEditorRequest]=useState<TimelineItemKind>();
 const [motionView,setMotionView]=useState('Presets');
 const [layerQuery,setLayerQuery]=useState('');
 const layerSearch=useRef<HTMLInputElement>(null);
 const clearLayerSearch=()=>{setLayerQuery('');layerSearch.current?.focus();};
 const toggleTimelineFocus=()=>setTimelineFocused(value=>!value);
 const actionRef=useRef<(id:string)=>unknown>(()=>{}),actionFocus=useRef<HTMLElement|null>(null),menuActionsRef=useRef<Action[]>([]);
 const rememberFocus=()=>{const focused=document.activeElement===iframe.current?iframe.current?.contentDocument?.activeElement:document.activeElement;if(focused?.nodeType===1&&!focused.closest('.application-header,.app-menu-content,.command-palette')){actionFocus.current=focused as HTMLElement;setTextEditing(focused.matches('input,textarea,select,[contenteditable=true]'));}};
 useEffect(()=>{const frame=iframe.current;const focus=()=>rememberFocus();const install=()=>frame?.contentDocument?.addEventListener('focusin',focus);document.addEventListener('focusin',focus);frame?.addEventListener('load',install);install();return()=>{document.removeEventListener('focusin',focus);frame?.removeEventListener('load',install);frame?.contentDocument?.removeEventListener('focusin',focus);};},[Boolean(project)]);
 useEffect(()=>{const frame=iframe.current;const handler=(event:KeyboardEvent)=>{const access:Record<string,string>={f:'File',e:'Edit',s:'Scene',v:'View',p:'Playback',h:'Help'};if(event.key==='F10'&&!event.shiftKey&&!event.ctrlKey||event.altKey&&!event.ctrlKey&&access[event.key.toLowerCase()]){event.preventDefault();event.stopImmediatePropagation();const triggers=Array.from(document.querySelectorAll<HTMLButtonElement>('.app-menu-trigger'));if(event.key==='F10')triggers[0]?.focus();else{const label=access[event.key.toLowerCase()];triggers.find(trigger=>trigger.textContent===label)?.focus();setActiveMenu(value=>value===label?'':label);}return;}const action=shortcutAction(menuActionsRef.current,event);if(!action||event.repeat)return;const target=event.target as Element;if(target?.closest?.('input,textarea,[contenteditable=true]')&&['edit.undo','edit.redo','edit.cut','edit.copy','edit.paste','edit.selectAll'].includes(action.id))return;event.preventDefault();event.stopImmediatePropagation();if(action.enabled!==false)void actionRef.current(action.id);};const install=()=>frame?.contentWindow?.addEventListener('keydown',handler,true);window.addEventListener('keydown',handler,true);frame?.addEventListener('load',install);install();return()=>{window.removeEventListener('keydown',handler,true);frame?.removeEventListener('load',install);frame?.contentWindow?.removeEventListener('keydown',handler,true);};},[Boolean(project)]);

 const [editingMotion,setEditingMotion]=useState(false);
 useEffect(()=>{if(clipId){setTab('Motion');setMotionView('Clip');}else if(selected||equationDraft)setTab('Properties');},[clipId,equationDraft]);
 const [collapsedLayers,setCollapsedLayers]=useState<Set<string>>(new Set());
 const [layerSelection,setLayerSelection]=useState<string[]>([]),[canPaste,setCanPaste]=useState(false);
 const nudgeIds=useRef<string[]>([]);nudgeIds.current=layerSelection.includes(selected)?layerSelection:[selected].filter(Boolean);
 const chooseToolRef=useRef<(value:string)=>void>(()=>{});
 const mutationQueue=useRef<Promise<unknown>>(Promise.resolve());
 const selectedRef=useRef(selected);selectedRef.current=selected;
 const modeRef=useRef(mode),loadedScreen=useRef('');modeRef.current=mode;

 useEffect(()=>{if(project)document.title=`pteron · ${project.name} · ${project.width} × ${project.height} · ${project.fps} fps`;},[project?.name,project?.width,project?.height,project?.fps]);
 useEffect(()=>{
  const syncWindowState=()=>{void window.pteron.call('window.state').then(value=>{setFullscreen(value.fullscreen);setMaximized(Boolean(value.maximized));}).catch(()=>{});};
  void window.pteron.call('app.info').then(setApplicationInfo).catch(()=>{});
  syncWindowState();
  return window.pteron.onAction(action=>{
   if(action==='window.changed'){syncWindowState();return;}
   if(action.startsWith('menu.')){
    const triggers=Array.from(document.querySelectorAll<HTMLButtonElement>('.app-menu-trigger'));
    const trigger=triggers.find(trigger=>trigger.textContent===action.slice(5))??triggers[0];
    trigger?.focus();
    if(action!=='menu.focus')setActiveMenu(value=>value===action.slice(5)?'':action.slice(5));
    return;
   }
   void actionRef.current(action);
  });
 },[]);
 const audioClock=useRef(narrationClock());
 const narrationAudio=useRef<HTMLAudioElement>(null),frameRef=useRef(frame);frameRef.current=frame;
 const canvasArea=useRef<HTMLDivElement>(null),[canvasSize,setCanvasSize]=useState({width:640,height:300});
 useEffect(()=>{const area=canvasArea.current;if(!area)return;const observer=new ResizeObserver(()=>{
  const {clientWidth:width,clientHeight:height}=area;
  if(width&&height)setCanvasSize({width,height});
 });observer.observe(area);return ()=>observer.disconnect();},[Boolean(project)]);
 latest.current=project;screenRef.current=screenId;playRef.current=playing;
 const screen=project?.screens.find(s=>s.id===screenId)??project?.screens[0],clip=screen?.clips.find(c=>c.id===clipId);
 useEffect(()=>{
  if(!timelineEditorRequest||timelineFocused||!panels.inspector)return;
  const selector=timelineEditorRequest==='clip'?'.clip-settings input[aria-label="Start"]':'.right-panel textarea[aria-label="Caption text"]';
  const field=document.querySelector<HTMLElement>(selector);
  if(field?.getClientRects().length){field.focus();setTimelineEditorRequest(undefined);}
 },[timelineEditorRequest,timelineFocused,panels.inspector,clip?.id,captionId,tab,motionView]);
 const narrationMix=project?.narrationMix??defaultNarrationMix;
 useEffect(()=>{
  const audio=narrationAudio.current;
  if(!audio)return;
  audio.volume=narrationMix.volume/100;
  audio.muted=narrationMix.muted;
 },[screen?.narration.mediaId,narrationMix.volume,narrationMix.muted]);
 const canvasNavigation=useCanvasNavigation(canvasArea,iframe,canvasSize,project?.width??1080,project?.height??1920);
 const {zoom,pan}=canvasNavigation;
 const send=(type:string,data:unknown={})=>iframe.current?.contentWindow?.postMessage({pteron:true,type,data},'*');
 async function refresh(){const [state,recent]=await Promise.all([window.pteron.call('state'),window.pteron.call('recent.list')]);setSavedDocument(state.document??{path:state.path,dirty:true});setRecentProjects(recent.projects);setRecentWarning(recent.warning);latest.current=state.project;setProject(state.project);setHistory(state.history);setCanPaste(Boolean(state.clipboardAvailable));setActivity(state.activity);setScreenId(current=>state.project.screens.some((s:any)=>s.id===current)?current:state.project.screens[0].id);}
 async function run(method:string,args:any={}){
  const operation=async()=>{setPlaying(false);previewing.current=false;if(['command','open','example.open','recover'].includes(method))setFrame(0);send('restore');setError('');try{const result=await window.pteron.call(method,{revision:latest.current?.revision,...args});await refresh();if(method==='render'||method==='job.cancel')setJobs(await window.pteron.call('jobs'));setStatus(result===null&&!['recent.clear','recent.remove'].includes(method)?'Cancelled':method==='save'||method==='saveAs'?'Saved':method==='recent.clear'?'Recent projects cleared':method==='recent.remove'?'Removed from recent projects':method==='command'?'Edited':method);return result;}catch(e){setError(friendlyError(e));await refresh();}};
  const result=mutationQueue.current.then(operation,operation);mutationQueue.current=result;return result;
 }
 const command=(command:any,revision?:number)=>run('command',{command,...(revision!==undefined?{revision}:{})});
 useEffect(()=>{const reload=()=>void refresh().catch(error=>setError(error instanceof Error?error.message:String(error)));reload();return window.pteron.subscribe(()=>{setPlaying(false);previewing.current=false;setFrame(0);send('restore');reload();});},[]);
 useEffect(()=>{const interval=setInterval(()=>{void window.pteron.call('jobs').then(setJobs).catch(()=>{});},1000);return ()=>clearInterval(interval);},[]);
 useEffect(()=>{if(!selected)return;setCollapsedLayers(current=>{const next=new Set(current);let parent=layers.find(l=>l.id===selected)?.parentId;while(parent){next.delete(parent);parent=layers.find(l=>l.id===parent)?.parentId;}return next.size===current.size?current:next;});requestAnimationFrame(()=>document.querySelector(`[data-layer-id="${CSS.escape(selected)}"]`)?.scrollIntoView({block:'nearest'}));},[selected,layers]);
 const handledEquations=useRef(new Set<string>());
 useEffect(()=>{for(const job of jobs){if(job.kind!=='equation'||job.status!=='completed'||handledEquations.current.has(job.id))continue;handledEquations.current.add(job.id);if(job.screenId===screenRef.current&&job.objectId){setSelected(job.objectId);setClipId('');setEquationDraft(false);send('select',{id:job.objectId});}}},[jobs]);
 useEffect(()=>{const listener=(event:MessageEvent)=>{if(event.source!==iframe.current?.contentWindow||!event.data?.pteron)return;const {type,data}=event.data;if(type==='edit-request'){setPlaying(false);previewing.current=false;setFrame(0);}if(type==='tool')chooseToolRef.current(data.mode);if(type==='backing')setCanvasBacking(data.color);if(type==='ready'){setReady(true);setEditorVersion(value=>value+1);}if(type==='history')void command({type:data.redo?'history.redo':'history.undo'});if(type==='selected'){setTab('Properties');if(playRef.current){setPlaying(false);previewing.current=false;send('restore');}setLayerSelection(data.ids);setSelected(data.ids[0]??'');if(data.ids.length)setEquationDraft(false);}if(type==='nudge')void command({type:'object.nudge',screenId:screenRef.current,objectIds:data.ids,x:data.x,y:data.y});if(type==='error')setError(friendlyError(data.message));if(type==='change')void run('command',{command:{type:'artwork.commit',screenId:screenRef.current,svg:data.svg}});};window.addEventListener('message',listener);return ()=>window.removeEventListener('message',listener);},[]);
 useEffect(()=>{if(!screen)return;const focus=pendingFocus.current?.screenId===screen.id?pendingFocus.current:undefined;pendingFocus.current=undefined;setSelected(focus?.objectId??'');setClipId(focus?.clipId??'');setEquationDraft(false);setEquationDraftId('');setLayerSelection(focus?.objectId?[focus.objectId]:[]);setSpanId(focus?.spanId??'');if(!playRef.current)setFrame(focus?.frame??0);},[screen?.id]);
 useEffect(()=>{if(!screen)return;let cancelled=false;void window.pteron.call('objects',{screenId:screen.id}).then(items=>{if(!cancelled){setLayers(items);setLayersFor(screen.id);setSelected(current=>items.some((item:Layer)=>item.id===current)?current:'');}});return ()=>{cancelled=true;};},[screen?.svg,screen?.id]);
 useEffect(()=>{if(!screen||!project||!ready)return;const sameScreen=loadedScreen.current===screen.id;loadedScreen.current=screen.id;send('load',{screenId:screen.id,svg:screen.svg,width:project.width,height:project.height,zoom});send('mode',{mode:modeRef.current});if(sameScreen&&selectedRef.current)send('select',{id:selectedRef.current,ids:layerSelection.includes(selectedRef.current)?layerSelection:undefined});if(previewing.current||playRef.current)send('preview',{screenId:screen.id,poses:evaluate(screen,frameRef.current)});},[screen?.svg,screen?.id,project?.width,project?.height,ready,editorVersion]);
 useEffect(()=>{if(!screen||!project||!ready)return;send('viewport',{width:project.width,height:project.height,zoom});},[canvasSize.width,canvasSize.height,project?.width,project?.height,ready,editorVersion,zoom]);
 useEffect(()=>{if(ready)send('mode',{mode});},[mode,ready]);
 useEffect(()=>{if(ready)send('snap',{enabled:canvasSnap,color:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()});},[ready,canvasSnap,editorVersion]);
 useEffect(()=>{if(!ready)return;const object=layers.find(object=>object.id===selected);let paint:Record<string,string|number>|undefined;
  if(object&&[object.presentation.fill,object.presentation.stroke].every(value=>value==='none'||/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value))){paint={fill:object.presentation.fill,stroke:object.presentation.stroke,fill_opacity:Number(object.presentation['fill-opacity']??1),stroke_opacity:Number(object.presentation['stroke-opacity']??1),stroke_width:Number((object.presentation['stroke-width']??'1').replace(/px$/,''))};if(![paint.fill_opacity,paint.stroke_opacity,paint.stroke_width].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=8192))paint=undefined;try{if(paint)localStorage.setItem('pteron.drawing-paint',JSON.stringify(paint));}catch{}}
  else try{const saved=JSON.parse(localStorage.getItem('pteron.drawing-paint')??'null');if(saved&&['fill','stroke'].every(key=>typeof saved[key]==='string'&&(saved[key]==='none'||/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(saved[key])))&&['fill_opacity','stroke_opacity','stroke_width'].every(key=>typeof saved[key]==='number'&&Number.isFinite(saved[key])&&saved[key]>=0&&saved[key]<8192))paint=saved;}catch{}
  if(paint)send('paint-defaults',paint);
 },[ready,layers,selected,editorVersion]);

 useEffect(()=>{const release=(event:MouseEvent)=>{const bounds=iframe.current?.getBoundingClientRect();if(bounds)send('release',{clientX:event.clientX-bounds.left,clientY:event.clientY-bounds.top});};window.addEventListener('mouseup',release);return ()=>window.removeEventListener('mouseup',release);},[]);
 useEffect(()=>{if(!playing||!screen||!project)return;previewing.current=true;const starts:number[]=[];let total=0;for(const item of project.screens){starts.push(total);total+=item.duration;}const startIndex=project.screens.findIndex(item=>item.id===screen.id),initialFrame=loopRange&&(starts[startIndex]+frame<loopRange.start||starts[startIndex]+frame>=loopRange.end)?loopRange.start:starts[startIndex]+frame,start=performance.now()-initialFrame/project.fps*1000;const evaluators=new Map(project.screens.map(item=>[item.id,createEvaluator(item)]));let lastFrame=frame,lastScreen=screen.id,request:number;const tick=(now:number)=>{let absolute=Math.floor((now-start)*project.fps/1000);if(loopRange)absolute=loopRange.start+(absolute-loopRange.start)%(loopRange.end-loopRange.start);if(loopScene){const current=(absolute-starts[startIndex])%screen.duration;if(current!==lastFrame){lastFrame=current;setFrame(current);send('preview',{screenId:screen.id,poses:evaluators.get(screen.id)!(current)});}request=requestAnimationFrame(tick);return;}if(absolute>=total){const last=project.screens.at(-1)!;const finalFrame=last.duration-1;setPlaying(false);if(lastScreen!==last.id)setScreenId(last.id);if(lastFrame!==finalFrame)setFrame(finalFrame);send('preview',{screenId:last.id,poses:evaluators.get(last.id)!(finalFrame)});return;}let low=0,high=starts.length;while(low<high){const middle=(low+high)>>1;if(starts[middle]<=absolute)low=middle+1;else high=middle;}const index=Math.max(0,low-1),active=project.screens[index],current=absolute-starts[index],changedScreen=active.id!==lastScreen;if(changedScreen){lastScreen=active.id;setScreenId(active.id);}if(current!==lastFrame||changedScreen){lastFrame=current;setFrame(current);send('preview',{screenId:active.id,poses:evaluators.get(active.id)!(current)});}request=requestAnimationFrame(tick);};request=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(request);},[playing,loopScene,loopRange]);
 useEffect(()=>{const audio=narrationAudio.current;if(!audio||!screen||!project)return;const offset=screen.narration.offset??0,duration=screen.narration.duration??screen.duration,source=screen.narration.sourceStart??0;const active=frame>=offset&&frame<offset+duration;const time=(source+Math.max(0,frame-offset))/project.fps;syncNarration(audio,audioClock.current,{key:screen.narration.timeline?`timeline:${screen.narration.mediaId}`:`${screen.id}:${screen.narration.mediaId}:${source}:${offset}`,time,playing,active,fps:project.fps},performance.now());},[playing,screen?.id,frame,screen?.narration.mediaId]);
 const togglePlayback=()=>{if(playRef.current){setPlaying(false);return;}const value=latest.current;if(!value)return;const last=value.screens.at(-1)!;if(screenRef.current===last.id&&frameRef.current>=last.duration-1){if(!loopRef.current)setScreenId(value.screens[0].id);setFrame(0);}setPlaying(true);};
 useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.defaultPrevented)return;const target=event.target as HTMLElement;if(document.querySelector('[role=dialog],[role=menu]'))return;const directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},delta=directions[event.key];if(delta&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&(target===document.body||target.closest('.canvas-area'))&&nudgeIds.current.length){event.preventDefault();event.stopImmediatePropagation();const step=event.shiftKey?10:1;void command({type:'object.nudge',screenId:screenRef.current,objectIds:nudgeIds.current,x:delta[0]*step,y:delta[1]*step});return;}const tool=toolShortcut(event);if(tool&&!document.querySelector('[role=dialog],[role=menu]')){event.preventDefault();chooseToolRef.current(tool);return;}if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())&&!target.closest('input,textarea,select,[contenteditable=true]')){event.preventDefault();void command({type:event.shiftKey||event.key.toLowerCase()==='y'?'history.redo':'history.undo'});}if(event.code==='Space'&&!target.closest('button,input:not([type=range]),textarea,select,[contenteditable=true]')){event.preventDefault();togglePlayback();}};window.addEventListener('keydown',handler);return ()=>window.removeEventListener('keydown',handler);},[]);
 const menuOffsets=project?screenOffsets(project):[],menuOffset=menuOffsets.find(entry=>entry.screen.id===screen?.id)?.start??0;
 const absoluteFrame=menuOffset+frame,markerFrames=[...(project?.timelineMarkers??[]).map(marker=>marker.frame),...menuOffsets.flatMap(({screen,start})=>screen.cues.map(cue=>start+cue.frame))].sort((a,b)=>a-b);
 const menuSelected=layers.filter(layer=>layerSelection.includes(layer.id)||layer.id===selected);
 const renderJobs=jobs.filter(job=>job.kind==='render');
 const activeExport=renderJobs.find(job=>job.status==='running');
 const latestExport=activeExport??renderJobs.at(-1);
 const menuState:MenuState={selectionCount:menuSelected.length,locked:menuSelected.some(layer=>layer.locked),canUngroup:menuSelected.length>0&&menuSelected.every(layer=>layer.type==='g'&&!layer.equationId),canPaste,canUndo:history.undo>0,canRedo:history.redo>0,textEditing,sceneIndex:Math.max(0,project?.screens.findIndex(scene=>scene.id===screen?.id)??0),sceneCount:project?.screens.length??1,mainView:allView,playing,loopScene,hasPreviousMarker:markerFrames.some(value=>value<absoluteFrame),hasNextMarker:markerFrames.some(value=>value>absoluteFrame),atStart:absoluteFrame===0,atEnd:absoluteFrame===(menuOffsets.at(-1)?.end??1)-1,scenesVisible:panels.scenes,layersVisible:panels.layers,inspectorVisible:panels.inspector,timelineVisible:panels.timeline,timelineFocused,fullscreen,exportBusy:exportChoosing||Boolean(activeExport)};
 const menuKey=JSON.stringify(menuState);
 useEffect(()=>{if(project)void window.pteron.call('menu.state',menuState).catch(error=>setError(friendlyError(error)));},[menuKey,JSON.stringify(recentProjects),Boolean(project)]);
 if(!project||!screen)return <main className="startup-status" role={error?'alert':'status'}><h1>{error?'Could not open the workspace':'Opening workspace…'}</h1>{error&&<><p>{error}</p><Button variant="outline" onClick={()=>location.reload()}>Reload interface</Button></>}</main>;
 const edit=(attributes:Record<string,string|null>)=>command({type:'object.edit',screenId:screen.id,objectId:selected,attributes});
 const putClip=(patch:Partial<Clip>)=>clip&&command({type:'clip.put',screenId:screen.id,clip:{...clip,...patch}});
 const currentLayers=layersFor===screen.id?layers:[];
 const filter=layerFilterPattern(layerQuery);
 const includedLayers=new Set<string>();
 if(filter){
  const byId=new Map(currentLayers.map(layer=>[layer.id,layer]));
  for(const layer of currentLayers){
   if(!filter.test(layer.name))continue;
   let ancestor:Layer|undefined=layer;
   while(ancestor&&!includedLayers.has(ancestor.id)){
    includedLayers.add(ancestor.id);
    ancestor=ancestor.parentId?byId.get(ancestor.parentId):undefined;
   }
  }
 }
 const childrenByParent=new Map<string|undefined,Layer[]>();
 for(const layer of currentLayers){
  if(filter&&!includedLayers.has(layer.id))continue;
  const siblings=childrenByParent.get(layer.parentId);
  if(siblings)siblings.push(layer);
  else childrenByParent.set(layer.parentId,[layer]);
 }
 const treeLayers:Layer[]=[];
 const appendLayers=(parentId?:string)=>{
  for(const layer of (childrenByParent.get(parentId)??[]).reverse()){
   treeLayers.push(layer);
   if(filter||!collapsedLayers.has(layer.id))appendLayers(layer.id);
  }
 };
 appendLayers();
 const selectedLayers=layerSelection.includes(selected)?layerSelection.filter(id=>currentLayers.some(l=>l.id===id)):[selected].filter(Boolean);
 const layerAction=async(action:string,ids=selectedLayers)=>{
  const before=new Set(currentLayers.map(l=>l.id));
  const boolean=['combine','union','subtract','intersect','exclude'].includes(action);
  const result=await command({type:boolean?'object.boolean':`object.${action}`,screenId:screen.id,...(action==='paste'?{}:{objectIds:ids}),...(boolean?{operation:action}:{})});
  if(!result)return;if(action==='copy'||action==='cut')setCanPaste(true);
  if(action==='ungroup'||boolean){const objects:Layer[]=await window.pteron.call('objects',{screenId:screen.id});const nextIds=action==='ungroup'?currentLayers.filter(layer=>ids.includes(layer.parentId??'')).map(layer=>layer.id):objects.filter(layer=>ids.includes(layer.id)).map(layer=>layer.id);setLayerSelection(nextIds);setSelected(nextIds[0]??'');setClipId('');send('select',{ids:nextIds,id:nextIds[0]});}
  if(['paste','duplicate','group'].includes(action)){
   const objects:Layer[]=await window.pteron.call('objects',{screenId:screen.id});const added=objects.filter(l=>!before.has(l.id));const roots=added.filter(l=>!l.parentId||!added.some(p=>p.id===l.parentId));
   if(roots.length){const ids=roots.map(l=>l.id);setLayerSelection(ids);setSelected(ids[0]);setClipId('');setEquationDraft(false);send('select',{ids,id:ids[0]});}
  }
 };
 const depth=(layer:Layer)=>{let n=0,p=layer.parentId;while(p&&n<30){n++;p=currentLayers.find(l=>l.id===p)?.parentId;}return n;};
 const selectedObjects=currentLayers.filter(layer=>selectedLayers.includes(layer.id));
 const multiSelection=selectedObjects.length>1;
 const shape=currentLayers.find(item=>item.id===selected);
 let equationOwner=shape;while(equationOwner&&!equationOwner.equationId&&equationOwner.parentId)equationOwner=currentLayers.find(object=>object.id===equationOwner!.parentId);
 const equation=screen.equations.find(eq=>eq.id===(equationDraft?equationDraftId:equationOwner?.equationId));
 const equationJob=jobs.slice().reverse().find(job=>job.kind==='equation'&&job.screenId===screen.id&&(!equation||job.equationId===equation.id));
 const spans=shape?layerSpans(screen,shape.id):[];
 const selectedSpan=spans.find(range=>range.id===spanId)??spans[0];
  const timingOpen=Boolean(shape&&!multiSelection&&!equationDraft);
 const putSpan=(span:LayerSpan,moveClips=false)=>shape?command({type:'layer.span.put',screenId:screen.id,objectId:shape.id,span,moveClips}):undefined;
 const inspectorOpen=Boolean(shape||equationDraft);
 const compileEquation=async(source:string,id?:string)=>{const result=await run('equation.compile',{screenId:screen.id,source,equationId:id});if(result?.equationId&&!id)setEquationDraftId(result.equationId);};
 const addEquationShape=async()=>{const id=uuid();const result=await command({type:'equation.commit',screenId:screen.id,equation:{id,source:'x^2 + y^2 = z^2',svg:defaultEquationSvg,terms:{}}});if(!result)return;const objects:SvgObject[]=await window.pteron.call('objects',{screenId:screen.id});const object=objects.find(item=>item.equationId===id);if(object){setSelected(object.id);setClipId('');setEquationDraft(false);send('select',{id:object.id});}};
 const chooseTool=(value:string)=>{previewing.current=false;setPlaying(false);send('restore');if(value==='equation'){setTab('Properties');setMode('select');send('mode',{mode:'select'});void addEquationShape();return;}setMode(value);send('mode',{mode:value});};
 chooseToolRef.current=chooseTool;
 const seek=(value:number)=>{previewing.current=true;const next=Math.max(0,Math.min(screen.duration-1,value));setPlaying(false);setFrame(next);send('preview',{screenId:screen.id,poses:evaluate(screen,next)});};
 const offsets=screenOffsets(project),offset=offsets.find(value=>value.screen.id===screen.id)!.start;
 const captionKey=(caption:typeof screen.captions[number],id=screen.id)=>caption.sourceCaptionId?`global:${caption.sourceCaptionId}`:`local:${id}:${caption.id}`;
 const captionEntries: {key:string,caption:typeof screen.captions[number],screenId?:string,offset:number}[]=allView?[...(project.timelineCaptions??[]).map(caption=>({key:`global:${caption.id}`,caption,offset:0})),...offsets.flatMap(({screen,start})=>screen.captions.filter(caption=>!caption.sourceCaptionId).map(caption=>({key:`local:${screen.id}:${caption.id}`,caption:{...caption,start:caption.start+start,end:caption.end+start},screenId:screen.id,offset:start})))]:screen.captions.map(caption=>({key:captionKey(caption),caption,screenId:screen.id,offset:0}));
 const captionEntry=captionEntries.find(entry=>entry.key===captionId)??captionEntries[0];
 const seekScreen=(id:string,value:number)=>{const target=project.screens.find(screen=>screen.id===id)!;const next=Math.max(0,Math.min(target.duration-1,value));if(id!==screen.id)pendingFocus.current={...pendingFocus.current,screenId:id,frame:next};previewing.current=true;setPlaying(false);setScreenId(id);setFrame(next);send('preview',{screenId:id,poses:evaluate(target,next)});};
 const openScene=(id:string)=>{setAllView(false);if(id!==screen.id)seekScreen(id,0);};
 const showMain=()=>{setAllView(true);};
 const localTimeline={...screen,cues:[...screen.cues.map(cue=>({...cue,id:`local:${screen.id}:${cue.id}`})),...(project.timelineMarkers??[]).filter(marker=>marker.frame>=offset&&marker.frame<offset+screen.duration).map(marker=>({...marker,frame:marker.frame-offset,review:false}))]};
 const jumpToSource=(id:string,objectId:string,value:number)=>{setAllView(false);seekScreen(id,value);pendingFocus.current={screenId:id,frame:value,objectId};setSelected(objectId);setLayerSelection([objectId]);setClipId('');setTab('Properties');};
 const timelineContext=(selection?:TimelineSelection)=><TimelineContext project={project} screen={screen} frame={frame} main={allView} onMain={showMain} onScene={()=>openScene(screen.id)} focused={timelineFocused} onToggleFocus={toggleTimelineFocus} selection={selection}/>;
 const activeMotionView=clip?motionView:'Presets';
 const selectCaption=(id:string)=>{setCaptionId(id);setActiveTimelineItem('caption');setTab('Narration');};
 const openTimelineEditor=(kind:TimelineItemKind)=>{
  setTimelineFocused(false);
  if(!panels.inspector)setPanels(current=>({...current,inspector:true}));
  setTab(kind==='clip'?'Motion':'Narration');
  if(kind==='clip')setMotionView('Clip');
  setTimelineEditorRequest(kind);
 };
 const editCaption=async(caption:typeof screen.captions[number])=>{if(!captionEntry)return;const promote=allView&&captionEntry.screenId;const id=promote&&(project.timelineCaptions??[]).some(value=>value.id===caption.id)?uuid():caption.id;const result=await command(promote?{type:'timeline.caption.promote',screenId:captionEntry.screenId,captionId:captionEntry.caption.id,caption:{...caption,id}}:captionEntry.screenId?{type:'caption.put',screenId:captionEntry.screenId,caption:{...caption,start:caption.start-captionEntry.offset,end:caption.end-captionEntry.offset}}:{type:'timeline.caption.put',caption});if(result&&promote)setCaptionId(`global:${id}`);return result;};
 const deleteCaption=()=>captionEntry&&command(captionEntry.screenId?{type:'caption.delete',screenId:captionEntry.screenId,captionId:captionEntry.caption.id}:{type:'timeline.caption.delete',captionId:captionEntry.caption.id});
 const addCaption=async()=>{const all=timelineCaptions(project);let start=offset+frame;for(const caption of all)if(caption.start<=start&&start<caption.end)start=caption.end;const next=all.find(caption=>caption.start>start);const end=Math.max(start+1,Math.min(next?.start??Infinity,start+project.fps*3));const id=uuid();const result=await command({type:'timeline.caption.put',caption:{id,start,end,text:'',draft:true}});if(result){setAllView(true);selectCaption(`global:${id}`);}};


 const menus=applicationMenus(menuState,recentProjects,Boolean(applicationInfo?.liveDevelopment));menuActionsRef.current=flattenActions(menus);
 const dispatchAction=async(id:string)=>{
  const known=flattenActions(menus).find(action=>action.id===id);if(known?.enabled===false)return;setActiveMenu('');
  if(id==='palette'){rememberFocus();setPaletteOpen(true);return;}
  if(id.startsWith('edit.')){
   const operation=id.slice(5),actual=document.activeElement===iframe.current?iframe.current?.contentDocument?.activeElement:document.activeElement;
   const focus=(actual?.nodeType===1&&actual.matches('input,textarea,[contenteditable=true]')&&!actual.closest('.command-palette')?actual as HTMLElement:actual?.closest('.application-header,.app-menu-content,.command-palette')?actionFocus.current:null);
   if(focus?.isConnected&&focus.matches('input,textarea,[contenteditable=true]')&&['undo','redo','cut','copy','paste','delete','selectAll'].includes(operation)){
    focus.focus();await window.pteron.call('text.edit',{operation});return;
   }
   if(operation==='undo'||operation==='redo'){await command({type:`history.${operation}`});return;}
   if(operation==='selectAll'){const ids=currentLayers.filter(layer=>!layer.parentId).map(layer=>layer.id);setLayerSelection(ids);setSelected(ids[0]??'');setClipId('');send('select',{ids,id:ids[0]});return;}
   await layerAction(operation==='delete'?'deleteMany':operation);return;
  }
  if(id.startsWith('align.')){await command({type:'object.alignSelection',screenId:screen.id,objectIds:selectedLayers,action:id.slice(6)});return;}
  if(id.startsWith('recent:')){const entry=recentProjects[Number(id.slice(7))];if(entry)await run('recent.open',{path:entry.path});return;}
  if(id==='recent.clear'){await run('recent.clear');return;}
  if(id==='recent.manage'){setSettings('recent');return;}
  if(id==='new'){setModal(true);return;}
  if(id==='project.settings'||id==='activity.settings'){setSettings(id.split('.')[0]==='project'?'project':'activity');return;}
  if(id.startsWith('help.')){setSettings(id);return;}
  if(id==='import.svg'){await run('import',{screenId:screen.id});return;}
  if(id==='import.audio'){await run('audio.import',{screenId:screen.id,timeline:true,start:offset+frame});return;}
  if(id==='import.srt'){const result=await run('srt.import');if(result)setAllView(true);return;}
  if(id.startsWith('scene.')){
   const index=project.screens.findIndex(scene=>scene.id===screen.id),operation=id.slice(6);
   if(operation==='rename'){setTimelineFocused(false);setPanels(value=>({...value,inspector:true}));requestAnimationFrame(()=>{const field=document.querySelector<HTMLInputElement>('.screen-name-input');field?.focus();field?.select();});return;}
   if(operation==='continue'){await layerAction('continue');return;}
   if(operation==='earlier'||operation==='later'){await command({type:'screen.move',screenId:screen.id,delta:operation==='earlier'?-1:1});return;}
   const result=await command(operation==='add'?{type:'screen.add',afterScreenId:screen.id,name:`Scene ${project.screens.length+1}`}:{type:`screen.${operation}`,screenId:screen.id});
   if(result){setAllView(false);setScreenId(result.screens[operation==='delete'?Math.min(index,result.screens.length-1):index+1].id);}return;
  }
  if(id.startsWith('view.')){
   const operation=id.slice(5);
   if(operation==='main'){setAllView(true);return;}if(operation==='scene'){setAllView(false);return;}
   if(operation==='timelineFocus'){toggleTimelineFocus();return;}
   if(['scenes','layers','inspector','timeline'].includes(operation)){setTimelineFocused(false);setPanels(value=>({...value,[operation]:!value[operation as keyof typeof value]}));return;}
   if(operation==='reset'){setTimelineFocused(false);setPanels({scenes:true,layers:true,inspector:true,timeline:true});setLeftWidth(160);setLayersWidth(180);setRightWidth(290);setTimelineHeight(220);canvasNavigation.fit();return;}
   if(operation==='zoomIn')canvasNavigation.zoomIn();else if(operation==='zoomOut')canvasNavigation.zoomOut();else if(operation==='fit')canvasNavigation.fit();else if(operation==='actual')canvasNavigation.actualSize();else if(operation==='fullscreen')await window.pteron.call('shell.action',{action:'fullscreen'});return;
  }
  if(id.startsWith('playback.')){
   const operation=id.slice(9);if(operation==='toggle'){togglePlayback();return;}if(operation==='loop'){setLoopRange(undefined);setLoopScene(value=>!value);return;}if(operation==='restart'){seekScreen(allView?project.screens[0].id:screen.id,0);return;}
   const target=operation==='previousFrame'?absoluteFrame-1:operation==='nextFrame'?absoluteFrame+1:operation==='previousMarker'?markerFrames.filter(value=>value<absoluteFrame).at(-1):markerFrames.find(value=>value>absoluteFrame);
   if(target!==undefined){const entry=offsets.find(entry=>entry.start<=target&&target<entry.end);if(entry)seekScreen(entry.screen.id,target-entry.start);}return;
  }
  if(id==='app.quit'||id.startsWith('debug.')){await window.pteron.call('shell.action',{action:id==='app.quit'?'quit':id==='debug.tools'?'tools':id==='debug.forceReload'?'forceReload':'reload'});return;}
  if(id==='render'||id==='render.draft'){
   if(exportRequest.current)return;
   exportRequest.current=true;
   setExportChoosing(true);
   try{await run('render',{quality:id==='render.draft'?'draft':'final'});}finally{exportRequest.current=false;setExportChoosing(false);}
   return;
  }
  await run(id);
 };
 actionRef.current=id=>dispatchAction(id).catch(error=>setError(friendlyError(error)));
 const importArtwork=()=>void actionRef.current('import.svg');
 const windowControl=async(action:'minimize'|'maximize'|'close')=>{try{const value=await window.pteron.call('window.control',{action});if(value){setFullscreen(value.fullscreen);setMaximized(value.maximized);}}catch(error){setError(friendlyError(error));}};

 return <div className={`app-shell ${panels.scenes?'':'hide-scenes'} ${panels.layers?'':'hide-layers'} ${panels.inspector?'':'hide-inspector'} ${panels.timeline?'':'hide-timeline'} ${timelineFocused?'timeline-focused':''}`} style={{'--left-width':`${leftWidth}px`,'--right-width':`${rightWidth}px`,'--layers-width':`${layersWidth}px`,'--timeline-height':`${timelineHeight}px`} as CSSProperties}>{screen.narration.mediaId&&<audio ref={narrationAudio} src={`data:${project.media[screen.narration.mediaId].type};base64,${project.media[screen.narration.mediaId].data}`}/>}
  <ApplicationHeader activeMenu={activeMenu} onMenuChange={setActiveMenu} name={project.name} projectId={project.id} onRename={name=>void command({type:'project.rename',name})} document={savedDocument} menus={menus} onAction={id=>void actionRef.current(id)} onCaptureFocus={rememberFocus} exportJob={latestExport} exportChoosing={exportChoosing} maximized={maximized} onWindowControl={action=>void windowControl(action)}/>
  <main className="workspace unified-inspector" aria-labelledby="workspace-heading"><h1 className="sr-only" id="workspace-heading">Pteron workspace</h1><aside className="left-panel screens-sidebar" aria-label="Scenes"><ScreensPanel all={allView} onAll={()=>{setAllView(true);setSelected('');setLayerSelection([]);setClipId('');setSpanId('');send('select',{id:''});}} project={project} activeId={screen.id} command={command} onSelect={id=>{setAllView(false);previewing.current=false;setFrame(0);setSpanId('');setPlaying(false);send('restore');setScreenId(id);setSelected('');setClipId('');}}/></aside><ResizeHandle label="Resize scenes sidebar" axis="x" value={leftWidth} min={105} max={260} onChange={setLeftWidth}/><aside className="left-panel layers-sidebar" aria-label="Layers"><DockPanel id="layers" title="Layers" collapsible={false}>
   <search className="panel-search layer-filter">
    <Icon name="search"/>
    <input ref={layerSearch} type="search" aria-label="Filter layers" placeholder="Filter layers" autoComplete="off" value={layerQuery} onChange={event=>setLayerQuery(event.target.value)} onKeyDown={event=>{
     if(event.key==='Escape'&&layerQuery){event.preventDefault();event.stopPropagation();clearLayerSearch();}
    }}/>
    {layerQuery&&<button type="button" className="search-clear" aria-label="Clear layer filter" title="Clear layer filter" onClick={clearLayerSearch}><Icon name="close"/></button>}
   </search>
   <LayerMenu background canPaste={canPaste} onAction={action=>void layerAction(action)}><div className="layers" key={screen.id} data-screen-id={screen.id}>{treeLayers.length===0&&<><p className="layer-empty" role="status">{filter&&currentLayers.length?'No matching layers':'No layers'}</p>{!filter&&!currentLayers.length&&<p className="layer-empty-hint">Draw a shape or import SVG to begin.</p>}</>}{treeLayers.map(layer=><LayerMenu key={layer.id} canPaste={canPaste} locked={layer.locked} selectionCount={selectedLayers.includes(layer.id)?selectedLayers.length:1} canContinue={project.screens.indexOf(screen)<project.screens.length-1} canUngroup={(selectedLayers.includes(layer.id)?currentLayers.filter(item=>selectedLayers.includes(item.id)):[layer]).every(item=>item.type==='g'&&!item.equationId)} onOpen={()=>{if(!selectedLayers.includes(layer.id)){setLayerSelection([layer.id]);setSelected(layer.id);setEquationDraft(false);send('select',{id:layer.id});}}} onAction={action=>void layerAction(action,selectedLayers.includes(layer.id)?selectedLayers:[layer.id])}><div onContextMenu={event=>event.stopPropagation()} className={`layer ${selectedLayers.includes(layer.id)?'active':''}`} key={layer.id} style={{'--layer-indent':`${depth(layer)*12+2}px`,paddingLeft:`${depth(layer)*12+2}px`} as CSSProperties} data-layer-id={layer.id} data-filter-context={filter&&!filter.test(layer.name)||undefined}>{filter||!childrenByParent.has(layer.id)?<span className="layer-expand-spacer" aria-hidden="true">{filter&&childrenByParent.has(layer.id)&&<Icon name="chevron"/>}</span>:<button className="layer-expand" aria-label={`${collapsedLayers.has(layer.id)?'Expand':'Collapse'} ${layer.name}`} aria-expanded={!collapsedLayers.has(layer.id)} onClick={()=>setCollapsedLayers(current=>{const next=new Set(current);if(next.has(layer.id))next.delete(layer.id);else next.add(layer.id);return next;})}><Icon name={collapsedLayers.has(layer.id)?'chevron-right':'chevron'}/></button>}<LayerLabel layer={layer} filter={filter} selected={selectedLayers.includes(layer.id)} preview={<LayerPreview svg={screen.svg} id={layer.id}/>} onSelect={event=>{setTab('Properties');setMotionView('Presets');const ids=event.ctrlKey||event.metaKey?(selectedLayers.includes(layer.id)?selectedLayers.filter(id=>id!==layer.id):[...selectedLayers,layer.id]):[layer.id];setLayerSelection(ids);setSelected(ids.includes(layer.id)?layer.id:ids[0]??'');setEquationDraft(false);send('select',{ids,id:ids[0]});}} onRename={name=>{void command({type:'object.edit',screenId:screen.id,objectId:layer.id,attributes:{'data-name':name}});}}/>{screen.links[layer.id]&&<button className="linked-badge" aria-label={`Linked ${layer.name}`} title={`Follows ${project.screens.find(scene=>scene.id===screen.links[layer.id])?.name??'source scene'}`} onClick={()=>{const source=project.screens.find(scene=>scene.id===screen.links[layer.id]);if(source)jumpToSource(source.id,layer.id,source.duration-1);}}><Icon name="link"/></button>}<button aria-label={`${layer.hidden?'Show':'Hide'} ${layer.name}`} title={layer.hidden?'Show layer':'Hide layer'} aria-pressed={!layer.hidden} onClick={()=>command({type:'object.edit',screenId:screen.id,objectId:layer.id,attributes:{display:layer.hidden?null:'none'}})}><Icon name={layer.hidden?'eye-off':'eye'}/></button><button aria-label={`${layer.locked?'Unlock':'Lock'} ${layer.name}`} title={layer.locked?'Unlock layer':'Lock layer'} aria-pressed={layer.locked} onClick={()=>command({type:'object.edit',screenId:screen.id,objectId:layer.id,attributes:{'data-locked':String(!layer.locked)}})}><Icon name={layer.locked?'lock':'unlock'}/></button></div></LayerMenu>)}</div></LayerMenu></DockPanel></aside><ResizeHandle label="Resize layers sidebar" axis="x" value={layersWidth} min={120} max={320} onChange={setLayersWidth}/>
  <section className="canvas-panel" aria-label="Artwork editor"><div className="canvas-area" tabIndex={0} aria-label="Artwork workspace" ref={canvasArea}><div className="artboard" style={{transform:`translate(${pan.x}px, ${pan.y}px)`,width:project.width*zoom,height:project.height*zoom}}><iframe title="Artwork editor" ref={iframe} src="./canvas.html" style={{width:project.width*zoom,height:project.height*zoom,backgroundColor:canvasBacking}}/>{clip&&editingMotion&&tab==='Motion'&&!playing&&<MotionOverlay screenId={screen.id} revision={project.revision} clip={clip} width={project.width} height={project.height} zoom={zoom} onChange={putClip} onError={setError}/ >}<CaptionPreview project={project} screen={screen} frame={frame} offset={offset} zoom={zoom}/></div>
  </div>
  <div className="canvas-tools" role="toolbar" aria-label="Canvas tools" aria-orientation="vertical" onKeyDown={event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}}>{canvasTools.map(({label,mode:value,key,hint})=><Button key={value} className="canvas-tool-button" aria-label={label} aria-pressed={value==='equation'?equationDraft:mode===value} hint={key?`${hint} (${key})`:hint} aria-keyshortcuts={key||undefined} variant="ghost" onClick={()=>chooseTool(value)}><Icon name={value}/></Button>)}<span className="divider"/><Button className="canvas-snap-button" aria-label="Snap artwork" hint={canvasSnap?'Artwork snapping on · Hold Alt to bypass':'Enable snapping to canvas guides and artwork'} aria-pressed={canvasSnap} variant="ghost" onClick={()=>setCanvasSnap(value=>!value)}><Icon name="snap"/></Button><Button aria-label="Import SVG" hint="Import editable artwork from an SVG file" variant="ghost" onClick={importArtwork}><Icon name="import"/></Button><span className="divider"/><Button aria-label="Undo" hint="Undo the last project edit (Ctrl+Z)" aria-keyshortcuts="Control+Z" variant="ghost" disabled={!history.undo} onClick={()=>command({type:'history.undo'})}><Icon name="undo"/></Button><Button aria-label="Redo" hint="Redo the last project edit (Ctrl+Shift+Z)" aria-keyshortcuts="Control+Shift+Z" variant="ghost" disabled={!history.redo} onClick={()=>command({type:'history.redo'})}><Icon name="redo"/></Button></div></section>
  <ResizeHandle label="Resize inspector sidebar" axis="x" value={rightWidth} min={240} max={440} invert onChange={setRightWidth}/>
  <aside className="right-panel" aria-labelledby="inspector-heading">
   <h2 className="sr-only" id="inspector-heading">Inspector</h2>
   <input className="screen-name-input" aria-label="Scene name" title="Scene name" key={screen.id+screen.name} defaultValue={screen.name} onKeyDown={event=>{
    if(event.nativeEvent.isComposing)return;
    if(event.key==='Escape'){
     event.stopPropagation();
     event.currentTarget.value=screen.name;
    }else if(event.key!=='Enter')return;
    event.currentTarget.blur();
   }} onBlur={event=>{
    if(event.currentTarget.value!==screen.name)void command({type:'screen.update',screenId:screen.id,name:event.currentTarget.value});
   }}/>
   <SegmentedControl label="Workspace panels" options={['Properties','Motion','Narration']} value={tab} onChange={setTab}/>
  <div className="sidebar-content"><div className="property-host" hidden={tab!=='Properties'}>{multiSelection?<MultiSelectionInspector objects={selectedObjects} screenId={screen.id} revision={project.revision} command={command} onAction={action=>void layerAction(action)}/>:equationDraft?<EquationEditor equation={equation} onCompile={compileEquation} busy={equationJob?.status==='running'} diagnostic={equationJob?.status==='failed'?equationJob.diagnostic:undefined}/>:shape&&<ShapeInspector onOutline={()=>command({type:'object.outline',screenId:screen.id,objectIds:[shape.id]})} onUngroup={()=>void layerAction('ungroup',[shape.id])} onAlign={direction=>send('align',{direction})} key={shape.id} object={shape} equation={equation} onChange={attributes=>command({type:'object.edit',screenId:screen.id,objectId:shape.id,attributes})} onDelete={()=>command({type:'object.delete',screenId:screen.id,objectId:shape.id})} onCompile={compileEquation} busy={equationJob?.status==='running'} diagnostic={equationJob?.status==='failed'?equationJob.diagnostic:undefined}>{timingOpen&&<ContinuityInspector project={project} screen={screen} objectId={shape!.id} command={command} onSource={jumpToSource}/ >}{equation&&<EquationTerms key={equation.id+':'+shape?.id} screen={screen} equationId={equation.id} command={command} selectedId={shape?.id}/ >}{timingOpen&&<InspectorSection title="Timing" className="timing-section"><LayerTimingInspector span={selectedSpan} spans={spans} fps={project.fps} frame={frame} onPut={putSpan} onDelete={id=>void command({type:'layer.span.delete',screenId:screen.id,objectId:shape!.id,spanId:id})} onReset={()=>void command({type:'layer.spans.reset',screenId:screen.id,objectId:shape!.id})}/></InspectorSection>}</ShapeInspector>}{!inspectorOpen&&<CanvasInspector project={project} screen={screen} command={command}/>}<SavedLibrary kind="assets" project={project} screenId={screen.id} objectIds={selectedLayers} frame={frame} command={command}/></div><div className="motion-host" hidden={tab!=='Motion'}><DockPanel id="motion" title="Motion" header={false}>
   {clip&&<SegmentedControl label="Motion view" options={['Presets','Clip']} value={activeMotionView} onChange={setMotionView}/>}
   <div className="motion-presets-view" hidden={activeMotionView!=='Presets'}><MotionLibrary savedMotion={<SavedLibrary kind="motion" project={project} screenId={screen.id} objectIds={selectedLayers} frame={frame} clip={clip} command={command}/>} activePreset={clip?.preset} visible={tab==='Motion'&&activeMotionView==='Presets'&&!timelineFocused} multiple={multiSelection} fps={project.fps} selected={Boolean(selected)} onAdd={async p=>{const defaults=await window.pteron.call('motion.defaults',{screenId:screen.id,objectIds:selectedLayers,preset:p.name}).catch(error=>{setError(friendlyError(error));return undefined;});if(!defaults)return;if(multiSelection){await command({type:'motion.apply',screenId:screen.id,objectIds:selectedLayers,start:frame,settings:{preset:p.name,...defaults}});return;}const id=uuid(),start=frame,objectId=['Match terms','Highlight terms'].includes(p.name)?equationOwner?.id??selected:selected;const target=currentLayers.find(object=>object.id!==objectId&&(p.name==='Match terms'?Boolean(object.equationId):object.parentId===currentLayers.find(item=>item.id===objectId)?.parentId));const spacing=Math.max(1,Math.round(project.fps*.1)),children=currentLayers.filter(object=>object.parentId===objectId).length;const config=p.name==='Smooth match'?{from:{x:0,y:0},to:{x:120,y:0}}:['Crossfade replacement','Match terms'].includes(p.name)?{targetObjectId:target?.id}:p.name==='Stagger'?{stagger:spacing}:{};const duration=p.name==='Stagger'?Math.max(defaults.duration,(children-1)*spacing+Math.max(1,Math.round(project.fps*.4))):defaults.duration;const result=await command({type:'clip.put',screenId:screen.id,clip:clipSchema.parse({id,objectId,preset:p.name,start,...defaults,duration,...config})});if(result){setSelected(objectId);setLayerSelection([objectId]);if(p.name==='Smooth match')setEditingMotion(true);}if(result&&screenRef.current===screen.id){setActiveTimelineItem('clip');setSpanId('');setMotionView('Clip');setClipId(id);setRevealClip(id);seek(start);}}}/></div>
   {clip&&activeMotionView==='Clip'&&<ClipInspector key={clip.id} clip={clip} fps={project.fps} screen={screen} editingCanvas={editingMotion} onEditCanvas={()=>{setEditingMotion(value=>!value);previewing.current=false;setPlaying(false);send('restore');}} onPreviewClip={()=>{setLoopRange({start:offset+clip.start,end:offset+clip.start+clip.duration});seek(clip.start);setPlaying(true);}} onChange={putClip} onDelete={()=>command({type:'clip.delete',screenId:screen.id,clipId:clip.id})} onClose={()=>setClipId('')}/>}</DockPanel></div>
  {tab==='Narration'&&<section className="inspector" aria-label="Narration and captions"><AudioTrim project={project} command={command}/>
   <div className="media-import-actions">
    <Button variant="outline" onClick={()=>run('audio.import',{screenId:screen.id,timeline:true,start:offset+frame})} aria-label="Import audio" title="Import audio">Import audio</Button>
    <Button variant="outline" onClick={async()=>{
     const result=await run('srt.import');
     if(result){setAllView(true);setSelected('');setLayerSelection([]);setClipId('');setCaptionId('');}
    }} aria-label="Import SRT" title="Import SRT">Import SRT</Button>
   </div>
   {captionEntry&&<CaptionEditor key={captionEntry.key} caption={captionEntry.caption} selected onSelect={()=>selectCaption(captionEntry.key)} onChange={editCaption} onDelete={()=>void deleteCaption()}/>}
   <div className="caption-actions">
    <Button variant="ghost" className="caption-action" aria-label="Add caption" title="Add caption" onClick={()=>void addCaption()}>Add caption</Button>
    <Button className="caption-action copy-srt" aria-label="Copy combined SRT" title="Copy combined SRT" variant="ghost" onClick={async()=>{
     const result=await run('srt');
     if(result){await navigator.clipboard.writeText(result.text);setStatus('Combined SRT copied');}
    }}>Copy SRT</Button>
    <NarrationSettings key={project.id} mix={narrationMix} style={project.captionStyle??defaultCaptionStyle} onApply={async (style,mix)=>{
     const result=await command({type:'narration.settings',style,mix});
     if(result&&screenRef.current===screen.id)seek(frame);
     return Boolean(result);
    }}/>
   </div>
  </section>}

  </div></aside></main><ResizeHandle label="Resize timeline" axis="y" value={timelineHeight} min={216} max={500} invert onChange={setTimelineHeight}/>
  {allView?<OverallTimeline loopSelection={Boolean(loopRange)} onLoopSelection={range=>{setLoopScene(false);setLoopRange(range??undefined);}} context={timelineContext} activeItem={activeTimelineItem} onEditItem={openTimelineEditor} onOpenScene={openScene} project={project} activeScreenId={screen.id} frame={frame} playing={playing} selectedLayer={selected} selectedClip={clipId} selectedSpan={spanId} revealClip={revealClip} selectedCaption={captionEntry?.key??''} onSeek={seekScreen} onSelect={(id,objectId,clip,span)=>{if(id!==screen.id)pendingFocus.current={screenId:id,frame:0,objectId,clipId:clip??'',spanId:span??''};setScreenId(id);setSelected(objectId);setLayerSelection(objectId?[objectId]:[]);if(clip!==undefined||span!==undefined||id!==screen.id){setClipId(clip??'');setSpanId(span??'');}setActiveTimelineItem(clip?'clip':undefined);setTab(clip?'Motion':'Properties');setMotionView(clip?'Clip':'Presets');send('select',{id:objectId});}} onCaption={selectCaption} onAudio={()=>{setActiveTimelineItem(undefined);setTab('Narration');}} onToggle={togglePlayback} onReset={()=>seekScreen(project.screens[0].id,0)} command={command}/>:<Timeline loopSelection={Boolean(loopRange)} onLoopSelection={range=>{setLoopScene(false);setLoopRange(range?{start:offset+range.start,end:offset+range.end}:undefined);}} context={timelineContext} activeItem={activeTimelineItem} onEditItem={openTimelineEditor} onBatch={(ids,action,frames)=>command({type:'clips.batch',items:ids.map(clipId=>({screenId:screen.id,clipId})),action,frames})} onMarkerPut={marker=>{const cue=screen.cues.find(cue=>`local:${screen.id}:${cue.id}`===marker.id);return command(cue?{type:'cue.put',screenId:screen.id,cue:{...cue,frame:marker.frame,label:marker.label}}:{type:'timeline.marker.put',marker:{...marker,frame:marker.frame+offset}});}} onMarkerDelete={markerId=>{const cue=screen.cues.find(cue=>`local:${screen.id}:${cue.id}`===markerId);return command(cue?{type:'cue.delete',screenId:screen.id,cueId:cue.id}:{type:'timeline.marker.delete',markerId});}} media={screen.narration.mediaId?project.media[screen.narration.mediaId]:undefined} selectedCaption={captionEntry?.caption.id??''} onCaption={id=>{const caption=screen.captions.find(caption=>caption.id===id);if(caption)selectCaption(captionKey(caption));}} onCaptionChange={caption=>void command({type:'caption.put',screenId:screen.id,caption})} onAudio={()=>{setActiveTimelineItem(undefined);setTab('Narration');}} selectedSpan={spanId} onSpan={(objectId,span)=>{setActiveTimelineItem(undefined);setTab('Properties');setSelected(objectId);setLayerSelection([objectId]);setClipId('');setEquationDraft(false);setSpanId(span.id);send('select',{id:objectId});}} onSpanChange={(objectId,span,moveClips)=>void command({type:'layer.span.put',screenId:screen.id,objectId,span,moveClips})} fps={project.fps} screen={localTimeline} layers={currentLayers.map(layer=>({...layer,depth:depth(layer),hasChildren:currentLayers.some(item=>item.parentId===layer.id)}))} selectedLayer={selected} frame={frame} playing={playing} selectedClip={clipId} revealClip={revealClip} onSeek={seek} onToggle={togglePlayback} onReset={()=>{previewing.current=true;setPlaying(false);setFrame(0);send('preview',{screenId:screen.id,poses:evaluate(screen,0)});}} onLayer={id=>{setActiveTimelineItem(undefined);setTab('Properties');setMotionView('Presets');setLayerSelection([id]);setSelected(id);setEquationDraft(false);send('select',{id});}} onClip={clip=>{setActiveTimelineItem('clip');setTab('Motion');setMotionView('Clip');setLayerSelection([clip.objectId]);send('select',{id:clip.objectId});setEquationDraft(false);setSpanId('');setClipId(clip.id);setSelected(clip.objectId);}} onChange={clip=>command({type:'clip.put',screenId:screen.id,clip})}/>}
  <span className="sr-only" role="status">{status}</span>{error&&<div className="workspace-error" role="alert"><p>{error}</p><button aria-label="Dismiss error" onClick={()=>setError('')}><Icon name="close"/></button></div>}
  <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} menus={menus} onAction={id=>void actionRef.current(id)}/>
  <Modal title="Recovery" className="recovery-dialog" open={settings==='recovery'} onOpenChange={open=>{if(!open)setSettings('');}}><RecoveryPreview onRestore={async(id?:string)=>{const result=await run('recover',id?{id}:{});if(result)setSettings('');return result;}}/></Modal>
  <Modal title="Recent projects" open={settings==='recent'} onOpenChange={open=>{if(!open)setSettings('');}}><div className="recent-projects">{recentWarning&&<p role="status">{recentWarning}</p>}{!recentProjects.length&&<p className="muted">No recent projects</p>}{recentProjects.map(entry=><article key={entry.path}><Button variant="ghost" className="recent-project-open" onClick={async()=>{const result=await run('recent.open',{path:entry.path});if(result)setSettings('');}}><strong>{entry.name}{entry.missing?' · Missing':''}</strong><small>{entry.path}</small></Button><Button variant="ghost" aria-label={`Remove ${entry.name} from recent projects`} onClick={()=>run('recent.remove',{path:entry.path})} title="Remove recent project"><Icon name="trash"/></Button></article>)}<Button variant="outline" onClick={async()=>{const result=await run('open');if(result)setSettings('');}}>Locate or open a project…</Button></div></Modal>
  <Modal title={settings==='help.shortcuts'?'Keyboard shortcuts':settings==='help.documentation'?'Documentation':settings==='help.diagnostics'?'Diagnostics':'About Pteron'} open={settings.startsWith('help.')} onOpenChange={open=>{if(!open)setSettings('');}}><ApplicationHelp key={settings} section={settings.slice(5)} menus={menus} info={applicationInfo} onAction={id=>void actionRef.current(id)}/></Modal>
  <Modal title="Project settings" open={settings==='project'} onOpenChange={open=>{if(!open)setSettings('');}}><label>Project name<input aria-label="Project name" key={project.id} defaultValue={project.name} onBlur={e=>{if(e.target.value!==project.name)void command({type:'project.rename',name:e.target.value});}}/></label><ProjectFormatSettings project={project} onApply={async values=>{const result=await command({type:'project.settings',...values});if(result)setSettings('');return Boolean(result);}}/></Modal>
  <Modal title="Activity and MCP" className="activity-dialog" open={settings==='activity'} onOpenChange={open=>{if(!open)setSettings('');}}>
   <ActivityPanel jobs={jobs} revision={project.revision} activity={activity} formatCommand={formatCommandName} onShowIssue={job=>{setSettings('');jumpToSource(job.screenId??'',job.objectId??'',job.frame??0);setError(job.diagnostic??'Export failed');}} onCancel={id=>void run('job.cancel',{id})} onRecovery={()=>setSettings('recovery')} onStatus={setStatus} onError={setError}/>
  </Modal>
  <CreateProjectModal open={modal} onOpenChange={setModal} onCreate={values=>void command({type:'project.create',...values})}/>
 </div>;
}













function LayerPreview({svg,id}:{svg:string,id:string}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),root=doc.documentElement,el=doc.getElementById(id);if(!el||!ref.current)return;
 for(const node of Array.from(root.querySelectorAll('*'))){if(node===el||node.contains(el)||el.contains(node)||node.closest('defs'))continue;node.remove();}
 for(let node:Element|null=el;node;node=node.parentElement){node.removeAttribute('display');node.removeAttribute('visibility');(node as SVGElement).style?.removeProperty('display');(node as SVGElement).style?.removeProperty('visibility');}
 root.removeAttribute('width');root.removeAttribute('height');ref.current.replaceChildren(document.importNode(root,true));
 const rendered=ref.current.querySelector('svg')!;try{const box=rendered.getBBox();if(box.width&&box.height)rendered.setAttribute('viewBox',`${box.x} ${box.y} ${box.width} ${box.height}`);}catch{}
 },[svg,id]);
 return <div className="layer-preview" ref={ref}/>;
}
