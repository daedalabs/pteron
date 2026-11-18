import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const env={...process.env,PTERON_DEV_URL:process.env.PTERON_DEV_URL??'http://127.0.0.1:5173/'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.',`--user-data-dir=${resolve('artifacts/dev-reload-'+Date.now())}`],env});
try{
 const page=await app.firstWindow();await page.locator('.canvas-tools').waitFor({timeout:60000});
 const state=await page.evaluate(()=>window.pteron.call('state')),screenId=state.project.screens[0].id;
 await page.evaluate(({screenId,revision})=>window.pteron.call('command',{revision,command:{type:'project.rename',name:'Reload preserved'}}),{screenId,revision:state.project.revision});
 await page.evaluate(()=>{window.__reloadProbe=true;location.reload();});await page.waitForFunction(()=>!window.__reloadProbe,undefined,{timeout:10000});await page.locator('.canvas-tools').waitFor();
 assert.equal((await page.evaluate(()=>window.pteron.call('state'))).project.name,'Reload preserved');
 // Off-origin navigation remains denied even when the live server is enabled.
 await page.evaluate(()=>{location.href='http://127.0.0.1:5172/';});await page.waitForTimeout(250);assert.equal(new URL(page.url()).origin,new URL(env.PTERON_DEV_URL).origin);
 console.log('Development reload succeeds, preserves project state and keeps off-origin navigation blocked');
}finally{await app.close();}
