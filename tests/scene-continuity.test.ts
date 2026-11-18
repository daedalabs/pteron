import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {XMLSerializer} from '@xmldom/xmldom';
import {ProjectStore} from '../src/core/store';
import {ProjectService} from '../src/core/service';
import {newProject} from '../src/core/model';
import {parseSvg,svgObjects} from '../src/core/svg';
import {initializeGeometry,selectionInfo} from '../src/core/selection';
import {encodeProject,decodeProject,loadProject} from '../src/core/persistence';
await initializeGeometry();

function setup(){
 const store=new ProjectStore(newProject('Scenes',320,240)),first=store.snapshot.screens[0].id;
 const dispatch=(command:unknown)=>store.dispatch(command,store.snapshot.revision,'mcp');
 dispatch({type:'artwork.import',screenId:first,svg:'<svg xmlns="http://www.w3.org/2000/svg" x="12" y="8" width="200" height="160" viewBox="0 0 400 320"><g data-name="Diagram"><rect data-name="Tile" x="40" y="50" width="80" height="40" fill="#ff00ff"/></g></svg>'});
 const objects=svgObjects(store.snapshot.screens[0].svg),root=objects.find(object=>object.name==='Diagram')!.id,tile=objects.find(object=>object.name==='Tile')!.id;
 dispatch({type:'screen.add',afterScreenId:first,name:'Second'});const second=store.snapshot.screens[1].id;
 dispatch({type:'screen.add',afterScreenId:second,name:'Third'});const third=store.snapshot.screens[2].id;
 const object=(scene:number,id=tile)=>svgObjects(store.snapshot.screens[scene].svg).find(object=>object.id===id)!;
 return {store,dispatch,first,second,third,root,tile,object};
}

test('upstream appearance and final poses propagate through scenes in one shared undo entry',()=>{
 const {store,dispatch,first,root,tile,object}=setup();
 dispatch({type:'object.edit',screenId:first,objectId:tile,attributes:{fill:'#00cc99',x:'60'}});
 for(const scene of [0,1,2]){assert.equal(object(scene).attributes.fill,'#00cc99');assert.equal(object(scene).attributes.x,'60');}
 const before=store.snapshot,history=store.history;
 dispatch({type:'clip.put',screenId:first,clip:{id:'rotate',objectId:root,preset:'Rotate',start:0,duration:12,intensity:.25}});
 assert.match(object(1,root).attributes.transform,/rotate\(90\)/);
 assert.match(object(2,root).attributes.transform,/rotate\(90\)/);
 assert.deepEqual(selectionInfo(store.snapshot.screens[1].svg,[root]).bounds,selectionInfo(store.snapshot.screens[2].svg,[root]).bounds);
 assert.equal(store.history.undo,history.undo+1);
 assert.deepEqual(decodeProject(encodeProject(store.snapshot)),store.snapshot);
 dispatch({type:'history.undo'});assert.deepEqual(store.snapshot.screens,before.screens);
 dispatch({type:'history.redo'});assert.match(object(2,root).attributes.transform,/rotate\(90\)/);
});

test('destination overrides, independent animation and identities survive upstream edits',()=>{
 const {store,dispatch,first,second,tile,object}=setup();
 dispatch({type:'object.edit',screenId:second,objectId:tile,attributes:{fill:'#ee8800'}});
 dispatch({type:'clip.put',screenId:second,clip:{id:'pulse',objectId:tile,preset:'Pulse',start:0,duration:12}});
 const clip=store.snapshot.screens[1].clips[0];
 dispatch({type:'object.edit',screenId:first,objectId:tile,attributes:{fill:'#112233',width:'100'}});
 assert.equal(object(1).attributes.fill,'#ee8800');assert.equal(object(2).attributes.fill,'#ee8800');
 assert.equal(object(1).attributes.width,'100');assert.equal(object(2).attributes.width,'100');
 assert.deepEqual(store.snapshot.screens[1].clips,[clip]);assert.equal(object(1).id,tile);
});

