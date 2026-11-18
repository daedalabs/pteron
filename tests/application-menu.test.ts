import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rename,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ProjectService} from '../src/core/service';
import {loadProject} from '../src/core/persistence';
import {RecentProjects} from '../electron/recent-projects';
import {applicationMenus,defaultMenuState,flattenActions,filterActions} from '../src/workspace/application-actions';

test('save status follows actual saved content through edits, undo, redo, Save As and reopen',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pteron-document-')),service=new ProjectService(join(root,'recovery.pteron'));
 const command=(command:unknown)=>service.call('command',{command,revision:service.store.snapshot.revision});
 const original=join(root,'original.pteron'),copy=join(root,'copy.PTERON');
 assert.equal(service.document.dirty,true);const history=service.store.history;
 await service.call('save',{path:original});assert.deepEqual(service.store.history,history);assert.equal(service.document.dirty,false);
 await command({type:'project.rename',name:'Edited'});assert.equal(service.document.dirty,true);
 await command({type:'history.undo'});assert.equal(service.document.dirty,false,'revision changes alone do not make content dirty');
 await command({type:'history.redo'});assert.equal(service.document.dirty,true);
 await service.call('save',{path:copy});assert.deepEqual({...service.document},{path:copy,dirty:false});assert.notEqual((await loadProject(original)).name,'Edited');
 assert.equal((await loadProject(copy)).name,'Edited');
 await command({type:'project.create',name:'New',width:320,height:240});assert.deepEqual({...service.document},{path:undefined,dirty:true});
 await service.call('open',{path:copy,revision:service.store.snapshot.revision});assert.equal(service.document.dirty,false);
 await command({type:'project.rename',name:'Keep this work'});await mkdir(join(root,'blocked.pteron'));
 await assert.rejects(service.call('save',{path:join(root,'blocked.pteron')}));assert.deepEqual({...service.document},{path:copy,dirty:true});assert.equal(service.store.snapshot.name,'Keep this work');
});

test('recent projects persist separately, deduplicate, cap entries and retain missing-file information',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pteron-recents-')),path=join(root,'recent.json'),recent=new RecentProjects(path);await recent.load();
 const project=join(root,'demo.pteron');await writeFile(project,'package');await recent.remember(project,'Demo');await recent.remember(project,'Renamed');
 assert.equal((await recent.list()).length,1);assert.equal((await recent.list())[0].missing,false);
 await rename(project,join(root,'moved.pteron'));assert.equal((await recent.list())[0].missing,true);assert.equal(recent.find(project).name,'Renamed');
 for(let i=0;i<15;i++)await recent.remember(join(root,`project-${i}.pteron`),`Project ${i}`);
 const reopened=new RecentProjects(path);await reopened.load();assert.equal((await reopened.list()).length,12);assert.equal((await reopened.list())[0].name,'Project 14');
 await assert.rejects(reopened.remove(join(root,'unlisted.pteron')),/no longer/);assert.equal((await reopened.list()).length,12);
 await reopened.remove((await reopened.list())[0].path);assert.equal((await reopened.list()).length,11);await reopened.clear();assert.deepEqual(JSON.parse(await readFile(path,'utf8')),[]);
 await writeFile(path,'{"invalid":true}');const damaged=new RecentProjects(path);await damaged.load();assert.deepEqual(await damaged.list(),[]);assert.match(damaged.warning!,/could not be read/);
});

test('menu availability respects locked artwork, shared history, scene boundaries and text editing',()=>{
 const lookup=(state=defaultMenuState)=>new Map(flattenActions(applicationMenus(state)).map(action=>[action.id,action]));
 const blank=lookup();assert.equal(blank.get('edit.undo')?.enabled,false);assert.equal(blank.get('scene.delete')?.enabled,false);assert.equal(blank.get('scene.continue')?.enabled,false);
 const locked=lookup({...defaultMenuState,selectionCount:2,locked:true,canUndo:true,sceneCount:2});assert.equal(locked.get('edit.copy')?.enabled,true);assert.equal(locked.get('edit.cut')?.enabled,false);assert.equal(locked.get('edit.group')?.enabled,false);assert.equal(locked.get('edit.undo')?.enabled,true);
 const text=lookup({...defaultMenuState,textEditing:true});for(const id of ['undo','redo','copy','cut','paste'])assert.equal(text.get(`edit.${id}`)?.enabled,true);
 const results=filterActions(flattenActions(applicationMenus(defaultMenuState)),'view fit');assert.deepEqual(results.map(action=>action.id),['view.fit']);
 assert.equal(flattenActions(applicationMenus(defaultMenuState)).filter(action=>action.id==='example.open').length,1);
});
