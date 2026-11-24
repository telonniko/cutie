/**
 * tests/step-buttons-test.js — the "← Step" / "Step →" buttons disable when the
 * Move Log has no move left to apply in that direction:
 *   - on a fresh log (cursor 0, no moves) BOTH buttons are disabled;
 *   - once a move is applied, "← Step" enables (something to undo) while
 *     "Step →" stays disabled (no future move to replay yet);
 *   - in the middle of the log BOTH are enabled;
 *   - at the very end of the log "Step →" disables again;
 *   - stepping all the way back re-disables "← Step";
 *   - a scramble/solve does NOT flicker the buttons mid-sequence: they are left
 *     untouched until the batch drains, then refreshed once in settle();
 *   - Reset re-disables both.
 *
 * The disabled state is read straight from the button's `disabled` DOM property
 * (via page.evaluate) so it works whether or not the control drawer is open.
 *
 * Run:  node tests/step-buttons-test.js
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
  // Wide viewport: the control drawer starts open, so the step buttons and face
  // buttons are on screen and clickable.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });

  // The disabled flags of the two step buttons, read straight from the DOM.
  const stepState = () => page.evaluate(() => ({
    bwd: document.getElementById('btn-stepbwd').disabled,
    fwd: document.getElementById('btn-stepfwd').disabled,
  }));
  const bothDisabled = async () => { const s = await stepState(); return s.bwd && s.fwd; };

  // Idempotent drawer opener (the control drawer starts open on a wide viewport,
  // but a Scramble/Solve may have auto-closed it, so open it back if needed).
  const drawerOpen = (id) => page.evaluate(
    (i) => document.getElementById(i).getAttribute('aria-expanded'), id);
  const openDrawer = async (id) => {
    if ((await drawerOpen(id)) !== 'true') {
      await page.click('#' + id);
      await page.waitForTimeout(400); // let the .3s slide settle
    }
  };
  const openControlDrawer = () => openDrawer('control-drawer-tab');

  const quarterU = page.locator('#face-buttons button[data-face="U"]');
  const stepBwd = page.locator('#btn-stepbwd');
  const stepFwd = page.locator('#btn-stepfwd');

  // Run everything fast so the (random 18-24 move) scramble batch drains quickly
  // within the wait timeouts. The speed slider drives state.speed (0.3x-3x).
  const setSpeed = async (v) => {
    await page.evaluate((val) => {
      const s = document.getElementById('speed');
      s.value = String(val);
      s.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
  };
  await setSpeed(3);

  // Reset to a known solved / empty-log state (both step buttons end disabled).
  async function resetIdle() {
    await openControlDrawer();
    await page.click('#btn-reset');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  }

  // Click a step button and wait for its single-move animation to settle, then
  // read the refreshed disabled flags. Guarded: only clicks when enabled, so it
  // can be used to walk the cursor to an end without hanging on a disabled button.
  async function clickStep(loc) {
    if (await loc.isDisabled()) return false;
    await loc.click();
    await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
    return true;
  }

  const results = [];
  const check = (name, cond, info) => results.push((cond ? 'PASS' : 'FAIL') + '  ' + name + '  ' + info);

  // ---- 1) Fresh load / after Reset: both buttons are disabled. --------------
  await resetIdle();
  const s0 = await stepState();
  check('fresh log: both step buttons disabled', s0.bwd === true && s0.fwd === true, JSON.stringify(s0));

  // ---- 2) One applied move: "← Step" enables, "Step →" stays disabled. ------
  //    A single quarter turn applies exactly one move, so cursor (1) == log
  //    length (1): there is a move to undo but nothing future to replay.
  await openControlDrawer();
  await quarterU.click();
  await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  const s1 = await stepState();
  check('after one move: back enabled, forward disabled', s1.bwd === false && s1.fwd === true, JSON.stringify(s1));

  // ---- 3) Step back to the start: "← Step" disables, "Step →" enables. ------
  await openControlDrawer();
  await clickStep(stepBwd);                 // cursor 1 -> 0
  const s2 = await stepState();
  check('stepped back to start: back disabled, forward enabled', s2.bwd === true && s2.fwd === false, JSON.stringify(s2));

  // ---- 4) Step forward to the end: "Step →" disables again. -----------------
  await clickStep(stepFwd);                 // cursor 0 -> 1 (replays the U)
  const s3 = await stepState();
  check('stepped to end: back enabled, forward disabled', s3.bwd === false && s3.fwd === true, JSON.stringify(s3));

  // ---- 5) Scramble does not flicker the buttons mid-sequence. ---------------
  //    After a Reset both are disabled. Scramble clears the log (no button
  //    refresh here) and animates the whole batch; the buttons must stay in their
  //    pre-scramble state until the batch drains, then refresh once in settle().
  await resetIdle();
  await openControlDrawer();
  await page.click('#btn-scramble');
  // Read WHILE the scramble is still animating: the flags must be untouched
  // (both still disabled), i.e. NOT toggled on every move as the cursor advances.
  const sMid = await stepState();
  check('mid-scramble: buttons left untouched (no flicker)', sMid.bwd === true && sMid.fwd === true, JSON.stringify(sMid));
  await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(15000));
  const sPost = await stepState();
  check('after scramble settles: back enabled, forward disabled', sPost.bwd === false && sPost.fwd === true, JSON.stringify(sPost));

  // ---- 6) In the middle of a long log: BOTH buttons are enabled. ------------
  //    Scramble the cube (cursor at the end), then step back a couple: the
  //    cursor now sits in the middle, so there are moves both behind and ahead.
  await openControlDrawer();
  await clickStep(stepBwd);
  await clickStep(stepBwd);
  const sMidLog = await stepState();
  check('mid-log: both step buttons enabled', sMidLog.bwd === false && sMidLog.fwd === false, JSON.stringify(sMidLog));

  // ---- 7) Walk all the way back to the start: "← Step" disables. -----------
  let guard = 0;
  while (guard++ < 200 && !(await stepBwd.isDisabled())) await clickStep(stepBwd);
  const sStart = await stepState();
  check('back to start of log: back disabled, forward enabled', sStart.bwd === true && sStart.fwd === false, JSON.stringify(sStart));

  // ---- 8) Reset re-disables both. ------------------------------------------
  await resetIdle();
  const sEnd = await stepState();
  check('after Reset: both step buttons disabled again', sEnd.bwd === true && sEnd.fwd === true, JSON.stringify(sEnd));

  await browser.close();
  console.log(results.join('\n'));
  console.log(results.every(r => r.startsWith('PASS')) ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(results.every(r => r.startsWith('PASS')) ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
