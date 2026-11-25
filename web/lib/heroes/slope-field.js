import { clamp, rng, stage, TAU } from "./kit.js";

export const meta = {
  id: "slope-field",
  name: "斜率场",
  hint: "流线随方程轮换，鼠标扫过或点击时会带出粒子",
};

const CHANGE_MS = 3000;
const logAbs = (value) => Math.log(Math.max(1e-6, Math.abs(value)));
const unit = () => 1;
const waves = (x, y) => Math.sin(x) * Math.cos(y);
// The twelve vector fields used by the original standalone preview.
const FIELDS = [
  [(_x, y) => Math.cos(y), Math.sin],
  [(x, y) => Math.cos(y * 5) * x * 0.3, (x, y) => Math.sin(x * 5) * y * 0.3],
  [unit, (x, y) => Math.cos(x * y)],
  [unit, waves],
  [unit, (x, y) => Math.cos(x) * y * y],
  [unit, (x, y) => logAbs(x) * logAbs(y)],
  [unit, (x, y) => Math.tan(x) * Math.cos(y)],
  [(_x, y) => Math.sin(y * 0.1) * 3, (x) => -Math.sin(x * 0.1) * 3],
  [(_x, y) => y / 3, (x) => (x - x * x * x) * 0.01],
  [(_x, y) => -y, (x) => -Math.sin(x)],
  [(_x, y) => -1.5 * y, (x, y) => -y - Math.sin(1.5 * x) + 0.7],
  [(x, y) => Math.sin(y) * Math.cos(x), waves],
];
const PEN_WIDTHS = [0.5, 0.76, 1.12, 1.7];
const PEN_OPACITIES = [0.24, 0.36, 0.48, 0.66];

export function mount(canvas) {
  let field = null;
  let pending = [];
  let emittedAt = -Infinity;

  function respawn(s, particle) {
    const { random, w, h, scale } = s;
    particle.x = (random() - 0.5) * w / scale;
    particle.y = (random() - 0.5) * h / scale;
    particle.life = 4200 + random() * 7800;
  }

  function particle(s, plume) {
    const { random } = s;
    const speed = (0.1 + random() * 0.9) * (random() < 0.5 ? -1 : 1);
    const pen = Math.floor(random() ** 1.65 * PEN_WIDTHS.length);
    return { x: 0, y: 0, speed, pen: plume ? Math.max(1, pen) : pen, life: 0, plume };
  }

  function emit(s, px, py, count, radius) {
    const { particles, random, w, h, scale } = s;
    const available = Math.min(count, s.limit - particles.length);
    for (let i = 0; i < available; i++) {
      const p = particle(s, true);
      const angle = random() * TAU;
      const offset = Math.sqrt(random()) * radius;
      p.x = (px - w / 2 + Math.cos(angle) * offset) / scale;
      p.y = (py - h / 2 + Math.sin(angle) * offset) / scale;
      p.life = 1200 + random() * 1800;
      particles.push(p);
    }
  }

  function trace(s, dt, mode, ink, stride) {
    const { ctx, w, h, scale, particles } = s;
    const paths = PEN_WIDTHS.map(() => new Path2D());
    const [slopeX, slopeY] = FIELDS[mode];
    const step = dt * 0.002;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - 0.96 ** (dt / 16.667)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";

    const xLimit = (w / 2 + 18) / scale;
    const yLimit = (h / 2 + 18) / scale;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const x = p.x;
      const y = p.y;
      const vx = slopeX(x, y);
      const vy = slopeY(x, y);
      // Limit the step near singularities while preserving the direction.
      const go = step * p.speed / Math.max(1, Math.hypot(vx, vy) / 3.6);
      p.x += vx * go;
      p.y += vy * go;
      p.life -= dt;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)
          || Math.abs(p.x) > xLimit || Math.abs(p.y) > yLimit || p.life <= 0) {
        if (p.plume) {
          particles[i] = particles[particles.length - 1];
          particles.pop();
        } else {
          respawn(s, p);
        }
        continue;
      }
      if (!p.plume && i % stride !== 0) continue;
      paths[p.pen].moveTo(w / 2 + x * scale, h / 2 + y * scale);
      paths[p.pen].lineTo(w / 2 + p.x * scale, h / 2 + p.y * scale);
    }

    for (let i = 0; i < paths.length; i++) {
      ctx.lineWidth = PEN_WIDTHS[i];
      ctx.strokeStyle = ink(PEN_OPACITIES[i]);
      ctx.stroke(paths[i]);
    }
  }

  function layout(w, h, dpr, still, ink, color) {
    const layer = canvas.ownerDocument.createElement("canvas");
    const density = Math.min(dpr, 1.5);
    layer.width = Math.ceil(w * density);
    layer.height = Math.ceil(h * density);
    const ctx = layer.getContext("2d");
    ctx.scale(layer.width / w, layer.height / h);
    ctx.lineCap = "round";
    const count = Math.round(clamp(w * h / 290, 220, 660));
    const s = {
      w, h, still, ctx, layer, color,
      scale: clamp(h / 7, w / 34, w / 16),
      random: rng(8861),
      particles: [],
      limit: count + 200,
    };
    for (let i = 0; i < count; i++) {
      const p = particle(s, false);
      respawn(s, p);
      s.particles.push(p);
    }
    // Establish visible trajectories even on the first frame and in reduced motion.
    for (let i = 0; i < 20; i++) trace(s, 30, 0, ink, 1);
    return s;
  }

  function frame({ ctx, w, h, dpr, t, dt, q, ptr, ink, col, still }) {
    if (!field || field.w !== w || field.h !== h || field.still !== still) {
      field = layout(w, h, dpr, still, ink, col.ink);
      emittedAt = -Infinity;
    } else if (field.color !== col.ink) {
      field.ctx.globalCompositeOperation = "source-in";
      field.ctx.fillStyle = ink(1);
      field.ctx.fillRect(0, 0, w, h);
      field.ctx.globalCompositeOperation = "source-over";
      field.color = col.ink;
    }

    if (!still && dt > 0) {
      for (const [x, y] of pending) emit(field, x, y, 38, h * 0.19);
      if (ptr.inside && t - ptr.at < 190 && t - emittedAt > 56) {
        emit(field, ptr.sx, ptr.sy, 6, h * 0.075);
        emittedAt = t;
      }
      const mode = Math.floor(t / CHANGE_MS) % FIELDS.length;
      trace(field, Math.min(dt, 40), mode, ink, q + 1);
    }
    if (still || dt > 0) pending = [];
    ctx.drawImage(field.layer, 0, 0, w, h);
  }

  function click(x, y) {
    if (!field?.still && pending.length < 6) pending.push([x, y]);
  }

  return stage(canvas, { frame, click, stillT: 600 });
}
