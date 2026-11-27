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
- Dark scene background (`0x0f172a` — slate-900, the same color the body uses as
  its page background, which is what makes the stage's letterbox seamless).
  Renderer uses `alpha: true` and `preserveDrawingBuffer: true` so the cube can be
  composited over the DOM in screenshots.
- `PerspectiveCamera` with 38° FOV at a 3/4 view (home position `(6.5, 5.5, 8.5)`).
- Physically-based lighting (post-r155): ambient (`2.8`) + a key directional light
  (`3.3`) with PCFSoft shadow map (1024×1024) + a cool fill light
  (`0x88aaff`, `1.1`). A soft ground plane (`ShadowMaterial`, opacity `0.28`) at
  `y = -3.4` catches a drop shadow.
- Since three.js r155, light intensities are ~π× the old "legacy" values.

### Stage & empty-rectangle canvas
- **The stage (`#stage`)** is the bounding box the ENTIRE app lives in:
  `position: fixed; inset: 0; margin: 0 auto` with
  `width: min(100vw, 1276px)`, `height: min(100dvh, 1366px)`,
  `overflow: hidden`. The height uses **100dvh (dynamic viewport height)**
  rather than `100vh`, so on mobile the stage tracks the *visible* area as
  the browser's toolbars collapse/expand instead of being pushed off the
  bottom of the screen by them. It is **horizontally centered and
  TOP-anchored** — flush with the viewport top, so when the viewport is
  taller than 1366px the letterbox margin appears
  at the **bottom only** (and on the sides whenever the viewport is wider than
  1276px). Below the caps the stage IS the viewport and behaviour is
  unchanged. The body is `bg-slate-900` — the SAME color as the scene clear
  color (`0x0f172a`) — so the letterbox margins are seamless (no visible
  edge). All chrome is anchored **inside** the stage (`absolute`, never
  `fixed`), and the renderer, camera, and all projection math use the
  stage/canvas rects, never the viewport's.
- **The canvas (`#canvas-wrap`) fills the stage's EMPTY space**, not the whole
  stage: the stage minus three chrome bands, each carrying a **16px clearance**
  (the cube must never sit under a band), every piece computed from the real
  DOM/CSS at runtime:
  - **TOP** — the banner's actual height (its rect, measured) + 16px.
  - **LEFT** — closed drawer: the binder tab's right edge + 16px; open drawer:
    the panel card's right edge + 16px.
    - **RIGHT** — 0 by default; while the Move Log is right-docked (see the
    *right-docked Move Log band* below) it is 16px + the docked card's live
    measured width (58–194px, JS-set from the column count — the band is
    re-measured whenever the column count changes, on move add/clear as well
    as on resize, so the cube re-centers as the card grows).
  - **BOTTOM** — 0 while the Move Log is right-docked; otherwise the Move
    Log's **reserved** height, computed as if it had
    EXACTLY 3 button rows (never the dynamic height): the wrapper's `pb-1`
    (4px) bottom margin + the card's header row + 3 rows of move buttons with
    2px gaps + the log area's `py-2` padding + 16px.
  The cube lives at the world origin and the camera targets it, so the cube is
  always centered in its canvas — sizing the canvas to the empty rectangle
  therefore **centers the cube in the empty space at all viewport sizes**. The
  bands are re-measured after every resize and drawer toggle.
- **Close-slide tracking**: while the drawer slides closed (~0.3s CSS
  transition) the left band changes, so a per-frame `requestAnimationFrame`
  loop re-sizes the canvas every frame — the left band is a linear blend of the
  two rest-state bands (closed: tab edge + 16; open: card edge + 16)
  parameterised by the panel card's measured progress through the slide — so
  the **cube slides left WITH the drawer** instead of jumping when the slide
  ends. The blend is clamped to [0,1] for the whole slide in both directions
  (including mid-slide re-toggles, each of which restarts the loop), a re-render
  runs immediately after every resize (resizing resets the WebGL drawing
  buffer; without this the compositor would paint an empty canvas and the cube
  would vanish for the whole slide), and tracking stops when the card settles
  (≤0.5px from the target for 2 frames, ~3s safety net), snapping to the
  exactly-measured band. **Opening is an instant reflow** (no tracking).
- **Panel vertical placement**: `applyCanvasRect` sets the control
  drawer's wrapper top at startup, on every resize, and on every band
  re-measure — three branches, keyed on the log's dock (the old single
  790px threshold is deleted): stage height **> 784px** (bottom-docked
  log): the drawer unit (card + tab) is **vertically centered** between
  the banner bottom and the Move Log top (equal gaps, clamped so the top
  never enters the banner); stage height **784 or below** (right-docked
  log) and **≥ `PANEL_FIT_MIN` (635)**: the right-docked log no longer
  spans the stage bottom, so the unit is centered between the banner
  bottom and the **stage bottom** (the panel fits: banner 52 + 16 + panel
  551 + 16 ≤ stage; at exactly 635 centering and pinning agree, so the
  branch switch is continuous); **below 635**: **top-pinned** at banner +
  16px (it may overflow and clip the stage bottom — by explicit decision,
  no guard). In every branch the **canvas rect never moves with the
  panel** — its top stays at banner + 16px (the first-paint fallback
  `top-[68px]` is exactly banner 52px + 16px).
