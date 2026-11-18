import {readFile,stat} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {z} from 'zod';
import {atomicWrite} from '../src/core/persistence';

const entrySchema=z.object({path:z.string().max(4096).refine(path=>isAbsolute(path)&&path.toLowerCase().endsWith('.pteron')),name:z.string().max(200),openedAt:z.string()});
export type RecentProject=z.infer<typeof entrySchema>&{missing:boolean};
/** Machine-local preferences. Never stored in projects or exposed through MCP. */
export class RecentProjects{
 private entries:z.infer<typeof entrySchema>[]=[];
 private writes:Promise<void>=Promise.resolve();
 warning:string|undefined;
 constructor(readonly file:string){}
 async load(){try{this.entries=z.array(entrySchema).max(12).parse(JSON.parse(await readFile(this.file,'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')this.warning='Recent projects could not be read. Open a project to start a new list.';}}
 private key(path:string){return process.platform==='win32'?resolve(path).toLowerCase():resolve(path);}
 async list():Promise<RecentProject[]>{return Promise.all(this.entries.map(async entry=>({...entry,missing:!await stat(entry.path).then(file=>file.isFile(),()=>false)})));}
 find(path:string){const entry=this.entries.find(entry=>this.key(entry.path)===this.key(path));if(!entry)throw new Error('This project is no longer in Recent projects');return entry;}
 private async persist(){const bytes=new TextEncoder().encode(JSON.stringify(this.entries));this.writes=this.writes.catch(()=>{}).then(()=>atomicWrite(this.file,bytes));try{await this.writes;this.warning=undefined;}catch{this.warning='The project is safe, but the recent-project list could not be saved.';}}
 async remember(path:string,name:string){const entry=entrySchema.parse({path:resolve(path),name:name.slice(0,200),openedAt:new Date().toISOString()});this.entries=[entry,...this.entries.filter(item=>this.key(item.path)!==this.key(path))].slice(0,12);await this.persist();}
 async remove(path:string){this.find(path);this.entries=this.entries.filter(entry=>this.key(entry.path)!==this.key(path));await this.persist();}
 async clear(){this.entries=[];await this.persist();}
}
