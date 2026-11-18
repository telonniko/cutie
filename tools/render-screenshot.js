/**
 * tools/render-screenshot.js
 * --------------------------
 * Drives the real index.html in headless Chromium (Playwright) and produces
 * the three project screenshots — solved, scrambled, and solved-after-solve.
 *
 * Because headless Chromium does not reliably sync the WebGL <canvas> into
 * `page.screenshot()` output, each shot is composed of:
 *   1. `window.__RUBIKS__.readFrame()` → raw RGBA pixels read from the GL
 *      back buffer via gl.readPixels (bypasses the 2D-canvas sync issue).
 *   2. `page.screenshot()` → the DOM UI.
 *   3. Compose: the cube PNG (from step 1, encoded via ImageMagick) is
 *      overlaid on the UI screenshot at the canvas origin (0, 0).
 *
 * Output: docs/screenshots/{solved,scrambled,solved-after}.png
 *
 * Requires: `npx playwright install chromium` and `convert` (ImageMagick).
 * Run:      node tools/render-screenshot.js
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const TMP = path.join(ROOT, 'node_modules', '.tmp-shots');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

// Locate the Chrome-for-Testing binary; fall back to Playwright's resolution.
function findExecutable() {
  const base = path.join(ROOT, 'node_modules', 'playwright-core', '.local-browsers', 'chromium-1255', 'chrome-mac-arm64');
  const candidates = [
    path.join(base, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
    path.join(base, 'chrome'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return undefined;
}

// The "scrambled" screenshot uses this fixed scramble sequence (a representative
// mid-length shuffle) applied to a solved cube. It used to live in a docs/
// scrambled file, but the file-loading feature was removed, so it is inlined here.
const SCRAMBLE_1 = "F2 R D' F2 B' R U' B' L B R2 F L2 R F R2 D' L R D F' B' U' L";

// Convert a base64-encoded raw RGBA pixel buffer to a PNG file via ImageMagick.
// ImageMagick v7 (magick) reads headerless pixels with `-size WxH -depth 8` and
// the `rgba:`/`rgb:` raw format; the old `convert WxH rgb:file` positional form
// no longer parses under IMv7.
function pixelsToPng(base64, w, h, outPng) {
  const raw = Buffer.from(base64, 'base64');
  const rawPath = path.join(TMP, 'pixels.rgba');
  fs.writeFileSync(rawPath, raw);
  // readFrame() returns a 4-channel RGBA buffer, so read it as rgba and keep the
  // alpha channel (the cube layer is composited over the DOM UI below).
  execFileSync('magick', ['-size', `${w}x${h}`, '-depth', '8', 'rgba:' + rawPath, outPng]);
}

async function main() {
  const launchOpts = { headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  const exe = findExecutable();
  if (exe) launchOpts.executablePath = exe;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Force devicePixelRatio to 1 so the GL buffer matches the viewport 1:1.
  page.emulateMedia({ reducedMotion: 'reduce' });

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await page.evaluate(() => window.__RUBIKS__.setPixelRatio(1));
  await page.waitForFunction(() => window.__RUBIKS__.ready === true, { timeout: 120000 });
  await page.waitForTimeout(600);

  const bootErrors = errors.filter(e => !/favicon|404/.test(e));
  console.log('boot errors:', bootErrors.length ? bootErrors.join(' | ') : '(none)');

  // --- Helper: capture the full UI + the GL frame and composite them. ---
  async function snap(name) {
    // 1) Get the cube as a PNG (from the GL back buffer, transparent background
    // so it composites cleanly over the UI without hiding the edge panels).
    const frame = await page.evaluate(() => window.__RUBIKS__.renderFrame());
    const cubePng = path.join(TMP, name + '.cube.png');
    pixelsToPng(frame.data, frame.width, frame.height, cubePng);
    // 2) Get the DOM UI (canvas region will be dark; we overlay the cube).
    const uiPng = path.join(TMP, name + '.ui.png');
    await page.screenshot({ path: uiPng });
    // 3) Composite: cube over UI at (0, 0).  `-composite` (IMv7) actually merges
    // the two-image sequence produced by `-compose over` into ONE output file;
    // without it magick writes one file per input image (name-0, name-1, …).
    execFileSync('magick', [uiPng, cubePng, '-compose', 'over', '-gravity', 'NorthWest', '-geometry', '+0+0', '-composite', path.join(OUT, name)]);
  }

  // ---- 1. Solved (initial state) ----
  await page.evaluate(() => window.__RUBIKS__.setCamera());
  await page.waitForTimeout(600);
  await snap('solved.png');
  console.log('✓ solved.png       status=' + await page.evaluate(() => window.__RUBIKS__.status) + '  isSolved=' + await page.evaluate(() => window.__RUBIKS__.isSolved()));

  // ---- 2. Scrambled ----
  const s1 = SCRAMBLE_1;
  await page.evaluate((alg) => window.__RUBIKS__.applyAlg(alg), s1);
  // Render the Move Log as a grid of move buttons (all "done") so the shot shows
  // the full scramble sequence, then let the button styles settle before capture.
  await page.evaluate(() => window.__RUBIKS__.syncLog());
  await page.waitForTimeout(300);
  await snap('scrambled.png');
  console.log('✓ scrambled.png    status=' + await page.evaluate(() => window.__RUBIKS__.status) + '  isSolved=' + await page.evaluate(() => window.__RUBIKS__.isSolved()));

  // ---- 3. Solved-after-solve ----
  const facelets = await page.evaluate(() => window.__RUBIKS__.readFaceletString());
  const solution = await page.evaluate((fl) => window.Cube.fromString(fl).solve(), facelets);
  console.log('   solver => ' + solution + ' (' + solution.split(' ').length + ' moves)');
  // Mirror the app's Solve button: clear the log first, then show only the
  // solution sequence as a grid of move buttons.
  await page.evaluate(() => window.__RUBIKS__.clearLog());
  await page.evaluate((alg) => window.__RUBIKS__.applyAlg(alg), solution);
  await page.evaluate(() => window.__RUBIKS__.syncLog());
  await page.waitForTimeout(300);
  await snap('solved-after.png');
  console.log('✓ solved-after.png status=' + await page.evaluate(() => window.__RUBIKS__.status) + '  isSolved=' + await page.evaluate(() => window.__RUBIKS__.isSolved()));

  await browser.close();
  console.log('done. Screenshots in docs/screenshots/');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
