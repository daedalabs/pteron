import {chromium,_electron as electron} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {ProjectStore} from '../src/core/store';
import {newProject} from '../src/core/model';
import {svgObjects} from '../src/core/svg';
import {textOutlines} from '../electron/text-outlines';

const work=resolve('artifacts/shape-usability');await mkdir(work,{recursive:true});
const executablePath=[process.env.PTERON_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(path=>path&&existsSync(path));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const checks:unknown[]=[];
try{
 const page=await browser.newPage({viewport:{width:640,height:360},deviceScaleFactor:1});
 await page.evaluate('window.__name=(fn)=>fn');
 for(const [font,weight,style,anchor] of [['Arial','normal','normal','start'],['Arial','bold','italic','middle'],['Georgia','normal','italic','end'],['Consolas','bold','normal','start'],['Segoe UI','normal','normal','middle']]){
  const store=new ProjectStore(newProject('Text outline fidelity',640,360)),screenId=store.snapshot.screens[0].id;
  store.dispatch({type:'artwork.import',screenId,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><g transform="translate(4 7)"><text data-name="Label" x="300" y="150" font-family="${font}" font-size="40" font-weight="${weight}" font-style="${style}" text-anchor="${anchor}" fill="#000000">AV office 12</text></g></svg>`},store.snapshot.revision);
  const before=store.snapshot.screens[0].svg,id=svgObjects(before).find(object=>object.type==='text')!.id;
  store.dispatch({type:'object.outline',screenId,objectIds:[id]},store.snapshot.revision,'manual',{},undefined,textOutlines(before,[id]));
  const after=store.snapshot.screens[0].svg;
  assert.equal(svgObjects(after).find(object=>object.id===id)!.type,'path');
  const result=await page.evaluate(async({before,after})=>{
   const raster=async(source:string)=>{const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(source);await image.decode();const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const context=canvas.getContext('2d')!;context.fillStyle='#ffffff';context.fillRect(0,0,640,360);context.drawImage(image,0,0);return context.getImageData(0,0,640,360).data;};
   const a=await raster(before),b=await raster(after),ink=(pixels:Uint8ClampedArray,index:number)=>pixels[index*4]<128;
   let errors=0;
   for(let y=1;y<359;y++)for(let x=1;x<639;x++){const index=y*640+x;for(const [source,target] of [[a,b],[b,a]])if(ink(source,index)){let found=false;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(ink(target,index+dy*640+dx))found=true;if(!found)errors++;}}
   return {withinOnePixel:errors===0,errors};
  },{before,after});
  await page.setContent(`<style>body{margin:0;background:white}</style>${after}`);await page.screenshot({path:resolve(work,`outline-${font.replaceAll(' ','-')}-${weight}.png`)});
  checks.push({font,weight,style,anchor,...result});assert.ok(result.withinOnePixel,JSON.stringify(checks.at(-1)));
  store.dispatch({type:'history.undo'},store.snapshot.revision);assert.equal(store.snapshot.screens[0].svg,before);
 }
}finally{await browser.close();}
await writeFile(resolve(work,'text-report.json'),JSON.stringify({passed:true,checks},null,2));
console.log('Text outline browser fidelity passed',checks);

const app=await electron.launch({args:['.',`--user-data-dir=${work}/profile-${Date.now()}`]});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.locator('.canvas-tools').waitFor();
 const state=()=>page.evaluate(()=>window.pteron.call('state'));
 const command=async(command:unknown)=>page.evaluate(({command,revision})=>window.pteron.call('command',{command,revision}),{command,revision:(await state()).project.revision});
 const wait=async(predicate:any,argument?:any,timeout=15000)=>{const deadline=Date.now()+timeout;while(!await page.evaluate(predicate,argument)){if(Date.now()>deadline)throw new Error('Timed out waiting for usability state');await page.waitForTimeout(30);}};
 const screenId=(await state()).project.screens[0].id;
 await command({type:'project.settings',width:320,height:240,fps:30});
 await command({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect data-name="A" x="40" y="40" width="20" height="20" fill="#336699" stroke="#112233" stroke-width="2"/><rect data-name="B" x="100" y="100" width="20" height="20" fill="#bb6600"/></svg>'});
 const objects=await page.evaluate(screenId=>window.pteron.call('objects',{screenId}),screenId),id=(name:string)=>objects.find((object:{name:string})=>object.name===name).id;
 const frame=page.frameLocator('iframe[title="Artwork editor"]');
 const drag=async(alt=false)=>{const a=(await frame.locator(`[id="${id('A')}"]`).boundingBox())!,b=(await frame.locator(`[id="${id('B')}"]`).boundingBox())!;await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();if(alt)await page.keyboard.down('Alt');await page.mouse.move(b.x+a.width/2+3,b.y+a.height/2+2,{steps:6});if(!alt){assert.ok(await frame.locator('#pteron-snap-guides line').count());await page.screenshot({path:resolve(work,'snap-guides.png')});}await page.mouse.up();if(alt)await page.keyboard.up('Alt');};
 await drag();
 await wait(async({screenId,objectId})=>{const box=(await window.pteron.call('selection.info',{screenId,objectIds:[objectId]})).bounds;return Math.abs(box.x-100)<=1&&Math.abs(box.y-100)<=1;},{screenId,objectId:id('A')});
 assert.equal(await frame.locator('#pteron-snap-guides line').count(),0);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await wait(async({screenId,objectId})=>(await window.pteron.call('selection.info',{screenId,objectIds:[objectId]})).bounds.x===40,{screenId,objectId:id('A')});
 await drag(true);await wait(async({screenId,objectId})=>(await window.pteron.call('selection.info',{screenId,objectIds:[objectId]})).bounds.x>101,{screenId,objectId:id('A')});
 assert.equal((await page.evaluate(screenId=>window.pteron.call('objects',{screenId}),screenId)).length,2,'Alt bypass does not clone shapes');
 await page.locator('.layers').getByRole('button',{name:'A',exact:true}).click();
 await page.getByRole('button',{name:'Rectangle',exact:true}).click();const art=(await page.locator('.artboard').boundingBox())!;
 await page.keyboard.down('Shift');await page.mouse.move(art.x+180,art.y+30);await page.mouse.down();await page.mouse.move(art.x+220,art.y+55,{steps:5});await page.mouse.up();await page.keyboard.up('Shift');
 await wait(async screenId=>(await window.pteron.call('objects',{screenId})).length===3,screenId);
 const drawn=(await page.evaluate(screenId=>window.pteron.call('objects',{screenId}),screenId)).find((object:{id:string})=>!objects.some((previous:{id:string})=>previous.id===object.id));
 assert.ok(Math.abs(Number(drawn.attributes.width)-Number(drawn.attributes.height))<=1,'Shift draws a square');assert.equal(drawn.presentation.fill,'#336699');assert.equal(drawn.presentation.stroke,'#112233');
 await command({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg"><text data-name="Export label" x="20" y="200" font-family="Arial" font-size="28">Hello AV</text></svg>'});
 await page.locator('.layers').getByRole('button',{name:'Export label',exact:true}).click();
 await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},resolve(work,'label.mp4'));
 const failed=await page.evaluate(()=>window.pteron.call('render'));
 await wait(async id=>(await window.pteron.call('jobs')).find((job:{id:string})=>job.id===id)?.status==='failed',failed.id,120000);
 const failure=await page.evaluate(async id=>(await window.pteron.call('jobs')).find((job:{id:string})=>job.id===id),failed.id);
 assert.equal(failure.screenId,screenId);assert.ok(failure.objectId);assert.ok(failure.diagnostic.includes('text'));
 await page.getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Activity and MCP…',exact:true}).click();
 await page.getByRole('button',{name:'Show export issue'}).click();await page.getByRole('textbox',{name:'Shape text',exact:true}).waitFor();
 await page.getByRole('button',{name:'Convert text to paths'}).click();await wait(async({screenId,objectId})=>(await window.pteron.call('objects',{screenId})).find((object:{id:string})=>object.id===objectId)?.type==='path',{screenId,objectId:failure.objectId});
 const successful=await page.evaluate(()=>window.pteron.call('render'));await wait(async id=>(await window.pteron.call('jobs')).find((job:{id:string})=>job.id===id)?.status==='completed',successful.id,120000);
 const exportBox=(await page.getByRole('button',{name:'Export MP4',exact:true}).boundingBox())!;assert.ok(Math.abs(exportBox.width-exportBox.height)<0.01);assert.equal((await page.getByRole('button',{name:'Export MP4',exact:true}).textContent())?.trim(),'');
 await command({type:'clip.put',screenId,clip:{id:'loop-clip',objectId:id('B'),preset:'Pulse',start:15,duration:15}});
 await page.locator('[data-clip-id="loop-clip"]').click();const revision=(await state()).project.revision;
 await page.getByRole('button',{name:'Loop selected clips'}).click();await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.waitForTimeout(1100);const playhead=page.getByRole('slider',{name:'Playhead',exact:true});assert.ok(Number(await playhead.getAttribute('aria-valuenow'))>=15&&Number(await playhead.getAttribute('aria-valuenow'))<30);await page.getByRole('button',{name:'Pause',exact:true}).click();assert.equal((await state()).project.revision,revision);
 await page.getByRole('button',{name:'Loop selected clips'}).click();
 const timeline=page.locator('.timeline-scroll');await timeline.focus();for(let step=0;step<6;step++)await page.keyboard.press('Control+=');
 await playhead.focus();await page.keyboard.press('Home');await page.keyboard.press('PageDown');await page.keyboard.press('PageDown');await page.getByRole('button',{name:'Play',exact:true}).click();
 await wait(()=>document.querySelector('.timeline-scroll')!.scrollLeft>0);await page.getByRole('button',{name:'Pause',exact:true}).click();await timeline.focus();await page.keyboard.press('Control+0');
 await command({type:'screen.add',name:'Follow-up'});const destination=(await state()).project.screens[1].id;
 await command({type:'object.unlink',screenId:destination,objectIds:[id('B')]});await command({type:'object.edit',screenId:destination,objectId:id('B'),attributes:{x:'160'}});
 await page.locator('.screen-card').nth(1).click();await page.locator('.layers').getByRole('button',{name:'B',exact:true}).click();const beforePreview=(await state()).project;
 await page.getByRole('button',{name:'Follow previous scene',exact:true}).click();await page.getByRole('img',{name:'Follow previous scene preview',exact:true}).waitFor();assert.deepEqual((await state()).project,beforePreview);
 await page.getByRole('button',{name:'Apply scene continuity'}).click();await wait(async({destination,objectId})=>(await window.pteron.call('state')).project.screens.find((screen:{id:string})=>screen.id===destination).links[objectId],{destination,objectId:id('B')});
 await page.screenshot({path:resolve(work,'desktop.png')});await page.setViewportSize({width:800,height:560});await page.screenshot({path:resolve(work,'compact.png')});assert.deepEqual(errors,[]);
 await writeFile(resolve(work,'ui-report.json'),JSON.stringify({passed:true,checks:['snap edges and centers','Alt bypass without clones','Shift square and paint memory','exact unsupported-object navigation','text outlines and real export','square icon-only Export','selected range loop without history mutations','playback follows the playhead at timeline zoom','read-only continuity preview and apply','desktop and 800x560'],errors},null,2));
 console.log('Shape usability UI acceptance passed');
}finally{await app.close();}
