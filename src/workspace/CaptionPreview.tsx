import {useEffect,useMemo,useState} from 'react';
import {captionLayout,captionPose,captionVectorKey,posedCaptionVector,previewCaptionTexts} from '../core/caption-style';
import type {Project,Screen} from '../core/model';

export function CaptionPreview({project,screen,frame,offset,zoom}:{project:Project,screen:Screen,frame:number,offset:number,zoom:number}){
 const [preview,setPreview]=useState<{layoutKey:string,vectors:Map<string,string>}>();
 const screenId=screen.id;
 const texts=useMemo(()=>project.captionStyle?previewCaptionTexts(project.screens,screenId):[],[project.captionStyle,project.screens,screenId]);
 const layoutKey=useMemo(()=>captionVectorKey(project,[]),[project.width,project.height,project.captionStyle]);
 const key=useMemo(()=>project.captionStyle&&texts.length?captionVectorKey(project,texts):undefined,[project.width,project.height,project.captionStyle,texts]);
 useEffect(()=>{
  if(!key)return;
  let cancelled=false;
  const timer=window.setTimeout(()=>{
   void window.pteron.call('caption.preview',{screenId}).then(result=>{
    if(!cancelled&&result.key===key&&result.vectors.length===texts.length){
     setPreview({layoutKey,vectors:new Map(texts.map((text,i)=>[text,result.vectors[i]]))});
    }
   },()=>{/* Browser text remains available while the renderer is unavailable. */});
  },120);
  return ()=>{cancelled=true;window.clearTimeout(timer);};
 },[key,layoutKey,screenId,texts]);
 const vectors=preview?.layoutKey===layoutKey?preview.vectors:undefined;
 const sources=useMemo(()=>new Map((project.timelineCaptions??[]).map(caption=>[caption.id,caption])),[project.timelineCaptions]);
 const {font,variant,glyphHeight}=captionLayout(project);
 return screen.captions.filter(c=>c.start<=frame&&frame<c.end&&c.text.trim()).map(caption=>{
  const pose=captionPose(project,caption,frame,offset,sources);
  const vector=vectors?.get(caption.text)??(!project.captionStyle&&caption.vectorText===caption.text?caption.vector:undefined);
  if(vector)return <svg className="caption-overlay" key={caption.id} viewBox={`0 0 ${project.width} ${project.height}`} dangerouslySetInnerHTML={{__html:posedCaptionVector(vector,pose,project.width,project.height)}}/>;
  const style=project.captionStyle?{fontFamily:font,fontWeight:variant==='Bold'?700:400,fontStyle:variant==='Italic'?'italic':'normal',fontSize:glyphHeight*zoom,opacity:pose.opacity,transform:`translateY(${pose.y*zoom}px) scale(${pose.scale})`}:undefined;
  return <div key={caption.id} className="caption-overlay caption-text" style={style}>{caption.text}</div>;
 });
}
