import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {ProjectStore} from '../src/core/store';
import {newProject,uuid} from '../src/core/model';
import {svgObjects,parseSvg} from '../src/core/svg';
import {matrix} from '../src/core/shape-transform';
import svgpath from 'svgpath';
import {saveProject,loadProject} from '../src/core/persistence';
import assert from 'node:assert/strict';
import {initializeGeometry} from '../src/core/vector-kit';
await initializeGeometry();
// Original artwork; only ordinary editable SVG and supported shared motion presets.
const story=[
 {name:'Spark',title:'A small idea.',frames:150},
 {name:'Build',title:'Made of possibilities.',frames:150},
 {name:'Rhythm',title:'Find your rhythm.',frames:150},
 {name:'Together',title:'Better together.',frames:150},
 {name:'Story',title:'One flowing story.',frames:150},
 {name:'Bloom',title:'Let it grow.',frames:157},
];
const narration=JSON.parse(await readFile('examples/media/narration.json','utf8')).scenes as {script:string,frames:number,captions:{text:string,start:number,end:number}[]}[];
const scenes=story.map((scene,i)=>({...scene,script:narration[i].script,captions:narration[i].captions}));
const captionCount=scenes.reduce((n,scene)=>n+scene.captions.length,0);
await mkdir('artifacts/example',{recursive:true});
const request=resolve('artifacts/example/captions-request.json');
await writeFile(request,JSON.stringify({operation:'captions',texts:[...scenes.flatMap(s=>s.captions.map(c=>c.text)),...scenes.map(s=>s.title)],width:1080,height:1920}));
const vectors=await new Promise<string[]>((done,reject)=>{const child=spawn(resolve('.venv/Scripts/python.exe'),[resolve('renderer/worker.py'),request],{cwd:resolve('artifacts/example'),windowsHide:true});let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);child.on('error',reject);child.on('close',code=>{const value=out.split('\n').filter(l=>l.startsWith('PTERON:')).map(l=>JSON.parse(l.slice(7))).find(v=>v.result);if(code||!value)reject(new Error(out+err));else done(value.result.vectors);});});
const store=new ProjectStore(newProject('Small idea, big motion',1080,1920));
const dispatch=(command:unknown)=>store.dispatch(command,store.snapshot.revision,'sample');
const ink='#183C35',paper='#F5F0DF',lime='#D9EC75',green='#3D8060',orange='#EF8354';
const rect=(x:number,y:number,w:number,h:number,fill:string,rx=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const circle=(x:number,y:number,r:number,fill:string)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const g=(name:string,body:string)=>`<g data-name="${name}">${body}</g>`;
const seed=(x=540,y=900)=>g('Seed',`<path d="M ${x} ${y-110} C ${x+170} ${y-50} ${x+130} ${y+120} ${x} ${y+120} C ${x-130} ${y+120} ${x-170} ${y-50} ${x} ${y-110} Z" fill="${orange}"/>`);
const leaf=(name:string,x:number,y:number,flip=false)=>g(name,`<path d="M ${x} ${y} C ${x+(flip?-180:180)} ${y-200} ${x+(flip?-210:210)} ${y-30} ${x} ${y} Z" fill="${green}"/>`);
const flower=(name:string,x:number,y:number)=>g(name,rect(x-13,y,26,330,green,13)+leaf('Left leaf',x,y+210,true)+leaf('Right leaf',x,y+270)+g('Petals',circle(x-74,y,78,orange)+circle(x+74,y,78,orange)+circle(x,y-74,78,orange)+circle(x,y+74,78,orange))+g('Flower center',circle(x,y,61,lime)));
const art=[
 g('Orbit',`<circle cx="540" cy="900" r="285" fill="none" stroke="${green}" stroke-width="3"/>`)+seed()+g('Satellite',circle(825,900,24,lime))+g('Spark',`<path d="M 300 620 L 314 662 L 356 676 L 314 690 L 300 732 L 286 690 L 244 676 L 286 662 Z" fill="${lime}"/>`),
 g('Stem',rect(527,840,26,380,green,13))+leaf('Left leaf',540,1060,true)+leaf('Right leaf',540,1130)+g('Bud',circle(540,815,99,orange))+g('Ground',rect(210,1260,660,6,green,3)),
 g('Rhythm line',rect(180,1100,720,4,green,2))+g('Beat one',circle(300,970,80,orange))+g('Beat two',rect(455,890,160,160,lime,32))+g('Beat three',`<path d="M 780 868 L 880 1050 L 680 1050 Z" fill="${paper}"/>`),
 flower('Flower',540,835)+g('Ground',rect(210,1260,660,6,green,3)),
 g('Connection',`<path d="M 260 1100 C 370 850 710 1250 820 850" fill="none" stroke="${green}" stroke-width="9"/>`)+g('First scene',rect(155,960,210,240,orange,28)+circle(260,1040,36,lime))+g('Next scene',rect(435,890,210,240,lime,28)+rect(500,955,80,80,ink,14))+g('Final scene',rect(715,760,210,240,paper,28)+circle(820,840,36,orange)),
 g('Garden',flower('Tall flower',540,800)+g('Small flower left',`<g transform="translate(110 460) scale(.6)">${flower('Left bloom',300,670)}</g>`)+g('Small flower right',`<g transform="translate(450 520) scale(.55)">${flower('Right bloom',620,610)}</g>`))+g('Ground',rect(150,1270,780,7,green,3)),
];
for(let i=0;i<scenes.length;i++){
 const data=await readFile(`examples/media/scene-${i+1}.wav`);const audioFrames=Math.ceil((data.length-44)/data.readUInt32LE(28)*30);
 assert.equal(audioFrames,narration[i].frames);
 const scene={...scenes[i],frames:audioFrames};if(i)dispatch({type:'screen.add',name:scene.name});const screenId=store.snapshot.screens[i].id;
 const inherited=svgObjects(store.snapshot.screens[i].svg).filter(o=>!o.parentId).map(o=>o.id);
 if(inherited.length)dispatch({type:'object.deleteMany',screenId,objectIds:inherited});
 dispatch({type:'screen.update',screenId,name:scene.name,duration:scene.frames});
 // Lettering is ordinary editable vector paths; native artwork text is not renderable yet.
 const lettering=(vector:string,x:number,y:number,maxWidth:number,height:number)=>{
  const box=vector.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number),scale=Math.min(maxWidth/box[2],height/box[3]);
  const positioned=vector.replace(/^[^>]+/,root=>root.replace(/\s(x|y|width|height)="[^"]*"/g,(whole,key)=>({x,y,width:box[2]*scale,height:box[3]*scale} as any)[key]===undefined?whole:` ${key}="${({x,y,width:box[2]*scale,height:box[3]*scale} as any)[key]}"`));
  const paths=parseSvg(positioned).elements.filter(el=>el.localName==='path').map(el=>svgpath(el.getAttribute('d')!).matrix(matrix(el)).toString()).join(' ');
  return `<path data-name="Lettering" d="${paths}" fill="${paper}"/>`;
 };
 dispatch({type:'artwork.import',screenId,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">${g('Background',rect(0,0,1080,1920,ink))}${g('Title',lettering(vectors[captionCount+i],100,255,880,88))}${art[i]}</svg>`});
 const objects=svgObjects(store.snapshot.screens[i].svg);
 const clip=(name:string,preset:string,start:number,duration:number,extra={})=>{const objectId=objects.find(o=>o.name===name)?.id;assert.ok(objectId,`Missing ${name}`);dispatch({type:'clip.put',screenId,clip:{id:uuid(),objectId,preset,start:Math.round(start*scene.frames/scenes[i].frames),duration:Math.max(1,Math.round(duration*scene.frames/scenes[i].frames)),...extra}});};
 clip('Title','Slide',0,18,{direction:'up',intensity:.35});
 if(i===0){clip('Seed','Pop',0,22);clip('Seed','Rock',40,30);clip('Satellite','Rotate',20,80);clip('Spark','Pop',16,18);clip('Seed','Shrink',102,18);}
 if(i===1){clip('Stem','Slide',0,24,{direction:'down'});clip('Left leaf','Pop',20,22);clip('Right leaf','Pop',30,22);clip('Bud','Pop',44,24);clip('Bud','Pulse',80,30);}
 if(i===2){for(const [j,name] of ['Beat one','Beat two','Beat three'].entries()){clip(name,'Pop',j*12,20);clip(name,'Bounce',50+j*12,32);}}
 if(i===3){clip('Flower','Slide',0,24,{direction:'up'});clip('Petals','Rotate',26,70);clip('Left leaf','Rock',45,35);clip('Flower center','Pulse',80,30);}
 if(i===4){for(const [j,name] of ['First scene','Next scene','Final scene'].entries()){clip(name,'Slide',j*18,25,{direction:'right'});clip(name,'Pulse',75+j*12,22);} }
 if(i===5){clip('Garden','Slide',0,26,{direction:'up'});clip('Small flower left','Pop',20,25);clip('Small flower right','Pop',36,25);clip('Tall flower','Rock',65,45);}
 dispatch({type:'narration.script',screenId,script:scene.script});


 dispatch({type:'screen.update',screenId,duration:scene.frames});
 const captionOffset=scenes.slice(0,i).reduce((n,s)=>n+s.captions.length,0);
 scene.captions.forEach((caption,j)=>dispatch({type:'caption.put',screenId,caption:{id:uuid(),...caption,draft:false,vector:vectors[captionOffset+j],vectorText:caption.text}}));
}
const totalFrames=store.snapshot.screens.reduce((n,s)=>n+s.duration,0);
dispatch({type:'timeline.audio.attach',mediaId:'sample-narration',name:'Narration.wav',mime:'audio/wav',data:(await readFile('examples/media/narration.wav')).toString('base64'),start:0,duration:totalFrames});
const path=resolve('examples/small-idea.pteron');await saveProject(path,store.snapshot);assert.deepEqual(await loadProject(path),store.snapshot);
await writeFile('examples/small-idea.json',JSON.stringify({name:store.snapshot.name,screens:store.snapshot.screens.map(s=>({name:s.name,frames:s.duration,clips:s.clips.length,captions:s.captions.length,captionCues:s.captions.map(({text,start,end})=>({text,start,end})),script:s.narration.script})),totalFrames:store.snapshot.screens.reduce((n,s)=>n+s.duration,0),source:'Original editable vector showcase. Original script, Ava neural narration via Microsoft Edge speech. No external project or provider service required.'},null,2));
console.log(path);
