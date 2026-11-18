import {_electron as electron} from 'playwright';
import {resolve} from 'node:path';
import {mkdir,writeFile,rename,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {workerRuntime} from '../electron/runtime';

const work=resolve('artifacts/application-menu');await mkdir(work,{recursive:true});
const python=workerRuntime(resolve('.'),work,false);
const pythonOptions={env:{...process.env,...python.env},windowsHide:true};
const app=await electron.launch({args:['.',`--user-data-dir=${work}/profile-${Date.now()}`]});
const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.getByRole('menubar',{name:'Application menu'}).waitFor();
 const state=()=>page.evaluate(()=>window.pteron.call('state'));
 const wait=async(predicate:any,arg?:any,timeout=20000)=>{const start=Date.now();while(!await page.evaluate(predicate,arg)){if(Date.now()-start>timeout)throw new Error('Expected application state did not arrive');await page.waitForTimeout(40);}};
 const command=async(command:unknown)=>{for(let n=0;n<3;n++)try{return await page.evaluate(({command,revision})=>window.pteron.call('command',{command,revision}),{command,revision:(await state()).project.revision});}catch(error){if(n===2||!/Stale revision/.test(String(error)))throw error;}};
 const menu=async(name:string,item:RegExp)=>{await page.getByRole('menubar').getByRole('menuitem',{name,exact:true}).click();await page.getByRole('menuitem',{name:item}).click();};
 const native=async(id:string)=>{const start=Date.now();while(!await app.evaluate(({Menu},id)=>Boolean(Menu.getApplicationMenu()?.getMenuItemById(id)?.enabled),id)){if(Date.now()-start>5000)throw new Error(`Menu action unavailable: ${id}`);await page.waitForTimeout(30);}await app.evaluate(({Menu,BrowserWindow},id)=>{const item=Menu.getApplicationMenu()!.getMenuItemById(id)!;if(!item||!item.enabled)throw new Error(`Menu action unavailable: ${id}`);item.click(item,BrowserWindow.getAllWindows()[0],{} as any);},id);};
 const saveDialog=async(path?:string)=>app.evaluate(({dialog},path)=>{dialog.showSaveDialog=(async()=>path?{canceled:false,filePath:path}:{canceled:true,filePath:undefined}) as typeof dialog.showSaveDialog;},path);
 const closeDialog=async()=>{await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});};
 assert.deepEqual(await page.getByRole('menubar').getByRole('menuitem').allTextContents(),['File','Edit','Scene','View','Playback','Help']);
 assert.deepEqual(await app.evaluate(({Menu})=>Menu.getApplicationMenu()!.items.map(item=>item.label)),['&File','&Edit','&Scene','&View','&Playback','&Help']);
 await command({type:'project.settings',width:320,height:240,fps:30});const first=(await state()).project.screens[0].id;
 await command({type:'artwork.import',screenId:first,svg:'<svg xmlns="http://www.w3.org/2000/svg"><rect data-name="A" x="20" y="30" width="35" height="35" fill="#223344"/><rect data-name="B" x="90" y="30" width="35" height="35" fill="#cc3344"/></svg>'});
 const original=resolve(work,'original.pteron'),copy=resolve(work,'copy.pteron');let history=(await state()).history;
 await saveDialog(original);await menu('File',/^Save As/);await wait(async path=>(await window.pteron.call('state')).path===path,original);await page.getByLabel('Save status').filter({hasText:'Saved'}).waitFor();assert.deepEqual((await state()).history,history);
 const projectTitle=page.getByRole('button',{name:/^Rename project:/});
 const projectName=page.getByRole('textbox',{name:'Project name'});
 const titleBounds=await projectTitle.boundingBox();
 assert.ok(titleBounds);
 const saveStatus=page.getByRole('status',{name:'Save status'});
 const statusBounds=await saveStatus.boundingBox();
 assert.ok(statusBounds&&statusBounds.y>=titleBounds.y+titleBounds.height-1,'The save status sits under the title');
 assert.ok(Math.abs(statusBounds.x+statusBounds.width/2-titleBounds.x-titleBounds.width/2)<1,'The save status is centered under the title');
 assert.equal(await saveStatus.locator('svg').count(),0,'Save status is text only');
 await projectTitle.dblclick();
 assert.deepEqual(await projectName.boundingBox(),titleBounds,'Opening rename preserves the title bounds');
 await projectName.fill('A much longer project title');
 const expanded=await projectName.boundingBox();
 assert.ok(expanded&&expanded.width>titleBounds.width,'Longer titles expand the editor');
 assert.ok(Math.abs(expanded.x+expanded.width/2-titleBounds.x-titleBounds.width/2)<1,'The editor grows around the title center');
 await projectName.fill('A');
 assert.deepEqual(await projectName.boundingBox(),titleBounds,'Shorter drafts keep the starting width');
 await projectName.press('Escape');
 await projectName.waitFor({state:'hidden'});
 assert.equal((await state()).document.dirty,false);
 assert.deepEqual((await state()).history,history);
 await projectTitle.dblclick();
 await projectName.fill('  Menu test copy  ');
 await projectName.press('Enter');
 await page.getByRole('button',{name:'Rename project: Menu test copy'}).waitFor();
 await page.getByLabel('Save status').filter({hasText:'Unsaved changes'}).waitFor();
 assert.deepEqual(await saveStatus.boundingBox(),statusBounds,'Save status text keeps the same space');
 await native('edit.undo');await wait(async()=>(await window.pteron.call('state')).document.dirty===false);await page.keyboard.press('Control+Shift+z');await wait(async()=>(await window.pteron.call('state')).project.name==='Menu test copy');
 await saveDialog(copy);await page.keyboard.press('Control+Shift+p');const search=page.getByRole('combobox',{name:'Search commands'});await search.fill('save as');await search.press('Enter');await wait(async path=>(await window.pteron.call('state')).path===path,copy);
 assert.ok((await stat(original)).size>0);assert.ok((await stat(copy)).size>0);assert.equal((await page.evaluate(()=>window.pteron.call('recent.list'))).projects.length,2);
 await saveDialog();await native('saveAs');await page.waitForTimeout(150);assert.equal((await state()).path,copy);assert.equal((await state()).document.dirty,false);
 const blocked=resolve(work,'blocked.pteron');await mkdir(blocked,{recursive:true});await saveDialog(blocked);await native('saveAs');await page.getByRole('alert').waitFor();assert.equal((await state()).path,copy);await page.getByRole('button',{name:'Dismiss error'}).click();
 // Text undo/select-all and ordinary spaces never invoke project mutations/playback.
 const field=page.getByRole('textbox',{name:'Scene name'});await field.focus();await field.press('End');const revision=(await state()).project.revision,oldName=await field.inputValue();await field.pressSequentially(' Z');await field.press('Control+z');assert.equal(await field.inputValue(),oldName);assert.equal((await state()).project.revision,revision);await field.press('Control+a');assert.equal(await field.evaluate(input=>(input as HTMLInputElement).selectionEnd!-(input as HTMLInputElement).selectionStart!),oldName.length);await page.evaluate(()=>navigator.clipboard.writeText('Pasted through menu'));await native('edit.paste');await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('[aria-label="Scene name"]')?.value==='Pasted through menu');assert.equal((await state()).project.revision,revision);await native('edit.undo');await page.waitForFunction(name=>document.querySelector<HTMLInputElement>('[aria-label="Scene name"]')?.value===name,oldName);await field.press('Control+a');await native('edit.copy');const copyDeadline=Date.now()+5000;while(await app.evaluate(({clipboard})=>clipboard.readText())!==oldName){assert.ok(Date.now()<copyDeadline,'Native copy did not reach the clipboard');await page.waitForTimeout(30);}await native('edit.cut');await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('[aria-label="Scene name"]')?.value==='');await native('edit.undo');await page.waitForFunction(name=>document.querySelector<HTMLInputElement>('[aria-label="Scene name"]')?.value===name,oldName);assert.equal((await state()).project.revision,revision);await field.press('Escape');await page.getByRole('toolbar',{name:'Canvas tools'}).click({position:{x:1,y:1}});
 await menu('Edit',/^Select all/);await page.getByRole('region',{name:'Selection properties'}).waitFor();history=(await state()).history;
 await native('edit.group');await wait(async id=>(await window.pteron.call('objects',{screenId:id})).filter((object:any)=>!object.parentId).length===1,first);assert.equal((await state()).history.undo,history.undo+1);
 await native('edit.undo');await wait(async id=>(await window.pteron.call('objects',{screenId:id})).filter((object:any)=>!object.parentId).length===2,first);
 // View commands change only view state and can always be recovered with Reset layout.
 const baseline=(await state()).project;await native('view.layers');await page.locator('.layers-sidebar').waitFor({state:'hidden'});await native('view.scenes');await native('view.inspector');await native('view.timeline');await page.locator('.timeline').waitFor({state:'hidden'});await native('view.reset');await page.locator('.layers-sidebar').waitFor();await page.locator('.timeline').waitFor();assert.deepEqual((await state()).project,baseline);
 const width=await page.locator('iframe').evaluate(frame=>frame.getBoundingClientRect().width);await native('view.zoomIn');await page.waitForFunction(width=>document.querySelector('iframe')!.getBoundingClientRect().width>width,width);await native('view.actual');await page.waitForFunction(()=>Math.abs(document.querySelector('iframe')!.getBoundingClientRect().width-320)<1);await native('view.fit');
 await native('view.fullscreen');await page.waitForTimeout(150);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen()),true);await native('view.fullscreen');await wait(async()=>(await window.pteron.call('window.state')).fullscreen===false);await page.keyboard.press('F11');await wait(async()=>(await window.pteron.call('window.state')).fullscreen===true);await page.keyboard.press('F11');await wait(async()=>(await window.pteron.call('window.state')).fullscreen===false);
 await page.keyboard.press('F10');await page.waitForFunction(()=>document.activeElement?.textContent==='File');await page.keyboard.press('ArrowDown');await page.getByRole('menuitem',{name:/^New project/}).waitFor();await page.keyboard.press('Escape');await page.keyboard.press('Alt+f');await page.getByRole('menuitem',{name:/^New project/}).waitFor();assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMenuBarVisible()),false);await page.keyboard.press('Escape');
 await menu('Help',/^Keyboard shortcuts/);await page.getByRole('searchbox',{name:'Search keyboard shortcuts'}).fill('save as');assert.ok(await page.getByRole('dialog').getByText('Ctrl+Shift+S',{exact:true}).count());await closeDialog();
 await menu('Help',/^Documentation/);await page.getByRole('searchbox',{name:'Search documentation'}).fill('equation');assert.ok(await page.getByRole('dialog').getByText('Equations and matching',{exact:true}).count());await closeDialog();await native('help.about');await page.getByRole('dialog',{name:'About Pteron'}).waitFor();await closeDialog();await native('help.diagnostics');await page.getByText('Copy diagnostics',{exact:true}).click();assert.ok(!JSON.stringify(await page.evaluate(()=>window.pteron.call('app.info'))).includes('token'));await closeDialog();
 await page.keyboard.press('Control+Shift+p');await search.fill('zzzz-no-command');await page.getByText('No matching commands',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await native('scene.add');await wait(async()=>(await window.pteron.call('state')).project.screens.length===2);const second=(await state()).project.screens[1].id;await page.locator(`.layers[data-screen-id="${second}"]`).waitFor();await native('scene.earlier');await wait(async id=>(await window.pteron.call('state')).project.screens[0].id===id,second);await native('scene.later');await wait(async id=>(await window.pteron.call('state')).project.screens[1].id===id,second);
 await native('scene.rename');await page.getByRole('textbox',{name:'Scene name'}).fill('Second');await page.getByRole('textbox',{name:'Scene name'}).press('Enter');await wait(async()=>(await window.pteron.call('state')).project.screens[1].name==='Second');
 await command({type:'timeline.marker.put',marker:{id:'first',frame:1,label:'First'}});await command({type:'timeline.marker.put',marker:{id:'last',frame:3,label:'Last'}});await native('playback.restart');await native('playback.previousMarker');await page.getByRole('slider',{name:'Playhead',exact:true}).waitFor();
 await native('view.main');await page.locator('.all-screens[aria-pressed=true]').waitFor();await native('view.scene');
 await native('scene.duplicate');await wait(async()=>(await window.pteron.call('state')).project.screens.length===3);const duplicateScene=(await state()).project.screens[1].id;await page.locator(`.layers[data-screen-id="${duplicateScene}"]`).waitFor();await native('scene.delete');await wait(async()=>(await window.pteron.call('state')).project.screens.length===2);await page.locator('.screen-card').first().click();await page.locator(`.layers[data-screen-id="${first}"]`).waitFor();
 const ruler=page.getByRole('slider',{name:'Playhead',exact:true});await native('playback.restart');await native('playback.nextFrame');await page.waitForFunction(()=>document.querySelector('[aria-label=Playhead]')?.getAttribute('aria-valuenow')==='1');await native('playback.previousFrame');await page.waitForFunction(()=>document.querySelector('[aria-label=Playhead]')?.getAttribute('aria-valuenow')==='0');
 await native('playback.nextMarker');await page.waitForFunction(()=>document.querySelector('[aria-label=Playhead]')?.getAttribute('aria-valuenow')==='1');await native('playback.nextMarker');await page.waitForFunction(()=>document.querySelector('[aria-label=Playhead]')?.getAttribute('aria-valuenow')==='3');
 const loopingState=await state(),loopingScene=await page.locator('.layers').getAttribute('data-screen-id');await ruler.press('End');await native('playback.loop');await native('playback.toggle');await page.getByRole('button',{name:'Pause',exact:true}).waitFor();await page.waitForTimeout(450);assert.equal(await page.locator('.layers').getAttribute('data-screen-id'),loopingScene);assert.ok(Number(await ruler.getAttribute('aria-valuenow'))<30);await native('playback.toggle');await native('playback.loop');assert.deepEqual((await state()).project,loopingState.project);assert.deepEqual((await state()).history,loopingState.history);
 // Actual File → Import paths share the normal command/job services.
 const importSvg=resolve(work,'menu-import.svg');await writeFile(importSvg,'<svg xmlns="http://www.w3.org/2000/svg"><circle data-name="Imported from menu" cx="50" cy="50" r="12"/></svg>');
 const pickFile=async(path?:string)=>app.evaluate(({dialog},path)=>{dialog.showOpenDialog=(async()=>({canceled:!path,filePaths:path?[path]:[]})) as typeof dialog.showOpenDialog;},path);
 const importMenu=async(label:string)=>{await page.getByRole('menubar').getByRole('menuitem',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Import',exact:true}).hover();await page.getByRole('menuitem',{name:label,exact:true}).click();};
 const activeImport=(await page.locator('.layers').getAttribute('data-screen-id'))!;await pickFile(importSvg);await importMenu('SVG artwork…');await wait(async id=>(await window.pteron.call('objects',{screenId:id})).some((object:any)=>object.name==='Imported from menu'),activeImport);
 const imported=(await page.evaluate(id=>window.pteron.call('objects',{screenId:id}),activeImport)).find((object:any)=>object.name==='Imported from menu');await page.locator(`[data-layer-id="${imported.id}"] .layer-label`).click();await native('scene.continue');await wait(async({id,objectId})=>(await window.pteron.call('objects',{screenId:id})).some((object:any)=>object.id===objectId),{id:second,objectId:imported.id});
 const srt=resolve(work,'menu-captions.srt');await writeFile(srt,'1\n00:00:00,000 --> 00:00:00,200\nImported caption\n');await pickFile(srt);await importMenu('SRT captions…');await wait(async()=>(await window.pteron.call('state')).project.timelineCaptions?.[0]?.text==='Imported caption');
 const audio=resolve(work,'menu-audio.wav');execFileSync(python.executable,['-c','import wave,sys; w=wave.open(sys.argv[1],"wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000); w.writeframes(b"\\0"*16000); w.close()',audio],pythonOptions);await pickFile(audio);await importMenu('Narration audio…');await wait(async()=>(await window.pteron.call('state')).project.timelineAudio?.duration>0,undefined,30000);
 await pickFile();const beforeCancelledOpen=await state();await native('open');await page.waitForTimeout(120);assert.deepEqual((await state()).project,beforeCancelledOpen.project);assert.deepEqual((await state()).history,beforeCancelledOpen.history);

 // A missing recent file leaves the current project/history intact and can be removed.
 await rename(copy,resolve(work,'moved-copy.pteron'));await command({type:'project.rename',name:'Still editable'});const beforeMissing=await state();const recent=(await page.evaluate(()=>window.pteron.call('recent.list'))).projects;await native(`recent:${recent.findIndex((entry:any)=>entry.path===copy)}`);await page.getByRole('alert').filter({hasText:'moved or is missing'}).waitFor();assert.deepEqual((await state()).project,beforeMissing.project);assert.deepEqual((await state()).history,beforeMissing.history);await page.getByRole('button',{name:'Dismiss error'}).click();await native('recent.manage');await page.getByRole('button',{name:'Remove Menu test copy from recent projects',exact:true}).click();await wait(async path=>!(await window.pteron.call('recent.list')).projects.some((entry:any)=>entry.path===path),copy);await closeDialog();
 // Export through the real header and worker; an edit exposes the earlier revision.
 await command({type:'project.create',name:'Export progress',width:320,height:240});const exportScreen=(await state()).project.screens[0].id;await command({type:'screen.update',screenId:exportScreen,duration:20});await command({type:'artwork.import',screenId:exportScreen,svg:'<svg xmlns="http://www.w3.org/2000/svg"><rect x="20" y="30" width="35" height="35" fill="#223344"/></svg>'});
 const exportButton=page.getByRole('button',{name:'Export MP4',exact:true});
 const exportProgress=page.getByRole('progressbar',{name:'Export progress'});
 const exportStatus=page.getByRole('button',{name:'Export status'});
 const headerLayout=()=>page.evaluate(()=>{
  const selectors=['.application-logo','.application-menubar','.document-title','.document-save-status','.palette-trigger','.header-export'];
  return selectors.map(selector=>{
   const element=document.querySelector<HTMLElement>(selector)!;
   return [element.offsetLeft,element.offsetTop,element.offsetWidth,element.offsetHeight];
  });
 });
 const idleDesktop=await headerLayout();
 await app.evaluate(({dialog})=>{
  Object.assign(globalThis,{exportDialogs:0});
  dialog.showSaveDialog=async(_window,options)=>new Promise(done=>{
   const state=globalThis as typeof globalThis & {exportDialogs:number};
   state.exportDialogs++;
   Reflect.set(state,'exportDialogOptions',options);
   Reflect.set(state,'cancelExportDialog',()=>done({canceled:true,filePath:undefined}));
  });
 });
 await exportButton.click();
 await page.waitForFunction(()=>document.querySelector<HTMLButtonElement>('.header-export')?.disabled);
 assert.deepEqual(await headerLayout(),idleDesktop,'The save picker keeps desktop controls anchored');
 assert.equal(await page.evaluate(()=>window.pteron.call('render')),null,'A second request cannot open another picker');
 const picker=await app.evaluate(()=>Reflect.get(globalThis,'exportDialogOptions'));
 assert.equal(picker.title,'Export MP4');
 assert.match(picker.defaultPath,/Export progress\.mp4$/);
 assert.deepEqual(picker.filters,[{name:'MP4 video',extensions:['mp4']}]);
 assert.equal(await app.evaluate(()=>Reflect.get(globalThis,'exportDialogs')),1);
 await app.evaluate(()=>Reflect.get(globalThis,'cancelExportDialog')());
 await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('.header-export')?.disabled);
 assert.deepEqual(await headerLayout(),idleDesktop);
 assert.equal((await page.evaluate(()=>window.pteron.call('jobs'))).filter((job:any)=>job.kind==='render').length,0);

 const output=resolve(work,'menu-export.mp4');
 await saveDialog(output);
 await exportButton.click();
 await exportProgress.waitFor();
 const exportOutline=exportStatus.locator('.export-progress-outline');
 await exportOutline.waitFor();
 assert.match((await exportStatus.textContent())??'',/^\d+%$/);
 assert.deepEqual(await exportOutline.boundingBox(),await exportStatus.boundingBox(),'Progress spans the entire Export box');
 assert.ok(await exportStatus.evaluate(button=>{
  const progress=button.querySelector('progress')!;
  return button.querySelector('.export-progress-outline path[pathLength="1"]')?.getAttribute('stroke-dasharray')===`${progress.value} 1`;
 }));
 assert.ok(await exportOutline.locator('path[pathLength="1"]').evaluate(element=>{
  const path=element as SVGPathElement;
  const start=path.getPointAtLength(0);
  return start.x===path.ownerSVGElement!.viewBox.baseVal.width/2&&start.y===1&&path.getPointAtLength(1).x>start.x;
 }),'The progress stroke starts at the top center and fills clockwise');
 await exportStatus.screenshot({path:resolve(work,'export-progress.png')});
 assert.equal(await exportButton.count(),0,'Progress replaces Export during a job');
 assert.deepEqual(await headerLayout(),idleDesktop,'Progress uses the Export slot without moving desktop controls');
 const percentagePadding=await exportStatus.evaluate(button=>{const style=getComputedStyle(button),context=document.createElement('canvas').getContext('2d')!;context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;return (button.getBoundingClientRect().width-context.measureText('100%').width)/2;});
 assert.ok(percentagePadding>=3,`The widest percentage needs breathing room: ${percentagePadding}px`);
 await page.screenshot({path:resolve(work,'export-progress.png')});
 await command({type:'project.rename',name:'Edited while exporting'});
 await wait(async()=>(await window.pteron.call('jobs')).some((job:any)=>job.kind==='render'&&job.status==='completed'),undefined,120000);
 await exportButton.and(page.locator('[aria-description$="earlier edit"]')).waitFor();
 await exportButton.locator('svg.lucide-check').waitFor();
 assert.equal(await exportStatus.count(),0,'The result icon stays inside Export');
 assert.deepEqual(await headerLayout(),idleDesktop,'Completed status keeps desktop controls anchored');
 assert.ok((await stat(output)).size>0);
 const verification=JSON.parse(execFileSync(python.executable,['-c','import av,json,sys; from fractions import Fraction; c=av.open(sys.argv[1]); s=c.streams.video[0]; f=list(c.decode(s)); assert all(frame.pts*frame.time_base==Fraction(i,30) for i,frame in enumerate(f)); print(json.dumps({"frames":len(f),"fps":float(s.average_rate),"width":s.width,"height":s.height,"exactFrameClock":True}))',output],{...pythonOptions,encoding:'utf8'}));assert.deepEqual(verification,{frames:20,fps:30,width:320,height:240,exactFrameClock:true});

 // Cancelling a running export preserves work and leaves no claimed output.
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(800,560));
 await page.setViewportSize({width:800,height:560});
 await page.waitForFunction(()=>innerWidth===800&&innerHeight===560);
 const compactTitleBounds=await projectTitle.boundingBox();
 const compactHeader=await headerLayout();
 await projectTitle.press('Enter');
 assert.deepEqual(await projectName.boundingBox(),compactTitleBounds,'Opening rename preserves the compact title bounds');
 await projectName.fill('A long project name '.repeat(15));
 assert.deepEqual(await headerLayout(),compactHeader,'A long title draft keeps compact controls anchored');
 assert.ok(await projectName.evaluate(input=>input.getBoundingClientRect().right<=input.closest('.document-title')!.getBoundingClientRect().right),'The title editor fits inside the title area');
 await projectName.fill('Compact project');
 await page.getByRole('textbox',{name:'Scene name'}).focus();
 await page.getByRole('button',{name:'Rename project: Compact project'}).waitFor();
 const idleCompact=await headerLayout();
 await command({type:'screen.update',screenId:exportScreen,duration:180});
 const beforeCancel=await state(),cancelledPath=resolve(work,`cancelled-${Date.now()}.mp4`);
 await saveDialog(cancelledPath);
 await exportButton.click();
 await exportProgress.waitFor();
 assert.deepEqual(await headerLayout(),idleCompact,'Progress keeps compact controls anchored');
 assert.equal(await page.evaluate(()=>window.pteron.call('render')),null,'A running export blocks another picker');
 await page.getByRole('menubar').getByRole('menuitem',{name:'File',exact:true}).click();
 assert.equal(await page.getByRole('menuitem',{name:/^Export MP4/}).isDisabled(),true);
 await page.keyboard.press('Escape');
 const connection=await app.evaluate(({app})=>app.getPath('userData')+'/connection.json');
 const duplicate=execFileSync(process.execPath,['dist/mcp.js'],{
  input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'render',arguments:{path:cancelledPath}}})+'\n',
  env:{...process.env,PTERON_CONNECTION:connection},encoding:'utf8',timeout:15000,windowsHide:true
 });
 assert.match(duplicate,/An export is already running/);
 await exportStatus.click();
 const activity=page.getByRole('dialog',{name:'Activity and MCP'});
 const activityLayout=()=>activity.evaluate(dialog=>[dialog.offsetWidth,dialog.offsetHeight,...Array.from(dialog.querySelectorAll<HTMLElement>('.activity-section')).map(section=>section.offsetTop)]);
 const runningActivity=await activityLayout();
 assert.equal(await activity.locator('.mcp-card,.activity-empty-state,.job-status-chip,.mcp-info-tag').count(),0,'Activity uses flat rows and text status');
 const cancel=activity.getByRole('button',{name:'Cancel',exact:true});
 await cancel.click();
 await wait(async()=>(await window.pteron.call('jobs')).some((job:any)=>job.kind==='render'&&job.status==='cancelled'));
 await cancel.waitFor({state:'hidden'});
 assert.deepEqual(await activityLayout(),runningActivity,'Job changes keep Activity controls anchored');
 await closeDialog();
 await exportButton.and(page.locator('[aria-description="Export cancelled"]')).waitFor();
 assert.deepEqual(await headerLayout(),idleCompact,'Cancelled status keeps compact controls anchored');
 assert.deepEqual((await state()).project,beforeCancel.project);
 assert.deepEqual((await state()).history,beforeCancel.history);
 assert.equal(await stat(cancelledPath).then(()=>true,()=>false),false);
 await command({type:'project.create',name:'Odd export dimensions',width:321,height:240});
 await saveDialog(resolve(work,'invalid-export.mp4'));
 await exportButton.click();
 await exportButton.and(page.locator('[aria-description="Export failed"]')).waitFor();
 assert.deepEqual(await headerLayout(),idleCompact,'Failure status keeps compact controls anchored');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('.application-header').evaluate(header=>header.scrollWidth<=header.clientWidth));await menu('File',/^Project settings/);await closeDialog();await page.screenshot({path:resolve(work,'compact.png')});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));await page.setViewportSize({width:1440,height:960});await page.getByRole('menubar').getByRole('menuitem',{name:'File',exact:true}).click();await page.screenshot({path:resolve(work,'desktop.png')});await page.keyboard.press('Escape');assert.deepEqual(errors,[]);assert.equal(await page.getByRole('alert').count(),0);
 await writeFile(resolve(work,'report.json'),JSON.stringify({passed:true,checks:['six themed menus and native action parity','Save As, cancellation, save failure and dirty undo/redo','native text clipboard and undo preserve project history','group/shared undo and view-only controls','fullscreen and keyboard menu navigation','searchable palette, documentation, shortcuts and diagnostics','scene/continuity actions, frame/marker navigation and loop scene','SVG, SRT and WAV imports; cancelled/missing opens preserve work','real MP4 progress, staleness, cancellation and exact frame clock','800x560 and desktop layout'],verification,errors},null,2));console.log('Application menu desktop acceptance passed');
}catch(error){await page.screenshot({path:resolve(work,'failure.png')}).catch(()=>{});console.error('UI errors',errors);throw error;}finally{await app.close();}
