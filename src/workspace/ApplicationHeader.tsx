import {useEffect,useRef,useState} from 'react';
import {ApplicationMenubar} from '../components/ui/menubar';
import {Modal} from '../components/ui/dialog';
import {Button} from '../components/ui/button';
import {Icon} from './Icon';
import {filterActions,flattenActions,type ActionMenu} from './application-actions';

type ExportJob = {status:string;progress:number;stale?:boolean;diagnostic?:string;phase?:string;elapsedMs?:number;remainingMs?:number};

type ApplicationHeaderProps = {
 name:string;
 projectId:string;
 onRename:(name:string)=>void;
 document:{path?:string;dirty:boolean};
 menus:ActionMenu[];
 onAction:(id:string)=>void;
 onCaptureFocus:()=>void;
 exportJob?:ExportJob;
 exportChoosing:boolean;
 activeMenu:string;
 onMenuChange:(value:string)=>void;
 maximized:boolean;
 onWindowControl:(action:'minimize'|'maximize'|'close')=>void;
};

export function ApplicationHeader({name,projectId,onRename,document,menus,onAction,onCaptureFocus,exportJob,exportChoosing,activeMenu,onMenuChange,maximized,onWindowControl}:ApplicationHeaderProps){
 const saveLabel=!document.path?'Not saved':document.dirty?'Unsaved changes':'Saved';
 const saveState=!document.path?'new':document.dirty?'dirty':'saved';
 const saveTitle=!document.path?'No save destination yet':document.dirty?'Changes are not saved':'All changes saved';
 return <header className="application-header" onDoubleClick={event=>{if((event.target as Element).closest('button,input,[role=menubar],a'))return;onWindowControl('maximize');}}>
  <img className="application-logo" src="./pteron.svg" alt="Pteron" width={24} height={24} draggable={false}/>
  <ApplicationMenubar value={activeMenu} onValueChange={onMenuChange} menus={menus} onAction={onAction} onCaptureFocus={onCaptureFocus}/>
  <div className="document-title">
   <ProjectTitle key={projectId} name={name} onRename={onRename}/>
   <span className="document-save-status" data-state={saveState} role="status" aria-label="Save status" title={saveTitle}>{saveLabel}</span>
  </div>
  <Button variant="ghost" className="palette-trigger" aria-label="Open command palette" title="Command palette (Ctrl+Shift+P)" onPointerDown={onCaptureFocus} onClick={()=>onAction('palette')}>
   <Icon name="search"/>
  </Button>
  <Button variant="outline" className="header-mcp" aria-label="Model Context Protocol (MCP) server & activity" title="Model Context Protocol (MCP) server & activity" onPointerDown={onCaptureFocus} onClick={()=>onAction('activity.settings')}>
   <Icon name="bot" style={{width:14,height:14}}/>
   <span>MCP</span>
  </Button>
  <HeaderExport job={exportJob} choosing={exportChoosing} onAction={onAction}/>
  <WindowControls maximized={maximized} onWindowControl={onWindowControl}/>
 </header>;
}

function WindowControls({maximized,onWindowControl}:{maximized:boolean;onWindowControl:(action:'minimize'|'maximize'|'close')=>void}){
 return <div className="window-controls" role="group" aria-label="Window controls">
  <button type="button" className="window-control" aria-label="Minimize window" title="Minimize" onClick={()=>onWindowControl('minimize')}><span className="window-glyph minimize" aria-hidden="true"/></button>
  <button type="button" className="window-control" aria-label={maximized?'Restore window':'Maximize window'} title={maximized?'Restore':'Maximize'} onClick={()=>onWindowControl('maximize')}><span className={`window-glyph ${maximized?'restore':'maximize'}`} aria-hidden="true"/></button>
  <button type="button" className="window-control window-close" aria-label="Close window" title="Close" onClick={()=>onWindowControl('close')}><span className="window-glyph close" aria-hidden="true"/></button>
 </div>;
}

function ProjectTitle({name,onRename}:{name:string;onRename:(name:string)=>void}){
 const [draft,setDraft]=useState<string|null>(null);
 const title=useRef<HTMLButtonElement>(null);
 const returnFocus=useRef(false);
 useEffect(()=>{
  if(draft===null&&returnFocus.current){
   returnFocus.current=false;
   title.current?.focus();
  }
 },[draft]);
 const commit=(value:string)=>{
  setDraft(null);
  const next=value.trim();
  if(next&&next!==name)onRename(next);
 };
 return draft===null
  ?<button ref={title} className="document-name" aria-label={`Rename project: ${name}`} title="Double-click to rename project" onDoubleClick={()=>setDraft(name)} onClick={event=>{if(event.detail===0)setDraft(name);}}>{name}</button>
  :<div className="document-name document-name-editor" data-name={name} data-draft={draft}><input aria-label="Project name" value={draft} autoFocus onFocus={event=>event.currentTarget.select()} onChange={event=>setDraft(event.target.value)} onBlur={event=>commit(event.currentTarget.value)} onKeyDown={event=>{
   if(event.key!=='Enter'&&event.key!=='Escape')return;
   event.preventDefault();
   event.stopPropagation();
   returnFocus.current=true;
   if(event.key==='Escape')setDraft(null);
   else commit(event.currentTarget.value);
  }}/></div>;
}

