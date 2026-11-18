import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const app=await electron.launch({args:['.',`--user-data-dir=${resolve('artifacts/layer-menu-profile-'+Date.now())}`]});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.locator('.canvas-tools').waitFor();
 const state=await page.evaluate(()=>window.pteron.call('state')),screenId=state.project.screens[0].id;
 await page.evaluate(async({screenId,revision})=>window.pteron.call('command',{revision,command:{type:'artwork.commit',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect x="100" y="100" width="400" height="300" fill="#ff3366" data-name="Rectangle"/><circle cx="500" cy="600" r="100" data-name="Circle"/></svg>'}}),{screenId,revision:state.project.revision});
 const row=(name:string)=>page.locator('.layers').getByRole('button',{name,exact:true});const menu=(name:string)=>page.getByRole('menuitem',{name,exact:true});
 await row('Rectangle').click({button:'right'});await menu('Copy').click();
 await row('Circle').click({button:'right'});await menu('Paste').click();await page.waitForFunction(()=>document.querySelectorAll('.layer').length===3);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.layer').length===2);
 await row('Rectangle').click();await row('Circle').click({modifiers:['Control']});assert.equal(await page.locator('.layer-label[aria-pressed="true"]').count(),2);
 await row('Circle').click({button:'right'});await menu('Group').click();await page.waitForFunction(()=>document.querySelectorAll('.layer').length===3);await row('Group').waitFor();
 let objects=await page.evaluate(screenId=>window.pteron.call('objects',{screenId}),screenId);const group=objects.find((o:any)=>o.name==='Group');assert.ok(group);assert.equal(objects.filter((o:any)=>o.parentId===group.id).length,2);
 await row('Group').click({button:'right'});await menu('Duplicate').click();await page.waitForFunction(()=>document.querySelectorAll('.layer').length===6);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.layer').length===3);
 await row('Group').click({button:'right'});await menu('Cut').click();await page.waitForFunction(()=>document.querySelectorAll('.layer').length===0);
 await page.locator('.layers').click({button:'right'});await menu('Paste').click();await page.waitForFunction(()=>document.querySelectorAll('.layer').length===3);
 await page.screenshot({path:'artifacts/layer-context-menu.png'});console.log('Layer context menus: copy/paste, multi-select grouping, duplicate, cut, blank-space paste and undo passed');
}finally{await app.close();}
