import {vectorKit} from './vector-kit';
import {rebuildAlignedStroke} from './stroke-alignment';
export {initializeGeometry} from './vector-kit';
import {effectiveAttribute,shapePath} from './shape-path';
export {effectiveAttribute} from './shape-path';
import {XMLSerializer} from '@xmldom/xmldom';
import svgpath from 'svgpath';
import {motionTransform,type Pose} from './motion';
import {parseSvg,svgObjects,removeSvgObjects,editSvg} from './svg';
type Element=ReturnType<typeof parseSvg>['elements'][number];
import {matrix,transform,mul,inverse,identity,type Matrix} from './shape-transform';
export type Bounds={x:number,y:number,width:number,height:number};
const NS='http://www.w3.org/2000/svg';


function path(el:Element,m:Matrix){
 const kit=vectorKit();
 const source=svgpath(shapePath(el));if((source as typeof source&{err?:string}).err)throw new Error('Invalid path data');
 const result=kit.FromSVGString(source.matrix(m).toString());if(!result)throw new Error('Invalid selection geometry');
 result.setFillType(effectiveAttribute(el,'fill-rule')==='evenodd'?kit.FillType.EVENODD:kit.FillType.WINDING);return result;
}
const union=(boxes:Bounds[]):Bounds=>{if(!boxes.length)throw new Error('Selection has no measurable geometry');const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};};
export type TextMeasurements=Record<string,Bounds>;
export function motionGeometry(xml:string,id:string,measurements:TextMeasurements={}){
 const parsed=parseSvg(xml),el=parsed.elements.find(node=>node.getAttribute('id')===id);if(!el)throw new Error('Object not found');
 const box=bounds(el,measurements,inverse(matrix(el))),own=transform(el.getAttribute('transform')||''),x=box.x+box.width/2,y=box.y+box.height/2;
 return {bounds:bounds(el,measurements),parentMatrix:matrix(el.parentNode as Element),parentCenter:{x:own[0]*x+own[2]*y+own[4],y:own[1]*x+own[3]*y+own[5]}};
}
function bounds(el:Element,measurements:TextMeasurements={},space:Matrix=identity):Bounds{
 if(el.localName==='text'){const b=measurements[el.getAttribute('id')||''];if(!b)throw new Error('Text bounds are unavailable; edit appearance or try selecting again');const m=mul(space,matrix(el)),points=[[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]].map(([x,y])=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5],width:0,height:0}));return union(points);}
 if(['g','svg'].includes(el.localName||'')&&!el.hasAttribute('data-stroke-shape'))return union(Array.from(el.childNodes).filter(node=>node.nodeType===1&&!['defs','title','desc','metadata'].includes((node as Element).localName||'')).map(child=>bounds(child as Element,measurements,space)));
 const p=path(el,mul(space,matrix(el)));try{const b=p.computeTightBounds();return {x:b.fLeft,y:b.fTop,width:b.fRight-b.fLeft,height:b.fBottom-b.fTop};}finally{p.delete();}
}
function selection(xml:string,objectIds:string[],editable=false){
 const parsed=parseSvg(xml),ids=new Set(objectIds),objects=svgObjects(xml);
 if(!ids.size||objectIds.some(id=>!objects.some(object=>object.id===id)))throw new Error('Select existing layers');
 const all=parsed.elements.filter(el=>ids.has(el.getAttribute('id')||''));
 const targets=all.filter(el=>!all.some(parent=>parent!==el&&isAncestor(parent,el)));
 if(editable)removeSvgObjects(xml,targets.map(el=>el.getAttribute('id')!));
 return {...parsed,targets};
}
function isAncestor(parent:Element,child:Element){for(let el=child.parentNode;el?.nodeType===1;el=el.parentNode)if(el===parent)return true;return false;}
export function selectionInfo(xml:string,ids:string[],measurements:TextMeasurements={}){
 const {targets}=selection(xml,ids);let box:Bounds|undefined,geometryError:string|undefined;
 try{box=union(targets.map(el=>bounds(el,measurements)));}catch(error){geometryError=(error as Error).message;}
 const keys=['fill','stroke','fill-opacity','stroke-opacity','stroke-width','opacity','data-fill-disabled-paint','data-stroke-disabled-paint'];
 const attributes=Object.fromEntries(keys.map(key=>{const values=targets.map(el=>effectiveAttribute(el,key));return [key,values.every(value=>value===values[0])?values[0]:null];}));
 let locked=false;try{removeSvgObjects(xml,ids);}catch{locked=true;}
 return {bounds:box,geometryError,attributes,locked};
}
export function editSelection(xml:string,ids:string[],attributes:Record<string,string|null>){
 const {targets}=selection(xml,ids,true);let result=xml;
 const allowed=['fill','stroke','fill-opacity','stroke-opacity','stroke-width','opacity','stroke-linecap','stroke-linejoin','stroke-dasharray','data-stroke-edges','data-stroke-alignment','data-fill-disabled-paint','data-stroke-disabled-paint'];
 if(Object.keys(attributes).some(key=>!allowed.includes(key)))throw new Error('This property cannot be edited across a selection');
 for(const el of targets){if(Object.keys(attributes).some(key=>new RegExp(`(?:^|;)\\s*${key}\\s*:`).test(el.getAttribute('style')||'')))throw new Error('Inline styling overrides a selected property. Remove that inline style before applying a shared value.');const patch={...attributes};for(const paint of ['fill','stroke']){const key=`data-${paint}-disabled-paint`;if(patch[paint]==='none'&&patch[key]!==undefined)patch[key]=el.getAttribute(paint)??'inherit';else if(patch[key]===null&&patch[paint]!==undefined&&el.getAttribute(key))patch[paint]=el.getAttribute(key);}result=editSvg(result,el.getAttribute('id')!,patch);}return result;
}
function applyWorld(el:Element,world:Matrix){const parent=matrix(el.parentNode as Element);const local=mul(mul(mul(inverse(parent),world),parent),transform(el.getAttribute('transform')||''));el.setAttribute('transform',`matrix(${local.join(' ')})`);}
export function nudgeSelection(xml:string,ids:string[],x:number,y:number){
 const {doc,targets}=selection(xml,ids,true);targets.forEach(el=>applyWorld(el,[1,0,0,1,x,y]));return new XMLSerializer().serializeToString(doc);
}
export function transformSelection(xml:string,ids:string[],patch:Partial<Bounds>,measurements:TextMeasurements={}){
 const {doc,targets}=selection(xml,ids,true),box=union(targets.map(el=>bounds(el,measurements)));
 const sx=patch.width===undefined?1:patch.width/box.width,sy=patch.height===undefined?1:patch.height/box.height;
 if(![sx,sy].every(Number.isFinite)||sx<=0||sy<=0)throw new Error('Selection dimensions must be positive; zero-size selections can only move');
 const world:Matrix=[sx,0,0,sy,(patch.x??box.x)-box.x*sx,(patch.y??box.y)-box.y*sy];
 targets.forEach(el=>applyWorld(el,world));return new XMLSerializer().serializeToString(doc);
}
export function alignSelection(xml:string,ids:string[],action:string,measurements:TextMeasurements={}){
 const {doc,targets}=selection(xml,ids,true);if(targets.length<2)throw new Error('Select at least two separate layers');
 const items=targets.map(el=>({el,box:bounds(el,measurements)})),box=union(items.map(item=>item.box));
 if(action.startsWith('distribute')){
  if(items.length<3)throw new Error('Select at least three layers to distribute');
  const horizontal=action==='distribute-x',position=horizontal?'x':'y',size=horizontal?'width':'height';items.sort((a,b)=>a.box[position]-b.box[position]);
  const first=items[0].box,last=items.at(-1)!.box,gap=(last[position]+last[size]-first[position]-items.reduce((sum,item)=>sum+item.box[size],0))/(items.length-1);let cursor=first[position];
  for(const {el,box:b} of items){const delta=cursor-b[position];applyWorld(el,[1,0,0,1,horizontal?delta:0,horizontal?0:delta]);cursor+=b[size]+gap;}
 }else for(const {el,box:b} of items){const dx=action==='left'?box.x-b.x:action==='center'?box.x+box.width/2-b.x-b.width/2:action==='right'?box.x+box.width-b.x-b.width:0,dy=action==='top'?box.y-b.y:action==='middle'?box.y+box.height/2-b.y-b.height/2:action==='bottom'?box.y+box.height-b.y-b.height:0;applyWorld(el,[1,0,0,1,dx,dy]);}
 return new XMLSerializer().serializeToString(doc);
}
export function assertNoReferences(xml:string,removed:string[]){const ids=new Set(removed);for(const el of parseSvg(xml).elements)if(!ids.has(el.getAttribute('id')||''))for(const attribute of Array.from(el.attributes)){if(/href$/.test(attribute.name)&&ids.has(attribute.value.slice(1))||[...attribute.value.matchAll(/url\(\s*['"]?#([^)'"\s]+)/g)].some(match=>ids.has(match[1])))throw new Error('A selected layer is referenced by other artwork. Keep it separate or group it.');}}
export function ungroupSelection(xml:string,ids:string[]){
 const {doc,targets}=selection(xml,ids,true);assertNoReferences(xml,targets.map(el=>el.getAttribute('id')!));
 for(const group of targets){
  if(group.localName!=='g'||group.hasAttribute('data-equation-id'))throw new Error('Select ordinary groups to ungroup');
  const unsupported=Array.from(group.attributes).find(attribute=>!['id','class','data-name','transform','fill','stroke','fill-opacity','stroke-opacity','stroke-width','fill-rule','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','opacity','display','visibility','font-family','font-size','text-anchor'].includes(attribute.name));
  if(unsupported)throw new Error(`Cannot ungroup without losing ${unsupported.name}`);
  const children=Array.from(group.childNodes).filter(node=>node.nodeType===1) as Element[];
  if(Number(group.getAttribute('opacity')??1)!==1)throw new Error('Restore group opacity to 1 before ungrouping to preserve compositing');
  for(const child of children){
   for(const attribute of Array.from(group.attributes))if(!['id','class','data-name','transform','opacity'].includes(attribute.name)&&(!child.hasAttribute(attribute.name)||child.getAttribute(attribute.name)==='inherit'))child.setAttribute(attribute.name,attribute.value);
   if(group.getAttribute('display')==='none')child.setAttribute('display','none');
   if(group.hasAttribute('transform'))child.setAttribute('transform',`${group.getAttribute('transform')} ${child.getAttribute('transform')||''}`.trim());
   group.parentNode!.insertBefore(child,group);
  }
  group.parentNode!.removeChild(group);
 }
 return new XMLSerializer().serializeToString(doc);
}
export function combineSelection(xml:string,ids:string[],operation:string){
 const kit=vectorKit();
 const {doc,targets}=selection(xml,ids,true);if(targets.length<2)throw new Error('Select at least two shapes');
 const parent=targets[0].parentNode;if(targets.some(el=>el.parentNode!==parent))throw new Error('Combine shapes with the same parent');
 const paintKeys=['fill','stroke','fill-opacity','stroke-opacity','stroke-width','opacity','fill-rule','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset'];
 for(const el of targets){
  if(el.hasAttribute('data-equation-id')||!['rect','circle','ellipse','path','polygon','polyline','line'].includes(el.getAttribute('data-stroke-shape')||el.localName||''))throw new Error('Combine individual vector shapes; ungroup ordinary groups first');
  const supported=['id','class','data-name','data-corners','d','x','y','width','height','rx','ry','cx','cy','r','x1','y1','x2','y2','points','transform','data-stroke-shape','data-stroke-scaling','data-stroke-alignment','data-stroke-edges','data-rect-x','data-rect-y','data-rect-width','data-rect-height','data-rect-rx','data-rect-ry','data-fill-disabled-paint','data-stroke-disabled-paint',...paintKeys];
  const unsupported=Array.from(el.attributes).find(attribute=>!supported.includes(attribute.name));if(unsupported)throw new Error(`Cannot combine a shape with ${unsupported.name}; its artwork is unchanged`);
  if(el.hasAttribute('data-stroke-edges')&&el.getAttribute('data-stroke-edges')!=='top,right,bottom,left'&&effectiveAttribute(el,'stroke')!=='none')throw new Error('Restore all border sides before combining shapes');
  if(effectiveAttribute(el,'stroke')!=='none'&&el.getAttribute('data-stroke-scaling')!=='fixed'){const t=transform(el.getAttribute('transform')||'');if(t.slice(0,4).some((value,index)=>Math.abs(value-identity[index])>1e-8))throw new Error('Combining transformed strokes would change their width. Group these shapes instead.');}
  if(operation!=='combine'&&effectiveAttribute(el,'fill')==='none')throw new Error('Boolean operations require filled shapes; use Combine paths for stroke paths');
 }
 const base=targets[0],removed=targets.slice(1).map(el=>el.getAttribute('id')!);assertNoReferences(xml,removed);
 if(operation==='combine'&&targets.some(el=>['opacity','fill-opacity','stroke-opacity'].some(key=>Number(effectiveAttribute(el,key))!==1)||['fill','stroke'].some(key=>effectiveAttribute(el,key).includes('url('))))throw new Error('Combine paths cannot preserve translucent or referenced paints. Group these shapes instead.');
 if(operation==='combine'&&targets.some(el=>paintKeys.some(key=>effectiveAttribute(el,key)!==effectiveAttribute(base,key))))throw new Error('Combine paths requires matching appearance. Use Group to retain different styles.');
 const paths:any[]=[];let result:any;
 try{
  for(const el of targets)paths.push(path(el,transform(el.getAttribute('transform')||'')));
  result=paths[0].copy();
  for(const next of paths.slice(1)){if(operation==='combine')result.addPath(next);else if(!result.op(next,({union:kit.PathOp.UNION,subtract:kit.PathOp.DIFFERENCE,intersect:kit.PathOp.INTERSECT,exclude:kit.PathOp.XOR} as Record<string,unknown>)[operation]))throw new Error('Vector operation could not resolve these shapes');}
  const d=result.toSVGString();if(!d.trim())throw new Error('The operation produces an empty shape; artwork is unchanged');
  const output=doc.createElementNS(NS,'path');
  for(const attribute of Array.from(base.attributes))if(['id','class','data-name'].includes(attribute.name))output.setAttribute(attribute.name,attribute.value);
  for(const key of paintKeys)output.setAttribute(key,effectiveAttribute(base,key));for(const key of ['data-stroke-scaling','data-stroke-alignment','data-fill-disabled-paint','data-stroke-disabled-paint'])if(base.hasAttribute(key))output.setAttribute(key,base.getAttribute(key)!);output.setAttribute('fill-rule',result.getFillTypeString()==='evenodd'?'evenodd':'nonzero');output.setAttribute('d',d);
  parent!.insertBefore(output,targets.at(-1)!.nextSibling);targets.forEach(el=>parent!.removeChild(el));if(output.getAttribute('data-stroke-scaling')==='fixed'||output.hasAttribute('data-stroke-alignment'))rebuildAlignedStroke(doc,output);return new XMLSerializer().serializeToString(doc);
 }finally{result?.delete();paths.forEach(p=>p.delete());}
}

/** Bake the same sampled poses used by Chromium preview into editable SVG. */
export function bakeMotionSvg(xml:string,poses:Record<string,Pose>,measurements:TextMeasurements={}){
 const {doc,elements}=parseSvg(xml);
 const samples=elements.flatMap(el=>{const p=poses[el.getAttribute('id')||''];if(!p)return [];let center={x:0,y:0};
  if(p.visible!==0&&(p.x||p.y||p.rotation||p.scaleX!==1||p.scaleY!==1)){const box=bounds(el,measurements,inverse(matrix(el))),m=transform(el.getAttribute('transform')||''),x=box.x+box.width/2,y=box.y+box.height/2;center={x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]};}
  return [{el,p,center,base:el.getAttribute('transform')||''}];
 });
 for(const {el,p,center,base} of samples){
  if(p.visible===0){el.setAttribute('display','none');continue;}
  if(p.x||p.y||p.rotation||p.scaleX!==1||p.scaleY!==1)el.setAttribute('transform',motionTransform(p,center,base));
  if(p.opacity!==1)el.setAttribute('opacity',String(Number(el.getAttribute('opacity')??1)*p.opacity));
  if(p.highlight>0)el.setAttribute('fill',`rgb(${Math.round(255*p.highlight)} ${Math.round(190*p.highlight)} 100)`);
  if(p.outline>0){el.setAttribute('stroke','#ffbe64');el.setAttribute('stroke-width',String(p.outline*5));}
 }
 return new XMLSerializer().serializeToString(doc);
}
