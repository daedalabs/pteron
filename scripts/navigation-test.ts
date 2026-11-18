import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts/navigation',{recursive:true});
const packaged=process.argv.includes('--packaged');
const app=await electron.launch({...(packaged?{executablePath:resolve('artifacts/standalone/win-unpacked/pteron.exe')}:{}),args:[...(packaged?[]:['.']),`--user-data-dir=${resolve('artifacts/navigation/profile-'+Date.now())}`]});
try{
 const page=await app.firstWindow();await page.locator('.canvas-tools').waitFor();
 const state=()=>page.evaluate(()=>window.pteron.call('state'));
 const initial=await state(),screenId=initial.project.screens[0].id;
 await page.evaluate(async({screenId,revision})=>window.pteron.call('command',{revision,command:{type:'caption.put',screenId,caption:{id:'navigation-caption',text:'Navigation',start:10,end:60}}}),{screenId,revision:initial.project.revision});
 await page.locator('.caption-clip').waitFor();
 const baseline=await state();
 const toolbar=page.getByRole('toolbar',{name:'Canvas tools'});assert.equal(await toolbar.getAttribute('aria-orientation'),'vertical');await toolbar.getByRole('button',{name:'Select',exact:true}).focus();await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Rectangle');await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Select');await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Undo');
 for(const [w,h] of [[1440,960],[800,560]]){
  await app.evaluate(({BrowserWindow},{w,h})=>BrowserWindow.getAllWindows()[0].setSize(w,h),{w,h});await page.waitForTimeout(250);
  const area=page.locator('.canvas-area'),art=page.locator('.artboard');await area.evaluate(e=>(e as HTMLElement).blur());await area.focus();await page.keyboard.press('Control+0');await page.waitForTimeout(80);
  const original=(await art.boundingBox())!,bounds=(await area.boundingBox())!,tools=(await page.locator('.canvas-tools').boundingBox())!;
  assert.ok(tools.x>=bounds.x+bounds.width);assert.ok(tools.height>tools.width);assert.ok(original.height>bounds.height-30);
  const x=original.x+original.width*.4,y=original.y+original.height*.4;
  await page.mouse.move(x,y);await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');await page.waitForTimeout(100);
  const enlarged=(await art.boundingBox())!;assert.ok(enlarged.width>original.width);assert.ok(Math.abs((x-enlarged.x)/enlarged.width-.4)<.01);assert.ok(Math.abs((y-enlarged.y)/enlarged.height-.4)<.01);
  await page.mouse.wheel(0,45);await page.waitForTimeout(80);const scrolled=(await art.boundingBox())!;assert.ok(scrolled.y<enlarged.y-30,'Normal wheel scrolls down over the artwork iframe');
  const backing={x:bounds.x+3,y:bounds.y+bounds.height/2};
  assert.ok(await area.evaluate((element,{x,y})=>document.elementFromPoint(x,y)===element,backing),'Wheel starts over the workspace backing');
  await page.mouse.move(backing.x,backing.y);await page.mouse.wheel(0,35);await page.waitForTimeout(80);assert.ok((await art.boundingBox())!.y<scrolled.y-25,'Normal wheel scrolls down over workspace backing');await page.mouse.move(x,y);
  const laneWidth=await page.locator('.ruler-time').evaluate(e=>e.getBoundingClientRect().width);
  await page.keyboard.press('Control+=');await page.waitForTimeout(70);assert.ok((await art.boundingBox())!.width>enlarged.width);assert.equal(await page.locator('.ruler-time').evaluate(e=>e.getBoundingClientRect().width),laneWidth);
  const shifted=(await art.boundingBox())!;await page.keyboard.down('Shift');await page.mouse.wheel(0,40);await page.keyboard.up('Shift');await page.waitForTimeout(80);assert.ok((await art.boundingBox())!.x<shifted.x);
  await page.mouse.down({button:'middle'});await page.mouse.move(x+3000,y+3000,{steps:5});await page.mouse.up({button:'middle'});await page.waitForTimeout(100);
  const moved=(await art.boundingBox())!;assert.ok(moved.x<bounds.x+bounds.width&&moved.y<bounds.y+bounds.height);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));await page.waitForTimeout(120);const recovered=(await art.boundingBox())!,small=(await area.boundingBox())!;assert.ok(recovered.x<small.x+small.width&&recovered.y<small.y+small.height&&recovered.x+recovered.width>small.x&&recovered.y+recovered.height>small.y);
  await app.evaluate(({BrowserWindow},{w,h})=>BrowserWindow.getAllWindows()[0].setSize(w,h),{w,h});await page.waitForTimeout(120);
  await area.evaluate(e=>(e as HTMLElement).blur());await area.focus();await page.keyboard.press('Control+0');await page.waitForTimeout(100);const reset=(await art.boundingBox())!;assert.ok(Math.abs(reset.x-original.x)<1&&Math.abs(reset.y-original.y)<1);
  for(const all of [false,true]){
   await page.locator(all?'.all-screens':'.screen-card').click();
   const timeline=page.locator('.timeline-scroll');await timeline.focus();await page.keyboard.press('Control+0');
   const lastTrack=page.locator('.timeline-content .track').last(),lastRow=await (await lastTrack.count()?lastTrack:page.locator('.ruler')).boundingBox(),mediaBox=await page.locator('.timeline-media').boundingBox();assert.ok(lastRow&&mediaBox);assert.ok(Math.abs(mediaBox.y-lastRow.y-lastRow.height)<=1,'Media lanes follow the final track without an elastic gap');
   const ruler=page.locator('.ruler-time'),before=(await ruler.boundingBox())!,tx=before.x+Math.min(150,before.width/2),ty=before.y+15;
   await page.mouse.move(tx,ty);await page.keyboard.down('Control');await page.mouse.wheel(0,-350);await page.keyboard.up('Control');await page.waitForTimeout(100);
   const after=(await ruler.boundingBox())!;assert.ok(after.width>before.width);assert.ok(Math.abs((tx-after.x)/after.width-(tx-before.x)/before.width)<.01);
   const media=await page.locator('.caption-track .track-lane').boundingBox();assert.ok(media);assert.ok(Math.abs(media.x-after.x)<1&&Math.abs(media.width-after.width)<1);
   const pinned=await page.locator('.caption-track .track-label').boundingBox();const scrollBefore=await timeline.evaluate(e=>e.scrollLeft);
   await page.keyboard.down('Shift');await page.mouse.wheel(0,100);await page.keyboard.up('Shift');await page.waitForTimeout(100);assert.ok(await timeline.evaluate(e=>e.scrollLeft)>scrollBefore);
   assert.ok(Math.abs((await page.locator('.caption-track .track-label').boundingBox())!.x-pinned!.x)<1);
   await timeline.focus();await page.keyboard.press('Control+=');await page.waitForTimeout(60);assert.ok((await ruler.boundingBox())!.width>after.width);await page.keyboard.press('Control+-');await page.keyboard.press('Control+0');await page.waitForTimeout(100);assert.equal(await timeline.evaluate(e=>e.scrollLeft),0);assert.ok(Math.abs((await ruler.boundingBox())!.width-before.width)<1);
   assert.ok(Math.abs((await art.boundingBox())!.width-original.width)<1);
  }
  await page.screenshot({path:`artifacts/navigation/${w}.png`});
 }
 const final=await state();assert.deepEqual(final.project,baseline.project);assert.deepEqual(final.history,baseline.history);
 assert.equal(await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getType()==='window')?.getZoomFactor()),1);
 console.log('Navigation: canvas anchor, bounded pan/reset, isolated shortcuts, both timelines, media alignment, Shift+wheel and compact layout passed');
}finally{await app.close();}
