import {useLayoutEffect,useRef} from 'react';

/** A compact view switcher. Motion belongs to its indicator, never its content. */
export function SegmentedControl({label,options,value,onChange}:{label:string,options:readonly string[],value:string,onChange:(value:string)=>void}){
 const root=useRef<HTMLDivElement>(null);
 const indicator=useRef<HTMLSpanElement>(null);
 const move=useRef<(animate:boolean)=>void>(()=>{});
 useLayoutEffect(()=>{
  const container=root.current!,target=indicator.current!;
  move.current=(animate:boolean)=>{
   const button=container.querySelector<HTMLButtonElement>('button[aria-pressed=true]');
   if(!button)return;
   // Transforms keep the switch compositor-only; CSS retargets rapid changes.
   target.style.transitionDuration=animate?'':'0s';
   target.style.transform=`translateX(${button.offsetLeft}px) scaleX(${button.offsetWidth})`;
  };
  move.current(false);
  const resize=new ResizeObserver(()=>move.current(false));resize.observe(container);
  return ()=>resize.disconnect();
 },[]);
 useLayoutEffect(()=>move.current(true),[value]);
 return <div className="tabs" ref={root} role="group" aria-label={label}>
  <span ref={indicator} className="tabs-indicator" aria-hidden="true"/>
  {options.map((option,index)=><button key={option} data-value={option} title={option} aria-pressed={value===option} className={value===option?'active':''} onClick={()=>onChange(option)} onKeyDown={event=>{
   const next=event.key==='ArrowRight'?(index+1)%options.length:event.key==='ArrowLeft'?(index+options.length-1)%options.length:event.key==='Home'?0:event.key==='End'?options.length-1:undefined;
   if(next===undefined)return;
   event.preventDefault();onChange(options[next]);root.current?.querySelectorAll('button')[next]?.focus();
  }}>{option}</button>)}
 </div>;
}
