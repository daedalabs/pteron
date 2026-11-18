import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {z} from 'zod';
import {ContinuityMeasurementRequired,continuityTextKey} from './continuity';
import {parseSrt,screenOffsets,timelineCaptions} from './project-timeline';
import {initializeGeometry,selectionInfo,type TextMeasurements} from './selection';
import { ProjectStore } from './store';
import { presetsAtFps, sampledPlan } from './motion';
import { svgObjects,parseSvg } from './svg';
import { loadProject, saveProject, atomicWrite } from './persistence';
import {bakeMotionSvg,motionGeometry} from './selection';
import {evaluate} from './motion';
import {continuityRoots,sameAttribute} from './continuity';
import {commandSchema} from './commands';
import {clipSchema} from './model';
import {motionDefaults} from './motion-defaults';
import {RecoveryHistory} from '../../electron/recovery-history';
export class ProjectService{
 measureText?: (svg:string)=>Promise<TextMeasurements>;
 outlineText?: (svg:string,objectIds:string[])=>Promise<Record<string,string>>;
 store=new ProjectStore();path:string|undefined;
 recoveryHistory: RecoveryHistory;
 private savedContent:string|undefined;
 private lastAutosaveTime = 0;
 private contentKey(project=this.store.snapshot){return createHash('sha256').update(JSON.stringify({...project,revision:0})).digest('hex');}
 get document(){return {path:this.path,dirty:!this.path||this.contentKey()!==this.savedContent};}
 private persistence:Promise<void>=Promise.resolve();
 private persist(){const p=this.store.snapshot;this.persistence=this.persistence.catch(()=>{}).then(()=>saveProject(this.recoveryPath,p));return this.persistence;}
 private snapshotCommand(){
  const now = Date.now();
  const interval = this.recoveryHistory.autosaveIntervalMs ?? (process.env.PTERON_AUTOSAVE_INTERVAL !== undefined ? Number(process.env.PTERON_AUTOSAVE_INTERVAL) : 60000);
  if(now - this.lastAutosaveTime < interval) return;
  this.lastAutosaveTime = now;
  void this.recoveryHistory.saveSnapshot(this.store.snapshot, 'autosave', this.path).catch(()=>{});
 }
 constructor(readonly recoveryPath:string, recoveryHistory?: RecoveryHistory){
  this.recoveryHistory = recoveryHistory ?? new RecoveryHistory(join(dirname(recoveryPath), 'recoveries'));
 }
 async flush():Promise<void>{
  await this.persistence;
  await this.recoveryHistory.flush();
 }
 async call(method:string,args:Record<string,any>={},source='manual'):Promise<any>{
  const compact=source==='mcp'&&args.response==='compact';
  switch(method){
   case 'state':return {project:this.store.snapshot,history:this.store.history,clipboardAvailable:this.store.clipboardAvailable,activity:this.store.activity,path:this.path,document:this.document};
   case 'project.summary':{
    const project=this.store.snapshot,{id,name,revision,width,height,fps}=project;
    const offsets=screenOffsets(project);
    return {id,name,revision,width,height,fps,totalFrames:offsets.at(-1)!.end,dirty:this.document.dirty,history:this.store.history,
     scenes:offsets.map(({screen,start,end})=>({id:screen.id,name:screen.name,start,end,clipCount:screen.clips.length,captionCount:screen.captions.length}))};
   }
   case 'presets':return presetsAtFps(this.store.snapshot.fps);
   case 'motion.defaults':{const screen=this.screen(args.screenId);await initializeGeometry();const geometry=selectionInfo(screen.svg,args.objectIds,await this.measureText?.(screen.svg));if(!geometry.bounds)throw new Error(geometry.geometryError??'Shape bounds unavailable');return motionDefaults(clipSchema.shape.preset.parse(args.preset),geometry.bounds,screen,this.store.snapshot.fps);}
   case 'recovery.info':{
    try{const [project,file]=await Promise.all([loadProject(this.recoveryPath),stat(this.recoveryPath)]);return {available:true,name:project.name,width:project.width,height:project.height,fps:project.fps,scenes:project.screens.length,frames:project.screens.reduce((sum,screen)=>sum+screen.duration,0),modifiedAt:file.mtime.toISOString(),svg:project.screens[0].svg};}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {available:false};throw error;}
   }
   case 'objects':{
    const all=svgObjects(this.screen(args.screenId).svg);
    const objects=args.objectId===undefined?all:all.filter(object=>object.id===args.objectId);
    if(!compact)return objects;
    return objects.map(({id,name,type,parentId,equationId,hidden,locked})=>({
     id,name,type,parentId,equationId,hidden:hidden||undefined,locked:locked||undefined
    }));
   }
   case 'selection.info':{const svg=this.screen(args.screenId).svg;await initializeGeometry();return selectionInfo(svg,args.objectIds,await this.measureText?.(svg));}
   case 'motion.geometry':{
    const svg=this.screen(args.screenId).svg;await initializeGeometry();return motionGeometry(svg,args.objectId,await this.measureText?.(svg));
   }
   case 'continuity.info':{
    const project=this.store.snapshot,screen=this.screen(args.screenId),rootId=continuityRoots(screen,[args.objectId])[0],sourceId=screen.links[rootId]??screen.links[args.objectId],source=project.screens.find(scene=>scene.id===sourceId);
    if(!source)return {rootId,overrides:[]};
    await initializeGeometry();const final=bakeMotionSvg(source.svg,evaluate(source,source.duration-1),await this.measureText?.(source.svg));
    const before=parseSvg(final).elements.find(node=>node.getAttribute('id')===args.objectId),current=parseSvg(screen.svg).elements.find(node=>node.getAttribute('id')===args.objectId);
    const names=new Set([...(before?Array.from(before.attributes).map(attribute=>attribute.name):[]),...(current?Array.from(current.attributes).map(attribute=>attribute.name):[])]);
    const overrides=[...names].filter(name=>!['id','class'].includes(name)&&!sameAttribute(name,before?.getAttribute(name)??null,current?.getAttribute(name)??null));
    if(before?.textContent!==current?.textContent)overrides.push('textContent');
    return {rootId,sourceId,sourceName:source.name,frame:source.duration-1,overrides};
   }
   case 'command.preview':case 'command':{
    const targetStore=method==='command.preview'?new ProjectStore(this.store.snapshot):this.store,baseRevision=targetStore.snapshot.revision;
    await initializeGeometry();let measurements:TextMeasurements={};
    let outlines:Record<string,string>={};if(args.command?.type==='object.outline'){const command=commandSchema.parse(args.command);if(command.type==='object.outline'){if(!this.outlineText)throw new Error('Text outlining is unavailable in this runtime');outlines=await this.outlineText(this.screen(command.screenId).svg,command.objectIds);}}
    if(['object.transformSelection','object.alignSelection','object.continue','object.link','screen.add'].includes(args.command?.type))measurements=await this.measureText?.((args.command.type==='screen.add'?(args.command.afterScreenId?this.screen(args.command.afterScreenId):this.store.snapshot.screens.at(-1)!):this.screen(args.command.type==='object.link'?args.command.sourceScreenId:args.command.screenId)).svg)??{};
    const cache=new Map<string,TextMeasurements[string]>();
    const measure=(svg:string)=>{
     const result:TextMeasurements={};
     for(const node of parseSvg(svg).elements.filter(node=>node.localName==='text')){const box=cache.get(continuityTextKey(node));if(!box)throw new ContinuityMeasurementRequired(svg);result[node.getAttribute('id')!]=box;}
     return result;
    };
    let result;
    while(true){
     try{result=targetStore.dispatch(args.command,args.revision,source,measurements,this.measureText?measure:undefined,outlines);break;}
     catch(error){
      if(!(error instanceof ContinuityMeasurementRequired)||!this.measureText)throw error;
      const boxes=await this.measureText(error.svg);
      for(const node of parseSvg(error.svg).elements.filter(node=>node.localName==='text')){const box=boxes[node.getAttribute('id')!];if(!box)throw new Error('Text bounds are unavailable for scene continuity; editable work has been preserved');cache.set(continuityTextKey(node),box);}
     }
    }
    if(method==='command.preview')return compact?{baseRevision,proposedRevision:result.revision}:{project:result,baseRevision};
    if(args.command?.type==='project.create'){
     await this.recoveryHistory.saveSnapshot(this.store.snapshot,'replace',this.path);
     this.path=undefined;this.savedContent=undefined;
    }
    await this.persist();
    this.snapshotCommand();
    return compact?{revision:result.revision}:result;
   }
   case 'open':{
    await this.recoveryHistory.saveSnapshot(this.store.snapshot,'replace',this.path);
    const p=await loadProject(args.path);
    const result=this.store.replace(p,args.revision,source);
    this.path=args.path;this.savedContent=this.contentKey(result);
    await this.persist();
    return compact?{revision:result.revision}:result;
   }
   case 'save':{const path=args.path??this.path;if(typeof path!=='string'||!path.toLowerCase().endsWith('.pteron'))throw new Error('Choose a .pteron package');const project=this.store.snapshot;await saveProject(path,project);this.path=path;this.savedContent=this.contentKey(project);return {path,revision:project.revision};}
   case 'recover':{
    const id=args.id!==undefined?z.string().regex(/^[a-z0-9-]{1,64}$/).parse(args.id):undefined;
    const targetPath=id?join(this.recoveryHistory.directory,`${id}.pteron`):this.recoveryPath;
    const p=await loadProject(targetPath);
    await this.recoveryHistory.saveSnapshot(this.store.snapshot,'replace',this.path,id);
    const result=this.store.replace(p,args.revision,source);
    await this.persist();
    return compact?{revision:result.revision}:result;
   }
   case 'recovery.list':return this.recoveryHistory.list();
   case 'recovery.read':{
    const id=z.string().regex(/^[a-z0-9-]{1,64}$/).parse(args.id);
    return this.recoveryHistory.read(id);
   }
   case 'recovery.delete':{
    const id=z.string().regex(/^[a-z0-9-]{1,64}$/).parse(args.id);
    return this.recoveryHistory.delete(id);
   }
   case 'preview':return {fps:this.store.snapshot.fps,revision:this.store.snapshot.revision,screenId:args.screenId,samples:sampledPlan(this.screen(args.screenId))};
   case 'srt.import':{const captions=parseSrt(args.path?await readFile(args.path,'utf8'):args.source,this.store.snapshot.fps);return this.call('command',{command:{type:'timeline.captions.import',captions},revision:args.revision,response:args.response},source);}
   case 'srt':{const text=this.srt();if(args.path)await atomicWrite(args.path,new TextEncoder().encode(text));return {text};}
   default:throw new Error(`Unknown operation: ${method}`);
  }
 }
 screen(id:string){const s=this.store.snapshot.screens.find(s=>s.id===id);if(!s)throw new Error('Screen not found');return s;}
 srt(){let offset=0,index=1;const blocks:string[]=[];const stamp=(frame:number)=>{const ms=Math.round(frame*1000/this.store.snapshot.fps);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};for(const c of timelineCaptions(this.store.snapshot))blocks.push(`${index++}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`);return blocks.join('\n');}
}
