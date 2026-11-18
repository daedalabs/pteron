import {svgObjects} from './svg';
import { type Clip, type Screen, type LayerSpan, presets } from './model';
export const presetCatalog=presets.map((name,index)=>({name,category:name==='Stagger'?'Entrance':index<8?'Entrance':index<16?'Exit':index<26?'Emphasis':index<28?'Object transition':'Equation',duration:index<16?12:index<26?18:15}));
export const presetsAtFps=(fps:number)=>presetCatalog.map(preset=>({...preset,duration:Math.max(1,Math.round(preset.duration*fps/30))}));
export function clipCategory(preset:string):'entrance'|'exit'|'emphasis'|'transition'|'equation'{
 const item=presetCatalog.find(p=>p.name===preset);
 if(!item)return 'emphasis';
 if(item.category==='Entrance')return 'entrance';
 if(item.category==='Exit')return 'exit';
 if(item.category==='Object transition')return 'transition';
 if(item.category==='Equation')return 'equation';
 return 'emphasis';
}
export function properties(preset:string):string[]{
 if(preset==='Write on'||preset==='Erase')return ['draw'];
 if(preset==='Stagger')return ['stagger'];
 if(preset==='Match terms'||preset==='Highlight terms')return ['terms'];
 if(preset==='Smooth match')return ['position','scale','rotation','matrix'];
 if(/highlight/i.test(preset))return [preset==='Outline highlight'?'outline':'color'];
 if(/Fade|Crossfade|Write|Erase|Stagger/.test(preset))return ['opacity'];
 if(/Spin|Rotate|Wiggle|Rock/.test(preset))return ['rotation'];
 if(/Pop|Zoom|Shrink|Pulse|Press/.test(preset))return ['scale'];
 return ['position'];
}
export type Pose={x:number,y:number,scaleX:number,scaleY:number,rotation:number,opacity:number,highlight:number,outline:number,visible:number,draw?:number,m00?:number,m01?:number,m10?:number,m11?:number,pivotX?:number,pivotY?:number};
export const identity=():Pose=>({x:0,y:0,scaleX:1,scaleY:1,rotation:0,opacity:1,highlight:0,outline:0,visible:1});
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const hierarchyCache=new WeakMap<Screen,{svg:string,objects:ReturnType<typeof svgObjects>,children:Map<string,ReturnType<typeof svgObjects>>}>();
function hierarchy(screen:Screen){
 let value=hierarchyCache.get(screen);if(value?.svg===screen.svg)return value;
 const objects=svgObjects(screen.svg),children=new Map<string,typeof objects>();
 for(const object of objects)if(object.parentId){const siblings=children.get(object.parentId)??[];siblings.push(object);children.set(object.parentId,siblings);}
 value={svg:screen.svg,objects,children};hierarchyCache.set(screen,value);return value;
}
export function evaluateClip(c:Clip,frame:number):Pose{
 const p=identity(),raw=clamp((c.duration===1?1:(frame-c.start)/(c.duration-1))),t=c.easing==='linear'?raw:c.easing==='out'?1-(1-raw)**3:raw*raw*(3-2*raw);
 const cycle=raw===1?1:(raw*c.repetitions)%1,wave=raw===0||raw===1?0:Math.sin(cycle*Math.PI),osc=raw===0||raw===1?0:Math.sin(cycle*Math.PI*2),i=c.intensity;
 const exiting=/out$|Sink|Shrink|Erase/.test(c.preset),remaining=exiting?t:1-t;
 const dx=c.direction==='left'?-1:c.direction==='right'?1:0,dy=c.direction==='up'?-1:c.direction==='down'?1:0;
 switch(c.preset){
 case 'Fade':case 'Fade out':p.opacity=exiting?1-t:t;break;
 case 'Write on':p.draw=t;break;
 case 'Erase':p.draw=1-t;break;
 case 'Crossfade replacement':p.opacity=1-t;break;
 case 'Smooth match':if(c.match){p.m00=1+(c.match[0]-1)*t;p.m01=c.match[1]*t;p.m10=c.match[2]*t;p.m11=1+(c.match[3]-1)*t;p.x=c.match[4]*t;p.y=c.match[5]*t;}break;
 case 'Rise':case 'Sink':p.y=(c.preset==='Rise'?1:1)*remaining*80*i;break;
 case 'Slide':case 'Slide out':case 'Drift':case 'Drift out':{const d=c.preset.includes('Drift')?32:120;p.x=dx*remaining*d*i;p.y=dy*remaining*d*i;break;}
 case 'Pop':p.scaleX=p.scaleY=raw===1?1:Math.max(0,1-(1-raw)**3*Math.cos(raw*10)*i);break;
 case 'Zoom':case 'Zoom out':p.scaleX=p.scaleY=1+remaining*.35*i;break;
 case 'Shrink':p.scaleX=p.scaleY=1-t;break;
 case 'Spin':case 'Spin out':p.rotation=remaining*180*i;break;
 case 'Pulse':p.scaleX=p.scaleY=1+wave*.12*i;break;
 case 'Press':p.scaleX=1+wave*.06*i;p.scaleY=1-wave*.18*i;break;
 case 'Bounce':p.y=-Math.abs(osc)*40*i*(1-raw);break;
 case 'Wiggle':case 'Rock':p.rotation=osc*(1-raw)*12*i;break;
 case 'Shake':p.x=Math.sin(cycle*Math.PI*8)*(1-raw)*12*i;break;
 case 'Rotate':p.rotation=t*360*i;break;
 case 'Color highlight':p.highlight=wave;break;
 case 'Outline highlight':p.outline=wave;break;
 }
 if(c.from&&c.to){const control=c.control??{x:(c.from.x+c.to.x)/2,y:(c.from.y+c.to.y)/2};p.x=(1-t)**2*c.from.x+2*(1-t)*t*control.x+t*t*c.to.x;p.y=(1-t)**2*c.from.y+2*(1-t)*t*control.y+t*t*c.to.y;}
 if(c.pivot){p.pivotX=c.pivot.x;p.pivotY=c.pivot.y;}
 for(const key of Object.keys(p) as (keyof Pose)[])if(Object.is(p[key],-0))p[key]=0;
 return p;
}
export const motionPhase=(preset:string)=>{if(preset==='Stagger')return 'entrance';const index=presets.indexOf(preset as typeof presets[number]);return index>=0&&index<8?'entrance':index<16&&index>=8?'exit':'effect';};
/** Visibility epochs reset after an exit; future entrances never affect the past. */
export function automaticLayerSpans(screen:Screen,objectId:string):LayerSpan[]{
 const tree=hierarchy(screen),children=tree.children.get(objectId)??[];
 const inherited:number[]=[];let parent=tree.objects.find(object=>object.id===objectId)?.parentId;
 while(parent){inherited.push(...screen.clips.filter(clip=>clip.objectId===parent).map(clip=>clip.start+clip.duration),...(screen.lifetimes[parent]??[]).map(span=>span.end));parent=tree.objects.find(object=>object.id===parent)?.parentId;}
 const horizon=Math.max(1,...inherited,...(children.length?children.flatMap(child=>layerSpans(screen,child.id).map(span=>span.end)):[screen.durationBase??screen.duration]),...screen.clips.filter(clip=>clip.objectId===objectId).map(clip=>clip.start+clip.duration));
 const boundary=screen.clips.filter(clip=>clip.objectId===objectId&&motionPhase(clip.preset)!=='effect').sort((a,b)=>a.start-b.start||(motionPhase(a.preset)==='exit'?0:1)-(motionPhase(b.preset)==='exit'?0:1)||a.id.localeCompare(b.id));
 const spans:LayerSpan[]=[];let start:number|null=boundary[0]&&motionPhase(boundary[0].preset)==='entrance'?boundary[0].start:0;
 for(const clip of boundary){
  if(motionPhase(clip.preset)==='entrance'){if(start===null){if(spans.length&&spans.at(-1)!.end>clip.start){spans.at(-1)!.end=clip.start;if(spans.at(-1)!.end<=spans.at(-1)!.start)spans.pop();}start=clip.start;}}
  else {const end=clip.start+clip.duration;if(start!==null){spans.push({id:`auto-${objectId}-${spans.length}`,start,end});start=null;}else if(spans.length&&clip.start<spans.at(-1)!.end)spans.at(-1)!.end=Math.max(spans.at(-1)!.end,end);}
 }
 if(start!==null&&start<horizon)spans.push({id:`auto-${objectId}-${spans.length}`,start,end:horizon});return spans;
}
export const layerSpans=(screen:Screen,objectId:string)=>screen.lifetimes?.[objectId]??automaticLayerSpans(screen,objectId);
type CompiledTrack={epochs:LayerSpan[],ranges:LayerSpan[],clips:Clip[],exits:Clip[]};
/** Compile per-object clip indexes once for smooth playback and sequential sampling. */
export function createEvaluator(screen:Screen){
 const tracks=new Map<string,CompiledTrack>();
 const tree=hierarchy(screen),objects=tree.objects;
 const ids=new Set([...objects.filter(object=>!tree.children.has(object.id)).map(object=>object.id),...screen.clips.flatMap(clip=>[clip.objectId,...(clip.targetObjectId?[clip.targetObjectId]:[])]),...Object.keys(screen.lifetimes??{})]);
 for(const objectId of ids){
  const clips=screen.clips.filter(clip=>clip.objectId===objectId).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
  tracks.set(objectId,{epochs:automaticLayerSpans(screen,objectId),ranges:layerSpans(screen,objectId),clips,exits:clips.filter(clip=>motionPhase(clip.preset)==='exit')});
 }
 return (frame:number):Record<string,Pose>=>{
 const result:Record<string,Pose>={};
 for(const [objectId,track] of tracks){
  const pose=result[objectId]=identity(),epoch=track.epochs.find(span=>span.start<=frame&&frame<span.end),range=track.ranges.find(span=>span.start<=frame&&frame<span.end);
  if(!epoch||!range){pose.visible=0;continue;}
  const first=Math.max(epoch.start,range.start),last=Math.min(epoch.end,range.end);let low=0,high=track.clips.length;
  while(low<high){const middle=(low+high)>>1;if(track.clips[middle].start<first)low=middle+1;else high=middle;}
  for(let index=low;index<track.clips.length;index++){const clip=track.clips[index];if(clip.start>=last||clip.start>frame)break;const p=evaluateClip(clip,frame);
   for(const prop of properties(clip.preset)){
    if(prop==='position'){pose.x=p.x;pose.y=p.y;}if(prop==='scale'){pose.scaleX=p.scaleX;pose.scaleY=p.scaleY;}
    if(prop==='rotation')pose.rotation=p.rotation;if(prop==='opacity')pose.opacity=p.opacity;if(prop==='color')pose.highlight=p.highlight;if(prop==='outline')pose.outline=p.outline;
    if(prop==='draw')pose.draw=p.draw;
    if(prop==='matrix'&&p.m00!==undefined){pose.m00=p.m00;pose.m01=p.m01;pose.m10=p.m10;pose.m11=p.m11;}
   }
   if(clip.from&&clip.to){pose.x=p.x;pose.y=p.y;}
   if(clip.pivot){pose.pivotX=clip.pivot.x;pose.pivotY=clip.pivot.y;}
  }
  let exitEnd=0;for(const exit of track.exits)if(exit.start>=epoch.start&&exit.start<epoch.end)exitEnd=Math.max(exitEnd,exit.start+exit.duration);
  if(exitEnd&&frame>=exitEnd-1)pose.visible=0;
 }
 const ensure=(id:string)=>result[id]??=identity();
 const progress=(clip:Clip,start=clip.start,duration=clip.duration)=>{const raw=clamp(duration===1?(frame>=start?1:0):(frame-start)/(duration-1));return clip.easing==='linear'?raw:clip.easing==='out'?1-(1-raw)**3:raw*raw*(3-2*raw);};
 const epoch=(clip:Clip,receiving=false)=>{const related=screen.clips.filter(other=>receiving?other.targetObjectId===clip.targetObjectId:other.objectId===clip.objectId&&(clip.preset==='Stagger'?other.preset==='Stagger':Boolean(other.targetObjectId))).sort((a,b)=>a.start-b.start);return (related.filter(other=>other.start<=frame).at(-1)??related[0])===clip;};
 for(const clip of screen.clips){
  if(clip.preset==='Stagger'&&epoch(clip)){
   const children=tree.children.get(clip.objectId)??[],spacing=clip.stagger??Math.min(3,Math.floor((clip.duration-1)/Math.max(1,children.length-1))),duration=clip.duration-spacing*(children.length-1);
   for(const [index,child] of children.entries())ensure(child.id).opacity*=progress(clip,clip.start+index*spacing,duration);
  }
  if(clip.targetObjectId){
   const t=progress(clip),target=ensure(clip.targetObjectId),source=ensure(clip.objectId);
   const fade=clip.preset==='Smooth match'?(t===1?1:clamp((t-.8)/.2)):t;
   if(epoch(clip,true))target.opacity*=fade;
   if(epoch(clip)&&frame>=clip.start){if(clip.preset!=='Crossfade replacement')source.opacity*=1-fade;if(t===1)source.visible=0;}
   if(clip.preset==='Match terms'&&epoch(clip)&&frame>=clip.start)for(const match of clip.matches??[]){const pose=ensure(match.objectId);pose.x=match.matrix[4]*t;pose.y=match.matrix[5]*t;pose.m00=1+(match.matrix[0]-1)*t;pose.m01=match.matrix[1]*t;pose.m10=match.matrix[2]*t;pose.m11=1+(match.matrix[3]-1)*t;}
  }
  if(clip.preset==='Highlight terms'&&frame>=clip.start&&frame<clip.start+clip.duration){const equation=screen.equations.find(eq=>eq.id===objects.find(object=>object.id===clip.objectId)?.equationId),t=progress(clip);if(equation)for(const name of clip.terms??Object.keys(equation.terms))if(equation.terms[name])ensure(equation.terms[name]).highlight=t===0||t===1?0:Math.sin(t*Math.PI);}
 }
 return result;
 };
}
export function evaluate(screen:Screen,frame:number):Record<string,Pose>{return createEvaluator(screen)(frame);}
export function motionTransform(p:Pose,center:{x:number,y:number},base=''){const x=p.pivotX??center.x,y=p.pivotY??center.y;return `matrix(${p.m00??1} ${p.m01??0} ${p.m10??0} ${p.m11??1} ${p.x} ${p.y}) translate(${x} ${y}) rotate(${p.rotation}) scale(${p.scaleX} ${p.scaleY}) translate(${-x} ${-y}) ${base}`;}
export function sampledPlan(screen:Screen){const sample=createEvaluator(screen);return Array.from({length:screen.duration},(_,frame)=>({frame,objects:sample(frame)}));}
