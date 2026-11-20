/**
 * tests/controls-drawer-test.js — auto-close-on-overlap tests for the
 * right-edge Controls drawer:
 *
 *   When the Controls drawer is open AND its panel (including the tab, read
 *   from the drawer's own bounding box) geometrically overlaps the cube's
 *   on-screen area, clicking Scramble or Solve slides the drawer closed first
 *   so the cube animation stays visible. On a non-overlapping layout (a wide
 *   screen) the drawer is left open.
 *
 *   Each scenario opens the drawer via its tab, clicks the action button, and
 *   reads the tab's aria-expanded to confirm whether it auto-closed:
 *
 *     - narrow viewport (drawer covers the cube) + Scramble -> auto-closes
 *     - wide   viewport (drawer clear of the cube) + Scramble -> stays open
 *     - narrow viewport (drawer covers the cube) + Solve    -> auto-closes
 *     - wide   viewport (drawer clear of the cube) + Solve    -> stays open
 *
 * Needs: Node, Playwright + Chromium.  Run: `node tests/controls-drawer-test.js`
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

// The cube sits in the centre of a full-viewport canvas, so whether the right-edge
// drawer overlaps it depends on the viewport width:
//   - a narrow viewport (phone-width) pushes the 320px panel over the cube.
//   - a wide viewport leaves the panel in the right margin, clear of the cube.
const scenarios = [
  { w: 360,  h: 780,  btn: '#btn-scramble', label: 'Scramble', expectClose: true,  desc: 'narrow' },
  { w: 1600, h: 900,  btn: '#btn-scramble', label: 'Scramble', expectClose: false, desc: 'wide'   },
  { w: 360,  h: 780,  btn: '#btn-solve',    label: 'Solve',    expectClose: true,  desc: 'narrow' },
  { w: 1600, h: 900,  btn: '#btn-solve',    label: 'Solve',    expectClose: false, desc: 'wide'   },
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

    // The drawer's open/closed state, read from the tab's aria-expanded attribute.
    const ctrlOpen = () => page.evaluate(
      () => document.getElementById('controls-drawer-tab').getAttribute('aria-expanded'));

    // Precondition: the controls drawer starts closed.
    check(tag(s) + s.label + ' starts closed', (await ctrlOpen()) === 'false', await ctrlOpen());

    // Open it via the tab. If the toggle itself is broken the rest is moot.
    await page.click('#controls-drawer-tab');
    await page.waitForTimeout(400); // let the .3s slide settle
    const opened = (await ctrlOpen()) === 'true';
    check(tag(s) + s.label + ' tab opens drawer', opened, await ctrlOpen());
    if (!opened) { await page.close(); continue; }

    // Record the open drawer's on-screen rect for diagnostics, then click the
    // action button. closeControls() (if it fires) is synchronous, so aria-expanded
    // reflects the result right after the click; the small wait is just a safety net.
    const rect = await page.$eval('#controls-drawer', (el) => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    });
    await page.click(s.btn);
    await page.waitForTimeout(500);

    const after = await ctrlOpen();
    const closed = after === 'false';
    check(tag(s) + s.label + (s.expectClose ? ' AUTO-CLOSES drawer' : ' leaves drawer OPEN'),
      closed === s.expectClose,
      `aria-expanded=${after} drawerRect=${JSON.stringify(rect)} viewport=${s.w}x${s.h}`);

    await page.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  const ok = results.every(r => r.startsWith('PASS'));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  if (!ok) process.exitCode = 1;
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
