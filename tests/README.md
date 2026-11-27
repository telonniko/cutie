# Tests

Headless test scripts for **Cutie** — the single-file Rubik's Cube solver. None
of these are needed to *use* the app (double-click `index.html` in a browser);
they verify the cube math and exercise the UI. Run everything from the
**project root**.

The screenshot capture harness lives in `../tools/` (see `../tools/README.md`)
— it produces the documentation images and is not a test.

## Naming convention

Every script is named `<subject>-test.js` (e.g. `press-test.js`,
`cube-core-test.js`). There is no build or test runner: each script is run
directly with Node and prints a `PASS`/`FAIL` report (a non-zero exit code on
any failure), so they double as smoke tests and as CI gates.

| Script | What it does | Needs | Run it with |
| --- | --- | --- | --- |
| `cube-core-test.js` | Unit-tests the cube-core math | Node, `cubejs` | `npm run verify` or `node tests/cube-core-test.js` |
| `cursor-test.js` | Tests the Move-Log "cursor" model | Node, `cubejs` | `npm run verify:cursor` or `node tests/cursor-test.js` |
| `press-test.js` | Keyboard-shortcut tests | Node, Playwright + Chromium | `node tests/press-test.js` |
| `click-test.js` | Mouse-event / click tests | Node, Playwright + Chromium | `node tests/click-test.js` |
| `drawers-test.js` | Control-drawer width-threshold tests — 18 checks: startup state (open > 750px wide, closed ≤ 750px), the exact 750/751 boundary, Scramble/Solve auto-hide | Node, Playwright + Chromium | `node tests/drawers-test.js` |
| `panel-center-test.js` | Control-panel vertical placement — 18 checks: centered between the banner and the Move Log top when the stage is taller than 784px (incl. the height cap), centered between the banner and the stage bottom at 784 (right dock), the 785 boundary in the bottom-dock branch; the canvas top never moves with the panel | Node, Playwright + Chromium | `node tests/panel-center-test.js` |
| `log-dock-test.js` | Right-docked Move Log band — 142 checks: in-band (stage height ≤ 784, no lower bound — 400/635/700, wide 1440×700) the log docks right (card top banner + 16, 16px insets, headerless, canvas right inset 16 + card width, bottom reservation 0); out-of-band (785) the bottom dock stands; columns grow 1→5 with widths 58→194 (five populated scenarios), no scroll while it fits, internal scroll at the 5-column cap with the last button reachable; 12px symmetric edge padding; 700→640 column re-split; 700→800→700 undock re-flattens the split; panel placement at 700/784/600 | Node, Playwright + Chromium | `npm run test:logdock` or `node tests/log-dock-test.js` |
| `step-buttons-test.js` | "← Step" / "Step →" enable/disable tracking with the cursor | Node, Playwright + Chromium | `npm run test:step` or `node tests/step-buttons-test.js` |
| `move-limits-test.js` | Move Log 36-move cap: 37th turn refused with a toast, undo frees a slot, an over-36-move solve is refused (log + cube untouched), scramble still 18–24 | Node, Playwright + Chromium | `node tests/move-limits-test.js` |

## Prerequisites

Install the dev dependencies from the project root:

```bash
npm install                          # installs the devDependencies (cubejs, playwright)
npx playwright install chromium      # downloads the headless Chromium binary
```

`cubejs` and `playwright` are declared in `package.json` under
`devDependencies`, so a plain `npm install` is enough — there is no need for
`npm install --save-dev …` (that would just re-pin the versions and drift the
lockfile). Note that a *production* install (`npm install --omit=dev`) skips
these, since they are dev-only.

- `cube-core-test.js` and `cursor-test.js` need **`cubejs`** (a devDependency,
  used only by the tooling — the app itself loads cubejs from a CDN). They run
  the cube-core math in a fresh Node VM context, so they need no browser.
- `press-test.js`, `click-test.js`, `drawers-test.js`, `log-dock-test.js`, and
  `panel-center-test.js` need **Playwright** and a headless Chromium. They drive the real `index.html` via
  the `window.__RUBIKS__` test hook.

Each script resolves the project root relative to its own location
(`path.join(__dirname, '..')`), so it works from `tests/` without any path
tweaking.

## cube-core-test.js

Proves that the cube-core geometry inlined in `index.html` exactly matches
cubejs's model. It:

1. extracts the code between the `// === CUBE:START ===` /
   `// === CUBE:END ===` sentinels in `index.html`,
2. evaluates it in a fresh Node VM context (the core has **no DOM/Three.js
   dependencies** — it is pure math),
3. compares `readFaceletString()` output to `Cube.fromString/asString` and runs
   full solve round-trips through cubejs.

The core must stay between those two sentinels for this to work.

## cursor-test.js

Headless simulation of the Move-Log "cursor" model. It proves that:

