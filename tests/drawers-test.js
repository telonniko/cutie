/**
 * tests/drawers-test.js — width-threshold tests for the slide-out control
 * drawer (left edge):
 *
 *   The rule is a viewport-width threshold on the #stage element's width
 *   (min(100vw, 1276px) — identical to the window width below the cap):
 *   - stage width <= 750: the drawer starts CLOSED and clicking Scramble or
 *     Solve slides it closed again (auto-hide) before the cube animation.
 *   - stage width >  750: the drawer starts OPEN and stays open when
 *     Scramble or Solve is clicked.
 *
 *   Each scenario asserts the startup state (width-rule dependent), opens the
 *   drawer if it started closed, clicks the action button, and reads the tab's
 *   aria-expanded to confirm whether it auto-closed:
 *
 *     - narrow stage   (<= 750) + Scramble -> start closed, auto-close
 *     - wide   stage   (>  750) + Scramble -> start open, stay open
 *     - narrow stage   (<= 750) + Solve    -> start closed, auto-close
 *     - wide   stage   (>  750) + Solve    -> start open, stay open
 *     - boundary 750   (=  750) + Scramble -> start closed, auto-close
 *     - boundary 751   (>  750) + Scramble -> start open, stay open
 *
 *   The bottom Move Log panel is always visible — it has no drawer state and is
 *   not part of these tests.
 *
 * Needs: Node, Playwright + Chromium.  Run: `node tests/drawers-test.js`
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

// The rule is a width threshold on the #stage element's width
// (min(100vw, 1276px) — identical to the window width below the cap):
//   - stage width <= 750: drawer starts closed and auto-hides before the
//     Scramble/Solve animation.
//   - stage width >  750: drawer starts open and stays open.
const scenarios = [
  { w: 440,  h: 840,  btn: '#btn-scramble', label: 'Scramble', expectClose: true,  desc: 'narrow' },
  { w: 1440, h: 900,  btn: '#btn-scramble', label: 'Scramble', expectClose: false, desc: 'wide'   },
  { w: 440,  h: 840,  btn: '#btn-solve',    label: 'Solve',    expectClose: true,  desc: 'narrow' },
  { w: 1440, h: 900,  btn: '#btn-solve',    label: 'Solve',    expectClose: false, desc: 'wide'   },
  { w: 750,  h: 840,  btn: '#btn-scramble', label: 'Scramble', expectClose: true,  desc: 'boundary 750' },
  { w: 751,  h: 840,  btn: '#btn-scramble', label: 'Scramble', expectClose: false, desc: 'boundary 751' },
];

// The single slide-out drawer: the left-edge control drawer.
const DRAWERS = [
  { tab: 'control-drawer-tab', panel: 'control-drawer', name: 'control' },
];

(async () => {
  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  };
  const exe = findExecutable();
  if (exe) launchOpts.executablePath = exe;
  const browser = await chromium.launch(launchOpts);

  const results = [];
  const check = (name, cond, info) => { results.push((cond ? 'PASS' : 'FAIL') + '  ' + name + '  ' + info); };
  const tag = s => `[${s.desc} viewport ${s.w}x${s.h}] `;

  for (const s of scenarios) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
    await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });
    await page.waitForTimeout(300); // let the double-rAF startup decision settle

    // A drawer's open/closed state, read from its tab's aria-expanded attribute.
    const openOf = (tab) => page.evaluate(
      (t) => document.getElementById(t).getAttribute('aria-expanded'), tab);

    // 1) The drawer starts in the width-rule state: closed when the stage is
    //    <= 750 px wide, open when it is > 750 px wide.
    //    expectClose tracks that (narrow->closed, wide->open), so it doubles
    //    as the expected startup state.
    const startState = s.expectClose ? 'false' : 'true';
    for (const d of DRAWERS) {
      check(tag(s) + s.label + ` ${d.name} starts ${s.expectClose ? 'closed' : 'open'}`,
        (await openOf(d.tab)) === startState, await openOf(d.tab));
    }

    // 2) Ensure the drawer is OPEN before the action. On a wide viewport it
    //    already is, so the tap is skipped (idempotent); on a narrow one it
    //    slides out. If the toggle is broken the rest is moot.
    for (const d of DRAWERS) {
      if ((await openOf(d.tab)) !== 'true') {
        await page.click('#' + d.tab);
        await page.waitForTimeout(400); // let the .3s slide settle
      }
    }
    const openNow = await Promise.all(DRAWERS.map(d => openOf(d.tab)));
    check(tag(s) + s.label + ' control drawer open before action', openNow.every(o => o === 'true'),
      JSON.stringify(openNow));
    if (!openNow.every(o => o === 'true')) { await page.close(); continue; }

    // 3) Click the action button. The auto-close helper is synchronous, so
    //    aria-expanded reflects the result right after the click; the wait is
    //    just a safety net for the CSS slide.
    await page.click(s.btn);
    await page.waitForTimeout(500);

    // 4) Assert the drawer's final state: auto-close on a narrow stage
    //    (<= 750 px), stay open on a wide one (> 750 px).
    for (const d of DRAWERS) {
      const after = await openOf(d.tab);
      check(tag(s) + s.label + ` ${d.name} drawer ${s.expectClose ? 'AUTO-CLOSES' : 'stays OPEN'}`,
        after === startState, `aria-expanded=${after} viewport=${s.w}x${s.h}`);
    }

    await page.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  const ok = results.every(r => r.startsWith('PASS'));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  if (!ok) process.exitCode = 1;
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
