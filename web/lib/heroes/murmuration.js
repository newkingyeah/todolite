import { stage, clamp, rng, TAU } from "./kit.js";

export const meta = {
  id: "murmuration",
  name: "鸟群",
  hint: "悬停时鸟群让开并标出最近的鸟；点击放飞新鸟。",
};

const STEP = 1000 / 60;
const MAX_BIRDS = 88;
const TRAIL_LENGTH = 13;
const CLICK_DURATION = 1900;
const SIDES = [-1, 1];

export function mount(canvas) {
  let width = 0;
  let height = 0;
  let scale = 1;
  let time = 0;
  let sampleTrail = 0;
  let nextId = 0;
  let random = rng(721894);
  let marked = null;
  const birds = [];
  const ripples = [];

  function spawn(x, y, vx, vy, born = time) {
    const bird = {
      id: nextId++,
      x: clamp(x, 0, width),
      y: clamp(y, 0, height),
      vx,
      vy,
      depth: random(),
      flap: random() * TAU,
      born,
      trail: [],
    };
    birds.push(bird);
    if (birds.length > MAX_BIRDS) birds.shift();
    return bird;
  }

  function arrange(w, h) {
    width = w;
    height = h;
    scale = clamp(h / 220, 0.62, 1.3);
    random = rng(721894);
    nextId = 0;
    sampleTrail = 0;
    marked = null;
    birds.length = 0;
    ripples.length = 0;
    const count = Math.round(clamp(w / 18, 25, 58));
    const groups = w < 500 ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const group = i % groups;
      const center = (group + 0.5) / groups;
      const x = w * (center + (random() - 0.5) * 0.77 / groups);
      const y = h * (0.49 + Math.sin(center * TAU) * 0.15 + (random() - 0.5) * 0.57);
      const heading = (group % 2 ? Math.PI : 0) + (random() - 0.5) * 1.18;
      const speed = (1.2 + random() * 0.68) * scale;
      const bird = spawn(x, y, Math.cos(heading) * speed, Math.sin(heading) * speed, -1000);
      for (let j = TRAIL_LENGTH - 1; j >= 0; j--) {
        bird.trail.push(x - j * bird.vx * 1.8, y - j * bird.vy * 1.8);
      }
    }
  }

  function advance(dt, ptr) {
    time += dt;
    const steps = clamp(dt / STEP, 0, 2.5);
    const spacing = 42 * scale;
    const view = 92 * scale;
    const viewSquared = view * view;
    const border = Math.min(35 * scale, width * 0.23, height * 0.24);
    const recordTrail = time >= sampleTrail;
    if (recordTrail) sampleTrail = time + 43;

    for (const b of birds) {
      let vx = 0, vy = 0, cx = 0, cy = 0, sx = 0, sy = 0, count = 0;
      for (const other of birds) {
        if (other === b) continue;
        const dx = other.x - b.x, dy = other.y - b.y;
        const squared = dx * dx + dy * dy;
        if (squared >= viewSquared) continue;
        vx += other.vx;
        vy += other.vy;
        cx += other.x;
        cy += other.y;
        count++;
        if (squared < spacing * spacing && squared > 0) {
          const distance = Math.sqrt(squared);
          const force = (1 - distance / spacing) / distance;
          sx -= dx * force;
          sy -= dy * force;
        }
      }
      let ax = Math.cos(time * 0.0007 + b.id) * 0.015;
      let ay = Math.sin(time * 0.0009 + b.id * 1.7) * 0.014;
      if (count > 0) {
        ax += (vx / count - b.vx) * 0.05 + (cx / count - b.x) * 0.0005 + sx * 0.15;
        ay += (vy / count - b.vy) * 0.05 + (cy / count - b.y) * 0.0011 + sy * 0.1;
      }
      ax += (clamp((border - b.x) / border) - clamp((b.x - width + border) / border)) * 0.24;
      ay += (clamp((border - b.y) / border) - clamp((b.y - height + border) / border)) * 0.25;
      if (ptr.inside) {
        const dx = b.x - ptr.x, dy = b.y - ptr.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < view) {
          const force = 0.23 * (1 - distance / view) / distance;
          ax += dx * force;
          ay += dy * force;
        }
      }
      for (const ripple of ripples) {
        const dx = b.x - ripple.x, dy = b.y - ripple.y;
        const distance = Math.hypot(dx, dy);
        if (distance === 0) continue;
        const progress = clamp((time - ripple.at) / CLICK_DURATION);
        const wave = Math.abs(distance - progress * 225 * scale);
        const force = 0.18 * (1 - progress) * clamp(1 - wave / (25 * scale)) / distance;
        ax += dx * force;
        ay += dy * force;
      }
      b.nextX = b.vx + ax * steps;
      b.nextY = b.vy + ay * steps;
    }

    for (const bird of birds) {
      const speed = Math.hypot(bird.nextX, bird.nextY);
      const factor = speed > 0 ? clamp(speed, 1.06 * scale, 2.59 * scale) / speed : 1;
      bird.vx = bird.nextX * factor;
      bird.vy = bird.nextY * factor;
      bird.x = clamp(bird.x + bird.vx * steps, 3, Math.max(3, width - 3));
      bird.y = clamp(bird.y + bird.vy * steps, 3, Math.max(3, height - 3));
      bird.depth = clamp(bird.depth + Math.sin(time * 0.0004 + bird.id) * 0.002 * steps);
      bird.flap += 0.16 * steps * (0.6 + speed * 0.4);
      if (recordTrail) {
        bird.trail.push(bird.x, bird.y);
        if (bird.trail.length > TRAIL_LENGTH * 2) bird.trail.splice(0, 2);
      }
    }
    while (ripples.length && time - ripples[0].at > CLICK_DURATION) ripples.shift();
    if (marked && time - marked.at > CLICK_DURATION) marked = null;
  }

  function drawBird(ctx, bird, stroke) {
    const size = (0.59 + bird.depth * 0.88) * scale;
    const length = 7.6 * size;
    const wing = 5.7 * size;
    const flap = (Math.sin(bird.flap) + 1) * 0.5;
    const spread = 0.3 + flap * 0.7;
    const tip = -length * (0.7 - flap * 0.35);
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(Math.atan2(bird.vy, bird.vx));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.77;
    ctx.beginPath();
    ctx.moveTo(length * 1.1, 0);
    ctx.lineTo(-length * 0.48, 0);
    for (const side of SIDES) {
      ctx.moveTo(-length * 0.45, 0);
      ctx.lineTo(-length * 0.95, side * length * 0.16);
      ctx.moveTo(length * 0.3, 0);
      const span = side * wing * spread;
      ctx.quadraticCurveTo(length * 0.15, span * 1.1, tip, span);
      ctx.quadraticCurveTo(-length * 0.15, span * 0.35, -length * 0.15, 0);
    }
    ctx.stroke();
    ctx.restore();
  }

  function reticle(ctx, bird, stroke, radius) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.68;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(bird.x, bird.y, radius, 0, TAU);
    ctx.moveTo(bird.x, bird.y);
    ctx.lineTo(bird.x + bird.vx * 20, bird.y + bird.vy * 20);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function frame({ ctx, w, h, dt, ptr, q, still, ink, red }) {
    if (w !== width || h !== height) arrange(w, h);
    if (!still && dt > 0) advance(dt, ptr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.lineWidth = 0.5;
    for (const bird of birds) {
      if (bird.id % (q > 0 ? 13 : 9) !== 0) continue;
      const heading = Math.atan2(bird.vy, bird.vx);
      for (let ring = 1; ring <= (q > 0 ? 2 : 3); ring++) {
        ctx.strokeStyle = ink(0.072 / ring);
        ctx.beginPath();
        const radius = (ring * 17 + Math.sin(time * 0.001 + bird.id) * 1.5) * scale;
        ctx.ellipse(bird.x, bird.y, radius, ring * 12 * scale, heading, 0, TAU);
        ctx.stroke();
      }
    }

    let target = null;
    let distance = (106 * scale) ** 2;
    for (const bird of birds) {
      if (bird.trail.length > 4 && (q < 2 || bird.id % 2 === 0)) {
        ctx.strokeStyle = ink(0.09 + bird.depth * 0.15);
        if (bird.id % 7 === 0) ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(bird.trail[0], bird.trail[1]);
        for (let i = 2; i < bird.trail.length; i += 2) ctx.lineTo(bird.trail[i], bird.trail[i + 1]);
        ctx.lineTo(bird.x, bird.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const age = still ? 1 : clamp((time - bird.born + 190) / 580);
      drawBird(ctx, bird, ink((0.37 + bird.depth * 0.57) * age));
      ctx.lineWidth = 0.5;
      if (!still && ptr.inside) {
        const squared = (bird.x - ptr.x) ** 2 + (bird.y - ptr.y) ** 2;
        if (squared < distance) {
          target = bird;
          distance = squared;
        }
      }
    }

    ctx.lineWidth = 0.7;
    for (const ripple of ripples) {
      const progress = clamp((time - ripple.at) / CLICK_DURATION);
      const radius = 5 + progress * 4;
      ctx.strokeStyle = red((1 - progress) * 0.69);
      ctx.beginPath();
      ctx.moveTo(ripple.x - radius, ripple.y);
      ctx.lineTo(ripple.x + radius, ripple.y);
      ctx.moveTo(ripple.x, ripple.y - radius);
      ctx.lineTo(ripple.x, ripple.y + radius);
      ctx.stroke();
    }
    if (target && target !== marked?.bird) reticle(ctx, target, ink(0.38), 12 * scale);
    if (marked) {
      const life = clamp(1 - (time - marked.at) / CLICK_DURATION);
      reticle(ctx, marked.bird, red(0.76 * life), (13 + (1 - life) * 8) * scale);
    }
  }

  function click(x, y) {
    if (!width || !height) return;
    ripples.push({ x, y, at: time });
    if (ripples.length > 4) ripples.shift();
    for (let i = 0; i < 5; i++) {
      const angle = random() * TAU;
      const dx = Math.cos(angle) * scale, dy = Math.sin(angle) * scale;
      const bird = spawn(x + dx * 8, y + dy * 8, dx * 2.5, dy * 2.5);
      marked = { bird, at: time };
    }
  }

  return stage(canvas, { frame, click });
}
