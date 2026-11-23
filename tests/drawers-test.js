/**
 * tests/drawers-test.js — auto-close-on-overlap tests for the slide-out
 * face-button drawer (left edge):
 *
 *   When the drawer is open AND its panel (including the tab, read from the
 *   drawer's own bounding box) geometrically overlaps the cube's on-screen area,
 *   clicking Scramble or Solve slides the drawer closed first so the cube
 *   animation stays visible. On a non-overlapping layout (a wide screen) the
 *   drawer is left open.
 *
 *   The drawer's STARTUP state is width-dependent, decided by the very same
 *   overlap test: a narrow viewport starts it CLOSED (the panel would cover the
 *   cube), a wide one starts it OPEN. Each scenario asserts that startup state,
 *   opens the drawer if it started closed, clicks the action button, and reads
 *   the tab's aria-expanded to confirm whether it auto-closed:
 *
 *     - narrow viewport (drawer covers the cube) + Scramble -> start closed, auto-close
 *     - wide   viewport (drawer clear of cube)    + Scramble -> start open, stay open
 *     - narrow viewport (drawer covers the cube) + Solve    -> start closed, auto-close
 *     - wide   viewport (drawer clear of cube)    + Solve    -> start open, stay open
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

// The cube sits in the centre of a full-viewport canvas, so whether the drawer
// overlaps it depends on the viewport width:
//   - a narrow viewport (phone-width) pushes the panel over the cube.
//   - a wide viewport leaves the panel in the side margin, clear of the cube.
const scenarios = [
  { w: 360,  h: 780,  btn: '#btn-scramble', label: 'Scramble', expectClose: true,  desc: 'narrow' },
  { w: 1600, h: 900,  btn: '#btn-scramble', label: 'Scramble', expectClose: false, desc: 'wide'   },
  { w: 360,  h: 780,  btn: '#btn-solve',    label: 'Solve',    expectClose: true,  desc: 'narrow' },
  { w: 1600, h: 900,  btn: '#btn-solve',    label: 'Solve',    expectClose: false, desc: 'wide'   },
];

// The single slide-out drawer: the left-edge face-button drawer.
const DRAWERS = [
  { tab: 'face-drawer-tab', panel: 'face-drawer', name: 'face' },
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

    // 1) The drawer starts in the width-dependent state: closed on a narrow
    //    viewport, open on a wide one. expectClose tracks that (narrow->closed,
    //    wide->open), so it doubles as the expected startup state.
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
    check(tag(s) + s.label + ' face drawer open before action', openNow.every(o => o === 'true'),
      JSON.stringify(openNow));
    if (!openNow.every(o => o === 'true')) { await page.close(); continue; }

    // 3) Click the action button. The auto-close helper is synchronous, so
    //    aria-expanded reflects the result right after the click; the wait is
    //    just a safety net for the CSS slide.
    await page.click(s.btn);
    await page.waitForTimeout(500);

    // 4) Assert the drawer's final state: auto-close on narrow, stay open on wide.
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
