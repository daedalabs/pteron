import {XMLSerializer} from '@xmldom/xmldom';
import {newScreen,type Project,type Screen} from './model';
import {evaluate} from './motion';
import {parseSvg,svgObjects,editSvg} from './svg';
import {bakeMotionSvg,assertNoReferences,effectiveAttribute,type TextMeasurements} from './selection';
import {transform} from './shape-transform';

export function continueScreen(project:Project,source:Screen,name:string,measurements:TextMeasurements={}):Screen{
 const next=newScreen(project.width,project.height,name,project.fps);
 const baked=bakeMotionSvg(source.svg,evaluate(source,source.duration-1),measurements),{doc,elements}=parseSvg(baked);
 const objects=svgObjects(baked),authored=new Set(objects.map(object=>object.id));
 const hidden=(el:typeof elements[number])=>{for(let current:typeof el|null=el;current?.nodeType===1;current=current.parentNode as typeof el)if(current.getAttribute('display')==='none'||['hidden','collapse'].includes(effectiveAttribute(current,'visibility'))||Number(effectiveAttribute(current,'opacity'))===0)return true;return false;};
 const removed=elements.filter(el=>authored.has(el.getAttribute('id')||'')&&hidden(el));
 const removedIds=removed.flatMap(el=>[el,...Array.from(el.getElementsByTagName('*'))].map(node=>node.getAttribute('id')).filter((id):id is string=>Boolean(id)));
 assertNoReferences(baked,removedIds);
 for(const el of removed)el.parentNode?.removeChild(el);
 const empty=elements.filter(el=>el.localName==='g'&&el.parentNode&&!Array.from(el.getElementsByTagName('*')).some(child=>['rect','circle','ellipse','path','line','polygon','polyline','text'].includes(child.localName??'')));
 assertNoReferences(new XMLSerializer().serializeToString(doc),empty.map(el=>el.getAttribute('id')||''));for(const el of empty)el.parentNode?.removeChild(el);
 next.svg=new XMLSerializer().serializeToString(doc);
 const survivors=svgObjects(next.svg),equations=new Set(survivors.map(object=>object.equationId));
 next.equations=structuredClone(source.equations.filter(equation=>equations.has(equation.id)));
 next.links=Object.fromEntries(survivors.map(object=>[object.id,source.id]));
 return next;
}

type Element=ReturnType<typeof parseSvg>['elements'][number];
const serialize=(node:Element)=>new XMLSerializer().serializeToString(node);
const key=(node:Element|null)=>node?.nodeType===1?(node===node.ownerDocument?.documentElement?'@root':node.getAttribute('id')??''):'';
const index=(xml:string)=>{const parsed=parseSvg(xml);return {...parsed,byId:new Map(parsed.elements.map(node=>[key(node),node]))};};
const attributes=(node:Element)=>new Map(Array.from(node.attributes).map(attribute=>[attribute.name,attribute.value]));
const children=(node:Element)=>Array.from(node.childNodes).filter(child=>child.nodeType===1) as Element[];
export function sameAttribute(name:string,a:string|null,b:string|null){
 if(a===b)return true;
 if(name==='transform'){const first=transform(a??''),second=transform(b??'');return first.every((value,i)=>Math.abs(value-second[i])<1e-8);}
 return false;
}
function parentKey(node:Element){
 let parent=node.parentNode as Element|null;
 while(parent?.nodeType===1&&(parent.getAttribute('class')??'').split(/\s+/).some(value=>['layer','pteron-editor-wrapper'].includes(value))&&Array.from(parent.attributes).every(attribute=>['id','class'].includes(attribute.name)))parent=parent.parentNode as Element|null;
 return key(parent);
}

export class ContinuityMeasurementRequired extends Error{
 constructor(readonly svg:string){super('Measuring text for scene continuity');}
}

/** Font/geometry identity survives fresh object IDs during an uncommitted retry. */
export function continuityTextKey(node:Element){
 const copy=node.cloneNode(true) as Element;
 for(const child of [copy,...Array.from(copy.getElementsByTagName('*'))]){child.removeAttribute('id');child.removeAttribute('class');}
 return JSON.stringify([serialize(copy),['font-family','font-size','font-weight','font-style','font-variant','font-stretch','letter-spacing','word-spacing','text-anchor','dominant-baseline','alignment-baseline','writing-mode','direction'].map(name=>effectiveAttribute(node,name))]);
}

