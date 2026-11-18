import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import {rebuildStrokeEdges} from './stroke-edges';
import {rebuildAlignedStroke} from './stroke-alignment';
import {supportsStrokeAlignment,effectiveAttribute} from './shape-path';
import {matrix} from './shape-transform';
import { uuid } from './model';
const NS='http://www.w3.org/2000/svg';
export function parseSvg(xml:string){
 if(xml.length>10000000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('SVG declarations are unsupported');
 const doc=new DOMParser({onError:(level,message)=>{throw new Error(`Invalid SVG: ${message}`);}}).parseFromString(xml,'image/svg+xml');
 const root=doc.documentElement;
 if(!root||root.localName!=='svg'||root.namespaceURI!==NS)throw new Error('Expected SVG root');
 const elements=[root,...Array.from(root.getElementsByTagName('*'))];
 for(const el of elements){
  if(el.namespaceURI!==NS||['script','foreignObject','animate','animateTransform','set','image','a','style'].includes(el.localName??''))throw new Error(`Unsupported SVG element: ${el.localName}`);
  for(const a of Array.from(el.attributes)){
   if(/^on/i.test(a.name)||(/href$/.test(a.name)&&!a.value.startsWith('#'))||/url\(\s*['"]?(?!#)/i.test(a.value)||/javascript:|@import|expression\(/i.test(a.value))throw new Error(`Unsafe SVG attribute: ${a.name}`);
  }
 }
 return {doc,elements};
}
export function importSvg(xml:string,fresh=true){
 const {doc,elements}=parseSvg(xml),remap=new Map<string,string>(),used=new Set<string>();
 for(const el of elements){
  const old=el.getAttribute('id'),classes=(el.getAttribute('class')||'').split(/\s+/).filter(Boolean),markers=classes.filter(c=>/^pteron-id-/.test(c));
  if(markers.length>1)throw new Error('Multiple object identities');
  const key=!fresh&&markers.length?markers[0].slice(10):uuid();
  if(!/^[\w-]+$/.test(key)||used.has(key))throw new Error('Invalid or duplicate object identity');used.add(key);
  const next=`p_${key}`;if(old){if(remap.has(old))throw new Error('Duplicate SVG id');remap.set(old,next);}
  el.setAttribute('id',next);el.setAttribute('class',[...classes.filter(c=>!c.startsWith('pteron-id-')),`pteron-id-${key}`].join(' '));
 }
 for(const el of elements)for(const a of Array.from(el.attributes)){
  let v=a.value.replace(/url\(\s*(['"]?)#([^\s)'" ]+)\1\s*\)/g,(s,q,k)=>`url(#${remap.get(k)??k})`);
  if(/href$/.test(a.name)&&v.startsWith('#'))v=`#${remap.get(v.slice(1))??v.slice(1)}`;
  el.setAttribute(a.name,v);
 }
 return new XMLSerializer().serializeToString(doc);
}
export function svgObjects(xml:string){
 const labels:Record<string,string>={rect:'Rectangle',circle:'Circle',ellipse:'Ellipse',g:'Group',path:'Path',text:'Text',line:'Line',polygon:'Polygon',polyline:'Polyline'};
 const {elements}=parseSvg(xml);
 const objects=elements.filter(el=>{
  if(!Object.hasOwn(labels,el.localName??''))return false;
  if((el.getAttribute('class')??'').split(/\s+/).includes('pteron-canvas-background'))return false;
  for(let parent=el.parentNode;parent&&parent.nodeType===1;parent=parent.parentNode)if((parent as typeof el).hasAttribute('data-stroke-edges')||(parent as typeof el).hasAttribute('data-stroke-shape'))return false;
  // SVG-Edit's structural layer is not a second authored component. Keep it in
  // source, but exclude it (and definition-only geometry) from component tracks.
  if(el.localName==='g'&&(el.getAttribute('class')??'').split(/\s+/).some(value=>['layer','pteron-editor-wrapper'].includes(value)))return false;
  for(let parent=el.parentNode;parent&&parent.nodeType===1;parent=parent.parentNode)if(['defs','clipPath','mask','symbol','pattern'].includes((parent as typeof el).localName??''))return false;
  return true;
 });
 const ids=new Set(objects.map(el=>el.getAttribute('id')));
 return objects.map(el=>{let parent=el.parentNode as typeof el|null;while(parent&&!ids.has(parent.getAttribute?.('id')))parent=parent.parentNode as typeof el|null;return {parentId:parent?.getAttribute('id')??undefined,id:el.getAttribute('id')!,type:el.getAttribute('data-stroke-shape')||(el.hasAttribute('data-stroke-edges')||el.getAttribute('data-corners')?'rect':el.localName!),name:el.getAttribute('data-name')||labels[el.getAttribute('data-stroke-shape')||el.localName!]!,locked:el.getAttribute('data-locked')==='true',hidden:el.getAttribute('display')==='none',attributes:{...Object.fromEntries(Array.from(el.attributes).map(a=>[a.name,a.value])),...(el.hasAttribute('data-stroke-edges')?Object.fromEntries(['x','y','width','height','rx','ry'].map(key=>[key,el.getAttribute(`data-rect-${key}`)??'0'])):{})},text:el.localName==='text'?el.textContent??'':undefined,equationId:el.getAttribute('data-equation-id')||undefined,presentation:Object.fromEntries(['fill','stroke','fill-opacity','stroke-opacity','stroke-width'].map(key=>[key,effectiveAttribute(el,key)])),parentPaints:Object.fromEntries(['fill','stroke'].map(key=>[key,el.parentNode?.nodeType===1?effectiveAttribute(el.parentNode as typeof el,key):(key==='fill'?'#000000':'none')]))};});
}
export type SvgObject=ReturnType<typeof svgObjects>[number];
/** Replace derived equation children while retaining the authored group identity,
 * placement, properties and all group-level clips. Source remains in the record. */
export function putEquationSvg(xml:string,equationId:string,source:string,width:number,height:number){
 const {doc,elements}=parseSvg(xml);const next=parseSvg(importSvg(source)).doc.documentElement!;
 const view=(element:typeof next)=>{const values=(element.getAttribute('viewBox')??'').trim().split(/[\s,]+/).map(Number);if(values.length!==4||!values.every(Number.isFinite)||values[2]<=0||values[3]<=0)throw new Error('Compiled equation requires a valid viewBox');return values;};
 const [, , w,h]=view(next);let group=elements.find(el=>el.getAttribute('data-equation-id')===equationId);
 if(group?.getAttribute('data-locked')==='true')throw new Error('Equation is locked');
 const previous=group?.getElementsByTagName('svg')[0];
 if(previous){const oldWidth=Number(previous.getAttribute('width')),oldHeight=Number(previous.getAttribute('height')),oldX=Number(previous.getAttribute('x')),oldY=Number(previous.getAttribute('y'));if(![oldWidth,oldHeight,oldX,oldY].every(Number.isFinite)||oldWidth<=0||oldHeight<=0)throw new Error('Equation viewport placement is invalid');const nextWidth=oldHeight*w/h;next.setAttribute('x',String(oldX+oldWidth/2-nextWidth/2));next.setAttribute('y',String(oldY));next.setAttribute('width',String(nextWidth));next.setAttribute('height',String(oldHeight));}
 else{const scale=Math.min(width*.75/w,width*.075/h);next.setAttribute('x',String((width-w*scale)/2));next.setAttribute('y',String(height*.35));next.setAttribute('width',String(w*scale));next.setAttribute('height',String(h*scale));}
 if(!group){group=doc.createElementNS(NS,'g');const key=uuid();group.setAttribute('id',`p_${key}`);group.setAttribute('class',`pteron-id-${key}`);group.setAttribute('data-name','LaTeX equation');group.setAttribute('data-equation-id',equationId);doc.documentElement!.appendChild(group);}
 const fill=group.getAttribute('fill');if(fill)for(const glyph of Array.from(next.getElementsByTagName('path')))glyph.setAttribute('fill',fill);
 while(group.firstChild)group.removeChild(group.firstChild);
 group.appendChild(doc.importNode(next,true));return new XMLSerializer().serializeToString(doc);
}
export function editSvg(xml:string,objectId:string,attributes:Record<string,string|null>){
 const {doc,elements}=parseSvg(xml);let el=elements.find(el=>el.getAttribute('id')===objectId);if(!el)throw new Error('Object not found');
 if(el.getAttribute('data-locked')==='true'&&!('data-locked' in attributes))throw new Error('Object is locked');
 for(const [k,v]of Object.entries(attributes)){
  if(!['x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','d','transform','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','fill-opacity','stroke-opacity','data-corners','data-stroke-edges','data-stroke-alignment','data-stroke-scaling','data-fill-disabled-paint','data-stroke-disabled-paint','points','opacity','font-size','font-family','text-anchor','display','data-name','data-locked','textContent'].includes(k))throw new Error(`Attribute cannot be edited: ${k}`);
  if(v!==null){
   if(k==='data-stroke-alignment'&&!['inside','center','outside'].includes(v))throw new Error('Stroke alignment must be inside, center or outside');
   if(k==='data-stroke-scaling'&&!['fixed','scale'].includes(v))throw new Error('Stroke scaling must be fixed or scale');
   if(k==='data-stroke-alignment'&&v!=='center'&&!supportsStrokeAlignment(el.getAttribute('data-stroke-shape')||(el.hasAttribute('data-corners')?'rect':el.localName||''),el.getAttribute('d')??''))throw new Error('Inside and outside strokes require a closed shape');
   if(['opacity','fill-opacity','stroke-opacity'].includes(k)&&(!v.trim()||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>1))throw new Error('Alpha must be between 0 and 1');
   if(k==='data-corners'&&el.localName!=='rect'&&!el.getAttribute('data-corners')&&!el.hasAttribute('data-stroke-edges'))throw new Error('Individual corners require a rectangle');
   if(k==='stroke-linecap'&&!['butt','round','square'].includes(v))throw new Error('Invalid stroke cap');
   if(k==='stroke-linejoin'&&!['miter','round','bevel'].includes(v))throw new Error('Invalid stroke join');
   if(k==='stroke-dasharray'&&v!=='none'&&(!v.trim()||v.trim().split(/[\s,]+/).some(n=>!Number.isFinite(Number(n))||Number(n)<0)))throw new Error('Dash sizes must be finite and nonnegative');
  }
  if(k==='data-stroke-edges'&&el.localName!=='rect'&&!el.getAttribute('data-corners')&&!el.hasAttribute('data-stroke-edges'))throw new Error('Stroke edges require a rectangle');
  if(el.hasAttribute('data-stroke-edges')&&['x','y','width','height','rx','ry'].includes(k)){if(v===null)el.removeAttribute(`data-rect-${k}`);else el.setAttribute(`data-rect-${k}`,v);continue;}
  if(k==='data-stroke-edges'&&v===null){el.setAttribute(k,'top,right,bottom,left');continue;}
  if(k==='textContent'){el.textContent=v??'';continue;}if(v===null)el.removeAttribute(k);else el.setAttribute(k,v);
  if(k==='fill'&&v!==null&&el.getAttribute('data-equation-id'))for(const glyph of Array.from(el.getElementsByTagName('path')))glyph.setAttribute('fill',v);
 }
 if((el.getAttribute('data-stroke-scaling')==='fixed'||el.hasAttribute('data-stroke-alignment'))&&(el.localName==='rect'||el.hasAttribute('data-corners')))el.setAttribute('data-stroke-edges',el.getAttribute('data-stroke-edges')??'top,right,bottom,left');
 if(el.hasAttribute('data-stroke-edges'))el=rebuildStrokeEdges(doc,el);
 else if(el.hasAttribute('data-stroke-shape')||el.getAttribute('data-stroke-scaling')==='fixed'||el.hasAttribute('data-stroke-alignment'))el=rebuildAlignedStroke(doc,el);
 else if(el.getAttribute('data-corners')){
  if(!['rect','path'].includes(el.localName??''))throw new Error('Individual corners require a rectangle');
  const radii=el.getAttribute('data-corners')!.split(',').map(Number);
  if(radii.length!==4||radii.some(n=>!Number.isFinite(n)||n<0))throw new Error('Corner radii must be four nonnegative numbers');
  const x=Number(el.getAttribute('x')||0),y=Number(el.getAttribute('y')||0),w=Number(el.getAttribute('width')),h=Number(el.getAttribute('height'));
  if(![x,y,w,h].every(Number.isFinite)||w<0||h<0)throw new Error('Invalid rectangle dimensions');
  const [tl,tr,br,bl]=radii.map(r=>Math.min(r,w/2,h/2));
  if(el.localName==='rect'){const path=doc.createElementNS(NS,'path');for(const a of Array.from(el.attributes))path.setAttribute(a.name,a.value);el.parentNode!.replaceChild(path,el);el=path;}
  el.setAttribute('d',`M ${x+tl} ${y} H ${x+w-tr} A ${tr} ${tr} 0 0 1 ${x+w} ${y+tr} V ${y+h-br} A ${br} ${br} 0 0 1 ${x+w-br} ${y+h} H ${x+bl} A ${bl} ${bl} 0 0 1 ${x} ${y+h-bl} V ${y+tl} A ${tl} ${tl} 0 0 1 ${x+tl} ${y} Z`);
 }
 const result=preserveStrokeWidths(new XMLSerializer().serializeToString(doc),xml,!Object.hasOwn(attributes,'stroke-width'));parseSvg(result);return result;
}
export function appendSvg(xml:string,source:string){const {doc}=parseSvg(xml);const imported=parseSvg(importSvg(source)).doc.documentElement!;doc.documentElement!.appendChild(doc.importNode(imported,true));return new XMLSerializer().serializeToString(doc);}
export function deleteSvgObject(xml:string,objectId:string){const {doc,elements}=parseSvg(xml),el=elements.find(e=>e.getAttribute('id')===objectId);if(!el||el===doc.documentElement)throw new Error('Object not found');if(el.getAttribute('data-locked')==='true')throw new Error('Object is locked');el.parentNode!.removeChild(el);return new XMLSerializer().serializeToString(doc);}
/** A self-contained selection keeps its SVG viewport, inherited attributes and definitions. */
export function copySvgObjects(xml:string,objectIds:string[]){
 const {doc,elements}=parseSvg(xml),objects=svgObjects(xml),ids=new Set(objectIds);
 if(!ids.size||objectIds.some(id=>!objects.some(o=>o.id===id)))throw new Error('Select existing layers');
 const roots=elements.filter(el=>ids.has(el.getAttribute('id')??'')&&!elements.some(parent=>ids.has(parent.getAttribute('id')??'')&&parent!==el&&Array.from(parent.getElementsByTagName('*')).includes(el)));
 const keep=new Set(roots.flatMap(el=>[el,...Array.from(el.getElementsByTagName('*'))]));
 for(const el of elements)if(el.localName==='defs')for(const child of [el,...Array.from(el.getElementsByTagName('*'))])keep.add(child);
 for(const root of roots)for(let parent=root.parentNode;parent&&parent.nodeType===1;parent=parent.parentNode){const el=parent as typeof root;keep.add(el);if(el!==doc.documentElement){el.setAttribute('class',`${el.getAttribute('class')??''} pteron-editor-wrapper`);el.removeAttribute('data-equation-id');}}
 for(const el of [...elements].reverse())if(!keep.has(el)&&el!==doc.documentElement)el.parentNode?.removeChild(el);
 const included=new Set(elements.filter(el=>keep.has(el)).map(el=>el.getAttribute('id')));
 for(const el of elements.filter(el=>keep.has(el)))for(const a of Array.from(el.attributes)){
  const refs=[...a.value.matchAll(/url\(\s*['"]?#([^\s)'" ]+)/g)].map(m=>m[1]);if(/href$/.test(a.name)&&a.value.startsWith('#'))refs.push(a.value.slice(1));
  if(refs.some(id=>!included.has(id)))throw new Error('Selection references artwork outside the selection; copy its containing group instead');
 }
 return new XMLSerializer().serializeToString(doc);
}
export function removeSvgObjects(xml:string,objectIds:string[]){
 const {doc,elements}=parseSvg(xml),ids=new Set(objectIds);const objects=svgObjects(xml);
 if(!ids.size||objectIds.some(id=>!objects.some(o=>o.id===id)))throw new Error('Select existing layers');
 const targets=elements.filter(el=>ids.has(el.getAttribute('id')??''));
 for(const el of targets){for(let p:typeof el|null=el;p&&p.nodeType===1;p=p.parentNode as typeof el|null)if(p.getAttribute('data-locked')==='true')throw new Error('Object is locked');if(Array.from(el.getElementsByTagName('*')).some(child=>child.getAttribute('data-locked')==='true'))throw new Error('Object contains locked layers');}
 for(const el of targets)el.parentNode?.removeChild(el);
 return new XMLSerializer().serializeToString(doc);
}
export function groupSvgObjects(xml:string,objectIds:string[]){
 // Also validates locked descendants and ancestors without changing the source.
 removeSvgObjects(xml,objectIds);
 const {doc,elements}=parseSvg(xml),ids=new Set(objectIds),targets=elements.filter(el=>ids.has(el.getAttribute('id')??''));
 const parent=targets[0].parentNode!;if(targets.some(el=>el.parentNode!==parent))throw new Error('Group layers with the same parent');
 const group=doc.createElementNS(NS,'g'),key=uuid();group.setAttribute('id',`p_${key}`);group.setAttribute('class',`pteron-id-${key}`);group.setAttribute('data-name','Group');
 parent.insertBefore(group,targets.at(-1)!.nextSibling);for(const el of targets)group.appendChild(el);
 return new XMLSerializer().serializeToString(doc);
}

/** Resize only the artboard; nested SVG viewports and object coordinates stay intact. */
export function resizeSvgCanvas(xml:string,oldWidth:number,oldHeight:number,width:number,height:number){
 const {doc}=parseSvg(xml),root=doc.documentElement!;
 const viewBox=root.getAttribute('viewBox');
 if(viewBox){const values=viewBox.trim().split(/[\s,]+/).map(Number);if(values.length!==4||values.some((value,index)=>value!==[0,0,oldWidth,oldHeight][index]))throw new Error('Cannot resize a nonstandard root viewBox without changing artwork placement. Keep the current resolution.');}
 root.setAttribute('width',String(width));root.setAttribute('height',String(height));root.setAttribute('viewBox',`0 0 ${width} ${height}`);
 for(const el of Array.from(root.getElementsByTagName('rect')))if((el.getAttribute('class')??'').split(/\s+/).includes('pteron-canvas-background')){el.setAttribute('width',String(width));el.setAttribute('height',String(height));}
 return new XMLSerializer().serializeToString(doc);
}

export function canvasBackground(xml:string){
 const {elements}=parseSvg(xml);
 return elements.find(el=>(el.getAttribute('class')??'').split(/\s+/).includes('pteron-canvas-background'))?.getAttribute('fill')??'#ffffff';
}

/** A real vector background shares save, preview and export geometry, but is not a layer. */
export function setCanvasBackground(xml:string,color:string,width:number,height:number){
 const {doc,elements}=parseSvg(xml),root=doc.documentElement!;
 let background=elements.find(el=>(el.getAttribute('class')??'').split(/\s+/).includes('pteron-canvas-background'));
 if(!background){background=doc.createElementNS(NS,'rect');const key=uuid();background.setAttribute('id',`p_${key}`);background.setAttribute('class',`pteron-id-${key} pteron-canvas-background`);root.insertBefore(background,root.firstChild);}
 for(const [key,value] of Object.entries({x:'0',y:'0',width:String(width),height:String(height),fill:color,stroke:'none'}))background.setAttribute(key,value);
 return new XMLSerializer().serializeToString(doc);
}

/** Regenerate derived vector borders after parent transforms or inherited paint changes. */
export function refreshShapeStrokes(xml:string){
 const {doc,elements}=parseSvg(xml);
 for(const el of elements)if(el.hasAttribute('data-stroke-shape')){
  if(el.hasAttribute('data-stroke-edges'))rebuildStrokeEdges(doc,el);else rebuildAlignedStroke(doc,el);
 }
 return new XMLSerializer().serializeToString(doc);
}
export function preserveStrokeWidths(xml:string,previous:string,restoreWidth=true){
 const next=parseSvg(xml),old=parseSvg(previous),oldById=new Map(old.elements.map(el=>[el.getAttribute('id'),el]));
 for(const el of next.elements){
  if(!['rect','circle','ellipse','path','line','polyline','polygon'].includes(el.localName??'')||el.hasAttribute('data-shape-part'))continue;
  const before=oldById.get(el.getAttribute('id'));if(!before||effectiveAttribute(before,'stroke')==='none')continue;
  const keys=['x','y','width','height','cx','cy','r','rx','ry','x1','y1','x2','y2','d','points'];
  if(!keys.some(key=>el.getAttribute(key)!==before.getAttribute(key))&&matrix(el).every((value,i)=>value===matrix(before)[i]))continue;
  if(restoreWidth)el.setAttribute('stroke-width',effectiveAttribute(before,'stroke-width'));el.setAttribute('data-stroke-scaling','fixed');
  if(el.localName==='rect'||el.hasAttribute('data-corners')){el.setAttribute('data-stroke-edges','top,right,bottom,left');rebuildStrokeEdges(next.doc,el);}else rebuildAlignedStroke(next.doc,el);
 }
 return refreshShapeStrokes(new XMLSerializer().serializeToString(next.doc));
}

export function commitSvg(xml:string,previous:string){return preserveStrokeWidths(importSvg(xml,false),previous);}
