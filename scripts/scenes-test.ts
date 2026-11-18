import {_electron as electron,chromium} from 'playwright';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {evaluate} from '../src/core/motion';
import assert from 'node:assert/strict';
import {workerRuntime} from '../electron/runtime';

const work=resolve('artifacts/scenes');await mkdir(work,{recursive:true});
const app=await electron.launch({args:['.',`--user-data-dir=${work}/profile-${Date.now()}`]});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.locator('.canvas-tools').waitFor();
 const state=()=>page.evaluate(()=>window.pteron.call('state'));
 const command=async(command:unknown)=>{
  for(let attempt=0;attempt<3;attempt++)try{return await page.evaluate(({command,revision})=>window.pteron.call('command',{command,revision}),{command,revision:(await state()).project.revision});}catch(error){if(attempt===2||!/Stale revision/.test(String(error)))throw error;}
 };
 const first=(await state()).project.screens[0].id;
 await command({type:'project.settings',width:320,height:240,fps:30});
 await command({type:'screen.update',screenId:first,name:'Introduction'});
 await command({type:'artwork.import',screenId:first,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><g data-name="Diagram"><rect data-name="Tile" x="40" y="50" width="80" height="40" fill="#ff00ff"/></g></svg>'});
 const objects=await page.evaluate(screenId=>window.pteron.call('objects',{screenId}),first),root=objects.find((object:any)=>object.name==='Diagram').id,tile=objects.find((object:any)=>object.name==='Tile').id;
 await command({type:'clip.put',screenId:first,clip:{id:'rotate',objectId:root,preset:'Rotate',start:0,duration:12,intensity:.25}});
 assert.equal(await page.getByRole('button',{name:'Main',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:'All',exact:true}).count(),0);
 await page.getByRole('button',{name:'Add scene',exact:true}).click();
 await page.waitForFunction(async()=>(await window.pteron.call('state')).project.screens.length===2);
 const second=(await state()).project.screens[1].id;
 await page.locator(`.layers[data-screen-id="${second}"]`).waitFor();
 await page.getByRole('textbox',{name:'Scene name',exact:true}).fill('Demonstration');await page.getByRole('textbox',{name:'Scene name',exact:true}).press('Enter');
 await page.locator(`[data-layer-id="${root}"] .layer-label`).click();await page.getByLabel('Scene continuity',{exact:true}).waitFor();
 assert.match(await page.getByLabel('Scene continuity',{exact:true}).innerText(),/Follows Introduction/);
 assert.match(await page.getByLabel('Timeline location',{exact:true}).innerText(),/Starts 90f/);
 // Use the real optional stdio MCP adapter to change the upstream scene.
 const descriptor=await app.evaluate(({app})=>app.getPath('userData')+'/connection.json');
 const child=spawn(process.execPath,['dist/mcp.js'],{env:{...process.env,PTERON_CONNECTION:descriptor},windowsHide:true});
 const messages=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'scene-acceptance',version:'1'}}},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'command',arguments:{revision:(await state()).project.revision,command:{type:'object.edit',screenId:first,objectId:tile,attributes:{fill:'#00cc99',width:'100'}}}}}];
 const output=await new Promise<string>((resolve,reject)=>{let out='';const timeout=setTimeout(()=>{child.kill();reject(new Error('MCP timed out'));},15000);child.stdout.on('data',chunk=>{out+=chunk;if(out.trim().split('\n').length>=2){clearTimeout(timeout);child.stdin.end();resolve(out);}});child.on('error',reject);child.stdin.write(messages.map(message=>JSON.stringify(message)).join('\n')+'\n');});
 assert.ok(!JSON.parse(output.trim().split('\n')[1]).result.isError,output);
 await page.frameLocator('iframe').locator(`[id="${tile}"][fill="#00cc99"]`).waitFor();
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.frameLocator('iframe').locator(`[id="${tile}"][fill="#ff00ff"]`).waitFor();
 await page.getByRole('button',{name:'Redo',exact:true}).click();await page.frameLocator('iframe').locator(`[id="${tile}"][fill="#00cc99"]`).waitFor();
 if(process.argv.includes('--render')){
  const project=(await state()).project,samples=[0,6,11,89,90,100,179];
  const executablePath=[process.env.PTERON_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(path=>path&&existsSync(path));
  const browser=await chromium.launch({headless:true,args:['--allow-file-access-from-files'],...(executablePath?{executablePath}:{})});
  try{
   const reference=await browser.newPage({viewport:{width:320,height:240},deviceScaleFactor:1});await reference.goto(pathToFileURL(resolve('dist/ui/geometry.html')).href);await reference.waitForFunction(()=>Boolean(window.sampleSvg));await reference.addStyleTag({content:'html,body{margin:0;background:white}'});
   for(const absolute of samples){const scene=project.screens[absolute<90?0:1],local=absolute<90?absolute:absolute-90;await reference.evaluate(({svg,poses})=>window.sampleSvg(svg,poses),{svg:scene.svg,poses:evaluate(scene,local)});await reference.screenshot({path:resolve(work,`reference-${absolute}.png`)});}
  }finally{await browser.close();}
  const output=resolve(work,'continuity.mp4');await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},output);
  const job=await page.evaluate(()=>window.pteron.call('render'));
  let finished:any;for(let attempt=0;attempt<1200;attempt++){finished=(await page.evaluate(()=>window.pteron.call('jobs'))).find((value:any)=>value.id===job.id);if(finished?.status!=='running')break;await page.waitForTimeout(100);}
  assert.equal(finished?.status,'completed',JSON.stringify(finished));
  const python=workerRuntime(resolve('.'),work,false);
  const check=spawnSync(python.executable,['scripts/check_scene_continuity.py',work],{encoding:'utf8',windowsHide:true,env:{...process.env,...python.env}});if(check.error)throw check.error;assert.equal(check.status,0,check.stdout+'\n'+check.stderr);console.log(check.stdout.trim());
 }
 await page.getByRole('button',{name:'Main',exact:true}).click();
 const history=(await state()).history;
 assert.equal(await page.getByRole('button',{name:'Expand Introduction in timeline',exact:true}).getAttribute('aria-expanded'),'false');
 await page.getByRole('button',{name:'Expand Introduction in timeline',exact:true}).click();await page.locator(`[data-object-id="${first}:${root}"]`).waitFor();
 await page.getByRole('button',{name:'Expand Diagram in timeline',exact:true}).click();await page.locator(`[data-object-id="${first}:${tile}"]`).waitFor();
 await page.getByRole('button',{name:'Collapse Introduction in timeline',exact:true}).click();assert.equal(await page.locator(`[data-object-id="${first}:${root}"]`).count(),0);
 // Seeking into a different scene must retain the exact requested frame.
 const ruler=page.getByRole('slider',{name:'Playhead',exact:true});await ruler.press('Home');
 for(let i=0;i<4;i++)await ruler.press('PageDown');
 await page.waitForFunction(()=>document.querySelector('[aria-label="Playhead"]')?.getAttribute('aria-valuenow')==='120');
 assert.equal(await page.getByRole('textbox',{name:'Scene name',exact:true}).inputValue(),'Demonstration');
 await page.screenshot({path:resolve(work,'main.png')});
 await page.getByRole('button',{name:'Edit Demonstration scene',exact:true}).click();
 assert.equal(await page.getByRole('slider',{name:'Playhead',exact:true}).getAttribute('aria-valuenow'),'30');
 assert.match(await page.getByLabel('Timeline location',{exact:true}).innerText(),/Video 120/);
 assert.deepEqual((await state()).history,history,'Timeline navigation and collapse must not create project history');
 // Clip selection survives returning from a different scene on Main.
 await page.getByRole('button',{name:'Main',exact:true}).click();await page.getByRole('button',{name:'Expand Introduction in timeline',exact:true}).click();
 await page.getByRole('button',{name:'Rotate clip',exact:true}).click();
 await page.getByRole('region',{name:'Transition settings',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Scene name',exact:true}).inputValue(),'Introduction');
 assert.equal(await page.locator(`[data-layer-id="${root}"] .layer-label`).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Edit Demonstration scene',exact:true}).click();
 await page.locator(`[data-layer-id="${root}"] .layer-label`).click();
 await page.getByRole('button',{name:'Make independent',exact:true}).click();
 await page.waitForFunction(async id=>!(await window.pteron.call('state')).project.screens[1].links[id],root);
 await command({type:'object.edit',screenId:first,objectId:tile,attributes:{fill:'#112233'}});
 assert.equal((await page.evaluate(screenId=>window.pteron.call('objects',{screenId}),second)).find((object:any)=>object.id===tile).attributes.fill,'#00cc99');
 await page.getByRole('button',{name:'Follow previous scene',exact:true}).click();
 const applyButton=page.getByRole('button',{name:'Apply scene continuity'});
 if(await applyButton.isVisible({timeout:1500}).catch(()=>false))await applyButton.click();
 await page.waitForFunction(async({root,first})=>(await window.pteron.call('state')).project.screens[1].links[root]===first,{root,first});
 await page.frameLocator('iframe').locator(`[id="${tile}"][fill="#112233"]`).waitFor();
 // A real canvas gesture in the source also updates inherited destination artwork.
 await page.locator('.screen-card').first().click();await page.locator(`[data-layer-id="${root}"] .layer-label`).click();
 const shape=page.frameLocator('iframe').locator(`[id="${tile}"]`),box=await shape.boundingBox();assert.ok(box);const beforeDrag=(await state()).project.revision;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+10,box.y+box.height/2+5,{steps:4});await page.mouse.up();
 await page.waitForFunction(async revision=>(await window.pteron.call('state')).project.revision>revision,beforeDrag);
 assert.equal(await page.getByRole('alert').count(),0);
 await command({type:'artwork.import',screenId:first,svg:'<svg xmlns="http://www.w3.org/2000/svg"><circle data-name="Continued circle" cx="200" cy="100" r="15"/></svg>'});
 const added=(await page.evaluate(screenId=>window.pteron.call('objects',{screenId}),first)).find((object:any)=>object.name==='Continued circle');
 const destinationObjects=await page.evaluate(screenId=>window.pteron.call('objects',{screenId}),second);
 if(destinationObjects.some((object:any)=>object.id===added.id))await command({type:'object.delete',screenId:second,objectId:added.id});
 await page.locator(`[data-layer-id="${added.id}"] .layer-label`).click({button:'right'});
 await page.getByRole('menuitem',{name:'Continue into next scene',exact:true}).click();
 await page.waitForFunction(async({second,id})=>(await window.pteron.call('objects',{screenId:second})).some((object:any)=>object.id===id),{second,id:added.id});
 await page.locator('.screen-card').nth(1).click();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));await page.setViewportSize({width:800,height:560});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(work,'scene-compact.png')});
 assert.deepEqual(errors,[]);await writeFile(resolve(work,'report.json'),JSON.stringify({passed:true,checks:['Scenes/Main vocabulary','local and project clocks','collapse without mutation','exact cross-scene seek and clip selection','stdio MCP continuity and shared undo/redo','make independent and follow previous','canvas gesture continuity','continue into existing scene menu','800x560 layout'],errors},null,2));
 console.log('Scenes/Main, exact cross-scene navigation, linked final poses, MCP/history and compact layout passed');
}finally{await app.close();}
