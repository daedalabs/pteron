import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function renderVideo(directory:string,name:string,expectedFrames?:number){
 const dir=resolve(directory);
 const totalFrames=expectedFrames??JSON.parse(await readFile(resolve(dir,'storyboard.json'),'utf8')).totalFrames;
 const app=await electron.launch({args:['.',resolve(dir,`${name}.pteron`),`--user-data-dir=${dir}/profile`],timeout:30000});
 try{
  const page=await app.firstWindow();
  await page.waitForFunction(()=>!!window.pteron);
  await page.locator('.canvas-tools').waitFor();
  const project=(await page.evaluate(()=>window.pteron.call('state'))).project;
  assert.equal(project.screens.reduce((sum:number,scene:{duration:number})=>sum+scene.duration,0),totalFrames);
  const output=resolve(dir,`${name}.mp4`);
  await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},output);
  const job=await page.evaluate(()=>window.pteron.call('render',{}));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1500,1000));
  for(let index=0;index<project.screens.length;index++){
   await page.locator('.screen-card').nth(index).click();
   await page.screenshot({path:resolve(dir,`editor-${index+1}.png`)});
  }
  let last=-1;
  const deadline=Date.now()+1200000;
  while(Date.now()<deadline){
   const jobs=await page.evaluate(()=>window.pteron.call('jobs'));
   const current=jobs.find((candidate:{id:string})=>candidate.id===job.id);
   assert.ok(current,`Export job ${job.id} disappeared`);
   const percentage=Math.floor(current.progress*100);
   if(percentage!==last){console.log(`Export ${percentage}% (${current.status})`);last=percentage;}
   if(current.status!=='running'){
    assert.equal(current.status,'completed',JSON.stringify(current));
    await writeFile(resolve(dir,'export-job.json'),JSON.stringify(current,null,2));
    console.log(output);
    return;
   }
   await page.waitForTimeout(1000);
  }
  await page.evaluate(id=>window.pteron.call('job.cancel',{id}),job.id);
  throw new Error(`Export ${job.id} timed out after 20 minutes`);
 }finally{await app.close();}
}
