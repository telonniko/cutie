/**
 * tests/press-test.js — keyboard-shortcut tests:
 *   - 't' toggles the layer-button drawer open/closed
 *   - Alt/Option + face key performs a 180° half turn
 *     (Shift is the prime modifier; Alt is the half-turn modifier)
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });

  const results = [];
  const check = (name, cond, info) => { results.push((cond ? 'PASS' : 'FAIL') + '  ' + name + '  ' + info); };
  // The drawer's open/closed state, read from the tab's aria-expanded attribute.
  const drawerOpen = () => page.evaluate(
    () => document.getElementById('face-drawer-tab').getAttribute('aria-expanded'));
  // The Controls drawer (right edge, holds the Reset button) is hidden behind its
  // tab by default, so open it before clicking in. Idempotent: toggles only if
  // currently closed.
  const controlsOpen = () => page.evaluate(
    () => document.getElementById('controls-drawer-tab').getAttribute('aria-expanded'));
  const openControlsDrawer = async () => {
    if ((await controlsOpen()) !== 'true') {
      await page.click('#controls-drawer-tab');
      await page.waitForTimeout(400); // let the .3s slide settle
    }
  };
  const isSolved = () => page.evaluate(() => window.__RUBIKS__.isSolved());
  async function resetIdle() {
    await openControlsDrawer(); // #btn-reset lives in the (default-hidden) Controls drawer
    await page.click('#btn-reset');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  }

  // ---- 1) 't' key toggles the drawer open/closed. --------------------------
  check('drawer starts closed', await drawerOpen() === 'false', await drawerOpen());
  await page.keyboard.press('t');
  await page.waitForTimeout(400);
  check('t key opens drawer', await drawerOpen() === 'true', await drawerOpen());
  await page.keyboard.press('t');
  await page.waitForTimeout(400);
  check('t key closes drawer', await drawerOpen() === 'false', await drawerOpen());

  // ---- 2) Alt/Option + face key performs a 180° half turn. -----------------
  //    Half turns have no on-screen-only keyboard button, so Alt/Option is the
  //    modifier (Shift is the prime). Two Alt+U half-turns return to solved
  //    (2 × 180° = 360°); one does not.
  await resetIdle();
  await page.keyboard.press('Alt+u');
  await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  const k1 = await isSolved();
  await page.keyboard.press('Alt+u');
  await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(3000));
  const k2 = await isSolved();
  check('Alt+U x2 returns to solved (180° half-turn each)', k1 === false && k2 === true, 'after1=' + k1 + ' after2=' + k2);

  await browser.close();
  console.log(results.join('\n'));
  console.log(results.every(r => r.startsWith('PASS')) ? '\nALL PASS' : '\nSOME FAILED');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