- **Right-docked Move Log band**: in a height-only, width-independent band —
  stage height **≤ `NARROW_LOG_FIT_MAX` (784, inclusive); there is NO lower
  bound** — `applyCanvasRect` re-docks the Move Log (the **SAME card**, via
  a `.log-right` class toggle — no duplicate element, so the move counter,
  empty hint and auto-scroll JS all keep working) from the stage's bottom
  edge to its **RIGHT edge**. 784 rounds the live-measured bottom-dock fit
  minimum 783.5 up to the whole px and makes the fit point itself
  right-dock: 783.5 = 52 + 16 + 551 + 16 + 144.5 + 4 (banner 52px, the
  top/bottom clearances, the 551px open Control Panel, the 144.5px 3-row
  bottom-dock log card, and the wrapper's 4px bottom gap; 32×29px buttons,
  2px gaps, 31px row pitch). Above 784 the bottom dock has room and stands;
  at 784 and below the log re-docks — including below the old 635px lower
  bound, which is deleted: the old degenerate "bottom-docked but the pinned
  panel doesn't fit" case is resolved (the panel pins at banner + 16 and may
  clip the stage bottom, by explicit decision).
  - **In-band geometry**: the card is **headerless** — the header row
    (title + count) is hidden in-band (`display: none`) but stays in the DOM
    as the single source of truth for the bottom dock, and `#move-log`
    fills the whole card; the empty-state hint is hidden. Card top = banner
    bottom + 16px (set live by `applyCanvasRect`; **68px** at the default
    52px banner), card bottom = stage bottom − 16px, **16px from the
    stage's right edge**. The card is **no longer fixed-width**: its width
    is JS-driven (inline style in `applyCanvasRect`) — **`34·cols + 24`**
    (the columns' 32px buttons, the 2px column gaps, 24px of `#move-log`
    horizontal padding, and 2px of the ring), i.e. **58/92/126/160/194px**
    for 1–5 columns; CSS `width: 58px` is only the pre-JS fallback for the
    1-column minimum.
  - **Column-major flow**: `#log-list` is a **row** of explicit `.log-col`
    wrappers — each a flex column of 32px buttons with 2px gaps (31px row
    pitch) — and `renderMoves` splits the buttons **column-major**: each
    column fills top→bottom, then the next column to the right; the first
    `cols − 1` columns hold exactly `perCol` buttons, the last the
    remainder. The split is into explicit wrappers, **not CSS flex-wrap**
    (documented in the CSS comment): flex-wrap was measured to spawn a 6th
    column *past* the card's right edge — clipped by the section's
    `overflow: hidden`, unreachable — and never grew `scrollHeight`, so a
    scroll fallback could not reach the extra moves. `#log-list` is
    centered, so each outer column sits 12px + 1px from its card edge —
    symmetric, no dead space.
  - **Column capacity & count**: `perCol = floor(#move-log clientHeight / 31)`
    measured live — the docked card is headerless, so `clientHeight =
    stageH − 84` exactly (banner 52 + top 16 + bottom 16; the log's 4px
    vertical padding sits INSIDE the client area, and the 1px ring is a
    layout-neutral box-shadow, so neither subtracts) — 700 → 616 → 19;
    636 → 552 → 17; 450 → 366 → 11; 400 → 316 → 10; 320 → 236 → 7.
    `cols = min(max(ceil(moves / perCol), 1), 5)`: **1 column at 0 moves**
    (58px), growing one column at a time as moves accumulate up to the
    **5-column cap** (194px).
  - **No scrollbar while it fits**: while the moves fit, `#move-log` is
    `overflow: hidden` — no scrollbar. The internal vertical scroll
    fallback (`.log-scroll`) engages only when `moves > 5 × perCol`, which
    only happens below a stage height ≈ 332px (5 × floor((332 − 84)/31) =
    5 × 8 = 40 ≥ 36; at 331 it drops to 5 × 7 = 35 < 36). Then the extra
    moves grow the LAST column downward and `#move-log` scrolls vertically;
    the width stays at the 5-column cap. The 45%-of-stage `.log-cap` does
    **not** apply in-band (the card height is the top/bottom anchors).
    Stale splits are re-run through `renderMoves`: a vertical resize changes
    `perCol` and the `dockedSplitSig` signature (`perCol × moves`) detects
    it; `renderMoves` re-runs a layout pass while docked so the cube
    re-centers without waiting for a resize; undocking re-flattens the
    split (`dockedSplitSig = 'bottom'` + re-render) back to wrapping rows.
  - **Canvas right band**: in-band the canvas wrap's `right` inset becomes
    **16 + the docked card's live measured width** and its `bottom`
    reservation drops to **0** (the log no longer occupies the stage's
    bottom edge) — the cube re-centers in the remaining rectangle, and
    `applyCanvasRect` re-measures the band whenever the column count (hence
    the card width) changes — on move add/clear as well as on resize, as a
    snap with no animation. Out-of-band the wrap keeps `right: 0` and the
    reserved 3-row bottom band, unchanged. The class toggle + live top +
    live width land BEFORE the panel math (the bottom-dock centering branch
    measures the log's top, which the dock changes). This runs on startup,
    on every resize, and on every drawer-slide frame (`startBandTracking`),
    so crossing the 784 edge re-docks/undocks with the existing snap — no
    animation for the log dock.
  - **Boundary safety**: 783.5 is an *exact* fit (banner + open panel + a
    3-row log + the wrapper's 4px gap = the stage height), and ~1–2px of
    platform metric drift (fonts/DPR) shifts the true fit point by the same
    amount. The worst case just above the boundary is the 16px clearance
    inside the reserved band (canvas bottom to card top) eroded by ~1–2px —
    an actual canvas/card overlap would require >16px of drift, i.e. H <
    767.5, which is inside the band, where the log is right-docked and
    nothing sits at the bottom — so the constant is safe without any
    extra slack.
  - **Scrollbar-platform trade-off**: the 1-column 58px card width is
    tight — on platforms that render a classic (non-overlay, non-`.scroll-
    thin`) 15px scrollbar in `#move-log`, the fixed 32px buttons keep their
    width with only ~1px of side clearance. Accepted trade-off: the buttons
    never stretch or wrap; the card's own internal scroll handles overflow,
    and the column-major flow simply adds columns.
- **Stage-relative size caps**: `--stage-h: min(100dvh, 1366px)` replaces the
  old viewport units — `.log-cap` (Move Log) = **45% of the stage height** and
  `.panel-cap` (control panel) = **95% of the stage height** (replaces the old
  `max-h-[45vh]` / `max-h-[95vh]`; identical below the 1366px cap, scaled to
  the stage above it).

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

### Control panel (left edge) — a slide-out drawer
The control panel — the face buttons, the animation-speed slider, and the five
action buttons — lives in a **panel that hides behind a tab** on the left edge, so
the cube's empty space stays clear. The tab is a vertical **"Control Panel"** handle (like a
binder tab) on the panel's **right** edge; it is always visible, and the panel
slides in from the left when opened:

- **Tap the tab** to slide the panel out; **tap it again** to slide it back. The
  toggle is a `click` on a real `<button>`, so it works with a tap on iPad with
  no keyboard. **`C`** toggles the same drawer from the keyboard.
- **Tab is not the shortcut**: it drives browser focus navigation and the primary
  action buttons are focusable, so `C` is used instead.

When open, the panel is **one tall bordered card** that stacks (top to bottom)
the three face-button columns (each column labelled **CW** / **CCW** / **Half**
above its buttons), a divider, the **Animation-speed slider** (see
below), another divider, and the five **primary-action buttons** (Scramble /
Solve / ← Step / Step → / Reset) in an **inner bordered sub-panel**. The card's
width stays driven by the face columns; the slider and the button sub-panel
stretch to fill the same inner width. Each face button is **one fixed move**, so a
tap always does exactly one thing with no modifier — important on touch devices
(e.g. iPad) that have no Shift key:

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

### Primary actions (left panel, in the control drawer)
The five primary-action buttons live at the bottom of the left control
drawer, in an inner bordered sub-panel (2-column grid; Reset spans both
columns):

| Button | Action |
|--------|--------|
| **Scramble** | Random 18–24 move scramble, no two consecutive same-face, animated. Clears the log first. |
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
- **Over-cap refusal**: if the solver returns a sequence of **more than 36
  moves** (`tokens.length > MAX_MOVES`), the answer is refused *before*
  `resetMoves()` — the queue is never filled, the existing log is never
  cleared, and the cube is untouched. `toastMsg('Failed to find a solve
  solution', 1000, false)` shows a plain (no-spinner) toast that fades out.

### Move limit (36-move cap)
- A `MAX_MOVES = 36` constant (next to the `state` definition) caps the Move
  Log at **36 moves total** — solves, scrambles, and hand face turns alike.
- **Face turn**: `userTurn()` truncates the log to the cursor (dropping future
  moves) and *then* checks `state.moves.length >= MAX_MOVES`; at the cap it
  refuses the turn — no animation, no log entry — and shows
  `toastMsg('Maximum moves allowed: 36', 1000, false)`. Undoing a move (Step
  ←) frees a slot, so the next turn is accepted. Scrambles (18–24 moves)
  never reach the cap and are unaffected.
- **Solve**: `solve()` checks `tokens.length > MAX_MOVES` right after
  `parseAlg` + the empty check, and *before* `resetMoves()` — an over-cap
  answer is dropped with a "Failed to find a solve solution" toast, leaving
  the log and the cube untouched.
- The checks run in the two existing choke points (`userTurn` for all face
  turns — buttons and keyboard alike — and `solve()`), so no other code path
  can grow the log past the cap.

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
- Lives in the **left control drawer**, between the face columns and the
  action-button sub-panel.
- Range slider (0.3–3, step 0.1, default 1.0) with "Slow"/"Fast" labels.
  Displayed as e.g. `1.0×`.

---

## 5. UI & Polish

### Overall style
- Dark-mode, glassy panels (`backdrop-blur`, semi-transparent dark backgrounds,
  subtle ring borders). Page background: **slate-900** (`bg-slate-900`) — the
  same color as the scene clear color, which is what makes the stage's letterbox
  margins seamless. `color-scheme: dark`.

### Top bar
- **Full-width top banner**: one continuous edge-to-edge strip anchored to the
  **stage's** top edge, dark and only a hair lighter than the visible slate-900
  scene background (~3% white wash); the outer strip is pointer-events-none.
  The banner occupies the stage's top band — the canvas starts 16px below the
  banner's bottom edge, so the banner never covers the cube (no top padding
  added to the canvas).
