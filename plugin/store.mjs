import { emptyDoc, normalize } from '../core/schema.mjs';
import { EDITS, match } from '../core/edits.mjs';
import { nowIso } from '../core/doc.mjs';

// Board and settings share a queue. Failed writes never replace committed state.
export class BoardStore {
  constructor(initial, persist, changed = () => {}, { load = null, lock = run => run() } = {}) {
    this.doc = normalize(structuredClone(initial ?? emptyDoc()));
    this.persist = persist;
    this.changed = changed;
    this.load = load;
    this.lock = lock;
    this.queue = Promise.resolve();
  }

  enqueue(run) {
    const operation = this.queue.then(run);
    this.queue = operation.catch(() => {});
    return operation;
  }

  async refresh() {
    const latest = await this.load?.();
    if (!latest) return;
    this.doc = normalize(latest);
    this.changed(structuredClone(this.doc));
  }

  read() {
    return this.enqueue(async () => {
      await this.refresh();
      return structuredClone(this.doc);
    });
  }

  edit(mutate) {
    return this.enqueue(() => this.lock(async verifyLock => {
      await this.refresh();
      const next = structuredClone(this.doc);
      const change = await mutate(next);
      if (change == null || (Array.isArray(change) && !change.length)) return { doc: structuredClone(this.doc), change };
      next.rev = (next.rev ?? 0) + 1;
      next.updatedAt = nowIso();
      const normalized = normalize(next);
      await this.persist(structuredClone(normalized), verifyLock);
      this.doc = normalized;
      this.changed(structuredClone(normalized));
      return { doc: structuredClone(normalized), change: structuredClone(change) };
    }));
  }

  async request(method, path, body) {
    const pathname = path.split('?')[0];
    if (method === 'GET' && pathname === '/api/todo') return this.read();
    const route = match(EDITS, method, pathname);
    if (!route) throw new Error('不支持此操作');
    const { doc } = await this.edit(next => route.fn(next, structuredClone(body ?? {}), route.id));
    return doc;
  }
}
