/**
 * tests/click-test.js — mouse-event / click tests:
 *   - the drawer toggles via a tab click (tap on iPad)
 *   - three button columns: clockwise quarter (U…B), counter-clockwise
 *     quarter (U'…B'), and 180° half-turns (U2…B2)
 *   - each button is one fixed move; labels are fixed (no Shift-driven
 *     prime preview, no ambient repaint)
 *   - depressed (.pressed) look on pointer down, restored on up
 *   - a single click on a quarter button turns 90° clockwise
 *   - a single click on a prime button turns 90° counter-clockwise
 *   - a click on a half-turn button turns 180°
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');

function findExecutable() {
  const base = path.join(ROOT, 'node_modules', 'playwright-core', '.local-browsers', 'chromium-1255', 'chrome-mac-arm64');
  const candidates = [
    path.join(base, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
    path.join(base, 'chrome'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return undefined;
}

const stateFor = (wrap, f) => (page) =>
  page.evaluate(
    // Pass the selector as a plain string argument — Playwright's two-arg
    // page.evaluate does not pass a destructured {wrap, f} object into the page.
    (sel) => {
      const b = document.querySelector(sel);
      return { text: b.textContent, pressed: b.classList.contains('pressed') };
    },
    '#' + wrap + ' button[data-face="' + f + '"]'
  );

(async () => {
  // Screenshot output goes to the git-ignored tmp/ dir (created on demand).
  const TMP = path.join(ROOT, 'tmp');
  fs.mkdirSync(TMP, { recursive: true });

  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  };
  const exe = findExecutable();
  if (exe) launchOpts.executablePath = exe;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });

  const center = async (wrap, letter) => {
    const box = await page.locator('#' + wrap + ' button[data-face="' + letter + '"]').boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const results = [];
  const check = (name, cond, info) => { results.push((cond ? 'PASS' : 'FAIL') + '  ' + name + '  ' + info); };
  const allLabels = (wrap) => page.evaluate(
    (w) => Array.from(document.querySelectorAll('#' + w + ' button')).map(b => b.textContent).join(' '), wrap);
  // The drawer's open/closed state, read from the tab's aria-expanded attribute.
  const drawerOpen = () => page.evaluate(
    () => document.getElementById('face-drawer-tab').getAttribute('aria-expanded'));

  // ---- 1) The drawer toggles via the tab (a real click/tap). ---------------
  //    Runs first: if the toggle is broken, the button tests below are moot.
  //    On this wide (1440px) viewport the layer drawer STARTS OPEN (the screen
  //    fits the drawer + the cube), so tap the tab to slide it back, then tap
  //    again to slide it out. We leave it OPEN for the button-interaction tests,
  //    because the buttons sit off-screen while the drawer is closed.
  check('drawer starts open (wide viewport)', await drawerOpen() === 'true', await drawerOpen());
  await page.click('#face-drawer-tab');
  await page.waitForTimeout(400);                 // let the .3s slide settle
  check('tab click closes drawer', await drawerOpen() === 'false', await drawerOpen());
  await page.click('#face-drawer-tab');
  await page.waitForTimeout(400);
  check('tab click re-opens drawer', await drawerOpen() === 'true', await drawerOpen());

  // ---- 2) Plain press: U depressed, label stays 'U', restores on release. ---
  let p = await center('face-buttons', 'U');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  let s = await stateFor('face-buttons', 'U')(page);
  check('plain down -> pressed + label U', s.pressed === true && s.text === 'U', JSON.stringify(s));
  await page.screenshot({ path: path.join(TMP, 'face-pressed.png') });
  await page.mouse.up();
  s = await stateFor('face-buttons', 'U')(page);
  check('plain up  -> restored flat + label U', s.pressed === false && s.text === 'U', JSON.stringify(s));

  // ---- 3) Fixed labels: quarter, prime, and half columns are all static. ----
  //    No Shift-driven preview: the prime is its own column (U'…B'), so nothing
  //    repaints on modifier keys.
  check('quarter labels fixed', await allLabels('face-buttons') === 'U D L R F B',
    await allLabels('face-buttons'));
  check('prime labels fixed', await allLabels('prime-buttons') === "U' D' L' R' F' B'",
    await allLabels('prime-buttons'));
  check('half labels fixed', await allLabels('half-buttons') === 'U2 D2 L2 R2 F2 B2',
    await allLabels('half-buttons'));

  // ---- 4) Prime-column press: fixed 'F' label, pressed visual. --------------
  p = await center('prime-buttons', 'F');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  s = await stateFor('prime-buttons', 'F')(page);
  check('prime down -> pressed + label F\'', s.pressed === true && s.text === "F'", JSON.stringify(s));
  await page.mouse.up();
  s = await stateFor('prime-buttons', 'F')(page);
  check('prime up  -> restored flat + label F\'', s.pressed === false && s.text === "F'", JSON.stringify(s));

  // ---- 5) Half-turn button: fixed label, pressed visual. -------------------
  p = await center('half-buttons', 'R');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  s = await stateFor('half-buttons', 'R')(page);
  check('half down -> pressed + label R2', s.pressed === true && s.text === 'R2', JSON.stringify(s));
  await page.mouse.up();
  s = await stateFor('half-buttons', 'R')(page);
  check('half up   -> restored flat + label R2', s.pressed === false && s.text === 'R2', JSON.stringify(s));

  // --- Action-level checks: the cube must actually turn ---------------------
  const quarterU = page.locator('#face-buttons button[data-face="U"]');
  const primeU = page.locator('#prime-buttons button[data-face="U"]');
  const halfU = page.locator('#half-buttons button[data-face="U"]');
  const isSolved = () => page.evaluate(() => window.__RUBIKS__.isSolved());
  // Reset to a known solved state.
  async function resetIdle() {
    // #btn-reset lives in the face-button drawer: open it first (already open on
    // this wide viewport — idempotent, toggles only if currently closed).
    if ((await drawerOpen()) !== 'true') {
      await page.click('#face-drawer-tab');
      await page.waitForTimeout(400); // let the .3s slide settle
    }
    await page.click('#btn-reset');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  }

  // ---- 6) Single click on a quarter button performs 90° clockwise. ---------
  //    There is NO deferral or double-click detection: the pointerup fires
  //    userTurn() immediately, so `busy` is true right after the release.
  await resetIdle();
  const preSolved = await isSolved();
  check('precondition: cube solved (quarter test)', preSolved === true, 'solved=' + preSolved);
  await quarterU.click();
  // Wait for the turn to complete, then verify the cube is NOT solved (90°).
  await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  const q1 = await isSolved();
  check('single quarter click does NOT solve (90° turn)', q1 === false, 'solved=' + q1);

  // Four single quarter clicks of U return the cube to solved (4 × 90° = 360°).
  for (let i = 0; i < 3; i++) {
    await quarterU.click();
    await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  }
  const quarterSolved = await isSolved();
  check('four single U clicks return to solved (90° each)', quarterSolved === true, 'solved=' + quarterSolved);

  // ---- 7) Single click on a half-turn button performs 180°. ----------------
  //    Two half-turn clicks of U return the cube to solved (2 × 180° = 360°).
  await resetIdle();
  await halfU.click();
  await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  const h1 = await isSolved();
  await halfU.click();
  await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  const h2 = await isSolved();
  check('half-turn U x2 returns to solved (180° each)', h1 === false && h2 === true, 'after1=' + h1 + ' after2=' + h2);

  // ---- 8) Single click on a prime button performs 90° counter-clockwise. ----
  //    Four prime clicks return to solved (4 × 90° counter = 360°).
  await resetIdle();
  for (let i = 0; i < 4; i++) {
    await primeU.click();
    await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  }
  const primeSolved = await isSolved();
  check('four prime U clicks return to solved (90° counter each)', primeSolved === true, 'solved=' + primeSolved);

  await browser.close();
  console.log(results.join('\n'));
  console.log(results.every(r => r.startsWith('PASS')) ? '\nALL PASS' : '\nSOME FAILED');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
