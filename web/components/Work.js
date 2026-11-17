// 今日工作：把散在各处、今天就该处理的事集中成一张张卡片（沿用上游新版 Agent 板块的卡片：右上圆形工具、
// 鼠标悬停会像跷跷板一样倾斜、底部「做完了」滑动条 / 长按、双击＝看过了），下面再挂一张打卡表。
//
// 卡片清单：
//   到期  —— 截止日期在今天或更早、还没做完的（逾期排最前）
//   在手  —— 正在做、等别人、挂在 Agent 上的（上面已列的不会重复）
// 打卡表放在同一板块底部，全页只有这一张（原来的打卡区块已并入这里）。
import { html, useRef, useLayoutEffect, useEffect } from "../vendor/preact-htm.js";
import { useBoard } from "./ctx.js";
import { Block, Md } from "./ui.js";
import { ItemForm } from "./Item.js";
import { HabitTable } from "./Repeat.js";
import { groupOf } from "../lib/model.js";
import { dueInfo, WEEK } from "../lib/due.js";
import { todayWork } from "../lib/work.js";
import { repeatState } from "../lib/repeat.js";
import { ago, dur, hoursSince } from "../lib/time.js";
import { agentCardOf, agentDoneOf } from "../lib/theme.js";
import { reducedMotion, handedOff, moveOf, markSeen, justSeen, moveAnimation } from "../lib/motion.js";
import { leaveCard } from "../lib/fx/index.js";
import { playSeen } from "../lib/fx/seen.js";
import { Seg } from "./controls.js";
import { StatusIcon, EditIcon, LocateIcon, BackIcon } from "./icons.js";

const isAgent = (i) => i.status === "agent";

export function TodayBlock() {
  const { doc, ui } = useBoard();
  const now = new Date();
  const cols = doc.theme?.agentCols === undefined ? 2 : Math.min(3, Math.max(1, Number(doc.theme.agentCols) || 2));
  const { due, focus, habits } = todayWork(doc, now, ui.editMode);
  const left = habits.filter((i) => { const st = repeatState(i, now); return st.scheduled && !st.done; }).length;

  // 在手那些如果也有截止日期，卡片上照样写出来（不在今天之前，所以只当信息用）
  const list = [...due.map(({ i, info }) => ({ i, info })), ...focus.map((i) => ({ i, info: i.due ? dueInfo(i.due) : null }))];
  const over = due.filter((x) => x.info.over).length;
  const head = `${now.getMonth() + 1}月${now.getDate()}日 周${WEEK[now.getDay()]}`;
  const tally = [
    due.length ? `到期 ${due.length}${over ? `（逾期 ${over}）` : ""}` : "",
    focus.length ? `在手 ${focus.length}` : "",
  ].filter(Boolean).join(" · ");

  const grid = useSlide(doc.theme);
  const side = html`<h2>今日工作</h2>${ui.editMode ? html`<${Seg} k="agentCols" cur=${cols} opts=${[[1, "一列"], [2, "两列"], [3, "三列"]]} />` : null}`;
  return html`<${Block} id="b-today" toc="今日工作" side=${side}>
    <div class="today-head"><span class="ttl">${head}</span><span class="sum">${tally || "今天没有到期的事，也没有在手的。"}</span></div>
    ${list.length
      ? html`<div class="agent-wrap"><div class=${`agent-grid cols-${cols}`} ref=${grid}>${list.map(({ i, info }) => html`<${WorkCard} key=${i.id} item=${i} info=${info} />`)}</div></div>`
      : html`<div class="card"><div class="none" style="padding:0">今天没有要弄的事。</div></div>`}
    ${habits.length ? html`<div class="card">
      <h3>打卡<span class="count">${left ? `今天还剩 ${left} 个没打` : "今天都打完了"}</span></h3>
      <${HabitTable} items=${habits} />
    </div>` : null}
  <//>`;
}

