import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {checkTimelineSelection} from './timeline-selection-check';
await mkdir('artifacts/ui-audit',{recursive:true});
const packaged=process.argv.includes('--packaged');
const app=await electron.launch({...(packaged?{executablePath:resolve('artifacts/standalone/win-unpacked/pteron.exe')}:{}),args:[...(packaged?[]:['.']),resolve('examples/small-idea.pteron'),`--user-data-dir=${resolve('artifacts/ui-audit/layout-'+Date.now())}`]});
try{
 const page=await app.firstWindow();await page.locator('.audio-track').waitFor();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // The short-content fixture is independent of the bundled sample's layer count.
 const initial=await page.evaluate(()=>window.pteron.call('state'));
 const objects=await page.evaluate(screenId=>window.pteron.call('objects',{screenId}),initial.project.screens[0].id);
 await page.evaluate(({revision,screenId,objectIds})=>window.pteron.call('command',{revision,command:{type:'object.deleteMany',screenId,objectIds}}),{revision:initial.project.revision,screenId:initial.project.screens[0].id,objectIds:objects.filter((o:any)=>!o.parentId).map((o:any)=>o.id)});
 initial.project.revision=(await page.evaluate(()=>window.pteron.call('state'))).project.revision;
 await page.evaluate(({revision,screenId})=>window.pteron.call('command',{revision,command:{type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect data-name="Short fixture" width="1080" height="1920" fill="#183C35"/></svg>'}}),{revision:initial.project.revision,screenId:initial.project.screens[0].id});
 await page.locator('.track').filter({hasText:'Short fixture'}).waitFor();
 for(const [width,height] of [[1440,960],[800,560]]){
  await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setSize(width,height),{width,height});await page.waitForTimeout(200);
  const scroll=page.locator('.timeline-scroll'),media=page.locator('.timeline-media');
  const last=(await page.locator('.timeline-content .track').last().boundingBox())!,lanes=(await media.boundingBox())!;assert.ok(Math.abs(lanes.y-last.y-last.height)<=1,'Short timeline has no gap before audio');
  assert.ok(lanes.y+lanes.height<=(await scroll.boundingBox())!.y+(await scroll.boundingBox())!.height+1);
  await page.screenshot({path:`artifacts/ui-audit/timeline-${width}.png`});
 }
 const state=await page.evaluate(()=>window.pteron.call('state'));await page.evaluate(({revision,screenId})=>window.pteron.call('command',{revision,command:{type:'artwork.import',screenId,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">${Array.from({length:20},(_,i)=>`<rect data-name="Stress ${i}" x="${i*10}" y="100" width="5" height="5" fill="#fff"/>`).join('')}</svg>`}}),{revision:state.project.revision,screenId:state.project.screens[0].id});
 await page.locator('.track').filter({hasText:'Stress 19'}).waitFor();const scroll=page.locator('.timeline-scroll');
 await scroll.evaluate(e=>{e.scrollTop=0;});const box=(await scroll.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+70);await page.mouse.wheel(0,180);await page.waitForTimeout(120);assert.ok(await scroll.evaluate(e=>e.scrollTop)>0,'Native vertical timeline scrolling remains available');
 const media=(await page.locator('.timeline-media').boundingBox())!,ruler=(await page.locator('.ruler').boundingBox())!;assert.ok(media.y>=ruler.y+ruler.height-1);assert.ok(media.y+media.height<=box.y+box.height+1,'Media lanes stay visible while layer rows scroll');
 await scroll.evaluate(e=>{e.scrollTop=e.scrollHeight;});await page.screenshot({path:'artifacts/ui-audit/timeline-overflow.png'});assert.deepEqual(errors,[]);
 await page.setViewportSize({width:800,height:560});
 await page.getByRole('separator',{name:'Resize timeline'}).press('ArrowDown');
 for(let step=0;step<8;step++)await page.keyboard.press('ArrowDown');
 const minimumRuler=(await page.locator('.ruler').boundingBox())!;
 const minimumMedia=(await page.locator('.timeline-media').boundingBox())!;
 const row=(await page.locator('.timeline-content .track').first().boundingBox())!;
 assert.ok(minimumMedia.y-(minimumRuler.y+minimumRuler.height)>=row.height-1,
  'The smallest timeline leaves a full editable track row between its pinned ruler and media');
 const beforeFocus=await page.evaluate(()=>window.pteron.call('state'));
 const timeline=page.locator('.timeline'),restoredHeight=(await timeline.boundingBox())!.height;
 const focus=page.getByRole('button',{name:'Timeline focus mode',exact:true});
 await focus.press('Enter');
 assert.equal(await focus.getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.canvas-panel').isVisible(),false);
 assert.ok((await timeline.boundingBox())!.height>=500);
 await page.getByRole('button',{name:'Show Main timeline'}).click();
 assert.equal(await focus.getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:/Edit current scene/}).click();
 const playhead=page.getByRole('slider',{name:'Playhead',exact:true});
 await playhead.press('End');
 assert.equal(await playhead.getAttribute('aria-valuenow'),await playhead.getAttribute('aria-valuemax'));
 await playhead.press('Home');
 await page.screenshot({path:'artifacts/ui-audit/timeline-focus-800.png'});
 await focus.press('Enter');
 assert.equal(await focus.getAttribute('aria-pressed'),'false');
 assert.ok(await page.locator('.canvas-panel').isVisible());
 assert.equal((await timeline.boundingBox())!.height,restoredHeight);
 await app.evaluate(({Menu,BrowserWindow})=>{
  const item=Menu.getApplicationMenu()!.getMenuItemById('view.timelineFocus')!;
  item.click(item,BrowserWindow.getAllWindows()[0],{} as Electron.KeyboardEvent);
 });
 await page.waitForFunction(()=>document.querySelector('.timeline-focus-toggle')?.getAttribute('aria-pressed')==='true');
 await focus.press('Enter');
 assert.deepEqual(await page.evaluate(()=>window.pteron.call('state')),beforeFocus);
 await checkTimelineSelection(page,'artifacts/ui-audit/timeline-selection');
 console.log('Timeline layout, pinned lanes, compact selection readout and clip/caption editing passed');
}finally{await app.close();}
