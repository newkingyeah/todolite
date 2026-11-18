import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { openSharedBoard } from '../plugin/shared-store.mjs';
import { ymd } from '../web/lib/due.js';

const server = fileURLToPath(new URL('../mcp/server.mjs', import.meta.url));

async function useVault(t, configDir = '.obsidian') {
  const vault = await mkdtemp(join(tmpdir(), 'todolite-笔记库-'));
  const dir = join(vault, configDir, 'plugins', 'todo-lite');
  const clients = new Set();
  t.after(async () => {
    await Promise.all([...clients].map(client => client.close()));
    await rm(vault, { recursive: true, force: true });
  });
  await mkdir(dir, { recursive: true });
  const manifest = join(dir, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ id: 'todo-lite', version: '1.1.0' }));

  async function connect() {
    const transport = new StdioClientTransport({
      command: process.execPath, args: [server, '--vault', vault, '--config-dir', configDir], stderr: 'pipe',
    });
    const client = new Client({ name: 'todolite-test', version: '1.0.0' });
    clients.add(client);
    let stderr = '';
    transport.stderr.on('data', chunk => { stderr += chunk; });
    try { await client.connect(transport); }
    catch (error) { throw new Error(stderr.trim() || error.message, { cause: error }); }
    const call = (name, args = {}) => client.callTool({ name: 'todolite_' + name, arguments: args });
    return {
      client,
      async close() { await client.close(); clients.delete(client); },
      async run(name, args) {
        const response = await call(name, args);
        assert.equal(response.isError, undefined, response.content[0]?.text);
        return response.structuredContent;
      },
      async fails(name, args, message) {
        const response = await call(name, args);
        assert.equal(response.isError, true);
        assert.match(response.content[0].text, message);
      },
    };
  }

  return { connect, data: join(dir, 'data.json'), manifest };
}

test('stdio MCP works without Obsidian, persists all four workflows and reconnects', async t => {
  const { connect, data } = await useVault(t);
  const mcp = await connect();
  const { tools } = await mcp.client.listTools();
  assert.equal(tools.length, 14);
  assert.equal(tools.find(tool => tool.name === 'todolite_get_today').annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === 'todolite_create_task').annotations.idempotentHint, false);
  assert.deepEqual(await mcp.run('list_cards'), { items: [], total_count: 0, next_offset: null });

  const now = new Date();
  const yesterday = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const { card } = await mcp.run('create_card', { section_title: '工作', card_title: '任务' });
  const { card_id } = card;
  assert.equal(card.section_title, '工作');
  assert.equal((await mcp.run('list_cards', { section_id: card.section_id })).items[0].card_id, card_id);
  const duplicate = await mcp.run('create_card', { section_id: card.section_id, card_title: '任务' });
  assert.equal(duplicate.card.card_id, card_id);

  const { task } = await mcp.run('create_task', { card_id, title: '验收待办', due: yesterday, note: '待改备注' });
  const { task_id } = task;
  assert.equal((await mcp.run('get_today')).overdue.items[0].task_id, task_id);
  const edited = await mcp.run('update_task', { task_id, title: '验收 MCP', note: '已改备注', status: 'doing', due: null });
  assert.equal(edited.task.due, null);
  assert.equal(edited.task.note, '已改备注');
  assert.equal((await mcp.run('get_today')).in_hand.items[0].task_id, task_id);
  const finished = await mcp.run('update_task', { task_id, status: 'done' });
  assert.ok(finished.task.completed_at);
  assert.equal((await mcp.run('update_task', { task_id, status: 'todo' })).task.completed_at, null);

  await mcp.fails('report_agent', { task_id, progress: '进行中' }, /先用/);
  const assigned = await mcp.run('assign_agent', { task_id, agent_name: 'Codex', location: '本机', progress: '检查中' });
  assert.equal(assigned.task.status, 'agent');
  assert.equal(assigned.task.agent.location, '本机');
  assert.equal(assigned.task.agent.name, 'Codex');
  const progress = await mcp.run('report_agent', { task_id, progress: '验收通过' });
  assert.equal(progress.task.agent.progress, '验收通过');
  const reported = await mcp.run('report_agent', { task_id, result: '验收记录.md', finish: true });
  assert.equal(reported.task.status, 'done');
  assert.equal(reported.task.agent.result, '验收记录.md');
  const doneDay = ymd(new Date(reported.task.completed_at));
  const found = await mcp.run('search_tasks', { query: '验收记录', status: 'done', from: doneDay, to: doneDay });
  assert.deepEqual(found.items.map(item => item.task_id), [task_id]);

  const { task: habit } = await mcp.run('create_task', { card_id, title: '每日阅读', repeat: 'daily' });
  assert.equal((await mcp.run('get_today')).pending_habits.items[0].task_id, habit.task_id);
  await mcp.fails('update_task', { task_id: habit.task_id, status: 'done' }, /打卡/);
  await mcp.fails('check_habit', { task_id, date: yesterday }, /没有重复规则/);
  await mcp.fails('check_habit', { task_id: habit.task_id, date: '2999-01-01' }, /还未到/);
  assert.equal((await mcp.run('check_habit', { task_id: habit.task_id, date: yesterday })).done, true);
  assert.equal((await mcp.run('check_habit', { task_id: habit.task_id, date: yesterday, done: false })).done, false);
  const check = await mcp.run('check_habit', { task_id: habit.task_id });
  assert.equal((await mcp.run('get_today')).pending_habits.total_count, 0);

  await mcp.close();
  const stored = JSON.parse(await readFile(data, 'utf8'));
  assert.equal(stored.items.find(item => item.id === task_id).agent.result, '验收记录.md');
  const reopened = await connect();
  assert.equal((await reopened.run('get_task', { task_id })).task.status, 'done');
  assert.deepEqual((await reopened.run('get_task', { task_id: habit.task_id })).task.check_ins, [check.date]);
});

