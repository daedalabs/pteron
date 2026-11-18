import {XMLSerializer} from '@xmldom/xmldom';
import type {Project,Screen} from './model';
import {continueScreen,continuityRoots} from './continuity';
import {copySvgObjects,parseSvg,removeSvgObjects,svgObjects} from './svg';
import type {TextMeasurements} from './selection';

/** Carry editable objects into an existing scene, retaining identity and local clips. */
export function carryObjects(project:Project,source:Screen,destination:Screen,objectIds:string[],measurements:TextMeasurements={}){
 if(project.screens.indexOf(source)>=project.screens.indexOf(destination))throw new Error('Continuity must follow an earlier scene');
 const roots=continuityRoots(source,objectIds),final=continueScreen(project,source,source.name,measurements);
 const available=new Set(svgObjects(final.svg).map(object=>object.id));
 if(roots.some(id=>!available.has(id)))throw new Error('The selected object is hidden at the end of its source scene');
 const payload=copySvgObjects(final.svg,roots),objects=svgObjects(payload),ids=new Set(objects.map(object=>object.id));
 const target=parseSvg(destination.svg),existing=new Map(target.elements.map(node=>[node.getAttribute('id'),node]));
 for(const id of roots){
  const node=existing.get(id);if(!node)continue;
  removeSvgObjects(destination.svg,[id]); // Validate locks without mutating state.
  const descendants=new Set([node,...Array.from(node.getElementsByTagName('*'))].map(child=>child.getAttribute('id')));
  if(svgObjects(destination.svg).some(object=>descendants.has(object.id)&&!ids.has(object.id)))throw new Error('This group contains additional local artwork. Keep it independent to preserve those layers.');
  node.parentNode!.removeChild(node);for(const child of [node,...Array.from(node.getElementsByTagName('*'))])existing.delete(child.getAttribute('id'));
 }
 type Element=typeof target.elements[number];
 const children=(node:Element)=>Array.from(node.childNodes).filter(child=>child.nodeType===1) as Element[];
 const appearance=(node:Element)=>JSON.stringify(Array.from(node.attributes).filter(attribute=>!['id','class'].includes(attribute.name)).map(attribute=>[attribute.name,attribute.value]).sort());
 const insert=(node:Element,parent:Element)=>{
  const id=node.getAttribute('id'),current=id?existing.get(id):undefined;
  if(current){
   if(ids.has(id!)||current.localName!==node.localName||appearance(current)!==appearance(node))throw new Error('The scenes have different shared viewport or definition edits. Keep these objects independent or add a new scene.');
   if(current.parentNode!==parent)throw new Error('The scenes have different artwork hierarchies. Keep these objects independent or add a new scene.');
   for(const child of children(node))insert(child,current);
   return;
  }
  const subtree=[node,...Array.from(node.getElementsByTagName('*'))];
  if(subtree.some(child=>child.getAttribute('id')&&existing.has(child.getAttribute('id'))))throw new Error('The scenes have different artwork hierarchies. Keep these objects independent or add a new scene.');
  const copy=target.doc.importNode(node,true) as Element;parent.appendChild(copy);
  for(const child of [copy,...Array.from(copy.getElementsByTagName('*'))])existing.set(child.getAttribute('id'),child);
 };
 for(const child of children(parseSvg(payload).doc.documentElement!))insert(child,target.doc.documentElement!);
 destination.svg=new XMLSerializer().serializeToString(target.doc);
 for(const object of objects)destination.links[object.id]=source.id;
 const equationIds=new Set(objects.map(object=>object.equationId));
 for(const equation of source.equations.filter(equation=>equationIds.has(equation.id))){const at=destination.equations.findIndex(value=>value.id===equation.id);if(at<0)destination.equations.push(structuredClone(equation));else destination.equations[at]=structuredClone(equation);}
}
