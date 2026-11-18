import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute,delimiter} from 'node:path';
import {workerRuntime,texRuntime} from '../electron/runtime';
import {pythonRuntime} from '../electron/python-runtime.mjs';
test('installed worker runs without uv or a PATH Python and missing installs fail clearly',async()=>{const root=await mkdtemp(join(tmpdir(),'pteron-runtime-'));assert.throws(()=>workerRuntime(root,root,true),/Repair or reinstall/);await mkdir(join(root,'worker'));await writeFile(join(root,'worker','pteron-worker.exe'),'fixture');const runtime=workerRuntime(root,root,true);assert.ok(isAbsolute(runtime.executable));assert.deepEqual(runtime.args,[]);});

test('source worker uses local Python with project dependencies and optional PDF TeX',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pteron-source-runtime-'));
 const venv=join(root,'.venv','Scripts'),packages=join(root,'.venv','Lib','site-packages');
 const managed=join(root,'.tools','python','cpython-3.12-windows-x86_64-none');
 const pdf=join(root,'.tools','pteron-pdf-vector');
 await mkdir(venv,{recursive:true});await writeFile(join(venv,'python.exe'),'fixture');
 assert.equal(workerRuntime(root,root,false).executable,join(venv,'python.exe'));
 await mkdir(managed,{recursive:true});await writeFile(join(managed,'python.exe'),'fixture');
 assert.equal(workerRuntime(root,root,false).executable,join(venv,'python.exe'));
 await mkdir(packages,{recursive:true});
 await mkdir(join(pdf,'pymupdf'),{recursive:true});await writeFile(join(pdf,'pymupdf','__init__.py'),'fixture');
 const runtime=workerRuntime(root,root,false);
 assert.equal(runtime.executable,join(managed,'python.exe'));
 assert.deepEqual(runtime.env?.PYTHONPATH?.split(delimiter).slice(0,3),[root,packages,pdf]);
 assert.equal(runtime.env?.PTERON_SOURCE_PDF_TEX,'1');
 assert.throws(()=>workerRuntime(root,root,true),/Repair or reinstall/);
});

test('portable TeX discovery uses the original launcher location and honors configuration',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pteron-tex-')),resources=join(root,'extracted','resources'),portable=join(root,'checkout','artifacts','standalone');
 const tex=join(root,'checkout','.tools','miktex'),configured=join(root,'custom-tex');
 const install=async(directory:string)=>{const bin=join(directory,'texmfs','install','miktex','bin','x64');await mkdir(bin,{recursive:true});await writeFile(join(bin,'latex.exe'),'fixture');await writeFile(join(bin,'dvisvgm.exe'),'fixture');};
 assert.equal(texRuntime(resources,resources,portable,''),undefined);
 await install(tex);assert.equal(texRuntime(resources,resources,portable,''),tex);
 await install(configured);assert.equal(texRuntime(resources,resources,portable,configured),configured);
 assert.equal(texRuntime(resources,resources,portable,join(root,'missing')),tex);
 const adjacent=join(portable,'tex');await install(adjacent);assert.equal(texRuntime(resources,resources,portable,''),adjacent);
 const embedded=join(resources,'tex');await install(embedded);assert.equal(texRuntime(resources,resources,portable,''),embedded,'Embedded compiler wins over adjacent/development copies');
});

test('versioned managed Python works without a virtual-environment launcher and explicit overrides fail clearly',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pteron-versioned-python-'));
 await mkdir(join(root,'.venv','Lib','site-packages'),{recursive:true});
 for(const version of ['3.12.9','3.12.14','3.13.1']){
  const directory=join(root,'.tools','python',`cpython-${version}-windows-x86_64-none`);
  await mkdir(directory,{recursive:true});await writeFile(join(directory,'python.exe'),'fixture');
 }
 const expected=join(root,'.tools','python','cpython-3.12.14-windows-x86_64-none','python.exe');
 assert.equal(pythonRuntime(root,'').executable,expected);
 assert.equal(workerRuntime(root,root,false).executable,expected);
 assert.throws(()=>pythonRuntime(root,'missing.exe'),/PTERON_PYTHON/);
 assert.equal(pythonRuntime(root,expected).executable,expected);
 assert.throws(()=>workerRuntime(root,root,true),/Repair or reinstall/);
});
