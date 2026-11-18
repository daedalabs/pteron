import {_electron as electron} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';

const work=resolve('artifacts/cache-startup',String(Date.now()));await mkdir(work,{recursive:true});
const profile=join(work,'profile'),log=join(work,'chromium.log');
for(const name of ['Cache','GPUCache','DawnGraphiteCache','GrShaderCache']){await mkdir(join(profile,name),{recursive:true});await writeFile(join(profile,name,'index'),'locked cache fixture');}
const script=`$handles=@(); foreach($name in @('Cache','GPUCache','DawnGraphiteCache','GrShaderCache')){$handles+= [IO.File]::Open((Join-Path $env:PTERON_CACHE_TEST_PROFILE ($name+'/index')),'Open','ReadWrite','None')}; Write-Output 'READY'; [Console]::ReadLine() | Out-Null; foreach($handle in $handles){$handle.Dispose()}`;
const holder=spawn('powershell',['-NoProfile','-Command',script],{env:{...process.env,PTERON_CACHE_TEST_PROFILE:profile},windowsHide:true,stdio:['pipe','pipe','inherit']});
await new Promise<void>((done,reject)=>{holder.stdout.on('data',data=>{if(String(data).includes('READY'))done();});holder.on('error',reject);holder.on('exit',code=>reject(new Error(`Cache lock holder exited: ${code}`)));});
let app:Awaited<ReturnType<typeof electron.launch>>|undefined;
try{
 app=await electron.launch({args:['.',`--user-data-dir=${profile}`,'--enable-logging=file',`--log-file=${log}`]});
 const page=await app.firstWindow();await page.getByRole('button',{name:'Export MP4',exact:true}).waitFor();
 for(const [width,height] of [[1440,960],[800,560]]){await page.setViewportSize({width,height});const button=page.getByRole('button',{name:'Export MP4',exact:true});const box=(await button.boundingBox())!,header=(await page.locator('.application-header').boundingBox())!;assert.ok(Math.abs(box.width-28)<.01&&Math.abs(box.height-28)<.01);assert.ok(box.y-header.y>=5&&header.y+header.height-box.y-box.height>=5);assert.ok(await button.locator('.lucide-share').count());await page.screenshot({path:join(work,`${width}.png`)});}
 await app.close();app=undefined;
 const logs=await readFile(log,'utf8');await writeFile(join(work,'report.json'),JSON.stringify({passed:!/(Unable to move the cache|Unable to create cache|Gpu Cache Creation failed)/.test(logs)},null,2));
 assert.doesNotMatch(logs,/(Unable to move the cache|Unable to create cache|Gpu Cache Creation failed)/);
 console.log('Locked-cache startup and square Export spacing passed');
}finally{if(app)await app.close();holder.stdin.end('done\n');}
