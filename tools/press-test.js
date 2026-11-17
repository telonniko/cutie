/**
 * tools/press-test.js — verifies the face-button behavior:
 *   - depressed (.pressed) look on pointer down, restored on up
 *   - shift click previews the prime  (U')
 *   - double click previews the half-turn  (U2)
 *   - label always snaps back to the plain letter on release
 *   - ACTION: a double-click turns a layer 180°; a single click turns 90° and
 *     is deferred (no animation starts until single/double is decided);
 *     Cmd/Meta is ignored.
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

async function state(page, letter) {
  return page.evaluate((f) => {
    const b = document.querySelector('#face-buttons button[data-face="' + f + '"]');
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

  const center = async (letter) => {
    const box = await page.locator('#face-buttons button[data-face="' + letter + '"]').boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const results = [];
  const check = (name, cond, info) => { results.push((cond ? 'PASS' : 'FAIL') + '  ' + name + '  ' + info); };
  const allLabels = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#face-buttons button')).map(b => b.textContent).join(' '));

  // 1) Plain press: U depressed, label stays 'U', restores on release.
  let p = await center('U');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  let s = await state(page, 'U');
  check('plain down -> pressed + label U', s.pressed === true && s.text === 'U', JSON.stringify(s));
  // screenshot the depressed state
  await page.screenshot({ path: 'docs/screenshots/face-pressed.png' });
  await page.mouse.up();
  s = await state(page, 'U');
  check('plain up  -> restored flat + label U', s.pressed === false && s.text === 'U', JSON.stringify(s));

  // 2) Shift-click: label previews U'.
  p = await center('F');
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  s = await state(page, 'F');
  check('shift down -> pressed + label F\'', s.pressed === true && s.text === "F'", JSON.stringify(s));
  await page.mouse.up();
  await page.keyboard.up('Shift');
  s = await state(page, 'F');
  check('shift up   -> restored flat + label F', s.pressed === false && s.text === 'F', JSON.stringify(s));

  // 3) Double-click: second press within 300ms previews U2.
  p = await center('R');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.down(); // second press -> isDouble
  s = await state(page, 'R');
  check('double down -> pressed + label R2', s.pressed === true && s.text === 'R2', JSON.stringify(s));
  await page.mouse.up();
  s = await state(page, 'R');
  check('double up   -> restored flat + label R', s.pressed === false && s.text === 'R', JSON.stringify(s));

  // 4) Ambient prime: holding Shift primes ALL labels with no click; releasing
  //    restores them. And a click while Shift is held keeps the label primed
  //    after the pointer releases.
  await page.keyboard.down('Shift');
  await page.waitForTimeout(50);
  let all = await allLabels();
  check('Shift down -> all labels primed', all === "U' D' L' R' F' B'", JSON.stringify(all));
  p = await center('D');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  s = await state(page, 'D');
  check('shift+down -> D\' primed', s.pressed === true && s.text === "D'", JSON.stringify(s));
  await page.mouse.up();                       // Shift STILL held
  s = await state(page, 'D');
  check('shift held after click -> stays D\'', s.pressed === false && s.text === "D'", JSON.stringify(s));
  await page.keyboard.up('Shift');
  await page.waitForTimeout(50);
  all = await allLabels();
  check('Shift up   -> all labels plain', all === 'U D L R F B', JSON.stringify(all));

  // 5) Double-click while Shift held: transient U2 preview, then back to U'.
  p = await center('U');
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.down();                      // 2nd press -> isDouble
  s = await state(page, 'U');
  check('shift+double down -> U2 preview', s.pressed === true && s.text === 'U2', JSON.stringify(s));
  await page.mouse.up();
  s = await state(page, 'U');
  check('shift+double up   -> back to U\'', s.pressed === false && s.text === "U'", JSON.stringify(s));
  await page.keyboard.up('Shift');

  // 6) Cmd/Meta must be IGNORED by the UI — only Shift primes the labels.
  //    Dispatch synthetic Meta key events (target = body, which has .matches,
  //    unlike a window-targeted event) and assert the labels never change.
  await page.evaluate(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', bubbles: true }));
  });
  await page.waitForTimeout(30);
  let allMeta = await allLabels();
  check('Meta keydown -> labels stay plain', allMeta === 'U D L R F B', JSON.stringify(allMeta));
  await page.evaluate(() => {
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta', bubbles: true }));
  });
  allMeta = await allLabels();
  check('Meta keyup   -> labels stay plain', allMeta === 'U D L R F B', JSON.stringify(allMeta));

  // --- Action-level checks: the cube must actually turn ---------------------
  const Ubtn = page.locator('#face-buttons button[data-face="U"]');
  const isSolved = () => page.evaluate(() => window.__RUBIKS__.isSolved());
  // Reset to a known solved state and flush any pending single-click timers so
  // a stray deferred move can't contaminate the next sub-check.
  async function resetIdle() {
    await page.click('#btn-reset');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  }

  // 7) BUG 1 FIX — a double-click performs a 180° half-turn. Two double-clicks
  //    of U return the cube to solved; a buggy 90° would take four.
  await resetIdle();
  const preSolved = await isSolved();
  check('precondition: cube solved (double test)', preSolved === true, 'solved=' + preSolved);
  await Ubtn.dblclick();
  await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  const d1 = await isSolved();
  await Ubtn.dblclick();
  await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  const d2 = await isSolved();
  check('double-click U x2 returns to solved (180° each)', d1 === false && d2 === true, 'after1=' + d1 + ' after2=' + d2);

  // 8) BUG 2 / DEFER — a single click performs a 90° turn (four return to
  //    solved) and NO animation starts during the debounce window (we never
  //    start a 90° and reverse it into a 180°).
  await resetIdle();
  await Ubtn.click();
  const busyEarly = await page.evaluate(() => window.__RUBIKS__.busy);
  check('single-click defers: no animation during debounce window', busyEarly === false, 'busyEarly=' + busyEarly);
  for (let i = 0; i < 4; i++) {
    await Ubtn.click();
    await page.waitForTimeout(300);                       // let the deferred timer fire
    await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(4000));
  }
  const singlesSolved = await isSolved();
  check('four single U clicks return to solved (90° each)', singlesSolved === true, 'solved=' + singlesSolved);

  await browser.close();
  console.log(results.join('\n'));
  console.log(results.every(r => r.startsWith('PASS')) ? '\nALL PASS' : '\nSOME FAILED');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
