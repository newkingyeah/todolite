import { html, useState } from "../vendor/preact-htm.js";
import { useBoard } from "./ctx.js";
import { Block, Md } from "./ui.js";
import { StatusIcon } from "./icons.js";
import { OPEN } from "../lib/model.js";
import { calendarShowsClosed } from "../lib/done.js";
import { motionOf } from "../lib/motion.js";
import { dueInfo, monthCells, ymd, pad2, firstOfMonth, addMonths, WEEK } from "../lib/due.js";
import { stripMd } from "../lib/md.js";

const MAX = 3; // at most this many items listed per day

// Month calendar: items with a due date are placed on the local day they are actually due (an AoE deadline often falls on the
// next day here; dueInfo's key), and open items past their due date are listed below.
// On phones the cells are too narrow for text, so a cell shows only dots (one per item, at most 3) and this month's items
// are listed by day under the calendar
export function CalendarBlock() {
  const { doc } = useBoard();
  const [month, setMonth] = useState(null); // null = this month
  const [preview, setPreview] = useState(null);
  const showMonth = (value) => { setPreview(null); setMonth(value); };
  const now = new Date(), first = month ?? firstOfMonth(now), todayKey = ymd(now), monthKey = ymd(first).slice(0, 7);
  const thisMonth = (x) => x.d.key.startsWith(monthKey);
  const dated = doc.items.filter((i) => i.due && (OPEN.includes(i.status) || calendarShowsClosed(i, doc.theme))).map((i) => ({ i, d: dueInfo(i.due) })).filter((x) => x.d);
  const byDay = {};
  for (const x of dated) (byDay[x.d.key] ??= []).push(x);
  // Within a day, open items come first (only 3 are listed per day, so closed items must not push open ones into "N more"),
  // then by time
  const closed = (x) => (OPEN.includes(x.i.status) ? 0 : 1);
  for (const k in byDay) byDay[k].sort((a, b) => closed(a) - closed(b) || a.d.at - b.d.at);
  const inMonth = dated.filter((x) => OPEN.includes(x.i.status) && thisMonth(x)).length;
  const overdue = dated.filter((x) => OPEN.includes(x.i.status) && x.d.over).sort((a, b) => a.d.at - b.d.at);
  const closePreview = (dayKey) => setPreview((current) => current?.dayKey === dayKey ? null : current);
  return html`<${Block} id="b-calendar" title="日历"><div class="card">
    <div class="cal-head"><span class="ttl">${first.getFullYear()} 年 ${first.getMonth() + 1} 月</span>
      <button class="tool" title="上个月" onClick=${() => showMonth(addMonths(first, -1))}>‹</button>
      <button class="tool" onClick=${() => showMonth(null)}>今天</button>
      <button class="tool" title="下个月" onClick=${() => showMonth(addMonths(first, 1))}>›</button>
      <span class="sum">${inMonth ? `这个月有 ${inMonth} 件到期` : "这个月没有到期的事"}</span>
    </div>
    <div class="cal-grid">
      ${[..."一二三四五六日"].map((w) => html`<div class="cal-dow" key=${w}>${w}</div>`)}
      ${monthCells(first).map((day) => {
        const k = ymd(day), xs = byDay[k] ?? [];
        const cls = `cal-cell ${day.getMonth() !== first.getMonth() ? "out" : ""} ${k === todayKey ? "today" : ""}`;
        return html`<${CalendarDay} key=${k} date=${day} dayKey=${k} cls=${cls} xs=${xs}
          preview=${preview?.dayKey === k ? preview : null} setPreview=${setPreview} closePreview=${closePreview} />`;
      })}
    </div>
    <${Agenda} xs=${dated.filter(thisMonth).sort((a, b) => a.d.at - b.d.at)} />
    ${overdue.length ? html`<div class="cal-over">已经过了截止：${overdue.map((x) => html`<${Chip} key=${x.i.id} x=${x} inline />`)}</div>` : null}
  </div><//>`;
}

