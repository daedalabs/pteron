import {presetsAtFps} from './motion';
import type {Clip,Screen} from './model';
import type {Bounds} from './selection';

export function motionDefaults(preset:Clip['preset'],box:Bounds,screen:Screen,fps:number){
 const base=presetsAtFps(fps).find(item=>item.name===preset)!;
 const size=Math.max(box.width,box.height),factor=size>400?1.25:size<32?.85:1;
 const duration=Math.max(1,Math.min(Math.round(base.duration*factor),screen.durationBase??screen.duration));
 const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
 let intensity=1;
 if(preset==='Pulse'||preset==='Press')intensity=size>300?.6:.8;
 if(preset==='Rise'||preset==='Sink')intensity=clamp(box.height*.5,12,80)/80;
 if(preset==='Slide'||preset==='Slide out')intensity=clamp(Math.max(box.width,box.height)*.6,40,180)/120;
 if(preset==='Drift'||preset==='Drift out')intensity=clamp(size*.15,8,32)/32;
 if(preset==='Bounce')intensity=clamp(box.height*.4,8,40)/40;
 if(preset==='Shake')intensity=clamp(box.width*.08,2,12)/12;
 return {duration,intensity:Number(intensity.toFixed(4))};
}
