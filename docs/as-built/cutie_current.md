# Cutie — 3D Interactive Rubik's Cube Solver

Cutie is a complete, single-file HTML application (`index.html`) that renders a
3D, interactive 3×3×3 Rubik's Cube simulation in the browser. It runs 100%
client-side with no external backend, and every library is loaded from a CDN.

---

## 1. Library Loading

- **Tailwind CSS** v4 (via the browser Play CDN build).
- **Three.js** (latest) as an **ES module** from a CDN — the app script is
  `type="module"` and re-exports it as `window.THREE` (three.js is ESM-only
  after r150).
- **cubejs** (v1.3.2) via two classic `<script>` tags (cube.js + solve.js) that
  attach `window.Cube`. No npm install needed for the app itself.

---

## 2. Visuals & Rendering

### Scene & camera
- Dark scene background (`0x0f172a`, matching the slate-950 page color). Renderer
  uses `alpha: true` and `preserveDrawingBuffer: true` so the cube can be
  composited over the DOM in screenshots.
- `PerspectiveCamera` with 38° FOV at a 3/4 view (home position `(6.5, 5.5, 8.5)`).
- Physically-based lighting (post-r155): ambient (`2.8`) + a key directional light
  (`3.3`) with PCFSoft shadow map (1024×1024) + a cool fill light
  (`0x88aaff`, `1.1`). A soft ground plane (`ShadowMaterial`, opacity `0.28`) at
  `y = -3.4` catches a drop shadow.
- Since three.js r155, light intensities are ~π× the old "legacy" values.

### Cubies
- The cube is **26 visible cubies** (27 grid positions; the center core has no
  colored faces). Each is a rounded box with a dark body material.
- Each outward face gets a **sticker** child — a smaller rounded box oriented so
  its local +z axis aligns with the face normal.
- **Standard face colors**: White (U), Yellow (D), Blue (F), Green (B), Orange
  (L), Red (R).
- Cubie orientation: mesh quaternion derived from its 3 face-axis vectors via
  `Matrix4.makeBasis` → `setFromRotationMatrix`, keeping every cubie exactly
  90°-aligned with no floating-point drift.

### Orbit controls
- **Custom minimal `Orbit` class** (no external `OrbitControls`): drag to orbit
  (damped), mouse-wheel zoom, and **two-finger touch pinch zoom**. Cursor: `grab`/`grabbing`.
  Clamp range: polar angle `0.15–π-0.15`, radius `6–22`.

### Animation
- Smooth 3D slice rotation with a piecewise `easeInOut` easing
  (`2t²` for `t<0.5`, `1 - (-2t+2)²/2` otherwise). Per-move duration is computed from
  constants: `TURN_SECONDS = 0.42` at 1× speed, `DOUBLE_PENALTY = 1.15` multiplier
  for half-turns, and a `PACE` object (`scramble: 1`, `turn: 1`, `solve: 1.15`) that
  plays solves ~15% slower than scrambles. A speed slider (0.3×–3×, step 0.1, default
  1.0) scales all durations.

---

## 3. Cube Core (Mathematical Model)

The cube state is tracked in **facelet string** form matching cubejs exactly
(54 chars, 9 per face in cubejs order U, R, F, D, L, B).

### Core API
- `buildCubies()`, `applyMove(cubies, face, power)`, `parseAlg(str)`,
  `readFaceletString(cubies)`, `isSolved(cubies)`.
- `MOVES` table defines each face's rotation axis, layer coordinate, and sign.
- `parseAlg` ignores lines starting with `#` and blank lines.

### Extractable core
- The cube-core code lives between `// === CUBE:START ===` and
  `// === CUBE:END ===` sentinels so it can be extracted and unit-tested in Node
  by `tests/cube-core-test.js` (`npm run verify`). The core has **no DOM or
  Three.js dependencies** — it is pure math. Exposed via `self.CubeCore`.

### Move notation
Standard **Singmaster notation**: `U D L R F B`, `'` (counter-clockwise),
`2` (180° half-turn).

---

## 4. User Interactions & Controls

### Face buttons (left edge) — a slide-out drawer
The face buttons live in a **panel that hides behind a tab** on the left edge, so
the viewport stays clear. The tab is a vertical **"Turn a layer"** handle (like a
binder tab) on the panel's **right** edge; it is always visible, and the panel
slides in from the left when opened:

- **Tap the tab** to slide the panel out; **tap it again** to slide it back. The
  toggle is a `click` on a real `<button>`, so it works with a tap on iPad with
  no keyboard. **`T`** toggles the same drawer from the keyboard.