- **Left**: Cutie logo — a small 3×3 grid of colored squares next to the title
  and subtitle. The title itself carries the credit: a small 10px slate-400
  "by Qwen3.8" sits immediately to the right of the "Cutie" word.
- **Right**: Status pill with a colored dot (emerald/sky/amber/slate for
  solved/scrambled/busy/idle), status text, and a live **Moves counter**.
- Status values: "Solved", "Scrambled", "Turning…", "Scrambling…",
  "Solving…", "Solved (best effort)", "Already solved".

### Move Log panel — always visible (bottom dock, or right dock)
- **Not a drawer**: a panel **always visible** — no tab, no toggle, no keyboard
  shortcut, no startup decision. By default it is **fixed at the bottom of the
  stage**: the bottom wrapper spans the stage's width minus a **4px gap at each
  edge** (`left-1` / `right-1`) and lets pointer events pass through everywhere
  except the card itself, which **fills that full width**; it sits in the
  stage's bottom band (the canvas ends 16px above the log's reserved height, so
  the panel never covers the cube). When the stage is **784px tall or
  shorter** (no lower bound — see *Right-docked Move Log band* in §2 for the
  constant, the column-major geometry, and the boundary notes) the SAME card
  re-docks to the stage's **right edge**: top = banner bottom + 16px (68px at
  the default banner), 16px from the right edge and from the stage bottom,
  a **headerless** card (title + count hidden in-band, still in the DOM),
  58px wide at 0 moves and growing to 194px as its columns fill (34·cols + 24
  = 58/92/126/160/194px for 1–5 columns), a **column-major** flow of 32px
  move-buttons (2px gaps, 31px row pitch) with no scrollbar while the moves
  fit (internal scroll only past the 5-column capacity, below a ≈332px
  stage), the 45% cap not applying in-band, and the empty-state hint hidden.
