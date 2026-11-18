import type {Element,Document} from '@xmldom/xmldom';
import {appendAlignedStroke,appendShapePart} from './stroke-alignment';
const NS='http://www.w3.org/2000/svg';
export const rectangleEdges=['top','right','bottom','left'] as const;
export function rebuildStrokeEdges(doc:Document,source:Element):Element{
 const selected=(source.getAttribute('data-stroke-edges')??rectangleEdges.join(',')).split(',').filter(Boolean);
 if(new Set(selected).size!==selected.length||selected.some(edge=>!rectangleEdges.includes(edge as typeof rectangleEdges[number])))throw new Error('Stroke edges must be top, right, bottom or left');
 const n=(key:string,fallback=0)=>Number(source.getAttribute(`data-rect-${key}`)??source.getAttribute(key)??fallback);
 const x=n('x'),y=n('y'),w=n('width'),h=n('height');if(![x,y,w,h].every(Number.isFinite)||w<0||h<0)throw new Error('Invalid rectangle dimensions');
 const individual=source.getAttribute('data-corners')?.split(',').map(Number);
 if(individual&&(individual.length!==4||individual.some(value=>!Number.isFinite(value)||value<0)))throw new Error('Invalid rectangle corners');
 const rx=n('rx',n('ry')),ry=n('ry',n('rx'));if(![rx,ry].every(Number.isFinite)||rx<0||ry<0)throw new Error('Invalid corner radius');
 const radii=Array.from({length:4},(_,i)=>[Math.min(individual?.[i]??rx,w/2),Math.min(individual?.[i]??ry,h/2)]);
 const centers=[[x+radii[0][0],y+radii[0][1]],[x+w-radii[1][0],y+radii[1][1]],[x+w-radii[2][0],y+h-radii[2][1]],[x+radii[3][0],y+h-radii[3][1]]];
 const point=(corner:number,angle:number)=>{const a=angle*Math.PI/180;return `${centers[corner][0]+radii[corner][0]*Math.cos(a)} ${centers[corner][1]+radii[corner][1]*Math.sin(a)}`;};
 const arc=(corner:number,angle:number)=>radii[corner].every(value=>value>0)?`A${radii[corner][0]} ${radii[corner][1]} 0 0 1 ${point(corner,angle)}`:`L${point(corner,angle)}`;
 const pieces=rectangleEdges.map((_,i)=>{const start=i,end=(i+1)%4,a=225+i*90;return `M${point(start,a)} ${arc(start,a+45)} L${point(end,a+45)} ${arc(end,a+90)}`;});
 const outline=pieces.map((piece,index)=>index?piece.replace(/^M[^A|L]+/,''):piece).join(' ')+'Z';
 const groups:string[]=[];
 if(selected.length===4)groups.push(outline);
 else for(let i=0;i<4;i++)if(selected.includes(rectangleEdges[i])&&!selected.includes(rectangleEdges[(i+3)%4])){let d=pieces[i],j=(i+1)%4;while(j!==i&&selected.includes(rectangleEdges[j])){d+=' '+pieces[j].replace(/^M[^A|L]+/,'');j=(j+1)%4;}groups.push(d);}
 let group=source;
 if(source.localName!=='g'){
  group=doc.createElementNS(NS,'g');for(const attribute of Array.from(source.attributes))if(!['d','x','y','width','height','rx','ry'].includes(attribute.name))group.setAttribute(attribute.name,attribute.value);
  source.parentNode!.replaceChild(group,source);
 }
 group.setAttribute('data-stroke-shape','rect');
 for(const key of ['x','y','width','height','rx','ry'])group.setAttribute(`data-rect-${key}`,String(key==='rx'?rx:key==='ry'?ry:n(key)));
 const previous=Array.from(group.childNodes).filter(node=>node.nodeType===1) as Element[];
 while(group.firstChild)group.removeChild(group.firstChild);
 appendShapePart(doc,group,previous,outline,'fill').setAttribute('stroke','none');
 appendAlignedStroke(doc,group,previous,outline,groups);
 return group;
}
