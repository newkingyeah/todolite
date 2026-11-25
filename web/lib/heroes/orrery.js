import { clamp, damp, rng, stage, TAU, wrapAngle } from "./kit.js";

export const meta = {
  id: "orrery",
  name: "三维天体仪",
  hint: "移动鼠标变换视角，悬停锁定行星，点击触发行星连珠",
};

// The original orrery's eight inclined orbits and Fibonacci sphere point clouds.
const BODIES = [
  ["sun", 22, 0, 0, 0, 0, 140],
  ["mercury", 3.5, 52, 0.024, 0.12, 0.8, 35],
  ["venus", 5.5, 82, 0.018, 0.06, 2.2, 48],
  ["earth", 6.2, 122, 0.013, 0, 4.1, 56],
  ["mars", 4.8, 162, 0.009, 0.04, 1.1, 42],
  ["jupiter", 15.5, 275, 0.005, 0.02, 3.5, 220],
  ["saturn", 12, 360, 0.0035, 0.05, 0.4, 110],
  ["uranus", 8.5, 435, 0.0022, 0.015, 5.2, 75],
  ["neptune", 8, 495, 0.0015, 0.03, 1.9, 70],
];
const EARTH_MOON = [[14, 0.06, 0]];
const GALILEAN_MOONS = [[22, 0.05, 0.2], [27, 0.038, 1.4], [33, 0.025, 3.1], [40, 0.018, 4.8]];
const DISTANCE = 1120;
const ALIGNMENT = Math.PI / 4;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function sphere(radius, count, banded, random) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - i * 2 / (count - 1);
    const circumference = Math.sqrt(1 - y * y) * radius;
    if (banded && random() > 0.15 + 0.85 * Math.abs(Math.sin(Math.asin(y) * 9))) continue;
    const angle = i * GOLDEN_ANGLE;
    points.push([Math.cos(angle) * circumference, y * radius, Math.sin(angle) * circumference]);
  }
  return points;
}

function camera(w, h, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  function project(x, y, z) {
    const across = x * cy + z * sy;
    const acrossDepth = -x * sy + z * cy;
    const depth = DISTANCE + y * sp + acrossDepth * cp;
    return { x: across / depth, y: (y * cp - acrossDepth * sp) / depth, depth };
  }
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let i = 0; i < 36; i++) {
    const a = i * TAU / 36;
    const p = project(528 * Math.cos(a), 14 * Math.sin(a), 528 * Math.sin(a));
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
  }
  // Vary the camera's pitch with the aspect ratio while retaining perspective proportions.
  const focal = Math.min(w * 0.93 / (right - left), h * 0.86 / (bottom - top));
  const centerX = (w - (left + right) * focal) / 2;
  const centerY = (h - (top + bottom) * focal) / 2;
  return (x, y, z) => {
    const p = project(x, y, z);
    return { x: centerX + p.x * focal, y: centerY + p.y * focal, scale: focal / p.depth, depth: p.depth };
  };
}

function orbitPath(ctx, project, radius, inclination, steps, x = 0, y = 0, z = 0) {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = i * TAU / steps;
    const p = project(x + radius * Math.cos(a), y + radius * inclination * Math.sin(a), z + radius * Math.sin(a));
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.stroke();
}

function orbitPoint(radius, inclination, angle) {
  return [radius * Math.cos(angle), radius * inclination * Math.sin(angle), radius * Math.sin(angle)];
}

function brackets(ctx, x, y, r, color) {
  const arm = r * 0.37;
  ctx.beginPath();
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      ctx.moveTo(x + sx * (r - arm), y + sy * r);
      ctx.lineTo(x + sx * r, y + sy * r);
      ctx.lineTo(x + sx * r, y + sy * (r - arm));
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.85;
  ctx.stroke();
}

