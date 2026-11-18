import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {ProjectService} from '../src/core/service';

function request(messages:{method:string,params?:unknown}[]){
 const child=spawnSync(process.execPath,['--import','tsx','scripts/mcp.ts'],{
  input:messages.map((message,index)=>JSON.stringify({jsonrpc:'2.0',id:index+1,...message})).join('\n')+'\n',
  encoding:'utf8',windowsHide:true,timeout:15000,
  env:{...process.env,PTERON_CONNECTION:'missing-mcp-test-connection.json'}
 });
 assert.ifError(child.error);
 assert.equal(child.status,0,child.stderr);
 return child.stdout.trim().split('\n').map(line=>JSON.parse(line));
}

test('MCP advertises tool-specific arguments and a compact read-only entry point',()=>{
 const [{result:{tools}}]=request([{method:'tools/list'}]);
 assert.ok(tools.some((tool:{name:string})=>tool.name==='project.summary'));
 const schema=(name:string)=>tools.find((tool:{name:string})=>tool.name===name).inputSchema;
 assert.deepEqual(schema('objects').required,['screenId']);
 assert.deepEqual(schema('job.cancel').required,['id']);
 assert.deepEqual(schema('render').required,['path']);
 assert.deepEqual(Object.keys(schema('render').properties),['path','quality']);
 assert.deepEqual(schema('command').required,['revision','command']);
 assert.deepEqual(schema('command').properties.response.enum,['compact','full']);
 for(const name of ['command','open','recover','srt.import']){
  assert.equal(schema(name).properties.response.default,'compact');
  assert.ok(!schema(name).required?.includes('response'));
 }
 for(const name of ['objects','command.preview']){
  assert.equal(schema(name).properties.response.default,'full');
 }
});

test('MCP rejects invalid tool arguments before connecting and identifies unknown tools',()=>{
 const call=(name:string,args:unknown)=>({method:'tools/call',params:{name,arguments:args}});
 const [objects,srt,unknown,disconnected]=request([
  call('objects',{}),call('srt.import',{revision:0}),call('unknown',{}),call('project.summary',{})
 ]);
 assert.equal(objects.result.isError,true);
 assert.match(objects.result.content[0].text,/screenId/);
 assert.equal(srt.result.isError,true);
 assert.match(srt.result.content[0].text,/exactly one of path or source/);
 assert.equal(unknown.error.code,-32602);
 assert.match(disconnected.result.content[0].text,/Open Pteron/);
 assert.doesNotMatch(disconnected.result.content[0].text,/missing-mcp-test-connection/);
});

test('compact MCP results omit payloads while preserving validation, revisions and undo',async context=>{
 const work=await mkdtemp(join(tmpdir(),'pteron-mcp-'));
 const service=new ProjectService(join(work,'recovery.pteron'));
 context.after(async()=>{
  await service.flush().catch(()=>{});
  await rm(work,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 });
 const screenId=service.store.snapshot.screens[0].id;
 service.store.dispatch({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg"><g data-name="Group"><rect data-name="Tile" width="20" height="30"/></g></svg>'},0);
 const data=(await readFile('examples/media/scene-1.wav')).toString('base64');
 service.store.dispatch({type:'timeline.audio.attach',mediaId:'voice',name:'scene-1.wav',mime:'audio/wav',data,start:0,duration:40},1);

 const [group,tile]=await service.call('objects',{screenId,response:'compact'},'mcp');
 assert.deepEqual(JSON.parse(JSON.stringify(tile)),{id:tile.id,name:'Tile',type:'rect',parentId:group.id});
 const [details]=await service.call('objects',{screenId,objectId:tile.id},'mcp');
 assert.equal(details.attributes.width,'20');
 assert.equal((await service.call('objects',{screenId,response:'compact'}))[1].attributes.width,'20');

 const edit={revision:2,command:{type:'object.edit',screenId,objectId:tile.id,attributes:{fill:'#123456'}}};
 const before=service.store.snapshot,history=service.store.history;
 const compact=await service.call('command.preview',{...edit,response:'compact'},'mcp');
 assert.deepEqual(compact,{baseRevision:2,proposedRevision:3});
 const full=await service.call('command.preview',edit,'mcp');
 assert.equal(full.project.media.voice.data,data);
 assert.ok(Buffer.byteLength(JSON.stringify(compact))*1000<Buffer.byteLength(JSON.stringify(full)));
 assert.deepEqual(service.store.snapshot,before);
 assert.deepEqual(service.store.history,history);
 assert.deepEqual(await service.call('command',{...edit,response:'compact'},'mcp'),{revision:3});
 await assert.rejects(service.call('command',{...edit,response:'compact'},'mcp'),/Stale revision/);
 await service.call('command',{revision:3,command:{type:'history.undo'}});
 assert.deepEqual(service.store.snapshot,{...before,revision:4});

 const source='1\n00:00:00,000 --> 00:00:00,500\nCaption\n';
 assert.deepEqual(await service.call('srt.import',{revision:4,source,response:'compact'},'mcp'),{revision:5});
 assert.equal(service.store.snapshot.timelineCaptions?.[0].text,'Caption');
 const path=join(work,'saved.pteron');
 await service.call('save',{path});
 assert.deepEqual(await service.call('open',{revision:5,path,response:'compact'},'mcp'),{revision:6});
 assert.deepEqual(await service.call('recover',{revision:6,response:'compact'},'mcp'),{revision:7});
 assert.equal(service.store.snapshot.media.voice.data,data);
 const [{result:{tools}}]=request([{method:'tools/list'}]);
 assert.ok(!tools.some((tool:{name:string})=>['recovery.list','recovery.read','recovery.delete'].includes(tool.name)));
});
