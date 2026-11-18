import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const url=process.env.PTERON_DEV_URL??'http://127.0.0.1:5173/';
const env={...process.env,PTERON_DEV_URL:url};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.',`--user-data-dir=${resolve('artifacts/startup-profile-'+Date.now())}`],env});
try{
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('.canvas-tools').waitFor({timeout:30000});assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),true);
 const additional=app.waitForEvent('window');await app.evaluate(async({BrowserWindow},url)=>{const w=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});await w.loadURL(url);},url);const browserPage=await additional;await browserPage.getByRole('heading',{name:'Open pteron in its desktop window'}).waitFor();assert.equal(await browserPage.locator('.app-shell').count(),0);
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('pteron');ipcMain.handle('pteron',()=>{throw new Error('Test desktop connection failure');});});await page.reload();await page.getByRole('heading',{name:'Could not open the workspace'}).waitFor();await page.getByText('Test desktop connection failure',{exact:false}).waitFor();assert.deepEqual(errors,[]);
 console.log('Startup: desktop workspace loads; browser-only and IPC failures show actionable screens');
}finally{await app.close();}