- **Tab is not the shortcut**: it drives browser focus navigation and the primary
  action buttons are focusable, so `T` is used instead.

When open, the panel shows three vertical columns: each button is **one fixed
move**, so a tap always does exactly one thing with no modifier — important on
touch devices (e.g. iPad) that have no Shift key:

- **Left — clockwise quarter turns (`U D L R F B`)**: each is a single 90° turn.
- **Middle — counter-clockwise quarter turns (`U' D' L' R' F' B'`)**: each is a
  single 90° prime.
- **Right — half turns (`U2 D2 L2 R2 F2 B2`)**: each is a single 180° turn.
- Labels are fixed (a 180° has no direction, and the prime is its own button), so
  there is no modifier to watch and nothing to repaint.
- Each button has a **pressed visual state** (darker fill, inset shadow, slight
  push-down) on pointer down, snapping back on release.
- **No double-click detection**: there are no `dblclick` listeners or deferred
  timers. A click is exactly one move.
- Turns fire on **`pointerup`** (Pointer Events), not `click`, because Safari
  can suppress/defer `click` after a tap. `pointercancel`/`pointerleave`
  un-depress without turning.

The face **keys** (`U D L R F B`, `Shift` + a face key for the prime, `Alt` /
`Option` + a face key for the 180° half turn) still work as keyboard shortcuts
on desktop.

### Primary actions (right panel, bottom)
| Button | Action |
|--------|--------|
| **Scramble** | Random 18–35 move scramble, no two consecutive same-face, animated. Clears the log first. |
| **Solve** | Clear the log, then compute the solution via cubejs from the cube's current state and animate it step-by-step. |
| **← Step** | Step the current position back one move (animate the inverse); the move stays in the log to replay. **Disabled at the start of the log** (cursor 0, nothing applied to undo). |
| **Step →** | Advance the current step one move (replay the next move in the log) and stop. **Disabled at the end of the log** (cursor == log length, nothing future to replay). |
| **Reset** | Instantly return to solved, clear the log. |

The two step buttons **grey out (and stop accepting clicks) when there is no move
in that direction to apply**: `← Step` disables while the cursor is at 0, and
`Step →` disables while the cursor is at the end of the log; in the middle of the
log both are live. This is a pure visual reflection of the guards already inside
`stepForward`/`stepBackward` — it never changes the step logic. The flags refresh
only at "rest" points (initial load, after a Reset, and when a batch/single-step
drains in `settle()`), **not on every move of a running Scramble/Solve**, so the
buttons don't flicker while a sequence animates (see the *Cursor model* note in
§10).

### Solve behavior
- **Clears the Move Log first** (like Scramble), then reads the cube's current
  facelet string → `Cube.fromString(...).solve()` → animates the returned
  sequence from where the cube actually is. The log therefore shows just the
  solution, and the cube ends solved regardless of where the cursor was. If
  already solved, shows "Already solved". After solving: "Solved" or
  "Solved (best effort)".

### Step forward / backward — a cursor model
- The Move Log tracks a **`cursor`** (the "current step"). The cube's physical
  state is always exactly `moves[0..cursor-1]`; moves at/after the cursor are
  *future* moves shown in the log but not yet applied.
- **Step forward**: if the cursor is before the end of the log, replay
  `moves[cursor]` (animate it) and advance the cursor. Stops after one move.
- **Step backward**: if the cursor is past 0, animate the inverse of
  `moves[cursor-1]` and retreat the cursor. The undone move **stays in the log**
  as a future move, so Step → replays it. No separate redo stack — the cursor
  *is* the redo/undo position.
- A **hand turn** (face button / face key) **branches from the cursor**: it
  discards every move past the cursor, appends the new move, and advances the
  cursor — so the log forks at the current step instead of blindly appending.
- **Button enable/disable tracks the cursor.** `updateStepButtons()` sets
  `← Step`'s `disabled` to `cursor <= 0` (no applied move to undo) and `Step →`'s
  to `cursor >= moves.length` (no future move to replay) — the exact negation of
  the guards inside `stepForward`/`stepBackward`. It is called **only at rest**: on
  the initial load, after a `Reset` (`resetCube`), and once per sequence when its
  queue drains in `settle()`. It is *not* called on every `finishMove`, so while a
  Scramble/Solve animates through many moves the buttons keep their pre-sequence
  state and refresh just once at the end — no flicker.

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
  "Solving…", "Solved (best effort)", "Already solved".

### Controls drawer (right edge)
- A **slide-out drawer** — the mirror of the face-button drawer, on the right. It
  holds the Move Log, the speed slider, and the primary-action buttons. It
  **opens at startup on a wide screen and stays closed on a narrow one**, and it
  **auto-closes** (independently of the other drawer) when a Scramble/Solve would
  slide it onto the cube. Tapping its vertical "Controls" tab (or pressing `C`)
  toggles it.
