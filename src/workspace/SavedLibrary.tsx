import {useState} from 'react';
import type {Project,Clip} from '../core/model';
import {uuid} from '../core/model';
import {Button} from '../components/ui/button';
import {Icon} from './Icon';
import {InspectorSection} from '../components/ui/inspector-section';

export function SavedLibrary({kind,project,screenId,objectIds,clip,frame,command}:{kind:'assets'|'motion',project:Project,screenId:string,objectIds:string[],clip?:Clip,frame:number,command:(command:unknown)=>Promise<unknown>}){
 const [name,setName]=useState('');
 const assets=kind==='assets',items=assets?project.assets:project.motionPresets;
 const canSave=assets?objectIds.length>0:Boolean(clip&&!clip.targetObjectId&&!clip.from&&!clip.pivot&&!clip.terms&&!['Smooth match','Match terms','Highlight terms','Crossfade replacement'].includes(clip.preset));
 return <InspectorSection title={assets?'Saved shapes':'Saved motion'} defaultOpen={false} className="saved-library">
  <form className="saved-library-capture" onSubmit={async event=>{event.preventDefault();if(!name.trim()||!canSave)return;const result=await command(assets?{type:'asset.capture',screenId,objectIds,assetId:uuid(),name:name.trim()}:{type:'motionPreset.capture',screenId,clipId:clip!.id,presetId:uuid(),name:name.trim()});if(result)setName('');}}>
   <input aria-label={assets?'Saved shape name':'Saved motion name'} placeholder="Name" maxLength={80} value={name} onChange={event=>setName(event.target.value)}/>
   <Button className="icon-button" variant="ghost" type="submit" disabled={!canSave||!name.trim()} aria-label={assets?'Save selected shapes':'Save motion settings'} title={assets?'Save selected shapes':'Save motion settings'}><Icon name="plus"/></Button>
  </form>
  <div className="saved-library-items">{items?.map(item=><div className="saved-library-row" key={item.id}>
   <Button variant="ghost" disabled={!assets&&!objectIds.length} aria-label={`${assets?'Insert':'Apply'} ${item.name}`} title={`${assets?'Insert':'Apply'} ${item.name}`} onClick={()=>void command(assets?{type:'asset.insert',screenId,assetId:item.id}:{type:'motionPreset.apply',screenId,presetId:item.id,objectIds,start:frame})}><Icon name={assets?'group':'preset'}/><span>{item.name}</span></Button>
   <Button className="icon-button" variant="ghost" aria-label={`Delete saved ${item.name}`} title={`Delete saved ${item.name}`} onClick={()=>void command(assets?{type:'asset.delete',assetId:item.id}:{type:'motionPreset.delete',presetId:item.id})}><Icon name="trash"/></Button>
  </div>)}</div>
 </InspectorSection>;
}
