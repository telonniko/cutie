# Cutie — 3D Interactive Rubik's Cube Solver

Create a complete, single-file HTML application (`index.html`) that renders a 3D,
interactive 3×3×3 Rubik's Cube simulation in the browser. It must run 100%
client-side with no external backend required. All libraries are loaded from CDNs.

---

## 1. Library Loading

- **Tailwind CSS** via CDN.
- **Three.js** (latest) as an **ES module** from a CDN — the app script is
  `type="module"` and re-exports it as `window.THREE` (three.js is ESM-only
  after r150).
- **cubejs** (v1.3.2) via two classic `<script>` tags (cube.js + solve.js) that
  attach `window.Cube`. No npm install needed for the app itself.

---

## 2. Visuals & Rendering

### Scene & camera
- Dark scene background (slate-950 range). Renderer uses `alpha: true` and
  `preserveDrawingBuffer: true` so the cube can be composited over the DOM in
  screenshots.
- `PerspectiveCamera` at a 3/4 view (home position roughly `(6.5, 5.5, 8.5)`).
- Physically-based lighting (post-r155): ambient + a key directional light with
  shadows + a cool fill light. A soft ground plane catches a drop shadow.
- Since three.js r155, light intensities are ~π× the old "legacy" values.

### Cubies
- Build **26 visible cubies** (27 grid positions; the center core has no colored
  faces). Each is a rounded box with a dark body material.
- Each outward face gets a **sticker** child — a smaller rounded box oriented so
  its local +z axis aligns with the face normal.
- **Standard face colors**: White (U), Yellow (D), Blue (F), Green (B), Orange
  (L), Red (R).
- Cubie orientation: mesh quaternion derived from its 3 face-axis vectors via
  `Matrix4.makeBasis` → `setFromRotationMatrix`, keeping every cubie exactly
  90°-aligned with no floating-point drift.

### Orbit controls
- **Custom minimal orbit controls** (no external `OrbitControls`): drag to orbit
  (damped), scroll/pinch to zoom, touch support. Cursor: `grab`/`grabbing`.

### Animation
- Smooth 3D slice rotation with `easeInOut` easing. Half-turns (`'2'`) take
  slightly longer than quarter-turns. Scramble plays at normal pace; solve at a
  slightly slower pace. A speed slider (0.3×–3×) scales all durations.

---

## 3. Cube Core (Mathematical Model)

The cube state is tracked in **facelet string** form matching cubejs exactly
(54 chars, 9 per face in cubejs order U, R, F, D, L, B).

### Core API
- `buildCubies()`, `applyMove(cubies, face, power)`, `applyAlg(cubies, alg)`,
  `parseAlg(str)`, `invertAlg(str)`, `readFaceletString(cubies)`,
  `isSolved(cubies)`.
- `MOVES` table defines each face's rotation axis, layer coordinate, and sign.
- `parseAlg` ignores lines starting with `#` and blank lines.

### Extractable core
- The cube-core code lives between `// === CUBE:START ===` and
  `// === CUBE:END ===` sentinels so it can be extracted and unit-tested in Node
  (`tools/verify.js`). The core has **no DOM or Three.js dependencies** — it is
  pure math. Exposed via `self.CubeCore`.

### Move notation
Standard **Singmaster notation**: `U D L R F B`, `'` (counter-clockwise),
`2` (180° half-turn).

---

## 4. User Interactions & Controls

### Face buttons (left edge, vertically centered)
Two vertical columns:

- **Left — quarter turns (`U D L R F B`)**: click = clockwise 90°. Shift+click
  = counter-clockwise (`U'`). While Shift is held, every button **displays its
  prime label** and the label **stays primed after a click** as long as Shift
  is held. Cmd/Meta is ignored (on macOS it is the right-click modifier).
- **Right — half turns (`U2 D2 L2 R2 F2 B2`)**: each is a single 180° turn.
  Labels are fixed (a 180° has no direction) and do **not** follow the Shift
  prime preview.
- Each button has a **pressed visual state** (darker fill, inset shadow, slight
  push-down) on pointer down, snapping back on release.
- **No double-click detection**: there are no `dblclick` listeners or deferred
  timers. A click is exactly one move.
- Turns fire on **`pointerup`** (Pointer Events), not `click`, because Safari
  can suppress/defer `click` after a tap. `pointercancel`/`pointerleave`
  un-depresses without turning.

### Primary actions (right panel, bottom)
| Button | Action |
|--------|--------|
| **Scramble** | Random 20-move scramble, no two consecutive same-face, animated. |
| **Solve** | Compute solution via cubejs, animate step-by-step. |
| **Step →** | Advance the queue by one move and stop. |
| **← Step** | Undo last move (animate inverse), re-queue original for replay. |
| **Reset** | Instantly return to solved, clear the log. |

### Solve behavior
- Reads facelet string → `Cube.fromString(...).solve()` → animates the returned
  sequence. If already solved, shows "Already solved". After solving: "Solved"
  or "Solved (best effort)".

### Step forward / backward
- **Step forward**: pops next queued move, re-records it in the log, animates,
  then **stops** (leaves the rest parked for subsequent steps).
- **Step backward**: animates the inverse of the last move, removes it from the
  log, re-queues the original (with its correct index) so Step → can replay it.

### Animation speed slider
- Range slider (0.3–3, step 0.1, default 1.0) with "Slow"/"Fast" labels.
  Displayed as e.g. `1.0×`.

