import type {Element} from '@xmldom/xmldom';
export type Matrix=[number,number,number,number,number,number];
export const identity:Matrix=[1,0,0,1,0,0];
export const mul=(a:Matrix,b:Matrix):Matrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function inverse(m:Matrix):Matrix{const d=m[0]*m[3]-m[1]*m[2];if(Math.abs(d)<1e-12)throw new Error('Selection has a singular transform');return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];}
export function transform(value:string):Matrix{
 let result:Matrix=identity;const pattern=/([a-zA-Z]+)\s*\(([^)]*)\)/g;let end=0;
 for(const match of value.matchAll(pattern)){
  if(value.slice(end,match.index).trim().replaceAll(',',''))throw new Error('Unsupported SVG transform');end=match.index!+match[0].length;
  const values=match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);if(!values.every(Number.isFinite))throw new Error('Invalid SVG transform');
  const [a=0,b=0,c=0]=values;let next:Matrix;
  if(match[1]==='matrix'&&values.length===6)next=values as Matrix;
  else if(match[1]==='translate'&&[1,2].includes(values.length))next=[1,0,0,1,a,b];
  else if(match[1]==='scale'&&[1,2].includes(values.length))next=[a,0,0,values.length===1?a:b,0,0];
  else if(match[1]==='rotate'&&[1,3].includes(values.length)){const r=a*Math.PI/180;next=mul(mul([1,0,0,1,b,c],[Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),0,0]),[1,0,0,1,-b,-c]);}
  else if(match[1]==='skewX'&&values.length===1)next=[1,0,Math.tan(a*Math.PI/180),1,0,0];
  else if(match[1]==='skewY'&&values.length===1)next=[1,Math.tan(a*Math.PI/180),0,1,0,0];
  else throw new Error('Unsupported SVG transform');result=mul(result,next);
 }
 if(value.slice(end).trim())throw new Error('Unsupported SVG transform');return result;
}
function number(el:Element,name:string,fallback=0){const raw=el.getAttribute(name);if(raw===null||raw==='')return fallback;const n=Number(raw.replace(/px$/,''));if(!Number.isFinite(n))throw new Error(`Unsupported ${name} units in selection`);return n;}
function viewport(el:Element):Matrix{
 const x=number(el,'x'),y=number(el,'y'),box=el.getAttribute('viewBox');if(!box)return [1,0,0,1,x,y];
 const v=box.trim().split(/[\s,]+/).map(Number);if(v.length!==4||!v.every(Number.isFinite)||v[2]<=0||v[3]<=0)throw new Error('Invalid SVG viewport');
 const w=number(el,'width',v[2]),h=number(el,'height',v[3]),ratio=el.getAttribute('preserveAspectRatio')||'xMidYMid meet';
 if(ratio==='none')return [w/v[2],0,0,h/v[3],x-v[0]*w/v[2],y-v[1]*h/v[3]];
 if(!/^x(Min|Mid|Max)Y(Min|Mid|Max)( (meet|slice))?$/.test(ratio))throw new Error('Unsupported viewport alignment');
 const scale=ratio.endsWith('slice')?Math.max(w/v[2],h/v[3]):Math.min(w/v[2],h/v[3]);
 const ax=ratio.includes('xMax')?1:ratio.includes('xMid')?.5:0,ay=ratio.includes('YMax')?1:ratio.includes('YMid')?.5:0;
 return [scale,0,0,scale,x+(w-v[2]*scale)*ax-v[0]*scale,y+(h-v[3]*scale)*ay-v[1]*scale];
}
export function matrix(el:Element|null):Matrix{if(!el||el.nodeType!==1)return identity;if(/(?:^|;)\s*transform\s*:/.test(el.getAttribute('style')||''))throw new Error('CSS-transformed selection geometry is unsupported');return mul(matrix(el.parentNode as Element),mul(transform(el.getAttribute('transform')||''),el.localName==='svg'?viewport(el):identity));}
