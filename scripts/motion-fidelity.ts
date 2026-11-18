import {chromium} from 'playwright';
import {mkdir,writeFile,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {clipSchema,type Screen,newScreen} from '../src/core/model';
import {evaluate} from '../src/core/motion';
const work=resolve('artifacts/motion-fidelity');await mkdir(work,{recursive:true});
let browser;
try{
 let executablePath;for(const path of [process.env.PTERON_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean) as string[]){try{await access(path);executablePath=path;break;}catch{}}
 browser=await chromium.launch({headless:true,args:['--allow-file-access-from-files'],...(executablePath?{executablePath}:{})});
 const page=await browser.newPage({viewport:{width:320,height:480},deviceScaleFactor:1});page.setDefaultTimeout(15000);page.on('pageerror',e=>console.error(e));await page.goto(pathToFileURL(resolve('dist/ui/geometry.html')).href);await page.waitForFunction(()=>Boolean(window.sampleSvg),undefined,{timeout:15000});
 const screen:Screen={...newScreen(320,480),duration:18,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><g id="component"><rect x="80" y="130" width="100" height="80" fill="#ff00ff"/></g></svg>'};screen.clips=[clipSchema.parse({id:'clip',objectId:'component',preset:'Press',start:0,duration:18,intensity:1})];const frames:string[]=[];
 for(let frame=0;frame<screen.duration;frame++){
  const svg=await page.evaluate(({svg,poses})=>window.sampleSvg(svg,poses),{svg:screen.svg,poses:evaluate(screen,frame)});const name=`frame-${frame}.svg`;frames.push(name);await writeFile(`${work}/${name}`,svg);await page.addStyleTag({content:'html,body{margin:0;background:white}'});await page.screenshot({path:`${work}/browser-${frame}.png`});
 }
 await writeFile(`${work}/request.json`,JSON.stringify({operation:'render',work,width:320,height:480,frames}));
 const result=await new Promise<string>((resolve,reject)=>{const child=spawn('uv',['run','python','renderer/worker.py',`${work}/request.json`],{windowsHide:true});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('close',code=>code?reject(new Error(output)):resolve(output));});
 console.log(result.slice(-500));
 const check=spawn('uv',['run','python','scripts/check_motion_video.py',work],{windowsHide:true,stdio:'inherit'});await new Promise<void>((resolve,reject)=>{check.on('error',reject);check.on('close',code=>code?reject(new Error('Required motion fidelity failed')):resolve());});
 // Groups with overlapping children are valid artwork and must support fades.
 const groupWork=resolve('artifacts/group-fade-fidelity');await mkdir(groupWork,{recursive:true});
 screen.svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><g id="component"><rect x="80" y="130" width="100" height="80" fill="#ff00ff"/><rect x="120" y="160" width="100" height="80" fill="#00ffff"/></g></svg>';
 screen.clips=[clipSchema.parse({id:'clip',objectId:'component',preset:'Fade',start:0,duration:18})];
 const svg=await page.evaluate(({svg,poses})=>window.sampleSvg(svg,poses),{svg:screen.svg,poses:evaluate(screen,9)});await writeFile(`${groupWork}/frame-9.svg`,svg);await page.screenshot({path:`${groupWork}/browser-9.png`});
 await writeFile(`${groupWork}/request.json`,JSON.stringify({operation:'render',work:groupWork,width:320,height:480,frames:['frame-9.svg']}));
 const groupResult=await new Promise<{code:number|null,output:string}>((resolve,reject)=>{const child=spawn('uv',['run','python','renderer/worker.py',`${groupWork}/request.json`],{windowsHide:true});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,output}));});
 await writeFile(`${groupWork}/report.json`,JSON.stringify({passed:groupResult.code===0,check:'overlapping-group-fade-export',...groupResult},null,2));
 if(groupResult.code!==0)throw new Error(`Required group fade fidelity failed: ${groupResult.output}`);
}finally{await browser?.close();}
