/**
 * tools/verify.js
 * ----------------
 * Proves that the cube-core geometry inlined in index.html exactly matches
 * cubejs's model, by:
 *   1. extracting the code between the  CUBE:START / CUBE:END  sentinels in
 *      index.html,
 *   2. evaluating it in a fresh VM context (it has no DOM/Three.js deps),
 *   3. comparing `readFaceletString()` output to `Cube.fromString/asString`,
 *      and running full solve round-trips through cubejs.
 *
 * Run:  node tools/verify.js   (from the project root)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Extract the inlined core.
const start = html.indexOf('// === CUBE:START ===');
const end = html.indexOf('// === CUBE:END ===');
if (start < 0 || end < 0) { console.error('Could not find CUBE:START / CUBE:END sentinels in index.html'); process.exit(1); }
let core = html.slice(start + '// === CUBE:START ==='.length, end);
// The core ends with a "CUBE:END" comment line we must strip; keep the code only.
core = core.replace(/\/\/\s*===\s*CUBE:END\s*===.*$/s, '');

// Build a Node VM context that mimics the browser global. We deliberately do NOT
// provide `module`/`exports`, so cubejs takes its *browser* branch (`this.Cube =`)
// and both lib scripts attach to the same global — exactly like a <script> tag.
const sandbox = { console, setTimeout, Math, Array, Object, String, Number, JSON, Symbol, Promise, Set, Map };
sandbox.self = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
// Load the raw IIFE files; each attaches to the global `this` (= sandbox).
const cubejsDir = path.join(__dirname, '..', 'node_modules', 'cubejs');
const cubeFile = path.join(cubejsDir, 'lib', 'cube.js');
const solveFile = path.join(cubejsDir, 'lib', 'solve.js');
if (!fs.existsSync(cubeFile)) {
  console.error('cubejs not found in node_modules — run `npm i cubejs` first.');
  process.exit(1);
}
vm.runInContext(fs.readFileSync(cubeFile, 'utf8'), sandbox, { filename: 'cube.js' });
vm.runInContext(fs.readFileSync(solveFile, 'utf8'), sandbox, { filename: 'solve.js' });
vm.runInContext(core, sandbox, { filename: 'cube-core' });

const Cube = sandbox.Cube;
const Core = sandbox.CubeCore;
const buildCubies = Core && Core.buildCubies;
const applyMove = Core && Core.applyMove;
const parseAlg = Core && Core.parseAlg;
const readFaceletString = Core && Core.readFaceletString;
const isSolved = Core && Core.isSolved;
// applyAlg is no longer part of the core (it was a one-shot wrapper left over
// from the removed load-scramble-file feature); apply a whole sequence with the
// two primitives the live app actually uses: parseAlg + applyMove.
const applyAlg = (cubies, alg) => { for (const { face, power } of parseAlg(alg)) applyMove(cubies, face, power); };
if (!buildCubies || !applyMove || !parseAlg || !readFaceletString || !Cube) { console.error('Failed to evaluate core / load cubejs'); process.exit(1); }

const FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
const MODS = ['', '2', "'"];
let fails = 0;
const assert = (cond, msg) => { if (!cond) { fails++; console.log('  ✗ FAIL:', msg); } };

// --- Test 1: every single move ---
console.log('Test 1: all 18 moves match cubejs');
for (const f of FACES) for (const mod of MODS) {
  const token = f + mod;
  const cj = new Cube(); cj.move(token);
  const cubies = buildCubies(); applyMove(cubies, f, mod === '2' ? 1 : (mod === "'" ? 2 : 0));
  const mine = readFaceletString(cubies);
  assert(mine === cj.asString(), `${token}: model=${mine} cubejs=${cj.asString()}`);
}
assert(isSolved(buildCubies()) === true, 'identity model reads as solved');

// --- Test 2: long random sequence accumulation ---
console.log('Test 2: 300-move random sequence matches cubejs');
{
  const seq = []; let last = null;
  for (let i = 0; i < 300; i++) { let f; do { f = FACES[(Math.random()*6)|0]; } while (f === last); last = f; seq.push(f + MODS[(Math.random()*3)|0]); }
  const cj = new Cube(); cj.move(seq.join(' '));
  const cubies = buildCubies(); applyAlg(cubies, seq.join(' '));
  const mine = readFaceletString(cubies);
  assert(mine === cj.asString(), '300-move model diverged from cubejs');
}

// --- Test 3: solve round-trip via cubejs (model <-> cubejs) ---
console.log('Test 3: solve round-trip through cubejs (model <-> solver)');
Cube.initSolver();
for (let trial = 0; trial < 5; trial++) {
  const cubies = buildCubies();
  const cj = new Cube().randomize();
  const sol = cj.solve();
  cj.move(sol);
  assert(cj.isSolved() === true, `cubejs solve not solved (trial ${trial})`);
  // Model side: start from the cubejs state, apply the same solution in the model.
  const modelCubies = buildCubies();
  // Reconstruct the model to match `cj`'s initial state by applying the inverse of the scramble is
  // not directly available; instead apply the solution and confirm the *cubejs* round-trip plus a
  // model solve-consistency: from the model's current (solved) state apply solution then inverse.
  const before = readFaceletString(modelCubies); // solved
  applyAlg(modelCubies, sol);
  const afterSol = readFaceletString(modelCubies);
  // after applying solution `sol` to a solved cube, the model should equal the cubejs state of
  // (solved + sol) === cj's state right before it was solved. We can't compare to `cj` (already
  // solved), so instead verify the model's own consistency: Cube.fromString(afterSol) solved by
  // Cube.inverse(sol) returns to `before`.
  const cj2 = Cube.fromString(afterSol);
  cj2.move(Cube.inverse(sol));
  assert(cj2.asString() === before, 'model solve round-trip inconsistent');
}

console.log(fails ? `\n${fails} test(s) FAILED` : 'ALL TESTS PASSED ✔');
process.exit(fails ? 1 : 0);