- **Move Log**: grid of move-buttons (5 per row), one per move token. Three
  visual states driven by the **cursor** — **past** (index `< cursor`, faint
  done look), **pending** (index `>= cursor`, dim), **current** (the move
  animating right now / last applied, bright amber highlight). Scrolls when tall;
  the current button auto-scrolls into view. Empty state shows a placeholder
  message. The "Moves" counter shows the number of moves actually applied
  (the cursor).
- **Animation speed**, and **Primary actions** sections
  (described in §4).

### Face buttons panel (left edge)
- A **slide-out drawer**: it **opens at startup on a wide screen and stays closed
  on a narrow one** (the same shared rule as the controls drawer), and
  auto-closes when a Scramble/Solve would slide it onto the cube. While closed,
  only a vertical "Turn a layer" tab is visible on the panel's right edge. Tapping
  the tab (or pressing `T`) slides the panel out; tapping again slides it back. The
  tab is the rightmost child, so hiding the panel (sliding it left) leaves the tab
  on screen.
- Glassy panel, three button columns (clockwise quarter, counter-clockwise
  quarter, half). No top label — the tab *is* the "Turn a layer" label.

### Misc
- **Drag-to-rotate hint**: a small pill, centered horizontally near the top
  (`top-17`), "Drag to orbit · Scroll/Pinch to zoom"; it fades out on the **first keypress
  or pointerdown** (via a capture-phase `document` listener that fires before the app's
  handlers), then removes itself from the DOM. Respects
  `prefers-reduced-motion: reduce` — skips the fade animation and removes immediately.
- **Attribution (credit card)**: a small bottom-left line, "created with
  qwen3.8:27b-mlx-4bit"; it stays visible at all times and is NOT an onboarding
  hint (not dismissed on first interaction).
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
| `Alt` + `U` `D` `L` `R` `F` `B` | Turn that face 180° (half turn) |
| `T` | Toggle the face-button (layer) drawer open / closed |
| `C` | Toggle the controls drawer open / closed |

Face-turn keys are matched via `e.code` (physical key, e.g. `KeyU`), not
`e.key` (composed character).  On macOS `Option+U` sets `e.key` to the
composed glyph (`µ` in Latin-1), so the check would miss; `e.code` is
unaffected by modifiers or locale.  Any of `U D L R F B` turns that face
(`Shift` for the counter-clockwise prime, `Alt`/`Option` for the 180° half
turn — directionless, so it wins over `Shift` when both are held).  Input
fields are ignored, and repeat events are ignored for face turns.

---

## 7. Testing

### `window.__RUBIKS__` hook
The app exposes a `window.__RUBIKS__` hook for headless testing and screenshot
capture. It is a **capture/sync bridge, not a state driver** — it no longer
applies moves, so the captures reflect what the app actually does. It provides:

- `ready` / `status` (getters — tracks solver readiness and current status text)
- `setCamera()` — resets camera to the home position (`HOME_POS`)
- `renderFrame()` — renders one frame with a transparent background and returns raw
  RGBA pixels via `gl.readPixels()` (bypasses the unreliable 2D-canvas sync in
  headless Chromium)
- `setPixelRatio(pr)` — forces the renderer's pixel ratio and rescales the canvas
- `syncLog()` — renders the Move Log grid with every move shown as "done" (for
  screenshot clarity)
- `isSolved()` — checks if the cube is in solved state
- `waitUntilIdle(maxMs?)` — resolves when animations have finished

State changes in tests and the screenshot harness go through the real UI (clicking
the Scramble/Solve buttons) — so the captures always reflect the app's current
behavior.

### `tests/cube-core-test.js`
Node unit tests that extract the cube core (between the sentinels), evaluate it
in a VM context alongside cubejs, and verify: all 18 single moves match cubejs,
a 300-move random sequence matches, and solve round-trips through cubejs.
Run: `node tests/cube-core-test.js` (`npm run verify`).

### `tests/cursor-test.js`
Node regression test for the **cursor model** (the move-log step/branch logic).
It mirrors the app's cursor behavior against the cube core + cubejs and proves:
the cursor moves correctly (cube reflects `moves[0..cursor-1]`); a face-turn
branches from the cursor (discards future moves, appends the new one); and **Solve
always solves the cube** regardless of cursor position, discarding any future
moves and appending the solution. Run: `node tests/cursor-test.js`
(`npm run verify:cursor`).

