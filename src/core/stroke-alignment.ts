import type {Document,Element} from '@xmldom/xmldom';
import {vectorKit} from './vector-kit';
import {effectiveAttribute,shapePath,supportsStrokeAlignment} from './shape-path';

import svgpath from 'svgpath';
import {matrix,inverse} from './shape-transform';

const NS='http://www.w3.org/2000/svg';
export function appendShapePart(doc:Document,parent:Element,previous:Element[],d:string,part:string){
 const node=doc.createElementNS(NS,'path'),id=previous.find(el=>el.getAttribute('data-shape-part')===part)?.getAttribute('id')??`p_${crypto.randomUUID()}`;
 node.setAttribute('id',id);node.setAttribute('class',`pteron-id-${id.slice(2)} pteron-shape-part`);node.setAttribute('data-shape-part',part);node.setAttribute('d',d);parent.appendChild(node);return node;
}
/** Expand a doubled stroke, then keep its inside or outside half as real vectors. */
export function appendAlignedStroke(doc:Document,parent:Element,previous:Element[],outline:string,edges:string[]){
 const alignment=parent.getAttribute('data-stroke-alignment')??'center';
 if(!['inside','center','outside'].includes(alignment))throw new Error('Stroke alignment must be inside, center or outside');
 const fixed=parent.getAttribute('data-stroke-scaling')==='fixed';
 if(alignment==='center'&&!fixed){
  edges.forEach((d,index)=>appendShapePart(doc,parent,previous,d,`stroke-${index}`).setAttribute('fill','none'));return;
 }
 const raw=effectiveAttribute(parent,'stroke-width'),width=Number(raw.replace(/px$/,'')),paint=effectiveAttribute(parent,'stroke');
 if(!Number.isFinite(width)||width<0)throw new Error('Aligned stroke width must be a nonnegative number');
 if(paint.startsWith('url('))throw new Error('Stroke alignment does not support referenced stroke paints');
 if(!width||paint==='none'||!edges.length)return;
 const world=fixed?matrix(parent):null;
 const kit=vectorKit(),boundary=kit.FromSVGString(world?svgpath(outline).matrix(world).toString():outline),source=kit.FromSVGString(world?svgpath(edges.join(' ')).matrix(world).toString():edges.join(' ')),result=kit.NewPath();
 if(!boundary||!source){boundary?.delete();source?.delete();result.delete();throw new Error('Cannot align invalid path geometry');}
 const owned:any[]=[boundary,source,result];
 try{
  boundary.setFillType(effectiveAttribute(parent,'fill-rule')==='evenodd'?kit.FillType.EVENODD:kit.FillType.WINDING);
  const dash=effectiveAttribute(parent,'stroke-dasharray');let pattern=dash==='none'?[]:dash.trim().split(/[\s,]+/).map(Number);
  if(pattern.some(value=>!Number.isFinite(value)||value<0))throw new Error('Invalid stroke dash sizes');
  if(pattern.length%2)pattern=pattern.concat(pattern);
  const total=pattern.reduce((a,b)=>a+b,0),offset=Number(effectiveAttribute(parent,'stroke-dashoffset'));
  if(!Number.isFinite(offset))throw new Error('Invalid stroke dash offset');
  const stroke=(path:any)=>{if(!path.stroke({width:width*(alignment==='center'?1:2),cap:kit.StrokeCap[effectiveAttribute(parent,'stroke-linecap').toUpperCase()],join:kit.StrokeJoin[effectiveAttribute(parent,'stroke-linejoin').toUpperCase()],miter_limit:Number(effectiveAttribute(parent,'stroke-miterlimit'))})||!result.op(path,kit.PathOp.UNION))throw new Error('Cannot build aligned stroke');};
  if(!total)stroke(source);
  else{let start=0;for(let i=0;i<pattern.length;i+=2){const path=source.copy();owned.push(path);if(!path.dash(pattern[i],total-pattern[i],offset-start))throw new Error('Cannot align this dash pattern');stroke(path);start+=pattern[i]+pattern[i+1];}}
  if(alignment!=='center'&&!result.op(boundary,alignment==='inside'?kit.PathOp.INTERSECT:kit.PathOp.DIFFERENCE))throw new Error('Cannot align stroke to this shape');
  const node=appendShapePart(doc,parent,previous,world?svgpath(result.toSVGString()).matrix(inverse(world)).toString():result.toSVGString(),'stroke-0');
  node.setAttribute('fill',paint);node.setAttribute('fill-opacity',effectiveAttribute(parent,'stroke-opacity'));node.setAttribute('fill-rule','evenodd');node.setAttribute('stroke','none');
 }finally{owned.forEach(path=>path.delete());}
}

export function rebuildAlignedStroke(doc:Document,source:Element){
 const type=source.getAttribute('data-stroke-shape')||source.localName||'';
 if((source.getAttribute('data-stroke-alignment')??'center')!=='center'&&!supportsStrokeAlignment(type,source.getAttribute('d')??''))throw new Error('Inside and outside strokes require a closed shape');
 const outline=shapePath(source);let group=source;
 if(source.localName!=='g'){
  group=doc.createElementNS(NS,'g');for(const a of Array.from(source.attributes))group.setAttribute(a.name,a.value);
  group.setAttribute('data-stroke-shape',type);source.parentNode!.replaceChild(group,source);
 }
 const previous=Array.from(group.childNodes).filter(node=>node.nodeType===1) as Element[];
 while(group.firstChild)group.removeChild(group.firstChild);
 appendShapePart(doc,group,previous,outline,'fill').setAttribute('stroke','none');
 appendAlignedStroke(doc,group,previous,outline,[outline]);return group;
}
