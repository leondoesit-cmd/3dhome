# Save command accessible name and aligned Break independent audit

## Concrete accessible-name correction

The visible command switches between “Save” for parts and “Save assembly” for
assemblies. Previously `syncDirty` always overwrote its accessible name with
“Save” plus changing dirty-state and shortcut text. Thus assembly naming did
not match visible text, and an exact command lookup changed with every dirty
transition. This is a source-confirmed mismatch, not a claim about all browser
automation/extension timeouts.

The scoped `modeler_save_button.js` helper keeps the accessible name identical
to the visible action, preserves the existing dirty class and contextual
tooltip, and leaves `aria-describedby` pointing at the live draft/status text.
Save behavior, storage transactions, keyboard shortcut and CAD are unchanged.

42 focused UI tests PASS. The actual `syncDirty` handler harness verifies Part
and Assembly dirty/clean transitions, stable names, preserved described status
and shortcut, dirty classes and status updates. Two old source-format assertions
were removed from the broader Apply/Cancel test in favor of this behavioral
coverage. Full `npm run check` PASS: no free identifiers, 672-module graph,
1487 assertions. Actual Chrome semantic acceptance remains parent's task.

## Independent aligned Break review

Read-only review of the separate aligned Break files and source report.
Existing nine focused tests PASS; physical X/Y propagation, Back reversal,
true dimensions, end-on projections, asymmetric silhouettes, fixed scale and
configuration checks are meaningful. Aligned propagation is qualified as a
workflow extension: supplied PDF 111/2-25 and 494/10-14 illustrate single-view
Breaks, not a dimensioned publisher exercise for the new aligned cluster.

Concrete additional bug reproduced independently with the actual normalized
host contract `host.doc:()=>ensureSheetDoc(def)`. First horizontal Break on
ordinary principal Front with Top/Right produced no undo/mutation and the
incorrect message “Start an aligned Break on the principal Front view”.
`ensureSheetDoc` replaces view records, while `alignedBreakPlan` compared
selected/principal object identity after scene normalization. Same persistent
view ID was falsely rejected. Sent to the implementation owner for an ID-based
comparison/reacquisition and normalized-host regression. No aligned files were
edited by this reviewer. The owner changed principal selection to persistent
IDs, captured old group before Undo and reacquired live views afterwards. The
new normalized-host regression covers horizontal apply, vertical replacement,
Right-member removal, Undo/history restore and cold SVG. Independent final
rerun: **10/10 aligned Break tests PASS**. Actual browser acceptance remains
parent's task.

The initial concern about looping captured `doc.views` after Undo alone was
not reproduced: normal sheet normalization preserves the drawing object and
replaces its view array. The confirmed defect is selected view identity.
