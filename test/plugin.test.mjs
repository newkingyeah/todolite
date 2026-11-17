import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardStore } from '../plugin/store.mjs';

test('plugin starts empty and saves task, layout, habit and settings across reloads', async () => {
  let disk;
  const store = new BoardStore(null, async doc => { disk = JSON.parse(JSON.stringify(doc)); });
  const initial = await store.request('GET', '/api/todo');
  for (const key of ['sections', 'groups', 'items', 'places']) assert.deepEqual(initial[key], []);
  await store.request('POST', '/api/sections', { title: '工作' });
  const group = disk.groups[0].id;
  await store.request('POST', '/api/items', { group, title: '普通任务' });
  const task = disk.items[0].id;
  await store.request('PATCH', `/api/items/${task}`, { status: 'done', due: '2026-11-20' });
  await store.request('POST', '/api/items', { group, title: '每日打卡', repeat: 'daily' });
  const habit = disk.items[1].id;
  await store.request('POST', `/api/items/${habit}/check`, { date: '2026-11-18', done: true });
  await store.request('PATCH', '/api/theme', { showToday: false, mode: 'dark', title: '我的看板' });
  await store.request('PATCH', '/api/settings', { staleHours: 6 });
  const loaded = await new BoardStore(disk, async () => {}).request('GET', '/api/todo');
  assert.equal(loaded.items[0].status, 'done');
  assert.equal(loaded.items[0].due, '2026-11-20');
  assert.deepEqual(loaded.items[1].doneDates, ['2026-11-18']);
  assert.equal(loaded.theme.showToday, false);
  assert.equal(loaded.theme.title, '我的看板');
  assert.equal(loaded.theme.mode, 'dark');
  assert.equal(loaded.settings.staleHours, 6);
  loaded.items.length = 0;
  assert.equal((await store.request('GET', '/api/todo')).items.length, 2);
  await store.request('DELETE', `/api/items/${task}`);
  assert.equal(disk.items.length, 1);
});

test('concurrent board and settings writes serialize without losing updates', async () => {
  const snapshots = [];
  const store = new BoardStore(null, async doc => { await new Promise(resolve => setTimeout(resolve, 5)); snapshots.push(doc); });
  await Promise.all([
    store.request('POST', '/api/sections', { title: '分区一' }),
    store.request('PATCH', '/api/theme', { width: 1200 }),
    store.request('POST', '/api/sections', { title: '分区二' }),
  ]);
  const result = await store.request('GET', '/api/todo');
  assert.equal(result.sections.length, 2);
  assert.equal(result.theme.width, 1200);
  assert.equal(result.rev, 3);
  assert.deepEqual(snapshots.map(doc => doc.rev), [1, 2, 3]);
});

test('failed save or invalid edit leaves committed state intact and the next save works', async () => {
  let fail = true, notifications = 0;
  const store = new BoardStore(null, async () => { if (fail) throw new Error('disk unavailable'); }, () => { notifications++; });
  await assert.rejects(store.request('POST', '/api/sections', { title: '未保存' }), /disk unavailable/);
  assert.equal(store.doc.rev, 0);
  assert.equal(store.doc.sections.length, 0);
  assert.equal(notifications, 0);
  fail = false;
  await store.request('POST', '/api/sections', { title: '已保存' });
  await assert.rejects(store.request('POST', '/api/items', { group: 'missing', title: '无效' }));
  assert.equal(store.doc.rev, 1);
  assert.equal(store.doc.items.length, 0);
  assert.equal(notifications, 1);
  await store.request('PATCH', '/api/theme', { fontSize: 16 });
  assert.equal(store.doc.rev, 2);
});
