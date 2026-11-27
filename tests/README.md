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
| `panel-center-test.js` | Control-panel vertical placement — 7 checks: centered when the stage is taller than 790px, top-pinned at banner + 16px otherwise; the canvas top never moves with the panel | Node, Playwright + Chromium | `node tests/panel-center-test.js` |
| `log-dock-test.js` | Right-docked Move Log band — 59 checks: in-band (636/783, wide 1440×700) the log docks right (card top banner + 16, 16px insets, 58px wide, vertical column, canvas right inset 16 + card width, bottom reservation 0); out-of-band (634/635/784/785) the bottom dock stands (784 pins the reserved-band top); a 25-move column scrolls internally with the current move in view; resize re-docks/undocks | Node, Playwright + Chromium | `npm run test:logdock` or `node tests/log-dock-test.js` |
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

Playwright-driven tests for **the control panel's vertical placement** (7
checks). `applyCanvasRect` pins the drawer unit's wrapper top per stage
height: stage height **> 790px** → the unit (card + tab) is **vertically
centered** between the top banner's bottom edge and the Move Log wrapper's
top edge (equal gaps, clamped so it never overlaps the banner); stage height
**≤ 790px** → **top-pinned** at banner + 16px. The canvas rect must **not**
follow the panel: in both branches its top stays at banner + 16px. Two
viewports are tested — 1440×900 (centering branch) and 1440×700 (top-pin
branch); both are wide enough that the drawer starts open, so no interaction
is needed.

Drives the real `index.html` in headless Chromium via the `window.__RUBIKS__`
test hook.

## log-dock-test.js

Playwright-driven tests for **the right-docked Move Log band** (59 checks).
`applyCanvasRect` re-docks the Move Log (the same card — no duplicate element)
from the stage's bottom edge to its **right edge** in a height-only,
width-independent band — stage height **> 635px and ≤ 783.5px** — where the
card sits 16px below the banner bottom, 16px from the stage's right edge and
bottom, 58px wide, as a single vertical column of 32px move-buttons (2px gaps,
31px pitch) that scrolls internally (the 45% cap does not apply in-band),
while the canvas wrap's right inset becomes 16px + the card's live width and
its bottom reservation drops to 0. Out-of-band (below 635 or above 783.5) the
bottom dock stands. All placement is asserted through real rects,
stage-relative (the canvas wrap via `__RUBIKS__.canvasBands()`, the card and
buttons via `getBoundingClientRect()`). Scenarios:

- band boundaries, empty log: 440×634 and 440×635 → **bottom dock** (the lower
  bound is strict — `H > 635`); 440×636 and 440×783 → **right dock** (636 just
  inside, 783 at the band max — card top at banner + 16, 16px insets, 58px
  width, canvas right inset ≈ 16 + 58, bottom reservation 0, empty hint
  hidden); 440×784 and 440×785 → **bottom dock** — 784 is the tightest
  out-of-band case and pins the boundary via the reserved-band top (≈
  stageH − 164.5 ± 0.5).
- height-only rule: 1440×700 (a wide stage) → **right dock** (the band is
  height-only, width-independent).
- populated column: 440×700 with 25 keyboard `U` turns at 3× speed → a single
  vertical column (32px buttons, no wrap), `#move-log` scrolls internally
  (scrollHeight > clientHeight), the current move auto-scrolls into view, the
  empty hint stays hidden.
- resize crossing: 440×700 → 440×800 → 440×700 → the log re-docks to the
  right, undocks to the bottom, and re-docks again with the existing snap (no
  animation for the log dock).

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