### `tests/drawers-test.js`
Playwright tests for **both** slide-out drawers' auto-close-on-overlap and
width-dependent startup. Each drawer is checked **independently**: a narrow
viewport starts it **closed** (the panel would cover the cube) while a wide one
starts it **open**; the test clicks **Scramble**/**Solve** and reads each tab's
`aria-expanded` to confirm the drawer auto-closes when it would cover the cube and
stays open when it doesn't. Run: `node tests/drawers-test.js`
(`npm run test:drawer`).

### `tests/press-test.js`
Keyboard-shortcut tests:
- `T` toggles the face-button drawer open/closed.
- `Alt`/`Option` + a face key performs a 180° half turn (two `Alt+U`
  return to solved; `Shift` remains the prime modifier).
- Run: `node tests/press-test.js`.

### `tests/click-test.js`
Playwright tests for face-button mouse/click behavior:
- Pressed visual state on quarter, prime, and half-turn buttons.
- Labels are fixed (no Shift-driven prime preview, no ambient repaint).
- Action: four single clockwise quarter clicks return to solved (4 × 90° = 360°).
- Action: two half-turn clicks return to solved (2 × 180° = 360°).
- Action: four single prime (counter-clockwise) clicks return to solved
  (4 × 90° counter = 360°).
- The face drawer opens at startup on a wide viewport and starts closed on a
  narrow one; clicking the tab toggles it (works on iPad with no keyboard).
- Run: `node tests/click-test.js`.

### `tests/step-buttons-test.js`
Playwright tests for the **"← Step" / "Step →" enable/disable** state. The
buttons disable when the Move Log has no move in that direction to apply —
`← Step` while the cursor is at 0 (nothing applied to undo), `Step →` while the
cursor is at the end of the log (nothing future to replay) — and re-enable as
the cursor moves. It also proves a **Scramble/Solve does not flicker the buttons
mid-sequence**: the flags are read during the batch (unchanged) and after it
drains (`settle` refreshes them once). Checks, in order:
- Fresh log / after Reset: **both** buttons disabled.
- After one applied move: `← Step` enabled, `Step →` disabled.
- Stepped back to the start: `← Step` disabled, `Step →` enabled; stepped to the
  end, `← Step` enabled and `Step →` disabled.
- Mid-sequence Scramble: buttons left untouched (no flicker); after it settles,
  `← Step` enabled and `Step →` disabled; in the middle of a long log both are
  live; walked all the way back, `← Step` disables again.
- Disabled flags are read from the buttons' `disabled` DOM property (independent
  of whether the Controls drawer is open), and the test runs at 3× speed so the
  random 18–35 move scramble drains within its wait timeout.
- Run: `node tests/step-buttons-test.js` (`npm run test:step`).

### `tools/render-screenshot.js`
Headless screenshot harness (Playwright + ImageMagick) that captures three
screenshots — `solved.png`, `scrambled.png`, `solved-after.png` — each with **both
drawers open** and the cube in the gap between them. It drives the **real Scramble
and Solve buttons** (so the shots reflect the current randomized scramble and
solver), waiting for each animation to finish via `waitUntilIdle`. The harness:

1. Calls `window.__RUBIKS__.renderFrame()` → raw RGBA pixels from the GL back buffer.
2. Calls `page.screenshot()` → the full DOM UI.
3. Composites the cube PNG over the UI screenshot at the canvas origin via ImageMagick.

Requires: Node, Playwright + Chromium, and **ImageMagick** (`magick` / `convert`).
Outputs to `docs/screenshots/`.
Run: `node tools/render-screenshot.js` (`npm run screenshot`).

---

## 8. Screenshot Gallery

A standalone gallery page (`docs/screenshots/index.html`) shows the three
screenshots (solved, scrambled, solved-after) in a 3-column grid with a branded
header, step badges, status dots, captions, hover effects, and a dark theme
matching the app.

---

## 9. README.md

The project-root `README.md` has: a title and description, a screenshot table
+ gallery link, how to run (double-click `index.html`), how to play (4 steps), a
UI description, a keyboard shortcuts table, a move-notation explanation, a
how-it-works section, and a tech list (Three.js, cubejs, Tailwind, vanilla JS).

---

## 10. Key Implementation Notes

- **Single file**: the entire app is `index.html` — HTML + embedded CSS +
  embedded JS. No build step, no bundler.
- **ES module**: the main script is `type="module"` (required for Three.js ESM
  import). cubejs loads as classic `<script>` tags before the module script.
- **Pointer Events, not click**: face buttons use `pointerdown`/`pointerup`
  because Safari can suppress `click` after a tap.
- **No double-click detection**: a click is exactly one move. Quarter, prime,
  and half-turns are each their own column of buttons.
- **No Shift-driven UI**: counter-clockwise quarter turns are their own column
  of buttons (`U'…B'`), so no modifier is needed for the on-screen controls. The
  face *keys* keep `Shift` as the prime modifier and `Alt`/`Option` as the
  half-turn modifier for desktop keyboards.
- **Drawers, not static panels**: both the layer buttons (left edge) and the
  controls panel (right edge) hide behind a vertical tab. The horizontal slide
  lives on an inner `.drawer-unit` transform so it never fights the outer
  element's vertical centering. Each toggle is a `click` on the tab (works on
  iPad, no keyboard) or the `T` (face) / `C` (controls) key.
- **Drawer first-load race**: Tailwind v4's browser build loads via the runtime
  **Play CDN `<script>`**, so its `w-12`/`gap`/`p-3` columns may not be laid out when the
  module first runs. Measuring the closed shift that early is too small and leaves
  the panel peeking. The shift is therefore kept at a fully-hidden CSS default
  until `load`/`ResizeObserver` (plus a couple of rAFs) report a stable width; auto
  re-measurements snap (no slide), so the panel never visibly slides or peeks on
  first load.
- **Drawers auto-close independently**: on a wide screen, **both** drawers open at
  startup. On a narrow screen, both stay closed. When a Scramble or Solve is
  triggered, each drawer is checked independently via `drawerOverlapsCube()`; only
  the ones that would cover the cube are auto-closed. The `decideStartupDrawers()`
  function tentatively opens both, tests each, and closes whichever overlaps.
- **Batch animation**: scramble and solve clear the log, then enqueue the entire
  sequence up front (so the Move Log shows all buttons at once), then auto-advance
  via `startCurrent()` → `finishMove()` → `startCurrent()` … until the queue drains.
  Step mode plays one move and stops (auto=false).
- **Per-move duration constants**: `TURN_SECONDS = 0.42`, `DOUBLE_PENALTY = 1.15`
  (half-turns take ~15% longer), `PACE = { scramble: 1, turn: 1, solve: 1.15 }`
  (solves play slightly slower than scrambles). Speed slider scales all durations.
- **Touch pinch-zoom**: the `Orbit` class handles two-finger pinch zoom in addition
  to mouse-wheel zoom. Single-finger touch orbit is also supported.
- **Drawer overlap detection**: `drawerOverlapsCube(drawerEl)` projects the cube's
  world-space AABB through the camera to screen pixels, then performs an axis-aligned
  rectangle intersection test against the drawer's `getBoundingClientRect()`. Both
  drawers are checked independently; `decideStartupDrawers()` uses this to pick the
  startup open/closed state of each drawer independently.
- **Render loop**: `requestAnimationFrame` loop with `paused` flag (set during
  screenshot capture). dt capped at 50ms to prevent spiral-of-death.
- **`window.__RUBIKS__` hook**: `setCamera()` resets to home position; `setPixelRatio(pr)`
  forces the renderer's pixel ratio; `renderFrame()` renders with a transparent
  background; `syncLog()` forces all log moves to "done" state; `waitUntilIdle()`
  waits for animations to finish.
- **Hint dismissal**: a capture-phase `document` listener dismisses the drag-to-orbit
  hint on the first `keydown` or `pointerdown` event (any element). If
  `prefers-reduced-motion: reduce` is active, it removes immediately without the
  fade animation.
- **Step-button enable/disable**: `updateStepButtons()` mirrors the cursor into the
  two step buttons — `← Step` disabled at cursor 0, `Step →` disabled at the end of
  the log. It runs **only at rest** (initial load, after Reset, and when a batch or
  single-step drains in `settle()`), never per-`finishMove`, so a running
  Scramble/Solve leaves the buttons untouched and refreshes them once at the end —
  the buttons don't flicker.
- **Cursor model (step/branch/solve)**: `state.cursor` is the "current step"; the
  cube's physical state is always `moves[0..cursor-1]`. Step →/← move the cursor
  (Step-back animates the inverse and retreats, keeping the move in the log to
  replay — there is **no separate redo stack**). A hand turn branches the log at
  the cursor (discard moves past it, then append). **Solve clears the log first**
  then computes the solution from the cube's *current physical state*
  (`readFaceletString(cubies)`), so it always solves the cube as it actually is —
  the earlier bug was a stale redo stack being replayed ahead of the solution.
- **Solver lifecycle**: `Cube.initSolver()` is deferred in a `setTimeout(50ms)`;
  the Solve button awaits readiness.
- **All code well-commented**, free of placeholder or missing functions.