1. stepping back/forward moves the cursor (the cube always reflects
   `moves[0..cursor-1]`);
2. a face-turn branches from the cursor (discards future moves, appends the new
   one);
3. `solve()` always solves the cube regardless of where the cursor is,
   discarding any future moves and appending the solution.

Runs the cube-core math in a fresh Node VM context (no browser).

## press-test.js

Keyboard-shortcut tests for the cube UI:

- `C` toggles the control drawer open/closed (`T` no longer does anything).
- `Alt`/`Option` + a face key performs a 180° half turn (two `Alt+U` return
  to solved; `Shift` remains the prime modifier).

Drives the real `index.html` in headless Chromium via the `window.__RUBIKS__`
test hook.

## click-test.js

Playwright-driven tests for the face-button mouse/click behavior (the
left-edge controls):

- Three columns of buttons: clockwise quarter turns (`U…B`),
  counter-clockwise quarter turns (`U'…B'`), and half-turns (`U2…B2`).
- Each button is one fixed move; labels are fixed (no `Shift`-driven prime
  preview, no ambient repaint).
- Pressed (depressed) visual state on pointer down, restored on up.
- A single click on a quarter or prime button turns 90° immediately (no
  deferral, no double-click detection); a half-turn button turns 180°.
- The panel hides behind a tab; clicking the tab slides it open and closed
  (works on iPad with no keyboard).
- The `#btn-reset` button lives in the left-edge control drawer, so the
  test opens that drawer before clicking it (a no-op at the test viewport,
  where it starts open).
- The pressed-state screenshot is written to the git-ignored `tmp/` directory.

Drives the real `index.html` in headless Chromium via the `window.__RUBIKS__`
test hook.

## drawers-test.js

Playwright-driven tests for **the slide-out control drawer's width
threshold** (left edge; 18 checks). The rule is a width test on the `#stage`
element's width (min(100vw, 1276px) — identical to the window width below the
cap): at **750px or narrower** the drawer starts **closed** and clicking
**Scramble** or **Solve** slides it away first (auto-hide) so the cube
animation stays visible; **above 750px** it starts **open** and the clicks
leave it open. Each of the six scenarios asserts the startup state, opens the
drawer if it started closed, clicks the action button, and reads the tab's
`aria-expanded` to confirm the result:

- narrow viewport (440×840): Scramble and Solve **auto-hide** it.
- wide viewport (1440×900): Scramble and Solve **leave it open**.
- exact boundary: 750 wide → **closed**, 751 wide → **open**.

Resizing the stage does not re-evaluate the drawer's state (only the canvas
band is re-measured from the drawer's live position), so the tests pin the
startup/click-time boundary rather than any resize behavior.

The bottom Move Log panel is always visible — it has no drawer state and is not
part of these tests.

Drives the real `index.html` in headless Chromium via the `window.__RUBIKS__`
test hook.

## panel-center-test.js

Playwright-driven tests for **the control panel's vertical placement** (18
checks). `applyCanvasRect` pins the drawer unit's wrapper top per stage
height, in three branches keyed on the log's dock (the old single 790px
threshold is deleted): stage height **> 784px** (bottom-docked log) → the
unit (card + tab) is **vertically centered** between the top banner's bottom
edge and the Move Log wrapper's top edge (equal gaps, clamped so it never
overlaps the banner); stage height **784 or below** (right-docked log) and
**≥ 635px** → the unit is **centered** between the banner bottom and the
**stage bottom** (the right-docked log no longer spans the bottom edge, so
the whole stage height is available); **below 635** → **top-pinned** at
banner + 16px. The canvas rect must **not** follow the panel: in every
branch its top stays at banner + 16px. Four viewports are tested — 1440×900
and 1440×1366 (stage capped at 1276 — the bottom-dock centering branch,
incl. the height cap), 440×784 (the boundary in the right-dock branch) and
440×785 (the boundary in the bottom-dock branch); the 1440-wide scenarios
start the drawer open, the 440-wide ones closed (only the top placement is
asserted, which is transform-invariant).

Drives the real `index.html` in headless Chromium via the `window.__RUBIKS__`
test hook.

## log-dock-test.js

Playwright-driven tests for **the right-docked Move Log band** (142 checks).
`applyCanvasRect` re-docks the Move Log (the same card — no duplicate element)
from the stage's bottom edge to its **right edge** in a height-only,
width-independent band — stage height **≤ 784px** (inclusive, no lower bound):
the card sits 16px below the banner bottom, 16px from the stage's right edge
and bottom, **headerless** (the header row is hidden in-band, still in the
DOM), and its width is JS-driven — 34·cols + 24 = 58/92/126/160/194px for
1–5 columns. The buttons fill **columns top→bottom** (explicit `.log-col`
wrappers, 32px buttons, 2px gaps, 31px pitch, 12px symmetric edge padding),
`perCol = floor(#move-log clientHeight / 31)` (clientHeight = stageH − 84),
`cols = min(max(ceil(moves / perCol), 1), 5)` — 1 column at 0 moves, capped
at 5. While the moves fit there is **no scrollbar** (`overflow: hidden`);
the internal vertical scroll fallback (`.log-scroll`) engages only when
`moves > 5 × perCol` — below a ≈332px stage — with the width capped at the
5-column 194px. The canvas wrap's right inset becomes 16px + the card's live
width (re-measured on column-count change) and its bottom reservation drops
to 0. Out-of-band (above 784) the bottom dock stands. All placement is
asserted through real rects, stage-relative (the canvas wrap via
`__RUBIKS__.canvasBands()`, the card, columns and buttons via
`getBoundingClientRect()`). Scenarios:

