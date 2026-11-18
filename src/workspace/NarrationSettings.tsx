import {useState} from 'react';
import {Button} from '../components/ui/button';
import {Modal} from '../components/ui/dialog';
import {captionEntrances,captionFonts,captionVariants,captionSize,captionStyleSchema,type CaptionStyle,type NarrationMix} from '../core/model';

export function NarrationSettings({mix,style,onApply}:{mix:NarrationMix,style:CaptionStyle,onApply:(style:CaptionStyle,mix?:NarrationMix)=>Promise<boolean>}){
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [failed,setFailed]=useState(false);
 const trigger=<Button variant="ghost" className="caption-action" aria-label="Narration settings" title="Caption and narration settings">Settings</Button>;
 return <Modal title="Project narration" trigger={trigger} open={open} onOpenChange={next=>{if(!busy){setFailed(false);setOpen(next);}}}>
  <form className="narration-settings" onSubmit={async event=>{
   event.preventDefault();
   const fields=new FormData(event.currentTarget);
   const next=captionStyleSchema.parse({font:fields.get('font'),variant:fields.get('variant'),size:Number(fields.get('size')),entrance:fields.get('entrance')});
   const nextMix={volume:Number(fields.get('volume')),muted:fields.has('muted')};
   const mixChanged=nextMix.volume!==mix.volume||nextMix.muted!==mix.muted;
   if(!mixChanged&&next.font===style.font&&next.variant===style.variant&&next.size===style.size&&next.entrance===style.entrance){setOpen(false);return;}
   setBusy(true);
   try{
    const applied=await onApply(next,mixChanged?nextMix:undefined);
    setFailed(!applied);
    if(applied)setOpen(false);
   }finally{setBusy(false);}
  }}>
   <fieldset>
    <legend>Captions</legend>
    <div className="narration-caption-fields">
     <label>Font<select name="font" defaultValue={style.font}>{captionFonts.map(font=><option key={font}>{font}</option>)}</select></label>
     <label>Style<select name="variant" defaultValue={style.variant}>{captionVariants.map(variant=><option key={variant}>{variant}</option>)}</select></label>
     <label>Size (%)<input name="size" type="number" min={captionSize.min} max={captionSize.max} step={1} required defaultValue={style.size}/></label>
     <label>Entrance<select name="entrance" defaultValue={style.entrance}>{captionEntrances.map(entrance=><option key={entrance}>{entrance}</option>)}</select></label>
    </div>
   </fieldset>
   <fieldset>
    <legend>Audio</legend>
    <div className="narration-audio-fields">
     <label>Volume (%)<input name="volume" type="number" min={0} max={100} step={1} required defaultValue={mix.volume}/></label>
     <label className="narration-mute"><input name="muted" type="checkbox" defaultChecked={mix.muted}/>Mute narration</label>
    </div>
   </fieldset>
   {failed&&<p role="alert" className="error">Couldn’t save narration settings</p>}
   <div className="dialog-actions"><Button type="submit" reserveLabel="Applying…" disabled={busy}>{busy?'Applying…':'Apply'}</Button></div>
  </form>
 </Modal>;
}
