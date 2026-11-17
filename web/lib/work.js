import { dueInfo, ymd } from './due.js';
import { OPEN } from './model.js';

const FOCUS = ['doing', 'waiting', 'agent'];

/** The same today view for the board and its MCP tools. */
export function todayWork(doc, now = new Date(), includeHidden = false) {
  const day = ymd(now);
  const hidden = new Set(doc.sections.filter(section => section.hidden && !includeHidden).map(section => section.id));
  const cards = new Set(doc.groups.filter(group => !hidden.has(group.section)).map(group => group.id));
  const open = doc.items.filter(item => OPEN.includes(item.status) && cards.has(item.group));
  const due = [], habits = [];
  for (const i of open) {
    if (i.repeat?.days?.length) habits.push(i);
    else if (i.due) {
      const info = dueInfo(i.due, now);
      if (info && info.key <= day) due.push({ i, info });
    }
  }
  due.sort((a, b) => a.info.at - b.info.at);
  const listed = new Set(due.map(entry => entry.i.id));
  const focus = open.filter(i => FOCUS.includes(i.status) && !listed.has(i.id))
    .sort((a, b) => (a.agent?.lastSeen ?? '').localeCompare(b.agent?.lastSeen ?? ''));
  return { day, due, focus, habits };
}