test('making a child independent detaches its containing group; delete/reorder preserve editable work',()=>{
 const {store,dispatch,first,second,root,tile,object}=setup();
 const before=store.snapshot;
 dispatch({type:'object.unlink',screenId:second,objectIds:[tile]});
 assert.equal(store.snapshot.screens[1].links[root],undefined);assert.equal(store.snapshot.screens[1].links[tile],undefined);
 assert.equal(store.snapshot.screens[1].svg,before.screens[1].svg);
 dispatch({type:'object.edit',screenId:first,objectId:tile,attributes:{fill:'#112233'}});assert.equal(object(1).attributes.fill,'#ff00ff');assert.equal(object(2).attributes.fill,'#ff00ff');
 dispatch({type:'screen.delete',screenId:second});assert.equal(store.snapshot.screens[1].links[tile],undefined);assert.ok(svgObjects(store.snapshot.screens[1].svg).some(object=>object.id===tile));
 dispatch({type:'history.undo'});assert.equal(store.snapshot.screens.length,3);
 dispatch({type:'screen.reorder',screenId:first,index:2});assert.ok(svgObjects(store.snapshot.screens[0].svg).length);
 const saved=store.snapshot,h=store.history;assert.throws(()=>dispatch({type:'object.unlink',screenId:second,objectIds:['missing']}),/not found/);assert.deepEqual(store.snapshot,saved);assert.deepEqual(store.history,h);
});

test('source deletion detaches the surviving group without erasing destination artwork or clips',()=>{
 const {store,dispatch,first,second,root,tile}=setup();
 dispatch({type:'clip.put',screenId:second,clip:{id:'local',objectId:tile,preset:'Pulse',start:0,duration:12}});
 const before=store.snapshot.screens[1];dispatch({type:'object.delete',screenId:first,objectId:tile});
 const next=store.snapshot.screens[1];assert.equal(next.links[root],undefined);assert.equal(next.links[tile],undefined);assert.equal(next.svg,before.svg);assert.deepEqual(next.clips,before.clips);
});

test('nested viewport placement keeps its coordinates and identity after a canvas commit',()=>{
 const {store,dispatch,first,object}=setup();
 const old=store.snapshot.screens[0],parsed=parseSvg(old.svg),viewport=parsed.elements.find(node=>node.hasAttribute('viewBox')&&node!==parsed.doc.documentElement)!;
 viewport.setAttribute('x','28');
 dispatch({type:'artwork.commit',screenId:first,svg:new XMLSerializer().serializeToString(parsed.doc)});
 const destination=parseSvg(store.snapshot.screens[1].svg).elements.find(node=>node.getAttribute('id')===viewport.getAttribute('id'))!;
 assert.equal(destination.getAttribute('x'),'28');assert.equal(destination.getAttribute('viewBox'),'0 0 400 320');assert.ok(object(1));
});

test('linked groups follow new children and structural editor wrappers without restoring local deletions',()=>{
 const {store,dispatch,first,second,root,tile}=setup();
 const parsed=parseSvg(store.snapshot.screens[0].svg),group=parsed.elements.find(node=>node.getAttribute('id')===root)!;
 const extra=parsed.doc.createElementNS('http://www.w3.org/2000/svg','circle');extra.setAttribute('cx','100');extra.setAttribute('cy','100');extra.setAttribute('r','10');group.appendChild(extra);
 const wrapper=parsed.doc.createElementNS('http://www.w3.org/2000/svg','g');wrapper.setAttribute('class','layer');
 while(parsed.doc.documentElement!.firstChild)wrapper.appendChild(parsed.doc.documentElement!.firstChild);parsed.doc.documentElement!.appendChild(wrapper);
 dispatch({type:'artwork.commit',screenId:first,svg:new XMLSerializer().serializeToString(parsed.doc)});
 const child=svgObjects(store.snapshot.screens[0].svg).find(object=>object.type==='circle')!;
 assert.ok(svgObjects(store.snapshot.screens[1].svg).some(object=>object.id===child.id));assert.equal(store.snapshot.screens[1].links[child.id],first);
 dispatch({type:'object.delete',screenId:second,objectId:tile});
 dispatch({type:'object.edit',screenId:first,objectId:tile,attributes:{fill:'#112233'}});
 assert.ok(!svgObjects(store.snapshot.screens[1].svg).some(object=>object.id===tile));
});

