import { z } from 'zod';
import { addGroup, addSection, updateGroup } from '../core/board.mjs';
import { getGroup, getItem, getSection, nowIso } from '../core/doc.mjs';
import { addItem, checkItem, updateItem } from '../core/items.mjs';
import { closedAt } from '../web/lib/done.js';
import { dueInfo, parseDue, ymd } from '../web/lib/due.js';
import { ORDER, groupsOf } from '../web/lib/model.js';
import { repeatState } from '../web/lib/repeat.js';
import { todayWork } from '../web/lib/work.js';

const id = z.string().trim().min(1).max(128);
const title = z.string().trim().min(1).max(300);
const note = z.string().max(12_000);
const date = z.iso.date();
const limit = z.number().int().min(1).max(100).default(25);
const offset = z.number().int().min(0).default(0);
const status = z.enum(ORDER);
const due = z.string().trim().max(80).refine(value => value === '待确认' || !!parseDue(value), '请输入有效截止日期，如 2026-12-01 或 2026-12-01 17:00 AoE').nullable();
const repeat = z.object({ days: z.array(z.number().int().min(0).max(6)).min(1).max(7), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() }).strict();
const repeatInput = z.union([z.enum(['daily', 'weekdays', 'weekends']), repeat, z.null()]);
const nullableText = z.string().nullable();
const summarySchema = z.object({
  task_id: z.string(), title: z.string(), status, card_id: z.string(), due: nullableText, completed_at: nullableText, updated_at: nullableText,
  agent_name: nullableText, is_habit: z.boolean(),
});
const detailSchema = summarySchema.extend({
  note: z.string(), waiting_on: nullableText, reason: nullableText,
  repeat: z.object({ days: z.array(z.number()), time: z.string().optional() }).nullable(), check_ins: z.array(z.string()),
  agent: z.object({ name: nullableText, location: nullableText, progress: nullableText, result: nullableText,
    since: nullableText, last_seen: nullableText }).nullable(),
});
const cardSchema = z.object({ card_id: z.string(), title: z.string(), section_id: z.string(), section_title: z.string(), hidden: z.boolean() });
const pendingHabitSchema = summarySchema.extend({ check_in_date: date, streak: z.number().int(), schedule: z.string() });
const pageSchema = element => z.object({ items: z.array(element), total_count: z.number().int(), next_offset: z.number().int().nullable() });

function page(rows, size, start = 0) {
  const items = rows.slice(start, start + size);
  const next = start + items.length;
  return { items, total_count: rows.length, next_offset: next < rows.length ? next : null };
}

function summary(item) {
  return { task_id: item.id, title: item.title, status: item.status, card_id: item.group, due: item.due ?? null,
    completed_at: item.doneAt ?? null, updated_at: item.updatedAt ?? null, agent_name: item.agent?.name ?? null,
    is_habit: !!item.repeat?.days?.length };
}

function detail(item) {
  const agent = item.agent;
  return { ...summary(item), note: item.note ?? '', waiting_on: item.waitingOn ?? null, reason: item.reason ?? null,
    repeat: item.repeat ?? null, check_ins: item.doneDates ?? [], agent: agent ? {
      name: agent.name ?? null, location: agent.where ?? null, progress: agent.note ?? null, result: agent.result ?? null,
      since: agent.since ?? null, last_seen: agent.lastSeen ?? null,
    } : null };
}

function card(doc, group) {
  const section = getSection(doc, group.section);
  return { card_id: group.id, title: group.title, section_id: section.id, section_title: section.title, hidden: !!section.hidden };
}

function checkInDay(item, requested, done) {
  const state = repeatState(item);
  if (!state) throw new Error('此任务没有重复规则，无法打卡。');
  const day = requested ?? state.key;
  if (day > state.key) throw new Error(`打卡日期还未到。当前打卡日是 ${state.key}。`);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  if (done && !item.repeat.days.includes(weekday)) throw new Error('该日期不在习惯的重复日内。');
  return day;
}

