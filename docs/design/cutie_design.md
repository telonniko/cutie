# Cutie — 3D Interactive Rubik's Cube Solver

Create a complete, single-file HTML application (`index.html`) that renders a 3D,
interactive 3×3×3 Rubik's Cube simulation in the browser. It must run 100%
client-side with no external backend required. All libraries are loaded from CDNs.

---

## 1. Library Loading

- **Tailwind CSS**: loaded via CDN (`https://cdn.tailwindcss.com`).
- **Three.js**: loaded as an **ES module** from jsdelivr
  (`https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js`).
  The app script is `type="module"` and imports Three.js with `import * as THREE`,
  then re-exports it as `window.THREE` for any non-module code. This is because
  three.js is ESM-only after r150 (the UMD/global build was removed).
- **cubejs**: loaded via two inline `<script>` tags from jsdelivr
  (`https://cdn.jsdelivr.net/npm/cubejs@1.3.2/lib/cube.js` and
  `https://cdn.jsdelivr.net/npm/cubejs@1.3.2/lib/solve.js`). These are IIFE
  scripts that attach `window.Cube` — no npm install needed for the app itself.

---

## 2. Visuals & Rendering (Three.js)

### Scene
- Scene background color `0x0f172a` (a soft dark slate that matches the page
  theme). Renderer is created with `alpha: true` and `preserveDrawingBuffer: true`
  so the cube can be composited over the DOM in screenshots without hiding UI
  panels.
- **Lights** (physically-based, post-r155 intensities scaled by ~π):
  - `AmbientLight(0xffffff, 2.8)`
  - `DirectionalLight(0xffffff, 3.3)` at position `(8, 12, 9)`, castShadow,
    shadow map 1024×1024, PCFSoftShadowMap.
  - `DirectionalLight(0x88aaff, 1.1)` at position `(-6, -4, -8)` (fill light).
- **Ground shadow**: a large `PlaneGeometry(60, 60)` at `y = -3.4` with
  `ShadowMaterial({ opacity: 0.28 })`, rotated to lie flat.

### Camera
- `PerspectiveCamera(38, aspect, 0.1, 100)`.
- Home position: `(6.5, 5.5, 8.5)`.

