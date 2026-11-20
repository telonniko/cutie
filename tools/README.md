# Dev Tools

Helper scripts for **Cutie** — the single-file Rubik's Cube solver. None of these
are needed to *use* the app (double-click `index.html` in a browser); they are
developer tooling for verifying the cube math, exercising the UI, and producing
the documentation screenshots. Run everything from the **project root**.

| Script | What it does | Needs | Run it with |
| --- | --- | --- | --- |
| `verify.js` | Unit-tests the cube-core math | Node, `cubejs` | `npm run verify` or `node tools/verify.js` |
| `press-test.js` | Keyboard-shortcut tests | Node, Playwright + Chromium | `node tools/press-test.js` |
| `click-test.js` | Mouse-event / click tests | Node, Playwright + Chromium | `node tools/click-test.js` |
| `controls-drawer-test.js` | Controls-drawer auto-close-on-overlap tests | Node, Playwright + Chromium | `node tools/controls-drawer-test.js` |
| `render-screenshot.js` | Captures the project screenshots | Node, Playwright + Chromium, ImageMagick | `npm run screenshot` or `node tools/render-screenshot.js` |

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

- `verify.js` needs **`cubejs`** (a devDependency, used only by the tooling —
  the app itself loads cubejs from a CDN).
- `press-test.js`, `click-test.js`, `controls-drawer-test.js`, and `render-screenshot.js` need **Playwright** and a headless
  Chromium. On macOS, **ImageMagick** (`magick` / `convert`) is also required by
  `render-screenshot.js` to composite the cube frame over the UI.

## verify.js

Proves that the cube-core geometry inlined in `index.html` exactly matches
cubejs's model. It:

1. extracts the code between the `// === CUBE:START ===` /
   `// === CUBE:END ===` sentinels in `index.html`,
2. evaluates it in a fresh Node VM context (the core has **no DOM/Three.js
   dependencies** — it is pure math),
3. compares `readFaceletString()` output to `Cube.fromString/asString` and runs
   full solve round-trips through cubejs.

The core must stay between those two sentinels for this to work.

## press-test.js

Keyboard-shortcut tests for the cube UI:

- `T` toggles the layer-button drawer open/closed.
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

Drives the real `index.html` in headless Chromium via the `window.__RUBIKS__`
test hook.

## controls-drawer-test.js

Playwright-driven tests for the right-edge **Controls drawer auto-close on
overlap**. When the drawer is open and its panel (including the tab, read from
the drawer's own bounding box) overlaps the cube's on-screen area, clicking
**Scramble** or **Solve** slides the drawer closed first so the cube animation
stays visible; on a non-overlapping layout it is left open. Each scenario opens
the drawer via its tab, clicks the action button, and reads the tab's
`aria-expanded` to confirm the result:

- narrow viewport (drawer covers the cube): Scramble and Solve **auto-close** it.
- wide viewport (drawer clear of the cube): Scramble and Solve **leave it open**.

Drives the real `index.html` in headless Chromium via the `window.__RUBIKS__`
test hook.

## render-screenshot.js

Headless screenshot harness that produces the three documentation captures in
`docs/screenshots/` — `solved.png`, `scrambled.png`, `solved-after.png` — by
compositing the cube's GL frame over the DOM UI:

1. `window.__RUBIKS__.renderFrame()` → raw RGBA pixels from the GL back buffer
   (headless Chromium does not reliably sync the WebGL `<canvas>` into
   `page.screenshot()`).
2. `page.screenshot()` → the DOM UI.
3. Compose: the cube PNG is overlaid on the UI at the canvas origin via
   ImageMagick.

The "scrambled" frame uses a fixed, inlined scramble sequence applied to a solved
cube (the cube can still be scrambled live via the **Scramble** button).
`window.__RUBIKS__` also exposes `applyAlg`, `readFaceletString`, `syncLog`,
`clearLog`, `setCamera`, and `setPixelRatio` for this purpose.

## The `window.__RUBIKS__` test hook

The app exposes a `window.__RUBIKS__` hook for headless testing and screenshot
capture: solver readiness/status getters, `applyInstant` / `applyAlg` for instant
state changes, `setCamera`, `renderFrame` / `readFrame` (raw RGBA pixels,
bypassing the unreliable 2D-canvas sync in headless Chromium), `syncLog` /
`clearLog` for the Move Log, and `waitUntilIdle`. The Playwright tools above
rely on it.
