# Sketch deletion and orphan history repair

Actual Chrome exercise 2.2B saved witness contained three surviving sketches,
three native features, and seven history rows. The extra row targeted absent
`sk_32q0d` between Boss 2 and the new Front circle:
`artifacts/planchard/EXERCISE-2.2B-qualified-browser-2026-10-10.mforge`.
The artifact was read only; its contents were not rewritten for this fix.

## Cause and fix

The canonical feature tree supplied the consumed sketch's history index but
omitted its history ID. Deleting a nested sketch therefore entered the legacy
`removeSketch` branch, bypassing `removeHistoryNode` dependency checks and leaving
the sketch history row behind. Nested canonical nodes now carry the actual row
ID, so a sketch consumed by a live cut remains protected with the existing
“is used by” diagnostic. After deleting the cut, its sketch can be deleted normally.

The low-level deletion API also uses guarded history deletion when a row exists
and rejects unrecorded sketch consumers. Failed fallback deletion discards its
Undo entry and displays the dependency message. Active sketch selection remains
valid after successful deletion.

Cold `ensureParametricDocument` already removes absent target rows. Normalization
now adjusts the rollback index for removed rows before its boundary, preventing
orphan cleanup from activating a formerly rolled-back step. It retains live
features and their references to missing sketches: those remain explicit
`missing-sketch-dependency` errors rather than disappearing with the stale row.

## Verification

88 focused tests passed: 51 across the new sketch-deletion tests, feature-manager
tree, finish removal, and Hole Wizard two-sketch editor/history tests; another
37 covered the sketch solver, precise rollback bar, and native tool-owner
dependencies. The new
tests read the actual protected 2.2B fixture, verify cold repair to six rows,
unchanged surviving sketches/features/parts, idempotent reload, dependency
rejection before cut removal, successful deletion afterwards, active sketch and
rollback behavior, and preserved missing-input diagnostics.

`npm run check` passed: no free identifiers, no link errors across 668 modules,
and all 1489 source assertions checked. `git diff --check` passed. Actual cold
Chrome acceptance remains the parent's next check. No full-suite claim is made.

## Parent browser check

Hard-reload current code and reopen the exact saved 2.2B copy. Its history should
contain six rows (three sketches and three features), with no pending absent
Top sketch. Export a new bundle and verify those target IDs. On an independent
copy, deleting the nested Front circle while its cut remains must show the
dependency message without changing the model. Delete the cut first, then the
circle: both rows should disappear, Undo should restore the original model,
and no surviving native feature should be silently deleted.
