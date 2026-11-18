import { readFile, stat, unlink, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { encodeProject, loadProject, atomicWrite } from '../src/core/persistence';
import type { Project } from '../src/core/model';

const idRegex = /^[a-z0-9-]{1,64}$/;

export const recoveryEntrySchema = z.object({
 id: z.string().regex(idRegex),
 file: z.string().max(255).refine(f => !f.includes('/') && !f.includes('\\') && !f.includes('..') && f.endsWith('.pteron')),
 savedAt: z.string(),
 reason: z.string().max(50),
 name: z.string().max(200),
 width: z.number().int().positive(),
 height: z.number().int().positive(),
 fps: z.number().int().positive(),
 scenes: z.number().int().nonnegative(),
 frames: z.number().int().nonnegative(),
 bytes: z.number().int().nonnegative(),
 path: z.string().max(4096).optional(),
});

export type RecoveryEntry = z.infer<typeof recoveryEntrySchema>;
export type RecoveryListItem = Omit<RecoveryEntry, 'file'> & { missing: boolean };
export type RecoveryReadResult = RecoveryEntry & { svg: string };

/**
 * Bounded, versioned recovery history stored under userData/recoveries.
 * Local-only; never exposed through MCP or written to project packages.
 */
export class RecoveryHistory {
 private entries: RecoveryEntry[] = [];
 private writes: Promise<void> = Promise.resolve();
 private loaded = false;
 private lastContentKey?: string;
 warning: string | undefined;

 constructor(
  readonly directory: string,
  readonly maxVersions: number = 20,
  readonly maxAgeMs: number = 7 * 24 * 60 * 60 * 1000,
  readonly maxBytes: number = 512 * 1024 * 1024,
  public autosaveIntervalMs?: number,
 ) {}

 contentKey(project: Project): string {
  return createHash('sha256').update(JSON.stringify({ ...project, revision: 0 })).digest('hex');
 }

 private validateId(id: string): string {
  if (!idRegex.test(id)) {
   throw new Error(`Invalid recovery ID: ${id}`);
  }
  return id;
 }

 private resolvePath(id: string): string {
  this.validateId(id);
  const resolved = resolve(this.directory, `${id}.pteron`);
  const expectedDir = resolve(this.directory);
  if (dirname(resolved) !== expectedDir) {
   throw new Error('Path traversal detected');
  }
  return resolved;
 }

 async load(): Promise<void> {
  this.loaded = true;
  const indexPath = join(this.directory, 'index.json');
  try {
   const raw = await readFile(indexPath, 'utf8');
   this.entries = z.array(recoveryEntrySchema).max(100).parse(JSON.parse(raw));
   this.warning = undefined;
   if (this.entries.length > 0 && !this.lastContentKey) {
    try {
     const newest = await loadProject(join(this.directory, this.entries[0].file));
     this.lastContentKey = this.contentKey(newest);
    } catch {}
   }
  } catch (error) {
   if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    this.warning = 'Recovery history could not be read. A new history will be created.';
    this.entries = [];
   }
  }
 }

 private async ensureLoaded(): Promise<void> {
  if (!this.loaded) {
   await this.load();
  }
 }

 async list(): Promise<{ versions: RecoveryListItem[]; warning?: string }> {
  await this.ensureLoaded();
  await this.writes;
  const versions = await Promise.all(
   this.entries.map(async entry => {
    const filePath = join(this.directory, entry.file);
    const exists = await stat(filePath).then(f => f.isFile(), () => false);
    const { file: _file, ...rest } = entry;
    return { ...rest, missing: !exists };
   })
  );
  versions.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  return { versions, warning: this.warning };
 }

 async read(id: string): Promise<RecoveryReadResult> {
  await this.ensureLoaded();
  await this.writes;
  this.validateId(id);
  const entry = this.entries.find(e => e.id === id);
  if (!entry) {
   throw new Error(`Recovery version not found: ${id}`);
  }
  const filePath = this.resolvePath(id);
  let project: Project;
  try {
   project = await loadProject(filePath);
  } catch {
   throw new Error(`Recovery version file is missing or unreadable: ${id}`);
  }
  const svg = project.screens[0]?.svg ?? '';
  return { ...entry, svg };
 }

 async saveSnapshot(
  project: Project,
  reason: 'autosave' | 'replace' | string,
  path?: string,
  restoringId?: string,
 ): Promise<RecoveryEntry | null> {
  await this.ensureLoaded();
  const key = this.contentKey(project);
  if (key === this.lastContentKey && (reason === 'autosave' || (this.entries.length > 0 && this.entries[0].reason === reason))) {
   return null;
  }

  let bytes: Uint8Array;
  try {
   bytes = encodeProject(project);
  } catch {
   this.warning = 'The recovery version could not be encoded.';
   return null;
  }

  const id = randomUUID();
  const file = `${id}.pteron`;
  const filePath = join(this.directory, file);

  const entry: RecoveryEntry = {
   id,
   file,
   savedAt: new Date().toISOString(),
   reason,
   name: project.name.slice(0, 200),
   width: project.width,
   height: project.height,
   fps: project.fps,
   scenes: project.screens.length,
   frames: project.screens.reduce((sum, s) => sum + s.duration, 0),
   bytes: bytes.length,
   path: path ? resolve(path) : undefined,
  };

  this.writes = this.writes.catch(() => {}).then(async () => {
   await atomicWrite(filePath, bytes);
   this.entries = [entry, ...this.entries];
   await this.prune(restoringId);
   await this.persistIndex();
   this.lastContentKey = key;
   this.warning = undefined;
  });

  try {
   await this.writes;
   return entry;
  } catch {
   this.warning = 'The recovery version could not be saved.';
   return null;
  }
 }

 async delete(id: string): Promise<void> {
  await this.ensureLoaded();
  await this.writes;
  this.validateId(id);
  const entry = this.entries.find(e => e.id === id);
  if (!entry) {
   throw new Error(`Recovery version not found: ${id}`);
  }
  this.entries = this.entries.filter(e => e.id !== id);
  const filePath = this.resolvePath(id);
  this.writes = this.writes.catch(() => {}).then(async () => {
   await unlink(filePath).catch(() => {});
   await this.persistIndex();
  });
  try {
   await this.writes;
   this.warning = undefined;
  } catch {
   this.warning = 'The recovery version could not be removed from the index.';
  }
 }

 async prune(restoringId?: string): Promise<void> {
  const now = Date.now();
  const kept: RecoveryEntry[] = [];
  const toDelete: RecoveryEntry[] = [];

  const sorted = [...this.entries].sort(
   (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );

  let totalBytes = 0;
  for (const entry of sorted) {
   const isRestoring = entry.id === restoringId;
   const ageMs = now - new Date(entry.savedAt).getTime();
   const exceedsAge = ageMs > this.maxAgeMs;
   const exceedsCount = kept.length >= this.maxVersions;
   const exceedsBytes = totalBytes + entry.bytes > this.maxBytes;

   if (!isRestoring && (exceedsAge || exceedsCount || exceedsBytes)) {
    toDelete.push(entry);
   } else {
    kept.push(entry);
    totalBytes += entry.bytes;
   }
  }

  for (const entry of toDelete) {
   await unlink(join(this.directory, entry.file)).catch(() => {});
  }

  this.entries = kept;
 }

 async flush(): Promise<void> {
  await this.writes;
 }

 private async persistIndex(): Promise<void> {
  await mkdir(this.directory, { recursive: true });
  const bytes = new TextEncoder().encode(JSON.stringify(this.entries));
  await atomicWrite(join(this.directory, 'index.json'), bytes);
 }
}
