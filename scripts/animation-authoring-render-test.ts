import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {ProjectStore} from '../src/core/store';
import {newProject,type Clip,type Screen} from '../src/core/model';
import {svgObjects} from '../src/core/svg';
import {evaluate} from '../src/core/motion';
import {initializeGeometry} from '../src/core/selection';
import {workerRuntime} from '../electron/runtime';
await initializeGeometry();
const work=resolve('artifacts/animation-authoring-render');await mkdir(work,{recursive:true});
const python=workerRuntime(resolve('.'),work,false);
const pythonOptions={encoding:'utf8' as const,windowsHide:true,env:{...process.env,...python.env}};
const fixtures:{name:string,screen:Screen,frames:number[]}[]=[];
function fixture(name:string,body:string,preset?:Clip['preset'],options:Partial<Clip>={},frames=[0,3,5,8,10]){
 const store=new ProjectStore(newProject(name,320,240)),screenId=store.snapshot.screens[0].id;
 const command=(command:unknown)=>store.dispatch(command,store.snapshot.revision);
 command({type:'artwork.import',screenId,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">${body}</svg>`});
 const objects=svgObjects(store.snapshot.screens[0].svg),objectId=objects.find(object=>object.name==='Source')?.id??objects[0]?.id??'',targetObjectId=objects.find(object=>object.name==='Target')?.id;
 if(preset)command({type:'clip.put',screenId,clip:{id:'clip',objectId,preset,start:0,duration:11,easing:'linear',...(targetObjectId?{targetObjectId}:{}),...options}});
 fixtures.push({name,screen:store.snapshot.screens[0],frames});return {store,screenId,command,objectId,targetObjectId};
}
fixture('overlapping isolated group','<g opacity=".45"><rect x="30" y="30" width="100" height="80" fill="#ff00ff"/><g opacity=".6"><rect x="70" y="60" width="120" height="90" fill="#00ffff" fill-opacity=".7"/><circle cx="130" cy="100" r="45" fill="#ff8800"/></g></g>',undefined,{},[0]);
fixture('shape fill stroke opacity','<rect x="50" y="50" width="100" height="80" rx="15" fill="#ff00ff" stroke="#0033ff" stroke-width="20" opacity=".4"/>',undefined,{},[0]);
fixture('styled opacity fade','<rect x="50" y="50" width="100" height="80" style="fill:#ff00ff;stroke:#0033ff;stroke-width:8;opacity:.6"/>','Fade');
fixture('styled paint highlight','<rect x="50" y="50" width="100" height="80" style="fill:#ff00ff;stroke:#0033ff;stroke-width:8"/>','Color highlight');
fixture('write curved stroke','<path d="M30 170 C70 10 160 210 270 40" fill="none" stroke="#ff00ff" stroke-width="8"/>','Write on');
fixture('clipped round dashed curve','<svg x="20" y="30" width="90" height="100"><path d="M8 86C21 15 47 8 58 46S79 104 105 19" fill="none" stroke="#7561a0" stroke-width="7" stroke-linecap="round" stroke-dasharray="10 5"/></svg>',undefined,{},[0]);
fixture('write filled artwork','<rect x="60" y="60" width="120" height="80" rx="12" fill="#ff00ff"/>','Write on');
fixture('erase group','<g data-name="Source"><rect x="40" y="50" width="80" height="80" fill="#ff00ff"/><circle cx="170" cy="110" r="40" fill="#00bbbb"/></g>','Erase');
fixture('stagger reveal','<g data-name="Source"><rect x="30" y="60" width="40" height="50" fill="#ff00ff"/><rect x="100" y="60" width="40" height="50" fill="#ff00ff"/><rect x="170" y="60" width="40" height="50" fill="#ff00ff"/></g>','Stagger',{duration:18,stagger:4},[0,3,5,9,13,17]);
fixture('nested viewport smooth match','<svg x="20" y="10" width="140" height="140" viewBox="0 0 280 280" overflow="visible"><rect data-name="Source" x="30" y="40" width="40" height="40" fill="#ff00ff"/></svg><rect data-name="Target" x="200" y="120" width="50" height="60" fill="#00bbbb"/>','Smooth match');
fixture('crossfade replacement','<rect data-name="Source" x="50" y="50" width="100" height="100" fill="#ff00ff"/><circle data-name="Target" cx="130" cy="110" r="60" fill="#00bbbb"/>','Crossfade replacement');
fixture('custom curve and pivot','<svg x="20" y="10" width="280" height="200" viewBox="0 0 280 200"><rect x="60" y="60" width="35" height="25" fill="#ff00ff"/></svg>','Rotate',{intensity:.25,from:{x:0,y:0},to:{x:70,y:30},control:{x:50,y:-40},pivot:{x:50,y:50}});
const equations=fixture('equation term correspondence','',undefined,{},[]);
for(const [index,id] of ['one','two'].entries())equations.command({type:'equation.commit',screenId:equations.screenId,equation:{id,source:index?'x+1':'x',terms:{},svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 10"><path fill="#ff00ff" d="M0 0H10V10H0Z"/><path fill="#00bbbb" d="M20 0H30V10H20Z"/></svg>'}});
let screen=equations.store.snapshot.screens[0],objects=svgObjects(screen.svg),roots=['one','two'].map(id=>objects.find(object=>object.equationId===id)!);
equations.command({type:'object.edit',screenId:equations.screenId,objectId:roots[1].id,attributes:{transform:'translate(50 70)'}});
for(const root of roots){const paths=objects.filter(object=>object.parentId===root.id&&object.type==='path');equations.command({type:'equation.terms',screenId:equations.screenId,equationId:root.equationId,terms:{x:paths[0].id,other:paths[1].id}});}
equations.command({type:'clip.put',screenId:equations.screenId,clip:{id:'terms',objectId:roots[0].id,targetObjectId:roots[1].id,preset:'Match terms',terms:['x'],start:0,duration:11,easing:'linear'}});
fixtures[fixtures.length-1]={name:'equation term correspondence',screen:equations.store.snapshot.screens[0],frames:[0,3,5,8,10]};
equations.command({type:'clip.put',screenId:equations.screenId,clip:{id:'terms',objectId:roots[0].id,preset:'Highlight terms',terms:['x'],start:0,duration:11,easing:'linear'}});
fixtures.push({name:'selected term highlight',screen:equations.store.snapshot.screens[0],frames:[0,3,5,8,10]});
const executablePath=[process.env.PTERON_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(path=>path&&existsSync(path));
const browser=await chromium.launch({headless:true,args:['--allow-file-access-from-files'],...(executablePath?{executablePath}:{})});
const frames:string[]=[],samples:{name:string,frame:number}[]=[];
try{
 const page=await browser.newPage({viewport:{width:320,height:240},deviceScaleFactor:1});await page.goto(pathToFileURL(resolve('dist/ui/geometry.html')).href);await page.waitForFunction(()=>Boolean(window.sampleSvg));await page.addStyleTag({content:'html,body{margin:0;background:white}'});
 for(const fixture of fixtures)for(const frame of fixture.frames){const index=frames.length,name=`frame-${index}.svg`,svg=await page.evaluate(({source,poses})=>window.sampleSvg(source,poses),{source:fixture.screen.svg,poses:evaluate(fixture.screen,frame)});await writeFile(resolve(work,name),svg);await page.screenshot({path:resolve(work,`reference-${index}.png`)});frames.push(name);samples.push({name:fixture.name,frame});}
}finally{await browser.close();}
await writeFile(resolve(work,'samples.json'),JSON.stringify(samples));await writeFile(resolve(work,'request.json'),JSON.stringify({operation:'render',work,width:320,height:240,fps:30,frames}));
const render=spawnSync(python.executable,['renderer/worker.py',resolve(work,'request.json')],{...pythonOptions,maxBuffer:10000000});if(render.error)throw render.error;assert.equal(render.status,0,render.stdout+'\n'+render.stderr);
const result=JSON.parse(render.stdout.split('PTERON:').at(-1)!).result;
// Measure geometry independently of low-alpha colors and H.264 chroma fringes.
// The matte render uses the normalizer's actual disjoint vector regions.
const matteWork=resolve(work,'matte');await mkdir(matteWork,{recursive:true});
const matteBrowser=await chromium.launch({headless:true,args:['--allow-file-access-from-files'],...(executablePath?{executablePath}:{})});
try{
 const page=await matteBrowser.newPage({viewport:{width:320,height:240},deviceScaleFactor:1});await page.goto(pathToFileURL(resolve('dist/ui/geometry.html')).href);await page.waitForFunction(()=>Boolean(window.sampleSvg));await page.addStyleTag({content:'html,body{margin:0;background:white}'});
 const {readFile}=await import('node:fs/promises');
 for(let index=0;index<frames.length;index++){
  for(const derived of [false,true]){
   const source=await readFile(resolve(work,derived?`vector-${index}.svg`:frames[index]),'utf8');
   const matte=await page.evaluate(source=>{
    window.sampleSvg(source,{});const root=document.querySelector('svg')!;
    const paints=Array.from(root.querySelectorAll<SVGElement>('*')).map(element=>({element,style:getComputedStyle(element),fill:getComputedStyle(element).fill,stroke:getComputedStyle(element).stroke,fillOpacity:Number(getComputedStyle(element).fillOpacity),strokeOpacity:Number(getComputedStyle(element).strokeOpacity)}));
    for(const element of [root,...Array.from(root.querySelectorAll<SVGElement>('*'))]){if(Number(getComputedStyle(element).opacity)===0)element.setAttribute('display','none');element.setAttribute('opacity','1');element.style.opacity='1';}
    for(const {element,fill,stroke,fillOpacity,strokeOpacity} of paints)if(element.matches('path,rect,circle,ellipse,line,polygon,polyline')){for(const [name,value] of [['fill',fill!=='none'&&fillOpacity>0?'#000000':'none'],['stroke',stroke!=='none'&&strokeOpacity>0?'#000000':'none'],['fill-opacity','1'],['stroke-opacity','1']]){element.setAttribute(name,value);element.style.setProperty(name,value);}}
    return new XMLSerializer().serializeToString(root);
   },source);
   if(derived)await writeFile(resolve(matteWork,frames[index]),matte);else await page.screenshot({path:resolve(work,`geometry-reference-${index}.png`)});
  }
 }
}finally{await matteBrowser.close();}
await writeFile(resolve(matteWork,'request.json'),JSON.stringify({operation:'render',work:matteWork,width:320,height:240,fps:30,frames}));
const matteRender=spawnSync(python.executable,['renderer/worker.py',resolve(matteWork,'request.json')],{...pythonOptions,maxBuffer:10000000});if(matteRender.error)throw matteRender.error;assert.equal(matteRender.status,0,matteRender.stdout+'\n'+matteRender.stderr);
const matteResult=JSON.parse(matteRender.stdout.split('PTERON:').at(-1)!).result;
const check=spawnSync(python.executable,['scripts/check_animation_authoring.py',work,result.path,matteResult.path],pythonOptions);console.log(check.stdout);if(check.error)throw check.error;assert.equal(check.status,0,check.stderr||check.stdout);
