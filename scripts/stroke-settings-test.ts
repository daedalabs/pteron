import {_electron as electron,chromium} from 'playwright';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initializeGeometry} from '../src/core/vector-kit';
import {importSvg,editSvg,svgObjects} from '../src/core/svg';

const work=resolve('artifacts/stroke-settings');await mkdir(work,{recursive:true});
const app=await electron.launch({args:['.',`--user-data-dir=${work}/profile-${Date.now()}`]});
const samples:string[]=[];
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.locator('.canvas-tools').waitFor();
 const state=()=>page.evaluate(()=>window.pteron.call('state'));
 const command=async(command:unknown)=>{const s=await state();return page.evaluate(({command,revision})=>window.pteron.call('command',{command,revision}),{command,revision:s.project.revision});};
 const initial=await state(),screenId=initial.project.screens[0].id;
 await command({type:'project.settings',width:400,height:300,fps:30});
 await command({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect data-name="Border sample" x="50" y="50" width="80" height="80" fill="#22aa66" fill-opacity="0.35" stroke="#ff0000" stroke-width="10"/></svg>'});
 const objects=()=>page.evaluate(screenId=>window.pteron.call('objects',{screenId}),screenId),id=(await objects())[0].id;
 const attrs=async()=>(await objects()).find((o:any)=>o.id===id).attributes;
 const waitAttr=async(key:string,value:string)=>page.waitForFunction(async({screenId,id,key,value})=>(await window.pteron.call('objects',{screenId})).find((o:any)=>o.id===id)?.attributes[key]===value,{screenId,id,key,value});
 await page.locator('.layers').getByRole('button',{name:'Border sample',exact:true}).click();
 await page.getByRole('button',{name:'Stroke settings',exact:true}).click();
 const settings=page.getByLabel('Stroke settings',{exact:true}).filter({has:page.locator('.stroke-settings')});
 await settings.getByRole('button',{name:'No stroke edges',exact:true}).click();await waitAttr('data-stroke-edges','');
 await settings.getByRole('button',{name:'Top stroke edge',exact:true}).click();await waitAttr('data-stroke-edges','top');
 await settings.getByRole('button',{name:'Stroke alignment outside',exact:true}).click();await waitAttr('data-stroke-alignment','outside');
 await page.screenshot({path:`${work}/stroke-controls.png`});samples.push((await state()).project.screens[0].svg);
 await settings.getByRole('button',{name:'All stroke edges',exact:true}).click();await waitAttr('data-stroke-edges','top,right,bottom,left');
 for(const alignment of ['inside','center','outside']){await settings.getByRole('button',{name:`Stroke alignment ${alignment}`,exact:true}).click();await waitAttr('data-stroke-alignment',alignment);samples.push((await state()).project.screens[0].svg);}
 await page.keyboard.press('Escape');
 for(const paint of ['Fill','Stroke']){
  await page.getByRole('button',{name:`${paint} color`,exact:true}).click();
  const toggle=page.getByRole('switch',{name:`${paint} enabled`,exact:true}),before=await attrs(),key=paint.toLowerCase();
  await toggle.click();await waitAttr(key,'none');await page.locator(`[role="switch"][aria-label="${paint} enabled"][aria-checked="false"]`).waitFor();assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await page.screenshot({path:`${work}/${key}-disabled.png`});
  await toggle.click();await waitAttr(key,before[key]);assert.equal((await attrs())[`${key}-opacity`],before[`${key}-opacity`]);
  await page.keyboard.press('Escape');
 }
 await page.getByRole('button',{name:'Stroke settings',exact:true}).click();await settings.getByRole('button',{name:'Stroke alignment center',exact:true}).click();await waitAttr('data-stroke-alignment','center');await page.keyboard.press('Escape');
 await page.locator('.transform-disclosure>summary').click();for(const [key,value] of [['scaleX','2'],['scaleY','.5']]){const input=page.getByRole('spinbutton',{name:`Transform ${key}`,exact:true});await input.fill(value);await input.press('Tab');await page.waitForFunction(async({screenId,id,value,key})=>{const a=(await window.pteron.call('objects',{screenId})).find((o:any)=>o.id===id).attributes;const el=document.createElementNS('http://www.w3.org/2000/svg','g');el.setAttribute('transform',a.transform);const m=el.transform.baseVal.consolidate()?.matrix;return key==='scaleX'?m?.a===Number(value):m?.d===Number(value);},{screenId,id,key,value});}
 assert.equal((await attrs())['stroke-width'],'10');samples.push((await state()).project.screens[0].svg);
 // Complete a real canvas resize; metadata and border width must survive SVG-Edit's group baking.
 const frame=page.frameLocator('iframe');await frame.locator(`[id="${id}"] [data-shape-part="fill"]`).click();const grip=frame.locator('#selectorGrip_resize_se');await grip.waitFor({state:'visible'});const box=await grip.boundingBox();assert.ok(box);

 const before=(await state()).project.revision,beforeResize=(await state()).project.screens[0].svg,beforeTransform=(await attrs()).transform;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+20,{steps:6});await page.mouse.up();
 let resizedAttributes=await attrs();for(let i=0;i<100;i++){resizedAttributes=await attrs();if(typeof resizedAttributes.transform==='string'&&resizedAttributes.transform!==beforeTransform)break;await page.waitForTimeout(50);}
 assert.notEqual(resizedAttributes.transform,beforeTransform,'Resize must change the shape transform');
 assert.equal((await attrs())['stroke-width'],'10');assert.equal((await objects()).length,1);
 await page.waitForFunction(async id=>{const state=await window.pteron.call('state'),source=new DOMParser().parseFromString(state.project.screens[0].svg,'image/svg+xml').getElementById(id),live=document.querySelector('iframe')?.contentDocument?.getElementById(id);return source?.getAttribute('transform')===live?.getAttribute('transform')&&source?.querySelector('[data-shape-part="stroke-0"]')?.getAttribute('d')===live?.querySelector('[data-shape-part="stroke-0"]')?.getAttribute('d');},id);
 const measure=(group:SVGGraphicsElement)=>{
  const root=group.ownerSVGElement!;
  const boxes=['fill','stroke-0'].map(part=>{const el=group.querySelector(`[data-shape-part="${part}"]`) as SVGGraphicsElement,b=el.getBBox(),m=root.getScreenCTM()!.inverse().multiply(el.getScreenCTM()!),points=[new DOMPoint(b.x,b.y).matrixTransform(m),new DOMPoint(b.x+b.width,b.y+b.height).matrixTransform(m)];return [points[0].x,points[0].y,points[1].x,points[1].y];});
  const [a,b]=boxes;return [a[0]-b[0],a[1]-b[1],b[2]-a[2],b[3]-a[3]];
 };
 let margins:number[]=[];for(let n=0;n<40;n++){margins=await frame.locator(`[id="${id}"]`).evaluate(measure);if(margins.every(value=>Math.abs(value-5)<=.1))break;await page.waitForTimeout(50);}
 assert.ok(margins.every(value=>Math.abs(value-5)<=.1),`A 10px centered stroke must extend 5px at each side after resize: ${margins}`);
 samples.push((await state()).project.screens[0].svg);await page.screenshot({path:`${work}/resized-border.png`});
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(async revision=>(await window.pteron.call('state')).project.revision>revision,before+1);
 await page.waitForFunction(async svg=>(await window.pteron.call('state')).project.screens[0].svg===svg,beforeResize);
 assert.equal((await attrs())['stroke-width'],'10');
 await page.reload();await page.locator('.canvas-tools').waitFor();assert.equal((await attrs())['data-stroke-alignment'],'center');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));await page.setViewportSize({width:800,height:560});
 await page.locator('.layers').getByRole('button',{name:'Border sample',exact:true}).click();await page.getByRole('button',{name:'Stroke settings',exact:true}).click();
 const compact=await settings.boundingBox();assert.ok(compact);assert.ok(compact.y>=0&&compact.y+compact.height<=await page.evaluate(()=>innerHeight),'Stroke controls must fit the compact window');
 await page.screenshot({path:`${work}/compact-controls.png`});
 assert.deepEqual(errors,[]);
}finally{await app.close();}
await initializeGeometry();
for(const [shape,attributes] of [
 ['<rect x="50" y="50" width="140" height="90"/>',{'data-corners':'8,16,24,32','data-stroke-alignment':'outside'}],
 ['<ellipse cx="130" cy="100" rx="70" ry="35" transform="rotate(15 130 100)"/>',{'data-stroke-alignment':'inside'}],
 ['<path d="M40 40H200V160H40ZM80 80V120H160V80Z" fill-rule="evenodd"/>',{'data-stroke-alignment':'outside','stroke-dasharray':'4 2 8 4','stroke-linecap':'round'}],
] as [string,Record<string,string>][]){
 let svg=importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">${shape.replace('/>',' fill="#22aa66" fill-opacity="0.35" stroke="#ff0000" stroke-width="10"/>')}</svg>`);
 svg=editSvg(svg,svgObjects(svg)[0].id,{...attributes,'data-stroke-scaling':'fixed'});samples.push(svg);
}
const browser=await chromium.launch({headless:true,args:['--allow-file-access-from-files'],...(process.env.PTERON_BROWSER?{executablePath:process.env.PTERON_BROWSER}:{})});
try{
 const page=await browser.newPage({viewport:{width:400,height:300},deviceScaleFactor:1});
 await page.goto(new URL(`file:///${resolve('dist/ui/geometry.html').replaceAll('\\','/')}`).href);await page.waitForFunction(()=>Boolean(window.sampleSvg));await page.addStyleTag({content:'html,body{margin:0;background:white}'});
 for(const [index,svg] of samples.entries()){
  await page.evaluate(svg=>window.sampleSvg(svg,{}),svg);await writeFile(`${work}/frame-${index}.svg`,svg);await page.screenshot({path:`${work}/browser-${index}.png`});
 }
 await writeFile(`${work}/request.json`,JSON.stringify({operation:'render',work,width:400,height:300,fps:30,frames:samples.map((_,i)=>`frame-${i}.svg`)}));
}finally{await browser.close();}
console.log('Stroke sides/alignment, paint enable toggles, canvas resize, history and reload passed');