test('MCP removes history and habits, and guards deletion of cards and sections that still contain tasks', async t => {
  const { connect, data } = await useVault(t);
  const mcp = await connect();
  const { tools } = await mcp.client.listTools();
  for (const name of ['delete_task', 'delete_card', 'delete_section']) {
    const { annotations } = tools.find(tool => tool.name === `todolite_${name}`);
    assert.equal(annotations.readOnlyHint, false);
    assert.equal(annotations.destructiveHint, true);
  }

  const { card } = await mcp.run('create_card', { section_title: '临时分区', card_title: '临时卡片' });
  const { card_id, section_id } = card;
  const { task: history } = await mcp.run('create_task', { card_id, title: '已完成事项' });
  await mcp.run('update_task', { task_id: history.task_id, status: 'done' });
  assert.deepEqual(await mcp.run('delete_task', { task_id: history.task_id }), { task_id: history.task_id, title: history.title });
  await mcp.fails('delete_task', { task_id: history.task_id }, /没有这一条/);
  assert.equal((await mcp.run('search_tasks', { status: 'done' })).total_count, 0);

  const { task: habit } = await mcp.run('create_task', { card_id, title: '习惯', repeat: 'daily' });
  await mcp.run('check_habit', { task_id: habit.task_id });
  await mcp.run('delete_task', { task_id: habit.task_id });
  assert.equal((await mcp.run('search_tasks', { is_habit: true })).total_count, 0);

  await mcp.run('create_task', { card_id, title: '随卡片删除' });
  const { card: sibling } = await mcp.run('create_card', { section_id, card_title: '同分区另一卡' });
  const { task: nested } = await mcp.run('create_task', { card_id: sibling.card_id, title: '随分区删除' });
  const { card: other } = await mcp.run('create_card', { section_title: '其他分区', card_title: '保留卡片' });
  const { task: keep } = await mcp.run('create_task', { card_id: other.card_id, title: '保留任务' });
  const { store: desktop } = await openSharedBoard(data);

  const before = await readFile(data, 'utf8');
  await mcp.fails('delete_card', { card_id }, /还有 1 条/);
  await mcp.fails('delete_section', { section_id }, /还有 2 条/);
  assert.equal(await readFile(data, 'utf8'), before);

  assert.equal((await mcp.run('delete_card', { card_id, force: true })).deleted_task_count, 1);
  assert.equal((await mcp.run('get_task', { task_id: nested.task_id })).task.title, nested.title);
  assert.equal((await mcp.run('delete_section', { section_id, force: true })).deleted_task_count, 1);

  const { card: empty } = await mcp.run('create_card', { section_title: '空分区', card_title: '空分区' });
  assert.equal((await mcp.run('delete_card', { card_id: empty.card_id })).deleted_task_count, 0);
  assert.ok((await mcp.run('list_sections')).items.some(section => section.section_id === empty.section_id));
  assert.equal((await mcp.run('delete_section', { section_id: empty.section_id })).deleted_task_count, 0);

  await mcp.close();
  const doc = await desktop.read();
  assert.deepEqual(doc.items.map(item => item.id), [keep.task_id]);
  assert.deepEqual(doc.groups.map(group => group.id), [other.card_id]);
  assert.deepEqual(doc.sections.map(section => section.id), [other.section_id]);
});

