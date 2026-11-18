import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RecoveryHistory } from '../electron/recovery-history';
import { ProjectService } from '../src/core/service';
import { newProject } from '../src/core/model';
import { saveProject } from '../src/core/persistence';

test('index roundtrip in a temp userData directory and newest-first listing', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'pteron-recovery-roundtrip-'));
 const history = new RecoveryHistory(join(dir, 'recoveries'));
 await history.load();

 const p1 = newProject('First');
 const p2 = newProject('Second');
 p2.width = 1920;

 const e1 = await history.saveSnapshot(p1, 'autosave');
 assert.ok(e1);
 // Ensure distinct savedAt timestamp
 await new Promise(r => setTimeout(r, 15));
 const e2 = await history.saveSnapshot(p2, 'replace', 'C:/projects/demo.pteron');
 assert.ok(e2);

 const { versions, warning } = await history.list();
 assert.equal(warning, undefined);
 assert.equal(versions.length, 2);
 assert.equal(versions[0].id, e2.id);
 assert.equal(versions[0].name, 'Second');
 assert.equal(versions[0].reason, 'replace');
 assert.equal(versions[0].width, 1920);
 assert.equal(versions[0].missing, false);
 assert.equal(versions[1].id, e1.id);
 assert.equal(versions[1].name, 'First');
 assert.equal(versions[1].reason, 'autosave');
 assert.equal(versions[1].missing, false);

 // Re-open history from disk
 const reopened = new RecoveryHistory(join(dir, 'recoveries'));
 await reopened.load();
 const reopenedList = await reopened.list();
 assert.equal(reopenedList.versions.length, 2);
 assert.equal(reopenedList.versions[0].id, e2.id);
 assert.equal(reopenedList.versions[1].id, e1.id);

 const detail = await reopened.read(e2.id);
 assert.equal(detail.name, 'Second');
 assert.ok(typeof detail.svg === 'string');
});

test('pruning by count, by age and by byte ceiling, and protecting restoring entry', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'pteron-recovery-prune-'));

 // 1. Prune by count (maxVersions = 3)
 const historyCount = new RecoveryHistory(join(dir, 'by-count'), 3);
 const entries: any[] = [];
 for (let i = 0; i < 5; i++) {
  const p = newProject(`Project ${i}`);
  p.width = 300 + i;
  await new Promise(r => setTimeout(r, 10));
  entries.push(await historyCount.saveSnapshot(p, 'autosave'));
 }
 const countList = await historyCount.list();
 assert.equal(countList.versions.length, 3);
 assert.equal(countList.versions[0].name, 'Project 4');
 assert.equal(countList.versions[1].name, 'Project 3');
 assert.equal(countList.versions[2].name, 'Project 2');
 // Verify pruned files are removed from disk
 const pruned0Exists = await stat(join(dir, 'by-count', `${entries[0].id}.pteron`)).then(() => true, () => false);
 assert.equal(pruned0Exists, false);

 // 2. Prune by age (maxAgeMs = 500ms)
 const historyAge = new RecoveryHistory(join(dir, 'by-age'), 10, 500);
 const oldP = newProject('Old project');
 const oldEntry = await historyAge.saveSnapshot(oldP, 'autosave');
 assert.ok(oldEntry);
 await new Promise(r => setTimeout(r, 600));
 const newP = newProject('New project');
 newP.width = 800;
 await historyAge.saveSnapshot(newP, 'autosave');
 const ageList = await historyAge.list();
 assert.equal(ageList.versions.length, 1);
 assert.equal(ageList.versions[0].name, 'New project');

 // 3. Prune by byte ceiling
 // Each minimal project is ~1.5 - 2 KB when zipped. Let's set maxBytes to 4000.
 const historyBytes = new RecoveryHistory(join(dir, 'by-bytes'), 10, 100000, 4000);
 const b1 = await historyBytes.saveSnapshot(newProject('Byte 1'), 'autosave');
 await new Promise(r => setTimeout(r, 10));
 const pByte2 = newProject('Byte 2');
 pByte2.width = 640;
 const b2 = await historyBytes.saveSnapshot(pByte2, 'autosave');
 await new Promise(r => setTimeout(r, 10));
 const pByte3 = newProject('Byte 3');
 pByte3.width = 800;
 const b3 = await historyBytes.saveSnapshot(pByte3, 'autosave');
 const bytesList = await historyBytes.list();
 const totalBytes = bytesList.versions.reduce((sum, v) => sum + v.bytes, 0);
 assert.ok(totalBytes <= 4000, `Total bytes ${totalBytes} should be <= 4000`);
 assert.ok(bytesList.versions.some(v => v.id === b3!.id));

 // 4. Protect restoringId from being pruned
 const historyProtect = new RecoveryHistory(join(dir, 'protect'), 1);
 const pFirst = newProject('First to restore');
 const firstEntry = await historyProtect.saveSnapshot(pFirst, 'autosave');
 await new Promise(r => setTimeout(r, 10));
 const pSecond = newProject('Second replacement');
 pSecond.width = 999;
 // Pass restoringId = firstEntry.id to saveSnapshot
 await historyProtect.saveSnapshot(pSecond, 'replace', undefined, firstEntry!.id);
 const protectList = await historyProtect.list();
 // Both should be kept because firstEntry was protected!
 assert.ok(protectList.versions.some(v => v.id === firstEntry!.id));
 assert.ok(protectList.versions.some(v => v.id === pSecond.name || v.width === 999));
});

