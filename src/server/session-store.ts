import { mkdir, open, readdir, unlink, rename, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateSession } from './session-format.js';
import type { SavedSession } from './session-format.js';

export interface SessionStore {
  acquire(): Promise<void>;
  load(): Promise<SavedSession | null>;
  write(state: SavedSession): Promise<void>;
  preserve(): Promise<void>;
  close(): Promise<void>;
}
function missing(error: unknown) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
function alive(pid: number) { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; } }

/** Local-disk adapter. Claims are unique, so stale cleanup never unlinks a replacement writer's lock. */
export function createFileSessionStore(directory: string): SessionStore {
  const root = resolve(directory), file = join(root, 'session.json'), claims = join(root, '.writers');
  const ownClaim = `${process.pid}-${randomUUID()}.lock`;
  let owned = false, closed = false, writing = false;
  async function acquire() {
    if (closed) throw new Error('Session store is closed.');
    if (owned) return;
    await mkdir(claims, { recursive: true, mode: 0o700 });
    const claim = await open(join(claims, ownClaim), 'wx', 0o600); await claim.close();
    try {
      for (const name of await readdir(claims)) {
        if (name === ownClaim) continue;
        const match = /^(\d+)-[a-f0-9-]+\.lock$/.exec(name);
        if (!match || alive(Number(match[1]))) throw new Error('Another process owns the session store. Stop it before starting this program.');
        await unlink(join(claims, name)).catch(error => { if (!missing(error)) throw error; });
      }
      owned = true;
    } catch (error) { await unlink(join(claims, ownClaim)); throw error; }
  }
  function check() { if (!owned || closed) throw new Error('Session store is not available.'); }
  async function load() {
    check();
    let handle;
    try {
      handle = await open(file, 'r');
      if ((await handle.stat()).size > 16 * 1024 * 1024) throw new Error('Session file exceeds the supported size.');
      return validateSession(JSON.parse(await handle.readFile('utf8')));
    } catch (error) { if (missing(error)) return null; throw error; }
    finally { await handle?.close(); }
  }
  async function write(state: SavedSession) {
    check(); if (writing) throw new Error('Concurrent session writes are forbidden.');
    const contents = JSON.stringify(validateSession(state));
    if (Buffer.byteLength(contents) > 16 * 1024 * 1024) throw new Error('Session file exceeds the supported size.');
    writing = true;
    const temporary = join(root, `session-${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(contents, 'utf8'); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, file);
      // POSIX directory sync makes the rename durable. Windows does not expose directory handles this way.
      if (process.platform !== 'win32') {
        const directoryHandle = await open(root, 'r');
        try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
      }
    } finally {
      writing = false;
      await unlink(temporary).catch(error => { if (!missing(error)) throw error; });
    }
  }
  async function preserve() {
    check();
    try {
      const backup = join(root, `session-before-reset-${Date.now()}-${randomUUID()}.json`);
      await copyFile(file, backup);
      const handle = await open(backup, 'r+');
      try { await handle.sync(); } finally { await handle.close(); }
    }
    catch (error) { if (!missing(error)) throw error; }
  }
  async function close() {
    if (closed) return; closed = true;
    if (owned) { owned = false; await unlink(join(claims, ownClaim)); }
  }
  return { acquire, load, write, preserve, close };
}
