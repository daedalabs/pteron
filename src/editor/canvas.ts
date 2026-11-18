import SvgCanvas from '@svgedit/svgcanvas';
import { loadProjectSvg, saveProjectSvg } from './svg-adapter.js';
import {applyMotion} from './apply-motion';
import type { Pose } from '../core/motion';
import {toolShortcut} from '../workspace/tool-shortcuts';
import {snapArtwork,type ArtworkGuide} from '../core/artwork-snapping';
const canvas=new SvgCanvas(document.querySelector('#editor'),{dimensions:[1080,1920],baseUnit:'px',imgPath:'./',initFill:{color:'7c6cf2',opacity:1},initStroke:{color:'none',opacity:1,width:0},initOpacity:1,text:{font_size:48,font_family:'Arial',stroke_width:0},show_outside_canvas:false});
let gestureBefore:string|null=null;
let activeScreen='',loading=false,base='',playing=false,zoom=1,width=1080,height=1920;
// Match the editor-only backing to an opaque artboard background. Fractional
// fitted sizes otherwise antialias black artwork against SVG-Edit's white page.
function syncCanvasBacking(){
 const root=canvas.getSvgContent(),backing=document.querySelector('#canvasBackground>rect');if(!root||!backing)return;
 // SVG-Edit reports painted bounds for this nested SVG, which can be just the
 // first small rectangle. Use the viewport corners instead of the artwork box.
 const ctm=root.getScreenCTM();if(!ctm)return;
 const view=root.viewBox.baseVal,left=view.width>0?view.x:0,top=view.height>0?view.y:0;
 const origin=new DOMPoint(left,top).matrixTransform(ctm),corner=new DOMPoint(left+(view.width||width),top+(view.height||height)).matrixTransform(ctm);
 const area={left:Math.min(origin.x,corner.x),top:Math.min(origin.y,corner.y),right:Math.max(origin.x,corner.x),bottom:Math.max(origin.y,corner.y)};let color='#ffffff';
 for(const rect of root.querySelectorAll('rect')){
  const style=getComputedStyle(rect),box=rect.getBoundingClientRect();if(style.fill==='none'||Number(style.fillOpacity)!==1||Number(rect.getAttribute('rx')||0)!==0||Number(rect.getAttribute('ry')||0)!==0)continue;
  const matrix=rect.getScreenCTM();if(!matrix||Math.abs(matrix.b)>1e-6||Math.abs(matrix.c)>1e-6||box.left>area.left+.01||box.top>area.top+.01||box.right<area.right-.01||box.bottom<area.bottom-.01)continue;
  let opaque=true;for(let node:Element|null=rect;node&&node!==root.parentElement;node=node.parentElement){const css=getComputedStyle(node);if(css.display==='none'||css.visibility!=='visible'||Number(css.opacity)!==1||css.clipPath!=='none'||css.maskImage!=='none'||css.filter!=='none'){opaque=false;break;}if(node.localName==='svg'){const clip=node.getBoundingClientRect();if(clip.left>area.left+.01||clip.top>area.top+.01||clip.right<area.right-.01||clip.bottom<area.bottom-.01){opaque=false;break;}}}
  if(opaque&&/^rgb\([^/]+\)$/.test(style.fill))color=style.fill;
 }
 backing.setAttribute('fill',color);backing.setAttribute('stroke','none');document.body.style.background=color;document.documentElement.style.background=color;parent.postMessage({pteron:true,type:'backing',data:{color}},'*');
}
const fit=()=>{canvas.setZoom(zoom);canvas.updateCanvas(width*zoom,height*zoom);syncCanvasBacking();for(const el of canvas.getSelectedElements().filter(Boolean))canvas.selectorManager.requestSelector(el).resize();};
const send=(type:string,data:unknown={})=>parent.postMessage({pteron:true,type,data},'*');
// SVG-Edit requires a host-owned input for its text cursor and keyboard editing.
// Keep the draft local until editing ends, so authoritative reloads do not steal
// focus between keystrokes. The completed edit uses the normal artwork command.
const textInput=document.createElement('textarea');
textInput.setAttribute('aria-label','Edit canvas text');
textInput.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
document.body.append(textInput);
canvas.textActions.setInputElem(textInput);
let textDraft=false;
textInput.addEventListener('input',()=>{textDraft=true;canvas.setTextContent(textInput.value);});
textInput.addEventListener('keydown',event=>{if(event.key==='Escape'||event.key==='Enter'&&!event.shiftKey){event.preventDefault();canvas.textActions.toSelectMode();}});
textInput.addEventListener('blur',()=>queueMicrotask(()=>{
 if(canvas.getCurrentMode()==='textedit')canvas.textActions.toSelectMode();
 if(textDraft&&!loading&&!playing){textDraft=false;const svg=saveProjectSvg(canvas);if(svg!==base){base=svg;send('change',{svg});}}
}));
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())&&!(event.target as Element).closest('input,textarea,[contenteditable="true"]')){event.preventDefault();event.stopImmediatePropagation();send('history',{redo:event.shiftKey||event.key.toLowerCase()==='y'});}},true);
document.addEventListener('keydown',event=>{const mode=toolShortcut(event);if(mode){event.preventDefault();event.stopImmediatePropagation();send('tool',{mode});}},true);
window.addEventListener('keydown',event=>{
 if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||(event.target as Element).closest('input,textarea,[contenteditable="true"]'))return;
 const direction:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},delta=direction[event.key];
 if(!delta)return;const ids=canvas.getSelectedElements().filter(Boolean).map((element:Element)=>element.id);if(!ids.length)return;
 event.preventDefault();event.stopImmediatePropagation();const step=event.shiftKey?10:1;send('nudge',{ids,x:delta[0]*step,y:delta[1]*step});
},true);

