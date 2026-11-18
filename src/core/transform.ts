export type Affine={a:number,b:number,c:number,d:number,e:number,f:number};
export type TransformParts={x:number,y:number,rotation:number,scaleX:number,scaleY:number,skew:number};
export function decomposeTransform(m:Affine):TransformParts|null{
 const scaleX=Math.hypot(m.a,m.b),det=m.a*m.d-m.b*m.c;
 if(scaleX<1e-12||Math.abs(det)<1e-12)return null;
 return {x:m.e,y:m.f,rotation:Math.atan2(m.b,m.a)*180/Math.PI,scaleX,scaleY:det/scaleX,skew:Math.atan((m.a*m.c+m.b*m.d)/det)*180/Math.PI};
}
export function composeTransform(p:TransformParts){return `translate(${p.x} ${p.y}) rotate(${p.rotation}) skewX(${p.skew}) scale(${p.scaleX} ${p.scaleY})`;}
