import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {newProject} from '../src/core/model';
import {ProjectStore} from '../src/core/store';
import {saveProject,loadProject} from '../src/core/persistence';
import {workerRuntime} from '../electron/runtime';
import {videoLettering} from './video-lettering';
import {renderVideo} from './render-video';

const directory=resolve('artifacts/video-authoring-test');
await mkdir(directory,{recursive:true});
const vectors=await videoLettering(directory,['2','5'],64,64);
assert.equal(vectors.length,2);
assert.ok(vectors.every(vector=>vector.includes('<path')),'Labels remain editable vector geometry');
const store=new ProjectStore(newProject('Authoring tools acceptance',64,64));
const screenId=store.snapshot.screens[0].id;
store.dispatch({type:'artwork.import',screenId,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="8" y="12" width="16" height="20" fill="#000000"/></svg>'},store.snapshot.revision);
store.dispatch({type:'screen.update',screenId,duration:24},store.snapshot.revision);
const projectPath=resolve(directory,'fixture.pteron');
await saveProject(projectPath,store.snapshot);
assert.deepEqual(await loadProject(projectPath),store.snapshot);
await writeFile(resolve(directory,'storyboard.json'),JSON.stringify({totalFrames:24}));
await renderVideo(directory,'fixture');
const job=JSON.parse(await readFile(resolve(directory,'export-job.json'),'utf8'));
assert.equal(job.status,'completed');
const runtime=workerRuntime(resolve('.'),directory,false);
await promisify(execFile)(runtime.executable,['-c',[
 'import av,sys',
 'from scripts.video_verification import verify_stream,verify_timestamp',
 'movie=av.open(sys.argv[1])',
 'verify_stream(movie.streams.video[0],64,64,30)',
 'frames=list(movie.decode(video=0))',
 'assert len(frames)==24',
 'for index,frame in enumerate(frames): verify_timestamp(frame,index,30)',
].join('\n'),resolve(directory,'fixture.mp4')],{env:{...process.env,...runtime.env},windowsHide:true});
console.log('Video authoring acceptance passed: lettering, package roundtrip, Electron export and exact frame clock');
