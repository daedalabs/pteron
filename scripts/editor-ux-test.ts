import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts/editor-ux',{recursive:true});
const packaged=process.argv.includes('--packaged');
const app=await electron.launch({...(packaged?{executablePath:resolve('artifacts/standalone/win-unpacked/pteron.exe')}:{}),args:[...(packaged?[]:['.']),`--user-data-dir=${resolve('artifacts/editor-ux/profile-'+Date.now())}`]});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.locator('.canvas-tools').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
 let state=await page.evaluate(()=>window.pteron.call('state'));const screenId=state.project.screens[0].id;
 await page.evaluate(async({screenId,revision})=>window.pteron.call('command',{revision,command:{type:'artwork.commit',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><g data-name="Test group"><rect x="100" y="100" width="400" height="400" fill="#ff3366" data-name="Test child"/></g></svg>'}}),{screenId,revision:state.project.revision});
 await page.locator('.layers').getByRole('button',{name:'Test child',exact:true}).waitFor();
 const objects=await page.evaluate(screenId=>window.pteron.call('objects',{screenId}),screenId);const child=objects.find((o:any)=>o.name==='Test child'),group=objects.find((o:any)=>o.name==='Test group');assert.equal(child.parentId,group.id);
 const row=page.locator(`[data-layer-id="${child.id}"]`);assert.ok(await row.evaluate(e=>parseFloat((e as HTMLElement).style.paddingLeft))>2);
 await row.locator('.layer-label').click();await page.getByRole('button',{name:'Fill color',exact:true}).click();await page.getByLabel('Shape fill',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Shape fill',{exact:true}).getAttribute('type'),'color');
 await page.getByLabel('Shape fill',{exact:true}).fill('#3366ff');
 await page.waitForFunction(async({screenId,id})=>(await window.pteron.call('objects',{screenId})).find((o:any)=>o.id===id)?.attributes.fill==='#3366ff',{screenId,id:child.id});
 await page.keyboard.press('Escape');await page.getByLabel('Shape rx',{exact:true}).fill('24');await page.getByLabel('Shape rx',{exact:true}).press('Tab');
 await page.waitForFunction(async({screenId,id})=>(await window.pteron.call('objects',{screenId})).find((o:any)=>o.id===id)?.attributes.rx==='24',{screenId,id:child.id});
 await page.getByRole('button',{name:'Align horizontal center',exact:true}).click();
 await page.waitForFunction(async({screenId,id})=>Boolean((await window.pteron.call('objects',{screenId})).find((o:any)=>o.id===id)?.attributes.transform),{screenId,id:child.id});
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 // Select parent, then Ctrl-click its child on the live artwork surface.
 await page.locator('.layers').getByRole('button',{name:'Test group',exact:true}).click();
 const target=page.frameLocator('iframe').locator(`[id="${child.id}"]`);await target.click({modifiers:['Control']});
 await page.waitForFunction(id=>document.querySelector(`[data-layer-id="${id}"] .layer-label`)?.getAttribute('aria-pressed')==='true',child.id);
 assert.equal(await page.getByLabel('Shape name',{exact:true}).inputValue(),'Test child');
 assert.equal(await page.locator('.layer-preview svg').count(),2);
 await page.screenshot({path:'artifacts/editor-ux/desktop.png'});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/editor-ux/compact.png'});
 console.log('Editor UX: nested selection, thumbnails, color, corners, alignment, undo and compact viewport passed');
}finally{await app.close();}

