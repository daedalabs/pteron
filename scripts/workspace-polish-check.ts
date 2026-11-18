import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Page} from 'playwright';

export async function checkWorkspacePolish(page:Page,output:string){
 await mkdir(output,{recursive:true});
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:800,height:560});
 const state=()=>page.evaluate(()=>window.pteron.call('state'));
 const command=async(command:unknown)=>{
  const revision=(await state()).project.revision;
  return page.evaluate(args=>window.pteron.call('command',args),{revision,command});
 };
 const tools=page.getByRole('toolbar',{name:'Canvas tools'});
 await tools.waitFor();
 const area=page.locator('.canvas-area');
 await page.screenshot({path:resolve(output,'blank-800.png'),animations:'disabled'});
 await page.evaluate(async()=>window.pteron.call('example.open',{revision:(await window.pteron.call('state')).project.revision}));
 await page.locator('.screen-card').nth(5).waitFor();
 assert.equal((await state()).project.name,'Small idea, big motion');
 assert.equal((await state()).path,undefined);
 assert.equal(await page.locator('.all-screens').getAttribute('data-scene-count'),'6');
 assert.ok(await page.locator('.ruler-time>span').count()>3,'Short scenes keep a readable ruler');
 await command({type:'project.create',name:'Workspace polish probe',width:320,height:240});
 const screenId=(await state()).project.screens[0].id;
 const beforeDraw=await state();
 const rectangle=tools.getByRole('button',{name:'Rectangle',exact:true});
 await rectangle.click();
 assert.equal(await rectangle.getAttribute('aria-pressed'),'true');
 assert.equal(await rectangle.getAttribute('title'),'Draw a rectangle (M)');
 assert.equal(await rectangle.getAttribute('aria-description'),await rectangle.getAttribute('title'));
 assert.deepEqual(await state(),beforeDraw);
 await page.frameLocator('iframe').locator('html[data-editor-mode="rect"]').waitFor({state:'attached'});
 const canvas=(await page.locator('iframe').boundingBox())!;
 await page.mouse.move(canvas.x+20,canvas.y+20);
 await page.mouse.down();
 await page.mouse.move(canvas.x+52,canvas.y+52,{steps:5});
 await page.mouse.up();
 const drawn=page.getByRole('complementary',{name:'Layers'}).getByRole('button',{name:'Rectangle',exact:true});
 await drawn.waitFor();
 const drawnId=await drawn.evaluate(element=>element.closest<HTMLElement>('[data-layer-id]')!.dataset.layerId);
 assert.ok(drawnId);
 await tools.getByRole('button',{name:'Select',exact:true}).click();

 const pressedStyle=(button:ReturnType<Page['getByRole']>)=>button.evaluate(element=>getComputedStyle(element).boxShadow);
 for(const [name,hint] of [['Snap artwork','Artwork snapping on'],['Snap timing','Timing snapping on']]){
  const button=page.getByRole('button',{name,exact:true});
  assert.equal(await button.getAttribute('aria-pressed'),'true');
  assert.match((await button.getAttribute('title'))!,new RegExp(hint));
  const active=await pressedStyle(button);
  await button.click();
  assert.equal(await button.getAttribute('aria-pressed'),'false');
  assert.notEqual(await pressedStyle(button),active);
  await button.click();
 }

 const matchedName='A long connector path name (A) / (a)';
 await command({type:'artwork.import',screenId,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><g data-name="Connector group"><rect data-name="${matchedName}" x="80" width="40" height="30"/><circle data-name="Sibling" cx="40" cy="40" r="10"/></g></svg>`});
 const layers=page.getByRole('complementary',{name:'Layers'});
 const search=layers.getByRole('searchbox',{name:'Filter layers'});
 await search.fill(' (a) ');
 const label=layers.getByRole('button',{name:matchedName,exact:true});
 assert.deepEqual(await label.locator('mark').allTextContents(),['(A)','(a)']);
 const matchBox=(await label.locator('mark').first().boundingBox())!;
 const nameBox=(await label.locator('.layer-match-name').boundingBox())!;
 assert.ok(matchBox.x+matchBox.width<=nameBox.x+nameBox.width+1,'A late match stays visible in the compact name column');
 assert.equal(await layers.locator('[data-filter-context="true"] .layer-label').innerText(),'Connector group');
 assert.equal(await layers.getByRole('button',{name:'Sibling',exact:true}).count(),0);
 await page.screenshot({path:resolve(output,'layer-matches-800.png'),animations:'disabled'});
 await search.press('Escape');
 assert.equal(await layers.locator('mark,[data-filter-context]').count(),0);

 await command({type:'clip.put',screenId,clip:{id:'polish-clip',objectId:drawnId,preset:'Slide',start:4,duration:20}});
 await page.getByRole('button',{name:'Slide clip',exact:true}).press('Enter');
 const settings=page.getByRole('region',{name:'Transition settings'});
 await settings.waitFor();
 await page.getByRole('button',{name:'Show clip timing in frames',exact:true}).click();
 assert.equal(await settings.getByRole('spinbutton',{name:'Start',exact:true}).inputValue(),'4');
 assert.equal(await settings.getByRole('spinbutton',{name:'Duration',exact:true}).inputValue(),'20');
 assert.equal(await page.locator('.clip-time-fields').evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length),1,'Compact clip timing stacks before it can clip');
 await page.getByRole('button',{name:'Show clip timing in seconds',exact:true}).click();
 assert.equal(await settings.getByRole('spinbutton',{name:'Start',exact:true}).inputValue(),String(Number((4/30).toFixed(6))));
 const loop=page.getByRole('button',{name:'Loop selected clips'});
 await loop.click();
 assert.equal(await loop.getAttribute('aria-pressed'),'true');
 assert.equal(await loop.getAttribute('title'),'Stop looping the selected range');
 const path=page.getByRole('button',{name:'Edit motion on canvas'});
 await path.click();
 assert.equal(await path.getAttribute('aria-pressed'),'true');
 assert.equal(await path.getAttribute('title'),'Hide motion handles');
 assert.notEqual(await pressedStyle(path),'none');
 await page.screenshot({path:resolve(output,'active-tools-800.png'),animations:'disabled'});
 await path.click();
 await loop.click();
 assert.ok(await page.evaluate(()=>innerWidth===800&&innerHeight===560&&document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
}
