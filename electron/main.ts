import { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeImage } from 'electron';
import {release,arch} from 'node:os';
import {z} from 'zod';
import {RecentProjects} from './recent-projects';
import {RecoveryHistory} from './recovery-history';
import {buildApplicationMenu,menuStateSchema} from './application-menu';
import {defaultMenuState,type MenuState} from '../src/workspace/application-actions';
import {workerRuntime,texRuntime} from './runtime';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat, mkdir, writeFile, unlink } from 'node:fs/promises';
import { unlinkSync } from 'node:fs';
import { ProjectService } from '../src/core/service';
import {measureSelectionText} from './selection-geometry';
import {textOutlines} from './text-outlines';
import { Jobs } from './jobs';
const here=dirname(fileURLToPath(import.meta.url));
// Local artwork needs persistent preferences, but no HTTP or shader disk caches.
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.setName('pteron');
if(process.platform==='win32'){
 app.setAppUserModelId(app.isPackaged?'tech.daedalab.pteron':'tech.daedalab.pteron.dev');
 if(!app.isPackaged){
  const cleanStaleLnk=()=>{try{const lnk=join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs','Electron.lnk');unlinkSync(lnk);}catch{}};
  cleanStaleLnk();
  app.on('before-quit',cleanStaleLnk);
  app.on('will-quit',cleanStaleLnk);
  process.on('exit',cleanStaleLnk);
 }
}
async function main(){
const devUrl=!app.isPackaged?process.env.PTERON_DEV_URL:undefined;
if(devUrl){const url=new URL(devUrl);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/'||url.username||url.password)throw new Error('Development server must use a loopback HTTP origin');if(!process.argv.some(arg=>arg.startsWith('--user-data-dir=')))app.setPath('userData',join(app.getPath('appData'),'pteron-dev'));}
const recoveries=new RecoveryHistory(join(app.getPath('userData'),'recoveries'));await recoveries.load();
const service=new ProjectService(join(app.getPath('userData'),'recovery.pteron'),recoveries);
const descriptor=join(app.getPath('userData'),'connection.json');
const recents=new RecentProjects(join(app.getPath('userData'),'recent-projects.json'));await recents.load();
const file=process.argv.find(arg=>arg.toLowerCase().endsWith('.pteron'));
if(devUrl&&!file){try{await service.call('recover',{revision:service.store.snapshot.revision});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
if(file){await service.call('open',{path:file,revision:service.store.snapshot.revision});await recents.remember(file,service.store.snapshot.name);}
const jobs=new Jobs(service,join(app.getPath('userData'),'jobs'),app.getAppPath(),join(here,'../ui'));
let choosingExportPath=false;
service.measureText=svg=>measureSelectionText(svg,join(here,'../ui'));
service.outlineText=async(svg,objectIds)=>textOutlines(svg,objectIds);
const baseCall=service.call.bind(service);
const developmentErrors:string[]=[];
service.call=async(method,args={},source='manual')=>{
 if(method==='development.status'&&devUrl)return {visible:window.isVisible(),minimized:window.isMinimized(),focused:window.isFocused(),url:window.webContents.getURL(),loading:window.webContents.isLoading(),errors:developmentErrors.slice(-10),renderer:await window.webContents.executeJavaScript(`({ready:document.readyState,bridge:typeof window.pteron?.call==='function',children:document.getElementById('root')?.childElementCount??0,workspace:!!document.querySelector('.app-shell'),canvasTools:!!document.querySelector('.canvas-tools'),failedResources:performance.getEntriesByType('resource').filter(e=>e.responseStatus>=400).map(e=>({path:new URL(e.name).pathname,status:e.responseStatus}))})`)};
 if(method==='connection.info')return {config:{mcpServers:{pteron:{command:process.execPath,args:[app.isPackaged?join(process.resourcesPath,'mcp.cjs'):join(app.getAppPath(),'dist','mcp.cjs')],env:{ELECTRON_RUN_AS_NODE:'1',PTERON_CONNECTION:descriptor}}}},transport:'stdio',sharedHistory:true};
 if(method==='example.open'){const result=await baseCall('open',{path:join(app.isPackaged?process.resourcesPath:app.getAppPath(),'examples','small-idea.pteron'),revision:args.revision},source);service.path=undefined;return result;}
 if(method==='jobs')return jobs.list();
 if(method==='job.cancel')return jobs.cancel(args.id);
 if(method==='equation.compile')return jobs.equation(args.screenId,args.source,args.equationId);
 if(method==='render'){
  const quality=z.enum(['draft','final']).default('final').parse(args.quality);
  if(choosingExportPath)throw new Error('An export destination is being selected.');
  return jobs.render(args.path,quality);
 }
 if(method==='audio.import'){const mime=args.path.toLowerCase().endsWith('.mp3')?'audio/mpeg':'audio/wav';return args.timeline?jobs.audioTimeline(args.path,mime,args.start??0):jobs.audio(args.screenId,args.path,mime);}
 const result=await baseCall(method,args,source);
 if((method==='open'||method==='save')&&service.path){await recents.remember(service.path,service.store.snapshot.name);await updateMenu();window.webContents.send('pteron:change');}
 return result;
};
const icoIconPath=join(here,'../ui/pteron.ico');
const pngIconPath=join(here,'../ui/pteron.png');
const icoIcon=nativeImage.createFromPath(icoIconPath);
const pngIcon=nativeImage.createFromPath(pngIconPath);
const appIcon=!icoIcon.isEmpty()?icoIcon:(!pngIcon.isEmpty()?pngIcon:nativeImage.createEmpty());
const window=new BrowserWindow({width:1440,height:960,minWidth:800,minHeight:560,resizable:true,frame:false,autoHideMenuBar:true,icon:process.platform==='win32'?icoIconPath:appIcon,backgroundColor:'#101214',webPreferences:{preload:join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
if(!appIcon.isEmpty())window.setIcon(appIcon);
if(devUrl){
 window.once('ready-to-show',()=>{window.show();window.focus();});
 window.webContents.on('console-message',details=>{if(details.level==='error')developmentErrors.push(details.message);});
 window.webContents.on('preload-error',(_event,_path,error)=>developmentErrors.push(`Preload: ${error.message}`));
}
const action=(name:string)=>()=>window.webContents.send('pteron:action',name);
let menuState:MenuState={...defaultMenuState},menuUpdate=0;
async function updateMenu(){const request=++menuUpdate,recent=await recents.list();if(request!==menuUpdate||window.isDestroyed())return;Menu.setApplicationMenu(buildApplicationMenu({...menuState,fullscreen:window.isFullScreen()},recent,Boolean(devUrl),name=>action(name)()));window.setMenuBarVisibility(false);}
await updateMenu();
window.on('enter-full-screen',()=>{void updateMenu();window.webContents.send('pteron:action','window.changed');});
window.on('leave-full-screen',()=>{void updateMenu();window.webContents.send('pteron:action','window.changed');});
const publishWindowState=()=>{if(!window.isDestroyed())window.webContents.send('pteron:action','window.changed');};
window.on('maximize',publishWindowState);
window.on('unmaximize',publishWindowState);
window.on('restore',publishWindowState);
window.webContents.on('before-input-event',(event,input)=>{
 if(input.key==='Alt'){event.preventDefault();return;}
 if(input.type!=='keyDown')return;
 if(input.key==='F10'&&!input.shift&&!input.control&&!input.alt){event.preventDefault();action('menu.focus')();}
 const access:Record<string,string>={f:'File',e:'Edit',s:'Scene',v:'View',p:'Playback',h:'Help'};
 if(input.alt&&!input.control&&!input.meta&&access[input.key.toLowerCase()]){event.preventDefault();window.setMenuBarVisibility(false);action(`menu.${access[input.key.toLowerCase()]}`)();}
});
const updateTitle=()=>{const p=service.store.snapshot;window.setTitle(`pteron · ${p.name} · ${p.width} × ${p.height} · ${p.fps} fps`);};
updateTitle();
window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
window.webContents.on('will-navigate',(event,url)=>{
 // Vite's dependency updates and refresh fallback reload the current page.
 // Keep navigation restricted to the development entry point on its loopback origin.
 if(devUrl){const target=new URL(url);if(target.origin===new URL(devUrl).origin&&['/','/index.html'].includes(target.pathname))return;}
 event.preventDefault();
});
const allowed=new Set(['state','project.summary','presets','objects','selection.info','motion.geometry','motion.defaults','continuity.info','recovery.info','recovery.list','recovery.read','command','command.preview','recover','preview','srt','jobs','job.cancel','equation.compile','connection.info','example.open']);
ipcMain.handle('pteron',async(event,method,args={})=>{
 if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('Invalid caller');
 if(allowed.has(method))return service.call(method,args);
 if(method==='recovery.delete'){const id=z.string().regex(/^[a-z0-9-]{1,64}$/).parse(args.id);return recoveries.delete(id);}
 if(method==='caption.preview')return jobs.previewCaptions(z.string().parse(args.screenId));
 if(method==='menu.state'){menuState=menuStateSchema.parse(args) as MenuState;await updateMenu();return null;}
 if(method==='text.edit'){const operation=z.enum(['undo','redo','cut','copy','paste','delete','selectAll']).parse(args.operation);window.webContents[operation]();return null;}
 if(method==='app.info'){let rendererAvailable=true;try{workerRuntime(app.getAppPath(),process.resourcesPath,app.isPackaged);}catch{rendererAvailable=false;}return {version:app.getVersion(),electron:process.versions.electron,platform:process.platform,os:release(),architecture:arch(),development:!app.isPackaged,liveDevelopment:Boolean(devUrl),rendererAvailable,texAvailable:Boolean(texRuntime(app.getAppPath(),process.resourcesPath,process.env.PORTABLE_EXECUTABLE_DIR))};}
 if(method==='window.state')return {fullscreen:window.isFullScreen(),maximized:window.isMaximized()};
 if(method==='window.control'){const name=z.enum(['minimize','maximize','close']).parse(args.action);if(name==='minimize')window.minimize();else if(name==='maximize'){if(window.isMaximized())window.unmaximize();else window.maximize();}else window.close();return {fullscreen:window.isFullScreen(),maximized:window.isMaximized()};}
 if(method==='shell.showItemInFolder'){shell.showItemInFolder(z.string().parse(args.path));return null;}
 if(method==='shell.action'){const name=z.enum(['fullscreen','quit','reload','forceReload','tools']).parse(args.action);if(name==='fullscreen')window.setFullScreen(!window.isFullScreen());else if(name==='quit')window.close();else{if(!devUrl)throw new Error('Developer commands are unavailable in this build');if(name==='tools')window.webContents.toggleDevTools();else if(name==='forceReload')window.webContents.reloadIgnoringCache();else window.webContents.reload();}return null;}
 if(method==='recent.list')return {projects:await recents.list(),warning:recents.warning};
 if(method==='recent.clear'){await recents.clear();await updateMenu();return null;}
 if(method==='recent.remove'){await recents.remove(z.string().parse(args.path));await updateMenu();return null;}
 if(method==='recent.open'){const entry=recents.find(z.string().parse(args.path));try{if(!await stat(entry.path).then(file=>file.isFile()))throw new Error('Missing project');}catch{throw new Error('This project was moved or is missing. Open project to locate it, or remove it in Manage recent projects. Your current project is unchanged.');}return service.call('open',{path:entry.path,revision:args.revision});}
 if(method==='save'||method==='saveAs'){const suggested=service.path??`${service.store.snapshot.name.replace(/[<>:"/\\|?*]/g,'_').slice(0,100)||'Untitled'}.pteron`;const result=method==='save'&&service.path?{filePath:service.path}:await dialog.showSaveDialog(window,{defaultPath:suggested,filters:[{name:'pteron project',extensions:['pteron']}]});return result.filePath?service.call('save',{path:result.filePath}):null;}

 if(method==='open'){const result=await dialog.showOpenDialog(window,{filters:[{name:'pteron project',extensions:['pteron']}],properties:['openFile']});return result.canceled?null:service.call('open',{path:result.filePaths[0],revision:args.revision});}
 if(method==='import'){const result=await dialog.showOpenDialog(window,{filters:[{name:'SVG artwork',extensions:['svg']}],properties:['openFile']});return result.canceled?null:service.call('command',{revision:args.revision,command:{type:'artwork.import',screenId:args.screenId,svg:await readFile(result.filePaths[0],'utf8')}});}
 if(method==='render'){
  const quality=z.enum(['draft','final']).default('final').parse(args.quality);
  if(choosingExportPath||jobs.rendering)return null;
  const name=service.store.snapshot.name.replace(/[<>:"/\\|?*]/g,'_').slice(0,100)||'Untitled';
  const folder=service.path?dirname(service.path):app.getPath('videos');
  choosingExportPath=true;
  try{
   const {canceled,filePath}=await dialog.showSaveDialog(window,{
    title:'Export MP4',buttonLabel:'Export',defaultPath:join(folder,`${name}${quality==='draft'?'-draft':''}.mp4`),filters:[{name:'MP4 video',extensions:['mp4']}]
   });
   if(canceled||!filePath)return null;
   return jobs.render(filePath,quality);
  }finally{choosingExportPath=false;}
 }
 if(method==='srt.import'){const result=await dialog.showOpenDialog(window,{filters:[{name:'SubRip captions',extensions:['srt']}],properties:['openFile']});return result.canceled?null:service.call('srt.import',{path:result.filePaths[0],revision:args.revision});}
 if(method==='audio.import'){const result=await dialog.showOpenDialog(window,{filters:[{name:'Narration audio',extensions:['wav','mp3']}],properties:['openFile']});return result.canceled?null:service.call('audio.import',{screenId:args.screenId,path:result.filePaths[0],timeline:Boolean(args.timeline),start:args.start??0});}
 throw new Error('Operation is not exposed');
});
service.store.listeners.add(()=>{updateTitle();window.webContents.send('pteron:change');});
// A random local capability joins stdio clients to the running app's exact store.
const token=randomBytes(32).toString('hex');
const pipe=`\\\\.\\pipe\\pteron-${process.pid}-${randomBytes(8).toString('hex')}`;
const server=createServer(socket=>{let buffer='';socket.setEncoding('utf8');socket.on('data',chunk=>{buffer+=chunk;if(buffer.length>12000000){socket.destroy();return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);void (async()=>{let id;try{const request=JSON.parse(line);id=request.id;const key=Buffer.from(request.token??'');if(key.length!==token.length||!timingSafeEqual(key,Buffer.from(token)))throw new Error('Invalid connection capability');const result=await service.call(request.method,request.args,'mcp');socket.write(JSON.stringify({id,result})+'\n');}catch(e){socket.write(JSON.stringify({id,error:e instanceof Error?e.message:String(e)})+'\n');}})();}});socket.on('error',()=>{});});
await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
await mkdir(app.getPath('userData'),{recursive:true});await writeFile(descriptor,JSON.stringify({pipe,token}),{mode:0o600});
app.on('before-quit',()=>{server.close();void unlink(descriptor).catch(()=>{});});
app.on('window-all-closed',()=>app.quit());
if(devUrl)await window.loadURL(devUrl);else await window.loadFile(join(here,'../ui/index.html'));
}
void app.whenReady().then(main).catch(error=>{console.error(error);app.quit();});