- Glassy card (rounded, semi-transparent slate-900, backdrop blur, ring border)
  that **fills the wrapper's width** (title row and moves alike).
- **Header**: "Move Log" title + a live **move-count** (e.g. `12 moves`).
- **Move Log**: a row of move-buttons that **wraps**, one per move token, each a
  **fixed 32px wide** (`2rem`, flex `0 0 auto` — never a fluid grid
  fraction), centered, and the row **auto-wraps at the panel's width** (no
  fixed per-row cap), adding rows as moves are added — no horizontal
  overflow. (Right-docked, the same buttons are explicit `.log-col`
  columns — filled top→bottom, then the next column rightward — instead of
  wrapping rows.) Three visual states driven by the **cursor** — **past**
  (index `< cursor`, faint done look), **pending** (index `>= cursor`, dim),
  **current** (the move animating right now / last applied, bright amber
  highlight) — with the current button auto-scrolling into view. The card grows
  with rows but **caps at 45% of the stage height** (`.log-cap` = 45% of
  `--stage-h` — identical to the old `45vh` cap while the stage fills the
  window, scaled to the stage above it; the cap does **not** apply in the
  right-docked band, where `#move-log` fills the card — no scrollbar while
  the moves fit, internal scroll only past the 5-column capacity)
  and then scrolls internally
  (`.scroll-thin`
  scrollbar). Empty state shows a placeholder message. The top bar's "Moves"
  counter shows the number of moves actually applied (the cursor); the panel's
  header count shows the total moves in the log.

### Control panel (left edge)
- A **slide-out drawer** whose **open/closed state is width-based** (the old
  overlap detection was deleted): `decideStartupControlDrawer()` opens the
  drawer when the **stage is wider than 750px** and leaves it closed at 750px
  or narrower, and `closeControlDrawerOnNarrow()` — wired into the Scramble/
  Solve click handlers — slides an open drawer away only when the stage is
  750px or narrower *at click time* (above 750px the clicks leave it open).
  The boundary is exact: 750px → closed, 751px → open. Resizing the stage
  does **not** re-evaluate the drawer's state — it only re-measures the canvas
  band from the drawer's live position. While closed, the panel card is fully
  off the stage's left edge (clipped by the stage's `overflow: hidden`) and
  the vertical "Control Panel" binder tab — the card's rightmost child —
  stays visible, peeking in from the stage's left edge. Tapping the tab (or
  pressing `C`) slides the panel out; tapping again slides it back.
