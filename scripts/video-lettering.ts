import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {workerRuntime} from '../electron/runtime';

const execute=promisify(execFile);

export async function videoLettering(directory:string,texts:string[],width:number,height:number):Promise<string[]>{
 const request=resolve(directory,'lettering-request.json');
 await writeFile(request,JSON.stringify({operation:'captions',texts,width,height}));
 const runtime=workerRuntime(resolve('.'),directory,false);
 const {stdout}=await execute(runtime.executable,[...runtime.args,request],{
  cwd:directory,env:{...process.env,...runtime.env},windowsHide:true,maxBuffer:16*1024*1024,
 });
 const message=stdout.split('\n').filter(line=>line.startsWith('PTERON:')).map(line=>JSON.parse(line.slice(7))).find(value=>value.result);
 if(!message||!Array.isArray(message.result.vectors)||message.result.vectors.length!==texts.length){
  throw new Error('Lettering worker did not return one vector per requested label');
 }
 return message.result.vectors;
}