// ---- 卡片的移动动画（与上游 Agent 板块一致：换成新位置而不是跳过去）----
const layoutOf = (g) => ({ h: g.offsetHeight, box: new Map([...g.children].filter((n) => n.dataset.agentCard).map((n) => [n.dataset.agentCard, { x: n.offsetLeft, y: n.offsetTop, h: n.offsetHeight }])) });
function useSlide(theme) {
  const ref = useRef(null), last = useRef(null);
  const g0 = ref.current;
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const ro = new ResizeObserver(() => { if (!g.dataset.moving) last.current = layoutOf(g); });
    ro.observe(g);
    return () => ro.disconnect();
  }, [g0]);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) { last.current = null; return; }
    g._snap = () => { if (!g.dataset.moving) last.current = layoutOf(g); };
    const now = layoutOf(g), prev = last.current, box = now.box, cards = [...g.children].filter((n) => n.dataset.agentCard);
    last.current = now;
    if (!prev || reducedMotion() || [...prev.box.keys()].join() === [...box.keys()].join()) return;
    const style = moveOf(theme);
    if (style === "none") return;
    const id = (n) => n.dataset.agentCard, fresh = (n) => { const m = justSeen(id(n)); return !!m && !m.moved; };
    const lead = cards.find((n) => fresh(n) && prev.box.has(id(n)));
    const plan = moveAnimation(lead ? style : style === "spring" ? "spring" : "slide", 0, 0), along = { ...plan.others, fill: "backwards", id: "move" };
    const anims = [];
    for (const n of cards) {
      const a = prev.box.get(id(n)), b = box.get(id(n));
      if (!a) continue;
      const dx = a.x - b.x, dy = a.y - b.y, dh = a.h - b.h;
      if (dx || dy || Math.abs(dh) > 0.5) for (const old of n.getAnimations()) if (old.id === "move") old.cancel();
      if (n === lead && (dx || dy)) { justSeen(id(n)).moved = true; anims.push(play(n, ...moveAnimation(style, dx, dy).self)); }
      else if (dx || dy) anims.push(n.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], along));
      if (Math.abs(dh) > 0.5) anims.push(n.animate([{ height: `${a.h}px`, marginBottom: `${-dh}px` }, { height: `${b.h}px`, marginBottom: "0px" }], along));
    }
    const h = now.h;
    if (Math.abs(prev.h - h) > 0.5) anims.push(g.parentElement.animate([{ height: `${prev.h}px` }, { height: `${h}px` }], along));
    hold(g, anims);
  });
  return ref;
}

function hold(grid, anims) {
  if (!grid || !anims.length) return;
  const token = (grid._moves = (grid._moves ?? 0) + 1);
  grid.dataset.moving = "1";
  Promise.allSettled(anims.map((a) => a.finished)).then(() => { if (grid._moves === token) delete grid.dataset.moving; });
}

function play(card, keyframes, timing) {
  card.dataset.still = "1";
  card.style.zIndex = "2";
  const done = () => { delete card.dataset.still; card.style.zIndex = ""; };
  const a = card.animate(keyframes, { ...timing, id: "move" });
  a.finished.then(done, done);
  return a;
}

// 看过了：只在真的挂在 Agent 上的卡片上有意义
async function checked(card, x, y, { doc, tweak, reload, act }, id) {
  const grid = card?.closest(".agent-grid");
  if (!card || grid?.dataset.moving) return;
  playSeen(doc.theme, card, x, y);
  markSeen(id);
  grid?._snap?.();
  tweak((d) => {
    const it = d.items.find((i) => i.id === id), latest = Math.max(Date.now(), ...d.items.map((i) => (Date.parse(i.agent?.lastSeen ?? "") || 0) + 1));
    if (it?.agent) it.agent.lastSeen = new Date(latest).toISOString();
  });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const m = justSeen(id);
  if (m && !m.moved && card.isConnected && !reducedMotion() && moveOf(doc.theme) === "lift") {
    m.moved = true;
    hold(grid, [play(card, ...moveAnimation("lift", 0, 0).self)]);
  }
  if (!(await act.item(id).patch({ seen: true }, "记下了"))) reload(true);
}