test('generated borders remain single geometry after linked resizing and retain local paint',()=>{
 const {store,dispatch,first,second,tile,object}=setup();
 dispatch({type:'object.edit',screenId:first,objectId:tile,attributes:{stroke:'#112233','stroke-width':'4','data-stroke-alignment':'inside'}});
 dispatch({type:'object.edit',screenId:second,objectId:tile,attributes:{fill:'#ee8800'}});
 dispatch({type:'object.edit',screenId:first,objectId:tile,attributes:{width:'140'}});
 assert.equal(object(1).attributes.fill,'#ee8800');assert.equal(object(1).attributes.width,'140');
 const source=parseSvg(store.snapshot.screens[0].svg).elements.find(node=>node.getAttribute('id')===tile)!,target=parseSvg(store.snapshot.screens[1].svg).elements.find(node=>node.getAttribute('id')===tile)!;
 assert.equal(target.childNodes.length,source.childNodes.length,'Generated vectors must be replaced, never doubled');
 assert.deepEqual(selectionInfo(store.snapshot.screens[1].svg,[tile]).bounds,selectionInfo(store.snapshot.screens[2].svg,[tile]).bounds);
});

test('recompiled linked equations keep their group clips and editable source without accumulating old glyphs',()=>{
 const store=new ProjectStore(newProject('Equations',320,240)),first=store.snapshot.screens[0].id;
 const dispatch=(command:unknown)=>store.dispatch(command,store.snapshot.revision);
 const equation=(source:string,width:number)=>dispatch({type:'equation.commit',screenId:first,equation:{id:'equation',source,terms:{},svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 10"><path d="M0 0H${width}V10H0Z"/></svg>`}});
 equation('x',30);const root=svgObjects(store.snapshot.screens[0].svg).find(object=>object.equationId==='equation')!.id;
 dispatch({type:'screen.add',name:'Second'});const second=store.snapshot.screens[1].id;
 dispatch({type:'clip.put',screenId:second,clip:{id:'pulse',objectId:root,preset:'Pulse',start:0,duration:12}});
 equation('x+1',60);
 const next=store.snapshot.screens[1];assert.equal(next.equations[0].source,'x+1');assert.equal(next.links[root],first);assert.equal(next.clips[0].objectId,root);
 assert.equal(parseSvg(next.svg).elements.filter(node=>node.localName==='path').length,1);
 assert.deepEqual(decodeProject(encodeProject(store.snapshot)),store.snapshot);
});

test('source recompilation preserves local equation sources and rejects discarding edited terms',()=>{
 const store=new ProjectStore(newProject('Equations',320,240)),first=store.snapshot.screens[0].id;
 const dispatch=(command:unknown)=>store.dispatch(command,store.snapshot.revision);
 const equation=(screenId:string,source:string,width:number)=>dispatch({type:'equation.commit',screenId,equation:{id:'equation',source,terms:{},svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 10"><path fill="#000000" d="M0 0H${width}V10H0Z"/></svg>`}});
 equation(first,'x',30);dispatch({type:'screen.add',name:'Second'});const second=store.snapshot.screens[1].id;
 const glyph=svgObjects(store.snapshot.screens[1].svg).find(object=>object.type==='path')!.id;
 dispatch({type:'object.edit',screenId:second,objectId:glyph,attributes:{fill:'#ee8800'}});
 const before=store.snapshot,history=store.history;assert.throws(()=>equation(first,'x+1',60),/local artwork edits/);assert.deepEqual(store.snapshot,before);assert.deepEqual(store.history,history);
 equation(second,'local',90);const local=store.snapshot.screens[1].svg;
 equation(first,'x+2',80);assert.equal(store.snapshot.screens[1].equations[0].source,'local');assert.equal(store.snapshot.screens[1].svg,local);
 assert.equal(parseSvg(local).elements.filter(node=>node.localName==='path').length,1);
});

test('linked referenced paints update without changing internal references',()=>{
 const store=new ProjectStore(newProject('Paint',320,240)),first=store.snapshot.screens[0].id;
 const dispatch=(command:unknown)=>store.dispatch(command,store.snapshot.revision);
 dispatch({type:'artwork.import',screenId:first,svg:'<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="paint"><stop offset="0" stop-color="#112233"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><rect width="40" height="20" fill="url(#paint)"/></svg>'});
 dispatch({type:'screen.add',name:'Second'});
 const parsed=parseSvg(store.snapshot.screens[0].svg);parsed.elements.find(node=>node.localName==='stop')!.setAttribute('stop-color','#ff00ff');
 dispatch({type:'artwork.commit',screenId:first,svg:new XMLSerializer().serializeToString(parsed.doc)});
 const target=parseSvg(store.snapshot.screens[1].svg);assert.equal(target.elements.find(node=>node.localName==='stop')!.getAttribute('stop-color'),'#ff00ff');
 assert.equal(svgObjects(store.snapshot.screens[1].svg)[0].attributes.fill,svgObjects(store.snapshot.screens[0].svg)[0].attributes.fill);
});

test('existing scenes can receive new objects and reconnect independent artwork without losing local motion',()=>{
 const {store,dispatch,first,second,root,tile,object}=setup();
 dispatch({type:'object.unlink',screenId:second,objectIds:[root]});
 dispatch({type:'object.edit',screenId:second,objectId:tile,attributes:{fill:'#ee8800'}});
 dispatch({type:'clip.put',screenId:second,clip:{id:'pulse',objectId:root,preset:'Pulse',start:0,duration:12}});
 dispatch({type:'object.link',screenId:second,sourceScreenId:first,objectIds:[root]});
 assert.equal(object(1).attributes.fill,'#ff00ff');assert.equal(store.snapshot.screens[1].links[root],first);assert.equal(store.snapshot.screens[1].clips[0].id,'pulse');
 dispatch({type:'artwork.import',screenId:first,svg:'<svg xmlns="http://www.w3.org/2000/svg"><rect data-name="New" x="200" width="20" height="20"/></svg>'});
 const added=svgObjects(store.snapshot.screens[0].svg).find(object=>object.name==='New')!;
 // Remove the automatically inherited object, then explicitly carry it again.
 if(svgObjects(store.snapshot.screens[1].svg).some(object=>object.id===added.id))dispatch({type:'object.delete',screenId:second,objectId:added.id});
 dispatch({type:'object.continue',screenId:first,objectIds:[added.id]});
 assert.ok(svgObjects(store.snapshot.screens[1].svg).some(object=>object.id===added.id));assert.equal(store.snapshot.screens[1].links[added.id],first);
 const before=store.snapshot;dispatch({type:'history.undo'});assert.ok(!svgObjects(store.snapshot.screens[1].svg).some(object=>object.id===added.id));dispatch({type:'history.redo'});assert.deepEqual(store.snapshot.screens,before.screens);
 const saved=store.snapshot;assert.throws(()=>dispatch({type:'object.link',screenId:first,sourceScreenId:second,objectIds:[root]}),/earlier/);assert.deepEqual(store.snapshot,saved);
});

test('MCP service measures old/new animated text separately and persists all scenes atomically',async context=>{
 const directory=await mkdtemp(join(tmpdir(),'pteron-continuity-'));
 const service=new ProjectService(join(directory,'recovery.pteron'));
 context.after(async()=>{
  await service.flush().catch(()=>{});
  await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 });
 service.measureText=async svg=>Object.fromEntries(parseSvg(svg).elements.filter(node=>node.localName==='text').map(node=>[node.getAttribute('id')!,{x:0,y:0,width:(node.textContent?.length??0)*10,height:20}]));
 const dispatch=(command:unknown)=>service.call('command',{command,revision:service.store.snapshot.revision},'mcp');
 const first=service.store.snapshot.screens[0].id;
 await dispatch({type:'artwork.import',screenId:first,svg:'<svg xmlns="http://www.w3.org/2000/svg"><text font-size="20">A</text></svg>'});
 const id=svgObjects(service.store.snapshot.screens[0].svg)[0].id;
 await dispatch({type:'clip.put',screenId:first,clip:{id:'rotate',objectId:id,preset:'Rotate',start:0,duration:12,intensity:.25}});
 await dispatch({type:'screen.add',afterScreenId:first,name:'Second'});
 await dispatch({type:'object.edit',screenId:first,objectId:id,attributes:{textContent:'Longer'}});
 const next=service.store.snapshot.screens[1],text=svgObjects(next.svg)[0];
 assert.equal(text.text,'Longer');assert.match(text.attributes.transform,/rotate\(90\)/);assert.match(text.attributes.transform,/30/);
 assert.deepEqual(await loadProject(service.recoveryPath),service.store.snapshot);
});
