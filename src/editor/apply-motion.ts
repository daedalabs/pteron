import {motionTransform,type Pose} from '../core/motion';

/** Capture authored centers before hiding or transforming any relatives. */
export function applyMotion(root:SVGElement,poses:Record<string,Pose>){
 const samples=Object.entries(poses).flatMap(([id,p])=>{
  const el=root.querySelector(`[id="${CSS.escape(id)}"]`) as SVGGraphicsElement|null;if(!el)return [];
  const box=el.getBBox(),m=el.transform.baseVal.consolidate()?.matrix??new DOMMatrix(),center=new DOMPoint(box.x+box.width/2,box.y+box.height/2).matrixTransform(m);
  const painted=el.matches('path,rect,circle,ellipse,line,polygon,polyline,text')?[el]:Array.from(el.querySelectorAll<SVGGraphicsElement>('path,rect,circle,ellipse,line,polygon,polyline,text'));
  const paints=painted.map(element=>({element,fill:getComputedStyle(element).fill,stroke:getComputedStyle(element).stroke}));
  return [{el,p,center,paints,transform:el.getAttribute('transform')??'',opacity:Number(getComputedStyle(el).opacity)}];
 });
 const paint=(element:SVGElement,name:string,value:string)=>{element.setAttribute(name,value);element.style.setProperty(name,value);};
 for(const {el,p,center,paints,transform,opacity} of samples){
  if(p.visible===0){paint(el,'display','none');continue;}
  el.setAttribute('transform',motionTransform(p,center,transform));paint(el,'opacity',String(opacity*p.opacity));
  if(p.highlight>0)for(const {element,fill,stroke} of paints)for(const [name,color] of [['fill',fill],['stroke',stroke]]){const values=color.match(/^rgba?\(([^)]+)\)$/)?.[1].split(/[,\s]+/).map(Number);if(values&&values.length>=3)paint(element,name,`rgb(${[255,190,100].map((target,index)=>Math.round(values[index]*(1-p.highlight)+target*p.highlight)).join(', ')})`);}
  if(p.outline>0)for(const {element} of paints){paint(element,'stroke','#ffbe64');paint(element,'stroke-width',String(p.outline*5));}
  if(p.draw!==undefined&&p.draw<1){
   const shapes=el.matches('path,rect,circle,ellipse,line,polygon,polyline')?[el]:Array.from(el.querySelectorAll<SVGGeometryElement>('path,rect,circle,ellipse,line,polygon,polyline'));
   for(const shape of shapes){
    if(p.draw<=0){paint(shape,'display','none');continue;}
    if(!('getTotalLength' in shape))continue;
    const length=(shape as SVGGeometryElement).getTotalLength();if(!Number.isFinite(length)||length<=0)continue;
    const style=getComputedStyle(shape),fill=style.fill,stroke=style.stroke;
    if(stroke==='none'||parseFloat(style.strokeWidth)<=0){
     paint(shape,'stroke',fill==='none'?'#000000':fill);paint(shape,'stroke-width','2');
     paint(shape,'stroke-opacity',String(Math.min(1,(1-p.draw)*5)));
    }
    paint(shape,'fill-opacity',String(Number(style.fillOpacity)*Math.max(0,(p.draw-.8)/.2)));
    paint(shape,'stroke-dasharray',`${length*p.draw} ${length}`);paint(shape,'stroke-dashoffset','0');
   }
  }
 }
}