- **Vertical placement** is set by `applyCanvasRect` (at startup, on every
  resize, and on every band re-measure), in three branches keyed on the log's
  dock (the old single 790px threshold is deleted): stage height **> 784px**
  (bottom-docked log) → the drawer unit (card + tab) is **vertically
  centered** between the banner bottom and the Move Log top (equal gaps,
  clamped so the top never enters the banner); stage height **784 or below**
  (right-docked log) and **≥ 635px** (`PANEL_FIT_MIN`) → the unit is centered
  between the banner bottom and the **stage bottom** (the right-docked log
  leaves the stage bottom clear, so the full height is available; at exactly
  635 centering and pinning agree — the branch switch is continuous);
  **below 635** → **top-pinned** at banner + 16px (may overflow/clip the
  stage bottom — by decision, no guard). The first-paint fallback `top-[68px]`
  is exactly banner 52px + 16px. The **canvas rect never moves with the
  panel** — its top stays at banner + 16px in every branch. Accepted
  trade-off: on a ≲320px-wide stage with a full 36-move log, the clamped
  panel can slightly overlap the Move Log's top edge.
- Glassy panel: ONE tall bordered card stacking the three button columns
  (each labelled CW / CCW / Half above its buttons), the Animation-speed
  slider, and the five action buttons in an inner bordered sub-panel. No top
  label — the tab *is* the "Control Panel" label.

### Misc
- **Drag-to-rotate hint**: a small pill, centered horizontally near the top
  **of the stage**
  (`top-17`), "Drag to orbit · Scroll/Pinch to zoom" — single line, `whitespace-nowrap` so it never wraps (even at narrow phone widths); it fades out on the **first keypress
  or pointerdown** (via a capture-phase `document` listener that fires before the app's
  handlers), then removes itself from the DOM. Respects
  `prefers-reduced-motion: reduce` — skips the fade animation and removes immediately.
- **Credit line**: the old bottom-left attribution line **of the stage**
  ("created with qwen3.8:27b-mlx-4bit") has been **removed** — it overlapped
  the Move Log on narrow screens. The credit now lives in the banner next to
  the "Cutie" title as a 10px slate-400 "by Qwen3.8" (see *Top bar* above),
  and the first-interaction dismiss script now tracks only the drag hint.
- **Solver toast**: a **stage-centered** dark card (flex-centered in a
  full-stage overlay) with a **27px spinner** (`w-[27px] h-[27px]`, 2px
  border, `#solver-spinner`) and a **22.5px label** (`text-[1.40625rem]`),
  reading "Waking up the solver..." — shrunk 25% from the old 36px spinner
  (3px border) / 30px (`1.875rem`) label; card padding unchanged (`gap-3 px-6 py-4`).
  `toastMsg(msg, ms = 4000, withSpinner = true)` reuses the card for messages:
  with `withSpinner = false` the spinner is hidden (plain message toasts, e.g.
  the Move-limit refusals). The card carries `transition-opacity duration-250`
  and **fades in/out over 250ms** (show: drop `hidden`, clear `opacity-0` on
  the next frame; hide: add `opacity-0`, then flip the wrapper to `hidden`
  ~250ms later), auto-hiding after `ms` (the Move-limit toasts use 1000ms;
  solver-init messages keep the 4000ms default). A single `toastTimer`/
  `toastFadeTimer` pair is cleared on every new show.

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
| `C` | Toggle the control panel drawer open / closed |

(`C` was previously the removed controls-drawer key — it is free again. `T` no
longer toggles the drawer.)

Face-turn keys are matched via `e.code` (physical key, e.g. `KeyU`), not
`e.key` (composed character).  On macOS `Option+U` sets `e.key` to the
composed glyph (`µ` in Latin-1), so the check would miss; `e.code` is
unaffected by modifiers or locale.  Any of `U D L R F B` turns that face
(`Shift` for the counter-clockwise prime, `Alt`/`Option` for the 180° half
turn — directionless, so it wins over `Shift` when both are held).  Input
fields are ignored, and repeat events are ignored for face turns.

---

## 7. Testing

Test scripts write any scratch artifacts (e.g. `click-test.js`'s pressed-state
screenshot) to the git-ignored project-root `tmp/` directory, creating it on
demand. Nothing is written at the repo root — one-off verification screenshots
live under `tmp/screenshots/`. The only tracked screenshots are the official
harness's three outputs in `docs/screenshots/` (see below).

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
- `syncLog()` — renders the Move Log with every move shown as "done" (for
  screenshot clarity)
