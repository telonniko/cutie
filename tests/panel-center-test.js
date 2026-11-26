/**
 * tests/panel-center-test.js — vertical placement of the control panel:
 *
 *   applyCanvasRect pins the drawer unit's wrapper top per stage height:
 *   stage height > 790  ->  the unit is vertically CENTERED in the empty
 *                           space between the top banner's bottom edge and
 *                           the Move Log wrapper's top edge (equal gaps),
 *                           clamped so it never overlaps the banner;
 *   stage height <= 790 ->  TOP-PINNED at banner bottom + 16px (the canvas
 *                           top band's live value), as before.
 *
 *   The canvas rect must NOT follow the panel: in both branches its top
 *   stays at banner bottom + 16px (verified via __RUBIKS__.canvasBands()).
 *
 *   Viewports (stage height = min(100dvh, 1366px), so it equals the
 *   viewport height here):
 *     - 1440x900 (stage 900 > 790)  -> centering branch
 *     - 1440x700 (stage 700 <= 790) -> top-pin branch
 *   Both are wide enough that the drawer starts OPEN, so no interaction is
 *   needed beyond waiting for ready + the startup decision to settle.
 *
 * Needs: Node, Playwright + Chromium.  Run: `node tests/panel-center-test.js`
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

const TOL = 2; // px tolerance for "equal gaps" / "banner + 16" assertions

const scenarios = [
  { w: 1440, h: 900, branch: 'center', desc: 'centering (stage 900 > 790)' },
  { w: 1440, h: 700, branch: 'top-pin', desc: 'top-pin (stage 700 <= 790)' },
];

// Stage-relative measurements, mirroring how applyCanvasRect computes them:
// banner bottom, Move Log wrapper top (the element containing #move-log),
// drawer unit top + height, and the canvas top band.
function measure(page) {
  return page.evaluate(() => {
    const stage = document.getElementById('stage');
    const sr = stage.getBoundingClientRect();
    const bannerEl = stage.querySelector('header');
    const logWrapEl = Array.from(stage.children).find(el => el.contains(document.getElementById('move-log')));
    const unit = document.getElementById('control-drawer');
    const rel = r => ({ top: r.top - sr.top, bottom: r.bottom - sr.top, height: r.height });
    const bands = window.__RUBIKS__.canvasBands();
    return {
      stageH: sr.height,
      bannerBottom: bannerEl.getBoundingClientRect().bottom - sr.top,
      logTop: rel(logWrapEl.getBoundingClientRect()).top,
      unitTop: rel(unit.getBoundingClientRect()).top,
      unitH: unit.getBoundingClientRect().height,
      canvasTop: bands.top,
      canvasTopBand: bands.bands.top,
    };
  });
}

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
  const near = (a, b) => Math.abs(a - b) <= TOL;

  for (const s of scenarios) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
    await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });
    await page.waitForTimeout(300); // let the double-rAF startup decision settle

    const tag = s => `[${s.desc}] `;

    // 1) The wide stage starts the drawer OPEN — confirm, so the measured
    //    unit height is the full open panel (card + tab), not just the tab.
    const open = await page.evaluate(() =>
      document.getElementById('control-drawer-tab').getAttribute('aria-expanded'));
    check(tag(s) + 'drawer starts open', open === 'true', `aria-expanded=${open}`);
    if (open !== 'true') { await page.close(); continue; }

    const m = await measure(page);
    const gapAbove = m.unitTop - m.bannerBottom;
    const gapBelow = m.logTop - (m.unitTop + m.unitH);

    // 2) Branch-specific panel placement.
    if (s.branch === 'center') {
      check(tag(s) + 'equal gaps above/below unit',
        near(gapAbove, gapBelow),
        `above=${gapAbove.toFixed(1)}px below=${gapBelow.toFixed(1)}px unitH=${m.unitH.toFixed(1)}px`);
      check(tag(s) + 'unit does not overlap banner',
        m.unitTop >= m.bannerBottom - TOL,
        `unitTop=${m.unitTop.toFixed(1)}px bannerBottom=${m.bannerBottom.toFixed(1)}px`);
    } else {
      check(tag(s) + 'unit top-pinned at banner + 16',
        near(m.unitTop - m.bannerBottom, 16),
        `unitTop - bannerBottom = ${(m.unitTop - m.bannerBottom).toFixed(1)}px`);
    }

    // 3) The canvas rect is unaffected: its top stays at banner + 16 in BOTH
    //    branches, whether the panel moves or not.
    check(tag(s) + 'canvas top stays at banner + 16',
      near(m.canvasTop, m.bannerBottom + 16) && near(m.canvasTopBand, m.bannerBottom + 16),
      `canvasTop=${m.canvasTop.toFixed(1)}px expected=${(m.bannerBottom + 16).toFixed(1)}px`);

    await page.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  const ok = results.every(r => r.startsWith('PASS'));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  if (!ok) process.exitCode = 1;
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
