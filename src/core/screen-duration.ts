import type {Screen} from './model';
import {layerSpans} from './motion';
import {svgObjects} from './svg';

/** Untimed artwork keeps its original hold; extending another layer cannot inflate it. */
export function contentDuration(screen:Screen):number{
 const all=svgObjects(screen.svg);
 const objects=all.filter(object=>!all.some(child=>child.parentId===object.id)||screen.lifetimes[object.id]!==undefined||screen.clips.some(clip=>clip.objectId===object.id));
 const ends=[...objects.flatMap(object=>layerSpans(screen,object.id).map(span=>span.end)),...screen.clips.map(clip=>clip.start+clip.duration),...screen.captions.filter(caption=>!caption.sourceCaptionId).map(caption=>caption.end),...screen.cues.map(cue=>cue.frame),...(screen.narration.mediaId&&!screen.narration.timeline?[screen.narration.duration??0]:[])];
 return Math.max(1,...ends,objects.length||ends.some(Boolean)?1:screen.durationBase??screen.duration);
}
