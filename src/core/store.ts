import {XMLSerializer} from '@xmldom/xmldom';
import {setCanvasBackground} from './svg';
import { motionSettingsSchema, projectSchema, newProject, newScreen, uuid, clipSchema, captionSchema, equationSchema, frame, defaultCaptionStyle, type Screen, type Project } from './model';
import { appendSvg, deleteSvgObject, editSvg, importSvg, svgObjects, parseSvg,putEquationSvg,copySvgObjects,removeSvgObjects,groupSvgObjects,resizeSvgCanvas,commitSvg,preserveStrokeWidths } from './svg';
import {nudgeSelection,editSelection,transformSelection,alignSelection,ungroupSelection,combineSelection,type TextMeasurements} from './selection';
import {continueScreen,syncContinuity,unlinkObjects} from './continuity';
import {editClips} from './timeline-editing';
import {compileMotionTargets,requirePresetSettings,motionAccesses} from './motion-authoring';
import {carryObjects} from './continuity-carry';
import { properties,motionPhase,layerSpans } from './motion';
import {commandSchema} from './commands';
import {contentDuration} from './screen-duration';
import {screenOffsets,syncProjectTimeline} from './project-timeline';
export {commandSchema} from './commands';
export type {Command} from './commands';
export function validateProject(value:unknown):Project{
 const p=projectSchema.parse(value),screenIds=new Set<string>();
 for(const items of [p.assets??[],p.motionPresets??[]])if(new Set(items.map(item=>item.id)).size!==items.length)throw new Error('Duplicate saved library identity');
 for(const asset of p.assets??[]){const objects=svgObjects(asset.svg),ids=new Set(objects.map(object=>object.id));if(ids.size!==objects.length||asset.clips.some(clip=>!ids.has(clip.objectId)||clip.targetObjectId&&!ids.has(clip.targetObjectId))||Object.keys(asset.lifetimes).some(id=>!ids.has(id)))throw new Error('Saved shape contains invalid artwork references');}
 const markerIds=new Set<string>();for(const marker of p.timelineMarkers??[]){if(markerIds.has(marker.id)||marker.frame>=p.screens.reduce((sum,screen)=>sum+screen.duration,0))throw new Error('Marker must have a unique identity and be inside the project');markerIds.add(marker.id);}
 const globalCaptions=new Map((p.timelineCaptions??[]).map(caption=>[caption.id,caption]));
 if(globalCaptions.size!==(p.timelineCaptions?.length??0))throw new Error('Duplicate overall caption id');
 for(const caption of globalCaptions.values())if(caption.end<=caption.start||caption.sourceCaptionId)throw new Error('Invalid overall caption');
 if(p.timelineAudio&&!p.media[p.timelineAudio.mediaId])throw new Error('Overall audio media is missing');
 if(p.timelineAudio?.sourceDuration!==undefined&&(p.timelineAudio.sourceStart??0)+p.timelineAudio.duration>p.timelineAudio.sourceDuration)throw new Error('Audio trim exceeds its original duration');
 for(const s of p.screens){
  if(screenIds.has(s.id))throw new Error('Duplicate screen id');screenIds.add(s.id);
  parseSvg(s.svg);const objects=svgObjects(s.svg),ids=new Set(objects.map(o=>o.id));
  if(ids.size!==objects.length||objects.some(o=>!o.id))throw new Error('Missing or duplicate artwork identity');
  const clipIds=new Set<string>();
  for(const c of s.clips){
   if(clipIds.has(c.id)||!ids.has(c.objectId))throw new Error('Invalid clip identity or target');clipIds.add(c.id);
   if(c.start+c.duration>s.duration)throw new Error('Screen duration would truncate motion');
   const ranges=s.lifetimes[c.objectId];if(ranges&&!ranges.some(range=>range.start<=c.start&&c.start+c.duration<=range.end))throw new Error('Motion must fit inside a layer visibility range');
   for(const other of s.clips){if(other===c)continue;
    if(other.objectId===c.objectId&&c.start<other.start+other.duration&&other.start<c.start+c.duration&&motionPhase(c.preset)!=='effect'&&motionPhase(other.preset)!=='effect'&&motionPhase(c.preset)!==motionPhase(other.preset))throw new Error('Entrance and exit motions cannot overlap; move one outside the other');
    if(c.start<other.start+other.duration&&other.start<c.start+c.duration&&motionAccesses(s,c).some(access=>motionAccesses(s,other).some(otherAccess=>access.id===otherAccess.id&&access.properties.some(prop=>otherAccess.properties.includes(prop)))))throw new Error('Clips overlap on the same property');
   }
  }
  for(const [objectId,ranges] of Object.entries(s.lifetimes)){
   if(!ids.has(objectId))throw new Error('Layer visibility target is missing');const used=new Set<string>();let end=0;
   for(const range of [...ranges].sort((a,b)=>a.start-b.start)){if(used.has(range.id)||range.end<=range.start||range.end>s.duration||range.start<end)throw new Error('Layer visibility ranges must be non-overlapping and inside the screen');used.add(range.id);end=range.end;}
  }
  for(const c of s.captions){if(c.end<=c.start||c.end>s.duration)throw new Error('Caption is outside screen duration');if(c.vector)parseSvg(c.vector);}
  for(const caption of s.captions)if(caption.sourceCaptionId&&!globalCaptions.has(caption.sourceCaptionId))throw new Error('Overall caption source is missing');
  if(s.narration.timeline&&!p.timelineAudio)throw new Error('Overall audio source is missing');
  for(const cue of s.cues)if(cue.frame>s.duration)throw new Error('Cue is outside screen duration');
  if(s.narration.mediaId&&!p.media[s.narration.mediaId])throw new Error('Narration media is missing');
  if((s.narration.duration??0)>s.duration)throw new Error('Screen would truncate narration');
 }
 if(p.timelineAudio||p.timelineCaptions){
  const offsets=screenOffsets(p),end=offsets.at(-1)!.end;
  if((p.timelineAudio&&p.timelineAudio.start+p.timelineAudio.duration>end)||[...globalCaptions.values()].some(caption=>caption.end>end))throw new Error('Overall media exceeds project duration');
  for(const {screen,start,end} of offsets){
   for(const source of globalCaptions.values()){
    const copies=screen.captions.filter(caption=>caption.sourceCaptionId===source.id),left=Math.max(source.start,start),right=Math.min(source.end,end);
    if(right>left){if(copies.length!==1||copies[0].start!==left-start||copies[0].end!==right-start||copies[0].text!==source.text)throw new Error('Overall caption slice is inconsistent');}
    else if(copies.length)throw new Error('Unexpected overall caption slice');
   }
   if(p.timelineAudio){const source=p.timelineAudio,left=Math.max(source.start,start),right=Math.min(source.start+source.duration,end),audio=screen.narration;
    if(right>left&&(!audio.timeline||audio.mediaId!==source.mediaId||audio.offset!==left-start||audio.sourceStart!==(source.sourceStart??0)+left-source.start||audio.duration!==right-left))throw new Error('Overall audio slice is inconsistent');
   }
  }
 }
 return p;
}
export class ProjectStore{
 private clipboard:{lifetimes:Screen['lifetimes'],fps:number,svg:string,clips:Screen['clips'],equations:Screen['equations']}|undefined;
 private value:Project;private past:Project[]=[];private future:Project[]=[];
 listeners=new Set<()=>void>();activity:{revision:number;command:string;source:string}[]=[];
 constructor(p:Project=newProject()){this.value=validateProject(p);}
 get snapshot(){return structuredClone(this.value);}
 get clipboardAvailable(){return Boolean(this.clipboard);}
 get history(){return {undo:this.past.length,redo:this.future.length};}
 private publish(next:Project,command:string,source:string){this.value=next;this.activity.push({revision:next.revision,command,source});this.activity=this.activity.slice(-100);for(const listener of this.listeners)listener();return this.snapshot;}
 replace(p:unknown,expected:number,source='manual'){this.check(expected);const next=validateProject(p);next.revision=this.value.revision+1;this.past.push(this.snapshot);this.future=[];return this.publish(next,'project.open',source);}
 private check(expected:number){if(expected!==this.value.revision)throw new Error(`Stale revision: expected ${this.value.revision}, received ${expected}`);}
 dispatch(input:unknown,expected:number,source='manual',measurements:TextMeasurements={},measureContinuityText?:(svg:string)=>TextMeasurements,outlines:Record<string,string>={}){
  this.check(expected);const c=commandSchema.parse(input);
  if(c.type==='history.undo'||c.type==='history.redo'){
   const from=c.type==='history.undo'?this.past:this.future,to=c.type==='history.undo'?this.future:this.past;
   const next=from.pop();if(!next)throw new Error('No history available');to.push(this.snapshot);next.revision=this.value.revision+1;return this.publish(next,c.type,source);
  }
  let pendingClipboard:typeof this.clipboard;
  let batchScreens:Set<string>|undefined;
  let p=this.snapshot;
  for(const screen of p.screens)screen.durationBase??=screen.duration;
  if(c.type==='project.create')p=newProject(c.name,c.width,c.height,c.fps??30);
  else if(c.type==='project.rename')p.name=c.name;
  else if(c.type==='narration.mix')p.narrationMix=c.mix;
  else if(c.type==='narration.settings'){
   if(c.style.font===defaultCaptionStyle.font&&c.style.variant===defaultCaptionStyle.variant&&c.style.size===defaultCaptionStyle.size&&c.style.entrance===defaultCaptionStyle.entrance)delete p.captionStyle;
   else p.captionStyle=c.style;
   if(c.mix)p.narrationMix=c.mix;
  }
  else if(c.type==='asset.delete')p.assets=p.assets?.filter(asset=>asset.id!==c.assetId);
  else if(c.type==='motionPreset.delete')p.motionPresets=p.motionPresets?.filter(preset=>preset.id!==c.presetId);
  else if(c.type==='clips.batch')batchScreens=editClips(p,c.items,c.action,c.frames);
  else if(c.type==='timeline.marker.put'){const markers=p.timelineMarkers??=[];const index=markers.findIndex(marker=>marker.id===c.marker.id);if(index<0)markers.push(c.marker);else markers[index]=c.marker;}
  else if(c.type==='timeline.marker.delete')p.timelineMarkers=p.timelineMarkers?.filter(marker=>marker.id!==c.markerId);
  else if(c.type==='timeline.captions.import'){p.timelineCaptions=c.captions;for(const screen of p.screens)screen.captions=[];}
  else if(c.type==='timeline.caption.put'){
   const captions=p.timelineCaptions??=[];const index=captions.findIndex(caption=>caption.id===c.caption.id);if(index<0)captions.push(c.caption);else captions[index]=c.caption;
  }
  else if(c.type==='timeline.caption.delete'){p.timelineCaptions=(p.timelineCaptions??[]).filter(caption=>caption.id!==c.captionId);}
  else if(c.type==='timeline.caption.promote'){
   const screen=p.screens.find(screen=>screen.id===c.screenId),caption=screen?.captions.find(caption=>caption.id===c.captionId&&!caption.sourceCaptionId);
   if(!screen||!caption)throw new Error('Local caption not found');
   screen.captions=screen.captions.filter(caption=>caption.id!==c.captionId);
   if(!svgObjects(screen.svg).length&&!screen.captions.length&&!screen.narration.mediaId)screen.durationBase=screen.duration;
   (p.timelineCaptions??=[]).push(c.caption);
  }
  else if(c.type==='timeline.audio.attach'){
   p.media[c.mediaId]={name:c.name,type:c.mime,data:c.data};p.timelineAudio={mediaId:c.mediaId,start:c.start,duration:c.duration};for(const screen of p.screens)screen.narration={script:screen.narration.script};
  }
  else if(c.type==='timeline.audio.trim'){const audio=p.timelineAudio;if(!audio)throw new Error('No overall audio');const limit=audio.sourceDuration??(audio.sourceStart??0)+audio.duration;if(c.sourceStart+c.duration>limit)throw new Error('Audio trim exceeds its original duration');audio.sourceDuration=limit;audio.sourceStart=c.sourceStart;audio.duration=c.duration;for(const screen of p.screens)screen.cues=screen.cues.map(cue=>({...cue,review:true}));}
  else if(c.type==='timeline.audio.move'){if(!p.timelineAudio)throw new Error('No overall audio');p.timelineAudio.start=c.start;}
  else if(c.type==='project.settings'){
   const resized=p.width!==c.width||p.height!==c.height,ratio=c.fps/p.fps;
   const at=(value:number)=>Math.round(value*ratio);
   for(const screen of p.screens){
    if(resized){screen.svg=resizeSvgCanvas(screen.svg,p.width,p.height,c.width,c.height);screen.captions=screen.captions.map(({vector,vectorText,...caption})=>caption);}
    if(ratio!==1){
     screen.durationBase=Math.max(1,at(screen.durationBase??screen.duration));
     screen.lifetimes=Object.fromEntries(Object.entries(screen.lifetimes).map(([id,ranges])=>[id,ranges.map(range=>({...range,start:at(range.start),end:Math.max(at(range.start)+1,at(range.end))}))]));
     screen.clips=screen.clips.map(clip=>({...clip,start:at(clip.start),duration:Math.max(1,at(clip.start+clip.duration)-at(clip.start)),...(clip.stagger!==undefined?{stagger:at(clip.stagger)}:{})}));
     screen.captions=screen.captions.map(caption=>({...caption,start:at(caption.start),end:Math.max(at(caption.start)+1,at(caption.end))}));
     screen.cues=screen.cues.map(cue=>({...cue,frame:at(cue.frame),review:true}));
     if(screen.narration.duration!==undefined)screen.narration.duration=Math.ceil(screen.narration.duration*ratio);
     screen.duration=Math.max(1,at(screen.duration),screen.narration.duration??0,...screen.clips.map(clip=>clip.start+clip.duration),...screen.captions.map(caption=>caption.end),...screen.cues.map(cue=>cue.frame));
    }
   }
   if(resized&&p.timelineCaptions)p.timelineCaptions=p.timelineCaptions.map(({vector,vectorText,...caption})=>caption);
   p.width=c.width;p.height=c.height;p.fps=c.fps;
   if(ratio!==1&&p.timelineMarkers)p.timelineMarkers=p.timelineMarkers.map(marker=>({...marker,frame:Math.min(Math.round(marker.frame*ratio),p.screens.reduce((sum,screen)=>sum+screen.duration,0)-1)}));
   if(ratio!==1){if(p.timelineCaptions)p.timelineCaptions=p.timelineCaptions.map(caption=>({...caption,start:at(caption.start),end:Math.max(at(caption.start)+1,at(caption.end))}));if(p.timelineAudio)p.timelineAudio={...p.timelineAudio,start:at(p.timelineAudio.start),duration:Math.max(1,at(p.timelineAudio.duration)),...(p.timelineAudio.sourceStart!==undefined?{sourceStart:at(p.timelineAudio.sourceStart)}:{}),...(p.timelineAudio.sourceDuration!==undefined?{sourceDuration:Math.max(1,at(p.timelineAudio.sourceDuration))}:{})};}
  }
  else if(c.type==='screen.add'){
   const index=c.afterScreenId?p.screens.findIndex(screen=>screen.id===c.afterScreenId):p.screens.length-1;if(index<0)throw new Error('Source screen not found');
   p.screens.splice(index+1,0,continueScreen(p,p.screens[index],c.name,measurements));
  }
  else if('screenId'in c){
   const index=p.screens.findIndex(s=>s.id===c.screenId),s=p.screens[index];if(!s)throw new Error('Screen not found');
   switch(c.type){
    case 'screen.duplicate':{const copy=structuredClone(s);copy.id=uuid();copy.name+=' copy';copy.clips=copy.clips.map(clip=>({...clip,id:uuid()}));copy.captions=copy.captions.map(cap=>({...cap,id:uuid()}));p.screens.splice(index+1,0,copy);break;}
    case 'screen.delete':if(p.screens.length===1)throw new Error('Keep at least one screen');p.screens.splice(index,1);break;
    case 'screen.update':if(c.name!==undefined)s.name=c.name;if(c.duration!==undefined){s.duration=c.duration;s.durationBase=c.duration;}break;
    case 'canvas.background':s.svg=setCanvasBackground(s.svg,c.color,p.width,p.height);break;
    case 'screen.move':{const dest=index+c.delta;if(dest<0||dest>=p.screens.length)throw new Error('Screen is already at the boundary');[p.screens[index],p.screens[dest]]=[p.screens[dest],p.screens[index]];break;}
    case 'screen.reorder':{if(c.index>=p.screens.length)throw new Error('Screen destination is outside the project');p.screens.splice(index,1);p.screens.splice(c.index,0,s);break;}
    case 'artwork.import':s.svg=appendSvg(s.svg,c.svg);break;
    case 'artwork.commit':s.svg=commitSvg(c.svg,s.svg);break;
    case 'motionPreset.capture':{
     const clip=s.clips.find(clip=>clip.id===c.clipId);if(!clip)throw new Error('Motion clip not found');
     if(clip.targetObjectId||clip.from||clip.pivot||clip.terms||['Smooth match','Match terms','Highlight terms','Crossfade replacement'].includes(clip.preset))throw new Error('Save a preset without object-specific paths, pivots or replacement targets');
     const preset={id:c.presetId,name:c.name,fps:p.fps,settings:motionSettingsSchema.strip().parse(clip)},items=p.motionPresets??=[];
     const index=items.findIndex(item=>item.id===c.presetId);if(index<0)items.push(preset);else items[index]=preset;break;
    }
    case 'motion.apply':case 'motionPreset.apply':{
     const preset=c.type==='motion.apply'?{fps:p.fps,settings:c.settings}:p.motionPresets?.find(item=>item.id===c.presetId);if(!preset)throw new Error('Saved motion not found');
     const objects=svgObjects(s.svg),ids=[...new Set(c.objectIds)];
     if(ids.some(id=>!objects.some(object=>object.id===id)))throw new Error('Select existing shapes');
     removeSvgObjects(s.svg,ids);
     const ratio=p.fps/preset.fps;
     for(const objectId of ids){const clip=clipSchema.parse({...preset.settings,id:uuid(),objectId,start:c.start,duration:Math.max(1,Math.round(preset.settings.duration*ratio)),...(preset.settings.stagger!==undefined?{stagger:Math.round(preset.settings.stagger*ratio)}:{})});requirePresetSettings(clip);s.clips.push(clip);s.duration=Math.max(s.duration,clip.start+clip.duration);if(!layerSpans(s,objectId).some(range=>range.start<=clip.start&&clip.start+clip.duration<=range.end))throw new Error('Motion is outside the layer visibility range');}break;
    }
    case 'asset.capture':case 'asset.insert':case 'object.copy':case 'object.cut':case 'object.duplicate':case 'object.paste':{
     let payload=c.type==='asset.insert'?p.assets?.find(asset=>asset.id===c.assetId):this.clipboard;
     if(c.type!=='object.paste'&&c.type!=='asset.insert'){
      const svg=copySvgObjects(s.svg,c.objectIds),objects=svgObjects(svg),ids=new Set(objects.map(o=>o.id)),eqIds=new Set(objects.map(o=>o.equationId));
      if(s.clips.some(clip=>ids.has(clip.objectId)&&clip.targetObjectId&&!ids.has(clip.targetObjectId)))throw new Error('Copy both replacement objects or their containing group to preserve the target reference');
      payload={lifetimes:Object.fromEntries(Object.entries(s.lifetimes).filter(([id])=>ids.has(id))),fps:p.fps,svg,clips:s.clips.filter(clip=>ids.has(clip.objectId)),equations:s.equations.filter(eq=>eqIds.has(eq.id))};
     }
     if(!payload)throw new Error('Copy layers or choose an existing saved shape');
     if(c.type==='asset.capture'){const asset={...payload,id:c.assetId,name:c.name},items=p.assets??=[];const index=items.findIndex(item=>item.id===c.assetId);if(index<0)items.push(asset);else items[index]=asset;break;}
     if(c.type==='object.copy'){this.clipboard=structuredClone(payload);for(const listener of this.listeners)listener();return this.snapshot;}
     if(c.type==='object.cut'){
      s.svg=removeSvgObjects(s.svg,c.objectIds);const ids=new Set(svgObjects(s.svg).map(o=>o.id));s.clips=s.clips.filter(clip=>ids.has(clip.objectId));s.equations=s.equations.filter(eq=>svgObjects(s.svg).some(o=>o.equationId===eq.id));pendingClipboard=payload;
     }else{
      const source=parseSvg(payload.svg).elements;let fresh=importSvg(payload.svg);const next=parseSvg(fresh),remap=new Map(source.map((el,i)=>[el.getAttribute('id'),next.elements[i].getAttribute('id')!]));
      const equations=new Map(payload.equations.map(eq=>[eq.id,uuid()]));
      for(const el of next.elements){const eq=el.getAttribute('data-equation-id');if(eq&&equations.has(eq))el.setAttribute('data-equation-id',equations.get(eq)!);}
      // Serialize through the SVG parser's DOM, preserving the newly assigned IDs.
      fresh=new XMLSerializer().serializeToString(next.doc);
      const target=parseSvg(s.svg);target.doc.documentElement!.appendChild(target.doc.importNode(parseSvg(fresh).doc.documentElement!,true));s.svg=new XMLSerializer().serializeToString(target.doc);
      s.clips.push(...payload.clips.map(clip=>{const ratio=p.fps/payload!.fps,start=Math.round(clip.start*ratio);return {...clip,id:uuid(),objectId:remap.get(clip.objectId)!,...(clip.targetObjectId?{targetObjectId:remap.get(clip.targetObjectId)!}:{}),...(clip.stagger!==undefined?{stagger:Math.round(clip.stagger*ratio)}:{}),start,duration:Math.max(1,Math.round((clip.start+clip.duration)*ratio)-start)};}));for(const clip of s.clips)s.duration=Math.max(s.duration,clip.start+clip.duration);
      for(const [id,ranges] of Object.entries(payload.lifetimes)){const ratio=p.fps/payload.fps;s.lifetimes[remap.get(id)!]=ranges.map(range=>({...range,id:uuid(),start:Math.round(range.start*ratio),end:Math.max(Math.round(range.start*ratio)+1,Math.round(range.end*ratio))}));for(const range of s.lifetimes[remap.get(id)!])s.duration=Math.max(s.duration,range.end);}
      s.equations.push(...payload.equations.map(eq=>({...eq,id:equations.get(eq.id)!,terms:Object.fromEntries(Object.entries(eq.terms).map(([name,id])=>[name,remap.get(id)??id]))})));
     }
     break;
    }
    case 'object.outline':{
     removeSvgObjects(s.svg,c.objectIds);const parsed=parseSvg(s.svg);
     for(const id of [...new Set(c.objectIds)]){const node=parsed.elements.find(element=>element.getAttribute('id')===id);if(node?.localName!=='text'||!outlines[id])throw new Error('Text outlining is unavailable for this selection');const replacement=parsed.doc.createElementNS('http://www.w3.org/2000/svg','path');for(const attribute of Array.from(node.attributes))if(!['x','y','dx','dy','textLength','lengthAdjust','text-anchor','dominant-baseline','alignment-baseline','rotate'].includes(attribute.name))replacement.setAttribute(attribute.name,attribute.value);replacement.setAttribute('d',outlines[id]);replacement.setAttribute('data-text-source',node.textContent??'');replacement.setAttribute('data-name',node.getAttribute('data-name')||'Text');node.parentNode!.replaceChild(replacement,node);}
     s.svg=new XMLSerializer().serializeToString(parsed.doc);break;
    }
    case 'object.nudge':s.svg=nudgeSelection(s.svg,c.objectIds,c.x,c.y);break;
    case 'object.group':s.svg=groupSvgObjects(s.svg,c.objectIds);break;
    case 'object.unlink':unlinkObjects(s,c.objectIds);break;
    case 'object.continue':{
     const destination=p.screens[index+1];if(!destination)throw new Error('Add a scene after this one before continuing objects');
     carryObjects(p,s,destination,c.objectIds,measurements);break;
    }
    case 'object.link':{
     const source=p.screens.find(screen=>screen.id===c.sourceScreenId);if(!source)throw new Error('Source scene not found');
     carryObjects(p,source,s,c.objectIds,measurements);break;
    }
    case 'object.editMany':s.svg=editSelection(s.svg,c.objectIds,c.attributes);break;
    case 'object.transformSelection':s.svg=preserveStrokeWidths(transformSelection(s.svg,c.objectIds,c,measurements),s.svg);break;
    case 'object.alignSelection':s.svg=preserveStrokeWidths(alignSelection(s.svg,c.objectIds,c.action,measurements),s.svg);break;
    case 'object.ungroup':{
     if(c.objectIds.some(id=>s.lifetimes[id]))throw new Error('Reset group visibility to automatic before ungrouping');
     if(s.clips.some(clip=>c.objectIds.includes(clip.objectId)))throw new Error('Remove group animations before ungrouping; their timing cannot be transferred to children without changing motion');
     s.svg=ungroupSelection(s.svg,c.objectIds);break;
    }
    case 'object.boolean':{
     if(s.clips.some(clip=>c.objectIds.includes(clip.objectId)))throw new Error('Keep animated layers separate or group them. Boolean operations cannot preserve independent animation targets.');
     const ranges=c.objectIds.map(id=>JSON.stringify(layerSpans(s,id).map(({start,end})=>({start,end}))));if(ranges.some(range=>range!==ranges[0]))throw new Error('Shapes with different visibility ranges must stay separate or be grouped');
     s.svg=combineSelection(s.svg,c.objectIds,c.operation);break;
    }
    case 'object.deleteMany':{
     s.svg=removeSvgObjects(s.svg,c.objectIds);const ids=new Set(svgObjects(s.svg).map(object=>object.id));s.clips=s.clips.filter(clip=>ids.has(clip.objectId));s.equations=s.equations.filter(equation=>svgObjects(s.svg).some(object=>object.equationId===equation.id));break;
    }
    case 'object.edit':s.svg=editSvg(s.svg,c.objectId,c.attributes);break;
    case 'object.delete':s.svg=deleteSvgObject(s.svg,c.objectId);s.clips=s.clips.filter(clip=>svgObjects(s.svg).some(o=>o.id===clip.objectId));break;
    case 'layer.spans.reset':if(!svgObjects(s.svg).some(object=>object.id===c.objectId))throw new Error('Layer not found');delete s.lifetimes[c.objectId];break;
    case 'layer.span.put':{
     if(!svgObjects(s.svg).some(object=>object.id===c.objectId))throw new Error('Layer not found');
     const ranges=layerSpans(s,c.objectId),old=ranges.find(range=>range.id===c.span.id),next=ranges.filter(range=>range.id!==c.span.id&&(s.lifetimes[c.objectId]!==undefined||old||range.end<=c.span.start||range.start>=c.span.end));
     if(c.moveClips&&!old)throw new Error('Cannot move an unknown layer range');
     if(c.moveClips&&old){const delta=c.span.start-old.start;if(c.span.end-c.span.start!==old.end-old.start)throw new Error('Moving a layer range must preserve its duration');s.clips=s.clips.map(clip=>clip.objectId===c.objectId&&clip.start>=old.start&&clip.start+clip.duration<=old.end?{...clip,start:clip.start+delta}:clip);}
     next.push(c.span);s.lifetimes[c.objectId]=next.sort((a,b)=>a.start-b.start);s.duration=Math.max(s.duration,c.span.end);break;
    }
    case 'layer.span.delete':{
     const ranges=layerSpans(s,c.objectId),old=ranges.find(range=>range.id===c.spanId);if(!old)throw new Error('Layer range not found');
     s.lifetimes[c.objectId]=ranges.filter(range=>range.id!==c.spanId);s.clips=s.clips.filter(clip=>!(clip.objectId===c.objectId&&clip.start>=old.start&&clip.start+clip.duration<=old.end));break;
    }
    case 'clip.put':{
     const clip=clipSchema.parse(Object.fromEntries(Object.entries(c.clip).filter(([,value])=>value!==undefined)));requirePresetSettings(clip);if(clip.preset==='Stagger'&&clip.stagger===undefined)clip.stagger=Math.min(Math.max(1,Math.round(p.fps*.1)),Math.floor((clip.duration-1)/Math.max(1,svgObjects(s.svg).filter(object=>object.parentId===clip.objectId).length-1)));if(motionPhase(clip.preset)!=='effect'&&s.clips.some(other=>other.id!==clip.id&&other.objectId===clip.objectId&&motionPhase(other.preset)!=='effect'&&motionPhase(other.preset)!==motionPhase(clip.preset)&&clip.start<other.start+other.duration&&other.start<clip.start+clip.duration))throw new Error('Entrance and exit motions cannot overlap; move one outside the other');
     const index=s.clips.findIndex(x=>x.id===clip.id);if(index<0)s.clips.push(clip);else s.clips[index]=clip;s.duration=Math.max(s.duration,clip.start+clip.duration);
     if(!layerSpans(s,clip.objectId).some(range=>range.start<=clip.start&&clip.start+clip.duration<=range.end))throw new Error('This motion falls outside the layer visibility ranges. Move it inside a range or add an entrance first.');break;
    }
    case 'clip.delete':s.clips=s.clips.filter(x=>x.id!==c.clipId);break;
    case 'narration.script':s.narration.script=c.script;break;
    case 'narration.attach':p.media[c.mediaId]={name:c.name,type:c.mime,data:c.data};s.narration.mediaId=c.mediaId;s.narration.duration=c.duration;s.duration=Math.max(s.duration,c.duration+Math.max(1,Math.round(p.fps*.3)));s.cues=s.cues.map(c=>({...c,review:true}));break;
    case 'equation.terms':{const equation=s.equations.find(value=>value.id===c.equationId),group=svgObjects(s.svg).find(object=>object.equationId===c.equationId);if(!equation||!group)throw new Error('Equation not found');const parsed=parseSvg(s.svg),root=parsed.elements.find(node=>node.getAttribute('id')===group.id)!;const termIds=new Set(Array.from(root.getElementsByTagName('*')).map(node=>node.getAttribute('id')));const values=Object.values(c.terms);if(Object.keys(c.terms).length>1000||Object.entries(c.terms).some(([name,id])=>!name.trim()||name!==name.trim()||name.length>100||!termIds.has(id)||!svgObjects(s.svg).some(object=>object.id===id)))throw new Error('Each term must name an editable descendant of this equation');if(new Set(values).size!==values.length||values.some(id=>{const node=parsed.elements.find(node=>node.getAttribute('id')===id)!;return Array.from(node.getElementsByTagName('*')).some(child=>values.includes(child.getAttribute('id')??''));}))throw new Error('Named terms must be distinct and must not contain one another');equation.terms=c.terms;break;}
    case 'equation.put':{const i=s.equations.findIndex(e=>e.id===c.equation.id);if(c.equation.svg)parseSvg(c.equation.svg);if(i<0)s.equations.push(c.equation);else s.equations[i]=c.equation;break;}
    case 'equation.commit':{if(!c.equation.svg)throw new Error('Compiled equation vectors are missing');s.svg=putEquationSvg(s.svg,c.equation.id,c.equation.svg,p.width,p.height);const equation={...c.equation,compiledSource:c.equation.source};delete equation.diagnostic;const i=s.equations.findIndex(e=>e.id===equation.id);if(i<0)s.equations.push(equation);else s.equations[i]=equation;break;}
    case 'caption.put':{
     const original=p.timelineCaptions?.find(caption=>caption.id===c.caption.sourceCaptionId),previous=s.captions.find(caption=>caption.id===c.caption.id);
     if(original&&previous){const offset=screenOffsets(p)[index].start;Object.assign(original,{text:c.caption.text,draft:c.caption.draft,start:c.caption.start===previous.start?original.start:offset+c.caption.start,end:c.caption.end===previous.end?original.end:offset+c.caption.end});}
     else {if(c.caption.end>s.duration)s.duration=c.caption.end;const i=s.captions.findIndex(x=>x.id===c.caption.id);if(i<0)s.captions.push(c.caption);else s.captions[i]=c.caption;}break;
    }
    case 'caption.delete':{const caption=s.captions.find(caption=>caption.id===c.captionId);if(caption?.sourceCaptionId)p.timelineCaptions=p.timelineCaptions?.filter(value=>value.id!==caption.sourceCaptionId);else s.captions=s.captions.filter(x=>x.id!==c.captionId);break;}
    case 'cue.put':{const i=s.cues.findIndex(x=>x.id===c.cue.id);if(i<0)s.cues.push(c.cue);else s.cues[i]=c.cue;break;}
    case 'cue.delete':s.cues=s.cues.filter(cue=>cue.id!==c.cueId);break;
   }
  }
  for(const screen of p.screens){const ids=new Set(svgObjects(screen.svg).map(object=>object.id));screen.lifetimes=Object.fromEntries(Object.entries(screen.lifetimes).filter(([id])=>ids.has(id)));}
  if('screenId'in c&&/^(layer\.|clip\.|caption\.|narration\.attach$|cue\.|artwork\.|object\.(delete|cut|paste|duplicate|group|ungroup|boolean))/.test(c.type)){
   const screen=p.screens.find(screen=>screen.id===c.screenId);if(screen)screen.duration=contentDuration(screen);
  }
  if(batchScreens)for(const screen of p.screens)if(batchScreens.has(screen.id))screen.duration=contentDuration(screen);
  for(const screen of p.screens)compileMotionTargets(screen,measurements,measureContinuityText);
  syncProjectTimeline(p);
  syncContinuity(p,this.value,measurements,measureContinuityText);
  for(const screen of p.screens)compileMotionTargets(screen,measurements,measureContinuityText);
  p.revision=this.value.revision+1;const next=validateProject(p);if(pendingClipboard)this.clipboard=structuredClone(pendingClipboard);this.past.push(this.snapshot);if(this.past.length>100)this.past.shift();this.future=[];return this.publish(next,c.type,source);
 }
}
