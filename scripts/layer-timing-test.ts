import {_electron as electron,chromium} from 'playwright';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {evaluate} from '../src/core/motion';

const work=resolve('artifacts/layer-timing');await mkdir(work,{recursive:true});
const app=await electron.launch({args:['.',`--user-data-dir=${work}/profile-${Date.now()}`]});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.locator('.canvas-tools').waitFor();
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const state=()=>page.evaluate(()=>window.pteron.call('state'));
 const wait=async(check:()=>Promise<boolean>)=>{for(let n=0;n<240;n++){if(await check())return;await page.waitForTimeout(50);}throw new Error('Timing state did not settle');};
 const command=async(command:unknown)=>{const s=await state();return page.evaluate(({command,revision})=>window.pteron.call('command',{command,revision}),{command,revision:s.project.revision});};
 const initial=await state(),screenId=initial.project.screens[0].id;
 await command({type:'project.settings',width:320,height:240,fps:30});
 await command({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect data-name="Tile" x="80" y="100" width="80" height="60" fill="#ff00ff"/><rect data-name="Gone" x="200" y="80" width="40" height="40" fill="#00ffff"/></svg>'});
 const objects=await page.evaluate(screenId=>window.pteron.call('objects',{screenId}),screenId),objectId=objects[0].id,goneId=objects[1].id;
 for(const clip of [{id:'out',objectId,preset:'Fade out',start:10,duration:12},{id:'in',objectId,preset:'Slide',start:40,duration:12},{id:'gone',objectId:goneId,preset:'Fade out',start:78,duration:12}])await command({type:'clip.put',screenId,clip});
 const track=page.locator(`[data-object-id="${objectId}"]`);await wait(async()=>await track.locator('.layer-range').count()===2);
 const first=track.locator('.layer-range').first();await first.click({position:{x:8,y:2}});await page.getByRole('region',{name:'Layer timing settings',exact:true}).waitFor();
 // Move the outer band; its exit motion must move by the same frame delta.
 const box=await first.boundingBox(),lane=await track.locator('.track-lane').boundingBox();assert.ok(box&&lane);
 await page.mouse.move(box.x+box.width/2,box.y+2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+5/90*lane.width,box.y+2,{steps:4});await page.mouse.up();
 await wait(async()=>(await state()).project.screens[0].clips.find((clip:any)=>clip.id==='out').start===15);
 assert.equal((await state()).project.screens[0].lifetimes[objectId][0].start,5);
 const before=(await state()).project.revision,out=page.getByRole('spinbutton',{name:'Layer out frame',exact:true});await out.fill('20');await out.press('Tab');
 await page.getByRole('alert').waitFor();assert.equal((await state()).project.revision,before);await wait(async()=>await out.inputValue()==='27');
 await page.getByRole('button',{name:'Dismiss error',exact:true}).click();
 // Frame-zero scrubbing is a real preview, not a reset to authored visibility.
 const ruler=page.getByRole('slider',{name:'Playhead',exact:true});await ruler.press('Home');
 const tile=page.frameLocator('iframe').locator(`[id="${objectId}"]`);await wait(async()=>await tile.getAttribute('display')==='none');
 await ruler.press('PageDown');assert.equal(await ruler.getAttribute('aria-valuenow'),'30');await wait(async()=>await tile.getAttribute('display')==='none');
 for(let n=0;n<15;n++)await ruler.press('ArrowRight');
 await wait(async()=>await tile.getAttribute('display')!=='none');assert.equal(await tile.getAttribute('opacity'),'1');
 await page.screenshot({path:`${work}/ranges.png`});
 // A pointer edit restores authored SVG instead of committing sampled transforms.
 const authored=(await state()).project.screens[0].svg;await tile.click({position:{x:10,y:10}});await page.waitForTimeout(100);assert.equal((await state()).project.screens[0].svg,authored);
 const source=(await state()).project.screens[0];await writeFile(`${work}/source.json`,JSON.stringify(source));
 const sampleFrames=[0,5,15,20,26,30,40,45,51,89];
 const browser=await chromium.launch({headless:true,args:['--allow-file-access-from-files'],...(process.env.PTERON_BROWSER?{executablePath:process.env.PTERON_BROWSER}:{})});
 try{const reference=await browser.newPage({viewport:{width:320,height:240},deviceScaleFactor:1});await reference.goto(new URL(`file:///${resolve('dist/ui/geometry.html').replaceAll('\\','/')}`).href);await reference.waitForFunction(()=>Boolean(window.sampleSvg));await reference.addStyleTag({content:'html,body{margin:0;background:white}'});
  for(const [index,frame] of sampleFrames.entries()){const svg=await reference.evaluate(({svg,poses})=>window.sampleSvg(svg,poses),{svg:source.svg,poses:evaluate(source,frame)});await writeFile(`${work}/frame-${index}.svg`,svg);await reference.screenshot({path:`${work}/browser-${index}.png`});}
 }finally{await browser.close();}
 await writeFile(`${work}/request.json`,JSON.stringify({operation:'render',work,width:320,height:240,fps:30,frames:sampleFrames.map((_,i)=>`frame-${i}.svg`)}));
 await page.getByRole('button',{name:'Add scene',exact:true}).click();await wait(async()=>(await state()).project.screens.length===2);const p=(await state()).project,next=p.screens[1];
 assert.equal(next.clips.length,0);assert.equal(next.links[objectId],screenId);
 const carried=await page.evaluate(screenId=>window.pteron.call('objects',{screenId}),next.id);assert.ok(carried.some((object:any)=>object.id===objectId));assert.ok(!carried.some((object:any)=>object.id===goneId));
 await page.getByRole('button',{name:'Play',exact:true}).click();await wait(async()=>await page.getByRole('button',{name:'Play',exact:true}).count()===1&&await ruler.getAttribute('aria-valuenow')==='89');
 assert.equal(await ruler.getAttribute('aria-valuenow'),'89','Completion must hold the last sampled frame');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${work}/compact.png`});
 assert.deepEqual(errors,[]);console.log('Layer ranges, nested motion movement, rejected trims, frame-zero visibility, re-entry, carry-forward and playback completion passed');
}finally{await app.close();}
