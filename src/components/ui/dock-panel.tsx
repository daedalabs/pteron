import {useEffect,useState,type ReactNode} from 'react';
import {ChevronDown,ChevronRight,X} from 'lucide-react';
export function DockPanel({id,title,children,open=true,onClose,expandKey,onCollapseChange,header=true,collapsible=true}:{id:string,title:string,children:ReactNode,open?:boolean,onClose?:()=>void,expandKey?:string,onCollapseChange?:(collapsed:boolean)=>void,header?:boolean,collapsible?:boolean}){
 const [collapsed,setCollapsed]=useState(false);useEffect(()=>setCollapsed(false),[expandKey]);
 if(!open)return null;
 const isCollapsed=collapsible&&collapsed;
 const toggle=()=>setCollapsed(value=>{const next=!value;onCollapseChange?.(next);return next;});
 return <section className={`dock-panel dock-${id} ${isCollapsed?'collapsed':''}`} aria-label={`${title} panel`}>{header&&<div className="dock-heading">{collapsible?<button className="dock-title" aria-expanded={!collapsed} onClick={toggle}>{collapsed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}<span>{title}</span></button>:<span className="dock-title">{title}</span>}{onClose&&<button className="panel-close" aria-label={`Close ${title}`} onClick={onClose}><X size={16}/></button>}</div>}{!isCollapsed&&<div className="dock-content">{children}</div>}</section>;
}
