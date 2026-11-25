# Header animations

The animation at the top of the board. Each header animation is one file; `kit.js` is the shared base they all build on; `index.js` is the list, and its order is the order of the slider in layout editing.

## What a header animation looks like

```js
import { stage, clamp, smooth, rng } from "./kit.js";

export const meta = { id: "xxx", name: "Name", hint: "One sentence: what it draws, what the pointer and clicks do" };

export function mount(canvas) {
  let G = null;                      // all of its own state goes here
  function frame({ ctx, w, h, t, dt, ptr, ink, red, paper, still, q }) {
    if (!G || G.w !== w || G.h !== h) G = layout(w, h);   // lay out again when the size changes
    // ... draw one frame
  }
  return stage(canvas, { frame, click: (x, y, t) => { /* a click */ }, stillT: 4000 });
}
```

What `frame` receives:

| | |
|---|---|
| `ctx`, `w`, `h` | A canvas context already scaled for the device pixel ratio and filled with the background color; `w` and `h` are in CSS pixels |
| `t`, `dt` | The header animation's own time (ms) and the time since the previous frame; the `t` passed to a click is on the same timeline |
| `ptr` | The pointer: `x`, `y` raw position, `sx`, `sy` smoothed position, `k` from 0 to 1 for whether it is over the canvas (it fades in and out gradually) |
| `ink(a)`, `red(a)`, `paper` | Ink and red (`--hero-flag`) with alpha `a`, and the background color; they follow light/dark mode |
| `still` | The system has prefers-reduced-motion on: draw just this one frame; `t` is `stillT` |
| `q` | Quality level 0, 1 or 2, raised automatically (cheaper drawing) when frames are too slow; it is fine to ignore it |

`name` is the name shown on the slider and in the settings drawer; `hint` is shown only on the preview page, never on the board (every word on the board should be its owner's own; the board adds no explanations).

`kit.js` already takes care of the following, so a header animation does not have to: canvas size, the `requestAnimationFrame` loop, pausing when scrolled off screen or when the tab is switched away, prefers-reduced-motion, pointer coordinates and smoothing, colors, lowering the quality when frames are too slow, and reporting an error in a frame only once while the animation keeps running. It also has a few small helpers: `clamp`, `lerp`, `smooth`, `easeOut`, `damp(dt, ms)`, `rng(seed)` (reproducible random numbers), `gauss`, `noise3`.

## Rules

1. **No text in the picture.** No titles, readouts, axes, labels or captions in a corner (argus, which is completely clean, is the standard). `test-heroes.mjs` checks for `ctx.fillText` / `ctx.strokeText`.
2. **Ink with a touch of red.** Use `ink`, `red` and `paper` for theme-aware scenes. Scenes built around darkness can use their own restrained palette.
3. **Motion is continuous.** Follow a new target with a spring or damping instead of jumping in steps; when the target changes midway, start from the current position, not from the previous target.
4. **Make it look refined**, not like an engineering drawing. No dash-dot center lines, crosshair marks, hatching or dense annotations.
5. **Respond to the pointer** in a way that clearly reads as cause and effect. Add a click response when it fits the artwork.
6. **Under prefers-reduced-motion, draw a good-looking still frame.** Do not start from a fade-in (the first frame would be empty), and a click must not throw an error either.
7. **Fast.** At 1040×220 the median frame time should ideally stay under 4 ms. Split lines of the same kind into a few tiers by width and shade, and collect each tier into one `Path2D` drawn in a single call; derive element counts from the area and cap them; parts that never change once drawn can be cached on an offscreen canvas, and redrawn when the size or colors change.
8. **Check narrow screens and dark mode.** A phone is about 390×220.
9. **Fill the frame.** Content should span the whole strip and feel visually full, not huddle in a small patch in the middle with large empty areas around it.
10. **Make it understandable.** Mysterious is not the same as abstract: something like blackhole, which you recognize at a glance even though you cannot quite say why it looks the way it does, works; a picture that leaves viewers unsure what it is supposed to be does not.

## Adding and removing one

- Add: write `xxx.js` here; in `index.js` add the line `import * as xxx from "./xxx.js";` and put `xxx` into `MODULES`.
- Hide a style by removing its import and its entry in `index.js`. Its scene can stay in this directory. If the saved `theme.heroStyle` is the one that was removed, `heroById` falls back to the first one (argus).
- Preview: `http://127.0.0.1:4404/dev/heroes.html` shows all of them on one page; `?only=xxx&mode=dark&w=390&h=220&t=12000` shows a single one, sets light/dark mode and the size, and the millisecond to start from.
- Test: `node dev/test-heroes.mjs [xxx]`. It starts its own board server (on a copy of the data in a temporary directory, never touching real data) and a headless Chrome, and covers: static checks; frame rate and frame time while the pointer sweeps across and clicks repeatedly; whether animation stops under prefers-reduced-motion; and, on the board, that a full turn of the slider saves every header animation and leaves no extra animation loops behind.
- `node --check xxx.js` checks the syntax (package.json makes every .js file a module).

## Current header animations

In slider order (the name in parentheses is the `name` shown in the UI):

| id | Name | |
|---|---|---|
| `argus` | Mesh (网眼) | Eyes open in the cells of a net of fine lines; the default |
| `quiet-gaze` | 暗处回望 | A single eye follows the pointer with a delay |
| `orrery` | 三维天体仪 | Eight orbiting planets with a pointer tilt and a click-triggered alignment |
| `slope-field` | 斜率场 | Particles trace the rotating differential vector fields |
| `murmuration` | 鸟群 | The flock scatters near the pointer and grows when clicked |

The comment at the top of each file says what it draws and what the pointer and clicks do.