- `canvasBands()` — returns the current empty-space canvas rect (stage-relative
  `left`/`top`/`right`/`bottom` insets) plus the measured `bands` that produced
  it (top: banner + 16; left: tab/card edge + 16; **right**: 0, or 16 + the
  docked card's live measured width while the log is right-docked — the card
  width is JS-set per column count (58–194px) and the band is re-measured
  whenever the column count changes, on move add/clear as well as on resize;
  **bottom**: the reserved 3-row Move Log height, 0 while right-docked — both
  are band-aware)
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
Playwright tests for the slide-out **control drawer's width threshold** (18
checks): the rule is a stage-width threshold — the 440×840 narrow viewport
(the design target device) starts it **closed**, the 1440×900 wide one starts
it **open**, and the exact boundary is pinned (750px wide → closed, 751px →
open); the test opens the drawer if it started closed, clicks
**Scramble**/**Solve**, and reads the tab's `aria-expanded` to confirm the
drawer auto-hides when the stage is 750px or narrower and stays open above
it. Run: `node tests/drawers-test.js` (`npm run test:drawer`).

### `tests/panel-center-test.js`
Playwright tests for the **control panel's vertical placement** (18 checks):
stage height **> 784px** (bottom-docked log) → the drawer unit is
**vertically centered** between the banner bottom and the Move Log top (equal
gaps, no banner overlap) — at 1440×900 (stage height 900) and at 1440×1366
(stage capped at 1276, the height-cap branch); the **784 boundary in both
branches** — at 440×784 (right docked) the unit is centered between the
banner bottom and the **stage bottom**, and at 440×785 (bottom docked) it is
centered between the banner bottom and the Move Log top. In every branch the
canvas rect's top stays at banner + 16px (the canvas never moves with the
panel). The 1440-wide scenarios start the drawer open (width > 750px); the
440-wide ones start it closed (only the top placement is asserted, which is
transform-invariant). Run: `node tests/panel-center-test.js`.

### `tests/log-dock-test.js`
Playwright tests for the **right-docked Move Log band** (142 checks): the
`applyCanvasRect` rule (stage height **≤ 784px** — inclusive, no lower bound,
height-only, width-independent) re-docks the Move Log to the stage's right
edge in-band, and the existing bottom dock stands above 784. All placement is
asserted through real rects, stage-relative — the canvas wrap via
`__RUBIKS__.canvasBands()`, the card, columns and buttons via
`getBoundingClientRect()`. Scenarios: the **784/785 boundary** (784 → right
dock; 785 → bottom dock with the header visible again) and the **low heights**
(400 → right dock — the old degenerate case; 635 → right dock — no lower
bound); a **wide 1440×700 stage** (the height-only rule — it re-docks on a
wide stage too); the **column-growth scenarios** with a populated log (22
moves @ 440×700 → perCol 19 → 2 columns, 92px card; 36 @ 440×636 → perCol 17
→ 3 columns, 126px; 36 @ 440×450 → perCol 11 → 4 columns, 160px; 36 @
440×400 → perCol 10 → 4 columns, 160px, no scroll since 36 ≤ 4×10; 36 @
440×320 → perCol 7 → 5-column cap, 194px, `.log-scroll` engaged with the last
button reachable via vertical scroll), each asserting top→bottom fill, 32px
buttons, **12px symmetric edge padding** around the column row, no scroll
while it fits, and canvas right = 16 + live card width with bottom
reservation 0; a **700 → 640 width transition** with 36 moves (re-measures to
3 columns / 126px, the explicit 3-column re-split, canvas re-centered);
the **700 → 800 → 700 resize with 36 moves** (undock re-flattens the
`.log-col` split back to wrapping rows, re-dock re-splits it — the
regression test for stale splits); and the **panel placement** at 700 and 784
(centered banner-bottom ↔ stage-bottom) and 600 (pinned at banner + 16,
clipping the stage bottom — by decision). Run: `node tests/log-dock-test.js`
(`npm run test:logdock`).

### `tests/press-test.js`
Keyboard-shortcut tests:
- `C` toggles the control drawer open/closed (`T` no longer does anything).
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
- At its 1440×900 viewport the control drawer **starts open** (its open position
  clears the re-centered cube); clicking the tab toggles it (works on iPad with no keyboard).
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
- Disabled flags are read from the buttons' `disabled` DOM property (regardless
  of the control drawer's state), and the test runs at 3× speed so the
  random 18–24 move scramble drains within its wait timeout.
- Run: `node tests/step-buttons-test.js` (`npm run test:step`).

### `tests/move-limits-test.js`
Playwright tests for the **36-move Move Log cap** (`MAX_MOVES`): 36 keyboard
`U` turns fill the log to exactly 36 (and leave the cube solved — 36 × 90° =
9 full turns); a 37th turn is refused (log stays 36, the cube stays solved —
nothing turned — and a no-spinner toast "Maximum moves allowed: 36" shows
for ~1s and fades out); stepping back frees a slot so the next turn is
accepted; a mocked `Cube.prototype.solve` returning 80 moves is refused with a
"Failed to find a solve solution" toast while the log and the cube stay
untouched; and a Scramble after a Reset still yields 18–24 moves (the cap did
not break scrambles). Driven through the real UI at a 1600×900 viewport (the
control drawer starts open there). Run: `node tests/move-limits-test.js`.

### `tools/render-screenshot.js`
Headless screenshot harness (Playwright + ImageMagick) that captures three
screenshots — `solved.png`, `scrambled.png`, `solved-after.png` — each with the
**control drawer open** (left edge) plus the always-visible **Move Log
panel** at the bottom. It drives the **real Scramble
and Solve buttons** (so the shots reflect the current randomized scramble and
solver), waiting for each animation to finish via `waitUntilIdle`. The harness:

1. Calls `window.__RUBIKS__.renderFrame()` → raw RGBA pixels from the GL back buffer.
2. Calls `page.screenshot()` → the full DOM UI.
3. Composites the cube PNG over the UI screenshot at the **live canvas origin**
   (the canvas rect's x/y read from the page — the letterbox + band offsets;
   (0, 0) when the stage fills the viewport) via ImageMagick.

Requires: Node, Playwright + Chromium, and **ImageMagick** (`magick` / `convert`).
Outputs to `docs/screenshots/`.
Run: `node tools/render-screenshot.js` (`npm run screenshot`).

---

## 8. Screenshot Gallery

A standalone gallery page (`docs/screenshots/index.html`) shows the four
screenshots — `solved.png`, `scrambled.png`, `solved-after.png` (the 1440×900
wide-viewport sequence; 900px stage height is out-of-band (> 784px), so the
Move Log bottom-docks in all three) plus `narrow-tall.png` (440×700 —
in-band, the headerless right-docked Move Log card with its columns filled,
width grown past the 1-column minimum, the panel closed) — in a grid with a
branded header, step badges, status dots, captions, hover effects, and a dark
theme matching the app. The narrow-tall shot is rendered with the same headless
pattern as `tools/render-screenshot.js` (GL frame composited over the DOM at
the live canvas origin) at the band's viewport, with a scrambled cube and the
populated log.

---

## 9. README.md

The project-root `README.md` has: a title and description, a screenshot table
+ gallery link, how to run (double-click `index.html`), how to play (4 steps), a
UI description (the capped, centered, top-anchored stage; the empty-rectangle
canvas with the cube centered in the empty space; top banner; always-visible
Move Log — bottom-docked by default, re-docked to the right edge at stage
heights ≤ 784px (no lower bound); slide-out control drawer with its width-threshold
open/closed state — open when the stage is wider than 750px, closed otherwise —
and its height-dependent vertical placement), a
keyboard shortcuts table, a move-notation explanation, a **Move limit**
section (the 36-move cap and its two refusal toasts), a
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
- **Stage & empty-rectangle canvas**: the whole app lives in the centered,
  top-anchored `#stage` box capped at 1276×1366 (seamless slate-900 letterbox
  on larger windows), and the WebGL canvas fills only the stage's empty
  rectangle (stage minus the banner / drawer / Move Log bands, each + 16px
  clearance; the bottom band is the Move Log's reserved 3-row height; while the
  log is right-docked (stage height ≤ 784px), the right band is 16 + the card's
  live width (58–194px, growing with its columns) and the bottom band is 0) — so the
  cube, always centered in its canvas, is centered in the empty space at every
  viewport size. Closing the drawer re-sizes the canvas per frame (linear blend
  of the two rest-state left bands driven by the panel card's slide progress,
  re-rendering after each resize to keep the buffer from flickering clear) so
  the cube slides left with the drawer; opening is an instant reflow. Full
  detail in §2 *Stage & empty-rectangle canvas*.
- **Drawer + always-visible panel**: the layer buttons (left edge) hide behind a
  vertical tab in a slide-out drawer — the horizontal slide lives on an inner
  `.drawer-unit` transform so it never fights the outer element's top
  placement (set live by the canvas-rect code: the unit centered between the
  banner bottom and the Move Log top when the stage is taller than 784px,
  centered between the banner bottom and the stage bottom at 635–784px,
  else top-pinned at banner height + 16px), and the
  toggle is a `click` on the tab (works on iPad, no keyboard)
  or the `C` key. When closed, the panel card sits fully off the stage's left
  edge (clipped by the stage's `overflow: hidden`), leaving the binder tab
  peeking in from that edge. The Move Log is the opposite: an **always visible** panel
(no drawer state at all) — bottom-docked by default, re-docked to the stage's right
edge when the stage is 784px tall or shorter (see *Right-docked Move Log band*
in §2).
- **Right-docked Move Log band**: the Move Log re-docks from the stage's bottom
  edge to its right edge when the stage height is **≤ 784px** (inclusive; no
  lower bound — the old 635px bound is deleted, and the old degenerate
  "bottom-docked but the pinned panel doesn't fit" case is resolved; 784
  rounds the live-measured fit minimum 783.5 = 52 + 16 + 551 + 16 + 144.5 + 4
  up to the whole px). In-band the SAME card (a `.log-right` class toggle, no
  duplicate element) sits banner + 16 from the top, 16px from the right and
  bottom edges, **headerless** (header row hidden in-band, still in the DOM),
  with a **column-major** flow of 32px buttons: explicit `.log-col` wrappers
  filled top→bottom, then the next column rightward (not CSS flex-wrap, which
  was measured to spawn unreachable columns past the card edge and never grow
  scrollHeight). The card width is JS-driven — 34·cols + 24 = 58/92/126/160/
  194px for 1–5 columns (1 column at 0 moves; perCol = floor(clientHeight / 31),
  clientHeight = stageH − 84) — no scrollbar while the moves fit, internal
  vertical scroll (`.log-scroll`) only past the 5-column capacity (below a
  ≈332px stage). The canvas wrap's right inset is 16 + the card's live width
  (re-measured whenever the column count changes — move add/clear as well as
  resize) and its bottom reservation is 0 — the cube re-centers in the
  remaining space. Out-of-band the bottom dock stands unchanged. Boundary
  safety: 783.5 is an exact fit; ~1–2px of font/DPR drift erodes the 16px
  clearance inside the reserved band by ~1–2px worst case, and an actual
  overlap would require H < 767.5 — in-band, where the bottom is clear — so no
  slack is needed. Full detail in §2 *Right-docked Move Log band*; covered by
  `tests/log-dock-test.js` (142 checks, `npm run test:logdock`).
- **Drawer first-load race**: Tailwind v4's browser build loads via the runtime
  **Play CDN `<script>`**, so its `w-12`/`gap`/`p-3` columns may not be laid out when the
  module first runs. Measuring the closed shift that early is too small and leaves
  the panel peeking. The shift is therefore kept at a fully-hidden CSS default
  until `load`/`ResizeObserver` (plus a couple of rAFs) report a stable width; auto
  re-measurements snap (no slide), so the panel never visibly slides or peeks on
  first load.
- **Drawer width threshold** (the overlap rule and its `drawerOverlapsCube()`
  test were deleted): the control drawer's **startup state is a width test** —
  `decideStartupControlDrawer()` sets it open when the stage is wider than
  750px and closed otherwise (boundary: 750 → closed, 751 → open) — and
  `closeControlDrawerOnNarrow()`, run by the Scramble/Solve click handlers,
  re-measures the stage width at click time and slides the open drawer away
  only when it is 750px or narrower (on a wide stage the clicks leave it
  open). Resizing never re-evaluates the drawer's state; the ResizeObserver
  only re-measures the canvas band from the drawer's live position.
- **Batch animation**: scramble and solve clear the log, then enqueue the entire
  sequence up front (so the Move Log shows all buttons at once), then auto-advance
  via `startCurrent()` → `finishMove()` → `startCurrent()` … until the queue drains.
  Step mode plays one move and stops (auto=false).
- **Per-move duration constants**: `TURN_SECONDS = 0.42`, `DOUBLE_PENALTY = 1.15`
  (half-turns take ~15% longer), `PACE = { scramble: 1, turn: 1, solve: 1.15 }`
  (solves play slightly slower than scrambles). Speed slider scales all durations.
- **Touch pinch-zoom**: the `Orbit` class handles two-finger pinch zoom in addition
  to mouse-wheel zoom. Single-finger touch orbit is also supported.
- **Panel vertical placement**: `applyCanvasRect` also places the drawer
  wrapper — stage height > 784px (bottom-docked log) → the unit (card + tab)
  vertically centered between the banner bottom and the Move Log top, clamped
  so it never overlaps the banner (accepted trade-off: on a ≲320px-wide stage
  with a full 36-move log the clamped panel can slightly overlap the Move Log
  top); stage height 784 or below (right-docked log) and ≥ 635px
  (`PANEL_FIT_MIN`) → centered between the banner bottom and the **stage
  bottom** (the right-docked log leaves the stage bottom clear; at exactly 635
  centering and pinning agree); below 635px → top-pinned at banner + 16px
  (the `top-[68px]` first-paint fallback is banner 52px + 16px exactly; may
  clip the stage bottom — by decision, no guard). The canvas rect never
  moves with the panel — its top stays at banner + 16px in every branch.
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
- **Move limit (`MAX_MOVES = 36`)**: the Move Log holds at most 36 moves. The
  two choke points enforce it: `userTurn()` checks `state.moves.length >=
  MAX_MOVES` *after* truncating to the cursor (so an undo frees a slot) and
  refuses the turn with a "Maximum moves allowed: 36" toast (1s, fades, no
  spinner); `solve()` checks `tokens.length > MAX_MOVES` after `parseAlg` and
  *before* `resetMoves()`, refusing over-cap answers with a "Failed to find a
  solve solution" toast while leaving the log and cube untouched. Scrambles
  (18–24) never hit the cap.
- **Solver lifecycle**: `Cube.initSolver()` is deferred in a `setTimeout(50ms)`;
  the Solve button awaits readiness.
- **All code well-commented**, free of placeholder or missing functions.
