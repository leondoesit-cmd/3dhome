# Adding a wall outside an existing room must not move or re-measure the room

Status: plan, not implemented. Written 2026-11-14. No code in this file on purpose.
Follows `WALL_JUNCTIONS_PLAN.md` (already implemented, uncommitted in this tree).

## 1. What happens today (reproduced)

Square room, 400 x 300 on centrelines, 10 cm walls: inside lengths 390 and 290.
Walls are added the way the wall tool adds a corner-to-corner wall
(`js/interaction/mep_tools.js` ~279: set `made.clearL`, then
`preserveClear([made.a, made.b])`).

| Action | Result |
|---|---|
| Wall continuing the top wall outward from a corner | No node moves, but the top wall's inside length now reads **395** instead of 390. |
| Wall going out perpendicular from a corner | The side wall reads **295** instead of 290. |
| Second room attached outside (three walls, closing on the next corner) | **All four corners of the existing room slide 5 cm**, and two of its walls read 395. |

So both of the user's suspicions are partly true: the existing room is slid as
a rigid block (its real lengths survive that moment), and its stated inside
lengths become wrong by half a wall thickness. The wrong reading is the
dangerous part: the stored intent `w.clearL` is still 390, so the next
whole-plan reconcile sees a 5 cm error that is not real and can shrink the
room for real.

## 2. Causes

### Cause A: a straight-through joint measures to the node, not to the face

`faceMeetShift` in `js/wall_junctions.js` (and the old `faceShiftAt` before
it) returns 0 as soon as the wall has a collinear continuation at the node.
That is right for the outline of a split wall, and wrong for the tape measure:
when a third wall stands at that node **on the measured side**, the visible
inside face still stops at that wall's near face. Adding a collinear wall
outside therefore changes the reading of a wall whose inside face did not
change at all.

### Cause B: a new wall's stated length is allowed to push the existing plan

`preserveClear` slides "the smaller side" of a wall whose length is off, and
the wall tool pins only the new wall's two ends. When the wall drawn just
before it needs 5 cm more (its end just became a corner), its own far end is
pinned, so the correction is pushed onto the other side: the whole existing
plan.

## 3. Design

### 3.1 Clear length is measured to the face that stops it (fixes A)

For the **clear length** only (`wallCuts`, `pendingCuts`, and therefore
`wallClearLength` and everything that reads it):

- At a node where the wall runs straight on, look at the other, non-collinear
  arms that are solid at that node.
- An arm standing on the **measured side** stops the face: the cut is the
  distance to that arm's near face line (the same face-line intersection used
  at a corner; oblique arms included; the nearest one wins).
- No arm on the measured side: the cut stays 0 (the face really does run on).
- Centreline measurement (`dimSide` 0) is unchanged.

Do **not** change the measurement outline used for the sheet's dimension
chains (`wallBandOutline(..., measure)` / `context.measure`): there a
through-run must stay continuous. Give the clear length its own entry point
rather than changing `faceMeetShift` for every caller, and check which callers
want which.

**Invariant C:** adding, deleting or changing a wall on the far side of a
node never changes the clear length of a wall whose own measured face did not
change.

### 3.2 Creating a wall never moves a node that already existed (fixes B)

- While a wall is being created, every node that existed before the current
  draw run is pinned. Only nodes created in this draw run may move
  (`S.drawWalls` holds the run's walls; a node counts as new when only walls of
  this run use it).
- If a new wall's stated length cannot be met by moving new nodes alone
  (it closes onto existing corners, or both ends are old), its `clearL` is
  re-read from the geometry: it becomes a derived length. The existing plan is
  not touched.
- Apply the same rule to every other path that creates walls and then calls
  `preserveClear` or a solver with whole-plan scope: the rectangle and room
  tools in `js/interaction/room_tools.js`, wall creation in
  `js/interaction/wall_edit.js`, and anything found by searching for
  `preserveClear(`, `settleWallDim(` and `solveWallCons(` after a wall is
  created. List what was checked.

**Invariant D:** after any wall-creation action, every node that existed
before it has exactly the same coordinates, and every existing wall has the
same clear length, unless the new wall splits that wall.

### 3.3 Saved projects

`w.clearL` values stored under the old rule are up to half a thickness off at
T-junctions. If they are kept, the first whole-plan reconcile after loading
would move walls to "repair" them.

- Stamp the document with the measuring rule version.
- On loading a document without the current stamp, re-read every wall's
  `clearL` (and its lock, `captureLock`) from the geometry as it is, then stamp
  it. Geometry is the truth; nothing moves on load.
- Find where documents are loaded/normalised and where `syncClears` runs, and
  put it there. Undo/redo snapshots within a session must not trigger it.

## 4. Steps

1. **Tests first** (new `tests/wall_add_no_shift.test.mjs`, behaviour only,
   built like `tests/wall_junction_rules.test.mjs`, which imports `S` and the
   modules directly):
   - the three rows of the table in section 1, asserting Invariants C and D
     (readings stay 390 / 290, no existing node moves);
   - a partition T on the room side of a long wall: each half reads to the
     partition's near face; a T on the far side: reading unchanged;
   - an oblique outside wall from a corner: nothing existing changes;
   - a drawn chain where a later wall turns the previous wall's end into a
     corner: the new nodes move, the old ones do not;
   - a wall closing between two existing corners: its `clearL` equals its
     measured clear length afterwards and nothing moved;
   - loading an unstamped document with stale `clearL` at a T: no node moves,
     `clearL` equals the measured value, the stamp is set; loading a stamped
     one leaves `clearL` alone.
   Confirm the first group fails before the fix.
2. Implement 3.1, then 3.2, then 3.3, running `npm run check` and
   `npm run test:changed` after each.
3. Existing tests that pin the old reading at a straight-through joint with an
   arm on the measured side (likely in `tests/wall_mitre.test.mjs`,
   `tests/wall_dimension_edit.test.mjs`, `tests/wall_location_line.test.mjs`,
   room clear-size tests): change only those assertions, and list each with
   the old and new number. Anything else that fails is a regression to fix,
   not an assertion to edit.
4. Finish: `npm run check`, then the full suite once with `npm run test:quiet`
   in the background.

## 5. Constraints

- No commit, no push, no stash, no branch switch. Leave `.ses`,
  `BUGS_TO_FIX.md`, `perf-shots/` and both plan files alone.
- The tree already holds the uncommitted junction work
  (`js/wall_junctions.js`, `js/wall_ink.js`, `js/plan2d/wall_ink_draw.js` and
  the files they touch). Build on it; do not revert it.
- `AGENTS.md` rules: size gate (never raise a limit or add a baseline entry;
  `js/geometry.js`, `js/interaction.js`, `js/plan2d.js` are frozen and may only
  shrink), codemods for moves, behaviour tests, new files into
  `survey-assets.json`, do not read big files whole.
- Not in scope: changing how `preserveClear` behaves for inspector edits
  (typed length, thickness, angle), room rectangle constraints, new UI.

## 6. Report expected

- Files added and changed.
- Each wall-creation path checked for 3.2, and what was done at each.
- Where the load-time re-read (3.3) lives and what triggers it.
- Every existing assertion changed, with old and new values and the reason.
- Output of `npm run check` and of the test runs, failures quoted in full.
- Deviations from this plan, and what is unverified (the on-screen behaviour
  of the wall tool is checked afterwards by the main session).