// ---- 卡片 ----
function WorkCard({ item: i, info }) {
  const { doc, ui } = useBoard();
  const key = isAgent(i) ? `i:${i.id}@agent` : `i:${i.id}`;
  if (ui.editing === key) return html`<div class="card wide"><${ItemForm} item=${i} /></div>`;
  return agentCardOf(doc.theme) === "buttons" ? html`<${ButtonsCard} item=${i} info=${info} />` : html`<${GestureCard} item=${i} info=${info} />`;
}

// 标题下面那几行：挂在谁那儿 / 挂了多久、多久没看；等别人；什么时候到期；备注
function Body({ i, info, g, stale }) {
  if (isAgent(i)) {
    const a = i.agent || {};
    const source = [a.name, a.where].filter(Boolean).join(" · ") || "没写";
    return html`<div class="where">挂在 <${Md} text=${source} />${g ? ` · ${g.title}` : ""}</div>
      <div class="when">挂了 ${dur(a.since)}　上次看 ${ago(a.lastSeen)}${hoursSince(a.lastSeen) > stale ? html`<span class="stale">${dur(a.lastSeen)}没看了</span>` : null}</div>
      ${a.note ? html`<div class="note"><${Md} text=${a.note} /></div>` : null}`;
  }
  const line = i.status === "waiting" ? html`在等 <${Md} text=${i.waitingOn || "没说"} />`
    : info ? html`<span class=${info.over ? "late" : ""}>截止 ${info.date}　${info.rel}</span>` : null;
  return html`${line || g ? html`<div class="where">${line}${line && g ? ` · ${g.title}` : g ? g.title : ""}</div>` : null}
    ${i.note ? html`<div class="note"><${Md} text=${i.note} /></div>` : null}`;
}

const finish = (card, origin, doc, it, st) => leaveCard(card, origin, doc.theme, () => {
  card.closest(".agent-grid")?._snap?.();
  return st ? it.check(st.key, true, "打卡了") : it.patch({ status: "done" });
});

function ButtonsCard({ item: i, info }) {
  const board = useBoard(), { doc, setUi, act, openPop } = board;
  const ref = useRef(null);
  const g = groupOf(doc, i.group), it = act.item(i.id), st = repeatState(i);
  const key = isAgent(i) ? `i:${i.id}@agent` : `i:${i.id}`;
  return html`<div class=${`card agent ${handedOff(i.id) ? "arrive" : ""}`} data-agent-card=${i.id} ref=${ref}>
    <h3><${Md} text=${i.title} /></h3>
    <${Body} i=${i} info=${info} g=${g} stale=${doc.settings?.staleHours ?? 3} />
    <div class="row">
      ${isAgent(i) ? html`<button class="btn dark" onClick=${(e) => { const b = e.currentTarget.getBoundingClientRect(); checked(ref.current, b.left + b.width / 2, b.top + b.height / 2, board, i.id); }}>看过了</button>` : null}
      <button class="btn ${isAgent(i) ? "" : "dark"}" onClick=${(e) => finish(ref.current, e.currentTarget, doc, it, st)}>${st ? "✓ 今天做完了" : "✓ 做完了"}</button>
      ${i.status !== "doing" ? html`<button class="btn b-back" onClick=${() => it.patch({ status: "doing" })}>${i.status === "todo" ? "开始做" : "收回来自己做"}</button>` : null}
      <button class="btn b-edit" onClick=${() => setUi({ editing: key, adding: null })}>编辑</button>
      <button class="btn b-more" title="更多" data-pop-anchor onClick=${(e) => openPop("status", i.id, e.currentTarget, { from: isAgent(i) ? "agent" : undefined })}>⋯</button>
    </div>
  </div>`;
}

