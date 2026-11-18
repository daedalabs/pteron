import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const packaged=process.argv.includes('--packaged');
await mkdir('artifacts/workspace',{recursive:true});
const app=await electron.launch({...(packaged?{executablePath:resolve('artifacts/standalone/win-unpacked/pteron.exe')}:{ }),args:[...(packaged?[]:['.']),resolve('examples/small-idea.pteron'),`--user-data-dir=${resolve('artifacts/workspace/profile-'+Date.now())}`],timeout:30000});
const appProcess=app.process();
try{
 const page=await app.firstWindow();page.setDefaultTimeout(20000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('toolbar',{name:'Canvas tools'}).waitFor();await page.locator('.screen-card').nth(5).waitFor();
 await page.getByRole('region',{name:'Canvas properties',exact:true}).waitFor();
 const columns=await page.locator('.workspace').evaluate(root=>['.screens-sidebar','.layers-sidebar','.canvas-panel','.right-panel'].map(selector=>{const box=root.querySelector(selector)!.getBoundingClientRect();return {x:box.x,y:box.y,right:box.right};}));for(let i=1;i<columns.length;i++){assert.ok(columns[i].x>=columns[i-1].right);assert.equal(columns[i].y,columns[0].y);}
 assert.equal(await page.locator('.application-header').count(),1);assert.equal(await page.locator('.canvas-heading').count(),0);
 assert.match(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle()),/pteron.*1080 × 1920.*30 fps/);
 const menu=await app.evaluate(({Menu})=>Menu.getApplicationMenu()?.items.map(i=>({label:i.label,children:i.submenu?.items.map(c=>c.label)})));
 assert.ok(menu?.find(i=>i.label==='&File')?.children?.includes('Export MP4…'));assert.ok(menu?.find(i=>i.label==='&Edit')?.children?.includes('Undo'));
 const state=await page.evaluate(()=>window.pteron.call('state'));
 await page.locator('.screen-card').nth(5).click();
 await page.waitForFunction(id=>document.querySelector('.layers')?.getAttribute('data-screen-id')===id,state.project.screens[5].id);
 while(await page.locator('.timeline .track-expand[aria-expanded=false]').count())await page.locator('.timeline .track-expand[aria-expanded=false]').first().click();
 await page.getByRole('button',{name:'Rock clip',exact:true}).first().click();
 await page.getByRole('region',{name:'Transition settings'}).waitFor();
 const settings=page.getByRole('region',{name:'Transition settings'});
 const canvasWithTransition=await page.locator('.canvas-panel').evaluate(el=>el.clientWidth);
 await page.getByRole('button',{name:'Close transition',exact:true}).click();assert.equal(await settings.count(),0);
 await page.getByRole('button',{name:'Properties',exact:true}).click();await page.getByRole('region',{name:'Properties',exact:true}).waitFor();
 assert.equal(await page.locator('.canvas-panel').evaluate(el=>el.clientWidth),canvasWithTransition);
 await page.getByRole('button',{name:'Rock clip',exact:true}).first().click();await settings.waitFor();
 await page.locator('.layer-label').first().click();assert.equal(await settings.count(),0);await page.getByRole('region',{name:'Properties',exact:true}).waitFor();
 await page.getByRole('button',{name:'Rock clip',exact:true}).first().click();await settings.waitFor();
 const panelTabs=page.getByRole('group',{name:'Workspace panels'});
 const tabs=await panelTabs.boundingBox();
 await page.getByRole('button',{name:'Presets',exact:true}).click();
 await page.locator('.motion-list').evaluate(el=>el.scrollTop=9999);
 assert.equal((await panelTabs.boundingBox())?.y,tabs?.y);
 assert.equal(await settings.isVisible(),false);
 await page.getByRole('button',{name:'Clip',exact:true}).click();await settings.waitFor();
 const ruler=await page.locator('.ruler').boundingBox();await page.locator('.timeline-scroll').evaluate(el=>el.scrollTop=9999);assert.equal((await page.locator('.ruler').boundingBox())?.y,ruler?.y);
 const beforeWidth=await page.locator('.screens-sidebar').evaluate(el=>el.clientWidth);
 await page.getByRole('separator',{name:'Resize scenes sidebar'}).focus();await page.keyboard.press('ArrowRight');assert.ok(await page.locator('.screens-sidebar').evaluate(el=>el.clientWidth)>beforeWidth);
 const beforeHeight=await page.locator('.timeline').evaluate(el=>el.clientHeight);await page.getByRole('separator',{name:'Resize timeline',exact:true}).focus();await page.keyboard.press('ArrowUp');assert.ok(await page.locator('.timeline').evaluate(el=>el.clientHeight)>beforeHeight);
 // Change screens while there is an active inspector/selection: neither leaks.
 await page.locator('.screen-card').first().click();await page.waitForFunction(id=>document.querySelector('.layers')?.getAttribute('data-screen-id')===id,state.project.screens[0].id);await page.getByRole('button',{name:'Properties',exact:true}).click();await page.getByRole('region',{name:'Canvas properties',exact:true}).waitFor();assert.ok(!(await page.locator('.layers').innerText()).includes('Tall flower'));
 const screenId=state.project.screens[0].id;
 const count=(await page.evaluate(id=>window.pteron.call('objects',{screenId:id}),screenId)).length;
 await page.getByRole('toolbar',{name:'Canvas tools'}).getByRole('button',{name:'Rectangle',exact:true}).click();await page.frameLocator('iframe').locator('html[data-editor-mode="rect"]').waitFor({state:'attached'});
 const cursor=await page.frameLocator('iframe').locator('#editor').evaluate(el=>getComputedStyle(el).cursor);assert.match(cursor,/data:image\/svg\+xml/);
 const box=await page.locator('iframe').boundingBox();assert.ok(box);await page.mouse.move(box.x+25,box.y+25);await page.mouse.down();await page.mouse.move(box.x+60,box.y+60,{steps:5});await page.mouse.up();
 for(let i=0;i<100;i++){const n=(await page.evaluate(id=>window.pteron.call('objects',{screenId:id}),screenId)).length;if(n===count+1)break;if(i===99)throw new Error('Drawing failed');await page.waitForTimeout(50);}
 // Ctrl+Z in the embedded artwork window must use project history.
 await page.locator('iframe').focus();await page.keyboard.press('Control+z');
 for(let i=0;i<100;i++){const n=(await page.evaluate(id=>window.pteron.call('objects',{screenId:id}),screenId)).length;if(n===count)break;if(i===99)throw new Error('Canvas keyboard undo failed');await page.waitForTimeout(50);}
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await page.getByRole('button',{name:'Select',exact:true}).click();await page.frameLocator('iframe').locator('html[data-editor-mode="select"]').waitFor({state:'attached'});assert.ok(!(await page.frameLocator('iframe').locator('#editor').evaluate(el=>getComputedStyle(el).cursor)).includes('data:image'));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));await page.waitForTimeout(250);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('toolbar',{name:'Canvas tools'}).waitFor();
 await page.screenshot({path:'artifacts/workspace/compact.png'});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));await page.locator('.screen-card').nth(5).click();await page.getByRole('button',{name:'Rock clip',exact:true}).first().click();await page.waitForTimeout(150);await page.screenshot({path:'artifacts/workspace/desktop.png'});
 await app.evaluate(({Menu,BrowserWindow})=>{const item=Menu.getApplicationMenu()!.items[0].submenu!.items.find(i=>i.label==='New project…')!;item.click(item,BrowserWindow.getAllWindows()[0],{} as any);});await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
 assert.deepEqual(errors,[]);await writeFile('artifacts/workspace/report.json',JSON.stringify({passed:true,packaged,checks:['themed application header and native File/Edit menus','floating accessible icons','shape cursors','screen-scoped layers','sticky ruler/tabs','split collapsible settings','resizable panels/window','canvas keyboard undo and UI redo','compact viewport'],errors},null,2));console.log('Workspace acceptance passed');
}finally{let timeout:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([app.close(),new Promise<void>(resolve=>{timeout=setTimeout(()=>{appProcess.kill();resolve();},5000);})]);}finally{clearTimeout(timeout);}}






