/**
 * tests/log-dock-test.js — the right-docked Move Log band:
 *
 *   applyCanvasRect re-docks the Move Log (the SAME card — single source of
 *   truth, no duplicate element: counter, empty hint and auto-scroll all
 *   keep working) from the stage's bottom edge to its RIGHT edge, in a
 *   height-only, width-independent band  stage height <= NARROW_LOG_FIT_MAX
 *   (H <= 784, inclusive — above 784 the bottom dock stands; there is NO
 *   lower bound, so below the old 635 minimum the log is right-docked too,
 *   resolving the old degenerate case):
 *     in-band   -> card top = banner bottom + 16 (live), card bottom =
 *                  stage bottom - 16, 16px from the right edge; card width
 *                  = 1-column minimum (58px) at 0 moves, growing with the
 *                  column count c = min(max(ceil(moves / perCol), 1), 5)
 *                  where perCol = floor(#move-log clientHeight / 31) live
 *                  (31px = 29px button + 2px gap pitch): 34c + 24px
 *                  (32px buttons + 2px gaps + 24px px-3 + 2px ring) →
 *                  58 / 92 / 126 / 160 / 194 for c = 1..5. The docked card
 *                  is HEADERLESS (no title, no move count — the bottom dock
 *                  keeps its full header). The log flows COLUMN-MAJOR via
 *                  explicit .log-col wrappers (renderMoves splits: the first
 *                  c-1 columns hold exactly perCol buttons, the last column
 *                  the remainder) — each column fills top→bottom, then the
 *                  next column to the right. No internal scroll while it
 *                  fits (overflow hidden); the moves exceed the 5-column
 *                  cap × perCol (only possible below stage height ≈ 334)
 *                  → the extras stack in the 5th column and the .log-scroll
 *                  fallback scrolls #move-log vertically, width capped at
 *                  5 columns. The canvas wrap's right inset = 16 + the
 *                  docked card's live width and its bottom reservation
 *                  drops to 0.
 *     out-band  -> the existing bottom dock stands (canvas right inset 0,
 *                  bottom reservation = the reserved 3-row log band).
 *
 *   Live perCol calibration (440px stage; headerless: clientH = stageH − 84,
 *   banner 52 + top 16 + bottom 16 — the log's 4px vertical padding sits
 *   inside the client area, the 1px ring is a layout-neutral box-shadow):
 *     440x700 → clientH 616 → 19   440x636 → 552 → 17
 *     440x450 → clientH 366 → 11   440x400 → 316 → 10
 *     440x320 → clientH 236 → 7
 *
 *   All placement is asserted through REAL rects, stage-relative: the
 *   canvas wrap via __RUBIKS__.canvasBands() (left/top/right/bottom are
 *   its actual rect insets), the card/buttons via getBoundingClientRect /
 *   offsetTop / offsetLeft.
 *
 *   Viewports (stage = min(100vw,1366) x min(100dvh,1276), so below the
 *   caps the stage equals the viewport):
 *     - 440x784  (784 <= 784)  -> right dock (band boundary, IN)
 *     - 440x785  (785 > 784)   -> bottom dock (just out)
 *     - 440x635  (635)         -> right dock (at the panel fit bound)
 *     - 440x400  (400)         -> right dock (low height; no lower bound)
 *     - 1440x700 (700)         -> right dock (height-only rule, wide stage)
 *     - 440x700  + 22 moves (KeyU at 3x)   -> 2 cols (19+3), width 92
 *     - 440x636  + 36 moves               -> 3 cols (17+17+2), width 126
 *     - 440x450  + 36 moves               -> 4 cols (11x3+3), width 160
 *     - 440x400  + 36 moves               -> 4 cols (10x3+6), width 160, no scroll
 *     - 440x320  + 36 moves               -> 5-col cap (7x4 + 8 in col 5), SCROLL
 *     - panel: 440x700 (0 moves) -> top ≈ 100.5 (centered banner↔stage)
 *                440x784         -> top ≈ 142.5; 440x600 -> pinned ≈ 68
 *     - width transition: 440x700 + 36 moves (2 cols, 92) -> resize to
 *       440x640 (17/col -> 3 cols, 126) -> canvas right re-measured
 *     - resize crossing 700 -> 800 -> 700 re-dock/undock (threshold 784)
  *     - undock WITH moves: 440x700 + 36 moves (2 .log-col cols) -> 800
  *       (flat .move-btn bottom-dock row) -> 700 (column split returns)
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

// Card width for c columns (mirrors dockedLogWidth in index.html).
const widthForCols = c => 34 * c + 24;

const scenarios = [
  { w: 440,  h: 784, band: 'in',  desc: 'at band boundary (784 <= 784) -> right dock' },
  { w: 440,  h: 785, band: 'out', desc: 'just above band (785 > 784) -> bottom dock' },
  { w: 440,  h: 635, band: 'in',  desc: 'at panel fit bound (635) -> right dock (no lower bound)' },
  { w: 440,  h: 400, band: 'in',  desc: 'low height (400) -> right dock (old degenerate case)' },
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
    // .move-btn at any depth: in the right dock the buttons live inside the
    // explicit .log-col column wrappers; in the bottom dock they are direct
    // children of #log-list.
    const btns = Array.from(logList.querySelectorAll('.move-btn'));
    const cols = Array.from(logList.querySelectorAll('.log-col'));
    const cardR = card.getBoundingClientRect();
    const bands = window.__RUBIKS__.canvasBands();
    return {
      stageH: sr.height,
      bannerBottom: bannerEl.getBoundingClientRect().bottom - sr.top,
      docked: logWrapEl.classList.contains('log-right'),
      logScrollOn: logArea.classList.contains('log-scroll'),
      cardTop: cardR.top - sr.top,
      cardBottom: cardR.bottom - sr.top,
      cardRightInset: sr.right - cardR.right,
      cardLeftInset: cardR.left - sr.left,
      cardW: cardR.width,
      btnCount: btns.length,
      btnTops: btns.map(b => b.offsetTop),
      btnLefts: btns.map(b => b.offsetLeft),
      btnW: btns.length ? btns[0].getBoundingClientRect().width : null,
      logScrollH: logArea.scrollHeight,
      logClientH: logArea.clientHeight,
      logColCount: cols.length,
      colLefts: cols.map(c => c.offsetLeft),
      // Card-edge gaps of the outer columns (rect-based: the offsetParent
      // chain is not #move-log, so offsetLeft alone is not card-relative).
      colCardLeft: cols.length ? cols[0].getBoundingClientRect().left - cardR.left : null,
      colCardRight: cols.length ? cardR.right - cols[cols.length - 1].getBoundingClientRect().right : null,
      // Bottom dock: #log-list holds the .move-btn buttons directly (flat
      // wrapping row); right dock: it holds .log-col wrappers instead.
      flatRow: Array.from(logList.children).length > 0
        && Array.from(logList.children).every(el => el.classList.contains('move-btn')),
      emptyHidden: getComputedStyle(document.getElementById('log-empty')).display === 'none',
      headerHidden: getComputedStyle(card.firstElementChild).display === 'none',
      logCount: document.getElementById('log-count').textContent,
      unitTop: document.getElementById('control-drawer').getBoundingClientRect().top - sr.top,
      unitH: document.getElementById('control-drawer').getBoundingClientRect().height,
      canvasRight: bands.right,
      canvasBottom: bands.bottom,
      bandsRight: bands.bands.right,
      bandsBottom: bands.bands.bottom,
    };
  });
}

// Max the animation speed (3.0x), then land `count` bare U turns one at a
// time (waitUntilIdle before each press so none is dropped by the busy
// guard; wait for the move counter to reach i+1 before the next).
async function pressMoves(page, count) {
  await page.evaluate(() => {
    const speed = document.getElementById('speed');
    speed.value = '3';
    speed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (let i = 0; i < count; i++) {
    await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(10000));
    await page.keyboard.press('u');
    await page.waitForFunction(
      n => document.getElementById('move-counter').textContent === String(n), i + 1,
      { timeout: 10000 });
  }
  await page.evaluate(() => window.__RUBIKS__.waitUntilIdle(10000));
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
      check(tag + 'card at the 1-column minimum width (0 moves)',
        near(m.cardW, widthForCols(1)), `width=${m.cardW.toFixed(1)}px expected=${widthForCols(1)}px`);
      check(tag + 'canvas right inset = 16 + card width',
        near(m.canvasRight, 16 + widthForCols(1)) && near(m.bandsRight, m.canvasRight, 0.5),
        `canvasRight=${m.canvasRight.toFixed(1)}px bandsRight=${m.bandsRight.toFixed(1)}px`);
      check(tag + 'canvas bottom reservation 0',
        near(m.canvasBottom, 0, 1) && near(m.bandsBottom, 0, 0.5),
        `canvasBottom=${m.canvasBottom.toFixed(1)}px bandsBottom=${m.bandsBottom.toFixed(1)}px`);
      check(tag + 'no scroll at 0 moves (scrollH ~= clientH)',
        !m.logScrollOn && m.logScrollH <= m.logClientH + TOL,
        `scrollH=${m.logScrollH}px clientH=${m.logClientH}px scrollOn=${m.logScrollOn}`);
      check(tag + 'header hidden in-band (headerless card)', m.headerHidden, `headerHidden=${m.headerHidden}`);
      check(tag + 'empty hint hidden in-band', m.emptyHidden, `hidden=${m.emptyHidden}`);
      check(tag + 'counter still tracks "0 moves" (hidden, single source)', m.logCount === '0 moves', `logCount="${m.logCount}"`);
    } else {
      check(tag + 'bottom dock stands (no .log-right)', !m.docked, `docked=${m.docked}`);
      check(tag + 'header visible in the bottom dock', !m.headerHidden, `headerHidden=${m.headerHidden}`);
      check(tag + 'card spans the stage (right-1, 4px)',
        near(m.cardRightInset, 4), `right inset=${m.cardRightInset.toFixed(1)}px`);
      check(tag + 'canvas right inset 0', near(m.canvasRight, 0, 1),
        `canvasRight=${m.canvasRight.toFixed(1)}px`);
      check(tag + 'canvas bottom = reserved 3-row band',
        near(m.canvasBottom, m.bandsBottom, 0.5) && m.bandsBottom > 100,
        `canvasBottom=${m.canvasBottom.toFixed(1)}px reserved=${m.bandsBottom.toFixed(1)}px`);
    }
    await page.close();
  }

  // --- Panel placement in the right-docked band (0 moves).
  //   H >= 635: equidistant between banner bottom and stage bottom;
  //   H < 635:  pinned at banner bottom + 16 (may clip; assert top only).
  for (const [h, expectedTop, desc] of [
    [700, 52 + (700 - 52 - 551) / 2, 'centered banner-bottom <-> stage-bottom (H 700 >= 635)'],
    [784, 52 + (784 - 52 - 551) / 2, 'centered banner-bottom <-> stage-bottom (H 784)'],
    [600, null,                       'pinned at banner + 16 (H 600 < 635; clips, top only)'],
  ]) {
    const page = await browser.newPage({ viewport: { width: 440, height: h } });
    await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });
    await page.waitForTimeout(300);
    const m = await measure(page);
    const tag = `[440x${h}, 0 moves, panel ${desc}] `;
    check(tag + 'right docked', m.docked, `docked=${m.docked}`);
    if (expectedTop !== null) {
      check(tag + `panel top ~= ${expectedTop.toFixed(1)} (equidistant gaps)`,
        near(m.unitTop, expectedTop),
        `unitTop=${m.unitTop.toFixed(1)}px gapAbove=${(m.unitTop - m.bannerBottom).toFixed(1)}px gapBelow=${(m.stageH - m.unitTop - m.unitH).toFixed(1)}px`);
    } else {
      check(tag + 'panel top-pinned at banner + 16', near(m.unitTop - m.bannerBottom, 16),
        `unitTop=${m.unitTop.toFixed(1)}px bannerBottom=${m.bannerBottom.toFixed(1)}px`);
    }
    await page.close();
  }

  // --- Column-major move scenarios. Each: live perCol -> column count c,
  //   card width 34c + 24, canvas right = 16 + width, no scroll unless the
  //   moves exceed 5 x perCol (the .log-scroll fallback).
  const moveScenarios = [
    { h: 700, moves: 22, cols: 2, col1: 19, expectScroll: false,
      desc: '22 moves, perCol 19 -> 2 cols (19+3)' },
    { h: 636, moves: 36, cols: 3, col1: 17, expectScroll: false,
      desc: '36 moves, perCol 17 -> 3 cols (17+17+2)' },
    { h: 450, moves: 36, cols: 4, col1: 11, expectScroll: false,
      desc: '36 moves, perCol 11 -> 4 cols (11x3+3)' },
    { h: 400, moves: 36, cols: 4, col1: 10, expectScroll: false,
      desc: '36 moves, perCol 10 -> 4 cols (10x3+6; 36 <= 4x10=40, no scroll)' },
    { h: 320, moves: 36, cols: 5, col1: 7,  expectScroll: true,
      desc: '36 moves, perCol 7 -> 5-col cap (cap 35 < 36, SCROLL)' },
  ];
  for (const s of moveScenarios) {
    const page = await browser.newPage({ viewport: { width: 440, height: s.h } });
    await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });
    await page.waitForTimeout(300);
    await pressMoves(page, s.moves);
    const m = await measure(page);
    const tag = `[440x${s.h}, ${s.moves} moves: ${s.desc}] `;
    const wantW = widthForCols(s.cols);

    check(tag + `${s.moves} buttons in the log`, m.btnCount === s.moves, `count=${m.btnCount}`);
    check(tag + 'right docked', m.docked, `docked=${m.docked}`);
    check(tag + `card width ${wantW} (${s.cols}-column fit)`, near(m.cardW, wantW),
      `width=${m.cardW.toFixed(1)}px expected=${wantW}px`);
    // Column-major: the leftmost column holds buttons 0..col1-1 (identical
    // offsetLeft, strictly increasing offsetTop, no x-shift), and the full
    // set of columns is exactly `cols` distinct left positions.
    const minLeft = Math.min(...m.btnLefts);
    const col1Idx = m.btnLefts.map((l, i) => (l <= minLeft + 1 ? i : -1)).filter(i => i >= 0);
    check(tag + `column 1 holds buttons 0..${s.col1 - 1} (no x-shift before)`,
      col1Idx.length === s.col1 && col1Idx[s.col1 - 1] === s.col1 - 1,
      `col1=${col1Idx.length} buttons, last idx=${col1Idx[s.col1 - 1]}`);
    const col1Tops = col1Idx.map(i => m.btnTops[i]);
    check(tag + 'column 1 tops strictly increasing (top->bottom fill)',
      col1Tops.every((t, i) => i === 0 || t > col1Tops[i - 1]),
      `first tops=${col1Tops.slice(0, 4).join(',')}px`);
    const distinct = [];
    for (const l of m.btnLefts) if (!distinct.some(d => Math.abs(d - l) <= 1)) distinct.push(l);
    check(tag + `${s.cols} distinct column positions (new columns rightward)`,
      distinct.length === s.cols,
      `distinct=${distinct.length} lefts=${distinct.map(d => d.toFixed(0)).join(',')}px`);
    check(tag + 'buttons stay 32px wide (columns did not stretch them)',
      near(m.btnW, 32, 2), `btnW=${m.btnW.toFixed(1)}px`);
    // Centered columns: the #move-log 12px horizontal padding (px-3) plus the
    // 1px centering slack puts each outer column ≈12px from its card edge.
    check(tag + 'leftmost column 12px from the card left edge',
      near(m.colCardLeft, 12), `gap=${m.colCardLeft.toFixed(1)}px`);
    check(tag + 'rightmost column 12px from the card right edge',
      near(m.colCardRight, 12), `gap=${m.colCardRight.toFixed(1)}px`);
    if (s.expectScroll) {
      check(tag + 'scroll ENGAGED (.log-scroll; scrollH > clientH)',
        m.logScrollOn && m.logScrollH > m.logClientH,
        `scrollOn=${m.logScrollOn} scrollH=${m.logScrollH}px clientH=${m.logClientH}px`);
      // The overflow stacks in the LAST column (no 6th column rightward): scroll
      // #move-log to the bottom and the last button must be visible in-view.
      const last = m.btnLefts[m.btnLefts.length - 1];
      const lastColCount = m.btnLefts.filter(l => Math.abs(l - last) <= 1).length;
      check(tag + `overflow stacks in column 5 (${lastColCount} buttons; no 6th column)`,
        lastColCount === s.moves - (s.cols - 1) * s.col1 && lastColCount > s.col1,
        `lastCol=${lastColCount} buttons`);
      const lastInView = await page.evaluate(() => {
        const logArea = document.getElementById('move-log');
        logArea.scrollTop = logArea.scrollHeight;
        const logR = logArea.getBoundingClientRect();
        const btns = document.querySelectorAll('#log-list .move-btn');
        const last = btns[btns.length - 1].getBoundingClientRect();
        return last.bottom <= logR.bottom + 2 && last.top >= logR.top - 2;
      });
      check(tag + 'last button reachable via vertical scroll', lastInView, `inView=${lastInView}`);
    } else {
      check(tag + 'NO scroll while it fits (scrollH ~= clientH)',
        !m.logScrollOn && m.logScrollH <= m.logClientH + TOL,
        `scrollOn=${m.logScrollOn} scrollH=${m.logScrollH}px clientH=${m.logClientH}px`);
    }
    check(tag + 'canvas right = 16 + live card width',
      near(m.canvasRight, 16 + wantW) && near(m.bandsRight, m.canvasRight, 0.5),
      `canvasRight=${m.canvasRight.toFixed(1)}px bandsRight=${m.bandsRight.toFixed(1)}px`);
    check(tag + 'canvas bottom reservation 0', near(m.canvasBottom, 0, 1),
      `canvasBottom=${m.canvasBottom.toFixed(1)}px`);
    check(tag + 'empty hint hidden in-band', m.emptyHidden, `hidden=${m.emptyHidden}`);
    await page.close();
  }

  // --- Width transition: 440x700 with 36 moves (perCol 19 -> 2 cols -> 92),
  //   resize to 440x640 (perCol 17 -> 3 cols -> 126): the card width changes,
  //   the canvas right band re-measures, and the cube re-centers (the canvas
  //   rect stays consistent with the live bands).
  {
    const page = await browser.newPage({ viewport: { width: 440, height: 700 } });
    await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });
    await page.waitForTimeout(300);
    const tag = '[width transition 700 -> 640, 36 moves] ';

    await pressMoves(page, 36);
    let m = await measure(page);
    check(tag + 'starts at 2 cols / width 92 at 440x700',
      m.docked && near(m.cardW, widthForCols(2)) && near(m.canvasRight, 16 + widthForCols(2)),
      `docked=${m.docked} cardW=${m.cardW.toFixed(1)}px canvasRight=${m.canvasRight.toFixed(1)}px`);

    await page.setViewportSize({ width: 440, height: 640 });
    await page.waitForTimeout(300);
    m = await measure(page);
    check(tag + 're-measures to 3 cols / width 126 at 440x640',
      m.docked && near(m.cardW, widthForCols(3)),
      `docked=${m.docked} cardW=${m.cardW.toFixed(1)}px expected=${widthForCols(3)}px`);
    // Explicit column count: exactly 3 .log-col wrappers, each at its own
    // offsetLeft (the re-split actually replaced the 2-column split).
    const colDistinct = [];
    for (const l of m.colLefts) if (!colDistinct.some(d => Math.abs(d - l) <= 1)) colDistinct.push(l);
    check(tag + 'explicit 3 .log-col columns (3 distinct offsetLefts)',
      m.logColCount === 3 && colDistinct.length === 3,
      `cols=${m.logColCount} lefts=${m.colLefts.map(v => v.toFixed(0)).join(',')}px`);
    check(tag + 'canvas right re-measured (16 + live card width)',
      near(m.canvasRight, 16 + m.cardW, 0.5) && near(m.bandsRight, m.canvasRight, 0.5),
      `canvasRight=${m.canvasRight.toFixed(1)}px bandsRight=${m.bandsRight.toFixed(1)}px`);
    check(tag + 'cube re-centered (canvas spans the new empty rect: top 68, bottom 0)',
      near(m.canvasBottom, 0, 1),
      `canvasBottom=${m.canvasBottom.toFixed(1)}px`);
    check(tag + 'still no scroll at 3 cols (36 <= 3x17=51)',
      !m.logScrollOn && m.logScrollH <= m.logClientH + TOL,
      `scrollOn=${m.logScrollOn} scrollH=${m.logScrollH}px clientH=${m.logClientH}px`);
    await page.close();
  }

  // --- Resize crossing: 440x700 (in-band) -> 440x800 (out-of-band) -> back.
  // A resize crossing the 784 band edge must re-dock/undock with the existing
  // snap (no animation for the log dock).
  {
    const page = await browser.newPage({ viewport: { width: 440, height: 700 } });
    await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });
    await page.waitForTimeout(300);
    const tag = '[resize crossing 784] ';

    let m = await measure(page);
    check(tag + 'starts right-docked at 700 (in-band)',
      m.docked && near(m.canvasBottom, 0, 1),
      `docked=${m.docked} canvasBottom=${m.canvasBottom.toFixed(1)}px`);

    await page.setViewportSize({ width: 440, height: 800 });
    await page.waitForTimeout(300);
    m = await measure(page);
    check(tag + 'undocks to the bottom dock at 800 (out-of-band)',
      !m.docked && near(m.canvasBottom, m.bandsBottom, 0.5) && m.bandsBottom > 100,
      `docked=${m.docked} canvasBottom=${m.canvasBottom.toFixed(1)}px reserved=${m.bandsBottom.toFixed(1)}px`);
    check(tag + 'header visible again in the bottom dock', !m.headerHidden, `headerHidden=${m.headerHidden}`);

    await page.setViewportSize({ width: 440, height: 700 });
    await page.waitForTimeout(300);
    m = await measure(page);
    check(tag + 're-docks right at 700 again (1-col width)',
      m.docked && near(m.canvasBottom, 0, 1) && near(m.cardW, widthForCols(1))
        && near(m.canvasRight, 16 + widthForCols(1)) && near(m.cardTop, 68),
      `docked=${m.docked} cardW=${m.cardW.toFixed(1)}px canvasRight=${m.canvasRight.toFixed(1)}px cardTop=${m.cardTop.toFixed(1)}px`);
    await page.close();
  }

  // --- Undock WITH moves: 440x700 + 36 moves (perCol 19 -> 2 .log-col
  //   columns) -> resize to 440x800 (out-of-band, bottom dock): the flat
  //   wrapping row must REPLACE the .log-col split (no stale column
  //   wrappers), and resizing back to 700 must restore the column split.
  {
    const page = await browser.newPage({ viewport: { width: 440, height: 700 } });
    await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__RUBIKS__ && window.__RUBIKS__.ready === true, { timeout: 120000 });
    await page.waitForTimeout(300);
    const tag = '[undock with 36 moves, 700 -> 800 -> 700] ';

    await pressMoves(page, 36);
    let m = await measure(page);
    check(tag + 'starts docked with 2 .log-col columns (36 buttons)',
      m.docked && m.logColCount === 2 && m.btnCount === 36 && near(m.cardW, widthForCols(2)),
      `docked=${m.docked} cols=${m.logColCount} cardW=${m.cardW.toFixed(1)}px`);

    await page.setViewportSize({ width: 440, height: 800 });
    await page.waitForTimeout(300);
    m = await measure(page);
    check(tag + 'undocked: #log-list is a flat .move-btn row (no stale .log-col)',
      !m.docked && m.logColCount === 0 && m.flatRow && m.btnCount === 36,
      `docked=${m.docked} cols=${m.logColCount} flat=${m.flatRow} btns=${m.btnCount}`);
    // Normal bottom-dock wrapping layout: the 408px log list holds 12
    // 34px-pitch buttons per row, so buttons 0..11 share row 1 (offsetLeft
    // 12 = the log's px-3, then +34) and button 12 starts row 2.
    check(tag + 'bottom-dock row layout: buttons 0-1 share row 1 at 34px pitch',
      near(m.btnLefts[0], 12) && near(m.btnLefts[1] - m.btnLefts[0], 34) && m.btnTops[0] === m.btnTops[1],
      `left0=${m.btnLefts[0].toFixed(1)}px left1=${m.btnLefts[1].toFixed(1)}px tops=${m.btnTops[0].toFixed(1)}/${m.btnTops[1].toFixed(1)}px`);
    check(tag + 'bottom-dock row layout: button 12 wraps to row 2 (12/row)',
      m.btnTops[12] > m.btnTops[11] + 20,
      `top11=${m.btnTops[11].toFixed(1)}px top12=${m.btnTops[12].toFixed(1)}px`);
    check(tag + 'card spans the stage (left-1 / right-1, 4px each edge)',
      near(m.cardLeftInset, 4) && near(m.cardRightInset, 4),
      `leftInset=${m.cardLeftInset.toFixed(1)}px rightInset=${m.cardRightInset.toFixed(1)}px`);

    await page.setViewportSize({ width: 440, height: 700 });
    await page.waitForTimeout(300);
    m = await measure(page);
    check(tag + 're-dock: the column split returns (2 .log-col cols, 92px card)',
      m.docked && m.logColCount === 2 && m.btnCount === 36 && near(m.cardW, widthForCols(2)),
      `docked=${m.docked} cols=${m.logColCount} cardW=${m.cardW.toFixed(1)}px`);
    await page.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  const ok = results.every(r => r.startsWith('PASS'));
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  if (!ok) process.exitCode = 1;
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
