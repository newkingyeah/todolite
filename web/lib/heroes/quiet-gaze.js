import { clamp, damp, rng, smooth, stage, TAU } from "./kit.js";

export const meta = {
  id: "quiet-gaze",
  name: "暗处回望",
  hint: "光标经过，瞳孔慢半拍望过来。"
};

const RADIUS = 48;
const TILT = -0.053;
const THREAD_SEGMENTS = 44;

// Trace the lid and its longer outer folds with the same tension at the corners.
function lid(ctx, sign, open, width, drift) {
  const end = width;
  const arch = sign * open;
  ctx.moveTo(-end, 0);
  ctx.bezierCurveTo(
    -end * 0.69, arch * 0.57,
    -end * 0.25 + drift, arch * 1.43,
    end * 0.13 + drift, arch * 0.98
  );
  ctx.bezierCurveTo(
    end * 0.50, arch * 0.75,
    end * 0.74, arch * 0.25,
    end, 0
  );
}

function aperture(ctx, open, drift) {
  ctx.beginPath();
  lid(ctx, -1, 53 * open, 207, drift);
  ctx.bezierCurveTo(
    156, 17 * open,
    80 + drift, 42 * open,
    12 + drift, 43 * open
  );
  ctx.bezierCurveTo(
    -65 + drift, 44 * open,
    -147, 25 * open,
    -207, 0
  );
  ctx.closePath();
}

function irisTexture() {
  const texture = document.createElement("canvas");
  const ctx = texture.getContext("2d");
  const random = rng(42027);
  const r = RADIUS;
  texture.width = texture.height = r * 4;
  ctx.setTransform(2, 0, 0, 2, texture.width / 2, texture.height / 2);

  const base = ctx.createRadialGradient(0, 0, 12, 0, 0, r);
  base.addColorStop(0, "#17202d");
  base.addColorStop(0.39, "#283748");
  base.addColorStop(0.66, "#2d4656");
  base.addColorStop(0.84, "#213747");
  base.addColorStop(0.97, "#12202b");
  base.addColorStop(1, "#080c14");
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  for (let strand = 0; strand < 360; strand++) {
    const a = random() * TAU;
    const start = 15 + random() * 23;
    const end = Math.min(r - 1, start + 4 + random() * 24);
    const curl = (random() - 0.5) * 0.14;
    const middle = (start + end) / 2;
    const shadow = strand % 4 === 0;
    const lit = 0.50 + 0.50 * Math.sin(a - 0.68) ** 2;
    ctx.strokeStyle = shadow
      ? `rgba(4, 8, 13, ${0.32 + random() * 0.48})`
      : `rgba(139, 181, 194, ${(0.10 + random() * 0.42) * lit})`;
    ctx.lineWidth = 0.28 + random() * 0.95;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * start, Math.sin(a) * start);
    ctx.quadraticCurveTo(
      Math.cos(a + curl) * middle, Math.sin(a + curl) * middle,
      Math.cos(a + 0.6 * curl) * end, Math.sin(a + 0.6 * curl) * end
    );
    ctx.stroke();
  }

  const collar = ctx.createRadialGradient(0, 0, 19, 0, 0, 25);
  collar.addColorStop(0, "#020408");
  collar.addColorStop(0.55, "#080d12");
  collar.addColorStop(0.8, "rgba(45, 60, 64, 0.48)");
  collar.addColorStop(1, "rgba(14, 20, 25, 0)");
  ctx.fillStyle = collar;
  ctx.beginPath();
  ctx.arc(0, 0, 25, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#04060a";
  ctx.beginPath();
  ctx.arc(0, 0, 18.5, 0, TAU);
  ctx.fill();
  return texture;
}

function makeThreads(random) {
  return Array.from({ length: 16 }, (_, i) => ({
    direction: i < 8 ? -1 : 1,
    layer: i % 8,
    phase: random() * TAU,
    span: 208 + random() * 94 + (i % 8) * 14,
    sway: 2.5 + random() * 5,
  }));
}

