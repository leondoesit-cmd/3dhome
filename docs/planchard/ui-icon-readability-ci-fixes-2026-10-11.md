# Full-CI UI icon and text-floor repairs

The full objective CI log exposed missing CAD SVGs for Layer analysis and assembly Component Pattern actions. The command icon tests stopped at the first missing key; direct catalog inspection additionally found missing create/edit/remove Component Pattern glyphs. The actual FFF slice ribbon also requested a missing glyph despite not being in that catalog test.

Five distinct native SVG icons now represent geometric layer sections, FFF nozzle/deposition paths, component-pattern creation, editing and removal. Existing command/feature catalog coverage and distinct-icon assertions remain unchanged. A focused additional regression checks all five actual ribbon keys render different genuine SVGs.

The new dependency controls/callouts had two bare11px declarations which bypassed the established responsive text floor. Both now use `max(11px, var(--fs-floor, 0px))`, matching existing classic/desktop/compact behavior without lowering the global floor. The full readability assertions are unchanged.

Independent dependency review also identified an explicit source-plane chain omission. The pure graph now includes actual reference-plane `baseReferenceId` and `support.ownerFeatureId` edges. The regression verifies Top Plane→offset plane6472→collar sketch→Boss, without inventing Origin links or changing CAD. This is a reference-graph follow-up, not authored model editing.

Focused **18/18 PASS**: icons6, readability3, dependency graph/presentation9. Existing all-command distinctness and all-feature icons pass; no assertions were relaxed. Final gates **689 linked modules /1487 assertions PASS**, no free identifiers; log `scratch/ui-icons-readability-final-check-2026-10-11.log`. Owned diff check is clean. No full-CI-green or actual browser-icon acceptance is claimed. Parent owns browser evidence and checkpoint commits; no CAD/model/ADVANCE/Git edits were made here.
