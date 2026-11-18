import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const work=resolve('artifacts/multi-selection');await mkdir(work,{recursive:true});
const app=await electron.launch({args:['.',`--user-data-dir=${work}/profile-${Date.now()}`]});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.locator('.canvas-tools').waitFor();
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const state=()=>page.evaluate(()=>window.pteron.call('state'));
 const wait=async(check:()=>Promise<boolean>)=>{for(let i=0;i<200;i++){if(await check())return;await page.waitForTimeout(50);}throw new Error('Expected state was not reached');};
 const command=async(command:unknown)=>{const s=await state();return page.evaluate(({command,revision})=>window.pteron.call('command',{command,revision}),{command,revision:s.project.revision});};
 let s=await state();const screenId=s.project.screens[0].id;
 await command({type:'project.settings',width:320,height:240,fps:30});
 await command({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect data-name="A" x="20" y="20" width="100" height="80" fill="#ff0000" fill-opacity="0.4" stroke="#ff0000" stroke-width="4"/><rect data-name="B" x="80" y="60" width="100" height="80" fill="#0000ff" fill-opacity="0.8" stroke="#ff0000" stroke-width="4"/><rect data-name="C" x="220" y="100" width="40" height="40" fill="#22aa66" stroke="#ff0000" stroke-width="4"/></svg>'});
 const objects=()=>page.evaluate(screenId=>window.pteron.call('objects',{screenId}),screenId);
 const initial=await objects(),ids=initial.map((object:any)=>object.id);
 const select=async(name:string,add=false)=>{await page.locator('.layers').getByRole('button',{name,exact:true}).click({modifiers:add?['Control']:[]});};
 await select('A');await select('B',true);await page.getByText('2 layers',{exact:true}).waitFor();
 const properties=page.getByRole('region',{name:'Selection properties',exact:true});await properties.getByText('Mixed',{exact:true}).first().waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Shape name',exact:true}).count(),0);
 await properties.getByRole('button',{name:'Fill color',exact:true}).click();const untouched=(await state()).project.revision;await page.getByRole('slider',{name:'Fill alpha',exact:true}).focus();await page.keyboard.press('Tab');assert.equal((await state()).project.revision,untouched,'Focusing mixed alpha must not overwrite it');await page.getByRole('textbox',{name:'Fill hex',exact:true}).fill('#22aa66');await page.getByRole('textbox',{name:'Fill hex',exact:true}).press('Tab');
 await wait(async()=>(await objects()).slice(0,2).every((object:any)=>object.attributes.fill==='#22aa66'));await page.keyboard.press('Escape');
 assert.equal(await page.locator('.layer-label[aria-pressed="true"]').count(),2);
 const x=page.getByRole('spinbutton',{name:'Selection x',exact:true});await x.fill('40');await x.press('Tab');
 await wait(async()=>{const info=await page.evaluate(({screenId,objectIds})=>window.pteron.call('selection.info',{screenId,objectIds}),{screenId,objectIds:ids.slice(0,2)});return info.bounds.x===40;});
 await page.screenshot({path:`${work}/mixed-properties.png`});
 await select('C',true);await page.getByText('3 layers',{exact:true}).waitFor();await page.getByRole('button',{name:'Distribute horizontally',exact:true}).click();
 await wait(async()=>(await state()).activity.at(-1)?.command==='object.alignSelection');
 await page.getByRole('button',{name:'Group',exact:true}).click();await page.locator('.layers').getByRole('button',{name:'Group',exact:true}).waitFor();
 await page.locator('.layers').getByRole('button',{name:'Group',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'Ungroup',exact:true}).click();
 await page.getByText('3 layers',{exact:true}).waitFor();await wait(async()=>(await objects()).length===3);assert.deepEqual((await objects()).map((object:any)=>object.id),ids);
 await select('A');await select('B',true);await page.getByText('2 layers',{exact:true}).waitFor();await properties.locator('summary').click();
 for(const name of ['Combine paths','Union','Subtract','Intersect','Exclude']){const button=properties.getByRole('button',{name,exact:true});assert.equal((await button.textContent())?.trim(),'');assert.equal(await button.getAttribute('title'),name);assert.equal(await button.locator('svg').count(),1);}
 assert.equal(await properties.getByText('Subtract cuts front shapes from the back shape.',{exact:false}).count(),0);
 await properties.locator('.shape-operation-actions').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${work}/shape-operations.png`});
 await properties.getByRole('button',{name:'Union',exact:true}).click();
 await wait(async()=>(await objects()).length===2);assert.equal((await objects())[0].id,ids[0]);assert.equal((await objects())[0].type,'path');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await wait(async()=>(await objects()).length===3);
 await select('A');await page.getByRole('button',{name:'Stroke settings',exact:true}).click();
 for(const edge of ['Right','Bottom','Left'])await page.getByRole('button',{name:`${edge} stroke edge`,exact:true}).click();
 await wait(async()=>(await objects())[0].attributes['data-stroke-edges']==='top');
 await page.keyboard.press('Escape');await page.getByRole('spinbutton',{name:'Shape width',exact:true}).fill('120');await page.getByRole('spinbutton',{name:'Shape width',exact:true}).press('Tab');
 await wait(async()=>(await objects())[0].attributes.width==='120');assert.equal((await objects()).length,3);
 await page.getByRole('button',{name:'Corner settings',exact:true}).click();await page.getByRole('spinbutton',{name:'Top left radius',exact:true}).fill('12');await page.getByRole('spinbutton',{name:'Top left radius',exact:true}).press('Tab');await page.keyboard.press('Escape');
 await wait(async()=>(await objects())[0].attributes['data-corners']?.startsWith('12,'));
 const source=(await state()).project.screens[0].svg;await writeFile(`${work}/directional-stroke.svg`,source);
 // Reload through the actual editor and verify internal paths stay one layer.
 await page.reload();await page.locator('.canvas-tools').waitFor();await select('A');await page.getByRole('button',{name:'Stroke settings',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Top stroke edge',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('button',{name:'Bottom stroke edge',exact:true}).getAttribute('aria-pressed'),'false');
 await page.screenshot({path:`${work}/stroke-edges.png`});await page.keyboard.press('Escape');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${work}/compact.png`});
 // Text and vectors share project-space bounds using Chromium font metrics.
 await command({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><text data-name="Label" x="50" y="200" font-family="Arial" font-size="24">Label</text></svg>'});
 await select('C');await select('Label',true);await page.getByText('2 layers',{exact:true}).waitFor();
 await page.getByRole('spinbutton',{name:'Selection x',exact:true}).waitFor();const textX=page.getByRole('spinbutton',{name:'Selection x',exact:true});await textX.fill('60');await textX.press('Tab');
 const textIds=(await objects()).filter((object:any)=>['C','Label'].includes(object.name)).map((object:any)=>object.id);
 await wait(async()=>{const info=await page.evaluate(({screenId,objectIds})=>window.pteron.call('selection.info',{screenId,objectIds}),{screenId,objectIds:textIds});return Math.abs(info.bounds.x-60)<.001;});
 assert.deepEqual(errors,[]);
 console.log('Multi-selection properties, bulk edits, bounds, distribution, Group/Ungroup, Union/undo and per-edge stroke reload passed');
}finally{await app.close();}