const cursorStyle=document.createElement('style');document.head.appendChild(cursorStyle);
const hitStyle=document.createElement('style');hitStyle.textContent='#editor #svgcontent :is(rect,circle,ellipse,path,line,polygon,polyline){pointer-events:visiblePainted!important} #editor text,#editor [data-equation-id]{pointer-events:bounding-box!important} #editor #svgcontent .pteron-canvas-background{pointer-events:none!important}';document.head.appendChild(hitStyle);
function toolCursor(mode:string){
 const drawing=['rect','ellipse','path','text'].includes(mode);
 const symbols:Record<string,string>={rect:'<rect x="17" y="17" width="12" height="10" rx="1"/>',ellipse:'<ellipse cx="23" cy="22" rx="6" ry="5"/>',path:'<path d="m17 28 4-12 10-3-3 10Z"/>',text:'<path d="M18 17h12m-6 0v13m-4 0h8"/>'};
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" fill="none"><path d="M1 10h18M10 1v18" stroke="white" stroke-width="3"/><g stroke="#171923" stroke-width="1.5"><path d="M1 10h18M10 1v18"/>${symbols[mode]??''}</g></svg>`;
 const cursor=drawing?`url("data:image/svg+xml,${encodeURIComponent(svg)}") 10 10, crosshair`:'default';
 cursorStyle.textContent=drawing?`#editor,#editor svg,#editor svg *{cursor:${cursor}!important}`:'';
 document.documentElement.dataset.editorMode=mode;
}
canvas.bind('changed',()=>{if(canvas.getCurrentMode()==='textedit'){textDraft=true;return;}if(!loading&&!playing&&gestureBefore===null){base=saveProjectSvg(canvas);send('change',{svg:base});send('selected',{ids:canvas.getSelectedElements().filter(Boolean).map((element:Element)=>element.id)});}});
canvas.bind('selected',(_window:unknown,elems:Element[])=>{const text=elems.find(el=>el?.localName==='text');if(text&&document.activeElement!==textInput)textInput.value=text.textContent??'';if(!loading&&!playing)send('selected',{ids:elems.filter(Boolean).map(e=>e.id)});});
window.addEventListener('message',event=>{
 if(event.source!==parent||!event.data?.pteron)return;
 const {type,data}=event.data;
 try{
  if(type==='release')finishGesture(new MouseEvent('mouseup',{clientX:data.clientX,clientY:data.clientY,button:0,buttons:0}));
  if(type==='snap'){snapping=Boolean(data.enabled);guideColor=data.color;clearGuides();}
  if(type==='paint-defaults'){for(const [key,value] of Object.entries(data))canvas.setCurProperties(key,value);}
  if(type==='viewport'){width=data.width;height=data.height;zoom=data.zoom;fit();}
  if(type==='load'){activeScreen=data.screenId??'';loading=true;playing=false;textDraft=false;base=data.svg;width=data.width;height=data.height;zoom=data.zoom;canvas.setResolution(width,height);loadProjectSvg(canvas,data.svg);canvas.selectorManager.getRubberBandBox().setAttribute('display','none');fit();loading=false;}
  if(type==='align'){if(canvas.getSelectedElements().filter(Boolean).some((el:Element)=>el.closest('[data-locked="true"]')))throw new Error('Object is locked');canvas.alignSelectedElements(data.direction,'page');}
  if(type==='mode'){canvas.setMode(data.mode);toolCursor(data.mode);}
  if(type==='select'){const ids:string[]=data.ids??[data.id];const elements=ids.map(id=>canvas.getSvgContent().querySelector(`[id="${CSS.escape(id)}"]`)).filter(Boolean);loading=true;canvas.selectOnly(elements);loading=false;}
  if(type==='preview'){
   if(data.screenId&&data.screenId!==activeScreen)return;
   loading=true;if(!playing){base=saveProjectSvg(canvas);playing=true;}loadProjectSvg(canvas,base);
   const root=canvas.getSvgContent();
   applyMotion(root,data.poses);
   fit();loading=false;
  }
  if(type==='restore'&&playing){loading=true;loadProjectSvg(canvas,base);fit();playing=false;loading=false;}
 }catch(error){loading=false;send('error',{message:error instanceof Error?error.message:String(error)});}
});
// Native selectors account for group transforms but omit nested SVG viewports.
// Correct their overlay coordinates without touching authored geometry.
const requestSelector=canvas.selectorManager.requestSelector.bind(canvas.selectorManager);
canvas.selectorManager.requestSelector=(...args:any[])=>{
 const selector=requestSelector(...args);
 if(!selector.viewportAware){
  const resize=selector.resize.bind(selector);
  selector.resize=(...values:any[])=>{
   resize(...values);
   const element=selector.selectedElement as SVGGraphicsElement,root=canvas.getSvgContent() as SVGGraphicsElement,parent=element.parentElement as unknown as SVGGraphicsElement;
   if(!element.closest('svg svg')||!parent?.getScreenCTM()||!root.getScreenCTM())return;
   let groups=new DOMMatrix();
   for(let node:Element|null=parent;node&&node!==root;node=node.parentElement)if(node.localName==='g'){
    const transforms=(node as SVGGraphicsElement).transform.baseVal;let matrix=new DOMMatrix();
    for(let i=0;i<transforms.numberOfItems;i++)matrix=matrix.multiply(transforms.getItem(i).matrix);
    groups=matrix.multiply(groups);
   }
   const parentMatrix=root.getScreenCTM()!.inverse().multiply(parent.getScreenCTM()!);
   const correction=new DOMMatrix().scale(zoom).multiply(parentMatrix).multiply(groups.inverse()).scale(1/zoom);
   selector.selectorGroup.setAttribute('transform',`${correction.toString()} ${selector.selectorGroup.getAttribute('transform')??''}`);
  };
  selector.viewportAware=true;selector.resize();
 }
 return selector;
};
// SVG-Edit's import/viewport wrappers are structural, never selectable artwork.
// Keep its native press/drag/release lifecycle, including child selection from Layers.
let restoredTarget:Element|null=null;
const originalMouseTarget=canvas.getMouseTarget.bind(canvas);
canvas.getMouseTarget=(event:MouseEvent)=>{
 if(restoredTarget)return restoredTarget;
 const target=event.target as Element;
 const root=canvas.getSvgContent();
 if(!target||!root.contains(target)||target.closest('#selectorParentGroup'))return originalMouseTarget(event);
 const authored=(el:Element)=>!el.parentElement?.closest('[data-stroke-edges],[data-stroke-shape]')&&['g','rect','circle','ellipse','path','text','line','polygon','polyline'].includes(el.localName)&&!el.classList.contains('layer')&&!el.classList.contains('pteron-editor-wrapper');
 let candidate:Element|null=target;
 while(candidate&&candidate!==root&&!authored(candidate))candidate=candidate.parentElement;
 if(!candidate||candidate===root||candidate.closest('[data-locked="true"],.pteron-canvas-background'))return canvas.getSvgRoot();
 if(event.ctrlKey||event.metaKey)return candidate;
 const selected=canvas.getSelectedElements().filter(Boolean) as Element[];
 const active=selected.find(el=>authored(el)&&(el===candidate||el.contains(candidate)));
 if(active)return active;
 let parent=candidate.parentElement;
 while(parent&&parent!==root){if(authored(parent))candidate=parent;parent=parent.parentElement;}
 return candidate;
};
// Pointer deltas must be measured in the selected object's parent coordinate
// system, including nested viewBox scales and transformed groups.
let dragParent:SVGGraphicsElement|null=null;
let snapping=true,guideColor='',snapDelta={x:0,y:0},dragOrigin:{x:number,y:number}|undefined;
const guideLayer=document.createElementNS('http://www.w3.org/2000/svg','svg');guideLayer.setAttribute('aria-hidden','true');guideLayer.id='pteron-snap-guides';guideLayer.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible';document.body.append(guideLayer);
function clearGuides(){guideLayer.replaceChildren();snapDelta={x:0,y:0};}
function showGuides(guides:ArtworkGuide[]){guideLayer.replaceChildren();for(const guide of guides){const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',String(guide.axis==='x'?guide.position:guide.from));line.setAttribute('x2',String(guide.axis==='x'?guide.position:guide.to));line.setAttribute('y1',String(guide.axis==='y'?guide.position:guide.from));line.setAttribute('y2',String(guide.axis==='y'?guide.position:guide.to));line.setAttribute('stroke',guideColor);line.setAttribute('stroke-width','1');line.setAttribute('stroke-dasharray',guide.kind==='gap'?'2 3':'4 3');guideLayer.append(line);}}
const originalMove=canvas.mouseMoveEvent;
canvas.getDOMContainer().removeEventListener('mousemove',originalMove);
canvas.getDOMContainer().addEventListener('mousemove',(event:MouseEvent)=>{
 originalMove(event);clearGuides();
 if(!snapping||event.altKey||!dragOrigin||Math.hypot(event.clientX-dragOrigin.x,event.clientY-dragOrigin.y)<4||gestureBefore===null||canvas.getCurrentMode()!=='select')return;
 const selected=canvas.getSelectedElements().filter(Boolean) as SVGGraphicsElement[];
 if(!selected.length)return;const root=canvas.getSvgContent() as SVGSVGElement;
 const boxes=selected.map(element=>element.getBoundingClientRect()),x=Math.min(...boxes.map(box=>box.x)),y=Math.min(...boxes.map(box=>box.y));
 const moving={x,y,width:Math.max(...boxes.map(box=>box.right))-x,height:Math.max(...boxes.map(box=>box.bottom))-y};
 const others=Array.from(root.querySelectorAll<SVGGraphicsElement>('rect,circle,ellipse,path,line,polygon,polyline,text,g')).filter(element=>!element.closest('defs,.pteron-canvas-background')&&!element.classList.contains('layer')&&!element.classList.contains('pteron-editor-wrapper')&&!selected.some(item=>item===element||item.contains(element)||element.contains(item))&&!element.closest('[display="none"],[visibility="hidden"]')).map(element=>element.getBoundingClientRect()).filter(box=>box.width>0&&box.height>0);
 const matrix=root.getScreenCTM();if(!matrix)return;const view=root.viewBox.baseVal;
 const origin=new DOMPoint(view.x,view.y).matrixTransform(matrix),corner=new DOMPoint(view.x+(view.width||width),view.y+(view.height||height)).matrixTransform(matrix);
 const viewport={x:Math.min(origin.x,corner.x),y:Math.min(origin.y,corner.y),width:Math.abs(corner.x-origin.x),height:Math.abs(corner.y-origin.y)};
 const result=snapArtwork(moving,others,viewport,6);snapDelta={x:result.x,y:result.y};showGuides(result.guides);
 if(result.x||result.y)originalMove(new MouseEvent('mousemove',{clientX:event.clientX+result.x,clientY:event.clientY+result.y,button:event.button,buttons:event.buttons,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey}));
});
let borderMatrices=new Map<string,DOMMatrix>();
const borderMatrix=(el:SVGGraphicsElement)=>el.getCTM();
function captureBorders(){borderMatrices=new Map();for(const el of canvas.getSvgContent().querySelectorAll('[data-stroke-shape]')){const m=borderMatrix(el);if(m)borderMatrices.set(el.id,m);}}
const rootCoordinates=canvas.getrootSctm.bind(canvas);
canvas.getrootSctm=()=>dragParent?.getScreenCTM()?.inverse()??rootCoordinates();
// Selection drags in this SVG-Edit version do not fire `changed` on release.
// Commit one complete gesture through the same application history as other edits.
document.addEventListener('mousedown',event=>{
 if(event.button===0){clearGuides();dragOrigin={x:event.clientX,y:event.clientY};}
 if(event.button===0&&playing&&canvas.getDOMContainer().contains(event.target)){
  const id=canvas.getMouseTarget(event)?.id;loading=true;loadProjectSvg(canvas,base);playing=false;fit();loading=false;restoredTarget=id?canvas.getSvgContent().querySelector(`[id="${CSS.escape(id)}"]`):null;restoredTarget??=canvas.getSvgRoot();setTimeout(()=>{restoredTarget=null;},0);send('edit-request');
 }
 if(event.button===0&&!loading&&!playing&&canvas.getCurrentMode()==='select'&&canvas.getDOMContainer().contains(event.target)){gestureBefore=saveProjectSvg(canvas);captureBorders();let target=canvas.getMouseTarget(event);if(target===canvas.selectorManager.selectorParentGroup)target=canvas.getSelectedElements().filter(Boolean)[0];dragParent=target&&canvas.getSvgContent().contains(target)?target.parentElement:null;}},true);
function finishGesture(event:MouseEvent){
 if(gestureBefore===null)return;
 const before=gestureBefore;
 const borders=new Map<string,{world:DOMMatrix,changed:boolean}>();
 for(const el of canvas.getSvgContent().querySelectorAll('[data-stroke-shape]')){const old=borderMatrices.get(el.id),now=borderMatrix(el);if(old&&now)borders.set(el.id,{world:now,changed:['a','b','c','d','e','f'].some(key=>Math.abs((now[key as keyof DOMMatrix] as number)-(old[key as keyof DOMMatrix] as number))>1e-8)});}
 if(canvas.getStarted()){canvas.mouseUpEvent(new MouseEvent('mouseup',{clientX:event.clientX+snapDelta.x,clientY:event.clientY+snapDelta.y,button:event.button,buttons:event.buttons,shiftKey:event.shiftKey,altKey:false}));event.stopPropagation();}
 const selectedIds=canvas.getSelectedElements().filter(Boolean).map((el:Element)=>el.id);
 const original=new DOMParser().parseFromString(before,'image/svg+xml');
 for(const [id,{world,changed}] of borders){
  const current=canvas.getSvgContent().querySelector(`[id="${CSS.escape(id)}"]`),source=original.getElementById(id),parent=current?.parentElement as SVGGraphicsElement|null;
  const parentMatrix=parent?.getCTM();if(!current||!source||!parentMatrix)continue;
  const restored=document.importNode(source,true),local=parentMatrix.inverse().multiply(world);
  if(changed)restored.setAttribute('transform',`matrix(${local.a} ${local.b} ${local.c} ${local.d} ${local.e} ${local.f})`);current.replaceWith(restored);
 }
 if(borders.size){const wasLoading=loading;loading=true;canvas.selectOnly(selectedIds.map((id:string)=>canvas.getSvgContent().querySelector(`[id="${CSS.escape(id)}"]`)).filter(Boolean),true);loading=wasLoading;}
 gestureBefore=null;dragParent=null;borderMatrices.clear();
 clearGuides();dragOrigin=undefined;
 const svg=saveProjectSvg(canvas);
 if(svg!==before){base=svg;send('change',{svg});}
 send('selected',{ids:canvas.getSelectedElements().filter(Boolean).map((el:Element)=>el.id)});
}
document.addEventListener('mouseup',finishGesture,true);
document.addEventListener('mousemove',event=>{if(gestureBefore!==null&&!(event.buttons&1))finishGesture(event);},true);
send('ready');
