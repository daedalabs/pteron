import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts/replay',{recursive:true});
const packaged=process.argv.includes('--packaged');
const app=await electron.launch({...(packaged?{executablePath:resolve('artifacts/standalone/win-unpacked/pteron.exe')}:{}),args:[...(packaged?[]:['.']),`--user-data-dir=${resolve('artifacts/replay/profile-'+Date.now())}`]});
try{
 const page=await app.firstWindow();await page.locator('.canvas-tools').waitFor();
 const state=()=>page.evaluate(()=>window.pteron.call('state'));
 const command=async(command:unknown)=>{const {project}=await state();return page.evaluate(({revision,command})=>window.pteron.call('command',{revision,command}),{revision:project.revision,command});};
 const first=(await state()).project.screens[0].id;await command({type:'screen.update',screenId:first,duration:12});await command({type:'screen.add',afterScreenId:first,name:'Second'});const second=(await state()).project.screens[1].id;await command({type:'screen.update',screenId:second,duration:12});
 const baseline=await state(),all=page.getByRole('button',{name:'Main',exact:true});assert.equal(await all.locator('svg').count(),0);
 const ruler=page.getByRole('slider',{name:'Playhead',exact:true});
 for(const overall of [false,true]){
  await page.locator('.screen-card').first().click();if(overall)await all.click();
  await page.getByRole('button',{name:'Play',exact:true}).click();await page.getByRole('button',{name:'Pause',exact:true}).waitFor();await page.getByRole('button',{name:'Play',exact:true}).waitFor();assert.equal(await ruler.getAttribute('aria-valuenow'),overall?'23':'11');
  for(const keyboard of [false,true]){
   if(keyboard){await ruler.focus();await page.keyboard.press('Space');}else await page.getByRole('button',{name:'Play',exact:true}).click();
   await page.waitForFunction(first=>document.querySelector('.layers')?.getAttribute('data-screen-id')===first,first);await page.getByRole('button',{name:'Pause',exact:true}).waitFor();assert.ok(Number(await ruler.getAttribute('aria-valuenow'))<12,'Replay starts at first scene');
   await page.getByRole('button',{name:'Play',exact:true}).waitFor();assert.equal(await ruler.getAttribute('aria-valuenow'),overall?'23':'11');
  }
 }
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));await page.screenshot({path:'artifacts/replay/compact.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const final=await state();assert.deepEqual(final.project,baseline.project);assert.deepEqual(final.history,baseline.history);
 console.log('Replay: natural completion, click and Space restart from first screen in screen/All views; text-only All; compact fit and unchanged history passed');
}finally{await app.close();}