export function registerTools(server, store) {
  function tool(name, displayName, description, inputSchema, outputSchema, run, { readOnly = true, idempotent = true } = {}) {
    server.registerTool(`todolite_${name}`, {
      title: displayName, description, inputSchema: z.object(inputSchema).strict(), outputSchema,
      annotations: { readOnlyHint: readOnly, destructiveHint: false, idempotentHint: idempotent, openWorldHint: false },
    }, async args => {
      const data = await run(args);
      return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
    });
  }

  tool('get_today', 'ToDo Lite 今日工作', '查询今日到期、已逾期、进行中或等待中的任务，以及今天还需打卡的习惯。', {
    limit: limit.describe('每类最多返回条数'), offset: offset.describe('每类跳过的条数'),
    include_hidden: z.boolean().default(false).describe('是否包含隐藏分区'),
  }, z.object({ date, overdue: pageSchema(summarySchema), due_today: pageSchema(summarySchema), in_hand: pageSchema(summarySchema),
    pending_habits: pageSchema(pendingHabitSchema) }), async ({ limit, offset, include_hidden }) => {
    const now = new Date();
    const { day, due, focus, habits } = todayWork(await store.read(), now, include_hidden);
    const pending = habits.flatMap(i => {
      const state = repeatState(i, now);
      return state.scheduled && !state.done ? [{ ...summary(i), check_in_date: state.key, streak: state.streak, schedule: state.label }] : [];
    });
    return { date: day, overdue: page(due.filter(entry => entry.info.over).map(entry => summary(entry.i)), limit, offset),
      due_today: page(due.filter(entry => !entry.info.over).map(entry => summary(entry.i)), limit, offset),
      in_hand: page(focus.map(summary), limit, offset), pending_habits: page(pending, limit, offset) };
  });

  tool('list_cards', '列出分区和卡片', '取得看板的分区和卡片 ID，供查任务、添加任务或移动任务使用。', {
    section_id: id.optional(), limit, offset,
  }, pageSchema(cardSchema), async ({ section_id, limit, offset }) => {
    const doc = await store.read();
    if (section_id) getSection(doc, section_id);
    return page(doc.groups.filter(group => !section_id || group.section === section_id).map(group => card(doc, group)), limit, offset);
  });

  tool('search_tasks', '查找任务和完成历史', '按关键词、卡片、状态或日期查找任务。完成历史包含已在看板折叠的事项。', {
    query: z.string().trim().min(1).max(300).optional().describe('匹配标题、备注、Agent 或交付内容'), card_id: id.optional(),
    status: status.optional(), is_habit: z.boolean().optional(),
    date_by: z.enum(['due', 'completed']).optional().describe('日期筛选字段。不填时，已完成查询用完成日期，其他查询用截止日期'),
    from: date.optional().describe('本地起始日期，包含当天'), to: date.optional().describe('本地结束日期，包含当天'), limit, offset,
  }, pageSchema(summarySchema), async ({ query, card_id, status, is_habit, date_by, from, to, limit, offset }) => {
    const doc = await store.read();
    if (card_id) getGroup(doc, card_id);
    if (from && to && from > to) throw new Error('开始日期不能晚于结束日期。');
    const by = date_by ?? (status === 'done' ? 'completed' : 'due');
    const keyword = query?.toLowerCase();
    const rows = doc.items.filter(item => {
      if (card_id && item.group !== card_id) return false;
      if (status && item.status !== status) return false;
      if (is_habit !== undefined && is_habit !== !!item.repeat?.days?.length) return false;
      if (keyword && ![item.title, item.note, item.agent?.name, item.agent?.where, item.agent?.note, item.agent?.result]
        .some(text => typeof text === 'string' && text.toLowerCase().includes(keyword))) return false;
      if (from || to) {
        const key = by === 'completed'
          ? (item.status === 'done' && closedAt(item) ? ymd(new Date(closedAt(item))) : null)
          : dueInfo(item.due)?.key;
        if (!key || (from && key < from) || (to && key > to)) return false;
      }
      return true;
    }).sort((a, b) => (by === 'completed' ? closedAt(b) - closedAt(a) : 0) ||
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.id.localeCompare(b.id));
    return page(rows.map(summary), limit, offset);
  });

  tool('get_task', '读取任务详情', '读取指定 ID 的任务、备注、Agent 进展与结果，以及习惯的打卡记录。', { task_id: id },
    z.object({ task: detailSchema }), async ({ task_id }) => ({ task: detail(getItem(await store.read(), task_id)) }));

  tool('create_card', '创建任务卡片', '在指定分区创建卡片。传入新的分区名称时可同时创建分区，方便从空看板开始。', {
    card_title: title, section_id: id.optional(), section_title: title.optional(),
  }, z.object({ card: cardSchema }), async ({ card_title, section_id, section_title }) => {
    if (!!section_id === !!section_title) throw new Error('请在 section_id 和 section_title 中选填一个。');
    let groupId;
    const { doc } = await store.edit(draft => {
      let section;
      if (section_id) section = getSection(draft, section_id);
      else {
        const matches = draft.sections.filter(entry => entry.title === section_title);
        if (matches.length > 1) throw new Error('有多个同名分区，请使用分区 ID。');
        [section] = matches;
      }
      if (!section) {
        const created = addSection(draft, { title: section_title });
        groupId = groupsOf(draft, created.id)[0].id;
        const renamed = card_title === section_title ? null : updateGroup(draft, groupId, { title: card_title });
        return renamed ? [created, renamed] : created;
      }
      const matches = groupsOf(draft, section.id).filter(group => group.title === card_title);
      if (matches.length > 1) throw new Error('有多个同名卡片，请用 list_cards 取得要使用的卡片 ID。');
      if (matches.length) { groupId = matches[0].id; return null; }
      const created = addGroup(draft, { title: card_title, section: section.id });
      groupId = created.id;
      return created;
    });
    return { card: card(doc, getGroup(doc, groupId)) };
  }, { readOnly: false });

  tool('create_task', '添加待办或习惯', '在指定卡片添加任务。填写重复规则可创建习惯。请先用 list_cards 获取卡片 ID。', {
    card_id: id, title, note: note.optional(), due: due.optional().describe('日期、日期加时间或 AoE。null 表示无期限'),
    repeat: repeatInput.optional().describe('daily、weekdays、weekends，或 days（0 为周日）与可选刷新时间 time'),
  }, z.object({ task: detailSchema }), async ({ card_id, ...fields }) => {
    const { doc, change } = await store.edit(draft => {
      getGroup(draft, card_id);
      return addItem(draft, { ...fields, group: card_id });
    });
    return { task: detail(getItem(doc, change.id)) };
  }, { readOnly: false, idempotent: false });

  tool('update_task', '修改、完成或重开任务', '更新指定任务的字段。状态设为 done 完成，设为 todo 重开。习惯打卡和 Agent 交接有专用工具。', {
    task_id: id, card_id: id.optional(), title: title.optional(), note: note.optional(), due: due.optional(),
    status: z.enum(['todo', 'doing', 'waiting', 'done', 'dropped']).optional(), waiting_on: title.nullable().optional(),
    reason: note.nullable().optional(), repeat: repeatInput.optional(),
  }, z.object({ task: detailSchema }), async ({ task_id, card_id, waiting_on, ...fields }) => {
    const { doc } = await store.edit(draft => {
      const item = getItem(draft, task_id);
      const isHabit = fields.repeat === undefined ? !!item.repeat?.days?.length : fields.repeat !== null;
      if (fields.status === 'done' && isHabit) {
        throw new Error('重复任务请用 todolite_check_habit 打卡。');
      }
      if (card_id !== undefined) getGroup(draft, card_id);
      return updateItem(draft, task_id, { ...fields, group: card_id, waitingOn: waiting_on });
    });
    return { task: detail(getItem(doc, task_id)) };
  }, { readOnly: false });

  tool('assign_agent', '交接任务给 Agent', '记录 Agent 名称和运行位置，并把任务设为 Agent 在做。重新交接会开始新的进度记录。', {
    task_id: id, agent_name: title, location: title, progress: note.optional(),
  }, z.object({ task: detailSchema }), async ({ task_id, agent_name, location, progress }) => {
    const { doc } = await store.edit(draft => {
      const item = getItem(draft, task_id);
      const agent = { name: agent_name, where: location };
      const newAssignment = item.status !== 'agent' || item.agent?.name !== agent_name;
      if (newAssignment) {
        const at = nowIso();
        Object.assign(agent, { since: at, lastSeen: at, note: progress ?? '', result: '' });
      } else if (progress !== undefined) agent.note = progress;
      const entries = Object.entries(agent).filter(([key, value]) => item.agent?.[key] !== value);
      return updateItem(draft, task_id, { status: 'agent', agent: entries.length ? Object.fromEntries(entries) : undefined });
    });
    return { task: detail(getItem(doc, task_id)) };
  }, { readOnly: false, idempotent: false });

  tool('report_agent', '写入 Agent 进展或结果', '记录已交接任务的最新进展或结果。finish 为 true 时同时完成普通任务，重复任务则打卡当前日期。', {
    task_id: id, progress: note.optional(), result: note.optional(), finish: z.boolean().default(false),
  }, z.object({ task: detailSchema }), async ({ task_id, progress, result, finish }) => {
    if (progress === undefined && result === undefined && !finish) throw new Error('请输入进展、结果，或请求完成任务。');
    const { doc } = await store.edit(draft => {
      const item = getItem(draft, task_id);
      if (!item.agent?.name && !item.agent?.where && !item.agent?.since) throw new Error('请先用 todolite_assign_agent 交接任务。');
      const entries = Object.entries({ note: progress, result }).filter(([key, value]) => value !== undefined && value !== item.agent?.[key]);
      const patch = { agent: entries.length ? Object.fromEntries(entries) : undefined };
      if (finish && item.repeat?.days?.length) {
        const checkDay = checkInDay(item, undefined, true);
        const report = updateItem(draft, task_id, patch);
        return [report, checkItem(draft, task_id, { date: checkDay, done: true })].filter(Boolean);
      }
      if (finish) patch.status = 'done';
      return updateItem(draft, task_id, patch);
    });
    return { task: detail(getItem(doc, task_id)) };
  }, { readOnly: false });

  tool('check_habit', '打卡、补打或撤销', '记录指定习惯的打卡。默认使用习惯当前打卡日，可指定过去日期补打。done 为 false 撤销该日打卡。', {
    task_id: id, date: date.optional(), done: z.boolean().default(true),
  }, z.object({ task_id: id, date, done: z.boolean() }), async ({ task_id, date, done }) => {
    let day;
    const { doc } = await store.edit(draft => {
      day = checkInDay(getItem(draft, task_id), date, done);
      return checkItem(draft, task_id, { date: day, done });
    });
    return { task_id, date: day, done: (getItem(doc, task_id).doneDates ?? []).includes(day) };
  }, { readOnly: false });
}
