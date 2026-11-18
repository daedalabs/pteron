import type {Element} from '@xmldom/xmldom';
function number(el:Element,name:string,fallback=0){const raw=el.hasAttribute('data-stroke-edges')?(el.getAttribute(`data-rect-${name}`)??el.getAttribute(name)):el.getAttribute(name);if(raw===null||raw==='')return fallback;const n=Number(raw.replace(/px$/,''));if(!Number.isFinite(n))throw new Error(`Unsupported ${name} units in selection`);return n;}
export function effectiveAttribute(el:Element,key:string):string{
 const defaults:Record<string,string>={fill:'#000000',stroke:'none','fill-opacity':'1','stroke-opacity':'1',opacity:'1','stroke-width':'1','fill-rule':'nonzero','stroke-linecap':'butt','stroke-linejoin':'miter','stroke-miterlimit':'4','stroke-dasharray':'none','stroke-dashoffset':'0'};
 for(let current:Element|null=el;current?.nodeType===1;current=current.parentNode as Element){
  const style=(current.getAttribute('style')||'').split(';').map(part=>part.split(':').map(value=>value.trim())).find(([name])=>name===key)?.[1];
  const value=style||current.getAttribute(key);if(value&&value!=='inherit')return value;if(key==='opacity')break;
 }
 return defaults[key]??'';
}
export function shapePath(el:Element):string{
 const n=(key:string,fallback=0)=>number(el,key,fallback),type=el.getAttribute('data-stroke-shape')||el.localName;
 if(type==='path')return el.getAttribute('d')||'';
 if(type==='rect'){
  const x=n('x'),y=n('y'),w=n('width'),h=n('height'),rx=Math.min(Math.max(0,n('rx',n('ry'))),w/2),ry=Math.min(Math.max(0,n('ry',n('rx'))),h/2);
  if(!rx||!ry)return `M${x} ${y}h${w}v${h}h${-w}Z`;
  return `M${x+rx} ${y}H${x+w-rx}A${rx} ${ry} 0 0 1 ${x+w} ${y+ry}V${y+h-ry}A${rx} ${ry} 0 0 1 ${x+w-rx} ${y+h}H${x+rx}A${rx} ${ry} 0 0 1 ${x} ${y+h-ry}V${y+ry}A${rx} ${ry} 0 0 1 ${x+rx} ${y}Z`;
 }
 if(type==='circle'||type==='ellipse'){const cx=n('cx'),cy=n('cy'),rx=n(type==='circle'?'r':'rx'),ry=n(type==='circle'?'r':'ry');return `M${cx-rx} ${cy}A${rx} ${ry} 0 1 0 ${cx+rx} ${cy}A${rx} ${ry} 0 1 0 ${cx-rx} ${cy}Z`;}
 if(type==='line')return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
 if(type==='polygon'||type==='polyline')return `M${el.getAttribute('points')||''}${type==='polygon'?'Z':''}`;
 throw new Error(`Selection geometry does not support ${type}; edit it individually`);
}
export function supportsStrokeAlignment(type:string,d=''){
 return ['rect','circle','ellipse','polygon'].includes(type)||(type==='path'&&d.trim().split(/(?=[Mm])/).filter(Boolean).every(part=>/[Zz]\s*$/.test(part))&&/[Zz]/.test(d));
}
