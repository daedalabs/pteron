import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {workerRuntime} from '../electron/runtime';

const work=resolve('artifacts/project-settings');await mkdir(work,{recursive:true});
const python=workerRuntime(resolve('.'),resolve('artifacts/project-settings'),false);
const verify=(code:string,file:string)=>spawnSync(python.executable,['-c',code,file],{env:{...process.env,...python.env},encoding:'utf8',windowsHide:true});
const app=await electron.launch({args:['.',`--user-data-dir=${work}/profile-${Date.now()}`]});
try {
 const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.locator('.canvas-tools').waitFor();
 const state=()=>page.evaluate(()=>window.pteron.call('state'));
 let p=(await state()).project;const screenId=p.screens[0].id;
 await page.evaluate(({revision,screenId})=>window.pteron.call('command',{revision,command:{type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect data-name="Outlined tile" x="16" y="16" width="48" height="48" fill="#3366cc" stroke="#ff0000" stroke-width="8"/></svg>'}}),{revision:p.revision,screenId});
 await page.locator('.layers').getByRole('button',{name:'Outlined tile',exact:true}).click();
 await page.getByRole('button',{name:'Stroke color',exact:true}).click();
 const alpha=page.getByRole('spinbutton',{name:'Stroke alpha percent',exact:true});await alpha.fill('40');await alpha.press('Tab');
 await page.waitForFunction(async screenId=>(await window.pteron.call('objects',{screenId}))[0].attributes['stroke-opacity']==='0.4',screenId);
 await page.getByRole('slider',{name:'Stroke alpha',exact:true}).focus();await page.keyboard.press('ArrowRight');
 await page.waitForFunction(async screenId=>(await window.pteron.call('objects',{screenId}))[0].attributes['stroke-opacity']==='0.41',screenId);
 await page.screenshot({path:`${work}/stroke-alpha.png`});await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.waitForFunction(async screenId=>(await window.pteron.call('objects',{screenId}))[0].attributes['stroke-opacity']==='0.4',screenId);
 const openSettings=()=>app.evaluate(({Menu,BrowserWindow})=>{const item=Menu.getApplicationMenu()!.items[0].submenu!.items.find(item=>item.label==='Project settings…')!;item.click(item,BrowserWindow.getAllWindows()[0],{} as any);});
 await openSettings();await page.getByRole('dialog',{name:'Project settings',exact:true}).waitFor();
 await page.getByRole('spinbutton',{name:'Project width',exact:true}).fill('128');
 await page.getByRole('spinbutton',{name:'Project height',exact:true}).fill('96');
 await page.getByRole('spinbutton',{name:'Project frame rate',exact:true}).fill('24');
 await page.screenshot({path:`${work}/settings.png`});await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.waitForFunction(async()=>{const p=(await window.pteron.call('state')).project;return p.width===128&&p.height===96&&p.fps===24;});
 await page.waitForFunction(()=>document.title.includes('128 × 96')&&document.title.includes('24 fps'));
 assert.equal((await state()).project.screens[0].duration,72);
 await page.getByRole('slider',{name:'Playhead',exact:true}).press('PageDown');assert.equal(await page.getByRole('slider',{name:'Playhead',exact:true}).getAttribute('aria-valuenow'),'24');
 assert.match(await page.locator('.timecode').innerText(),/1.00 \/ 3.00s/);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(async()=>(await window.pteron.call('state')).project.fps===30);
 await page.getByRole('button',{name:'Redo',exact:true}).click();await page.waitForFunction(async()=>(await window.pteron.call('state')).project.fps===24);
 // Keep the real export small; a complete audio import/render checks both worker paths.
 p=(await state()).project;await page.evaluate(({revision,screenId})=>window.pteron.call('command',{revision,command:{type:'screen.update',screenId,duration:24}}),{revision:p.revision,screenId});
 const audioPath=resolve(work,'tone.wav'),samples=12000,wav=Buffer.alloc(44+samples*2);
 wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/48000)*10000),44+i*2);await writeFile(audioPath,wav);
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},audioPath);
 await page.getByRole('button',{name:'Narration',exact:true}).click();await page.getByRole('button',{name:'Import audio',exact:true}).click();
 for(let attempt=0;attempt<300;attempt++){const jobs=await page.evaluate(()=>window.pteron.call('jobs'));const audio=jobs.find((job:any)=>job.kind==='audio');if(audio?.status==='failed')throw new Error(audio.diagnostic);if(audio?.status==='completed')break;await page.waitForTimeout(100);}
 assert.equal((await state()).project.screens[0].narration.duration,6);
 await page.evaluate(async()=>{
  let {project}=await window.pteron.call('state');
  await window.pteron.call('command',{revision:project.revision,command:{type:'canvas.background',screenId:project.screens[0].id,color:'#101010'}});
  ({project}=await window.pteron.call('state'));
  await window.pteron.call('command',{revision:project.revision,command:{type:'timeline.caption.put',caption:{id:'caption-probe',start:0,end:18,text:'Caption style',draft:false}}});
 });
 await page.getByRole('button',{name:'Narration settings',exact:true}).click();
 await page.getByRole('spinbutton',{name:'Volume (%)'}).fill('40');
 await page.getByRole('combobox',{name:'Font',exact:true}).selectOption('Georgia');
 await page.getByRole('combobox',{name:'Style',exact:true}).selectOption('Italic');
 await page.getByRole('spinbutton',{name:'Size (%)',exact:true}).fill('155');
 await page.getByRole('combobox',{name:'Entrance',exact:true}).selectOption('Pop');
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.getByRole('dialog',{name:'Project narration'}).waitFor({state:'hidden'});
 assert.deepEqual((await state()).project.captionStyle,{font:'Georgia',variant:'Italic',size:155,entrance:'Pop'});
 const captionVector=page.locator('svg.caption-overlay > svg,svg.caption-overlay > g > svg');
 await captionVector.waitFor();
 const previewFrames=[await captionVector.evaluate(vector=>({markup:new XMLSerializer().serializeToString(vector),transform:vector.parentElement?.getAttribute('transform')??null}))];
 assert.match(previewFrames[0].transform??'',/scale\(0\./);
 const playhead=page.getByRole('slider',{name:'Playhead',exact:true});
 await playhead.press('Home');
 for(let i=0;i<4;i++)await playhead.press('ArrowRight');
 assert.equal(await playhead.getAttribute('aria-valuenow'),'4');
 previewFrames.push(await captionVector.evaluate(vector=>({markup:new XMLSerializer().serializeToString(vector),transform:vector.parentElement?.getAttribute('transform')??null})));
 assert.equal(previewFrames[1].transform,null);
 async function finishJob(id?:string){
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
   const current=(await page.evaluate(()=>window.pteron.call('jobs'))).find((item:any)=>id?item.id===id:item.kind==='equation');
   if(current&&current.status!=='running')return current;
   await page.waitForTimeout(100);
  }
  throw new Error('Worker job timed out');
 }
 if(process.argv.includes('--latex')){
  await page.getByRole('button',{name:'LaTeX equation',exact:true}).click();
  const source='\\frac{x^2+7}{\\sqrt{y+3}}=z';
  await page.getByLabel('LaTeX source',{exact:true}).fill(source);
  await page.getByRole('button',{name:'Compile',exact:true}).click();
  const compiled=await finishJob();
  assert.equal(compiled.status,'completed',compiled.diagnostic??compiled.status);
  const equation=(await state()).project.screens[0].equations[0];
  assert.equal(equation.compiledSource,source);
  assert.match(equation.svg,/<path\b/);
  assert.doesNotMatch(equation.svg,/<(?:image|text|use)\b/);
  await page.frameLocator('iframe').locator('[data-equation-id] path').first().waitFor();
  const invalid=await page.evaluate(({screenId,equationId})=>window.pteron.call('equation.compile',{screenId,equationId,source:'\\frac{1}{'}),{screenId,equationId:equation.id});
  const failed=await finishJob(invalid.id);
  assert.equal(failed.status,'failed');
  assert.equal((await state()).project.screens[0].equations[0].svg,equation.svg);
  await page.evaluate(async screenId=>{
   const {project}=await window.pteron.call('state');
   const object=(await window.pteron.call('objects',{screenId})).find((item:any)=>item.equationId);
   await window.pteron.call('command',{revision:project.revision,command:{type:'object.edit',screenId,objectId:object.id,attributes:{fill:'#ffffff',transform:'translate(-120 -67) scale(3)'}}});
  },screenId);
  await page.frameLocator('iframe').locator('[data-equation-id] path[fill="#ffffff"]').first().waitFor();
  await page.getByRole('button',{name:'Narration',exact:true}).click();
 }
 async function exportVideo(name:string){
  const output=resolve(work,name);
  await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},output);
  const job=await page.evaluate(()=>window.pteron.call('render',{}));
  const result=await finishJob(job.id);
  assert.equal(result.status,'completed',result.diagnostic??result.status);
  return {output,jobId:job.id};
 }
 const {output,jobId}=await exportVideo('export.mp4');
 const jobDir=await app.evaluate(({app},id)=>app.getPath('userData')+'/jobs/'+id,jobId);
 const sampled=await Promise.all([0,4].map(frame=>readFile(resolve(jobDir,`frame-${frame}.svg`),'utf8')));
 const renderedFrames=await page.evaluate(frames=>frames.map((frame,index)=>{
  const root=new DOMParser().parseFromString(frame,'image/svg+xml').documentElement;
  const parent=root.lastElementChild!;
  const vector=index===0?parent.firstElementChild!:parent;
  return {markup:new XMLSerializer().serializeToString(vector),transform:index===0?parent.getAttribute('transform'):null};
 }),sampled);
 assert.deepEqual(renderedFrames,previewFrames,'Caption glyph paths and entrance transforms match preview at the same frames');
 if(process.argv.includes('--latex')){
  const equationPixels=verify("import av,sys,numpy as np; c=av.open(sys.argv[1]); frame=next(c.decode(video=0)).to_ndarray(format='rgb24'); assert np.any(np.min(frame[30:55],axis=2)>160), 'Compiled equation is missing from the exported frame'",output);
  assert.equal(equationPixels.status,0,equationPixels.stderr);
 }
 const captionPixels=verify("import av,sys,numpy as np; c=av.open(sys.argv[1]); pixels=[np.count_nonzero(np.min(f.to_ndarray(format='rgb24')[70:,:,:],axis=2)>160) for f in c.decode(video=0)]; assert 0<pixels[0]<pixels[4] and pixels[18]==0, pixels",output);
 assert.equal(captionPixels.status,0,captionPixels.stderr);
 const check=verify("import av,sys,numpy as np; p=sys.argv[1]; c=av.open(p); s=c.streams.video[0]; assert (s.width,s.height,s.average_rate)==(128,96,24); f=list(c.decode(video=0)); assert len(f)==24; assert all(abs(float(x.pts*x.time_base)-i/24)<1e-6 for i,x in enumerate(f)); c.close(); c=av.open(p); data=np.concatenate([x.to_ndarray() for x in c.decode(audio=0)],axis=1); rms=np.sqrt(np.mean(data[0,2400:9600]**2)); assert abs(rms/(10000/32768/np.sqrt(2))-.4)<.04, rms; print('24 fps export and 40% narration gain verified')",output);assert.equal(check.status,0,check.stderr);
 await page.getByRole('button',{name:'Narration settings',exact:true}).click();
 await page.getByRole('checkbox',{name:'Mute narration'}).check();
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.getByRole('dialog',{name:'Project narration'}).waitFor({state:'hidden'});
 const {output:muted}=await exportVideo('muted.mp4');
 const silent=verify("import av,sys; c=av.open(sys.argv[1]); assert not c.streams.audio; assert len(list(c.decode(video=0)))==24",muted);
 assert.equal(silent.status,0,silent.stderr);
 await page.getByRole('button',{name:'Motion',exact:true}).click();await page.screenshot({path:`${work}/properties.png`});
 console.log('Project format, narration mix and styled caption preview/export passed');
} finally {await app.close();}
