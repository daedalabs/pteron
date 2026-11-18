import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const packaged=process.argv.includes('--packaged');
await mkdir('artifacts/selection-regression',{recursive:true});
const app=await electron.launch({...(packaged?{executablePath:resolve('artifacts/standalone/win-unpacked/pteron.exe')}:{}),args:[...(packaged?[]:['.']),`--user-data-dir=${resolve('artifacts/selection-regression/profile-'+Date.now())}`]});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(12000);await page.locator('.canvas-tools').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
 const state=()=>page.evaluate(()=>window.pteron.call('state'));
 const waitRevision=async(revision:number)=>{for(let i=0;i<200;i++){if((await state()).project.revision>revision)return;await page.waitForTimeout(25);}throw new Error('Canvas command did not commit');};
 let s=await state();const screenId=s.project.screens[0].id;
 await page.evaluate(({revision,screenId})=>window.pteron.call('command',{revision,command:{type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><svg x="80" y="80" width="800" height="1200" viewBox="0 0 1600 2400"><g data-name="Pair"><rect data-name="Drag me" x="100" y="100" width="200" height="100" fill="#ff3366"/><rect data-name="Stay here" x="450" y="300" width="200" height="100" fill="#33cc66"/></g></svg></svg>'}}),{revision:s.project.revision,screenId});
 await page.locator('.layers').getByRole('button',{name:'Drag me',exact:true}).waitFor();
 const objects=()=>page.evaluate(screenId=>window.pteron.call('objects',{screenId}),screenId);
 const list=await objects(),child=list.find((o:any)=>o.name==='Drag me'),sibling=list.find((o:any)=>o.name==='Stay here'),group=list.find((o:any)=>o.name==='Pair');
 const frame=page.frameLocator('iframe');const target=frame.locator(`[id="${child.id}"]`);
 const canvasBox=await page.locator('iframe').boundingBox();assert.ok(canvasBox);
 await target.click();assert.equal(await page.getByLabel('Shape name',{exact:true}).inputValue(),'Pair','workspace selected a structural wrapper');
 await page.locator('.layers').getByRole('button',{name:'Drag me',exact:true}).click();
 await page.getByLabel('Shape name',{exact:true}).waitFor();assert.equal(await page.getByLabel('Shape name',{exact:true}).inputValue(),'Drag me');
 const selectionBox=await frame.locator('[id^="selectedBox"]:visible').boundingBox(),artBox=await target.boundingBox();assert.ok(selectionBox&&artBox);assert.ok(Math.abs(selectionBox.x+selectionBox.width/2-artBox.x-artBox.width/2)<1,'selection overlay x disagrees with artwork');assert.ok(Math.abs(selectionBox.y+selectionBox.height/2-artBox.y-artBox.height/2)<1,'selection overlay y disagrees with artwork');
 let before=await state();const beforeObjects=await objects();
 const box=await target.boundingBox();assert.ok(box);const x=box.x+box.width/2,y=box.y+box.height/2;
 // Clicking does not move or start an edit; hovering afterward must never drag.
 await page.mouse.click(x,y);await page.mouse.move(x+30,y+20);await page.waitForTimeout(200);
 assert.equal((await state()).project.revision,before.project.revision,'click/hover created an edit');
 // Hold-drag only the selected child, then release before moving the pointer again.
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+30,y+20,{steps:8});await page.mouse.up();
 await waitRevision(before.project.revision);
 const moved=await objects();assert.deepEqual(moved.find((o:any)=>o.id===sibling.id)?.attributes,beforeObjects.find((o:any)=>o.id===sibling.id)?.attributes,'sibling moved');
 assert.notDeepEqual(moved.find((o:any)=>o.id===child.id)?.attributes,beforeObjects.find((o:any)=>o.id===child.id)?.attributes,'child did not move');
 const movedBox=await target.boundingBox();assert.ok(movedBox);assert.ok(Math.abs(movedBox.x-box.x-30)<1,'nested drag x did not follow pointer');assert.ok(Math.abs(movedBox.y-box.y-20)<1,'nested drag y did not follow pointer');
 const after=await state();assert.equal(after.history.undo,before.history.undo+1,'drag must be exactly one undo entry');
 await page.mouse.move(x+60,y+60);await page.waitForTimeout(200);assert.equal((await state()).project.revision,after.project.revision,'release kept dragging');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await waitRevision(after.project.revision);
 const undone=await objects();assert.deepEqual(undone.map((o:any)=>[o.id,o.attributes]),beforeObjects.map((o:any)=>[o.id,o.attributes]),'undo did not restore exact pre-drag artwork');
 // Wait for the authoritative undo to finish reloading the embedded document.
 await page.frames().find(f=>f.url().endsWith('canvas.html'))!.waitForFunction(({id,x,y})=>{const el=document.getElementById(id);return el?.getAttribute('x')===x&&el?.getAttribute('y')===y&&!el?.getAttribute('transform');},{id:child.id,x:beforeObjects.find((o:any)=>o.id===child.id).attributes.x,y:beforeObjects.find((o:any)=>o.id===child.id).attributes.y});
 // Releasing outside the iframe also finishes exactly one gesture.
 const releaseBefore=await state(),releaseBox=await target.boundingBox(),iframeBox=await page.locator('iframe').boundingBox();assert.ok(releaseBox&&iframeBox);
 await page.mouse.move(releaseBox.x+releaseBox.width/2,releaseBox.y+releaseBox.height/2);await page.mouse.down();await page.mouse.move(iframeBox.x+iframeBox.width+12,releaseBox.y+releaseBox.height/2,{steps:15});await page.mouse.up();
 await waitRevision(releaseBefore.project.revision);
 const released=await state();assert.equal(released.history.undo,releaseBefore.history.undo+1);
 await page.mouse.move(iframeBox.x+30,iframeBox.y+30);await page.waitForTimeout(150);assert.equal((await state()).project.revision,released.project.revision);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await waitRevision(released.project.revision);
 assert.deepEqual((await objects()).map((o:any)=>[o.id,o.attributes]),beforeObjects.map((o:any)=>[o.id,o.attributes]));
 // Switching inspector tabs must not move or rescale the artboard.
 const artBefore=await page.locator('iframe').boundingBox();await page.getByRole('button',{name:'Narration',exact:true}).click();await page.waitForTimeout(100);assert.deepEqual(await page.locator('iframe').boundingBox(),artBefore);
 await target.click({modifiers:['Control']});await page.waitForFunction(id=>document.querySelector(`[data-layer-id="${id}"] .layer-label`)?.getAttribute('aria-pressed')==='true',child.id);assert.equal(await page.getByLabel('Shape name',{exact:true}).inputValue(),'Drag me');
 await page.getByRole('button',{name:'Collapse Pair',exact:true}).click();assert.equal(await page.locator(`[data-layer-id="${child.id}"]`).count(),0);await page.getByRole('button',{name:'Expand Pair',exact:true}).click();
 const row=page.locator(`[data-layer-id="${child.id}"]`),thumb=row.locator('.layer-preview > svg');
 const thumbBefore=await thumb.evaluate(e=>e.outerHTML);await row.getByRole('button',{name:'Hide Drag me',exact:true}).click();await row.getByRole('button',{name:'Show Drag me',exact:true}).waitFor();assert.equal(await thumb.evaluate(e=>e.outerHTML),thumbBefore,'hidden layer changed thumbnail');
 assert.equal(await row.locator('.layer-preview').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await thumb.locator('rect').count(),1,'thumbnail includes siblings');
 await page.screenshot({path:'artifacts/selection-regression/desktop.png'});
 console.log('Selection regression passed: held child drag, release, exact undo, stable canvas, collapsible groups and transparent hidden thumbnails', {packaged});
}finally{await app.close();}
