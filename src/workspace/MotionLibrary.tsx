import {useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {presetCatalog,presetsAtFps} from '../core/motion';
import {Icon} from './Icon';
import {MotionPreview} from './MotionPreview';

type Preset=(typeof presetCatalog)[number];
const categories=[...new Set(presetCatalog.map(preset=>preset.category))];

export function MotionLibrary({fps,selected,multiple=false,visible=true,activePreset,savedMotion,onAdd}:{fps:number,selected:boolean,multiple?:boolean,visible?:boolean,activePreset?:string,savedMotion:ReactNode,onAdd:(preset:Preset)=>void}){
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('All'),[preview,setPreview]=useState('');
 const search=useRef<HTMLInputElement>(null);
 const clear=()=>{setQuery('');search.current?.focus();};
 const disabledHint=multiple?'Single layer required':'Select a layer';
 const matches=presetsAtFps(fps).filter(preset=>(category==='All'||preset.category===category)&&`${preset.name} ${preset.category}`.toLowerCase().includes(query.trim().toLowerCase()));
 return <div className="motion-library">
  <div className="motion-filter"><div className="panel-search"><Icon name="search"/><input ref={search} type="search" aria-label="Search motion" placeholder="Search" autoComplete="off" spellCheck={false} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'&&query){event.preventDefault();event.stopPropagation();clear();}}}/>{query&&<button className="search-clear" aria-label="Clear motion search" title="Clear search" onClick={clear}><Icon name="close"/></button>}</div><select aria-label="Motion category" value={category} onChange={event=>setCategory(event.target.value)}><option>All</option>{categories.map(value=><option key={value} value={value}>{value==='Object transition'?'Match':value==='Entrance'?'In':value==='Exit'?'Out':value}</option>)}</select></div>
  <div className="motion-list">
   {savedMotion}
   {!selected&&matches.length>0&&<p className="motion-selection-hint">{disabledHint}</p>}
   {categories.map(category=>{const presets=matches.filter(preset=>preset.category===category);return presets.length>0&&<section className="motion-group" key={category} aria-label={category}><h3>{category}</h3><div className="preset-grid">{presets.map(preset=><span className="motion-preset" key={preset.name} title={selected?`${preset.name} · ${preset.duration}f`:disabledHint} onPointerEnter={()=>setPreview(preset.name)} onPointerLeave={()=>setPreview('')}><button data-current={activePreset===preset.name||undefined} aria-label={preset.name} aria-description={!selected?disabledHint:undefined} disabled={!selected||multiple&&['Stagger','Smooth match','Match terms','Highlight terms','Crossfade replacement'].includes(preset.name)} onFocus={()=>setPreview(preset.name)} onBlur={()=>setPreview('')} onClick={()=>onAdd(preset)}><MotionPreview visible={visible} preset={preset.name} active={visible&&preview===preset.name}/><span>{preset.name}</span></button></span>)}</div></section>;})}
   {matches.length===0&&<div className="motion-empty"><p className="motion-hint" role="status">No matching presets</p><button className="motion-reset" onClick={()=>{setCategory('All');clear();}}>Clear search</button></div>}
  </div>
 </div>;
}
