/**
 * tools/press-test.js — verifies the face-button behavior:
 *   - depressed (.pressed) look on pointer down, restored on up
 *   - shift click previews the prime  (U')
 *   - label always snaps back to the plain letter on release
 *   - half-turn buttons (U2, D2, …) have fixed labels and don't follow Shift
 *   - Cmd/Meta is ignored (only Shift primes labels)
 *   - ACTION: a single click on a quarter button turns 90° immediately
 *             (no deferral, no double-click detection);
 *             a click on a half-turn button turns 180°.
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

async function quarterState(page, letter) {
  return page.evaluate((f) => {
    const b = document.querySelector('#face-buttons button[data-face="' + f + '"]');
    return { text: b.textContent, pressed: b.classList.contains('pressed') };
  }, letter);
}

async function halfState(page, letter) {
  return page.evaluate((f) => {
    const b = document.querySelector('#half-buttons button[data-face="' + f + '"]');
    return { text: b.textContent, pressed: b.classList.contains('pressed') };
  }, letter);
}

(async () => {
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

  const centerQuarter = async (letter) => {
    const box = await page.locator('#face-buttons button[data-face="' + letter + '"]').boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const centerHalf = async (letter) => {
    const box = await page.locator('#half-buttons button[data-face="' + letter + '"]').boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const results = [];
  const check = (name, cond, info) => { results.push((cond ? 'PASS' : 'FAIL') + '  ' + name + '  ' + info); };
  const allQuarterLabels = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#face-buttons button')).map(b => b.textContent).join(' '));
  const allHalfLabels = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#half-buttons button')).map(b => b.textContent).join(' '));

  // ---- 1) Plain press: U depressed, label stays 'U', restores on release. ---
  let p = await centerQuarter('U');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  let s = await quarterState(page, 'U');
  check('plain down -> pressed + label U', s.pressed === true && s.text === 'U', JSON.stringify(s));
  await page.screenshot({ path: 'docs/screenshots/face-pressed.png' });
  await page.mouse.up();
  s = await quarterState(page, 'U');
  check('plain up  -> restored flat + label U', s.pressed === false && s.text === 'U', JSON.stringify(s));

  // ---- 2) Shift-click: label previews F'. ---------------------------------
  p = await centerQuarter('F');
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  s = await quarterState(page, 'F');
  check('shift down -> pressed + label F\'', s.pressed === true && s.text === "F'", JSON.stringify(s));
  await page.mouse.up();
  await page.keyboard.up('Shift');
  s = await quarterState(page, 'F');
  check('shift up   -> restored flat + label F', s.pressed === false && s.text === 'F', JSON.stringify(s));

  // ---- 3) Half-turn buttons: fixed label, pressed visual, no Shift prime. --
  p = await centerHalf('R');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  s = await halfState(page, 'R');
  check('half down -> pressed + label R2', s.pressed === true && s.text === 'R2', JSON.stringify(s));
  await page.mouse.up();
  s = await halfState(page, 'R');
  check('half up   -> restored flat + label R2', s.pressed === false && s.text === 'R2', JSON.stringify(s));

  // Half-turn labels are always fixed (U2 D2 L2 R2 F2 B2), even with Shift held.
  await page.keyboard.down('Shift');
  await page.waitForTimeout(30);
  let halfLabels = await allHalfLabels();
  check('Shift down -> half labels unchanged', halfLabels === 'U2 D2 L2 R2 F2 B2', JSON.stringify(halfLabels));
  await page.keyboard.up('Shift');

  // ---- 4) Ambient prime: holding Shift primes ALL quarter labels with no -----
  //    click; releasing restores them.  A click while Shift is held keeps the --
  //    label primed after the pointer releases.
  await page.keyboard.down('Shift');
  await page.waitForTimeout(50);
  let all = await allQuarterLabels();
  check('Shift down -> all quarter labels primed', all === "U' D' L' R' F' B'", JSON.stringify(all));
  p = await centerQuarter('D');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  s = await quarterState(page, 'D');
  check('shift+down -> D\' primed', s.pressed === true && s.text === "D'", JSON.stringify(s));
  await page.mouse.up();                       // Shift STILL held
  s = await quarterState(page, 'D');
  check('shift held after click -> stays D\'', s.pressed === false && s.text === "D'", JSON.stringify(s));
  await page.keyboard.up('Shift');
  await page.waitForTimeout(50);
  all = await allQuarterLabels();
  check('Shift up   -> all quarter labels plain', all === 'U D L R F B', JSON.stringify(all));

  // ---- 5) Cmd/Meta must be IGNORED by the UI — only Shift primes labels. ----
  //    Dispatch synthetic Meta key events (target = body, which has .matches,
  //    unlike a window-targeted event) and assert the labels never change.
  await page.evaluate(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', bubbles: true }));
  });
  await page.waitForTimeout(30);
  let allMeta = await allQuarterLabels();
  check('Meta keydown -> labels stay plain', allMeta === 'U D L R F B', JSON.stringify(allMeta));
  await page.evaluate(() => {
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta', bubbles: true }));
  });
  allMeta = await allQuarterLabels();
  check('Meta keyup   -> labels stay plain', allMeta === 'U D L R F B', JSON.stringify(allMeta));

  // --- Action-level checks: the cube must actually turn ---------------------
  const quarterU = page.locator('#face-buttons button[data-face="U"]');
  const halfU = page.locator('#half-buttons button[data-face="U"]');
  const isSolved = () => page.evaluate(() => window.__RUBIKS__.isSolved());
  // Reset to a known solved state.
  async function resetIdle() {
    await page.click('#btn-reset');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  }

  // ---- 6) Single click on a quarter button performs 90° immediately. -------
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

  // ---- 8) Shift+click on quarter button performs 90° counter-clockwise. ----
  //    Four Shift+clicks return to solved (4 × 90° counter = 360°).
  await resetIdle();
  await page.keyboard.down('Shift');
  for (let i = 0; i < 4; i++) {
    await quarterU.click();
    await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  }
  await page.keyboard.up('Shift');
  const shiftSolved = await isSolved();
  check('four Shift+U clicks return to solved (90° counter each)', shiftSolved === true, 'solved=' + shiftSolved);

  await browser.close();
  console.log(results.join('\n'));
  console.log(results.every(r => r.startsWith('PASS')) ? '\nALL PASS' : '\nSOME FAILED');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
