# BATTERYPLATE rollback insertion fix and continued browser review

Date: 2026-09-16

## Fixed

Fillet and chamfer creation while rolled back now inserts the feature at the active history position and advances the rollback bar over it. Later operations consuming the same body are reconnected to the inserted finish. Explicit sketch-support references and pattern seeds are retained.

The viewport now walks feature history order when selecting the final body. Previously an inserted finish stored at the end of the features array could hide the later holes and Holder even after rolling forward.

Files:
- js/core/parametric_document.js
- js/modeler.js
- tests/finish_rollback_insertion.test.mjs
- tests/rollback_display_head.test.mjs

## Browser result

Saved record: `BATTERYPLATE - repaired support`.

1. Rolled back after Top Cut, selected the inner wall / top rim / outer wall, and committed Full Round.
2. Renamed the inserted step `TopFillet` (step 6).
3. Released rollback to the end. Rebuild succeeded with one solid. Top view showed both through holes; Holder remained present.
4. Saved, reloaded the page and reopened the saved record; exact rebuild succeeded.
5. Continued ebook PDF page 252 / printed 5-34, steps 241–253. Created multiple-radius `HolderFillet`:
   - Holder outside base edge: 0.1524 cm (0.060 in).
   - Holder inside base edge: 0.127 cm (0.050 in).
   - Pocket-floor inner tangent edge: 0.1016 cm (0.040 in).
6. Committed, renamed and saved HolderFillet (step 13).
7. Reloaded and reopened the saved record again. Both named fillets persisted; exact rebuild succeeded with one solid. Top view confirmed both holes remain open and the Holder fillets are visible.

Validation: 33 focused tests passed; npm run check passed (504 modules, 1,449 source assertions); git diff --check passed. Full suite was not run.

## Next gap: moving a finish across body features

Ebook PDF page 253 / printed 5-35, steps 254–255 asks to drag TopFillet directly above HolderFillet, after the holes and Holder.

Browser attempts: two drags from the TopFillet row to the top half of HolderFillet left the history unchanged. The row has draggable=true. No specific rejection message was captured; browser drag delivery may also need investigation.

Independent code reproduction confirms a functional limitation: reorderHistoryNode only moves a history entry and validates dependencies. It does not reconnect the body chain. Moving a finish after an operation that consumes it returns future-feature-dependency. This is appropriate protection, but it cannot perform the ebook's supported finish reorder.

Next coder work:
- Make finishing-feature reorder transactional: reconnect the vacated body chain, insert the finish after the new predecessor, and update the next body consumer.
- Rebind persistent selections against verified exact geometry at the destination; refuse absent/ambiguous geometry without changing the document.
- Validate an exact full rebuild, including holes and Holder, before accepting the move. Cover Undo/Redo and save/reopen.
- Verify drag/drop delivery and make rejection feedback visible; preserve the last valid document.

Stopped before changing this newly discovered functionality, per the user's original workflow-review instruction. The working 13-step model is saved and retained in the browser. Folder grouping (steps 256–262) remains untested because the preceding reorder is incomplete.
