import { mkdir, open, readdir, unlink, rename, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { standardCatalog, validateSavedCatalog } from './catalog.js';
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

// Recognize only unchanged standard missions from the previous bank.
const priorMissionDigests: Record<string, string> = {
  e11: '1f7d43b121797e82c6d956097bbba01df8cae2c1734397277562ab040d2f3421',
  e12: 'f71d78cbad99e557b376431c325367461c31d5c2f93c66afee0c75e0d800106a',
  e18: '71d164b032375770515a791bf51dc1df602d9ece89a5716e2a2fc99116c52377',
  e19: '7b988cc9f39358af454e7d9e34880b3a1dbdc0d5807ccb0f493673f931d81ca0',
  e21: '710406d2280a6cb9a61873c65cb3c41b694195def5a41d68bcc48e9ed3b7f082',
  e25: 'd1b9fd2b69cbe69e516f672006b2b1ab505ed528055cbe81067e796aaad67b58',
  e30: '64c9cab782f73403ad85326ec39c4f30047fe631104115b3a13359790aba2406',
};
function firstGameCatalog(value: unknown) {
  const catalog = validateSavedCatalog(value);
  const current = new Map(standardCatalog().file.entries.map(({ card }) => [card.id, card]));
  for (const { card } of catalog.file.entries) {
    const revised = current.get(card.id);
    if (card.role === 'exorcist' && revised?.role === 'exorcist' &&
      priorMissionDigests[card.id] === createHash('sha256').update(card.mission).digest('hex')) card.mission = revised.mission;
  }
  return catalog;
}

/** Local-disk adapter. Claims are unique, so stale cleanup never unlinks a replacement writer's lock. */
export function createFileSessionStore(directory: string, firstGame = false): SessionStore {
  const root = resolve(directory), file = join(root, firstGame ? 'party-v7.json' : 'session.json'), claims = join(root, '.writers');
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
  async function loadLegacyCatalog() {
    const legacy = await open(join(root, 'session.json'), 'r').catch((error: unknown) => {
      if (!missing(error)) throw error;
      return null;
    });
    if (!legacy) return null;
    try {
      if ((await legacy.stat()).size > 16 * 1024 * 1024) return null;
      const contents = await legacy.readFile('utf8');
      try {
        const parsed = JSON.parse(contents);
        if (parsed?.schemaVersion !== 5) return null;
        return { schemaVersion: 7 as const, lobby: { catalog: firstGameCatalog(parsed.lobby.catalog), revision: 0, usedCodes: [], room: null } };
      } catch { return null; }
    } finally { await legacy.close(); }
  }
  async function loadPreviousParty() {
    const previous = await open(join(root, 'party-v6.json'), 'r').catch((error: unknown) => {
      if (!missing(error)) throw error;
      return null;
    });
    if (!previous) return loadLegacyCatalog();
    try {
      if ((await previous.stat()).size > 16 * 1024 * 1024) throw new Error('Session file exceeds the supported size.');
      const parsed = JSON.parse(await previous.readFile('utf8'));
      if (parsed?.schemaVersion !== 6) throw new Error('Invalid previous checkpoint version.');
      const state = validateSession(parsed);
      return { ...state, schemaVersion: 7 as const };
    } finally { await previous.close(); }
  }
  async function load() {
    check();
    let handle;
    try {
      handle = await open(file, 'r');
      if ((await handle.stat()).size > 16 * 1024 * 1024) throw new Error('Session file exceeds the supported size.');
      const parsed = JSON.parse(await handle.readFile('utf8'));
      if (firstGame && parsed?.schemaVersion !== 7) throw Error('Invalid first-game checkpoint version.');
      return validateSession(parsed);
    } catch (error) {
      if (!missing(error)) throw error;
      return firstGame ? loadPreviousParty() : null;
    }
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