function drawThreads(ctx, threads, t, open) {
  const tones = ctx.createLinearGradient(-360, 0, 360, 0);
  tones.addColorStop(0, "rgba(91, 107, 132, 0)");
  tones.addColorStop(0.21, "rgba(100, 120, 144, 0.30)");
  tones.addColorStop(0.55, "rgba(108, 142, 168, 0.55)");
  tones.addColorStop(0.79, "rgba(100, 118, 138, 0.25)");
  tones.addColorStop(1, "rgba(91, 107, 132, 0)");
  ctx.strokeStyle = tones;

  for (const { direction, layer, phase, span, sway } of threads) {
    const height = 49 + 5.6 * layer - (1 - open) * (7 - layer * 0.7);
    ctx.globalAlpha = 0.50 - 0.043 * layer;
    ctx.lineWidth = layer === 0 ? 1.05 : 0.72;
    ctx.beginPath();
    for (let i = 0; i <= THREAD_SEGMENTS; i++) {
      const u = 2 * i / THREAD_SEGMENTS - 1;
      const x = u * span;
      const envelope = Math.max(0, 1 - u * u) ** 1.7;
      const ripple = sway * Math.sin(4.1 * u + t * 0.33 + phase) + 1.8 * Math.sin(8 * u - t * 0.53 + phase);
      const arm = 8 * u + 5 * Math.sin(3.6 * u + phase * 0.5);
      const y = direction * (height + ripple) * envelope + arm;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawEye(ctx, texture, seconds, open, gazeX, gazeY) {
  const drift = 3.8 * Math.sin(seconds * 0.69 + 0.4);
  const irisX = 7 + gazeX;
  const irisY = -4 + gazeY;
  const interior = ctx.createLinearGradient(0, -55, 0, 45);
  interior.addColorStop(0, "#080c13");
  interior.addColorStop(0.38, "#0b101a");
  interior.addColorStop(0.65, "#151e29");
  interior.addColorStop(1, "#141c27");

  ctx.save();
  aperture(ctx, open, drift);
  ctx.fillStyle = interior;
  ctx.fill();
  ctx.clip();

  const sheen = ctx.createRadialGradient(11, 31, 0, 11, 31, 128);
  sheen.addColorStop(0, "rgba(99, 128, 147, 0.15)");
  sheen.addColorStop(1, "rgba(99, 128, 147, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-201, -52, 402, 97);

  ctx.save();
  ctx.translate(irisX, irisY);
  ctx.rotate(0.024 * Math.sin(seconds * 0.44) + gazeX * 0.001);
  ctx.drawImage(texture, -RADIUS, -RADIUS, RADIUS * 2, RADIUS * 2);
  ctx.restore();

  // The catchlight stays above the pupil and shifts less than the pupil itself.
  const shineX = irisX - 12 - gazeX * 0.21;
  const shineY = irisY - 20 - gazeY * 0.17;
  const glow = ctx.createRadialGradient(shineX, shineY, 0, shineX, shineY, 8);
  glow.addColorStop(0, "rgba(176, 209, 223, 0.24)");
  glow.addColorStop(1, "rgba(176, 209, 223, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(shineX - 8, shineY - 8, 16, 16);
  ctx.fillStyle = "rgba(190, 215, 227, 0.58)";
  ctx.beginPath();
  ctx.ellipse(shineX, shineY, 2.8, 1.15, -0.42, 0, TAU);
  ctx.fill();
  ctx.restore();

  const edge = ctx.createLinearGradient(-207, 0, 207, 0);
  edge.addColorStop(0, "rgba(72, 97, 115, 0.30)");
  edge.addColorStop(0.31, "rgba(153, 175, 187, 0.67)");
  edge.addColorStop(0.66, "rgba(104, 132, 152, 0.63)");
  edge.addColorStop(1, "rgba(74, 94, 112, 0.24)");
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.1;
  aperture(ctx, open, drift);
  ctx.stroke();
  ctx.beginPath();
  lid(ctx, -1, 53 * open + 4.7, 213, drift);
  ctx.strokeStyle = "rgba(125, 153, 174, 0.29)";
  ctx.lineWidth = 0.75;
  ctx.stroke();
}

function openness(t) {
  // Independent intervals avoid a mechanical closing rhythm.
  const sequence = [7200, 16680, 23390, 34830];
  const elapsed = t % 42010;
  for (const moment of sequence) {
    const phase = elapsed - moment;
    if (phase >= 0 && phase < 320) {
      const closed = phase < 90 ? smooth(phase / 90) : 1 - smooth((phase - 90) / 230);
      return 1 - 0.87 * closed;
    }
  }
  return 1;
}

export function mount(canvas) {
  const random = rng(9281);
  const threads = makeThreads(random);
  const texture = irisTexture();
  const dust = Array.from({ length: 92 }, () => ({
    x: random() * 2 - 1,
    y: random() * 2 - 1,
    phase: random() * TAU,
    alpha: 0.10 + random() * 0.24,
    size: 0.40 + random() * 0.62,
  }));
  let followX = 0;
  let followY = 0;
  let background = null;
  let lastWidth = 0;
  let lastHeight = 0;

  return stage(canvas, {
    stillT: 1900,
    frame({ ctx, w, h, t, dt, ptr, still }) {
      if (w !== lastWidth || h !== lastHeight) {
        // Chrome stores gradient coordinates in the draw space, so the cache can be
        // reused at the stage's current device-pixel ratio.
        background = ctx.createRadialGradient(w * 0.49, h * 0.49, 8, w * 0.49, h * 0.49, Math.max(w * 0.52, h));
        background.addColorStop(0, "#151e2b");
        background.addColorStop(0.43, "#0e141f");
        background.addColorStop(1, "#070a11");
        lastWidth = w;
        lastHeight = h;
      }
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);

      const seconds = t / 1000;
      const centerX = w * 0.50;
      const centerY = h * 0.50;
      const scale = Math.min(w / 505, h / 220);
      // The gaze recedes into a slow idle drift when the pointer leaves the canvas.
      const engaged = ptr.inside && !still;
      const targetX = engaged ? 21 * clamp((ptr.x - centerX) / (w * 0.37), -1, 1) : 0;
      const targetY = engaged ? 9 * clamp((ptr.y - centerY) / (h * 0.40), -1, 1) : 0;
      const ease = damp(dt, engaged ? 180 : 340);
      followX = still ? 0 : followX + (targetX - followX) * ease;
      followY = still ? 0 : followY + (targetY - followY) * ease;
      const resting = 1 - ptr.k;
      const idleX = 3.5 * Math.sin(seconds * 0.57) + 1.5 * Math.sin(seconds * 1.21 + 0.2);
      const idleY = 1.4 * Math.sin(seconds * 0.68 + 0.7);

      ctx.fillStyle = "#7892a9";
      for (const mote of dust) {
        const x = centerX + mote.x * w * 0.49 + Math.sin(seconds * 0.21 + mote.phase) * 5;
        const y = centerY + mote.y * h * 0.47 + Math.cos(seconds * 0.27 + mote.phase) * 3;
        const flicker = 0.63 + 0.37 * Math.sin(seconds * 0.41 + mote.phase);
        ctx.globalAlpha = mote.alpha * flicker;
        ctx.fillRect(x, y, mote.size, mote.size);
      }
      ctx.globalAlpha = 1;

      const open = openness(t);
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(scale, scale);
      ctx.rotate(TILT);
      drawThreads(ctx, threads, seconds, open);
      drawEye(ctx, texture, seconds, open, followX + idleX * resting, followY + idleY * resting);
      ctx.restore();
    }
  });
}
