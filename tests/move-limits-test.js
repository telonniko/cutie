/**
 * tests/move-limits-test.js — Move Log 36-move cap tests:
 *
 *   The Move Log may hold at most 36 moves total.
 *     - Face turn: with 36 moves in the log, a 37th face turn is REFUSED —
 *       the cube does not turn, the move is not logged, and a toast
 *       "Maximum moves allowed: 36" appears (spinner hidden, ~1s, fades out).
 *       Undoing a move frees a slot, so the next turn is accepted.
 *     - Solve: if the solver returns more than 36 moves, the solution is
 *       REFUSED before the log is cleared or the queue is filled — the log
 *       and the cube stay untouched, and a toast "Failed to find a solve
 *       solution" appears (spinner hidden, ~1s, fades out).
 *     - Scramble (18–24 moves) never hits the cap and is unaffected.
 *
 *   Driven entirely through the real UI: keyboard face keys (e.code based)
 *   and the Scramble / Solve / Step / Reset buttons in the control drawer.
 *   Needs: Node, Playwright + Chromium.  Run: `node tests/move-limits-test.js`
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

(async () => {
  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  };
  const exe = findExecutable();
  if (exe) launchOpts.executablePath = exe;
  const browser = await chromium.launch(launchOpts);
  // 1600×900: wide viewport, so the control drawer STARTS OPEN and every
  // action button (scramble/solve/step/reset) is immediately clickable.
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });

  const results = [];
  const check = (name, cond, info) => { results.push((cond ? 'PASS' : 'FAIL') + '  ' + name + '  ' + info); };
  const logCount = () => page.evaluate(() => document.querySelectorAll('#log-list button').length);
  const isSolved = () => page.evaluate(() => window.__RUBIKS__.isSolved());
  // A 24-move scramble takes ~10s at 1× speed, so the idle wait needs a
  // generous bound — the default 10s (and a 3s one) would time out mid-batch.
  const idle = (maxMs = 60000) => page.evaluate(m => window.__RUBIKS__.waitUntilIdle(m), maxMs);
  const toastState = () => page.evaluate(() => {
    const t = document.getElementById('solver-toast');
    const card = t.querySelector('div');
    const sp = document.getElementById('solver-spinner');
    return {
      visible: !t.classList.contains('hidden'),
      text: card.querySelector('span:last-child').textContent,
      spinnerHidden: sp.classList.contains('hidden'),
    };
  });

  // ---- 1) 36 keyboard U turns fill the log to exactly the cap. -------------
  //      36 × 90° = 9 full rotations, so the cube is SOLVED once full — the
  //      precondition that makes the rejection checks below meaningful.
  for (let i = 0; i < 36; i++) {
    await page.keyboard.press('KeyU');
    await idle();
  }
  check('log holds exactly 36 moves after 36 U turns', (await logCount()) === 36, 'log=' + await logCount());
  check('cube solved at the cap (36 U = 9 full turns)', (await isSolved()) === true, 'solved=' + await isSolved());

  // ---- 2) The 37th face turn is refused: no turn, no log entry, toast. ------
  await page.keyboard.press('KeyU');
  await idle(); // nothing animates (busy stays false) — resolves immediately
  let t = await toastState();
  check('37th turn: log still capped at 36', (await logCount()) === 36, 'log=' + await logCount());
  check('37th turn: toast visible + exact text', t.visible === true && t.text === 'Maximum moves allowed: 36', JSON.stringify(t));
  check('37th turn: toast spinner hidden', t.spinnerHidden === true, JSON.stringify(t));
  check('37th turn: cube did not turn (still solved)', (await isSolved()) === true, 'solved=' + await isSolved());
  await page.waitForTimeout(4000); // 1s message + 250ms fade-out (generous bound)
  t = await toastState();
  check('37th turn: toast auto-hides after ~1s', t.visible === false, JSON.stringify(t));

  // ---- 3) Undoing a move frees a slot: the next turn is accepted. -----------
  await page.click('#btn-stepbwd');
  await idle();
  check('after undo: cube unsolved (35 U = 3 mod 4 turns)', (await isSolved()) === false, 'solved=' + await isSolved());
  await page.keyboard.press('KeyU');
  await idle();
  check('after undo: new U accepted, log back to 36', (await logCount()) === 36, 'log=' + await logCount());
  // 35 U + this U = 36 U = 9 full rotations -> solved. (A refused turn would
  // leave the cube at 35 U = unsolved, so "solved" proves the move landed.)
  check('after undo: accepted turn turned the cube (36 U = solved)', (await isSolved()) === true, 'solved=' + await isSolved());

  // ---- 4) A solver answer longer than 36 moves is refused untouched. --------
  await page.evaluate(() => { window.Cube.prototype.solve = () => 'R U '.repeat(40); }); // 80 moves
  await page.click('#btn-scramble');
  await idle();
  const logBefore = await logCount();
  check('scramble produced 18..24 moves', logBefore >= 18 && logBefore <= 24, 'log=' + logBefore);
  check('scrambled cube is unsolved', (await isSolved()) === false, 'solved=' + await isSolved());
  await page.click('#btn-solve');
  await page.waitForTimeout(250); // solve must be rejected before it gets busy
  t = await toastState();
  check('over-cap solve: toast visible + exact text', t.visible === true && t.text === 'Failed to find a solve solution', JSON.stringify(t));
  check('over-cap solve: toast spinner hidden', t.spinnerHidden === true, JSON.stringify(t));
  check('over-cap solve: log untouched', (await logCount()) === logBefore, 'log=' + await logCount() + ' before=' + logBefore);
  check('over-cap solve: cube untouched (still unsolved)', (await isSolved()) === false, 'solved=' + await isSolved());
  await page.waitForTimeout(4000);
  t = await toastState();
  check('over-cap solve: toast auto-hides after ~1s', t.visible === false, JSON.stringify(t));

  // ---- 5) The cap did not break scrambles (18–24 moves after a reset). ------
  await page.click('#btn-reset');
  await idle();
  await page.click('#btn-scramble');
  await idle();
  const finalCount = await logCount();
  check('scramble after reset still yields 18..24 moves', finalCount >= 18 && finalCount <= 24, 'log=' + finalCount);

  await browser.close();
  console.log(results.join('\n'));
  console.log(results.every(r => r.startsWith('PASS')) ? '\nALL PASS' : '\nSOME FAILED');
  process.exitCode = results.every(r => r.startsWith('PASS')) ? 0 : 1;
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
