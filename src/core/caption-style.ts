import {captionSize,defaultCaptionStyle,type Project,type Screen} from './model';

type Caption=Screen['captions'][number];
type CaptionPose={opacity:number,y:number,scale:number};
const rest:CaptionPose={opacity:1,y:0,scale:1};

export function captionLayout(project:Pick<Project,'width'|'height'|'captionStyle'>){
 const style=project.captionStyle??defaultCaptionStyle;
 const glyphHeight=52*project.width/1080*style.size/captionSize.standard;
 return {font:style.font,variant:style.variant,width:project.width,height:project.height,glyphHeight:Math.min(glyphHeight,project.height*.18)};
}

export function captionVectorKey(project:Pick<Project,'width'|'height'|'captionStyle'>,texts:string[]){
 return JSON.stringify([captionLayout(project),texts]);
}

export function captionTexts(captions:Caption[]){
 return [...new Set(captions.map(caption=>caption.text).filter(text=>text.trim()))];
}

export function previewCaptionTexts(screens:Screen[],screenId:string){
 const index=screens.findIndex(screen=>screen.id===screenId);
 if(index<0)throw new Error('Scene not found');
 return captionTexts(screens.slice(Math.max(0,index-1),index+2).flatMap(screen=>screen.captions));
}

export function captionPose(project:Pick<Project,'captionStyle'|'fps'|'height'>,caption:Caption,frame:number,offset:number,sources:ReadonlyMap<string,Caption>):CaptionPose{
 const entrance=project.captionStyle?.entrance;
 if(!entrance||entrance==='None')return rest;
 const source=caption.sourceCaptionId?sources.get(caption.sourceCaptionId):undefined;
 const cue=source??caption;
 const elapsed=(source?frame+offset:frame)-cue.start;
 const frames=Math.max(1,Math.min(Math.round(project.fps*.18),Math.floor((cue.end-cue.start)/2)));
 const progress=Math.max(0,Math.min(1,(elapsed+1)/frames));
 const remaining=(1-progress)**2;
 if(entrance==='Fade')return {...rest,opacity:1-remaining};
 if(entrance==='Rise')return {...rest,y:project.height*.014*remaining};
 const scale=progress<.7?1.05-.23*(1-progress/.7)**2:1+.05*((1-progress)/.3)**2;
 return {...rest,scale};
}

export function captionTransform({y,scale}:CaptionPose,width:number,height:number){
 const x=width/2*(1-scale);
 const top=height*.81*(1-scale)+y;
 return `translate(${x} ${top}) scale(${scale})`;
}

export function posedCaptionVector(vector:string,pose:CaptionPose,width:number,height:number){
 if(pose.opacity===1&&pose.y===0&&pose.scale===1)return vector;
 return `<g xmlns="http://www.w3.org/2000/svg" opacity="${pose.opacity}" transform="${captionTransform(pose,width,height)}">${vector}</g>`;
}
