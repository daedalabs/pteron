import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {checkWorkspacePolish} from './workspace-polish-check';

await mkdir('artifacts/interface-polish',{recursive:true});
const app=await electron.launch({args:['.',`--user-data-dir=${resolve('artifacts/interface-polish/profile-'+Date.now())}`]});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.locator('.canvas-tools').waitFor();
 const before=await page.evaluate(()=>window.pteron.call('state'));
 const saveStatus=page.getByRole('status',{name:'Save status'});
 assert.equal(await saveStatus.innerText(),'Not saved');
 await page.getByRole('button',{name:'Export MP4',exact:true}).locator('svg').waitFor();
 assert.equal(await page.getByRole('spinbutton',{name:'Batch frames'}).count(),0);
 await page.getByText('No layers',{exact:true}).waitFor();
 const tabs=page.getByRole('group',{name:'Workspace panels'});
 await tabs.getByRole('button',{name:'Motion',exact:true}).focus();
 await page.keyboard.press('ArrowRight');
 await page.getByRole('button',{name:'Import audio',exact:true}).waitFor();
 const importSrt=page.getByRole('button',{name:'Import SRT',exact:true});await importSrt.waitFor();
 assert.equal((await importSrt.textContent())?.trim(),'Import SRT');
 assert.equal(await importSrt.locator('svg').count(),0,'Unfamiliar imports use a text label instead of an icon-only control');
 assert.equal(await tabs.getByRole('button',{name:'Narration',exact:true}).getAttribute('aria-pressed'),'true');
 await page.keyboard.press('End');
 const sceneName=page.getByLabel('Scene name',{exact:true});
 await sceneName.fill('Discard this name');
 await sceneName.press('Escape');
 assert.equal(await sceneName.inputValue(),before.project.screens[0].name);
 await tabs.getByRole('button',{name:'Narration',exact:true}).focus();
 await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
 const search=page.getByRole('searchbox',{name:'Search motion'});
 await page.getByText('Select a layer',{exact:false}).waitFor();
 await search.fill('no such motion');await page.getByRole('button',{name:'Clear search',exact:true}).click();
 assert.equal(await search.inputValue(),'');assert.ok(await search.evaluate(element=>element===document.activeElement));
 await search.fill('fade');await search.press('Escape');assert.equal(await search.inputValue(),'');
 const aligned=()=>page.evaluate(()=>{
  const active=document.querySelector('.tabs button[aria-pressed=true]')!.getBoundingClientRect();
  const line=document.querySelector('.tabs-indicator')!.getBoundingClientRect();
  return Math.abs(active.x-line.x)<1&&Math.abs(active.width-line.width)<1;
 });
 await page.waitForFunction(()=>{
  const active=document.querySelector('.tabs button[aria-pressed=true]')!.getBoundingClientRect();
  const line=document.querySelector('.tabs-indicator')!.getBoundingClientRect();
  return Math.abs(active.x-line.x)<1&&Math.abs(active.width-line.width)<1;
 });
 assert.ok(await aligned());
 await page.screenshot({path:'artifacts/interface-polish/desktop.png'});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));
 await page.setViewportSize({width:800,height:560});
 await page.waitForFunction(()=>{
  const button=document.querySelector('.tabs button[aria-pressed=true]')!.getBoundingClientRect();
  return Math.abs(document.querySelector('.tabs-indicator')!.getBoundingClientRect().width-button.width)<1;
 });
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'artifacts/interface-polish/compact.png'});
 await page.emulateMedia({reducedMotion:'reduce'});
 await tabs.getByRole('button',{name:'Narration',exact:true}).click();
 assert.ok(await aligned(),'Reduced motion switches the indicator immediately');
 await app.evaluate(({Menu,BrowserWindow})=>{
  const item=Menu.getApplicationMenu()!.items[0].submenu!.items.find(item=>item.label==='Project settings…')!;
  item.click(item,BrowserWindow.getAllWindows()[0],{} as any);
 });
 const dialog=page.getByRole('dialog',{name:'Project settings',exact:true});await dialog.waitFor();
 assert.equal(await dialog.evaluate(element=>getComputedStyle(element).animationName),'none');
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 await page.emulateMedia({reducedMotion:'no-preference'});
 await app.evaluate(({Menu,BrowserWindow})=>{
  const item=Menu.getApplicationMenu()!.items[0].submenu!.items.find(item=>item.label==='Project settings…')!;
  item.click(item,BrowserWindow.getAllWindows()[0],{} as any);
 });
 await dialog.waitFor();assert.equal(await dialog.evaluate(element=>getComputedStyle(element).animationName),'dialog-in');
 await page.screenshot({path:'artifacts/interface-polish/dialog.png',animations:'disabled'});
 await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'detached'});
 assert.equal(await page.locator('.dialog-overlay').count(),0,'Closing releases the blocking overlay');
 const after=await page.evaluate(()=>window.pteron.call('state'));
 assert.deepEqual(after.project,before.project,'Interface interactions never mutate the authored project');
 await checkWorkspacePolish(page,'artifacts/interface-polish/workspace-polish');
 const svgPath=resolve('artifacts/interface-polish/quick-import.svg');
 await writeFile(svgPath,'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect data-name="Quick import" width="50" height="40"/></svg>');
 await page.evaluate(async()=>{
  const revision=(await window.pteron.call('state')).project.revision;
  await window.pteron.call('command',{revision,command:{type:'project.create',name:'Quick import probe',width:320,height:240}});
 });
 await app.evaluate(({dialog},filePath)=>{
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filePath]});
 },svgPath);
 const tools=page.getByRole('toolbar',{name:'Canvas tools'});
 await tools.getByRole('button',{name:'Import SVG',exact:true}).click();
 await page.getByRole('complementary',{name:'Layers'}).getByRole('button',{name:'Quick import',exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('Interface polish: keyboard switching, blank-scene actions, Layers highlights and active tools passed at 800 × 560');
}finally{await app.close();}