const exportOutline='M16 1H26A5 5 0 0 1 31 6V26A5 5 0 0 1 26 31H6A5 5 0 0 1 1 26V6A5 5 0 0 1 6 1Z';

function HeaderExport({job,choosing,onAction}:{job?:ExportJob;choosing:boolean;onAction:(id:string)=>void}){
 if(job?.status==='running'){
  const percentage=Math.round(job.progress*100);
  return <Button variant="outline" className="header-export export-running" aria-label="Export status" aria-description={`Exporting ${percentage}%`} title={[job.phase,job.elapsedMs!==undefined?`${Math.floor(job.elapsedMs/1000)}s`:undefined,job.remainingMs!==undefined?`~${Math.ceil(job.remainingMs/1000)}s`:undefined].filter(Boolean).join(' · ')} onClick={()=>onAction('activity.settings')}>
   <svg className="export-progress-outline" viewBox="0 0 32 32" fill="none" strokeWidth="2" aria-hidden="true">
    <path d={exportOutline}/>
    <path d={exportOutline} pathLength="1" strokeDasharray={`${job.progress} 1`}/>
   </svg>
   <progress className="sr-only" aria-label="Export progress" max={1} value={job.progress}/>
   <span aria-hidden="true">{percentage}%</span>
  </Button>;
 }
 const result=job?.status==='completed'?{icon:'check',label:job.stale?'Exported, earlier edit':'Exported'}
  :job?.status==='failed'?{icon:'warning',label:'Export failed'}
  :job?.status==='cancelled'?{icon:'close',label:'Export cancelled'}:undefined;
 return <Button className="header-export" aria-label="Export MP4" aria-description={result?.label} title={job?.diagnostic??result?.label??'Export MP4 (Ctrl+Shift+E)'} disabled={choosing} onClick={()=>onAction('render')}>
  <Icon name={result?.icon??'export'}/>
 </Button>;
}

export function CommandPalette({open,onOpenChange,menus,onAction}:{open:boolean,onOpenChange:(open:boolean)=>void,menus:ActionMenu[],onAction:(id:string)=>void}){
 const [query,setQuery]=useState(''),[index,setIndex]=useState(0);
 useEffect(()=>{if(open){setQuery('');setIndex(0);}},[open]);
 const results=filterActions(flattenActions(menus),query),enabled=results.filter(item=>item.enabled!==false),current=enabled[Math.min(index,Math.max(0,enabled.length-1))];
 useEffect(()=>{if(open&&current)document.getElementById(`palette-${current.id}`)?.scrollIntoView({block:'nearest'});},[current?.id,open]);
 const choose=(id:string)=>{onOpenChange(false);setTimeout(()=>onAction(id),0);};
 return <Modal title="Command palette" open={open} onOpenChange={onOpenChange}><div className="command-palette" onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setIndex(value=>(value+(event.key==='ArrowDown'?1:-1)+Math.max(1,enabled.length))%Math.max(1,enabled.length));}else if(event.key==='Enter'&&current){event.preventDefault();choose(current.id);}}}><input autoFocus role="combobox" aria-label="Search commands" aria-autocomplete="list" aria-expanded="true" aria-controls="palette-results" aria-activedescendant={current?`palette-${current.id}`:undefined} value={query} onChange={event=>{setQuery(event.target.value);setIndex(0);}} placeholder="Type a command…"/><div className="command-results" role="listbox" id="palette-results" aria-label="Commands">{results.map(action=><div role="option" aria-selected={current?.id===action.id} aria-disabled={action.enabled===false} id={`palette-${action.id}`} key={action.id} className="command-result" onMouseDown={event=>event.preventDefault()} onClick={()=>{if(action.enabled!==false)choose(action.id);}}><span><small>{action.category}</small>{action.label}</span>{action.shortcut&&<kbd>{action.shortcut}</kbd>}{action.enabled===false&&<small>Unavailable</small>}</div>)}{!results.length&&<p className="muted">No matching commands</p>}</div></div></Modal>;
}
