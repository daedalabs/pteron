import {chromium} from 'playwright';
import {spawn,spawnSync} from 'node:child_process';
import {createConnection,createServer} from 'node:net';
import {mkdir,readFile,writeFile,stat,mkdtemp,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {checkTimelineSelection} from './timeline-selection-check';
import {checkWorkspacePolish} from './workspace-polish-check';

const sampleManifest=JSON.parse(await readFile(resolve('examples/small-idea.json'),'utf8'));
const work=resolve('artifacts/portable-test');await mkdir(work,{recursive:true});
const sourceExecutable=resolve(process.env.PTERON_PORTABLE_EXE??'artifacts/standalone/pteron-0.1.0-portable.exe');
const verifierPython=resolve(process.env.PTERON_BUILD_PYTHON??'.venv/Scripts/python.exe');
const selfContained=process.argv.includes('--self-contained'),latex=process.argv.includes('--latex')||selfContained;
const isolated=selfContained?await mkdtemp(resolve(tmpdir(),'pteron-portable-isolated-')):undefined;
const executable=isolated?resolve(isolated,'pteron.exe'):sourceExecutable;
if(isolated)await copyFile(sourceExecutable,executable);
const profile=resolve(work,'profile-'+Date.now());
const probe=createServer();await new Promise<void>(done=>probe.listen(0,'127.0.0.1',done));
const port=(probe.address() as {port:number}).port;await new Promise<void>(done=>probe.close(()=>done()));
const child=spawn(executable,[`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`],{cwd:work,env:{...process.env,PATH:process.env.SystemRoot+'/System32',PYTHONHOME:undefined,PYTHONPATH:undefined,...(latex?{PTERON_TEX_ROOT:undefined}:{}),...(selfContained?{HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',ALL_PROXY:'http://127.0.0.1:9'}:{})},windowsHide:true,stdio:'ignore'});
let launchError:Error|undefined;child.on('error',error=>launchError=error);
const pause=()=>new Promise(done=>setTimeout(done,250));
let browser:Awaited<ReturnType<typeof chromium.connectOverCDP>>|undefined;
try{
 let endpoint='';const deadline=Date.now()+120000;
 while(Date.now()<deadline){if(launchError)throw launchError;if(child.exitCode!==null)throw new Error('Portable launcher exited: '+child.exitCode);try{const response=await fetch(`http://127.0.0.1:${port}/json/version`);endpoint=(await response.json()).webSocketDebuggerUrl;if(endpoint)break;}catch{}await pause();}
 assert.ok(endpoint,'Portable executable did not start');
 browser=await chromium.connectOverCDP(endpoint);
 const context=browser.contexts()[0];
 const page=context.pages().find(page=>!page.url().includes('canvas.html'))??await context.waitForEvent('page',{timeout:30000});
 await page.locator('.canvas-tools').waitFor({timeout:30000});
 if(process.argv.includes('--timeline-selection')){
  await checkTimelineSelection(page,resolve(work,'timeline-selection'));
  console.log('Portable EXE: timeline selection and editing passed at 800 × 560');
 }else if(process.argv.includes('--workspace-polish')){
  await checkWorkspacePolish(page,resolve(work,'workspace-polish'));
  console.log('Portable EXE: blank-scene actions, layer highlighting and tool states passed at 800 × 560');
 }else if(process.argv.includes('--mcp')){
  await page.getByRole('menuitem',{name:'File',exact:true}).click();
  await page.getByRole('menuitem',{name:'Activity and MCP…',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Activity and MCP',exact:true});
  const clipboard=await page.evaluateHandle<{text:string}>(`(() => {
   const capture={text:''};
   Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async value=>{capture.text=value;}});
   return capture;
  })()`);
  await dialog.getByRole('button',{name:'Copy MCP client config',exact:true}).click();
  await page.waitForFunction(value=>value.text.length>0,clipboard);
  const config=JSON.parse(await clipboard.evaluate(value=>value.text));
  await page.evaluate(()=>Reflect.deleteProperty(navigator.clipboard,'writeText'));
  await clipboard.dispose();
  const connection=config.mcpServers.pteron;
  assert.deepEqual(connection.env,{ELECTRON_RUN_AS_NODE:'1',PTERON_CONNECTION:join(profile,'connection.json')});
  assert.equal(connection.args.length,1);
  assert.match(connection.args[0],/[\\/]resources[\\/]mcp\.cjs$/);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();

  const before=await page.evaluate(()=>window.pteron.call('state'));
  const screenId=before.project.screens[0].id;
  await page.evaluate(({screenId,revision})=>window.pteron.call('command',{revision,command:{
   type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect data-name="MCP tile" x="100" y="100" width="400" height="200" fill="#ff00ff"/></svg>'
  }}),{screenId,revision:before.project.revision});
  const artwork=page.frameLocator('iframe').locator('#svgcontent');
  await artwork.locator('rect[fill="#ff00ff"]').waitFor();

  const mcp=(name:string,args:unknown={})=>{
   const requests=[
    {jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'portable-acceptance',version:'1'}}},
    {jsonrpc:'2.0',method:'notifications/initialized'},
    {jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:args}}
   ];
   const child=spawnSync(connection.command,connection.args,{
    input:requests.map(request=>JSON.stringify(request)).join('\n')+'\n',
    env:{...process.env,PATH:join(process.env.SystemRoot!,'System32'),...connection.env},
    encoding:'utf8',windowsHide:true,timeout:30000
   });
   assert.ifError(child.error);
   assert.equal(child.status,0,child.stderr);
   const [initialize,reply]=child.stdout.trim().split('\n').map(line=>JSON.parse(line));
   assert.equal(initialize.result.serverInfo.name,'pteron');
   assert.ok(reply.result&&!reply.result.isError,child.stdout);
   return JSON.parse(reply.result.content[0].text);
  };
  const summary=mcp('project.summary');
  assert.equal(summary.revision,before.project.revision+1);
  const scene=before.project.screens[0];
  assert.deepEqual(summary.scenes,[{id:screenId,name:scene.name,start:0,end:scene.duration,clipCount:0,captionCount:0}]);
  assert.equal(summary.totalFrames,scene.duration);
  assert.doesNotMatch(JSON.stringify(summary),/<svg|"media":/);
  const [tile]=mcp('objects',{screenId});
  assert.equal(tile.name,'MCP tile');
  mcp('command',{revision:summary.revision,command:{type:'object.edit',screenId,objectId:tile.id,attributes:{fill:'#00ff00'}}});
  await artwork.locator('rect[fill="#00ff00"]').waitFor();
  const edited=await page.evaluate(()=>window.pteron.call('state'));
  assert.equal(edited.activity.at(-1).source,'mcp');
  assert.equal(edited.history.undo,summary.history.undo+1);
  await page.getByRole('toolbar',{name:'Canvas tools'}).getByRole('button',{name:'Undo',exact:true}).click();
  await artwork.locator('rect[fill="#ff00ff"]').waitFor();
  const undone=mcp('project.summary');
  assert.equal(undone.revision,summary.revision+2);
  assert.equal(undone.history.undo,summary.history.undo);
  assert.equal(undone.history.redo,1);
  await writeFile(resolve(work,'mcp-verification.json'),JSON.stringify({executable,profile,summary:true,copiedConfig:true,sharedUndo:true},null,2));
  console.log('Portable EXE: copied MCP configuration, project.summary, canvas edit, and desktop Undo passed');
 }else{
 await page.waitForTimeout(300);const area=page.locator('.canvas-area'),art=page.locator('.artboard');await area.focus();await page.keyboard.press('Control+0');await page.waitForTimeout(80);const fitted=(await art.boundingBox())!;await page.keyboard.press('Control+=');await page.waitForTimeout(80);assert.ok((await art.boundingBox())!.width>fitted.width);await page.keyboard.press('Control+0');await page.waitForTimeout(80);assert.ok(Math.abs((await art.boundingBox())!.width-fitted.width)<1);
 const timeline=page.locator('.timeline-scroll');await timeline.focus();const ruler=page.locator('.ruler-time'),initialLane=(await ruler.boundingBox())!;await page.keyboard.press('Control+=');await page.waitForTimeout(80);assert.ok((await ruler.boundingBox())!.width>initialLane.width);await page.keyboard.press('Control+0');
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const descriptor=JSON.parse(await readFile(resolve(profile,'connection.json'),'utf8'));
 const call=(method:string,args:unknown={})=>new Promise<any>((done,reject)=>{
  const socket=createConnection(descriptor.pipe);let buffer='';
  socket.setTimeout(30000,()=>socket.destroy(new Error('Shared command timed out')));
  socket.on('connect',()=>socket.write(JSON.stringify({id:1,token:descriptor.token,method,args})+'\n'));
  socket.on('error',reject);socket.on('data',chunk=>{buffer+=chunk;const end=buffer.indexOf('\n');if(end<0)return;socket.end();const response=JSON.parse(buffer.slice(0,end));if(response.error)reject(new Error(response.error));else done(response.result);});
 });
 let sampleState=await call('state');await call('example.open',{revision:sampleState.project.revision});sampleState=await call('state');assert.equal(sampleState.project.name,'Small idea, big motion');assert.equal(sampleState.path,undefined);assert.equal(sampleState.project.screens.length,6);assert.equal(sampleState.project.screens.reduce((n:number,s:any)=>n+s.duration,0),sampleManifest.totalFrames);await page.locator('.screen-card').nth(5).waitFor();await page.screenshot({path:resolve(work,'sample.png')});
 await call('command',{revision:sampleState.project.revision,command:{type:'project.create',name:'Portable probe',width:128,height:96}});
 let state=await call('state');const screenId=state.project.screens[0].id;
 const command=async(command:unknown)=>{state=await call('state');return call('command',{revision:state.project.revision,command});};
 await command({type:'project.settings',width:128,height:96,fps:24});
 await command({type:'screen.update',screenId,duration:24});
 await command({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="96"><rect data-name="Portable tile" width="128" height="96" fill="#2288cc"/></svg>'});
 await command({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg"><text data-name="Outline probe" x="8" y="40" font-family="Arial" font-size="20">AV office</text></svg>'});
 const outline=(await call('objects',{screenId})).find((object:any)=>object.name==='Outline probe');
 await command({type:'object.outline',screenId,objectIds:[outline.id]});
 assert.equal((await call('objects',{screenId})).find((object:any)=>object.id===outline.id).type,'path');
 await command({type:'object.delete',screenId,objectId:outline.id});
 await page.locator('.layers').getByRole('button',{name:'Portable tile',exact:true}).click();
 await page.getByRole('region',{name:'Properties',exact:true}).getByRole('region',{name:'Layer timing settings',exact:true}).waitFor();
 assert.equal(await page.locator('.context-sidebar').count(),0);
 await page.getByRole('button',{name:'Motion',exact:true}).click();assert.equal(await page.locator('.motion-preview').count(),30);
 const samples=12000,wav=Buffer.alloc(44+samples*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/48000)*10000),44+i*2);
 const audio=resolve(work,'tone.wav');await writeFile(audio,wav);
 const finish=async(job:any)=>{const deadline=Date.now()+120000;while(Date.now()<deadline){const current=(await call('jobs')).find((item:any)=>item.id===job.id);if(current.status!=='running'){assert.equal(current.status,'completed',current.diagnostic);return;}await pause();}throw new Error('Bundled worker timed out');};
 await finish(await call('audio.import',{screenId,path:audio}));
 await page.locator('.audio-track').waitFor();const finalTrack=(await page.locator('.timeline-content .track').last().boundingBox())!,audioTop=(await page.locator('.timeline-media').boundingBox())!;assert.ok(Math.abs(audioTop.y-finalTrack.y-finalTrack.height)<=1,'No gap before portable audio lanes');await timeline.focus();await page.keyboard.press('Control+=');await page.waitForTimeout(80);const audioLane=(await page.locator('.audio-track .track-lane').boundingBox())!,rulerLane=(await ruler.boundingBox())!;assert.ok(Math.abs(audioLane.x-rulerLane.x)<1&&Math.abs(audioLane.width-rulerLane.width)<1);await page.keyboard.press('Control+0');
 await command({type:'caption.put',screenId,caption:{id:'portable-caption',start:0,end:18,text:'Caption style',draft:false}});
 const outputs=[];
 for(const variant of ['Regular','Bold','Italic']){
  await command({type:'narration.settings',style:{font:'Georgia',variant,size:155,entrance:'Pop'},mix:{volume:40,muted:false}});
  await page.waitForFunction(()=>document.querySelector('audio')?.volume===.4);
  await page.locator('svg.caption-overlay > g > svg').waitFor();
  const output=resolve(work,`portable-${variant.toLowerCase()}.mp4`);
  await finish(await call('render',{path:output}));
  assert.ok((await stat(output)).size>1000);
  outputs.push(output);
 }
 // The verifier runs on the build host; the app above has only Windows on PATH.
 const check=spawnSync(verifierPython,['-c',`
import av, sys, numpy as np
caption_masks = []
for path in sys.argv[1:]:
    with av.open(path) as video:
        stream = video.streams.video[0]
        assert (stream.width, stream.height, stream.average_rate) == (128, 96, 24)
        frames = list(video.decode(video=0))
        assert len(frames) == 24
        assert all(abs(float(frame.pts * frame.time_base) - i / 24) < 1e-6 for i, frame in enumerate(frames))
        assert frames[0].to_ndarray(format='rgb24')[:, :, 2].mean() > 100
        masks = [np.min(frame.to_ndarray(format='rgb24')[70:], axis=2) > 160 for frame in frames]
        assert 0 < masks[0].sum() < masks[4].sum() and not masks[18].any(), path
        caption_masks.append(masks[4].tobytes())
    with av.open(path) as video:
        data = np.concatenate([frame.to_ndarray() for frame in video.decode(audio=0)], axis=1)
        rms = np.sqrt(np.mean(data[0, 2400:9600] ** 2))
        assert abs(rms / (10000 / 32768 / np.sqrt(2)) - .4) < .04, rms
assert len(set(caption_masks)) == 3, 'Caption styles must render distinct pixels'
`,...outputs],{encoding:'utf8',windowsHide:true});
 assert.ifError(check.error);
 assert.equal(check.status,0,check.stderr);
 if(latex){
  await page.getByRole('button',{name:'LaTeX equation',exact:true}).click();
  await page.getByLabel('LaTeX source',{exact:true}).waitFor();
  let current=await call('state');const equation=current.project.screens[0].equations[0];assert.ok(equation);
  const objects=await call('objects',{screenId}),object=objects.find((value:any)=>value.equationId===equation.id);assert.ok(object);
  await command({type:'clip.put',screenId,clip:{id:'equation-motion',objectId:object.id,preset:'Press',start:0,duration:18}});
  await page.getByRole('button',{name:'Properties',exact:true}).click();
  const source='\\frac{x^2+7}{\\sqrt{y+3}} = z';
  await page.getByLabel('LaTeX source',{exact:true}).fill(source);
  const oldJobs=new Set((await call('jobs')).map((value:any)=>value.id));
  await page.getByRole('button',{name:'Compile',exact:true}).click();
  let job:any;const deadline=Date.now()+30000;
  while(Date.now()<deadline){job=(await call('jobs')).find((value:any)=>value.kind==='equation'&&!oldJobs.has(value.id));if(job)break;await pause();}
  assert.ok(job,'Compile did not start');await finish(job);
  current=await call('state');const compiled=current.project.screens[0].equations.find((value:any)=>value.id===equation.id);
  assert.equal(compiled.compiledSource,source);assert.match(compiled.svg,/<(?:ns\d+:)?path/);assert.notEqual(compiled.svg,equation.svg);
  assert.equal((await call('objects',{screenId})).find((value:any)=>value.equationId===equation.id).id,object.id);
  assert.equal(current.project.screens[0].clips.find((value:any)=>value.id==='equation-motion').objectId,object.id);
  const invalid=await call('equation.compile',{screenId,equationId:equation.id,source:'\\notallowed{x}'});
  let failed:any;const failureDeadline=Date.now()+30000;
  while(Date.now()<failureDeadline){failed=(await call('jobs')).find((value:any)=>value.id===invalid.id);if(failed&&failed.status!=='running')break;await pause();}
  assert.equal(failed.status,'failed');assert.match(failed.diagnostic,/Unsupported mathematical command/);
  assert.equal((await call('state')).project.screens[0].equations.find((value:any)=>value.id===equation.id).svg,compiled.svg);
  console.log('Portable LaTeX passed: fresh source compiled without PATH TeX, identity/motion retained, failed source preserves vectors');
 }
 assert.deepEqual(errors,[]);
 await page.screenshot({path:resolve(work,'portable.png')});
 await writeFile(resolve(work,'verification.json'),JSON.stringify({passed:true,executable,sourceExecutable,selfContained,systemOnlyPATH:true,latex,navigation:true,ui:true,sampleProject:true,sampleUnsavedCopy:true,sharedCommands:true,nativeTextOutlines:true,bundledAudio:true,bundledRender:true,width:128,height:96,fps:24,frames:24},null,2));
 console.log('Portable EXE passed: UI, shared commands, bundled audio and MP4 export with no Python/Node/uv on PATH');
 }
}finally{
 if(browser){for(const context of browser.contexts())for(const page of context.pages())await page.close().catch(()=>{});await browser.close().catch(()=>{});}
 for(let attempt=0;attempt<40&&child.exitCode===null;attempt++)await pause();
 if(child.exitCode===null&&child.pid)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
}
