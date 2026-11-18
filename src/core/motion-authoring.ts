import {properties} from './motion';
import {type Screen,type Clip} from './model';
import {parseSvg,svgObjects} from './svg';
import {selectionInfo,type TextMeasurements} from './selection';
import {matrix,mul,inverse,type Matrix} from './shape-transform';

export const replacementPresets=new Set(['Smooth match','Crossfade replacement','Match terms']);
export function motionAccesses(screen:Screen,clip:Clip){
 const source=[clip.objectId,clip.from&&clip.to?['position']:[]] as const;
 const accesses:{id:string,properties:string[]}[]=[{id:source[0],properties:[...properties(clip.preset),...source[1]]}];
 if(clip.targetObjectId){accesses.push({id:clip.targetObjectId,properties:['opacity']});accesses[0].properties.push('opacity');}
 if(clip.preset==='Stagger')for(const child of svgObjects(screen.svg).filter(object=>object.parentId===clip.objectId))accesses.push({id:child.id,properties:['opacity']});
 for(const match of clip.matches??[])accesses.push({id:match.objectId,properties:['position','scale','rotation']});
 if(clip.preset==='Highlight terms'){const objects=svgObjects(screen.svg),equation=screen.equations.find(eq=>eq.id===objects.find(object=>object.id===clip.objectId)?.equationId);if(equation)for(const name of clip.terms??Object.keys(equation.terms))accesses.push({id:equation.terms[name],properties:['color']});}
 return accesses;
}
export function compileMotionTargets(screen:Screen,fallback:TextMeasurements={},measure?:(svg:string)=>TextMeasurements){
 const {elements}=parseSvg(screen.svg),objects=svgObjects(screen.svg),ids=new Set(objects.map(object=>object.id));
 let metrics:TextMeasurements|undefined;
 const bounds=(id:string)=>{metrics??=screen.svg.includes('<text')&&measure?measure(screen.svg):fallback;const result=selectionInfo(screen.svg,[id],metrics);if(!result.bounds)throw new Error(result.geometryError??'Motion target has no geometry');return result.bounds;};
 const mapping=(sourceId:string,targetId:string):Matrix=>{
  const from=bounds(sourceId),to=bounds(targetId),sx=from.width?to.width/from.width:1,sy=from.height?to.height/from.height:1;
  const parent=matrix(elements.find(node=>node.getAttribute('id')===sourceId)!.parentNode as typeof elements[number]);
  return mul(mul(inverse(parent),[sx,0,0,sy,to.x-from.x*sx,to.y-from.y*sy]),parent);
 };
 for(const clip of screen.clips){
  const animated=elements.find(node=>node.getAttribute('id')===clip.objectId);
  if(animated){const nodes=[animated,...Array.from(animated.getElementsByTagName('*'))];for(let parent=animated.parentNode as typeof animated|null;parent?.nodeType===1;parent=parent.parentNode as typeof animated|null)nodes.push(parent);if(nodes.some(node=>/(?:^|;)\s*transform\s*:/.test(node.getAttribute('style')??'')))throw new Error('Animate SVG transform attributes rather than CSS transforms; editable artwork has been preserved');}
  if(clip.preset!=='Smooth match')delete clip.match;
  if(clip.preset!=='Match terms')delete clip.matches;
  if(clip.preset==='Write on'||clip.preset==='Erase'){
   const root=elements.find(node=>node.getAttribute('id')===clip.objectId);
   if(root&&[root,...Array.from(root.getElementsByTagName('*'))].some(node=>node.localName==='text'))throw new Error('Write on and Erase require vector shapes or compiled equation glyphs; editable text tracing is not supported');
  }
  if(clip.terms&&clip.terms.length===0)throw new Error('Select at least one named term');
  if(!clip.targetObjectId){delete clip.match;delete clip.matches;}
  if(clip.targetObjectId){
   if(!ids.has(clip.targetObjectId)||clip.objectId===clip.targetObjectId)throw new Error('Choose a different existing replacement target');
   const source=elements.find(node=>node.getAttribute('id')===clip.objectId)!,target=elements.find(node=>node.getAttribute('id')===clip.targetObjectId)!;
   if(Array.from(source.getElementsByTagName('*')).includes(target)||Array.from(target.getElementsByTagName('*')).includes(source))throw new Error('Replacement targets cannot contain one another');
   if(clip.preset==='Smooth match')clip.match=mapping(clip.objectId,clip.targetObjectId);
   if(clip.preset==='Match terms'){
    const sourceEquation=screen.equations.find(eq=>eq.id===objects.find(object=>object.id===clip.objectId)?.equationId),targetEquation=screen.equations.find(eq=>eq.id===objects.find(object=>object.id===clip.targetObjectId)?.equationId);
    if(!sourceEquation||!targetEquation)throw new Error('Match terms requires two equations');
    const names=clip.terms?.length?clip.terms:Object.keys(sourceEquation.terms).filter(name=>targetEquation.terms[name]);
    if(!names.length)throw new Error('Name corresponding terms in both equations before using Match terms');
    clip.matches=names.map(name=>{const objectId=sourceEquation.terms[name],targetObjectId=targetEquation.terms[name];if(!objectId||!targetObjectId||!ids.has(objectId)||!ids.has(targetObjectId))throw new Error(`Equation term is missing: ${name}`);return {objectId,targetObjectId,matrix:mapping(objectId,targetObjectId)};});
   }
  }
  if(clip.preset==='Stagger'){
   const count=objects.filter(object=>object.parentId===clip.objectId).length;
   if(!count)throw new Error('Stagger requires a group with child layers');
   if((clip.stagger??Math.min(3,Math.floor((clip.duration-1)/Math.max(1,count-1))))*(count-1)>=clip.duration)throw new Error('Stagger spacing must leave at least one frame for each reveal');
  }
  if(clip.preset==='Highlight terms'){
   const equation=screen.equations.find(eq=>eq.id===objects.find(object=>object.id===clip.objectId)?.equationId);
   if(!equation||!Object.keys(equation.terms).length)throw new Error('Name equation terms before applying Highlight terms');
   for(const name of clip.terms??Object.keys(equation.terms))if(!equation.terms[name]||!ids.has(equation.terms[name]))throw new Error(`Equation term is missing: ${name}`);
  }
 }
}

export function requirePresetSettings(clip:Clip){
 if(['Crossfade replacement','Match terms'].includes(clip.preset)&&!clip.targetObjectId)throw new Error('Choose a replacement target for this animation');
 if(clip.preset==='Smooth match'&&!clip.targetObjectId&&(!clip.from||!clip.to))throw new Error('Choose a target or set start and end positions');
 if(Boolean(clip.from)!==Boolean(clip.to))throw new Error('Set both start and end positions');
 if(clip.control&&!clip.from)throw new Error('Set start and end positions before adding a curve control');
 if(clip.targetObjectId&&(clip.from||clip.to||clip.control))throw new Error('Choose a replacement target or custom move path, rather than both');
}