---

## 5. UI & Polish

### Overall style
- Dark-mode, glassy panels (`backdrop-blur`, semi-transparent dark backgrounds,
  subtle ring borders). Page background: slate-950. `color-scheme: dark`.

### Top bar
- **Left**: Cutie logo — a small 3×3 grid of colored squares next to the title
  and subtitle.
- **Right**: Status pill with a colored dot (emerald/sky/amber/slate for
  solved/scrambled/busy/idle), status text, and a live **Moves counter**.
- Status values: "Solved", "Scrambled", "Turning…", "Scrambling…",
  "Solving…", "Solving — paused", "Paused — Step ▸ to continue",
  "Solved (best effort)", "Already solved".

### Right control panel
- **Move Log**: grid of move-buttons (5 per row), one per move token. Three
  visual states — **pending** (dim), **past** (faint done), **current** (bright
  amber highlight). Scrolls when tall; current button auto-scrolls into view.
  Empty state shows a placeholder message.
- **Animation speed**, and **Primary actions** sections
  (described in §4).

### Face buttons panel (left edge)
- Glassy panel with "Turn a layer" label, two button columns, and a
  "Shift+click = counter" hint. Fade-in on load.

### Misc
- **Drag-to-rotate hint**: small pill "Drag to orbit · Scroll to zoom".
- **Solver toast**: centered bottom toast with spinner ("Warming up the
  solver…"), also reused for error messages, auto-hiding after ~4s.

---

## 6. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Solve |
| `S` | Scramble |
| `0` | Reset |
| `→` | Step forward |
| `←` | Step backward |
| `U` `D` `L` `R` `F` `B` | Turn that face clockwise |
| `Shift` + `U` `D` `L` `R` `F` `B` | Turn that face counter-clockwise |

Face-turn keys are checked via `e.key.toUpperCase()` before command keys, so
`R`, `F`, `B` trigger face turns, not commands. Input fields are ignored.
Repeat events are ignored for face turns.

---

## 7. Testing

### `window.__RUBIKS__` hook
The app exposes a `window.__RUBIKS__` hook for headless testing and screenshot
capture. It provides: solver readiness and status getters, `applyInstant` /
`applyAlg` for instant state changes, `setCamera`, `renderFrame` / `readFrame`
for capturing the GL back buffer as raw RGBA pixels (bypassing the unreliable
2D-canvas sync in headless Chromium), `syncLog` / `clearLog` for the Move Log,
and `waitUntilIdle`.

### `tools/verify.js`
Node unit tests that extract the cube core (between the sentinels), evaluate it
in a VM context alongside cubejs, and verify: all 18 single moves match cubejs,
a 300-move random sequence matches, and solve round-trips through cubejs.
Run: `node tools/verify.js`.

### `tools/press-test.js`
Playwright tests for face-button behavior:
- Pressed visual state on quarter and half-turn buttons.
- Shift-click primes quarter labels; half-turn labels stay fixed regardless.
- Ambient prime (Shift held primes all quarter labels; release restores).
- Shift+click keeps label primed after release.
- Cmd/Meta is ignored.
- Action: four single quarter clicks return to solved (4 × 90° = 360°).
- Action: two half-turn clicks return to solved (2 × 180° = 360°).
- Action: four Shift+quarter clicks return to solved (4 × 90° counter = 360°).
- Run: `node tools/press-test.js`.

### `tools/render-screenshot.js`
Headless screenshot harness (Playwright + ImageMagick) that captures three
screenshots — solved, scrambled, solved-after — by compositing the GL frame
(transparent background) over the DOM UI. Outputs to `docs/screenshots/`.
Run: `node tools/render-screenshot.js`.

---

## 8. Screenshot Gallery

Create `docs/screenshots/index.html` — a standalone gallery page showing the
three screenshots (solved, scrambled, solved-after) in a 3-column grid with
branded header, step badges, status dots, captions, hover effects, and a
dark theme matching the app.

---

## 9. README.md

Create a `README.md` in the project root with: title and description,
screenshot table + gallery link, how to run (double-click `index.html`), how to
play (4 steps), UI description, keyboard shortcuts table,
move notation explanation, how it works, and a tech list (Three.js, cubejs,
Tailwind, vanilla JS).

---

## 10. Key Implementation Notes

- **Single file**: the entire app is `index.html` — HTML + embedded CSS +
  embedded JS. No build step, no bundler.
- **ES module**: the main script is `type="module"` (required for Three.js ESM
  import). cubejs loads as classic `<script>` tags before the module script.
- **Pointer Events, not click**: face buttons use `pointerdown`/`pointerup`
  because Safari can suppress `click` after a tap.
- **No double-click detection**: a click is exactly one move. Half-turns are a
  separate column of buttons.
- **Shift = prime**: only Shift is the prime modifier. Cmd/Meta is ignored.
- **Batch animation**: scramble and solve enqueue the entire sequence up front
  (so the Move Log shows all buttons at once), then auto-advance. Step mode
  plays one move and stops.
- **Step backward re-queues**: the original move is re-queued with its correct
  log index so Step → replays it in the original order.
- **Solver lifecycle**: `Cube.initSolver()` is deferred in a `setTimeout(50ms)`;
  the Solve button awaits readiness.
- **All code well-commented**, free of placeholder or missing functions.
