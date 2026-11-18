export type SnapBounds={x:number,y:number,width:number,height:number};
export type ArtworkGuide={axis:'x'|'y',position:number,from:number,to:number,kind:'align'|'gap'};

export function snapArtwork(moving:SnapBounds,others:SnapBounds[],canvas:SnapBounds,tolerance:number){
 const guides:ArtworkGuide[]=[];const result={x:0,y:0,guides};
 for(const axis of ['x','y'] as const){
  const size=axis==='x'?'width':'height',cross=axis==='x'?'y':'x',crossSize=axis==='x'?'height':'width';
  const points=[moving[axis],moving[axis]+moving[size]/2,moving[axis]+moving[size]];
  const candidates:{delta:number,guide:ArtworkGuide}[]=[];
  for(const box of [canvas,...others])for(const target of [box[axis],box[axis]+box[size]/2,box[axis]+box[size]])for(const point of points){const delta=target-point;if(Math.abs(delta)<=tolerance)candidates.push({delta,guide:{axis,position:target,from:Math.min(box[cross],moving[cross]),to:Math.max(box[cross]+box[crossSize],moving[cross]+moving[crossSize]),kind:'align'}});}
  const row=others.filter(box=>Math.min(box[cross]+box[crossSize],moving[cross]+moving[crossSize])>Math.max(box[cross],moving[cross])).sort((a,b)=>a[axis]-b[axis]);
  for(let index=0;index<row.length-1;index++){
   const left=row[index],right=row[index+1],gap=right[axis]-left[axis]-left[size];if(gap<0)continue;
   const targets=[left[axis]-gap-moving[size],right[axis]+right[size]+gap];
   if(left[axis]+left[size]<=moving[axis]+tolerance&&right[axis]>=moving[axis]+moving[size]-tolerance)targets.push((left[axis]+left[size]+right[axis]-moving[size])/2);
   for(const target of targets){const delta=target-moving[axis];if(Math.abs(delta)<=tolerance)candidates.push({delta,guide:{axis:axis==='x'?'y':'x',position:moving[cross]+moving[crossSize]/2,from:Math.min(left[axis],target),to:Math.max(right[axis]+right[size],target+moving[size]),kind:'gap'}});}
  }
  candidates.sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta)||Number(a.guide.kind==='gap')-Number(b.guide.kind==='gap'));
  if(candidates[0]){result[axis]=candidates[0].delta;guides.push(candidates[0].guide);}
 }
 return result;
}
