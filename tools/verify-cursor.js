/**
 * tools/verify-cursor.js
 * ----------------------
 * Headless simulation of the new "cursor" Move-Log model to prove that:
 *   1. stepping back/forward moves the cursor (cube always = moves[0..cursor-1]);
 *   2. a face-turn branches from the cursor (discards future moves, appends);
 *   3. solve() always solves the cube regardless of where the cursor is,
 *      discarding any future moves and appending the solution.
 *
 * Run:  node tools/verify-cursor.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('// === CUBE:START ===');
const end = html.indexOf('// === CUBE:END ===');
let core = html.slice(start + '// === CUBE:START ==='.length, end);
core = core.replace(/\/\/\s*===\s*CUBE:END\s*===.*$/s, '');

const sandbox = { console, setTimeout, Math, Array, Object, String, Number, JSON, Symbol, Promise, Set, Map };
sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);
const cubejsDir = path.join(__dirname, '..', 'node_modules', 'cubejs');
vm.runInContext(fs.readFileSync(path.join(cubejsDir, 'lib', 'cube.js'), 'utf8'), sandbox, { filename: 'cube.js' });
vm.runInContext(fs.readFileSync(path.join(cubejsDir, 'lib', 'solve.js'), 'utf8'), sandbox, { filename: 'solve.js' });
vm.runInContext(core, sandbox, { filename: 'cube-core' });

const Cube = sandbox.Cube;
const Core = sandbox.CubeCore;
const { buildCubies, applyMove, parseAlg, readFaceletString, isSolved } = Core;
Cube.initSolver(); // build the pruning tables (synchronous in node)

let fails = 0;
const assert = (cond, msg) => { if (cond) console.log('  ✓', msg); else { fails++; console.log('  ✗ FAIL:', msg); } };

// --- A tiny cursor-based app-model that mirrors index.html's logic ---
const app = {
  moves: [],      // full log
  cursor: 0,      // cube = moves[0..cursor-1]
  cubies: buildCubies(),
  // keep cube in sync with the prefix
  applyInstant(face, power) {
    applyMove(this.cubies, face, power);
    this.moves.push(face + (power === 1 ? '2' : (power === 2 ? "'" : '')));
    this.cursor = this.moves.length;
  },
  userTurn(face, power) {              // branch from cursor
    this.moves.length = this.cursor;   // discard future
    this.applyInstant(face, power);    // append + advance
  },
  stepForward() {
    if (this.cursor >= this.moves.length) return;
    const { face, power } = parseAlg(this.moves[this.cursor])[0];
    applyMove(this.cubies, face, power);   // finishMove: cursor = idx+1
    this.cursor = this.cursor + 1;
  },
  stepBackward() {
    if (this.cursor <= 0) return;
    const { face, power } = parseAlg(this.moves[this.cursor - 1])[0];
    const inv = power === 0 ? 2 : (power === 2 ? 0 : power);
    applyMove(this.cubies, face, inv);      // finishMove(back): cursor--
    this.cursor = this.cursor - 1;
  },
  scramble() {
    const faces = ['U','D','L','R','F','B'], mods = ['','2',"'"];
    this.moves = []; this.cursor = 0; this.cubies = buildCubies();
    let last = null;
    for (let i = 0; i < 20; i++) {
      let f; do { f = faces[Math.floor(Math.random()*6)]; } while (f === last); last = f;
      this.applyInstant(f, mods[Math.floor(Math.random()*3)]);
    }
  },
  solve() {
    // Like scramble: clear the log first, then queue/apply the solution from
    // the cube's CURRENT physical state (the source of truth).
    this.moves = [];
    this.cursor = 0;
    if (isSolved(this.cubies)) return [];
    const cj = Cube.fromString(readFaceletString(this.cubies));
    const tokens = parseAlg(cj.solve());
    for (const { face, power } of tokens) {
      applyMove(this.cubies, face, power); // apply + append
      this.moves.push(face + (power === 1 ? '2' : (power === 2 ? "'" : '')));
      this.cursor = this.moves.length;
    }
    return tokens;
  },
  invariant() {
    // cube must equal the prefix moves[0..cursor-1] applied to a solved cube.
    const c = buildCubies();
    for (let i = 0; i < this.cursor; i++) {
      const { face, power } = parseAlg(this.moves[i])[0];
      applyMove(c, face, power);
    }
    return readFaceletString(c) === readFaceletString(this.cubies);
  },
};

// --- Scenario the bug report describes: scramble, step back 3, solve ---
console.log('Scenario A: scramble, step back 3, solve from the stepped state');
app.scramble();
assert(app.cursor === 20 && app.moves.length === 20, 'scramble applied 20 moves');
app.stepBackward(); app.stepBackward(); app.stepBackward();
assert(app.cursor === 17, `cursor stepped back to 17 (got ${app.cursor})`);
assert(app.moves.length === 20, 'future moves kept in the log (20)');
assert(app.invariant(), 'cube == moves[0..16] (physical state tracks cursor)');
assert(!isSolved(app.cubies), 'cube is NOT solved at the stepped-back state');
const sol = app.solve();
assert(isSolved(app.cubies), 'cube IS solved after solve() from the stepped-back state');
assert(app.moves.length === sol.length, 'solve cleared the log first; log == solution only');
console.log(`    (solution had ${sol.length} moves; final log length ${app.moves.length})`);

// --- Scenario B: scramble, step back, then a hand turn branches the log ---
console.log('Scenario B: scramble, step back 2, hand-turn, solve');
app.scramble();
app.stepBackward(); app.stepBackward();
assert(app.cursor === 18, `cursor at 18 (got ${app.cursor})`);
app.userTurn('U', 0);
assert(app.moves.length === 19, 'hand turn discarded the 2 future moves and appended one (19 total)');
assert(app.cursor === 19, `cursor advanced to 19 (got ${app.cursor})`);
assert(app.invariant(), 'cube tracks the new branched log');
app.solve();
assert(isSolved(app.cubies), 'cube solved after hand-branch + solve');

// --- Scenario C: step back fully to solved, solve is a no-op ---
console.log('Scenario C: scramble, step back to 0, solve is already solved');
app.scramble();
while (app.cursor > 0) app.stepBackward();
assert(app.cursor === 0, `cursor stepped back to 0 (got ${app.cursor})`);
assert(isSolved(app.cubies), 'cube is solved again at cursor 0');
const s2 = app.solve();
assert(s2.length === 0, 'solve() found nothing to do when already solved');

// --- Scenario D: step forward replays exactly ---
console.log('Scenario D: step back then step forward reproduces the move');
app.scramble();
const before = readFaceletString(app.cubies);
app.stepBackward();
const mid = readFaceletString(app.cubies);
app.stepForward();
assert(readFaceletString(app.cubies) === before, 'step forward reproduced the stepped-back move');
assert(mid !== before, 'and stepping back actually changed the state');

console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll cursor-model checks passed');
process.exit(fails ? 1 : 0);
