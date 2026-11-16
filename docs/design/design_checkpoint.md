# Design Checkpoints — Cutie (3D Rubik's Cube)

Running log of implementation steps / bugfixes so work can be resumed after an
interrupted session or a context clear. Each checkpoint has a title and a
`STATUS`: `open` → `work-in-progress` → `complete`.

---

## Checkpoint 1 — Fix the face-button double-click timing bug

**STATUS: complete**

### What's wrong
The six face buttons at the bottom-left of the UI turn a cube layer. A single
click = 90°, Shift+click = prime (270°), and a **double-click is supposed to be a
half-turn (180°)**. The double-click does not work reliably.

Root cause (investigated): the buttons rely on the browser's native `dblclick`
event *plus* a deferred single-click timer. Probing the real headless environment
revealed:

- The native `dblclick` event **does fire reliably**, and it is a perfect
  distinguisher: `.dblclick()` → 1 `dblclick` event, but two separate
  `.click()`s → **0** `dblclick` events. So the framework's `dblclick` is NOT
  the problem — the problem is how the buttons *use* it.
- The committed code (c05c7d8) fired the 90° move **immediately** on `click`
  with no deferral: `click` → `userTurn(f, 0)` starts a 90° and sets
  `state.busy=true`. On a genuine double-click the follow-up `click#2` and the
  `dblclick`'s `userTurn(f,1)` (180°) are then **dropped by userTurn's
  busy-guard**, so every "double" was actually one 90° and two doubles = 180°
  ≠ solved. (Confirmed: one `.dblclick()` records exactly 1 move; two leave the
  cube unsolved.)

### Plan
1. **Keep the native `dblclick` event as the single source of truth for the
   180° half-turn** (the user asked to make the native dblclick work if
   possible). It reliably distinguishes a genuine double-click from two
   separate clicks, so it cannot be spoofed by a lone single-click debounce.
2. **Eliminate the timer race.** On each `click` with `e.detail === 1`, arm a
   deferred single-click timer (90° / prime). Guard the 2nd click of a double
   with `if (e.detail > 1) return` so it never re-arms. The `dblclick` handler
   `clearTimeout`s the pending single and performs the 180° — and because a
   real double's `dblclick` arrives almost immediately (measured < 1ms) it always
   wins the race; the 90° timer only ever fires for a *lone* click.
3. **Make the single-click deferral robust**: keep deferring the 90° so we never
   start a quarter-turn that has to be reversed into a half-turn; the 180°
   cancels it cleanly.
4. Preserve all existing behavior: Shift-priming (U'), the pressed/depressed
   visual + `U2`/`U'` label previews, and Meta/Cmd being ignored.

### Verification
`node tools/press-test.js` prints `ALL PASS` (18/18), including:
- `double-click U x2 returns to solved (180° each)` → `after1=false after2=true`
  (the previously failing case: two 180° half-turns bring the cube back to solved)
- `four single U clicks return to solved (90° each)` → `solved=true` (stays passing)
- `single-click defers: no animation during debounce window` → `busyEarly=false`

`node tools/verify.js` still prints `ALL TESTS PASSED ✔` (cube core untouched).

### Outcome
Replaced the old fire-immediately click handler (which started a 90° on the
first click of a double and dropped the 180° via the busy-guard) with a
race-free scheme: lone clicks defer a 90°/prime behind `DBLCLICK_MS` and the
native `dblclick` cancels that timer to perform the clean 180° half-turn. Two
separate clicks never fire `dblclick`, so they collapse into a single deferred
90°; a genuine `.dblclick()` fires `dblclick` and yields a 180°.