function GestureCard({ item: i, info }) {
  const board = useBoard(), { doc, setUi, act, locate } = board;
  const ref = useRef(null);
  useTilt(ref);
  const g = groupOf(doc, i.group), it = act.item(i.id), st = repeatState(i);
  const tap = isAgent(i) ? useDoubleTap((x, y) => checked(ref.current, x, y, board, i.id)) : {};
  const done = (origin) => finish(ref.current, origin, doc, it, st);
  const label = st ? "今天做完了" : "做完了";
  const key = isAgent(i) ? `i:${i.id}@agent` : `i:${i.id}`;
  return html`<div class=${`card agent g ${handedOff(i.id) ? "arrive" : ""}`} data-agent-card=${i.id} ref=${ref} ...${tap}>
    <div class="ag-head"><h3><${Md} text=${i.title} /></h3>
      <span class="ag-tools">
        <button class="rnd t-locate" title="定位" onClick=${() => locate(i.id)}><${LocateIcon} /></button>
        ${i.status !== "doing" ? html`<button class="rnd t-back" title=${i.status === "todo" ? "开始做" : "收回来自己做"} onClick=${() => it.patch({ status: "doing" })}>${i.status === "todo" ? html`<${StatusIcon} s="doing" />` : html`<${BackIcon} />`}</button>` : null}
        <button class="rnd t-edit" title="编辑" onClick=${() => setUi({ editing: key, adding: null })}><${EditIcon} /></button>
      </span>
    </div>
    <${Body} i=${i} info=${info} g=${g} stale=${doc.settings?.staleHours ?? 3} />
    <div class="ag-foot">${agentDoneOf(doc.theme) === "hold" ? html`<${HoldToDone} label=${label} onDone=${done} />` : html`<${SlideToDone} label=${label} onDone=${done} />`}</div>
  </div>`;
}

// ---- 手势（与上游一致）----
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SKIP = "button, a, input, textarea, select, .ag-done";

function useTilt(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let box = null, raf = 0, px = 0, py = 0;
    const paint = () => {
      raf = 0;
      if (!box) return;
      const deg = (size) => Math.min(6, (32 / size) * (180 / Math.PI));
      el.style.setProperty("--ry", `${(px * deg(box.width)).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-py * deg(box.height)).toFixed(2)}deg`);
      el.style.setProperty("--pp", `${Math.round(Math.max(800, box.width * 2.4))}px`);
      el.classList.add("tilting");
    };
    const enter = (e) => { if (e.pointerType === "mouse") box = el.getBoundingClientRect(); };
    const move = (e) => {
      if (e.pointerType !== "mouse") return;
      box ??= el.getBoundingClientRect();
      px = clamp(((e.clientX - box.left) / box.width) * 2 - 1, -1, 1);
      py = clamp(((e.clientY - box.top) / box.height) * 2 - 1, -1, 1);
      raf ||= requestAnimationFrame(paint);
    };
    const leave = () => { box = null; cancelAnimationFrame(raf); raf = 0; el.classList.remove("tilting"); };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    addEventListener("scroll", leave, { passive: true });
    return () => { leave(); el.removeEventListener("pointerenter", enter); el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); removeEventListener("scroll", leave); };
  }, []);
}