- band boundary: 440×784 → **right dock** (784 ≤ 784, inclusive — the tightest
  in-band case, card top at banner + 16, 16px insets, 1-column minimum width,
  canvas right inset ≈ 16 + 58, bottom reservation 0, header hidden, empty
  hint hidden); 440×785 → **bottom dock** (header visible again).
- no lower bound: 440×635 and 440×400 → **right dock** (the old 635 lower
  bound is deleted; 400 is the former degenerate case).
- height-only rule: 1440×700 (a wide stage) → **right dock**.
- column growth (populated log): 440×700 with 22 moves → perCol 19 → 2
  columns, 92px card; 440×636 with 36 → perCol 17 → 3 columns, 126px;
  440×450 with 36 → perCol 11 → 4 columns, 160px; 440×400 with 36 → perCol
  10 → 4 columns, 160px, no scroll (36 ≤ 4×10); 440×320 with 36 → perCol 7 →
  5-column cap, 194px, scroll engaged, last button reachable — each asserting
  top→bottom fill, 32px buttons, 12px symmetric edge padding, no scroll
  while it fits, and canvas right = 16 + live card width with bottom
  reservation 0.
- width transition: 440×700 → 440×640 with 36 moves → re-measures from 2
  columns (92px) to 3 columns (126px) — the explicit `.log-col` re-split, the
  canvas right band re-measured and the cube re-centered.
- undock with moves: 440×700 → 440×800 → 440×700 with 36 moves → undock
  re-flattens the `.log-col` split back to wrapping rows (the regression test
  for stale splits), re-dock re-splits it (back to 2 columns, 92px).
- panel placement: 440×700 and 440×784 → centered between the banner bottom
  and the stage bottom (H ≥ 635); 440×600 → top-pinned at banner + 16
  (clipping the stage bottom — by decision, no guard).

Drives the real `index.html` in headless Chromium via the
`window.__RUBIKS__` test hook.

## step-buttons-test.js

Playwright-driven tests for the **"← Step" / "Step →" enable/disable** state. The
buttons disable when the Move Log has no move left to apply in that direction —
"← Step" while the cursor is at 0 (nothing applied to undo), "Step →" while the
cursor is at the end of the log (nothing future to replay) — and re-enable as the
cursor moves. It also proves a **Scramble/Solve does not flicker the buttons
mid-sequence**: the flags are left untouched while the batch animates and refreshed
once when it drains. Checks, in order:

- Fresh log / after Reset: **both** buttons disabled.
- After one applied move: "← Step" enabled, "Step →" disabled.
- Stepped back to the start: "← Step" disabled, "Step →" enabled.
- Stepped to the end: "← Step" enabled, "Step →" disabled.
- Mid-sequence Scramble: buttons left untouched (no flicker); after it settles,
  "← Step" enabled and "Step →" disabled.
- In the middle of a long log: **both** enabled; walked all the way back, "← Step"
  disables again; Reset re-disables both.

The disabled flags are read straight from the buttons' `disabled` DOM property
(works whether or not the control drawer is open), and the test runs at 3× speed
so the random 18–24 move scramble drains within its wait timeout.

Drives the real `index.html` in headless Chromium via the `window.__RUBIKS__`
test hook.

## The `window.__RUBIKS__` test hook

The app exposes a `window.__RUBIKS__` hook for headless testing and screenshot
capture: it is a **capture/sync bridge, not a state driver** — it no longer
applies moves, so the captures reflect what the app actually does. It provides
`ready` / `status` getters, `setCamera`, `renderFrame` (raw RGBA pixels from the
GL back buffer, bypassing the unreliable 2D-canvas sync in headless Chromium),
`setPixelRatio`, `syncLog` to render the Move Log instantly, `canvasBands`
(the empty-space canvas rect plus the measured bands — `right` and `bottom` are
band-aware: the right inset is 16 + the docked card's width and the bottom
reservation is 0 while the log is right-docked), `isSolved`, and
`waitUntilIdle`. State changes go through the real UI (clicking the
Scramble/Solve buttons), so tests reflect the app's current behavior. The
Playwright tests above rely on it.