### Cubies (the 3D model)
- Build **26 visible cubies** (all 27 grid positions; the center core has no
  colored faces). Each cubie is a rounded box (custom `roundedBoxGeometry`
  reproducing three's `RoundedBoxGeometry`, radius ≈ 0.11, 4 segments).
- Each outward face gets a **sticker** child: a smaller rounded box
  (`0.86 × 0.86 × 0.1`, radius ≈ 0.05, 3 segments) using a
  `MeshStandardMaterial` with the face color and `roughness: 0.32`,
  `metalness: 0.05`. Sticker orientation: local +z aligned to the face normal via
  `quaternion.setFromUnitVectors`.
- Body material: `MeshStandardMaterial({ color: 0x0d1117, roughness: 0.45,
  metalness: 0.15 })` (dark internal spacing).
- **Face colors** (standard Rubik's Cube):
  | Face | Color | Hex |
  |------|-------|-----|
  | U (Up)     | White  | `0xf8fafc` |
  | D (Down)   | Yellow | `0xfacc15` |
  | F (Front)  | Blue   | `0x2563eb` |
  | B (Back)   | Green  | `0x16a34a` |
  | L (Left)   | Orange | `0xea580c` |
  | R (Right)  | Red    | `0xdc2626` |

### Cubie orientation
- Each cubie's mesh quaternion is derived from its 3 local face-axis vectors via
  `Matrix4.makeBasis` → `Quaternion.setFromRotationMatrix`, keeping every cubie
  exactly 90°-aligned with no floating-point drift.

### Orbit controls
- **Custom minimal orbit controls** (no external `OrbitControls` import).
  Features:
  - Drag to orbit (spherical coordinates, damped with `damp = 0.12`).
  - Scroll / pinch to zoom (radius clamped 6–22).
  - Touch support: single-finger orbit, two-finger pinch zoom.
  - `setView()` to snap back to the home camera position.
  - Cursor: `grab` / `grabbing`.

### Animation
- Each layer turn is a smooth **3D slice rotation** animated over ~0.42 s at 1×
  speed, with `easeInOut` easing. Half-turns (`'2'` modifier) take 1.15× longer
  (`DOUBLE_PENALTY`). Scramble plays at 1× pace; solve at 1.15× pace
  (`PACE.solve = 1.15`).
- The speed slider (0.3×–3×) divides the base duration by the multiplier.

---

## 3. Cube Core (Mathematical Model)

The cube state is tracked in **facelet string** form, matching cubejs exactly:
`UUUUUUUURRRRRRRRFFFFFFFFFDDDDDDDDLLLLLLLLLBBBBBBBBB` (54 characters, 9 per face
in cubejs face order U, R, F, D, L, B).

### Core API
- `buildCubies()` — creates the 26 cubies with initial positions and face
  directions.
- `applyMove(cubies, face, power)` — applies one move (power 0 = clockwise,
  1 = half, 2 = prime).
- `applyAlg(cubies, alg)` — applies a full algorithm string.
- `parseAlg(str)` — parses a notation string into `[{face, power}]`, ignoring
  lines starting with `#` and blank lines.
- `invertAlg(str)` — returns the inverse of a notation string.
- `readFaceletString(cubies)` — reads the 54-char facelet string from the cubie
  model, matching cubejs layout.
- `isSolved(cubies)` — checks if the cube is in the solved state.
- `MOVES` — the move definitions:
  ```
  U: { axis: 1, layer:  1, sign: -1 }
  D: { axis: 1, layer: -1, sign:  1 }
  R: { axis: 0, layer:  1, sign: -1 }
  L: { axis: 0, layer: -1, sign:  1 }
  F: { axis: 2, layer:  1, sign: -1 }
  B: { axis: 2, layer: -1, sign:  1 }
  ```
- `rotateVector(axis, v, sign)` — rotates a 3D vector 90° about the given axis.

### Extractable core
- The cube-core code lives between `// === CUBE:START ===` and
  `// === CUBE:END ===` sentinels in `index.html` so it can be extracted and
  unit-tested in Node (see `tools/verify.js`). The core has **no DOM or
  Three.js dependencies** — it is pure math.
- The core exposes its API via `self.CubeCore = { buildCubies, applyMove,
  applyAlg, readFaceletString, isSolved, parseAlg, MOVES }`.

### Move notation
Standard **Singmaster notation**: `U D L R F B` (face letters), `'` (counter-
clockwise), `2` (180° half-turn).

---

## 4. User Interactions & Controls

### Face buttons (left edge, vertically centered)
Two vertical columns of buttons, centered on the left side of the screen:

- **Left column — quarter turns: `U D L R F B`**
  - **Click** = clockwise 90° quarter turn.
  - **Shift + click** = counter-clockwise 90° (prime, e.g. `U'`).
  - While **Shift** is held, every quarter-turn button **displays its prime
    label** (e.g. `U'`) even without a mouse press. The label **stays primed
    after a click** as long as Shift remains held. Releasing Shift snaps all
    labels back to plain letters. **Cmd/Meta is intentionally ignored** (on
    macOS it is the right-click modifier).
  - Each button has a **pressed visual state** (`.pressed` CSS class: darker
    fill, inset shadow, slight push-down) that activates on pointer down and
    snaps back on release.

- **Right column — half turns: `U2 D2 L2 R2 F2 B2`**
  - Each is a single 180° turn. Labels are fixed (a 180° has no direction), so
    they do **not** follow the Shift prime preview.
  - Same pressed visual state as quarter buttons.

- **Implementation detail**: Turns fire on **`pointerup`** (Pointer Events),
  **not** the browser's synthesized `click` event, because Safari can suppress
  or defer `click` after a tap/gesture, which would leave the button looking
  responsive while the face never turned. A `pointercancel` or `pointerleave`
  un-depresses the button **without** performing a turn — only a clean release
  over the button counts.
- Buttons have `tabIndex = -1` (out of tab order; keyboard shortcuts handle
  accessibility instead).
- Buttons are `tabIndex = -1` and `touch-action: none` to prevent Safari from
  treating a tap as a scroll/zoom gesture.

### Primary actions (right panel, bottom)
Five buttons in a 2-column grid:
| Button | Action |
|--------|--------|
| **Scramble** | Apply a random 20-move scramble with animation. No two consecutive moves use the same face. Each move has a random modifier from `['', '2', "'"]`. |
| **Solve** | Compute and animate the solution via cubejs, step-by-step. |
| **Step →** | Advance the current queue by one move and stop (used for manual stepping through a solve/scramble). |
| **← Step** | Undo the last executed move by animating its inverse. The original move is re-queued for replay. |
| **Reset** | Instantly return the cube to the solved state, clear the move log. |

### Scramble behavior
- Generates 20 random moves. No two consecutive moves use the same face letter.
- Each move gets a random modifier from `['', '2', "'"]`.
- The full sequence is shown in the Move Log up front, then animated.

### Solve behavior
- Reads the cube's facelet string, hands it to `Cube.fromString(...).solve()`.
- Animates the returned move sequence one move at a time.
- If already solved, shows "Already solved" status and does nothing.
- After solving, status shows "Solved" or "Solved (best effort)".

### Step forward / backward
- **Step forward**: Pops the next move from the queue (LIFO — newest-undone on
  top), re-records it in the log, animates it, then **stops** (auto=false). The
  remaining queue stays parked for subsequent steps.
- **Step backward**: Undoes the last move by animating its inverse. The original
  move is re-queued (as a built animation with its correct index) so Step → can
  replay it. The move is removed from the log.

### Load scramble file
- A "Load a scramble file…" button in the right panel opens a **native file
  picker** accepting `.txt`, `.cubetext`, `.alg` files.
- The selected file is read locally via `File.text()` (no network, works over
  `file://` with HTTP server for local file access).
- The file content is parsed with `parseAlg()` (lines starting with `#` and blank
  lines are ignored, matching the Cubie scramble-file header format).
- The cube resets to solved first, then animates the loaded sequence.
- If no valid moves are found, a toast error message is shown.

### Animation speed slider
- A range slider (min 0.3, max 3, step 0.1, default 1.0) labeled "Animation
  speed" with "Slow" and "Fast" end labels.
- The slider value **is** the speed multiplier (low = slow, high = fast).
- Displayed as e.g. `1.0×`.

---

## 5. UI & Polish

### Overall style
- Dark-mode, glassy panels with `backdrop-blur-md`, `ring-1 ring-white/10`,
  `bg-slate-900/70`, `shadow-lg/xl`.
- Page background: `bg-slate-950` (`#0f172a`).
- `color-scheme: dark`.

### Top bar
- **Left**: Cutie logo — a small 3×3 grid of colored squares (matching the six
  face colors in a representative pattern) next to the "Cutie" title and "3D
  Rubik's Cube Solver" subtitle.
- **Right**: Status pill with:
  - A **colored dot**: emerald (solved), sky (scrambled), amber (solving/busy),
    slate (idle/paused).
  - **Status text**: "Solved", "Scrambled", "Turning…", "Scrambling…",
    "Solving…", "Solving — paused", "Paused — Step ▸ to continue",
    "Solved (best effort)", "Already solved".
  - A vertical divider and a **Moves counter** (live, `tabular-nums`).

### Right control panel
- **Move Log** card:
  - Header: "Move Log" label + move count ("0 moves", "1 move", "N moves").
  - Content: a **grid of move-buttons, 5 per row** (`grid-cols-5`), each button
    being one move token (e.g. `R`, `U'`, `F2`), styled to match the face
    buttons with three visual states:
    - **pending**: not yet reached (muted, dimmed, `#1e293b` background,
      `#94a3b8` text).
    - **past**: already turned (faint "done" look, `#0e1a2b` background,
      `#475569` text).
    - **current**: animating right now (bright amber highlight, `#f59e0b`
      background, `#0b1020` text, glowing box-shadow, slight lift).
  - The grid **scrolls** when taller than the panel (custom thin scrollbar).
  - The current button auto-scrolls into view.
  - Empty state: a placeholder message prompting the user to turn faces and solve.

- **Animation speed** section (see §4).
- **Load Scramble** section (see §4).
- **Primary actions** grid (see §4).

### Face buttons panel (left edge)
- Glassy panel with "Turn a layer" label, two columns of buttons, and a
  "Shift+click = counter" hint.
- Fade-in animation on load.

### Drag-to-rotate hint
- A small pill in the top-left area: "Drag to orbit · Scroll to zoom".

### Solver loading toast
- A centered bottom toast with a spinner and "Warming up the solver…" text,
  shown while cubejs initializes, hidden when ready or on error.
- Also used for error messages (e.g. "cubejs failed to load", "Could not read
  file: …"), auto-hiding after 4 seconds.

---

## 6. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Solve |
| `S` | Scramble |
| `R` | Reset |
| `F` | Step forward |
| `B` | Step backward |
| `→` | Step forward |
| `←` | Step backward |
| `U` `D` `L` `R` `F` `B` | Turn that face clockwise |
| `Shift` + `U` `D` `L` `R` `F` `B` | Turn that face counter-clockwise |

**Note on key handling**: Face-turn keys are checked via `e.key.toUpperCase()`
while command keys (`s`, `r`, `f`, `b`, space) are checked via
`e.key.toLowerCase()`. This means `R` (uppercase) triggers a face turn while
`r` (lowercase) triggers reset. Input fields are ignored (`e.target.matches('input, textarea')`).
Repeat events are ignored for face turns (`e.repeat`).

---

## 7. Scramble Files

Create three text files under `docs/scrambled/`:

- `scramble-1.txt` — A quick, medium-length scramble:
  ```
  F2 R D' F2 B' R U' B' L B R2 F L2 R F R2 D' L R D F' B' U' L
  ```
- `scramble-2.txt` — An alternate medium-length scramble:
  ```
  R2 U L D' B D2 F2 L2 U2 B' L2 D2 F R U2 B' R2 F2 R F'
  ```
- `scramble-3.txt` — A longer, more tangled scramble:
  ```
  L B2 U R' U B D' L2 B' U2 F2 R2 B U' L B2 L B' U' L2
  ```

Each file has a comment header (lines starting with `#`) explaining the format:
standard Singmaster notation, applied in order to a solved cube. Lines starting
with `#` and blank lines are ignored.

---

## 8. Screenshot Harness & Testing

### `window.__RUBIKS__` hook
The app exposes a `window.__RUBIKS__` object for headless screenshot capture
and testing:
```js
window.__RUBIKS__ = {
  get ready() { return solverReady; },
  get busy() { return state.busy; },
  get status() { return state.status; },
  get cubies() { return cubies; },
  isAnimating: () => state.busy,
  applyInstant: (face, power) => { /* apply move with no animation, update UI */ },
  applyAlg: function (alg) { /* apply algorithm, each move instant */ },
  solveToSolved: async function (alg) { /* apply alg, then solve */ },
  setCamera: () => { /* snap camera to home position */ },
  readFrame,      // read GL back buffer via gl.readPixels, return { width, height, data(base64) }
  renderFrame,    // render one frame with transparent background, return raw RGBA pixels
  setPixelRatio,  // pin devicePixelRatio for 1:1 viewport mapping
  clearLog: () => resetMoves(),
  syncLog: () => { /* mark all moves as done, re-render log */ },
  readFaceletString: () => readFaceletString(cubies),
  isSolved: () => isSolved(cubies),
  waitUntilIdle: (maxMs = 10000) => { /* poll until state.busy is false */ },
}
```

- `readFrame()` reads the GL back buffer via `gl.readPixels` (bypasses the
  unreliable 2D-canvas sync in headless Chromium), flips rows to top-down, and
  returns `{ width, height, data }` where `data` is base64-encoded raw RGBA.
- `renderFrame()` temporarily sets `scene.background = null` and
  `renderer.setClearColor(0x000000, 0)` so the cube composites over a
  transparent layer, then restores the background.
- `applyAlg` is a plain `function` (not arrow) so `this` stays bound when
  detached by `page.evaluate`.

### `tools/verify.js`
Node unit tests that:
1. Extract the code between `CUBE:START` / `CUBE:END` sentinels from `index.html`.
2. Evaluate it in a Node VM context (no DOM/Three.js deps).
3. Load cubejs from `node_modules` in the same VM context.
4. Test:
   - **Test 1**: All 18 single moves (6 faces × 3 modifiers) produce facelet
     strings matching cubejs.
   - **Test 2**: A 300-move random sequence matches cubejs.
   - **Test 3**: Solve round-trip through cubejs (5 trials).
5. Prints `ALL TESTS PASSED ✔` or failure count.
6. Run: `node tools/verify.js`.

### `tools/press-test.js`
Playwright-based tests for face-button behavior:
- Plain press: depressed visual, label stays plain, restores on release.
- Shift-click: label previews prime (`F'`).
- Double-click: second press previews half-turn (`R2`), label restores on release.
- Ambient prime: holding Shift primes ALL labels; releasing restores.
- Shift+click keeps label primed after release.
- Shift+double-click: transient `U2` preview, then back to `U'`.
- Cmd/Meta is ignored (labels stay plain).
- Action: double-click performs 180° (two double-clicks return to solved).
- Action: single click performs 90° (four return to solved), deferred (no
  animation during debounce window).
- Run: `node tools/press-test.js`.

### `tools/render-screenshot.js`
Headless screenshot harness (Playwright + ImageMagick):
1. Launches headless Chromium, loads `index.html`.
2. Forces `devicePixelRatio = 1` via `setPixelRatio(1)`.
3. Waits for solver to be ready.
4. Captures three screenshots:
   - **solved.png**: initial solved state, camera at home.
   - **scrambled.png**: apply `scramble-1.txt`, sync log (all buttons "done").
   - **solved-after.png**: clear log, compute solution, apply it, sync log.
5. Each screenshot composites: `renderFrame()` (cube as transparent PNG via
   `gl.readPixels` → ImageMagick) over `page.screenshot()` (DOM UI).
6. Outputs to `docs/screenshots/`.
7. Run: `node tools/render-screenshot.js`.

---

## 9. Screenshot Gallery

Create `docs/screenshots/index.html` — a standalone gallery page showing the
three screenshots (solved, scrambled, solved-after) in a 3-column grid with:
- A branded header (Cutie logo + "Screenshot Gallery" title).
- Each figure: thumbnail image, step badge ("Step 1/2/3"), colored status dot,
  caption with description.
- Hover effects (translateY, border color change).
- Links to the full-size images and back to the app.
- Dark theme matching the app's aesthetic.

---

## 10. README.md

Create a `README.md` in the project root with:
- **Title**: "Cutie — 3D Rubik's Cube Solver".
- **Description**: Single-file, client-side 3D Rubik's Cube with Three.js
  rendering and cubejs solving. No backend, no build step.
- **Screenshots**: A 3-column table showing solved/scrambled/solved-after
  images, with a link to the gallery.
- **How to run**: Double-click `index.html`, or serve via `python3 -m http.server
  8000` / `npm start`. Note that loading scramble files needs the HTTP server.
- **How to play**: 4 steps (start solved, scramble, solve, explore).
- **UI description**: 3D viewport, top bar, right panel (Move Log, speed, load,
  actions), face buttons (left edge, two columns, pointer-event-based, Shift
  prime preview).
- **Keyboard shortcuts** table.
- **Move notation** explanation.
- **How it works**: 26 cubies, facelet string matching cubejs, solving via
  `Cube.fromString().solve()`, all from CDNs.
- **Repository layout**: index.html, docs/, tools/, package.json.
- **Tech**: Three.js, cubejs, Tailwind CSS, vanilla JS.

---

## 11. package.json

```json
{
  "name": "cutie-rubiks-cube",
  "version": "1.0.0",
  "description": "A single-file, client-side 3D Rubik's Cube solver with cubejs-powered solving.",
  "type": "commonjs",
  "scripts": {
    "verify": "node tools/verify.js",
    "start": "python3 -m http.server 8000"
  },
  "devDependencies": {
    "cubejs": "1.3.2",
    "playwright": "^1.65.1"
  }
}
```

The `cubejs` and `playwright` devDependencies are **only** for the test and
screenshot tools — the app itself loads cubejs from CDN.

---

## 12. .gitignore

```
# macOS system files
.DS_Store
.AppleDouble
.LSOverride
Icon
Icon\?

# Thumbnails
._*
.Spotlight-V100
.Trashes
.VolumeIcon.icns

# ignore downloaded node modules
node_modules/

```

---

## 13. CSS Details

- `:root { color-scheme: dark; }`, full-height `html, body`.
- `#canvas-wrap` is `position: fixed; inset: 0` (full viewport).
- Slider accent color: `#38bdf8` (sky-400).
- Custom thin scrollbar for the move log: 8px wide, `#334155` thumb,
  transparent track.
- Fade-in keyframe animation for panels (0.25s, translateY 4px).
- `.face-btn`: transition for transform/box-shadow/background-color (0.07s),
  base box-shadow, `user-select: none`, `touch-action: none`.
  - `.face-btn.pressed`: `bg-slate-950` (`#020617`), inset shadow,
    `translateY(2px) scale(0.94)`.
- `.move-btn`: monospace font, 13px, 600 weight, 8px vertical padding,
  rounded-8px. Three state classes:
  - `.pending`: `#1e293b` bg, `#94a3b8` text, subtle inset border.
  - `.past`: `#0e1a2b` bg, `#475569` text.
  - `.current`: `#f59e0b` bg, `#0b1020` text, glowing amber box-shadow,
    slight lift (`translateY(-1px)`).

---

## 14. Repository Layout

```
index.html                 The entire app (HTML + CSS + JS, self-contained)
docs/
  prompts/cutie.md         This specification
  scrambled/               Sample scramble files (.txt) for the Load feature
    scramble-1.txt
    scramble-2.txt
    scramble-3.txt
  screenshots/             Solved / scrambled / solved-after captures + gallery
    index.html             Gallery page
    solved.png
    scrambled.png
    solved-after.png
tools/
  verify.js                Unit tests: cube core vs cubejs (Node VM)
  press-test.js            Face-button behavior tests (Playwright)
  render-screenshot.js     Headless screenshot harness (Playwright + ImageMagick)
package.json               `npm start` (http server) + dev dependencies
README.md                  Project documentation
.gitignore
```

---

## 15. Key Implementation Notes

- **Single file**: The entire app is `index.html` — HTML + embedded CSS +
  embedded JS. No build step, no bundler.
- **ES module**: The main script is `type="module"` (required for Three.js ESM
  import). cubejs loads as classic `<script>` tags before the module script.
- **Pointer Events, not click**: Face buttons use `pointerdown`/`pointerup`
  (not `click`) because Safari can suppress `click` after a tap.
- **No double-click detection**: There are no `dblclick` listeners or deferred
  timers. A click is exactly one move. Half-turns are a separate column of
  buttons.
- **Shift = prime**: Only Shift is the prime modifier. Cmd/Meta is ignored
  (on macOS it is the right-click modifier).
- **Batch animation**: Scramble and solve enqueue the entire sequence up front
  (so the Move Log shows all buttons at once), then auto-advance through them.
  Step mode plays one move and stops.
- **Step backward re-queues**: When undoing a move, the original is re-queued
  (with its correct log index) so Step → can replay it in the original order.
- **Solver lifecycle**: `initSolver()` calls `Cube.initSolver()` in a
  setTimeout(50ms) to defer heavy solver initialization. `waitForSolver()`
  polls `solverReady`. The "Solve" button awaits the solver.
- **Physical lighting**: Since three.js r155, default lighting is physically-
  based. Light intensities are scaled by ~π from the r150-era "legacy" values
  to maintain the original look.
- **Transparent renderer**: The WebGL renderer uses `alpha: true` and
  `preserveDrawingBuffer: true` so screenshots can composite the cube over the
  DOM UI.
- **All code well-commented**, free of placeholder or missing functions.
