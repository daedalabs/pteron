import {useEffect,useRef,useState} from 'react';
import {Button} from '../components/ui/button';
import type {Screen} from '../core/model';
import {Icon} from './Icon';

type Caption=Screen['captions'][number];
export function CaptionEditor({caption,selected=false,onSelect,onChange,onDelete}:{caption:Caption,selected?:boolean,onSelect?:()=>void,onChange:(caption:Caption)=>Promise<unknown>,onDelete:()=>void}){
 const root=useRef<HTMLDivElement>(null);
 const [text,setText]=useState(caption.text);
 useEffect(()=>setText(caption.text),[caption.id,caption.text]);
 useEffect(()=>{if(selected)root.current?.scrollIntoView({block:'nearest'});},[selected]);
 const time=(key:'start'|'end',label:string)=><label className="caption-time"><span>{label}</span><input aria-label={`Caption ${key}`} type="number" min={key==='start'?0:caption.start+1} step={1} key={caption.id+key+caption[key]} defaultValue={caption[key]} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}} onBlur={async event=>{const input=event.currentTarget,value=input.valueAsNumber;if(!Number.isInteger(value)||value<0){input.value=String(caption[key]);return;}if(value===caption[key]&&!caption.draft)return;const result=await onChange({...caption,[key]:value,draft:false});if(!result&&input.isConnected)input.value=String(caption[key]);}}/></label>;
 return <div ref={root} className={`caption ${selected?'selected':''}`} data-caption-editor={caption.id} onFocus={onSelect}>
  <textarea aria-label="Caption text" rows={1} value={text} onChange={event=>setText(event.target.value)} onBlur={()=>{if(text!==caption.text)void onChange({...caption,text});}}/>
  <div className="caption-timing">{time('start','In')}{time('end','Out')}<span className="caption-unit" aria-hidden="true">f</span><span className="caption-draft" role={caption.draft?'status':undefined} aria-hidden={caption.draft?undefined:true} aria-label={caption.draft?'Draft caption':undefined} title={caption.draft?'Draft':undefined}><Icon name="preset"/></span><Button className="icon-button destructive-action" variant="ghost" aria-label="Delete caption" title="Delete caption" onClick={onDelete}><Icon name="trash"/></Button></div>
 </div>;
}
