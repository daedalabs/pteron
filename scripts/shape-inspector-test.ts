import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const packaged=process.argv.includes('--packaged');
const app=await electron.launch({...(packaged?{executablePath:resolve('artifacts/standalone/win-unpacked/pteron.exe')}:{}),args:[...(packaged?[]:['.']),`--user-data-dir=${resolve('artifacts/shape-profile-'+Date.now())}`]});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(20000);
 const state=()=>page.evaluate(()=>window.pteron.call('state'));
 await page.getByRole('toolbar',{name:'Canvas tools'}).waitFor();
 await page.getByRole('button',{name:'LaTeX equation',exact:true}).click();
 await page.getByLabel('LaTeX source',{exact:true}).waitFor();
 let s=await state();const screenId=s.project.screens[0].id,eq=s.project.screens[0].equations[0];assert.ok(eq.svg&&eq.compiledSource===eq.source);
 const objects=()=>page.evaluate(screenId=>window.pteron.call('objects',{screenId}),screenId);
 const object=(await objects()).find((o:any)=>o.equationId===eq.id);assert.ok(object);
 await page.getByRole('button',{name:'Fill color',exact:true}).click();await page.getByLabel('Shape fill',{exact:true}).fill('#ff3366');await page.getByLabel('Shape fill',{exact:true}).press('Tab');
 await page.waitForFunction(async({screenId,id})=>(await window.pteron.call('objects',{screenId})).find((o:any)=>o.id===id)?.attributes.fill==='#ff3366',{screenId,id:object.id});
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Motion',exact:true}).click();await page.getByRole('button',{name:'Press',exact:true}).click();await page.getByRole('region',{name:'Transition settings'}).waitFor();
 const bottom=await page.locator('.clip-settings').boundingBox();const views=page.getByRole('group',{name:'Motion view'});if(await views.count()){assert.ok(bottom);}else{const top=await page.locator('.motion-library').boundingBox();assert.ok(top&&bottom&&top.y+top.height<=bottom.y);}await page.getByRole('button',{name:'Properties',exact:true}).click();
 if(!packaged){
  await page.getByLabel('LaTeX source',{exact:true}).fill('x+1=2');await page.getByRole('button',{name:'Compile',exact:true}).click();
  for(let i=0;i<240;i++){const jobs=await page.evaluate(()=>window.pteron.call('jobs'));if(jobs.some((j:any)=>j.status==='completed'))break;if(jobs.some((j:any)=>j.status==='failed'))throw new Error(JSON.stringify(jobs));await page.waitForTimeout(500);}
  s=await state();assert.equal(s.project.screens[0].equations[0].compiledSource,'x+1=2');assert.ok((await objects()).some((o:any)=>o.id===object.id));assert.equal(s.project.screens[0].clips[0].objectId,object.id);
  const valid=s.project.screens[0].svg;
  await page.getByLabel('LaTeX source',{exact:true}).fill('\\input{forbidden}');await page.getByRole('button',{name:'Compile',exact:true}).click();
  for(let i=0;i<240;i++){const jobs=await page.evaluate(()=>window.pteron.call('jobs'));if(jobs.some((j:any)=>j.status==='failed'))break;await page.waitForTimeout(500);}
  s=await state();assert.equal(s.project.screens[0].svg,valid);assert.equal(s.project.screens[0].equations[0].compiledSource,'x+1=2');
 }
 console.log('Shape inspector and source-linked equation acceptance passed', {packaged});
}finally{await app.close();}