test('desktop store and two MCP processes can write concurrently without losing changes', async t => {
  const { connect, data } = await useVault(t, '.custom');
  const { store } = await openSharedBoard(data);
  const a = await connect();
  const b = await connect();
  const { card } = await a.run('create_card', { section_title: '并发', card_title: '并发' });
  const tasks = Array.from({ length: 9 }, (_, index) => index);
  await Promise.all(tasks.flatMap(index => [
    a.run('create_task', { card_id: card.card_id, title: `Agent A ${index}` }),
    b.run('create_task', { card_id: card.card_id, title: `Agent B ${index}` }),
    store.request('POST', '/api/items', { group: card.card_id, title: `Obsidian ${index}` }),
  ]));
  const doc = await store.read();
  assert.equal(doc.rev, tasks.length * 3 + 1);
  assert.equal(new Set(doc.items.map(item => item.id)).size, tasks.length * 3);
  for (const name of ['Agent A', 'Agent B', 'Obsidian']) {
    assert.equal(doc.items.filter(item => item.title.startsWith(name)).length, tasks.length);
  }
  const first = await b.run('search_tasks', { limit: 2 });
  assert.equal(first.total_count, doc.items.length);
  const second = await b.run('search_tasks', { limit: 2, offset: first.next_offset });
  assert.ok(second.items.every(item => !first.items.some(row => row.task_id === item.task_id)));
});

test('reads older board data and leaves corrupt or unexpectedly changed files intact', async t => {
  const { connect, data } = await useVault(t);
  const legacy = { sections: [{ id: 's', title: '分区' }], groups: [{ id: 'g', section: 's', title: '卡片' }],
    items: [{ id: 't', group: 'g', title: '例'.repeat(301), status: 'todo', repeat: { days: [1] } }] };
  await writeFile(data, JSON.stringify(legacy));
  const mcp = await connect();
  assert.equal((await mcp.run('get_task', { task_id: 't' })).task.title, legacy.items[0].title);
  const { store } = await openSharedBoard(data);
  await assert.rejects(store.edit(async draft => {
    draft.items[0].title = 'unsaved';
    legacy.items[0].title = 'external change';
    await writeFile(data, JSON.stringify(legacy));
    return { op: 'update' };
  }), /同时被其他程序修改/);
  assert.equal((await mcp.run('get_task', { task_id: 't' })).task.title, 'external change');
  const corrupt = '{"items": [';
  await writeFile(data, corrupt);
  await mcp.fails('create_task', { card_id: 'g', title: 'should not overwrite' }, /无法读取/);
  assert.equal(await readFile(data, 'utf8'), corrupt);
});
