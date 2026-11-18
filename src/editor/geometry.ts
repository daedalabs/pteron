import {applyMotion} from './apply-motion';
import type { Pose } from '../core/motion';
declare global{interface Window{sampleSvg:(source:string,poses:Record<string,Pose>,captions?:string[])=>string;}}
window.sampleSvg=(source,poses,captions=[])=>{
 const root=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;
 document.body.replaceChildren(document.importNode(root,true));const svg=document.querySelector('svg')!;
 applyMotion(svg,poses);
 for(const caption of captions){const element=new DOMParser().parseFromString(caption,'image/svg+xml').documentElement;svg.appendChild(document.importNode(element,true));}
 return new XMLSerializer().serializeToString(svg);
};
