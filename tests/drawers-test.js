/**
 * tests/drawers-test.js — auto-close-on-overlap tests for BOTH slide-out
 * drawers (the right-edge Controls drawer and the left-edge face-button drawer):
 *
 *   When a drawer is open AND its panel (including the tab, read from the
 *   drawer's own bounding box) geometrically overlaps the cube's on-screen area,
 *   clicking Scramble or Solve slides that drawer closed first so the cube
 *   animation stays visible. On a non-overlapping layout (a wide screen) the
 *   drawer is left open. The Scramble/Solve handlers run both auto-close helpers
 *   (closeControlsOverCube / closeFaceDrawerOverCube), so a single click clears
 *   every open drawer that would cover the cube.
 *
 *   Each drawer's STARTUP state is width-dependent, decided by the very same
 *   overlap test: a narrow viewport starts it CLOSED (the panel would cover the
 *   cube), a wide one starts it OPEN. Each scenario asserts that startup state
 *   for both drawers, opens whichever started closed, clicks the action button,
 *   and reads each tab's aria-expanded to confirm whether it auto-closed:
 *
 *     - narrow viewport (drawers cover the cube) + Scramble -> start closed, auto-close
 *     - wide   viewport (drawers clear of cube)   + Scramble -> start open, stay open
 *     - narrow viewport (drawers cover the cube) + Solve    -> start closed, auto-close
 *     - wide   viewport (drawers clear of cube)   + Solve    -> start open, stay open
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

// The cube sits in the centre of a full-viewport canvas, so whether a drawer
// overlaps it depends on the viewport width:
//   - a narrow viewport (phone-width) pushes the panel(s) over the cube.
//   - a wide viewport leaves the panels in the side margins, clear of the cube.
const scenarios = [
  { w: 360,  h: 780,  btn: '#btn-scramble', label: 'Scramble', expectClose: true,  desc: 'narrow' },
  { w: 1600, h: 900,  btn: '#btn-scramble', label: 'Scramble', expectClose: false, desc: 'wide'   },
  { w: 360,  h: 780,  btn: '#btn-solve',    label: 'Solve',    expectClose: true,  desc: 'narrow' },
  { w: 1600, h: 900,  btn: '#btn-solve',    label: 'Solve',    expectClose: false, desc: 'wide'   },
];

// Both slide-out drawers auto-close on overlap and share width-dependent startup,
// so the scenario loop exercises each drawer the same way.
const DRAWERS = [
  { tab: 'controls-drawer-tab', panel: 'controls-drawer', name: 'controls' },
  { tab: 'face-drawer-tab',     panel: 'face-drawer',     name: 'face'     },
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

    // 1) Both drawers start in the width-dependent state: closed on a narrow
    //    viewport, open on a wide one. expectClose tracks that (narrow->closed,
    //    wide->open), so it doubles as the expected startup state.
    const startState = s.expectClose ? 'false' : 'true';
    for (const d of DRAWERS) {
      check(tag(s) + s.label + ` ${d.name} starts ${s.expectClose ? 'closed' : 'open'}`,
        (await openOf(d.tab)) === startState, await openOf(d.tab));
    }

    // 2) Ensure BOTH drawers are OPEN before the action. On a wide viewport they
    //    already are, so the tap is skipped (idempotent); on a narrow one each
    //    slides out. If a toggle is broken the rest is moot.
    for (const d of DRAWERS) {
      if ((await openOf(d.tab)) !== 'true') {
        await page.click('#' + d.tab);
        await page.waitForTimeout(400); // let the .3s slide settle
      }
    }
    const openNow = await Promise.all(DRAWERS.map(d => openOf(d.tab)));
    check(tag(s) + s.label + ' both drawers open before action', openNow.every(o => o === 'true'),
      JSON.stringify(openNow));
    if (!openNow.every(o => o === 'true')) { await page.close(); continue; }

    // 3) Click the action button. Both auto-close helpers are synchronous, so
    //    aria-expanded reflects the result right after the click; the wait is
    //    just a safety net for the CSS slide.
    await page.click(s.btn);
    await page.waitForTimeout(500);

    // 4) Assert each drawer's final state: auto-close on narrow, stay open on wide.
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
