import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { commandSchema } from '../src/core/commands';
import { clipSchema } from '../src/core/model';
const connectionPath=process.env.PTERON_CONNECTION??join(process.env.APPDATA??'','pteron','connection.json');
const disconnected='Open Pteron and copy the MCP client configuration from File → Activity and MCP.';
const descriptorSchema=z.object({pipe:z.string().min(1),token:z.string().min(1)});
async function remote(method:string,args:unknown){
 let descriptor:string;
 try{descriptor=await readFile(connectionPath,'utf8');}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new Error(disconnected);throw error;}
 let connection:z.infer<typeof descriptorSchema>;
 try{connection=descriptorSchema.parse(JSON.parse(descriptor));}
 catch{throw new Error(`Invalid MCP connection descriptor. ${disconnected}`);}
 const {pipe,token}=connection;
 return new Promise((resolve,reject)=>{const socket=connect(pipe);let data='';socket.setTimeout(30000,()=>socket.destroy(new Error('Desktop request timed out')));socket.setEncoding('utf8');socket.on('connect',()=>socket.write(JSON.stringify({id:1,token,method,args})+'\n'));socket.on('data',chunk=>{data+=chunk;if(data.includes('\n')){socket.end();try{const response=JSON.parse(data.split('\n')[0]);if(response.error)reject(new Error(response.error));else resolve(response.result);}catch(e){reject(e);}}});socket.on('error',error=>reject(['ENOENT','ECONNREFUSED'].includes((error as NodeJS.ErrnoException).code??'')?new Error(disconnected):error));socket.on('end',()=>reject(new Error('Pteron closed the connection before responding')));});
}
const id=z.string().min(1);
const revision=z.number().int().nonnegative().describe('Current project revision from project.summary or state');
const path=z.string().refine(isAbsolute,'Expected an absolute path').describe('Absolute local file path');
const noArgs=z.strictObject({});
const screen=z.strictObject({screenId:id});
const object=z.strictObject({screenId:id,objectId:id});
const selection=z.strictObject({screenId:id,objectIds:z.array(id).min(1)});
const response=z.enum(['compact','full']);
const compactResponse=response.default('compact');
const fullResponse=response.default('full');
const edit=z.strictObject({revision,command:commandSchema,response:compactResponse});
const previewEdit=edit.extend({response:fullResponse});
const tool=(name:string,description:string,schema:z.ZodType,readOnly=false)=>({name,description,schema,readOnly});
const tools=[
 tool('project.summary','Start here for the project revision, format, ordered scene IDs, frame offsets, and undo availability. Omits SVG and media payloads.',noArgs,true),
 tool('state','Read the complete project, including SVG and embedded media, plus history and activity.',noArgs,true),
 tool('command','Apply an undoable edit and return the resulting revision. Use response: full for the project.',edit),
 tool('command.preview','Validate without committing. Use response: compact for base and proposed revisions instead of the proposed project.',previewEdit,true),
 tool('presets','List motion presets with defaults at the current project frame rate.',noArgs,true),
 tool('objects','List scene objects. Use response: compact for names and IDs, or objectId to inspect one object.',screen.extend({response:fullResponse,objectId:id.optional()}),true),
 tool('selection.info','Read bounds and effective appearance for a selection of objects in one scene.',selection,true),
 tool('motion.geometry','Read bounds, parent transform, and pivot for one artwork object.',object,true),
 tool('motion.defaults','Suggest clip duration and intensity for a preset and selection.',selection.extend({preset:clipSchema.shape.preset}),true),
 tool('continuity.info','Read the source scene and local overrides for a linked object.',object,true),
 tool('recovery.info','Inspect available recovery metadata and the first scene SVG.',noArgs,true),
 tool('preview','Read the sampled motion plan for one scene.',screen,true),
 tool('recover','Restore recovery and return the resulting revision. Use response: full for the project.',z.strictObject({revision,response:compactResponse})),
 tool('open','Open a local .pteron package and return the resulting revision. Use response: full for the project.',z.strictObject({revision,path,response:compactResponse})),
 tool('save','Save the project to its current package or a supplied .pteron path.',z.strictObject({path:path.optional()})),
 tool('srt','Return combined SRT text and optionally write it to a local file.',z.strictObject({path:path.optional()})),
 tool('jobs','List active and recent render, equation, and media jobs.',noArgs,true),
 tool('job.cancel','Cancel a job by ID. Get the ID from jobs or the tool that started it.',z.strictObject({id})),
 tool('equation.compile','Start a LaTeX compilation job. Supply equationId to recompile an existing equation.',screen.extend({source:z.string(),equationId:id.optional()})),
 tool('audio.import','Start importing local narration audio. Set timeline to true for the project clock and use start for its frame offset.',screen.extend({path,timeline:z.boolean().optional(),start:z.number().int().nonnegative().optional()})),
 tool('srt.import','Replace captions from exactly one of path or source and return the resulting revision. Use response: full for the project.',z.strictObject({revision,path:path.optional(),source:z.string().optional(),response:compactResponse}).refine(args=>(args.path===undefined)!==(args.source===undefined),'Supply exactly one of path or source')),
 tool('render','Start an MP4 export job to a local path. Poll jobs for progress.',z.strictObject({path,quality:z.enum(['draft','final']).optional()}))
];
async function main(){const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of lines){let message:any;try{message=JSON.parse(line);if(message.id===undefined)continue;let result:any;
 switch(message.method){
 case 'initialize':result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'pteron',version:'0.1.0'}};break;
 case 'ping':result={};break;
 case 'tools/list':result={tools:tools.map(({name,description,schema,readOnly})=>({name,description,inputSchema:z.toJSONSchema(schema,{io:'input',reused:schema===edit||schema===previewEdit?'ref':'inline'}),...(readOnly?{annotations:{readOnlyHint:true}}:{})}))};break;
 case 'tools/call':{
  const tool=tools.find(tool=>tool.name===message.params?.name);
  if(!tool){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32602,message:'Unknown tool'}})+'\n');continue;}
  try{
   const args=tool.schema.safeParse(message.params.arguments===undefined?{}:message.params.arguments);
   if(!args.success)throw new Error(args.error.issues.map(issue=>[issue.path.join('.'),issue.message].filter(Boolean).join(': ')).join('\n'));
   const value=await remote(tool.name,args.data);
   result={content:[{type:'text',text:JSON.stringify(value)}]};
  }catch(e){result={isError:true,content:[{type:'text',text:e instanceof Error?e.message:String(e)}]};}
  break;
 }
 default:process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}})+'\n');continue;
 }
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result})+'\n');
 }catch(e){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message?.id??null,error:{code:-32700,message:e instanceof Error?e.message:String(e)}})+'\n');}}}
void main();
