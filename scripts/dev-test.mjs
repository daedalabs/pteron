import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const files=['src/workspace/ShapeInspector.tsx','src/theme.css','electron/main.ts','electron/preload.ts'];
const original=await Promise.all(files.map(file=>readFile(file)));
let output='',browser,child;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(){for(let i=0;i<150;i++){try{return await chromium.connectOverCDP('http://127.0.0.1:9223');}catch{await pause(400);}}throw new Error('Dev Electron unavailable: '+output);}
try{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 child=spawn(process.execPath,['scripts/dev.mjs','--remote-debugging-port=9223',`--user-data-dir=${resolve('artifacts/dev-test-'+Date.now())}`],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
 browser=await connect();let page=browser.contexts()[0].pages().find(page=>page.url().startsWith('http://127.0.0.1:5173'))??browser.contexts()[0].pages()[0];page.on('console',m=>console.log('browser',m.type(),m.text()));page.on('pageerror',e=>console.log('browser error',e.message));await page.locator('.canvas-tools').waitFor({timeout:90000});
 await page.evaluate(()=>{window.__reloadProbe=true;location.reload();});await page.waitForFunction(()=>!window.__reloadProbe,undefined,{timeout:10000});await page.locator('.canvas-tools').waitFor();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const project=await page.evaluate(()=>window.pteron.call('state'));const screenId=project.project.screens[0].id;
 await page.evaluate(async({screenId,revision})=>window.pteron.call('command',{revision,command:{type:'artwork.commit',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="100" height="100" data-name="HMR probe"/></svg>'}}),{screenId,revision:project.project.revision});
 await page.locator('.layers').getByRole('button',{name:'HMR probe',exact:true}).click();
 await writeFile(files[0],original[0].toString().replace('aria-label="Shape name"','aria-label="Live shape name"'));await page.getByRole('textbox',{name:'Live shape name',exact:true}).waitFor({timeout:20000});assert.equal(await page.locator('.layer-label[aria-pressed="true"]').count(),1);
 await writeFile(files[1],Buffer.concat([original[1],Buffer.from('\n:root{--dev-refresh-probe:ready}\n')]));await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--dev-refresh-probe').trim()==='ready');
 // A canvas reload must request the authoritative artwork again.
 const frame=page.frames().find(frame=>frame.url().includes('canvas.html'));assert.ok(frame);await frame.evaluate(()=>location.reload());await page.waitForFunction(()=>Boolean((document.querySelector('iframe').contentDocument)?.querySelector('[data-name="HMR probe"]')));
 const old=browser;await writeFile(files[2],Buffer.concat([original[2],Buffer.from('\n// Development restart probe\n')]));await new Promise(resolve=>old.once('disconnected',resolve));browser=await connect();page=browser.contexts()[0].pages().find(page=>page.url().startsWith('http://127.0.0.1:5173'))??browser.contexts()[0].pages()[0];await page.locator('.layers').getByRole('button',{name:'HMR probe',exact:true}).waitFor({timeout:20000});assert.deepEqual(errors,[]);
 const disconnected=new Promise(resolve=>browser.once('disconnected',resolve));await writeFile(files[3],Buffer.concat([original[3],Buffer.from('\n// Preload restart probe\n')]));await disconnected;browser=await connect();page=browser.contexts()[0].pages().find(page=>page.url().startsWith('http://127.0.0.1:5173'))??browser.contexts()[0].pages()[0];await page.locator('.layers').getByRole('button',{name:'HMR probe',exact:true}).waitFor({timeout:20000});
 console.log('Development mode: React Fast Refresh preserves selection; CSS HMR, canvas reload and main/preload restart recovery passed');
}catch(error){console.error(output);throw error;}finally{
 if(browser)await browser.close().catch(()=>{});
 // Let closing the app shut down its watcher before restoring watched sources.
 if(child&&child.exitCode===null){await Promise.race([new Promise(resolve=>child.once('exit',resolve)),pause(5000)]);if(child.exitCode===null)child.kill();}
 await Promise.all(files.map((file,i)=>writeFile(file,original[i])));
}

