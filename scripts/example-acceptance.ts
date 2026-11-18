import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {workerRuntime} from '../electron/runtime';
await mkdir('artifacts/example',{recursive:true});
const sampleManifest=JSON.parse(await readFile(resolve('examples/small-idea.json'),'utf8'));
const packaged=process.argv.includes('--packaged');
const executable=resolve('artifacts/standalone/win-unpacked/pteron.exe');
const app=await electron.launch({...(packaged?{executablePath:executable}:{}),args:[...(packaged?[]:['.']),...(packaged?[]:[resolve('examples/small-idea.pteron')]),`--user-data-dir=${resolve(`artifacts/example/profile-${Date.now()}`)}`],env:{...process.env,PATH:process.env.SystemRoot+'/System32'},timeout:30000});
try{
 const page=await app.firstWindow();page.on('pageerror',e=>console.error('UI error',e.message));page.setDefaultTimeout(20000);{await page.locator('.canvas-tools').waitFor();await app.evaluate(({Menu,BrowserWindow})=>{const item=Menu.getApplicationMenu()!.items[0].submenu!.items.find(i=>i.label==='Open sample project')!;item.click(item,BrowserWindow.getAllWindows()[0],{} as any);});}await page.waitForFunction(async()=>{const state=await window.pteron?.call('state');return state?.project?.name==='Small idea, big motion';});
 const state=await page.evaluate(()=>window.pteron.call('state'));assert.equal(state.path,undefined,'Sample opens as an unsaved copy');assert.equal(state.project.screens.length,6);assert.equal(state.project.screens.reduce((n:number,s:any)=>n+s.duration,0),sampleManifest.totalFrames);
 if(packaged){
  const descriptor=await app.evaluate(({app})=>app.getPath('userData')+'/connection.json');
  const response=await new Promise<string>((resolvePromise,reject)=>{const child=spawn(executable,[resolve('artifacts/standalone/win-unpacked/resources/mcp.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',PATH:process.env.SystemRoot+'/System32',PTERON_CONNECTION:descriptor},windowsHide:true});let output='',error='';const timeout=setTimeout(()=>{child.kill();reject(new Error('Packaged MCP timed out: '+output+error));},15000);child.stdout.on('data',chunk=>{output+=chunk;const lines=output.trim().split('\n');if(lines.some(line=>{try{return JSON.parse(line).id===2;}catch{return false;}})){clearTimeout(timeout);child.stdin.end();resolvePromise(output);}});child.stderr.on('data',c=>error+=c);child.on('error',reject);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'standalone-test',version:'1'}}})+'\n'+JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'state',arguments:{}}})+'\n');});
  const value=response.trim().split('\n').map(l=>{try{return JSON.parse(l);}catch{return null;}}).find(v=>v?.id===2);assert.ok(!value.result.isError);assert.match(value.result.content[0].text,/Small idea, big motion/);console.log('Packaged MCP works without Node on PATH');
 }
 await page.locator('.screen-card').nth(5).waitFor();await page.frameLocator('iframe').locator('#svgcontent rect[fill="#183C35"]').waitFor();
 // Prove that drawing one shape creates exactly one track, then restore example.
 await page.getByRole('toolbar',{name:'Canvas tools'}).getByRole('button',{name:'Rectangle',exact:true}).click();
 await page.frameLocator('iframe').locator('html[data-editor-mode="rect"]').waitFor({state:'attached'});
 const canvas=page.frameLocator('iframe').locator('#svgcontent');await canvas.waitFor({state:'attached'});const box=await page.locator('iframe').boundingBox();assert.ok(box);
 const before=await page.evaluate(id=>window.pteron.call('objects',{screenId:id}),state.project.screens[0].id);
 await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x+70,box.y+70,{steps:5});await page.mouse.up();
 await page.waitForTimeout(500);
 for(let i=0;i<100;i++){const current=await page.evaluate(id=>window.pteron.call('objects',{screenId:id}),state.project.screens[0].id);if(current.length===before.length+1)break;if(i===99)throw new Error(`Drawing did not commit one component: before ${before.length}, after ${current.length}`);await page.waitForTimeout(100);}
 await page.getByRole('button',{name:'Undo'}).click();
 await page.getByRole('button',{name:'Select',exact:true}).click();
 await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.waitForTimeout(700);assert.ok(await page.locator('audio').first().evaluate(el=>(el as HTMLAudioElement).currentTime>.3),'Narration did not play');await page.screenshot({path:'artifacts/example/01-spark.png'});
 await page.waitForFunction(()=>document.querySelector('.screen-card.active>span')?.childNodes[0]?.textContent==='Build');
 await page.screenshot({path:'artifacts/example/02-build.png'});
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 // Select every screen and sample a representative moment through the real UI.
 for(let i=0;i<state.project.screens.length;i++){await page.locator('.screen-card').nth(i).click();const ruler=await page.getByRole('slider',{name:'Playhead'}).boundingBox();assert.ok(ruler);await page.getByRole('slider',{name:'Playhead'}).click({position:{x:Math.floor(state.project.screens[i].duration*.7)/state.project.screens[i].duration*ruler.width,y:12}});await page.waitForTimeout(150);assert.equal(await page.frameLocator('iframe').locator('[id^=selectedBox]').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0).length),0,'No stale selection outline after drawing/undo or scene preview');await page.screenshot({path:`artifacts/example/screen-${i+1}.png`});}
 // Compact viewport and shared persistence retain the same editable sources and IDs.
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));await page.waitForTimeout(250);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/example/compact.png'});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
 const saved=resolve('artifacts/example/roundtrip.pteron');await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=(async()=>({canceled:false,filePath:path})) as any;dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[path]})) as any;},saved);await page.evaluate(path=>window.pteron.call('save',{path}),saved);
 const beforeOpen=await page.evaluate(()=>window.pteron.call('state'));
 await page.evaluate(({path,revision})=>window.pteron.call('open',{path,revision}),{path:saved,revision:beforeOpen.project.revision});
 const reopened=await page.evaluate(()=>window.pteron.call('state'));assert.deepEqual(reopened.project.screens,beforeOpen.project.screens);assert.deepEqual(reopened.project.media,beforeOpen.project.media);
 const output=resolve(packaged?'artifacts/example/sample-standalone.mp4':'artifacts/example/sample-desktop.mp4');
 await app.evaluate(({dialog},output)=>{dialog.showSaveDialog=(async()=>({canceled:false,filePath:output})) as any;},output);
 await app.evaluate(({Menu,BrowserWindow})=>{const item=Menu.getApplicationMenu()!.items[0].submenu!.items.find(i=>i.label==='Export MP4…')!;item.click(item,BrowserWindow.getAllWindows()[0],{} as any);});
 let job:any;const deadline=Date.now()+900000;let last=-1;
 while(Date.now()<deadline){const jobs=await page.evaluate(()=>window.pteron.call('jobs'));job=jobs.find((j:any)=>j.kind==='render');if(job){const percent=Math.floor(job.progress*100/10)*10;if(percent!==last){console.log(`Render ${percent}% · ${job.status}`);last=percent;}if(job.status!=='running')break;}await page.waitForTimeout(1000);}
 assert.equal(job?.status,'completed',JSON.stringify(job));
 const python=workerRuntime(resolve('.'),resolve('artifacts/example'),false);
 await new Promise<void>((resolvePromise,reject)=>{const child=spawn(python.executable,[resolve('scripts/check_example_video.py'),output],{windowsHide:true,stdio:'inherit',env:{...process.env,...python.env}});child.on('error',reject);child.on('close',code=>code?reject(new Error('Example video verification failed')):resolvePromise());});
 await writeFile('artifacts/example/acceptance.json',JSON.stringify({passed:true,packaged,emptyDevelopmentPATH:true,screens:6,frames:sampleManifest.totalFrames,oneShapeOneTrack:true,projectPlayback:true,audio:true,captions:true,export:output},null,2));console.log('Example acceptance passed');
}finally{const process=app.process();let timeout:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([app.close(),new Promise<void>(resolve=>{timeout=setTimeout(()=>{process.kill();resolve();},5000);})]);}finally{clearTimeout(timeout);}}




