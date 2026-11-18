import {useEffect,useLayoutEffect,useState,type RefObject} from 'react';
let active:HTMLElement|null=null;
const editable=(target:EventTarget|null)=>(target as Element|null)?.nodeType===1&&!!(target as Element).closest('input,textarea,select,[contenteditable=true]');
function navigation(region:HTMLElement,zoom:(factor:number,x?:number,y?:number)=>void,reset:()=>void,scroll:(x:number,y:number)=>void,documents:Document[]=[document]){
 const activate=()=>{active=region;};
 const key=(e:KeyboardEvent)=>{if(active!==region||!e.ctrlKey||editable(e.target))return;if(['+','=','-','0'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();if(e.key==='0')reset();else zoom(e.key==='-'?1/1.2:1.2);}};
 const wheel=(e:WheelEvent)=>{activate();const unit=e.deltaMode===1?16:e.deltaMode===2?region.clientHeight:1;if(e.ctrlKey){e.preventDefault();zoom(Math.exp(-e.deltaY*unit*.002),e.clientX,e.clientY);}else if(e.shiftKey){e.preventDefault();scroll((e.deltaY||e.deltaX)*unit,0);}else if(region.classList.contains('canvas-area')){e.preventDefault();scroll(e.deltaX*unit,e.deltaY*unit);}};
 region.addEventListener('pointerenter',activate);region.addEventListener('focusin',activate);region.addEventListener('pointerdown',activate);region.addEventListener('wheel',wheel,{passive:false});
 for(const doc of documents)doc.addEventListener('keydown',key,true);
 return ()=>{region.removeEventListener('pointerenter',activate);region.removeEventListener('focusin',activate);region.removeEventListener('pointerdown',activate);region.removeEventListener('wheel',wheel);for(const doc of documents)doc.removeEventListener('keydown',key,true);};
}
export function useCanvasNavigation(area:RefObject<HTMLDivElement|null>,iframe:RefObject<HTMLIFrameElement|null>,size:{width:number,height:number},width:number,height:number){
 const [view,setView]=useState({scale:1,x:0,y:0});
 const fit=Math.max(.01,Math.min((size.width-24)/width,(size.height-24)/height,1)),zoom=fit*view.scale;
 const bound=(v:typeof view)=>{const w=width*fit*v.scale,h=height*fit*v.scale;return {...v,x:Math.max(-(size.width+w)/2+32,Math.min((size.width+w)/2-32,v.x)),y:Math.max(-(size.height+h)/2+32,Math.min((size.height+h)/2-32,v.y))};};
 useLayoutEffect(()=>setView(v=>bound(v)),[size.width,size.height,width,height]);
 useEffect(()=>{
 const region=area.current,frame=iframe.current;if(!region||!frame)return;
 let clean=()=>{};
 const install=()=>{clean();const doc=frame.contentDocument;if(!doc)return;
 const change=(factor:number,x?:number,y?:number)=>setView(v=>{const box=region.getBoundingClientRect(),scale=Math.max(.25,Math.min(16,v.scale*factor)),ratio=scale/v.scale,ax=x===undefined?0:x-box.left-size.width/2,ay=y===undefined?0:y-box.top-size.height/2;return bound({scale,x:ax-(ax-v.x)*ratio,y:ay-(ay-v.y)*ratio});});
 const scroll=(x:number,y:number)=>setView(v=>bound({...v,x:v.x-x,y:v.y-y}));
 const dispose=navigation(region,change,()=>setView({scale:1,x:0,y:0}),scroll,[document,doc]);
 const enter=()=>{active=region;};
 const wheel=(e:WheelEvent)=>{active=region;const box=frame.getBoundingClientRect(),unit=e.deltaMode===1?16:e.deltaMode===2?region.clientHeight:1;if(e.ctrlKey){e.preventDefault();change(Math.exp(-e.deltaY*unit*.002),box.left+e.clientX,box.top+e.clientY);}else if(e.shiftKey){e.preventDefault();scroll((e.deltaY||e.deltaX)*unit,0);}else{e.preventDefault();scroll(e.deltaX*unit,e.deltaY*unit);}};
 let drag:{x:number,y:number}|null=null;
 const down=(e:MouseEvent)=>{if(e.button!==1||(e.view===window&&!region.contains(e.target as Node)))return;e.preventDefault();e.stopImmediatePropagation();active=region;drag={x:e.screenX,y:e.screenY};region.dataset.panning='true';};
 const move=(e:MouseEvent)=>{if(!drag)return;e.preventDefault();e.stopImmediatePropagation();const x=e.screenX,y=e.screenY;scroll(drag.x-x,drag.y-y);drag={x,y};};
 const up=(e:MouseEvent)=>{if(!drag)return;drag=null;delete region.dataset.panning;e.preventDefault();e.stopImmediatePropagation();};
 doc.addEventListener('pointerover',enter);doc.addEventListener('wheel',wheel,{passive:false});
 for(const d of [document,doc]){d.addEventListener('mousedown',down,true);d.addEventListener('mousemove',move,true);d.addEventListener('mouseup',up,true);}
 clean=()=>{dispose();doc.removeEventListener('pointerover',enter);doc.removeEventListener('wheel',wheel);for(const d of [document,doc]){d.removeEventListener('mousedown',down,true);d.removeEventListener('mousemove',move,true);d.removeEventListener('mouseup',up,true);}};
 };install();frame.addEventListener('load',install);return ()=>{clean();frame.removeEventListener('load',install);};
 },[Boolean(area.current),size.width,size.height,width,height]);
 return {zoom,pan:{x:view.x,y:view.y},zoomIn:()=>setView(v=>bound({...v,scale:Math.min(16,v.scale*1.2)})),zoomOut:()=>setView(v=>bound({...v,scale:Math.max(.25,v.scale/1.2)})),fit:()=>setView({scale:1,x:0,y:0}),actualSize:()=>setView({scale:1/fit,x:0,y:0})};
}
export function useTimelineNavigation(ref:RefObject<HTMLDivElement|null>,id:string){
 useEffect(()=>{const region=ref.current;if(!region)return;let scale=1;const contents=()=>Array.from(region.children) as HTMLElement[];
 const apply=(next:number,x?:number)=>{const label=region.querySelector('.timeline-controls')!.getBoundingClientRect().width,base=Math.max(640,region.clientWidth),old=region.querySelector('.ruler-time')!.getBoundingClientRect().width,anchor=Math.max(0,(x??(region.getBoundingClientRect().left+label+(region.clientWidth-label)/2))-region.getBoundingClientRect().left-label),frame=(region.scrollLeft+anchor)/old;scale=next;region.classList.toggle('timeline-zoomed',scale>1.001);for(const el of contents())el.style.width=`${label+14+(base-label-14)*scale}px`;region.scrollLeft=frame*((base-label-14)*scale)-anchor;};
 const dispose=navigation(region,(factor,x)=>apply(Math.max(1,Math.min(32,scale*factor)),x),()=>{apply(1);region.scrollLeft=0;},(x,y)=>{region.scrollLeft+=x;region.scrollTop+=y;});
 const fitRange=(event:Event)=>{const {start,end,duration}=(event as CustomEvent<{start:number,end:number,duration:number}>).detail;const label=region.querySelector('.timeline-controls')!.getBoundingClientRect().width;const available=Math.max(1,region.clientWidth-label-14);const padding=Math.max(1,(end-start)*.08),left=Math.max(0,start-padding),right=Math.min(duration,end+padding);apply(Math.max(1,Math.min(32,duration/Math.max(1,right-left))));const width=region.querySelector('.ruler-time')!.getBoundingClientRect().width;region.scrollLeft=Math.max(0,left/duration*width-(available-(right-left)/duration*width)/2);};
 region.addEventListener('pteron:timeline-fit',fitRange);
 apply(1);region.scrollLeft=0;const resize=new ResizeObserver(()=>apply(scale));resize.observe(region);return ()=>{dispose();resize.disconnect();region.removeEventListener('pteron:timeline-fit',fitRange);};},[id]);
}
