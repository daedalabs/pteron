import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, access, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pythonRuntime } from '../electron/python-runtime.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const checks=[];
const check=(name,passed,details={})=>checks.push({name,passed,...details});
await mkdir('artifacts',{recursive:true});
// Bundle the exact probe locally: no dev server/HMR or loopback network is
// needed to exercise the browser's SVG engine. Geometry thresholds stay intact.
await mkdir('artifacts/feasibility-browser',{recursive:true});
const html=await readFile('tests/feasibility/index.html','utf8');
const entry=html.match(/<script type="module">([\s\S]*?)<\/script>/);
if(!entry)throw new Error('Feasibility browser entry is missing');
await build({stdin:{contents:entry[1].replace("'/src/editor/svg-adapter.js'","'../../src/editor/svg-adapter.js'"),resolveDir:resolve('tests/feasibility'),sourcefile:'probe.js'},bundle:true,format:'esm',platform:'browser',outfile:'artifacts/feasibility-browser/gate.js'});
await writeFile('artifacts/feasibility-browser/index.html',html.replace(entry[0],'<script type="module" src="./gate.js"></script>'));
let browser;
try {
 let executablePath;
 for (const candidate of [process.env.PTERON_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean)) {
  try {await access(candidate);executablePath=candidate;break;} catch {}
 }
 browser=await chromium.launch({headless:true,args:['--allow-file-access-from-files'],...(executablePath?{executablePath}:{})});
 const page=await browser.newPage({viewport:{width:320,height:480},deviceScaleFactor:1});
 await page.goto(pathToFileURL(resolve('artifacts/feasibility-browser/index.html')).href);
 await page.waitForFunction(()=>window.gateReady || window.gateError);
 const error=await page.evaluate(()=>window.gateError);
 if(error) throw new Error(error);
 const fixture=await readFile('tests/fixtures/nested.svg','utf8');
 const state=await page.evaluate(xml=>{
  const loaded=!!window.adapter.loadProjectSvg(window.canvas,xml,{fresh:true});
  const root=window.canvas.getSvgContent();
  const rect=root.querySelector('rect');
  if (!loaded || !rect) throw new Error('Nested SVG failed to load');
  const id=rect.id;
  window.canvas.selectOnly([rect]);
  window.canvas.changeSelectedAttribute('fill','#00ff00');
  const edited=window.adapter.saveProjectSvg(window.canvas);
  window.adapter.loadProjectSvg(window.canvas,edited);
  const reopened=window.canvas.getSvgContent();
  return {loaded, editedFill:reopened.querySelector('rect')?.getAttribute('fill'), originalId:id,reopenedId:reopened.querySelector('rect')?.id,nested:!!reopened.querySelector('svg'),svg:window.adapter.saveProjectSvg(window.canvas)};
 },fixture);
 check('editable-nested-child',state.editedFill==='#00ff00',state);
 check('save-reopen-id-stability',state.originalId===state.reopenedId,{before:state.originalId,after:state.reopenedId});
 await writeFile('artifacts/editor-roundtrip.svg',state.svg);
 const identityChecks=await page.evaluate(()=>{
  const source='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><svg width="100" height="100" overflow="visible"><g id="art"><rect id="tile" width="20" height="20" fill="url(#paint)"/></g></svg><use href="#art" x="50"/></svg>';
  let originalIds;
  let references=true;
  let identity=true;
  let overflow=true;
  let saved=source;
  for(let pass=0;pass<4;pass++) {
   window.adapter.loadProjectSvg(window.canvas,saved,{fresh:pass===0});
   const root=window.canvas.getSvgContent();
   const rect=root.querySelector('rect');
   const gradient=root.querySelector('linearGradient');
   const use=root.querySelector('use');
   const ids=[rect.id,gradient.id];
   originalIds??=ids;
   identity&&=ids.every((id,i)=>id===originalIds[i]);
   references&&=rect.getAttribute('fill')===`url(#${gradient.id})`&&!!root.querySelector(`[id="${use.getAttribute('href')?.slice(1)||use.getAttribute('xlink:href')?.slice(1)}"]`);
   overflow&&=root.querySelector('svg')?.getAttribute('overflow')==='visible';
   saved=window.adapter.saveProjectSvg(window.canvas);
  }
  const first=window.adapter.prepareSvg(source,{fresh:true});
  const second=window.adapter.prepareSvg(first,{fresh:true});
  const parse=s=>new DOMParser().parseFromString(s,'image/svg+xml');
  const firstIds=new Set([...parse(first).querySelectorAll('[id]')].map(e=>e.id));
  const uniqueImports=[...parse(second).querySelectorAll('[id]')].every(e=>!firstIds.has(e.id));
  let invalidRejected=false;
  try {window.adapter.prepareSvg('<svg>');} catch {invalidRejected=true;}
  return {identity,references,overflow,uniqueImports,invalidRejected};
 });
 for(const [name,passed] of Object.entries(identityChecks)) check(`identity-adapter-${name}`,passed);
 const clipped=await readFile('tests/fixtures/nested-clipped.svg','utf8');
 // Native SVG reference isolates renderer fidelity from editor mutations.
 await page.setContent(`<body style="margin:0;background:black">${clipped}</body>`);
 await page.screenshot({path:'artifacts/browser-clipping.png'});
 const native=await page.evaluate(()=>{
  const rect=document.querySelector('rect');const box=rect.getBoundingClientRect();
  const nested=document.querySelector('svg svg');
  // SVG getBoundingClientRect reports artwork bounds, not the clip viewport.
  const viewport={x:nested.x.baseVal.value,y:nested.y.baseVal.value};
  viewport.right=viewport.x+nested.width.baseVal.value;
  viewport.bottom=viewport.y+nested.height.baseVal.value;
  return {x:Math.max(box.x,viewport.x),y:Math.max(box.y,viewport.y),width:Math.min(box.right,viewport.right)-Math.max(box.x,viewport.x),height:Math.min(box.bottom,viewport.bottom)-Math.max(box.y,viewport.y)};
 });
 check('native-nested-clipping-reference',native.x===220&&native.y===160&&native.width===20&&native.height===20,native);
} catch(error) {check('browser-gate',false,{error:error.stack});}
finally {await browser?.close();}
await rm('artifacts/renderer-gate.json',{force:true});
const runtime=pythonRuntime(resolve('.'));
const py=spawnSync(runtime.executable,['scripts/probe_renderer.py'],{cwd:runtime.cwd,env:{...process.env,...runtime.env},encoding:'utf8',windowsHide:true});
let renderer;
try {renderer=JSON.parse(await readFile('artifacts/renderer-gate.json','utf8'));}
catch {renderer={checks:[{name:'renderer-probe',passed:false,error:py.stderr||py.error?.message}]};}
const report={timestamp:new Date().toISOString(),status:[...checks,...renderer.checks].every(c=>c.passed)?'passed':'blocked',browser:checks,renderer};
await writeFile('artifacts/feasibility-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exitCode=report.status==='passed'?0:1;