function drawBody(ctx, project, body, mark, ink, red, time, quality) {
  const { id, proj, radius, points, world } = body;
  const { x, y, scale } = proj;
  const sun = id === "sun";
  const r = Math.max(sun ? 6.5 : 1.9, radius * scale);
  ctx.strokeStyle = mark ? red(0.72) : ink(0.65);
  ctx.lineWidth = 0.75;
  if (sun) {
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = i * TAU / 24 + time * 0.002;
      const extension = 1.31 + 0.08 * Math.sin(time * 0.014 + i);
      const co = Math.cos(a), si = Math.sin(a);
      ctx.moveTo(x + co * r * 1.11, y + si * r * 1.11);
      ctx.lineTo(x + co * r * extension, y + si * r * extension);
    }
    ctx.stroke();
    ctx.strokeStyle = mark ? red(0.6) : ink(0.37);
    for (const [index, size] of [1.4, 1.7, 2.05].entries()) {
      ctx.beginPath();
      ctx.ellipse(x, y, r * size, r * size * 0.38, index * 0.8 + time * 0.003 * (index % 2 ? -1 : 1), 0, TAU);
      ctx.stroke();
    }
  }
  if (id === "saturn" || id === "uranus") {
    for (const ring of (id === "saturn" ? [1.45, 1.75, 2.25, 2.55] : [1.85])) {
      ctx.beginPath();
      ctx.ellipse(x, y, r * ring, r * ring * 0.32, id === "saturn" ? 0.46 : 1.7, 0, TAU);
      ctx.stroke();
    }
  }
  if (r > 3) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.35, 0, 0, TAU);
    if (sun || id === "venus") {
      ctx.moveTo(x + r * 0.45, y);
      ctx.ellipse(x, y, r * 0.45, r, 0, 0, TAU);
    }
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.strokeStyle = mark ? red(0.94) : ink(0.9);
  ctx.stroke();

  ctx.beginPath();
  const dot = clamp(scale * 0.9, 0.46, sun ? 1.1 : 0.9);
  const step = quality > 0 ? 2 : (r > 3 ? 1 : 3);
  for (let i = 0; i < points.length; i += step) {
    const [dx, dy, dz] = points[i];
    const p = project(world[0] + dx, world[1] + dy, world[2] + dz);
    ctx.rect(p.x, p.y, dot, dot);
  }
  ctx.fillStyle = mark ? red(0.8) : ink(sun ? 0.78 : 0.65);
  ctx.fill();

  const moons = id === "earth" ? EARTH_MOON : id === "jupiter" ? GALILEAN_MOONS : [];
  if (id === "earth" && r > 2.4) {
    ctx.strokeStyle = ink(0.4);
    ctx.lineWidth = 0.55;
    orbitPath(ctx, project, 14, 0.18, 24, ...world);
  }
  ctx.fillStyle = mark ? red(0.87) : ink(0.72);
  for (const [distance, speed, phase] of moons) {
    const [dx, dy, dz] = orbitPoint(distance, 0.18, phase + time * speed);
    const p = project(world[0] + dx, world[1] + dy, world[2] + dz);
    ctx.beginPath();
    ctx.arc(p.x, p.y, id === "earth" ? 1.15 : 0.8, 0, TAU);
    ctx.fill();
  }
}

