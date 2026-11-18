import {mkdir,readFile,writeFile,readdir,copyFile,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root='artifacts/standalone-notices';await mkdir(root,{recursive:true});
const paths=execFileSync(process.execPath,[join(process.env.ProgramFiles??'C:/Program Files','nodejs/node_modules/npm/bin/npm-cli.js'),'ls','--omit=dev','--all','--parseable'],{encoding:'utf8'}).trim().split(/\r?\n/).slice(1);
const inventory=[];
for(const path of paths){const p=JSON.parse(await readFile(join(path,'package.json'),'utf8'));const files=(await readdir(path)).filter(name=>/licen[sc]e|copying|copyright|notice/i.test(name));const target=join(root,'npm',p.name.replaceAll('/','_'));await mkdir(target,{recursive:true});for(const file of files){try{await copyFile(join(path,file),join(target,file));}catch{}}inventory.push({name:p.name,version:p.version,license:p.license,files});}
for(const name of ['fontkit','brotli','dfa']){const source=join('node_modules',name),target=join(root,'npm',name);for(const file of (await readdir(source)).filter(file=>/^readme|^package\.json$/i.test(file)))await copyFile(join(source,file),join(target,file));}
await cp('node_modules/brotli/dec',join(root,'npm/brotli/decoder-source'),{recursive:true});
await cp('licenses/fontkit-runtime',join(root,'fontkit-runtime'),{recursive:true});
await writeFile(join(root,'npm-inventory.json'),JSON.stringify(inventory,null,2));
for(const name of ['LICENSE','LICENSES.chromium.html'])await copyFile(join('node_modules/electron/dist',name),join(root,`Electron-${name}`));
await copyFile('THIRD_PARTY_NOTICES.md',join(root,'THIRD_PARTY_NOTICES.md'));
await writeFile(join(root,'CANDIDATE-STATUS.txt'),'Local standalone development candidate. Not a signed or audited release. Native codec, font and third-party notices are retained under resources/notices. Equations are rendered in-process via mathjax-full (Apache-2.0); exact npm and Python package inventories and upstream notices are retained.');
