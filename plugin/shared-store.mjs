import { createHash, randomUUID } from 'node:crypto';
import { watch } from 'node:fs';
import { open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import lockfile from 'proper-lockfile';
import { normalize } from '../core/schema.mjs';
import { BoardStore } from './store.mjs';

export const boardFile = (vault, pluginDir) => join(vault, pluginDir, 'data.json');

// Commit with a same-directory rename so readers always see a complete JSON document.
async function replace(file, text, beforeRename) {
  const temp = join(dirname(file), `.todolite-${randomUUID()}.tmp`);
  try {
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(text, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    for (let attempt = 0; ; attempt++) {
      await beforeRename();
      try { await rename(temp, file); return; }
      catch (error) {
        if (attempt >= 4 || !['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
        await delay(40 * (attempt + 1));
      }
    }
  } finally {
    await unlink(temp).catch(() => {});
  }
}

export async function openSharedBoard(path, changed) {
  const file = join(await realpath(dirname(path)), basename(path));
  const identity = process.platform === 'win32' ? file.toLowerCase() : file;
  const key = createHash('sha256').update(identity).digest('hex');
  // The mutex is local to this machine, even when OneDrive syncs the vault.
  const lockfilePath = join(tmpdir(), `todolite-${key}.lock`);
  let knownText;

  async function readText() {
    try { return await readFile(file, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (typeof knownText === 'string') throw new Error('ToDo Lite 数据文件已移走。恢复 data.json 后再试。', { cause: error });
      return null;
    }
  }

  async function load() {
    const text = await readText();
    if (text === knownText) return null;
    if (text === null) { knownText = null; return null; }
    try {
      const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
          ['items', 'groups', 'sections', 'places'].some(key => parsed[key] != null && !Array.isArray(parsed[key]))) {
        throw new Error('看板、卡片或任务数据的格式不正确');
      }
      if (parsed.version > 2) throw new Error('请升级 ToDo Lite 以读取此数据版本');
      const doc = normalize(parsed);
      knownText = text;
      return doc;
    } catch (error) { throw new Error(`无法读取 ToDo Lite 的 data.json：${error.message}`, { cause: error }); }
  }

  async function save(doc, verifyLock = () => {}) {
    const text = JSON.stringify(doc, null, 2) + '\n';
    await replace(file, text, async () => {
      if (await readText() !== knownText) throw new Error('看板同时被其他程序修改，请重试。');
      verifyLock();
    });
    knownText = text;
  }

  async function lock(run) {
    let compromised;
    const release = await lockfile.lock(file, {
      lockfilePath, realpath: false, stale: 30_000,
      retries: { retries: 28, factor: 1.2, minTimeout: 15, maxTimeout: 200, randomize: true },
      onCompromised: error => { compromised = error; },
    });
    try {
      return await run(() => { if (compromised) throw compromised; });
    } finally {
      await release().catch(error => { if (!compromised) throw error; });
    }
  }

  const store = new BoardStore(await load(), save, changed, { load, lock });
  return {
    store,
    watchChanges(onError) {
      let timer;
      const watcher = watch(dirname(file), { persistent: false }, (_event, name) => {
        if (name && name.toString().toLowerCase() !== basename(file).toLowerCase()) return;
        clearTimeout(timer);
        timer = setTimeout(() => store.read().catch(onError), 75);
      });
      watcher.on('error', onError);
      return () => { clearTimeout(timer); watcher.close(); };
    },
  };
}
