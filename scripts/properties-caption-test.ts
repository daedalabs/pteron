import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const app=await electron.launch({args:['.',`--user-data-dir=${resolve('artifacts/properties-profile-'+Date.now())}`]});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.locator('.canvas-tools').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
 const state=await page.evaluate(()=>window.pteron.call('state')),screenId=state.project.screens[0].id;
 await page.evaluate(async({screenId,revision})=>window.pteron.call('command',{revision,command:{type:'artwork.commit',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect x="100" y="100" width="400" height="300" fill="#ff3366" data-name="Test rectangle"/></svg>'}}),{screenId,revision:state.project.revision});
 await page.locator('.layers').getByRole('button',{name:'Test rectangle',exact:true}).click();
 assert.equal(await page.getByLabel('Shape opacity',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Fill color',exact:true}).click();await page.getByLabel('Fill alpha percent',{exact:true}).fill('35');await page.getByLabel('Fill alpha percent',{exact:true}).press('Tab');
 await page.waitForFunction(async screenId=>(await window.pteron.call('objects',{screenId})).find((o:any)=>o.name==='Test rectangle')?.attributes['fill-opacity']==='0.35',screenId);
 await page.getByLabel('Fill alpha',{exact:true}).focus();await page.getByLabel('Fill alpha',{exact:true}).press('ArrowRight');await page.waitForFunction(async screenId=>(await window.pteron.call('objects',{screenId})).find((o:any)=>o.name==='Test rectangle')?.attributes['fill-opacity']==='0.36',screenId);
 await page.screenshot({path:'artifacts/fill-alpha-picker.png'});await page.keyboard.press('Escape');await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(async screenId=>(await window.pteron.call('objects',{screenId})).find((o:any)=>o.name==='Test rectangle')?.attributes['fill-opacity']==='0.35',screenId);
 assert.equal(await page.getByLabel('Shape stroke-width',{exact:true}).evaluate(el=>getComputedStyle(el,'::-webkit-inner-spin-button').appearance),'auto');
 await page.getByRole('button',{name:'Corner settings',exact:true}).click();await page.getByLabel('Top left radius',{exact:true}).fill('40');await page.getByLabel('Top left radius',{exact:true}).press('Tab');await page.waitForFunction(async screenId=>(await window.pteron.call('objects',{screenId})).find((o:any)=>o.name==='Test rectangle')?.attributes['data-corners']?.startsWith('40,'),screenId);
 await page.keyboard.press('Escape');
 await page.getByLabel('Shape width',{exact:true}).fill('450');await page.getByLabel('Shape width',{exact:true}).press('Tab');await page.waitForFunction(async screenId=>(await window.pteron.call('objects',{screenId})).find((o:any)=>o.name==='Test rectangle')?.attributes.width==='450',screenId);
 await page.getByRole('button',{name:'Corner settings',exact:true}).click();assert.equal(await page.getByLabel('Top left radius',{exact:true}).inputValue(),'40');const beforeCornerFocus=await page.evaluate(()=>window.pteron.call('state'));await page.getByLabel('Top right radius',{exact:true}).focus();await page.keyboard.press('Tab');await page.keyboard.press('Escape');assert.equal((await page.evaluate(()=>window.pteron.call('state'))).project.revision,beforeCornerFocus.project.revision,'Untouched corner fields must not commit or reset another corner');
 await page.getByRole('button',{name:'Stroke settings',exact:true}).click();const popup=page.getByRole('dialog',{name:'Stroke settings',exact:true});await popup.waitFor();assert.equal(await page.locator('.dialog-overlay').count(),0);assert.equal(await popup.locator('select').count(),0);assert.equal(await page.getByLabel('Shape stroke-opacity',{exact:true}).count(),0);assert.equal(await page.getByLabel('Shape fill-opacity',{exact:true}).count(),0);
 const trigger=await page.getByRole('button',{name:'Stroke settings',exact:true}).boundingBox(),box=await popup.boundingBox();assert.ok(trigger&&box);assert.equal(await popup.evaluate(el=>(el as HTMLElement).offsetWidth),240);assert.ok(Math.abs(box.x+box.width-trigger.x)<=10);
 await page.getByRole('button',{name:'dashed stroke',exact:true}).click();await page.getByRole('button',{name:'round cap',exact:true}).click();await page.getByRole('button',{name:'bevel join',exact:true}).click();
 await page.waitForFunction(async screenId=>{const objects=await window.pteron.call('objects',{screenId});const shape=objects.find((o:any)=>o.name==='Test rectangle');return shape?.attributes['stroke-dasharray']==='8 4'&&shape.attributes['stroke-linecap']==='round'&&shape.attributes['stroke-linejoin']==='bevel';},screenId);
 await page.screenshot({path:'artifacts/compact-stroke-popup.png'});
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Stroke settings',exact:true}).click();await page.getByRole('button',{name:'dotted stroke',exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Stroke settings',exact:true}).click();await page.getByRole('button',{name:'solid stroke',exact:true}).click();await page.keyboard.press('Escape');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));await page.getByRole('button',{name:'Stroke settings',exact:true}).click();const small=await page.getByRole('dialog',{name:'Stroke settings',exact:true}).boundingBox();assert.ok(small&&small.x>=0&&small.y>=0);await page.screenshot({path:'artifacts/compact-stroke-small.png'});await page.getByLabel('Scene name',{exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
 await page.getByRole('button',{name:'Narration',exact:true}).click();await page.getByRole('button',{name:'Add caption',exact:true}).click();
 await page.locator('.caption').waitFor();assert.equal(await page.locator('.caption textarea').inputValue(),'');await page.getByRole('button',{name:'Add caption',exact:true}).click();
 await page.waitForFunction(async()=>{const p=(await window.pteron.call('state')).project;return p.screens[0].captions.length===2;});assert.equal(await page.locator('.caption').count(),1);await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('[aria-label="Caption start"]')?.value==='90');assert.equal(await page.getByLabel('Caption start',{exact:true}).inputValue(),'90');
 await page.screenshot({path:'artifacts/properties-caption.png'});console.log('Corner reload, stroke settings, and sequential empty captions passed');
}finally{await app.close();}

