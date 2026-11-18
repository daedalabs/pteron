import {atomicCopy} from '../src/core/persistence';
import { spawn,type ChildProcess } from 'node:child_process';
import { mkdir,writeFile,readFile,rm,unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserWindow,app,Notification } from 'electron';
import {workerRuntime,texRuntime} from './runtime';
import type { ProjectService } from '../src/core/service';
import { createEvaluator } from '../src/core/motion';
import {defaultNarrationMix} from '../src/core/model';
import {captionLayout,captionPose,captionTexts,captionVectorKey,posedCaptionVector,previewCaptionTexts} from '../src/core/caption-style';
import {screenOffsets} from '../src/core/project-timeline';
import {svgObjects,parseSvg} from '../src/core/svg';
import {compileEquationSvg} from '../src/core/math-svg';
export type Job={id:string,kind:string,revision:number,status:'running'|'completed'|'failed'|'cancelled',progress:number,startedAt?:number,finishedAt?:number,phase?:string,diagnostic?:string,path?:string,stale?:boolean,cancellable?:boolean,screenId?:string,equationId?:string,objectId?:string,frameIndex?:number,frame?:number};
export class Jobs{
 jobs=new Map<string,Job>();children=new Map<string,ChildProcess>();
 private captionPreview?:{key:string,result:Promise<{key:string,vectors:string[]}>};
 private captionPreviewQueue:Promise<unknown>=Promise.resolve();
 constructor(readonly service:ProjectService,readonly cache:string,readonly root:string,readonly ui:string){}
 list(){return [...this.jobs.values()].map(j=>({...j,elapsedMs:(j.finishedAt??Date.now())-(j.startedAt??Date.now()),remainingMs:j.status==='running'&&j.progress>.05?Math.round((Date.now()-(j.startedAt??Date.now()))*(1-j.progress)/j.progress):undefined,stale:j.revision!==this.service.store.snapshot.revision}));}
 get rendering(){return [...this.jobs.values()].some(job=>job.kind==='render'&&job.status==='running');}
 cancel(id:string){const job=this.jobs.get(id);if(!job)throw new Error('Job not found');if(job.status!=='running'||job.cancellable===false)return job;job.status='cancelled';job.finishedAt=Date.now();const child=this.children.get(id);if(child?.pid){if(process.platform==='win32')spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true});else child.kill();}return job;}
 start(kind:string,work:(job:Job)=>Promise<void>){const job:Job={id:crypto.randomUUID(),kind,revision:this.service.store.snapshot.revision,status:'running',progress:0,startedAt:Date.now()};this.jobs.set(job.id,job);void work(job).then(()=>{if(job.status==='running'){job.status='completed';job.progress=1;job.finishedAt=Date.now();}}).catch(e=>{if(job.status==='running'){job.status='failed';job.finishedAt=Date.now();job.diagnostic=e instanceof Error?e.message:String(e);}});return job;}
 async worker(job:Job,request:unknown,range={start:0,end:1}){
  if(job.status!=='running')throw new Error('Cancelled');
  const work=join(this.cache,job.id);await mkdir(work,{recursive:true});const path=join(work,'request.json');await writeFile(path,JSON.stringify(request));
  if(job.status!=='running')throw new Error('Cancelled');
  const runtime=workerRuntime(this.root,process.resourcesPath,app.isPackaged);
  const tex=texRuntime(this.root,process.resourcesPath,process.env.PORTABLE_EXECUTABLE_DIR);
  return new Promise<any>((resolve,reject)=>{const child=spawn(runtime.executable,[...runtime.args,path],{cwd:work,windowsHide:true,env:{...process.env,PTERON_SOURCE_PDF_TEX:undefined,...runtime.env,PTERON_TEX_ROOT:tex??process.env.PTERON_TEX_ROOT}});this.children.set(job.id,child);let buffer='',diagnostic='',protocolError='',result:any;const timeout=setTimeout(()=>{if(this.jobs.has(job.id))this.cancel(job.id);else child.kill();reject(new Error('Worker timed out'));},600000);
   child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(line.startsWith('PTERON:'))try{const value=JSON.parse(line.slice(7));if(typeof value.progress==='number')job.progress=range.start+(range.end-range.start)*Math.max(0,Math.min(1,value.progress));if(typeof value.error==='string')protocolError=value.error;if(typeof value.errorObjectId==='string')job.objectId=value.errorObjectId;if(Number.isInteger(value.errorFrame))job.frameIndex=value.errorFrame;if(value.result)result=value.result;}catch{}}});
   child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-8000);});child.on('error',e=>{clearTimeout(timeout);reject(e);});child.on('close',code=>{clearTimeout(timeout);this.children.delete(job.id);if(job.status==='cancelled')reject(new Error('Cancelled'));else if(code!==0||!result)reject(new Error(protocolError||diagnostic||'Worker failed'));else resolve(result);});
  });
 }
 previewCaptions(screenId:string){
  const project=this.service.store.snapshot;
  const texts=previewCaptionTexts(project.screens,screenId),key=captionVectorKey(project,texts);
  if(this.captionPreview?.key===key)return this.captionPreview.result;
  const result=this.captionPreviewQueue.then(async()=>{
   if(this.captionPreview?.result!==result||!texts.length)return {key,vectors:[]};
   const job:Job={id:crypto.randomUUID(),kind:'caption preview',revision:project.revision,status:'running',progress:0};
   try{
    const {vectors}=await this.worker(job,{operation:'captions',texts,...captionLayout(project)});
    return {key,vectors:vectors as string[]};
   }finally{await rm(join(this.cache,job.id),{recursive:true,force:true});}
  });
  this.captionPreview={key,result};
  this.captionPreviewQueue=result.catch(()=>{if(this.captionPreview?.result===result)this.captionPreview=undefined;});
  return result;
 }
 equation(screenId:string,source:string,equationId?:string){
  const screen=this.service.screen(screenId),previous=screen.equations.find(e=>e.id===equationId);
  if(equationId&&!previous)throw new Error('Equation not found');
  return this.start('equation',async job=>{
   const id=equationId??crypto.randomUUID();job.screenId=screenId;job.equationId=id;
   const draft={id,source,terms:previous?.terms??{},svg:previous?.svg??'',compiledSource:previous?.compiledSource??(previous?.svg?previous.source:undefined)};
   await this.service.call('command',{revision:job.revision,command:{type:'equation.put',screenId,equation:draft}});job.revision=this.service.store.snapshot.revision;
   try{
    if(job.status!=='running')return;
    const svg=compileEquationSvg(source);
    if(job.status!=='running')return;
    if(this.service.store.snapshot.revision!==job.revision)throw new Error('Equation result is stale; source work is preserved. Compile again.');
    await this.service.call('command',{revision:job.revision,command:{type:'equation.commit',screenId,equation:{...draft,svg}}});
    job.revision=this.service.store.snapshot.revision;job.objectId=svgObjects(this.service.screen(screenId).svg).find(o=>o.equationId===id)?.id;
   }catch(error){
    if(this.service.store.snapshot.revision===job.revision)await this.service.call('command',{revision:job.revision,command:{type:'equation.put',screenId,equation:{...draft,diagnostic:error instanceof Error?error.message:String(error)}}});
    throw error;
   }
  });
 }
 audio(screenId:string,path:string,mime:'audio/wav'|'audio/mpeg'){return this.start('audio',async job=>{const result=await this.worker(job,{operation:'audio',path,fps:this.service.store.snapshot.fps});if(job.status!=='running')return;const p=this.service.store.snapshot;if(p.revision!==job.revision)throw new Error('Audio result is stale; import again.');await this.service.call('command',{revision:p.revision,command:{type:'narration.attach',screenId,mediaId:crypto.randomUUID(),name:path.split(/[\\/]/).pop(),mime,data:(await readFile(path)).toString('base64'),duration:result.duration}});});}
 audioTimeline(path:string,mime:'audio/wav'|'audio/mpeg',start=0){return this.start('audio',async job=>{const result=await this.worker(job,{operation:'audio',path,fps:this.service.store.snapshot.fps});if(job.status!=='running')return;const project=this.service.store.snapshot;if(project.revision!==job.revision)throw new Error('Audio result is stale; import again.');await this.service.call('command',{revision:project.revision,command:{type:'timeline.audio.attach',mediaId:crypto.randomUUID(),name:path.split(/[\\/]/).pop(),mime,data:(await readFile(path)).toString('base64'),start,duration:result.duration}});});}
 render(output:string,quality:'draft'|'final'='final'){
  if(this.rendering)throw new Error('An export is already running.');
  const project=this.service.store.snapshot;return this.start('render',async job=>{
  if(project.width%2||project.height%2)throw new Error('MP4 export requires even dimensions; artwork is unchanged.');
  const work=join(this.cache,job.id);await mkdir(work,{recursive:true});
  const mix=project.narrationMix??defaultNarrationMix;
  const audioGain=mix.muted?0:mix.volume/100;
  const audio:{path:string,start:number,duration:number,sourceStart:number}[]=[];const audioFiles=new Map<string,string>();let offset=0;
  for(const screen of project.screens){if(audioGain>0&&screen.narration.mediaId){const media=project.media[screen.narration.mediaId],path=audioFiles.get(screen.narration.mediaId)??join(work,`audio-${screen.narration.mediaId}.${media.type==='audio/wav'?'wav':'mp3'}`);if(!audioFiles.has(screen.narration.mediaId)){await writeFile(path,Buffer.from(media.data,'base64'));audioFiles.set(screen.narration.mediaId,path);}audio.push({path,start:offset+(screen.narration.offset??0),duration:screen.narration.duration??screen.duration,sourceStart:screen.narration.sourceStart??0});}offset+=screen.duration;}
  job.phase='Preparing captions';const texts=captionTexts(project.screens.flatMap(s=>s.captions));
  const vectors=texts.length?(await this.worker(job,{operation:'captions',texts,...captionLayout(project)},{start:0,end:.05})).vectors:[];const captionVectors=new Map<string,string>(texts.map((text,i)=>[text,vectors[i]]));
  const captionSources=new Map((project.timelineCaptions??[]).map(caption=>[caption.id,caption]));
  job.phase='Preparing frames';job.progress=.05;const totalFrames=project.screens.reduce((sum,screen)=>sum+screen.duration,0);
  const browser=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});const frames:string[]=[];
  try{
   await browser.loadFile(join(this.ui,'geometry.html'));await browser.webContents.executeJavaScript('Boolean(window.sampleSvg)');
   let index=0;
   for(const {screen,start} of screenOffsets(project)){
    if(job.status!=='running')return;
    const sample=createEvaluator(screen);
    for(let frame=0;frame<screen.duration;frame++){
     if(job.status!=='running')return;
     const poses=sample(frame);
     const active=screen.captions.flatMap(c=>{
      const vector=captionVectors.get(c.text);
      if(!vector||frame<c.start||frame>=c.end)return [];
      return [posedCaptionVector(vector,captionPose(project,c,frame,start,captionSources),project.width,project.height)];
     });
     const source=await browser.webContents.executeJavaScript(`window.sampleSvg(${JSON.stringify(screen.svg)},${JSON.stringify(poses)},${JSON.stringify(active)})`);const name=`frame-${index++}.svg`;await writeFile(join(work,name),source);frames.push(name);job.progress=.05+.35*index/totalFrames;
    }
   }
  }finally{browser.destroy();}
  job.phase='Rendering video';const result=await this.worker(job,{operation:'render',work,width:project.width,height:project.height,fps:project.fps,frames,audio,audioGain,quality},{start:.4,end:.95}).catch(error=>{
   const index=job.frameIndex??0,entry=screenOffsets(project).find(entry=>entry.start<=index&&index<entry.end);
   if(entry){job.screenId=entry.screen.id;job.frame=index-entry.start;const objects=svgObjects(entry.screen.svg),ids=new Set(objects.map(object=>object.id));if(job.objectId&&!ids.has(job.objectId)){const parsed=parseSvg(entry.screen.svg),node=parsed.elements.find(node=>node.getAttribute('id')===job.objectId);let parent=node?.parentNode;while(parent?.nodeType===1&&!ids.has((parent as typeof parsed.elements[number]).getAttribute('id')??''))parent=parent.parentNode;const owner=parent?.nodeType===1?(parent as typeof parsed.elements[number]).getAttribute('id'):undefined;job.objectId=owner??objects.find(object=>Object.values(object.attributes).some(value=>value.includes(`#${job.objectId}`)))?.id;}}
   throw error;
  });
  if(job.status!=='running')return;
  job.phase='Saving video';
  job.cancellable=false;
  await atomicCopy(result.path,output);
  job.path=output;
  if(app.isPackaged){
   try{
    if(Notification.isSupported()){
     new Notification({title:'Pteron Export Complete',body:output.split(/[/\\]/).pop()+' ready'}).show();
    }
   }catch{}
  }
 });}
}
