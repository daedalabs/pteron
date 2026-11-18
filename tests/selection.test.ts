import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProjectStore} from '../src/core/store';
import {newProject} from '../src/core/model';
import {svgObjects} from '../src/core/svg';
import {initializeGeometry,selectionInfo} from '../src/core/selection';
import {encodeProject,decodeProject} from '../src/core/persistence';
await initializeGeometry();
function setup(body='<rect x="10" y="20" width="40" height="30" fill="#ff0000"/><rect x="30" y="30" width="40" height="30" fill="#0000ff"/>'){
 const store=new ProjectStore(newProject('Selection',200,200)),screenId=store.snapshot.screens[0].id;
 const dispatch=(command:Record<string,unknown>)=>store.dispatch({screenId,...command},store.snapshot.revision,'mcp');
 dispatch({type:'artwork.import',svg:`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">${body}</svg>`});
 const ids=svgObjects(store.snapshot.screens[0].svg).map(object=>object.id);
 const info=()=>selectionInfo(store.snapshot.screens[0].svg,ids);
 return {store,screenId,dispatch,ids,info};
}
test('mixed selection edits are atomic, locked ancestors reject and undo restores both',()=>{
 const {store,dispatch,ids,info}=setup();assert.equal(info().attributes.fill,null);
 const before=store.snapshot;dispatch({type:'object.editMany',objectIds:ids,attributes:{fill:'#00ff00','stroke-opacity':'0.4'}});
 assert.equal(info().attributes.fill,'#00ff00');assert.equal(info().attributes['stroke-opacity'],'0.4');assert.equal(store.history.undo,2);
 dispatch({type:'history.undo'});assert.deepEqual(store.snapshot.screens,before.screens);
 dispatch({type:'object.edit',objectId:ids[1],attributes:{'data-locked':'true'}});const locked=store.snapshot;
 assert.throws(()=>dispatch({type:'object.editMany',objectIds:ids,attributes:{fill:'#ffffff'}}),/locked/);assert.deepEqual(store.snapshot,locked);
});
test('combined bounds move and resize proportionally across transformed nested viewports',()=>{
 const {store,dispatch,ids,info}=setup('<g transform="translate(5 10)"><svg x="10" y="20" width="100" height="100" viewBox="0 0 50 50"><rect x="0" y="0" width="10" height="10"/></svg></g><rect x="60" y="30" width="20" height="20"/>');
 const roots=svgObjects(store.snapshot.screens[0].svg).filter(object=>!object.parentId).map(object=>object.id),before=selectionInfo(store.snapshot.screens[0].svg,roots).bounds!;
 assert.deepEqual(before,{x:15,y:30,width:65,height:20});
 dispatch({type:'object.transformSelection',objectIds:roots,x:25,y:40,width:130,height:40});
 assert.deepEqual(selectionInfo(store.snapshot.screens[0].svg,roots).bounds,{x:25,y:40,width:130,height:40});
 dispatch({type:'history.undo'});assert.deepEqual(info().bounds,before);assert.equal(svgObjects(store.snapshot.screens[0].svg).length,ids.length);
});
test('align and equal-gap distribution preserve endpoints and identities',()=>{
 const {store,dispatch,ids}=setup('<rect x="10" y="10" width="10" height="10"/><rect x="40" y="40" width="20" height="20"/><rect x="100" y="80" width="10" height="10"/>');
 dispatch({type:'object.alignSelection',objectIds:ids,action:'top'});
 const box=(id:string)=>selectionInfo(store.snapshot.screens[0].svg,[id]).bounds!;
 assert.ok(ids.every(id=>box(id).y===10));dispatch({type:'object.alignSelection',objectIds:ids,action:'distribute-x'});
 assert.equal(box(ids[0]).x,10);assert.equal(box(ids[2]).x,100);assert.equal(box(ids[1]).x,50);
});
test('ungroup retains child identities, transforms, inherited paint and rejects animated groups',()=>{
 const {store,dispatch,ids}=setup('<g transform="translate(15 20)" fill="#00ff00" stroke="#ff0000"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="20" width="10" height="10"/></g>');
 const children=ids.slice(1),before=selectionInfo(store.snapshot.screens[0].svg,children);
 dispatch({type:'object.ungroup',objectIds:[ids[0]]});
 assert.deepEqual(svgObjects(store.snapshot.screens[0].svg).map(object=>object.id),children);assert.deepEqual(selectionInfo(store.snapshot.screens[0].svg,children),before);
 dispatch({type:'history.undo'});dispatch({type:'clip.put',clip:{id:'animation',objectId:ids[0],preset:'Pulse',start:0,duration:12}});
 const saved=store.snapshot;assert.throws(()=>dispatch({type:'object.ungroup',objectIds:[ids[0]]}),/animations/);assert.deepEqual(store.snapshot,saved);
});
test('Boolean operations retain the back shape identity/style and editable vector results',()=>{
 for(const operation of ['union','subtract','intersect','exclude']){
  const {store,dispatch,ids}=setup(),before=store.snapshot;
  dispatch({type:'object.boolean',objectIds:[...ids].reverse(),operation});const objects=svgObjects(store.snapshot.screens[0].svg);
  assert.equal(objects.length,1);assert.equal(objects[0].id,ids[0]);assert.equal(objects[0].attributes.fill,'#ff0000');assert.equal(objects[0].type,'path');assert.ok(objects[0].attributes.d.length>0);
  assert.deepEqual(decodeProject(encodeProject(store.snapshot)),store.snapshot);dispatch({type:'history.undo'});assert.deepEqual(store.snapshot.screens,before.screens);
 }
 const {store,dispatch,ids}=setup();dispatch({type:'clip.put',clip:{id:'animation',objectId:ids[1],preset:'Pulse',start:0,duration:12}});const before=store.snapshot;
 assert.throws(()=>dispatch({type:'object.boolean',objectIds:ids,operation:'union'}),/animated/);assert.deepEqual(store.snapshot,before);
});
test('Combine paths preserves subpaths and rejects style loss and empty results atomically',()=>{
 const {store,dispatch,ids}=setup();let before=store.snapshot;
 assert.throws(()=>dispatch({type:'object.boolean',objectIds:ids,operation:'combine'}),/appearance/);assert.deepEqual(store.snapshot,before);
 dispatch({type:'object.editMany',objectIds:ids,attributes:{fill:'#ff0000'}});dispatch({type:'object.boolean',objectIds:ids,operation:'combine'});assert.equal((svgObjects(store.snapshot.screens[0].svg)[0].attributes.d.match(/M/g)||[]).length,2);
 const empty=setup('<rect width="10" height="10"/><rect width="10" height="10"/>');before=empty.store.snapshot;
 assert.throws(()=>empty.dispatch({type:'object.boolean',objectIds:empty.ids,operation:'subtract'}),/empty/);assert.deepEqual(empty.store.snapshot,before);
});
test('per-edge strokes retain rectangle geometry, source IDs, timing and history',()=>{
 const {store,dispatch,ids}=setup('<rect x="10" y="20" width="80" height="60" rx="8" fill="#00ff00" stroke="#ff0000" stroke-width="4"/>'),id=ids[0];
 dispatch({type:'clip.put',clip:{id:'move',objectId:id,preset:'Slide',start:0,duration:12}});
 const before=store.snapshot;
 dispatch({type:'object.edit',objectId:id,attributes:{'data-stroke-edges':'top'}});
 let objects=svgObjects(store.snapshot.screens[0].svg);assert.equal(objects.length,1);assert.equal(objects[0].id,id);assert.equal(objects[0].type,'rect');assert.equal(objects[0].attributes['data-stroke-edges'],'top');
 dispatch({type:'object.edit',objectId:id,attributes:{width:'100','stroke-opacity':'0.3','data-corners':'4,8,12,16'}});objects=svgObjects(store.snapshot.screens[0].svg);assert.equal(objects[0].attributes.width,'100');assert.equal(store.snapshot.screens[0].clips[0].objectId,id);
 assert.deepEqual(decodeProject(encodeProject(store.snapshot)),store.snapshot);
 const saved=store.snapshot;assert.throws(()=>dispatch({type:'object.edit',objectId:id,attributes:{'data-stroke-edges':'diagonal'}}),/edges/);assert.deepEqual(store.snapshot,saved);
 dispatch({type:'history.undo'});dispatch({type:'history.undo'});assert.deepEqual(store.snapshot.screens,before.screens);
});

test('directional rectangle duplicate remains one independent editable layer',()=>{
 const {store,dispatch,ids}=setup('<rect x="10" y="10" width="50" height="30" fill="none" stroke="#ff0000"/>');
 dispatch({type:'object.edit',objectId:ids[0],attributes:{'data-stroke-edges':'top'}});
 dispatch({type:'object.duplicate',objectIds:ids});const objects=svgObjects(store.snapshot.screens[0].svg);
 assert.equal(objects.length,2);assert.notEqual(objects[0].id,objects[1].id);assert.equal(objects[1].attributes['data-stroke-edges'],'top');
 dispatch({type:'object.edit',objectId:objects[1].id,attributes:{width:'80'}});assert.equal(svgObjects(store.snapshot.screens[0].svg)[0].attributes.width,'50');assert.equal(svgObjects(store.snapshot.screens[0].svg)[1].attributes.width,'80');
});