export function mount(canvas) {
  const random = rng(7251);
  const bodies = BODIES.map(([id, radius, distance, speed, inclination, phase, count]) => ({
    id, radius, distance, speed, inclination, phase,
    points: sphere(radius, count, id === "jupiter", random),
    natural: phase, angle: phase, proj: null, world: null,
  }));
  const asteroids = Array.from({ length: 450 }, () => {
    const distance = 192 + random() * 46;
    return { distance, angle: random() * TAU, speed: (0.007 + random() * 0.002) * (200 / distance), height: (random() - 0.5) * 7 };
  });
  let aligned = false, alignment = 0, time = 0, shockAt = -Infinity;

  return stage(canvas, {
    stillT: 2800,
    click(_x, _y, t) {
      aligned = !aligned;
      shockAt = t;
    },
    frame({ ctx, w, h, t, dt, q, ptr, ink, red, still }) {
      const elapsed = dt * 0.06;
      if (!still) time += elapsed;
      const clock = still ? 32 : time;
      const merge = still ? Number(aligned) : (alignment += (Number(aligned) - alignment) * damp(dt, 270));
      const k = still || ptr.k < 0.001 ? 0 : ptr.k;
      const nx = clamp((ptr.sx / w - 0.5) * 2, -1, 1) * k;
      const ny = clamp((ptr.sy / h - 0.5) * 2, -1, 1) * k;
      const pitch = clamp(0.98 * h / w, 0.19, 0.51);
      const project = camera(w, h, -0.65 + nx * 0.34 + Math.sin(clock * 0.005) * 0.08, pitch + ny * 0.085);
      const steps = [88, 64, 44][q];
      const waveAge = t - shockAt;
      const wave = !still && waveAge >= 0 && waveAge <= 1500 ? waveAge * 0.37 : -1;

      let selected = null, nearest = 17;
      for (const body of bodies) {
        if (!still) {
          body.natural = (body.natural + elapsed * body.speed * (1 - merge * 0.85)) % TAU;
          const target = aligned ? ALIGNMENT : body.natural;
          body.angle += wrapAngle(target - body.angle) * damp(dt, aligned ? 255 : 90);
        }
        const angle = still ? (aligned ? ALIGNMENT : body.phase + body.speed * clock) : body.angle;
        body.world = orbitPoint(body.distance, body.inclination, angle);
        body.proj = project(...body.world);
        const distance = Math.hypot(body.proj.x - ptr.x, body.proj.y - ptr.y) - Math.min(9, body.radius * body.proj.scale * 0.44);
        if (!still && ptr.inside && distance < nearest) {
          selected = body;
          nearest = distance;
        }
      }

      // Hairline ecliptic axes and reference circles accompany the filled star chart.
      ctx.lineWidth = 0.55;
      ctx.strokeStyle = ink(0.17);
      ctx.setLineDash([1.7, 4]);
      for (const radius of [105, 185, 250, 320, 398, 520]) orbitPath(ctx, project, radius, 0, steps);
      ctx.setLineDash([]);
      ctx.beginPath();
      for (const [a, b] of [[[-530, 0, 0], [530, 0, 0]], [[0, 0, -530], [0, 0, 530]]]) {
        const p = project(...a), e = project(...b);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(e.x, e.y);
      }
      ctx.stroke();
      for (const body of bodies.slice(1)) {
        ctx.strokeStyle = selected === body ? red(0.7) : ink(0.32);
        ctx.lineWidth = selected === body ? 0.95 : 0.65;
        orbitPath(ctx, project, body.distance, body.inclination, steps);
      }

      if (wave > 0) {
        ctx.strokeStyle = red(0.72 * (1 - waveAge / 1500));
        ctx.lineWidth = 1;
        ctx.setLineDash([3.5, 3.5]);
        orbitPath(ctx, project, wave, 0, steps);
        ctx.setLineDash([]);
      }
      if (merge > 0.035) {
        const from = project(...orbitPoint(-46, 0, ALIGNMENT));
        const to = project(...orbitPoint(532, 0, ALIGNMENT));
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = red(merge * 0.82);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.beginPath();
      for (let i = 0; i < asteroids.length; i += q ? 2 : 1) {
        const dust = asteroids[i];
        const angle = dust.angle + clock * dust.speed;
        const pulsing = wave < 0 ? 0 : Math.max(0, 1 - Math.abs(dust.distance - wave) / 31) * 9;
        const p = project(dust.distance * Math.cos(angle), dust.height + pulsing, dust.distance * Math.sin(angle));
        const dot = i % 7 === 0 ? 1.15 : 0.72;
        ctx.rect(p.x, p.y, dot, dot);
      }
      ctx.fillStyle = ink(0.54);
      ctx.fill();

      for (const body of [...bodies].sort((a, b) => b.proj.depth - a.proj.depth)) {
        drawBody(ctx, project, body, selected === body, ink, red, clock, q);
      }
      if (selected) {
        const { proj, radius } = selected;
        brackets(ctx, proj.x, proj.y, Math.max(9, 5 + radius * proj.scale * 1.25), red(0.92));
      }
    },
  });
}