function CalendarDay({ date, dayKey, cls, xs, preview, setPreview, closePreview }) {
  const full = !!window.TODO_PLUGIN && xs.length >= MAX;
  const close = () => closePreview(dayKey);
  const open = (cell) => {
    if (preview || innerWidth <= 640) return;
    const bounds = cell.getBoundingClientRect();
    const grid = cell.parentElement.getBoundingClientRect();
    const width = Math.min(326, grid.width, innerWidth - 24);
    const left = Math.max(12, grid.left, Math.min(bounds.left, grid.right - width, innerWidth - width - 12));
    const below = innerHeight - bounds.bottom - 12;
    const above = bounds.top - 76;
    const up = below < Math.min(300, xs.length * 44 + 50) && above > below;
    const maxHeight = Math.max(96, Math.min(300, up ? above : below));
    setPreview({ dayKey, up, style: { left: left - bounds.left, width, maxHeight } });
  };
  const events = full ? {
    onPointerEnter: (e) => { if (e.pointerType !== "touch") open(e.currentTarget); },
    onPointerLeave: (e) => {
      const focus = document.activeElement;
      if (!e.currentTarget.contains(focus) || !focus?.matches(":focus-visible")) close();
    },
    onFocusIn: (e) => { if (e.target.matches(":focus-visible")) open(e.currentTarget); },
    onFocusOut: (e) => { if (!e.currentTarget.contains(e.relatedTarget) && !e.currentTarget.matches(":hover")) close(); },
    onKeyDown: (e) => {
      if (e.key !== "Escape" || !preview) return;
      e.stopPropagation();
      const cell = e.currentTarget;
      if (e.target.closest(".cal-preview")) cell.querySelector(".calchip")?.focus({ preventScroll: true });
      close();
    },
  } : {};
  const panelId = `cal-preview-${dayKey}`;
  const dayLabel = `${date.getMonth() + 1}月${date.getDate()}日`;
  return html`<div class=${cls} ...${events}><span class="dn">${date.getDate()}</span>
    ${xs.slice(0, MAX).map((x) => html`<${Chip} key=${x.i.id} x=${x} suppressHint=${full} dismiss=${full ? close : null} />`)}
    ${xs.length > MAX ? full ? html`<button class="cal-more" type="button" aria-expanded=${!!preview}
      aria-controls=${preview ? panelId : undefined} onClick=${(e) => open(e.currentTarget.parentElement)}>还有 ${xs.length - MAX} 件</button>`
      : html`<div class="cal-more">还有 ${xs.length - MAX} 件</div>` : null}
    ${xs.length ? html`<span class="cal-dots">${xs.slice(0, MAX).map((x) => html`<i key=${x.i.id} class=${OPEN.includes(x.i.status) ? "" : "closed"}></i>`)}</span>` : null}
    ${full && preview ? html`<div class=${`cal-preview ${preview.up ? "up" : ""}`} id=${panelId} role="group"
      aria-label=${`${dayLabel}的任务`} style=${preview.style}>
      <div class="cal-preview-head"><strong>${dayLabel}</strong><span>${xs.length} 件</span></div>
      ${xs.map((x) => html`<${Chip} key=${x.i.id} x=${x} detail dismiss=${close} />`)}
    </div>` : null}
  </div>`;
}

// The list under the calendar on phones: this month's due items by day, with a small heading per day. Clicking an entry
// does the same as clicking one in a cell: it locates the item in its card
function Agenda({ xs }) {
  const { locate } = useBoard();
  if (!xs.length) return null;
  const days = [];
  for (const x of xs) {
    if (days.at(-1)?.key !== x.d.key) days.push({ key: x.d.key, at: x.d.at, xs: [] });
    days.at(-1).xs.push(x);
  }
  return html`<div class="cal-agenda">${days.map(({ key, at, xs: ys }) => html`<div class="ag-day" key=${key}>
    <h4>${at.getMonth() + 1}月${at.getDate()}日 周${WEEK[at.getDay()]}</h4>
    ${ys.map(({ i, d: di }) => {
      const open = OPEN.includes(i.status);
      // under the local day's heading, an AoE deadline shows its local time
      const hm = di.p.aoe ? `${pad2(di.at.getHours())}:${pad2(di.at.getMinutes())}` : di.p.hh != null ? `${pad2(di.p.hh)}:${pad2(di.p.mm)}` : "";
      return html`<button key=${i.id} class=${`ag-item ${open ? "" : "closed"} ${open && di.soon ? "soon" : ""}`} onClick=${() => locate(i.id)}>
        <${StatusIcon} s=${i.status} /><span class="tt"><${Md} text=${i.title} /></span>
        <span class="rel">${open ? di.rel : hm}</span>
      </button>`;
    })}
  </div>`)}</div>`;
}

// Clicking an item on the calendar finds it in its card, scrolls there and highlights it briefly (the editor does not open;
// to edit, click the ✎ at the right of that row)
function Chip({ x: { i, d }, inline, detail, suppressHint, dismiss }) {
  const { locate } = useBoard();
  const title = stripMd(i.title);
  const deadline = `${d.date}${d.local ? ` · ${d.local}` : ""}`;
  const cls = `calchip ${OPEN.includes(i.status) ? "" : "closed"} ${motionOf(i.id) === "close" ? "just-closed" : ""} ${d.over && OPEN.includes(i.status) ? "over" : ""} ${inline ? "inline" : ""}`;
  return html`<button class=${cls} title=${detail || suppressHint ? undefined : `${title} · ${deadline}`}
    onClick=${() => { dismiss?.(); locate(i.id); }}>
    <${StatusIcon} s=${i.status} />
    ${detail ? html`<span class="cal-preview-entry"><span class="tt">${title}</span><small>${deadline}</small></span>` : html`<span class="tt">${title}</span>`}
  </button>`;
}
