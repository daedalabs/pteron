import {motionDefaults} from '../core/motion-defaults';
import {useEffect,useState,useId,useRef,useLayoutEffect} from 'react';
import {evaluate} from '../core/motion';
import {blankSvg,type Clip,type Screen} from '../core/model';
import {applyMotion} from '../editor/apply-motion';

/** Tiny geometric samples use the same integer-frame evaluator as project playback. */
export function MotionPreview({preset,active,visible=true}:{preset:Clip['preset'],active:boolean,visible?:boolean}){
 const [frame,setFrame]=useState(16);
 const root=useRef<SVGSVGElement>(null),prefix=useId().replace(/\W/g,'_');
 useEffect(()=>{
  if(!active){setFrame(16);return;}
  const media=matchMedia('(prefers-reduced-motion: reduce)');let request=0,start=0;
  const tick=(now:number)=>{setFrame(Math.min(29,Math.floor(((now-start)%1500)/1000*30)));request=requestAnimationFrame(tick);};
  const sync=()=>{cancelAnimationFrame(request);if(media.matches){setFrame(16);return;}start=performance.now();request=requestAnimationFrame(tick);};
  sync();media.addEventListener('change',sync);
  return ()=>{cancelAnimationFrame(request);media.removeEventListener('change',sync);};
 },[preset,active]);
 useLayoutEffect(()=>{
  if(!root.current||!visible)return;
  const key=(name:string)=>`${prefix}_${name}`,source=key('source'),target=key('target');
  const rect=(name:string,x:number,width=56)=>`<rect id="${key(name)}" class="preview-shape" x="${x}" y="48" width="${width}" height="56"/>`;
  const terms=preset==='Match terms'||preset==='Highlight terms';
  const content=preset==='Stagger'?[rect('a',40),rect('b',132),rect('c',224)].join(''):terms?rect('a',40,36)+rect('b',100,36):rect('a',132);
  const receiver=preset==='Crossfade replacement'?`<circle id="${target}" class="preview-shape" cx="240" cy="76" r="28"/>`:terms?`<g id="${target}" data-equation-id="${key('targetEquation')}">${rect('ta',200,36)}${rect('tb',260,36)}</g>`:`<rect id="${target}" class="preview-shape" x="240" y="48" width="56" height="56"/>`;
  const replacement=['Smooth match','Crossfade replacement','Match terms'].includes(preset);
  const clip:Clip={id:key('clip'),objectId:source,preset,start:0,duration:30,repetitions:1,intensity:1,direction:'right',easing:'smooth',...(replacement?{targetObjectId:target}:{}),...(preset==='Smooth match'?{match:[1,0,0,1,108,0] as [number,number,number,number,number,number]}:{}),...(preset==='Stagger'?{stagger:7}:{}),...(preset==='Match terms'?{matches:[{objectId:key('a'),targetObjectId:key('ta'),matrix:[1,0,0,1,160,0]},{objectId:key('b'),targetObjectId:key('tb'),matrix:[1,0,0,1,160,0]}]}:{}),...(preset==='Highlight terms'?{terms:['x']}:{} )};
  const svg=blankSvg(320,152).replace('</svg>',`<g id="${source}" ${terms?`data-equation-id="${key('equation')}"`:''}>${content}</g>${replacement?receiver:''}</svg>`);
  const screen:Screen={id:key('scene'),name:'Preview',svg,duration:30,durationBase:30,clips:[clip],lifetimes:{},captions:[],cues:[],narration:{script:''},links:{},equations:terms?[{id:key('equation'),source:'x+y',svg:'',terms:{x:key('a'),y:key('b')}}]:[]};
  clip.intensity=motionDefaults(preset,{x:0,y:0,width:56,height:56},screen,30).intensity;
  const document=new DOMParser().parseFromString(svg,'image/svg+xml');root.current.replaceChildren(...Array.from(document.documentElement.childNodes).map(child=>root.current!.ownerDocument.importNode(child,true)));
  applyMotion(root.current,evaluate(screen,frame));
 },[preset,frame,visible,prefix]);
 return <svg ref={root} className="motion-preview" viewBox="0 0 320 152" aria-hidden="true"/>;
}
