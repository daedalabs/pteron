import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeGeometry,vectorKit} from '../src/core/vector-kit';
import {editSvg,importSvg,parseSvg,svgObjects,commitSvg} from '../src/core/svg';
import {matrix} from '../src/core/shape-transform';
import svgpath from 'svgpath';
import {encodeProject,decodeProject} from '../src/core/persistence';
import {newProject} from '../src/core/model';
import {combineSelection,editSelection} from '../src/core/selection';
await initializeGeometry();
const source=(body='<rect x="20" y="20" width="100" height="60" fill="none" stroke="#ff0000" stroke-width="10"/>')=>importSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">${body}</svg>`);
function stroke(xml:string){
 const el=parseSvg(xml).elements.find(el=>el.getAttribute('data-shape-part')==='stroke-0')!;assert.ok(el);
 const p=vectorKit().FromSVGString(svgpath(el.getAttribute('d')!).matrix(matrix(el)).toString());try{return {bounds:p.computeTightBounds(),el};}finally{p.delete();}
}
test('inside, center and outside borders preserve exact visible extent and project identity',()=>{
 for(const [alignment,expected] of [['inside',[20,20,120,80]],['center',[15,15,125,85]],['outside',[10,10,130,90]]] as const){
  const before=source(),id=svgObjects(before)[0].id,after=editSvg(before,id,{'data-stroke-alignment':alignment,'data-stroke-scaling':'fixed'});
  const objects=svgObjects(after);assert.equal(objects.length,1);assert.equal(objects[0].id,id);assert.equal(objects[0].type,'rect');
  const b=stroke(after).bounds;assert.deepEqual([b.fLeft,b.fTop,b.fRight,b.fBottom],expected);
  const project=newProject('Border',400,300);project.screens[0].svg=after;assert.deepEqual(decodeProject(encodeProject(project)),project);
 }
});
test('individual sides remain independently editable at all three alignments',()=>{
 let xml=source(),id=svgObjects(xml)[0].id;
 xml=editSvg(xml,id,{'data-stroke-alignment':'outside','data-stroke-edges':'top','data-stroke-scaling':'fixed'});
 let b=stroke(xml).bounds;assert.deepEqual([b.fLeft,b.fTop,b.fRight,b.fBottom],[20,10,120,20]);
 xml=editSvg(xml,id,{'data-stroke-edges':'right'});b=stroke(xml).bounds;assert.deepEqual([b.fLeft,b.fTop,b.fRight,b.fBottom],[120,20,130,80]);
 xml=editSvg(xml,id,{'data-stroke-edges':'','data-stroke-alignment':'inside'});assert.equal(parseSvg(xml).elements.filter(el=>el.getAttribute('data-shape-part')?.startsWith('stroke-')).length,0);
});
test('nonuniform transforms retain border width and inherited color updates',()=>{
 let xml=source('<g stroke="#ff0000" stroke-width="10"><rect x="20" y="20" width="100" height="60" fill="none"/></g>');
 const [parent,rect]=svgObjects(xml);
 xml=editSvg(xml,rect.id,{'data-stroke-alignment':'center','data-stroke-scaling':'fixed'});
 xml=editSvg(xml,parent.id,{transform:'translate(50 20) scale(2 .5)'});
 let b=stroke(xml).bounds;assert.deepEqual([b.fLeft,b.fTop,b.fRight,b.fBottom],[85,25,295,65]);
 xml=editSvg(xml,parent.id,{stroke:'#0000ff'});assert.equal(stroke(xml).el.getAttribute('fill'),'#0000ff');
 assert.equal(svgObjects(xml).find(el=>el.id===rect.id)!.attributes.width,'100');
});
test('circle, ellipse, closed path and multiple dash intervals stay editable',()=>{
 for(const shape of ['<circle cx="80" cy="80" r="40"/>','<ellipse cx="80" cy="80" rx="50" ry="30"/>','<path d="M20 20H120V80H20Z"/>','<polygon points="20,20 120,20 80,100"/>']){
  let xml=source(shape.replace('/>',' fill="none" stroke="#ff0000" stroke-width="6" stroke-dasharray="3 2 7 4"/>'));const object=svgObjects(xml)[0];
  xml=editSvg(xml,object.id,{'data-stroke-alignment':'inside','data-stroke-scaling':'fixed'});
  assert.equal(svgObjects(xml).length,1);assert.equal(svgObjects(xml)[0].type,object.type);assert.ok(stroke(xml).el.getAttribute('d'));
  xml=editSvg(xml,object.id,{'data-stroke-alignment':'outside'});assert.equal(svgObjects(xml)[0].id,object.id);
 }
});
test('invalid alignment and open-path alignment fail without replacing source',()=>{
 const xml=source('<path d="M20 20L120 80" stroke="#ff0000"/>'),id=svgObjects(xml)[0].id;
 assert.throws(()=>editSvg(xml,id,{'data-stroke-alignment':'inside'}),/closed/);
 assert.throws(()=>editSvg(xml,id,{'data-stroke-alignment':'middle'}),/alignment/);
});
test('canvas commits retain chosen width when the editor scales native stroke attributes',()=>{
 const before=source(),object=svgObjects(before)[0],doc=parseSvg(before).doc;
 const rect=doc.getElementsByTagName('rect')[0];rect.setAttribute('width','200');rect.setAttribute('stroke-width','20');
 const after=commitSvg(doc.toString(),before);assert.equal(svgObjects(after)[0].attributes['stroke-width'],'10');
 const b=stroke(after).bounds;assert.deepEqual([b.fLeft,b.fTop,b.fRight,b.fBottom],[15,15,225,85]);assert.equal(svgObjects(after)[0].id,object.id);
});
test('aligned stroked shapes retain Boolean editing and refuse ambiguous directional borders',()=>{
 let xml=source('<rect x="20" y="20" width="80" height="60" fill="#22aa66" stroke="#ff0000" stroke-width="10"/><rect x="80" y="20" width="80" height="60" fill="#22aa66" stroke="#ff0000" stroke-width="10"/>');
 const ids=svgObjects(xml).map(object=>object.id);
 for(const id of ids)xml=editSvg(xml,id,{'data-stroke-alignment':'outside','data-stroke-scaling':'fixed'});
 const combined=combineSelection(xml,ids,'union'),objects=svgObjects(combined);assert.equal(objects.length,1);assert.equal(objects[0].id,ids[0]);assert.equal(objects[0].type,'path');assert.equal(objects[0].attributes['data-stroke-alignment'],'outside');
 xml=editSvg(xml,ids[0],{'data-stroke-edges':'top'});assert.throws(()=>combineSelection(xml,ids,'union'),/all border sides/);
});
test('bulk paint toggles restore each selected shape color independently',()=>{
 let xml=source('<rect width="10" height="10" fill="#ff0000"/><rect x="20" width="10" height="10" fill="#0000ff"/>');const ids=svgObjects(xml).map(object=>object.id);
 xml=editSelection(xml,ids,{fill:'none','data-fill-disabled-paint':'#000000'});assert.ok(svgObjects(xml).every(object=>object.attributes.fill==='none'));
 xml=editSelection(xml,ids,{fill:'#000000','data-fill-disabled-paint':null});assert.deepEqual(svgObjects(xml).map(object=>object.attributes.fill),['#ff0000','#0000ff']);
});
test('transforming an imported native stroked group also preserves project border width',()=>{
 let xml=source('<g><rect x="20" y="20" width="100" height="60" fill="none" stroke="#ff0000" stroke-width="10"/></g>');const [group,rect]=svgObjects(xml);
 xml=editSvg(xml,group.id,{transform:'scale(2 .5)'});const b=stroke(xml).bounds;
 assert.deepEqual([b.fLeft,b.fTop,b.fRight,b.fBottom],[35,5,245,45]);assert.equal(svgObjects(xml).find(object=>object.id===rect.id)!.type,'rect');
});
test('disabled inherited paint returns to the current parent color',()=>{
 let xml=source('<g fill="#ff0000"><rect width="40" height="40"/></g>');const [parent,child]=svgObjects(xml);
 assert.equal(child.presentation.fill,'#ff0000');
 xml=editSvg(xml,child.id,{fill:'none','data-fill-disabled-paint':'inherit'});xml=editSvg(xml,parent.id,{fill:'#0000ff'});
 assert.equal(svgObjects(xml).find(object=>object.id===child.id)!.parentPaints.fill,'#0000ff');
 xml=editSvg(xml,child.id,{fill:null,'data-fill-disabled-paint':null});assert.equal(svgObjects(xml).find(object=>object.id===child.id)!.presentation.fill,'#0000ff');
});
