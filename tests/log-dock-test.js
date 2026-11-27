/**
 * tests/log-dock-test.js — the right-docked Move Log band:
 *
 *   applyCanvasRect re-docks the Move Log (the SAME card — single source of
 *   truth, no duplicate element: counter, empty hint and auto-scroll all
 *   keep working) from the stage's bottom edge to its RIGHT edge, in a
 *   height-only, width-independent band  NARROW_LOG_FIT_MIN < H <=
 *   NARROW_LOG_FIT_MAX  (635 < H <= 783.5; measured at 440x840: 635 =
 *   banner 52 + 16 + open panel 551 + 16, 783.5 = that plus the 3-row log
 *   144.5 + the wrapper's 4px bottom gap):
 *     in-band   -> card top = banner bottom + 16 (live), card bottom =
 *                  stage bottom - 16, 16px from the right edge, 58px wide
 *                  (32px button + 24px px-3 + 2px ring); the move column
 *                  is a single vertical flow with #move-log scrolling
 *                  internally (no .log-cap cap); the canvas wrap's right
 *                  inset = 16 + the docked card's live width and its
 *                  bottom reservation drops to 0.
 *     out-band  -> the existing bottom dock stands (canvas right inset 0,
 *                  bottom reservation = the reserved 3-row log band);
 *                  below 635 it stays degenerate by explicit decision
 *                  (no guards).
 *
 *   All placement is asserted through REAL rects, stage-relative: the
 *   canvas wrap via __RUBIKS__.canvasBands() (left/top/right/bottom are
 *   its actual rect insets), the card/buttons via getBoundingClientRect.
 *
 *   Viewports (stage = min(100vw,1366) x min(100dvh,1276), so below the
 *   caps the stage equals the viewport):
 *     - 440x634  (634 <= 635)   -> bottom dock (out-of-band, below min)
 *     - 440x635  (635)          -> bottom dock (lower bound is strict: H > 635)
 *     - 440x636  (636)          -> right dock (just inside the band)
 *     - 440x783  (783 <= 783.5) -> right dock (at the band max)
 *     - 440x784  (784)          -> bottom dock (tightest case above the max)
 *     - 440x785  (785 > 783.5)  -> bottom dock (out-of-band, above max)
 *     - 1440x700 (700)          -> right dock (height-only rule, wide stage)
 *     - 440x700  (700) with 25 moves, speed maxed (KeyU x 25) -> vertical
 *                  column, #move-log scroll engaged, current move scrolled
 *                  into view, empty hint hidden
 *
 * Needs: Node, Playwright + Chromium.  Run: `node tests/log-dock-test.js`
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

const TOL = 2; // px tolerance for placement assertions
const near = (a, b, tol = TOL) => Math.abs(a - b) <= tol;

const scenarios = [
  { w: 440,  h: 634, band: 'out', desc: 'below min (634 <= 635) -> bottom dock' },
  { w: 440,  h: 635, band: 'out', desc: 'at lower bound (635; strict H > 635) -> bottom dock' },
  { w: 440,  h: 636, band: 'in',  desc: 'just inside band (636) -> right dock' },
  { w: 440,  h: 783, band: 'in',  desc: 'at band max (783 <= 783.5) -> right dock' },
  { w: 440,  h: 784, band: 'out', desc: 'tightest case above max (784 > 783.5) -> bottom dock',
    cardTopGap: 104.5, bandInset: 164.5 },
  { w: 440,  h: 785, band: 'out', desc: 'above max (785 > 783.5) -> bottom dock' },
  { w: 1440, h: 700, band: 'in',  desc: 'wide stage (height-only rule) -> right dock' },
];

// Stage-relative measurements, mirroring how applyCanvasRect computes them.
function measure(page) {
  return page.evaluate(() => {
    const stage = document.getElementById('stage');
    const sr = stage.getBoundingClientRect();
    const bannerEl = stage.querySelector('header');
    const logWrapEl = Array.from(stage.children).find(el => el.contains(document.getElementById('move-log')));
    const card = logWrapEl.firstElementChild;
    const logArea = document.getElementById('move-log');
    const logList = document.getElementById('log-list');
    const btns = Array.from(logList.children);
    const cur = logList.querySelector('.move-btn.current');
    const cardR = card.getBoundingClientRect();
    const logR = logArea.getBoundingClientRect();
    const curR = cur ? cur.getBoundingClientRect() : null;
    const bands = window.__RUBIKS__.canvasBands();
    return {
      stageH: sr.height,
      bannerBottom: bannerEl.getBoundingClientRect().bottom - sr.top,
      docked: logWrapEl.classList.contains('log-right'),
      cardTop: cardR.top - sr.top,
      cardBottom: cardR.bottom - sr.top,
      cardRightInset: sr.right - cardR.right,
      cardW: cardR.width,
      btnCount: btns.length,
      btnTops: btns.map(b => b.offsetTop),
      btnW: btns.length ? btns[0].getBoundingClientRect().width : null,
      logScrollH: logArea.scrollHeight,
      logClientH: logArea.clientHeight,
      curInView: curR ? (curR.bottom <= logR.bottom + 2 && curR.top >= logR.top - 2) : false,
      emptyHidden: getComputedStyle(document.getElementById('log-empty')).display === 'none',
      logCount: document.getElementById('log-count').textContent,
      canvasRight: bands.right,
      canvasBottom: bands.bottom,
      bandsRight: bands.bands.right,
      bandsBottom: bands.bands.bottom,
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

  // --- Static scenarios: no moves, one page at a time.
  for (const s of scenarios) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
    await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });
    await page.waitForTimeout(300); // let the double-rAF startup decision settle
    const m = await measure(page);
    const tag = `[${s.desc}] `;

    if (s.band === 'in') {
      check(tag + 'log re-docked right (.log-right)', m.docked, `docked=${m.docked}`);
      check(tag + 'card top at banner + 16',
        near(m.cardTop - m.bannerBottom, 16),
        `cardTop - bannerBottom = ${(m.cardTop - m.bannerBottom).toFixed(1)}px`);
      check(tag + 'card top ~= 68 (measured banner 52 + 16)',
        near(m.cardTop, 68),
        `cardTop=${m.cardTop.toFixed(1)}px bannerBottom=${m.bannerBottom.toFixed(1)}px`);
      check(tag + 'card bottom at stage bottom - 16',
        near(m.cardBottom, m.stageH - 16),
        `cardBottom=${m.cardBottom.toFixed(1)}px stageH=${m.stageH.toFixed(1)}px`);
      check(tag + 'card 16px from the right edge',
        near(m.cardRightInset, 16), `right inset=${m.cardRightInset.toFixed(1)}px`);
      check(tag + 'card width ~= 58', near(m.cardW, 58, 3), `width=${m.cardW.toFixed(1)}px`);
      check(tag + 'canvas right inset ~= 74 (16 + 58)',
        near(m.canvasRight, 74, 3) && near(m.bandsRight, m.canvasRight, 0.5),
        `canvasRight=${m.canvasRight.toFixed(1)}px bandsRight=${m.bandsRight.toFixed(1)}px`);
      check(tag + 'canvas bottom reservation 0',
        near(m.canvasBottom, 0, 1) && near(m.bandsBottom, 0, 0.5),
        `canvasBottom=${m.canvasBottom.toFixed(1)}px bandsBottom=${m.bandsBottom.toFixed(1)}px`);
      check(tag + 'empty hint hidden in-band', m.emptyHidden, `hidden=${m.emptyHidden}`);
      check(tag + 'counter shows "0 moves"', m.logCount === '0 moves', `logCount="${m.logCount}"`);
    } else {
      check(tag + 'bottom dock stands (no .log-right)', !m.docked, `docked=${m.docked}`);
      check(tag + 'card spans the stage (right-1, 4px)',
        near(m.cardRightInset, 4), `right inset=${m.cardRightInset.toFixed(1)}px`);
      check(tag + 'canvas right inset 0', near(m.canvasRight, 0, 1),
        `canvasRight=${m.canvasRight.toFixed(1)}px`);
      check(tag + 'canvas bottom = reserved 3-row band',
        near(m.canvasBottom, m.bandsBottom, 0.5) && m.bandsBottom > 100,
        `canvasBottom=${m.canvasBottom.toFixed(1)}px reserved=${m.bandsBottom.toFixed(1)}px`);
      // 784 boundary extras (tightest out-of-band case only):
      //  - the EMPTY startup card is 100.5px tall (37.5px header + 63px log
      //    area), not the 144.5px 3-row card — 148.5 (card 144.5 + the
      //    wrapper's 4px gap) is the 3-row-card figure — so the empty card
      //    top sits 60.5px below the pinned panel bottom at 619 (no overlap).
      if (s.cardTopGap !== undefined) {
        check(tag + 'log card top ~= stageH - ' + s.cardTopGap + ' (empty card; 60.5px below the pinned panel bottom at 619, no overlap)',
          near(m.cardTop, m.stageH - s.cardTopGap, 2),
          `cardTop=${m.cardTop.toFixed(1)}px stageH=${m.stageH.toFixed(1)}px`);
      }
      //  - the reserved-band top is the true tightest geometry: it pins the
      //    NARROW_LOG_FIT_MAX boundary (at 783.5 it sits exactly at the pinned
      //    panel bottom 619; 784 buys only 0.5px of clearance).
      if (s.bandInset !== undefined) {
        const bandTop = m.stageH - m.bandsBottom;
        check(tag + 'reserved-band top ~= stageH - ' + s.bandInset + ' (pins the NARROW_LOG_FIT_MAX boundary; 0.5px below panel bottom 619)',
          near(bandTop, m.stageH - s.bandInset, 0.5),
          `bandTop=${bandTop.toFixed(1)}px stageH=${m.stageH.toFixed(1)}px`);
      }
    }
    await page.close();
  }

  // --- 25-move scenario: 440x700 (in-band), speed maxed, KeyU x 25.
  {
    const page = await browser.newPage({ viewport: { width: 440, height: 700 } });
    await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });
    await page.waitForTimeout(300);
    const tag = '[440x700, 25 moves, speed maxed] ';

    // Max the animation speed (3.0x) so the 25 single-move turns drain fast.
    await page.evaluate(() => {
      const speed = document.getElementById('speed');
      speed.value = '3';
      speed.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // 25 bare U turns: each press lands while the cube is idle (waitUntilIdle
    // before it, so none is dropped by the busy guard), then we wait for the
    // move counter to reach i+1 (the turn applied) before the next press.
    for (let i = 0; i < 25; i++) {
      await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(10000));
      await page.keyboard.press('u');
      await page.waitForFunction(
        n => document.getElementById('move-counter').textContent === String(n), i + 1,
        { timeout: 10000 });
    }
    await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(10000));

    const m = await measure(page);
    check(tag + '25 buttons in the log', m.btnCount === 25, `count=${m.btnCount}`);
    check(tag + 'buttons in a vertical column (distinct, increasing tops)',
      m.btnTops.every((t, i) => i === 0 || t > m.btnTops[i - 1]),
      `first tops=${m.btnTops.slice(0, 4).join(',')}px`);
    check(tag + 'buttons stay 32px wide (column did not stretch them)',
      near(m.btnW, 32, 2), `btnW=${m.btnW.toFixed(1)}px`);
    check(tag + '#move-log scrolls internally (scrollHeight > clientHeight)',
      m.logScrollH > m.logClientH,
      `scrollH=${m.logScrollH}px clientH=${m.logClientH}px`);
    check(tag + 'current move scrolled into view', m.curInView, `inView=${m.curInView}`);
    check(tag + 'empty hint hidden', m.emptyHidden, `hidden=${m.emptyHidden}`);
    check(tag + 'counter shows "25 moves"', m.logCount === '25 moves', `logCount="${m.logCount}"`);
    check(tag + 'canvas bottom reservation 0', near(m.canvasBottom, 0, 1),
      `canvasBottom=${m.canvasBottom.toFixed(1)}px`);
    await page.close();
  }

  // --- Resize crossing: 440x700 (in-band) -> 440x800 (out-of-band) -> back.
  // A resize crossing the band edge must re-dock/undock with the existing
  // snap (no animation for the log dock).
  {
    const page = await browser.newPage({ viewport: { width: 440, height: 700 } });
    await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });
    await page.waitForTimeout(300);
    const tag = '[resize crossing 783.5] ';

    let m = await measure(page);
    check(tag + 'starts right-docked at 700 (in-band)', m.docked && near(m.canvasBottom, 0, 1),
      `docked=${m.docked} canvasBottom=${m.canvasBottom.toFixed(1)}px`);

    await page.setViewportSize({ width: 440, height: 800 });
    await page.waitForTimeout(300);
    m = await measure(page);
    check(tag + 'undocks to the bottom dock at 800 (out-of-band)',
      !m.docked && near(m.canvasBottom, m.bandsBottom, 0.5) && m.bandsBottom > 100,
      `docked=${m.docked} canvasBottom=${m.canvasBottom.toFixed(1)}px reserved=${m.bandsBottom.toFixed(1)}px`);

    await page.setViewportSize({ width: 440, height: 700 });
    await page.waitForTimeout(300);
    m = await measure(page);
    check(tag + 're-docks right at 700 again',
      m.docked && near(m.canvasBottom, 0, 1) && near(m.canvasRight, 74, 3) && near(m.cardTop, 68),
      `docked=${m.docked} canvasBottom=${m.canvasBottom.toFixed(1)}px canvasRight=${m.canvasRight.toFixed(1)}px cardTop=${m.cardTop.toFixed(1)}px`);
    await page.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  const ok = results.every(r => r.startsWith('PASS'));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  if (!ok) process.exitCode = 1;
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
