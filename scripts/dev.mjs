import {createServer} from 'vite';
import {context} from 'esbuild';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import electron from 'electron';

// Keep file-based geometry workers and the MCP adapter available in development.
await import('./build.mjs');
process.env.NODE_ENV='development';
const port=Number(process.env.PTERON_DEV_PORT??5173);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PTERON_DEV_PORT must be an integer from 1024 to 65535');
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true}});
await server.listen();
const url=server.resolvedUrls.local[0];
console.log('Preparing the interface and artwork editor…');
await Promise.all(['/main.tsx','/editor/canvas.ts'].map(path=>server.warmupRequest(path)));
await server.waitForRequestsIdle();
let child,closing=false,timer,restarting=false,restartAgain=false;
const contexts=[];
function launch(){
 const env={...process.env,PTERON_DEV_URL:url};delete env.ELECTRON_RUN_AS_NODE;
 child=spawn(electron,['.',...process.argv.slice(2)],{env,stdio:'inherit',windowsHide:false});
 child.once('error',error=>{console.error(error);void cleanup(1);});
 child.once('exit',()=>{if(!restarting&&!closing)void cleanup(0);});
 console.log(`\nDevelopment app: ${url} (Help: Developer tools / Reload interface)`);
}
async function restart(){
 if(closing)return;if(restarting){restartAgain=true;return;}restarting=true;
 try{
  do{restartAgain=false;if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}if(!closing)launch();}while(restartAgain&&!closing);
 }finally{restarting=false;}
}
function scheduleRestart(){if(!child||closing)return;clearTimeout(timer);timer=setTimeout(()=>void restart(),150);}
async function cleanup(code){
 if(closing)return;closing=true;clearTimeout(timer);
 if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}
 await Promise.all(contexts.map(ctx=>ctx.dispose()));await server.close();process.exitCode=code;
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void cleanup(0));
const options=[
 {entryPoints:['electron/main.ts'],outfile:'dist/electron/main.js',format:'esm',packages:'external'},
 {entryPoints:['electron/preload.ts'],outfile:'dist/electron/preload.cjs',format:'cjs',external:['electron']}
];
try{
 await Promise.all(options.map(async options=>{
  let ready;const initial=new Promise(resolve=>{ready=resolve;});
  const ctx=await context({...options,bundle:true,platform:'node',sourcemap:'inline',plugins:[{name:'electron-restart',setup(build){build.onEnd(result=>{if(ready){ready();ready=null;}else if(!result.errors.length)scheduleRestart();});}}]});
  contexts.push(ctx);await ctx.watch();await initial;
 }));
 launch();
}catch(error){console.error(error);await cleanup(1);}
