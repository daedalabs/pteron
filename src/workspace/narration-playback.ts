/** Let the decoder run continuously between deliberate seeks. A one-frame drift
 * threshold repeatedly flushes buffered speech on ordinary scheduler jitter. */
export type NarrationClock={key:string,playing:boolean,active:boolean,lastCorrection:number};
export const narrationClock=():NarrationClock=>({key:'',playing:false,active:false,lastCorrection:-Infinity});
type AudioClock={currentTime:number,paused:boolean,play:()=>Promise<void>,pause:()=>void};
export function syncNarration(audio:AudioClock,clock:NarrationClock,input:{key:string,time:number,playing:boolean,active:boolean,fps:number},now:number){
 const {key,time,playing,active,fps}=input;
 const entering=key!==clock.key||!clock.playing||!clock.active;
 const drift=Math.abs(audio.currentTime-time);
 // Pause/scrub/start/source changes seek precisely. During uninterrupted speech,
 // correct only substantial drift, at most once per second.
 if(active&&drift>1/fps&&(!playing||entering||(drift>.2&&now-clock.lastCorrection>=1000))){audio.currentTime=time;clock.lastCorrection=now;}
 if(playing&&active){if(audio.paused)void audio.play().catch(()=>{});}else audio.pause();
 clock.key=key;clock.playing=playing;clock.active=active;
}
