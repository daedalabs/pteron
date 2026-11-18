import {useRef,useState} from 'react';
import type {SvgObject} from '../core/svg';
import type {ReactNode,MouseEvent} from 'react';
export function layerFilterPattern(query:string){
 const escaped=query.trim().replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
 return escaped?new RegExp(`(${escaped})`,'iu'):undefined;
}

export function LayerLabel({layer,selected,preview,filter,onSelect,onRename}:{layer:SvgObject,selected:boolean,preview:ReactNode,filter?:RegExp,onSelect:(event:MouseEvent)=>void,onRename:(name:string)=>void}){
 const [editing,setEditing]=useState(false);const cancelled=useRef(false);
 const parts=filter?layer.name.split(filter):[layer.name];
 const matches=parts.length>1;
 return editing?<input className="layer-label layer-rename" aria-label={`Rename ${layer.name}`} defaultValue={layer.name} autoFocus onFocus={event=>event.currentTarget.select()} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){cancelled.current=true;setEditing(false);}if(event.key==='Enter')event.currentTarget.blur();}} onBlur={event=>{const name=event.target.value.trim();if(!cancelled.current&&name&&name!==layer.name)onRename(name);setEditing(false);}}/>:<button className="layer-label" aria-label={layer.name} aria-pressed={selected} title={layer.name} onClick={onSelect} onDoubleClick={()=>{cancelled.current=false;setEditing(true);}}>{preview}<span className={matches?'layer-match-name':undefined}>
  {matches?parts.map((part,index)=>index%2?<mark key={index}>{part}</mark>:<span key={index}>{part}</span>):layer.name}
 </span></button>;
}