test('dedupe of identical content and distinct snapshot after real edit', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'pteron-recovery-dedupe-'));
 const history = new RecoveryHistory(join(dir, 'recoveries'));
 const project = newProject('Dedupe test');

 const first = await history.saveSnapshot(project, 'autosave');
 assert.ok(first);
 assert.equal((await history.list()).versions.length, 1);

 // Identical content -> returns null, entries count unchanged
 const duplicate = await history.saveSnapshot(project, 'autosave');
 assert.equal(duplicate, null);
 assert.equal((await history.list()).versions.length, 1);

 // Real edit -> distinct snapshot created
 const edited = { ...project, name: 'Renamed dedupe' };
 const second = await history.saveSnapshot(edited, 'autosave');
 assert.ok(second);
 assert.notEqual(second.id, first.id);
 assert.equal((await history.list()).versions.length, 2);
});

test('corrupt index.json, missing package file (missing:true), and rejected traversal/unknown ids', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'pteron-recovery-corrupt-'));
 const recDir = join(dir, 'recoveries');
 const history = new RecoveryHistory(recDir);

 const entry = await history.saveSnapshot(newProject('Sample'), 'autosave');
 assert.ok(entry);
 assert.equal((await history.list()).versions[0].missing, false);

 // Missing file
 await unlink(join(recDir, `${entry.id}.pteron`));
 const missingList = await history.list();
 assert.equal(missingList.versions[0].missing, true);
 await assert.rejects(history.read(entry.id), /missing or unreadable/);

 // Rejected traversal / invalid IDs
 await assert.rejects(history.read('../traversal'), /Invalid recovery ID/);
 await assert.rejects(history.read('..\\traversal'), /Invalid recovery ID/);
 await assert.rejects(history.read('valid-id-but-does-not-exist'), /not found/);
 await assert.rejects(history.delete('../traversal'), /Invalid recovery ID/);
 await assert.rejects(history.delete('nonexistent-id'), /not found/);

 // Corrupt index.json
 await writeFile(join(recDir, 'index.json'), '{"not an array": true}');
 const damagedHistory = new RecoveryHistory(recDir);
 await damagedHistory.load();
 assert.ok(damagedHistory.warning);
 assert.match(damagedHistory.warning, /could not be read/);
 assert.deepEqual((await damagedHistory.list()).versions, []);
});

test('index/snapshot write failure does not throw and sets warning', async () => {
 // Pointing to an invalid file path as directory
 const blockedDir = join(tmpdir(), 'blocked-file.tmp');
 await writeFile(blockedDir, 'blocking-file');
 const history = new RecoveryHistory(join(blockedDir, 'sub'));

 const result = await history.saveSnapshot(newProject('Blocked'), 'autosave');
 assert.equal(result, null);
 assert.ok(history.warning);
 assert.match(history.warning, /could not be saved/);

 // Editing commands in ProjectService do not fail even if recovery history fails
 const service = new ProjectService(join(tmpdir(), 'test-recovery.pteron'), history);
 const commandResult = await service.call('command', {
  revision: 0,
  command: { type: 'project.rename', name: 'Safe edit' },
 });
 assert.equal(commandResult.name, 'Safe edit');
});

test('recovery.delete removes exactly one version and leaves recovery.pteron intact', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'pteron-recovery-delete-'));
 const recoveryPath = join(dir, 'recovery.pteron');
 await saveProject(recoveryPath, newProject('Active recovery'));

 const history = new RecoveryHistory(join(dir, 'recoveries'));
 const p1 = newProject('Version 1');
 const p2 = newProject('Version 2');
 p2.width = 640;

 const e1 = await history.saveSnapshot(p1, 'autosave');
 await new Promise(r => setTimeout(r, 10));
 const e2 = await history.saveSnapshot(p2, 'autosave');

 assert.equal((await history.list()).versions.length, 2);
 await history.delete(e1!.id);

 const remaining = await history.list();
 assert.equal(remaining.versions.length, 1);
 assert.equal(remaining.versions[0].id, e2!.id);

 // Verify file e1 deleted
 assert.equal(await stat(join(dir, 'recoveries', `${e1!.id}.pteron`)).then(() => true, () => false), false);
 // Verify file e2 intact
 assert.equal(await stat(join(dir, 'recoveries', `${e2!.id}.pteron`)).then(() => true, () => false), true);
 // Verify recovery.pteron untouched
 assert.equal(await stat(recoveryPath).then(() => true, () => false), true);
});

test('recover without an id still produces exactly the old revision/result shape', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'pteron-recover-shape-'));
 const recoveryPath = join(dir, 'recovery.pteron');
 const service = new ProjectService(recoveryPath);

 await service.call('command', { revision: 0, command: { type: 'project.rename', name: 'Step 1' } });
 await service.call('command', { revision: 1, command: { type: 'project.rename', name: 'Step 2' } });

 // recover without id
 const recovered = await service.call('recover', { revision: 2 });
 assert.equal(recovered.revision, 3);
 assert.equal(service.store.snapshot.revision, 3);

 // compact recover without id
 const compactRecover = await service.call('recover', { revision: 3, response: 'compact' }, 'mcp');
 assert.deepEqual(compactRecover, { revision: 4 });
});
