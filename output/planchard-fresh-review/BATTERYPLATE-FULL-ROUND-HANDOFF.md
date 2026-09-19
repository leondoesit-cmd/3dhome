# BATTERYPLATE Full Round browser blocker

## Scope and retained state

Saved model: `BATTERYPLATE - repaired support`, localhost:8765. The saved baseline has 11 steps, both holes and the drafted Holder, and no old top rim fillet. No application code changed during this continuation. No new fillet was committed or saved.

The retained browser is rolled back immediately after `Extrude Cut 1` (Top Cut), with the Full Round form open and three face selections for inspection. The saved baseline is intact.

## Ebook target

Planchard Engineering Graphics with SOLIDWORKS 2021, PDF page 251 / printed 5-33, steps 224–236: roll back below Top Cut, select the inside wall, top rim center face and outside wall for Full Round, commit as TopFillet; then restore downstream history.

## Browser observations

- `Rollback to here` places the bar BEFORE the selected row. Selecting it on the next `Face sketch` row retains Top Cut and correctly shows the pocket without the downstream holes/Holder, with Rebuild succeeded.
- Fillet exposes `Full round — side, center, side`.
- Selecting visible inner wall and narrow top rim produces `Side face 1` and `Center face` chips. Zooming in makes the rim easier to pick.
- After orbiting and selecting an outer wall, the form shows `3 faces selected`, including `Side face 2`.
- Preview remains unavailable and Finish command remains disabled.
- Browser warning: `exact feature preview failed: Both side faces must border the center face`.
- Retrying the other visible outer wall gives the same warning. Earlier attempts at smaller zoom also failed.

This reproduces a blocked user workflow, but does NOT prove a kernel geometry defect: picking, face identity/ownership, selection order or actual adjacency may be responsible. The three selection chips expose only their roles, without enough identity or adjacency feedback to resolve the problem from the UI. The meaningful rejection reason appears only in the browser console.

## Code pointers for investigation

- js/modeler.js: toggleFullRoundFace around line 8087 and refreshFinishEdges around line 8371 preserve the ordered face list and display role chips.
- js/modeler.js: finishFeatureTargets around line 8464 passes full-round face references.
- js/cad_kernel.js: fullRoundFilletDefinition around line 1173 resolves face IDs against brep.subshapes and uses edgeOnAnyFace to find shared boundaries. The observed rejection is the `!first.length || !second.length` check.
- Full Round currently requires three planar faces and one pair of parallel straight boundaries; its suitability for the drafted rounded BATTERYPLATE rim needs exact testing.

## Requested coder checks

1. Expose or log the three picked persistent IDs, owner feature IDs and surface descriptors, plus the active BREP/body-history head.
2. Verify that visible inner-wall/top-rim/outer-wall picks resolve to those actual faces on the SAME post-Top-Cut body, rather than stale predecessor geometry.
3. Verify adjacency against exact subshapes and whether the center rim is one face or split.
4. Put the actual rejection reason in the form and highlight the nonadjacent pair. Preserve explicit side1/center/side2 selection roles when repicking.
5. Once the intended adjacent faces are confirmed, reproduce the book's full-round result across the rim, then restore holes and Holder and test save/reopen.

## Separate rollback diagnostic observation

Rolling back BEFORE Top Cut temporarily reported two `Face sketch is attached to a missing feature` errors for later sketches. Moving the rollback boundary AFTER Top Cut cleared them. Check whether rolled-back sketches should be excluded from active support validation; this is separate from the Full Round failure.
