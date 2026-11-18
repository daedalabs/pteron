import { existsSync } from 'node:fs';
import { join,dirname } from 'node:path';
import {pythonRuntime} from './python-runtime.mjs';

/** Optional TeX stays outside project packages; portable launchers extract elsewhere. */
export function texRuntime(root:string,resources:string,portableDirectory?:string,configured=process.env.PTERON_TEX_ROOT){
 const candidates=[configured,join(resources,'tex'),join(root,'.tools','miktex')];
 if(portableDirectory){
  candidates.push(join(portableDirectory,'tex'));
  let directory=portableDirectory;
  for(let level=0;level<4;level++){
   candidates.push(join(directory,'.tools','miktex'));
   const parent=dirname(directory);if(parent===directory)break;directory=parent;
  }
 }
 return candidates.find(candidate=>candidate&&['latex.exe','dvisvgm.exe'].every(name=>existsSync(join(candidate,'texmfs','install','miktex','bin','x64',name))));
}
export function workerRuntime(root:string,resources:string,packaged:boolean):{executable:string;args:string[];cwd:string;env?:NodeJS.ProcessEnv}{
 const bundled=join(resources,'worker','pteron-worker.exe');
 if(existsSync(bundled))return {executable:bundled,args:[] as string[],cwd:resources};
 if(packaged)throw new Error('The installed rendering engine is missing. Repair or reinstall pteron; your project is preserved.');
 return {...pythonRuntime(root),args:[join(root,'renderer','worker.py')]};
}
