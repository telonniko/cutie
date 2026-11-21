# Dev Tools

Helper scripts for **Cutie** — the single-file Rubik's Cube solver. None of
these are needed to *use* the app (double-click `index.html` in a browser); they
are developer tooling. The test scripts live in `../tests/` (see
`../tests/README.md`); this folder keeps the non-test tooling.

| Script | What it does | Needs | Run it with |
| --- | --- | --- | --- |
| `render-screenshot.js` | Captures the project screenshots | Node, Playwright + Chromium, ImageMagick | `npm run screenshot` or `node tools/render-screenshot.js` |

The test scripts (`cube-core-test.js`, `cursor-test.js`, `press-test.js`,
`click-test.js`, `drawers-test.js`) are in `../tests/`.

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

`render-screenshot.js` needs **Playwright** and a headless Chromium. On macOS,
**ImageMagick** (`magick` / `convert`) is also required to composite the cube
frame over the UI.

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

Each frame is captured with **both drawers open** and the cube in the gap
between them. The scrambled and solved-after frames are produced by clicking the
**real Scramble and Solve buttons** and waiting for each animation to finish — so
the captures always reflect the current app (including the randomized scramble
length), not a hard-coded sequence. `window.__RUBIKS__` also exposes
`syncLog` (render the Move Log grid instantly), `setCamera`, `setPixelRatio`,
`isSolved`, and `waitUntilIdle` for the harness.

## The `window.__RUBIKS__` test hook

The app exposes a `window.__RUBIKS__` hook for headless testing and screenshot
capture: it is a **capture/sync bridge, not a state driver** — it no longer
applies moves, so captures and tests reflect what the app actually does. It
provides `ready` / `status` getters, `setCamera`, `renderFrame` (raw RGBA pixels
from the GL back buffer, bypassing the unreliable 2D-canvas sync in headless
Chromium), `setPixelRatio`, `syncLog` to render the Move Log grid instantly,
`isSolved`, and `waitUntilIdle`. State changes go through the real UI (clicking
the Scramble/Solve buttons). `render-screenshot.js` and the Playwright tests in
`../tests/` rely on it.
