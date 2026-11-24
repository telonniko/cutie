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
| `drawers-test.js` | Control-drawer auto-close-on-overlap tests (startup state + Scramble/Solve) | Node, Playwright + Chromium | `node tests/drawers-test.js` |
| `step-buttons-test.js` | "← Step" / "Step →" enable/disable tracking with the cursor | Node, Playwright + Chromium | `npm run test:step` or `node tests/step-buttons-test.js` |

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
- `press-test.js`, `click-test.js`, and `drawers-test.js` need
  **Playwright** and a headless Chromium. They drive the real `index.html` via
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

Playwright-driven tests for **the slide-out control drawer's auto-close on
overlap** (left edge). When the drawer is open and its panel (including the tab,
read from the drawer's own bounding box) overlaps the cube's on-screen area,
clicking **Scramble** or **Solve** slides that drawer closed first so the cube
animation stays visible; on a non-overlapping layout it is left open. Each
scenario also checks the width-dependent **startup** state of the drawer (narrow
→ closed, wide → open), opens it if it started closed, clicks the action
button, and reads the tab's `aria-expanded` to confirm the result:

- narrow viewport (drawer covers the cube): Scramble and Solve **auto-close** it.
- wide viewport (drawer clear of the cube): Scramble and Solve **leave it open**.

The bottom Move Log panel is always visible — it has no drawer state and is not
part of these tests.

Drives the real `index.html` in headless Chromium via the `window.__RUBIKS__`
test hook.

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
so the random 18–35 move scramble drains within its wait timeout.

Drives the real `index.html` in headless Chromium via the `window.__RUBIKS__`
test hook.

## The `window.__RUBIKS__` test hook

The app exposes a `window.__RUBIKS__` hook for headless testing and screenshot
capture: it is a **capture/sync bridge, not a state driver** — it no longer
applies moves, so the captures reflect what the app actually does. It provides
`ready` / `status` getters, `setCamera`, `renderFrame` (raw RGBA pixels from the
GL back buffer, bypassing the unreliable 2D-canvas sync in headless Chromium),
`setPixelRatio`, `syncLog` to render the Move Log instantly, `isSolved`, and
`waitUntilIdle`. State changes go through the real UI (clicking the
Scramble/Solve buttons), so tests reflect the app's current behavior. The
Playwright tests above rely on it.
