import type {Project,Screen} from '../core/model';
import {continuityRoots} from '../core/continuity';
import {Icon} from './Icon';
import {Button} from '../components/ui/button';
import {svgObjects} from '../core/svg';
import {useEffect,useState} from 'react';

export function ContinuityInspector({project,screen,objectId,command,onSource}:{project:Project,screen:Screen,objectId:string,command:(command:unknown,revision?:number)=>Promise<unknown>,onSource?:(id:string,objectId:string,frame:number)=>void}){
 const [info,setInfo]=useState<{sourceId?:string,frame:number,overrides:string[]}>();
 const [preview,setPreview]=useState<{svg:string,revision:number,sourceId:string}>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setPreview(undefined);setError('');},[screen.id,objectId,project.revision]);
 useEffect(()=>{let current=true;setInfo(undefined);void window.pteron.call('continuity.info',{screenId:screen.id,objectId}).then(value=>{if(current)setInfo(value);}).catch(()=>{});return()=>{current=false;};},[screen.id,objectId,project.revision]);
 // Artwork/history can refresh before the asynchronously loaded layer list.
 if(!svgObjects(screen.svg).some(object=>object.id===objectId))return null;
 const root=continuityRoots(screen,[objectId])[0],sourceId=screen.links[root]??screen.links[objectId];
 const source=project.screens.find(scene=>scene.id===sourceId);
 const previous=project.screens[project.screens.indexOf(screen)-1];
 const previewLink=async(sourceId:string)=>{setBusy(true);setError('');try{const result=await window.pteron.call('command.preview',{revision:project.revision,command:{type:'object.link',screenId:screen.id,sourceScreenId:sourceId,objectIds:[root]}});setPreview({svg:result.project.screens.find((scene:Screen)=>scene.id===screen.id).svg,revision:result.baseRevision,sourceId});}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy(false);}};
 const panel=<>{error&&<span role="alert" className="error">{error}</span>}{preview&&<div className="continuity-preview"><img alt="Current scene" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(screen.svg)}`}/><img alt="Follow previous scene preview" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`}/><div className="continuity-preview-actions"><Button variant="ghost" className="icon-button" aria-label="Cancel continuity preview" title="Cancel continuity preview" onClick={()=>setPreview(undefined)}><Icon name="close"/></Button><Button variant="outline" className="icon-button" aria-label="Apply scene continuity" title="Apply scene continuity" onClick={async()=>{const result=await command({type:'object.link',screenId:screen.id,sourceScreenId:preview.sourceId,objectIds:[root]},preview.revision);if(result)setPreview(undefined);}}><Icon name="check"/></Button></div></div>}</>;
 if(!source){
  if(!previous||!svgObjects(previous.svg).some(object=>object.id===root))return null;
  return <><div className="continuity-controls" aria-label="Scene continuity"><span>Independent</span><Button variant="ghost" className="icon-button" aria-label="Follow previous scene" title="Preview previous scene" disabled={busy} onClick={()=>void previewLink(previous.id)}><Icon name="link"/></Button></div>{panel}</>;
 }
 return <><div className="continuity-controls" aria-label="Scene continuity">
  <span title="Inherited properties follow this scene’s final pose. Properties edited here stay local.">Follows {source.name}</span>
  {onSource&&<Button variant="ghost" className="icon-button" aria-label="Jump to source scene" title="Jump to source scene" onClick={()=>onSource(source.id,objectId,info?.frame??source.duration-1)}><Icon name="source"/></Button>}
  <Button variant="ghost" className="icon-button" aria-label={root===objectId?'Make independent':'Make group independent'} title={root===objectId?'Keep this object and its children independent':'Keep the containing group and its children independent'} onClick={()=>void command({type:'object.unlink',screenId:screen.id,objectIds:[objectId]})}><Icon name="unlink"/></Button>
  <Button variant="ghost" className="icon-button" aria-label="Preview source pose" title="Preview source pose" disabled={busy} onClick={()=>void previewLink(source.id)}><Icon name="link"/></Button>
  {info&&<span className="continuity-overrides" aria-label="Local property overrides">{info.overrides.length?`Local overrides: ${info.overrides.join(', ')}`:'All properties follow source'}</span>}
 </div>{panel}</>;
}
