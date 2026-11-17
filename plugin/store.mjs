import { emptyDoc, normalize } from '../core/schema.mjs';
import { EDITS, match } from '../core/edits.mjs';
import { nowIso } from '../core/doc.mjs';

// Board and settings share a queue. Failed writes never replace committed state.
export class BoardStore {
  constructor(initial, persist, changed = () => {}) {
    this.doc = normalize(structuredClone(initial ?? emptyDoc()));
    this.persist = persist;
    this.changed = changed;
    this.queue = Promise.resolve();
  }

  request(method, path, body) {
    const operation = this.queue.then(async () => {
      const pathname = path.split('?')[0];
      if (method === 'GET' && pathname === '/api/todo') return structuredClone(this.doc);
      const edit = match(EDITS, method, pathname);
      if (!edit) throw new Error('不支持此操作');
      const next = structuredClone(this.doc);
      const logs = await edit.fn(next, structuredClone(body ?? {}), edit.id);
      if (logs == null || (Array.isArray(logs) && !logs.length)) return structuredClone(this.doc);
      next.rev = (next.rev ?? 0) + 1;
      next.updatedAt = nowIso();
      const normalized = normalize(next);
      await this.persist(structuredClone(normalized));
      this.doc = normalized;
      this.changed(structuredClone(normalized));
      return structuredClone(normalized);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
