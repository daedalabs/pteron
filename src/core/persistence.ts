import { readFile, mkdir, open, rename, unlink,copyFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { validateProject } from './store';
import type { Project } from './model';
export function encodeProject(project:Project){const p=validateProject(project),manifest=strToU8(JSON.stringify(p));if(manifest.length>300000000)throw new Error('Expanded package is too large');const bytes=zipSync({'manifest.json':manifest},{level:6});if(bytes.length>250000000)throw new Error('Project package is too large');return bytes;}
export function decodeProject(bytes:Uint8Array){if(bytes.length>250000000)throw new Error('Project package is too large');let total=0;const files=unzipSync(bytes,{filter:file=>{total+=file.originalSize;if(total>300000000)throw new Error('Expanded package is too large');return file.name==='manifest.json';}});if(!files['manifest.json'])throw new Error('Project manifest is missing');return validateProject(JSON.parse(strFromU8(files['manifest.json'])));}
export async function atomicWrite(path:string,bytes:Uint8Array){
 await mkdir(dirname(path),{recursive:true});const temp=`${path}.${crypto.randomUUID()}.tmp`;let handle;
 try{handle=await open(temp,'wx');await handle.writeFile(bytes);await handle.sync();await handle.close();handle=undefined;await rename(temp,path);}catch(error){await handle?.close();await unlink(temp).catch(()=>{});throw error;}
}
export async function saveProject(path:string,p:Project){await atomicWrite(path,encodeProject(p));}
export async function loadProject(path:string){return decodeProject(await readFile(path));}
export async function atomicCopy(source:string,destination:string){
 await mkdir(dirname(destination),{recursive:true});const temp=`${destination}.${crypto.randomUUID()}.tmp`;let handle;
 try{await copyFile(source,temp);handle=await open(temp,'r+');await handle.sync();await handle.close();handle=undefined;await rename(temp,destination);}
 catch(error){await handle?.close();await unlink(temp).catch(()=>{});throw error;}
}