function useDoubleTap(onDouble) {
  const st = useRef({ t: 0, x: 0, y: 0, down: null });
  return {
    onPointerDown: (e) => { st.current.down = e.target.closest(SKIP) ? null : { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e) => {
      const s = st.current, d = s.down;
      s.down = null;
      if (!d || e.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
      const now = performance.now();
      if (now - s.t < 350 && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 30) { s.t = 0; onDouble(e.clientX, e.clientY); }
      else Object.assign(s, { t: now, x: e.clientX, y: e.clientY });
    },
    onMouseDown: (e) => { if (e.detail > 1 && !e.target.closest(SKIP)) e.preventDefault(); },
  };
}

function SlideToDone({ label, onDone }) {
  const ref = useRef(null);
  const set = (x, p) => { ref.current.style.setProperty("--x", `${x}px`); ref.current.style.setProperty("--p", p.toFixed(3)); };
  const reset = () => { const el = ref.current; if (!el?.isConnected) return; el.classList.remove("done"); set(0, 0); delete el.closest(".card").dataset.still; };
  const finishAt = (max, origin) => { set(max, 1); ref.current.classList.add("done"); onDone(origin).then(reset); };
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const track = ref.current, knob = e.currentTarget, card = track.closest(".card"), id = e.pointerId;
    const max = track.clientWidth - knob.offsetWidth - 2 * knob.offsetLeft, x0 = e.clientX;
    let x = 0, over = false;
    try { knob.setPointerCapture(id); } catch {}
    track.classList.add("dragging");
    card.dataset.still = "1";
    const end = (done) => {
      if (over) return;
      over = true;
      removeEventListener("pointermove", move, true); removeEventListener("pointerup", up, true); removeEventListener("pointercancel", cancel, true); removeEventListener("blur", up);
      ref.current?.classList.remove("dragging");
      if (done) finishAt(max, knob);
      else reset();
    };
    const move = (ev) => {
      if (ev.pointerId !== id) return;
      if (!(ev.buttons & 1)) return end(x >= max * 0.86);
      x = clamp(ev.clientX - x0, 0, max);
      set(x, x / max);
      if (x >= max - 0.5) end(true);
    };
    const up = (ev) => { if (ev.type === "blur" || ev.pointerId === id) end(x >= max * 0.86); };
    const cancel = (ev) => { if (ev.pointerId === id) end(false); };
    addEventListener("pointermove", move, true); addEventListener("pointerup", up, true); addEventListener("pointercancel", cancel, true); addEventListener("blur", up);
  };
  const onKeyDown = (e) => {
    if (!["Enter", " ", "ArrowRight"].includes(e.key) || e.repeat) return;
    e.preventDefault();
    const knob = e.currentTarget;
    ref.current.closest(".card").dataset.still = "1";
    finishAt(ref.current.clientWidth - knob.offsetWidth - 2 * knob.offsetLeft, knob);
  };
  return html`<div class="ag-done slide" ref=${ref}><span class="fill"></span><span class="lbl">${label}</span>
    <button class="knob" aria-label=${label} onPointerDown=${onPointerDown} onKeyDown=${onKeyDown}><${StatusIcon} s="done" /></button></div>`;
}

const HOLD_MS = 800;
function HoldToDone({ label, onDone }) {
  const ref = useRef(null), anim = useRef(null);
  const reset = () => { const b = ref.current; if (!b?.isConnected) return; b.classList.remove("holding", "done"); anim.current?.cancel(); anim.current = null; delete b.closest(".card").dataset.still; };
  const start = (e) => {
    if (e.button > 0) return;
    const b = ref.current, a0 = anim.current;
    if (b.classList.contains("done")) return;
    b.closest(".card").dataset.still = "1";
    b.classList.add("holding");
    if (a0) { a0.playbackRate = 1; return; }
    const a = b.querySelector(".fill").animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration: HOLD_MS, easing: reducedMotion() ? "linear" : "cubic-bezier(.45, 0, .7, 1)", fill: "forwards" });
    anim.current = a;
    a.finished.then(() => {
      if (anim.current !== a) return;
      if (a.playbackRate < 0) { a.cancel(); anim.current = null; delete b.closest(".card")?.dataset.still; return; }
      b.classList.remove("holding");
      b.classList.add("done");
      onDone(b).then(reset);
    }, () => {});
  };
  const stop = () => {
    const b = ref.current, a = anim.current;
    if (!a || b.classList.contains("done")) return;
    b.classList.remove("holding");
    a.playbackRate = -3;
  };
  const key = (e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(e); } };
  const keyUp = (e) => { if (e.key === "Enter" || e.key === " ") stop(); };
  return html`<button class="ag-done hold" ref=${ref} onPointerDown=${start} onPointerUp=${stop} onPointerLeave=${stop} onPointerCancel=${stop}
    onContextMenu=${(e) => e.preventDefault()} onKeyDown=${key} onKeyUp=${keyUp}><span class="fill"></span><span class="lbl"><${StatusIcon} s="done" />${label}</span></button>`;
}