/** Continuity belongs to an entire top-level object/group, including its children. */
export function continuityRoots(screen:Screen,objectIds:string[]){
 const objects=svgObjects(screen.svg),byId=new Map(objects.map(object=>[object.id,object]));
 return [...new Set(objectIds.map(id=>{
  let object=byId.get(id);if(!object)throw new Error('Layer not found');
  while(object.parentId)object=byId.get(object.parentId)!;
  return object.id;
 }))];
}

export function unlinkObjects(screen:Screen,objectIds:string[]){
 const {byId}=index(screen.svg);
 for(const id of continuityRoots(screen,objectIds)){
  const root=byId.get(id)!;
  for(const node of [root,...Array.from(root.getElementsByTagName('*'))])delete screen.links[key(node)];
 }
}

/**
 * Refresh inherited starting artwork from the same final-frame evaluator used by
 * preview/export. A three-way merge keeps destination edits and local motion.
 * All changes are part of the originating command's atomic history entry.
 */
export function syncContinuity(project:Project,previous:Project,measurements:TextMeasurements={},measureText?:(svg:string)=>TextMeasurements){
 const oldScreens=new Map(previous.screens.map(screen=>[screen.id,screen]));
 const positions=new Map(project.screens.map((screen,i)=>[screen.id,i]));
 const baked=new Map<string,ReturnType<typeof index>>();
 const final=(screen:Screen,old=false)=>{
  const id=`${old?'old':'new'}:${screen.id}`;
  if(!baked.has(id)){
   const poses=evaluate(screen,screen.duration-1);
   const needsText=screen.svg.includes('<text')&&Object.values(poses).some(p=>p.visible!==0&&(p.x||p.y||p.rotation||p.scaleX!==1||p.scaleY!==1));
   baked.set(id,index(bakeMotionSvg(screen.svg,poses,needsText&&measureText?measureText(screen.svg):measurements)));
  }
  return baked.get(id)!;
 };
 for(const [position,destination] of project.screens.entries()){
  const objects=svgObjects(destination.svg),ids=new Set(objects.map(object=>object.id));
  // Reordering/deleting scenes detaches invalid links, retaining editable work.
  for(const [id,sourceId] of Object.entries(destination.links))if(!ids.has(id)||!positions.has(sourceId)||positions.get(sourceId)!>=position)delete destination.links[id];
  if(!oldScreens.has(destination.id))continue;
  const target=index(destination.svg);
  let changed=false;
  const rebuild=new Set<string>();
  for(const sourceId of new Set(Object.values(destination.links))){
   const source=project.screens[positions.get(sourceId)!],oldSource=oldScreens.get(sourceId);
   if(!oldSource||JSON.stringify([source.svg,source.clips,source.lifetimes,source.duration,source.equations])===JSON.stringify([oldSource.svg,oldSource.clips,oldSource.lifetimes,oldSource.duration,oldSource.equations]))continue;
   const before=final(oldSource,true),after=final(source);
   const sourceObjects=new Set(svgObjects(oldSource.svg).map(object=>object.id));
   const linked=new Set(Object.entries(destination.links).filter(([,id])=>id===sourceId).map(([id])=>id));
   // Equation vectors are replaceable internals; their stable group remains the
   // animation target. A locally recompiled equation keeps its own source.
   const replacedInternals=new Set<string>();
   const localEquations=new Set<string>();
   for(const id of linked){
    const oldNode=before.byId.get(id),next=after.byId.get(id),current=target.byId.get(id);
    if(!oldNode||!next||!current)continue;
    const equationId=oldNode.getAttribute('data-equation-id');
    if(!equationId||Array.from(oldNode.getElementsByTagName('*')).map(key).join('|')===Array.from(next.getElementsByTagName('*')).map(key).join('|'))continue;
    const oldEquation=oldSource.equations.find(equation=>equation.id===equationId),local=destination.equations.find(equation=>equation.id===equationId);
    if(JSON.stringify(oldEquation)!==JSON.stringify(local)){
     localEquations.add(id);
     for(const child of Array.from(oldNode.getElementsByTagName('*')))replacedInternals.add(key(child));
     continue;
    }
    const localCopy=current.cloneNode(true) as Element;
    const localFill=current.getAttribute('fill');
    if(localFill!==oldNode.getAttribute('fill'))for(const path of Array.from(localCopy.getElementsByTagName('path')))if(path.getAttribute('fill')===localFill){const previous=before.byId.get(key(path)),fill=previous?.getAttribute('fill');if(fill===null||fill===undefined)path.removeAttribute('fill');else path.setAttribute('fill',fill);}
    const signature=(node:Element)=>JSON.stringify(Array.from(node.getElementsByTagName('*')).map(child=>[child.localName,[...attributes(child)].sort(),!children(child).length?child.textContent?.trim():undefined]));
    if(signature(localCopy)!==signature(oldNode))throw new Error('Equation terms have local artwork edits. Make the equation independent before replacing its source.');
    const removed=Array.from(current.getElementsByTagName('*')).map(key).filter(id=>!after.byId.has(id));
    if(destination.clips.some(clip=>removed.includes(clip.objectId))||removed.some(id=>destination.lifetimes[id]))throw new Error('An equation term has local timing. Make the equation independent before replacing its source.');
    assertNoReferences(destination.svg,removed);
    while(current.firstChild)current.removeChild(current.firstChild);
    for(const child of Array.from(next.childNodes))current.appendChild(target.doc.importNode(child,true));
    for(const child of Array.from(oldNode.getElementsByTagName('*'))){replacedInternals.add(key(child));delete destination.links[key(child)];}
    const authored=new Set(svgObjects(source.svg).map(object=>object.id));
    for(const child of Array.from(current.getElementsByTagName('*'))){target.byId.set(key(child),child);if(authored.has(key(child)))destination.links[key(child)]=sourceId;}
    if(current.getAttribute('fill')!==oldNode.getAttribute('fill')&&current.getAttribute('fill'))for(const path of Array.from(current.getElementsByTagName('path')))path.setAttribute('fill',current.getAttribute('fill')!);
    changed=true;
   }
   const directlyOwns=(node:Element)=>{
    for(let current:Element|null=node;current?.nodeType===1;current=current.parentNode as Element|null)if(sourceObjects.has(key(current)))return linked.has(key(current));
    return Array.from(node.getElementsByTagName('*')).some(child=>linked.has(key(child)));
   };
   const references=(node:Element)=>Array.from(node.attributes).flatMap(attribute=>[...attribute.value.matchAll(/url\(\s*['"]?#([^)'"\s]+)/g)].map(match=>match[1]).concat(/href$/.test(attribute.name)?[attribute.value.slice(1)]:[]));
   const dependencies=new Set<string>();
   const collect=(node:Element,document:typeof before)=>{for(const id of references(node))if(!dependencies.has(id)){dependencies.add(id);const definition=document.byId.get(id);if(definition)for(const child of [definition,...Array.from(definition.getElementsByTagName('*'))])collect(child,document);}};
   for(const document of [before,after])for(const node of document.elements)if(directlyOwns(node))collect(node,document);
   const owns=(node:Element)=>{if(directlyOwns(node))return true;for(let current:Element|null=node;current?.nodeType===1;current=current.parentNode as Element|null)if(dependencies.has(key(current)))return true;return Array.from(node.getElementsByTagName('*')).some(child=>dependencies.has(key(child)));};
   for(const id of dependencies){
    const old=before.byId.get(id),next=after.byId.get(id);if(!old||!next||serialize(old)===serialize(next))continue;
    const independent=objects.filter(object=>!destination.links[object.id]);
    if(independent.some(object=>{const node=target.byId.get(object.id);return node&&[node,...Array.from(node.getElementsByTagName('*'))].some(child=>references(child).includes(id));}))throw new Error('Linked and independent artwork share a definition. Make all objects using that definition independent before changing its source.');
   }
   const detach=(node:Element)=>{for(const root of continuityRoots(destination,[key(node)])){const parent=target.byId.get(root)!;for(const child of [parent,...Array.from(parent.getElementsByTagName('*'))]){delete destination.links[key(child)];linked.delete(key(child));}}};
   for(const id of linked)if(!after.byId.has(id)&&!replacedInternals.has(id)){
    const node=target.byId.get(id);if(node)detach(node);else delete destination.links[id];
   }
   for(const oldNode of before.elements){
    const id=key(oldNode),next=after.byId.get(id),current=target.byId.get(id);
    if(!id||!next||!current||!owns(oldNode)||replacedInternals.has(id))continue;
    const generatedAncestor=(node:Element)=>{for(let parent=node.parentNode as Element|null;parent?.nodeType===1;parent=parent.parentNode as Element|null)if(parent.hasAttribute('data-stroke-shape')||parent.hasAttribute('data-stroke-edges'))return true;return false;};
    if(generatedAncestor(oldNode))continue;
    if(sourceObjects.has(id)&&!destination.links[id])continue;
    if(parentKey(oldNode)!==parentKey(next))throw new Error('A linked layer changed parent in its source scene. Make its containing object independent before restructuring it.');
    const oldAttributes=attributes(oldNode),newAttributes=attributes(next);
    const changedAttributes=[...new Set([...oldAttributes.keys(),...newAttributes.keys()])].filter(name=>name!=='id'&&oldAttributes.get(name)!==newAttributes.get(name));
    if(changedAttributes.length&&!sourceObjects.has(id)&&Array.from(oldNode.getElementsByTagName('*')).some(child=>sourceObjects.has(key(child))&&!linked.has(key(child))))throw new Error('A shared viewport contains independent artwork. Make the remaining objects independent before changing that viewport.');
    if(oldNode.localName!==next.localName){
     // Generated borders and equations can change element type. Keep local
     // overrides on their stable root; refuse to discard authored descendants.
     if(current.localName!==oldNode.localName||children(current).map(key).join('|')!==children(oldNode).map(key).join('|'))throw new Error('Linked artwork has local structural edits. Make it independent before replacing its source shape.');
     const replacement=target.doc.importNode(next,true) as Element;
     for(const [name,value] of attributes(current))if(name!=='id'&&oldAttributes.get(name)!==value){replacement.setAttribute(name,value);if(['x','y','width','height','rx','ry'].includes(name)&&replacement.hasAttribute(`data-rect-${name}`))replacement.setAttribute(`data-rect-${name}`,value);}
     current.parentNode!.replaceChild(replacement,current);
     for(const node of [replacement,...Array.from(replacement.getElementsByTagName('*'))])target.byId.set(key(node),node);
     if(replacement.hasAttribute('data-stroke-shape')||replacement.hasAttribute('data-stroke-edges')||replacement.hasAttribute('data-corners'))rebuild.add(id);
     changed=true;continue;
    }
    for(const name of changedAttributes){
     if(!sameAttribute(name,current.getAttribute(name),oldNode.getAttribute(name)))continue;
     const value=next.getAttribute(name);if(value===null)current.removeAttribute(name);else current.setAttribute(name,value);changed=true;
    }
    if(localEquations.has(id))continue;
    if(current.hasAttribute('data-stroke-shape')||current.hasAttribute('data-stroke-edges')||current.hasAttribute('data-corners')){rebuild.add(id);continue;}
    if(!children(oldNode).length&&!children(next).length&&current.textContent===oldNode.textContent&&current.textContent!==next.textContent){current.textContent=next.textContent;changed=true;}
    // New geometry inside a linked group follows it. Local additions, deletions
    // and upstream deletions remain editable instead of being discarded.
    for(const child of children(next))if(key(child)&&!before.byId.has(key(child))&&!target.byId.has(key(child))){
     if(Array.from(child.getElementsByTagName('*')).some(node=>target.byId.has(key(node)))){
      if((child.getAttribute('class')??'').split(/\s+/).some(value=>['layer','pteron-editor-wrapper'].includes(value))&&Array.from(child.attributes).every(attribute=>['id','class'].includes(attribute.name)))continue;
      throw new Error('A linked layer changed parent in its source scene. Make its containing object independent before restructuring it.');
     }
     const copy=target.doc.importNode(child,true) as Element;
     const following=children(next).slice(children(next).indexOf(child)+1).map(node=>target.byId.get(key(node))).find(node=>node?.parentNode===current);
     current.insertBefore(copy,following??null);
     const authored=new Set(svgObjects(source.svg).map(object=>object.id));
     for(const node of [copy,...Array.from(copy.getElementsByTagName('*'))]){target.byId.set(key(node),node);if(authored.has(key(node)))destination.links[key(node)]=sourceId;}
     changed=true;
    }
   }
   for(const equation of source.equations){
    const existing=destination.equations.find(value=>value.id===equation.id),old=oldSource.equations.find(value=>value.id===equation.id);
    if(existing&&JSON.stringify(existing)===JSON.stringify(old))destination.equations[destination.equations.indexOf(existing)]=structuredClone(equation);
   }
  }
  if(changed){destination.svg=serialize(target.doc.documentElement!);for(const id of rebuild)destination.svg=editSvg(destination.svg,id,{});parseSvg(destination.svg);}
 }
}
