# Thread derived-preview inspector

Actual Chrome source exercise 5.16 created a genuine cosmetic Thread1, but Shape & size displayed an inapplicable `end Condition undefined` fact. The generic fact list only considered extrusion/finish keys and accepted present-but-undefined values.

The canonical derived-preview inspector now gives Thread its relevant persisted Designation, Display, Length (mm), Side, Pitch (mm) and Hand facts. Thread length is stored in internal centimetres and converted to explicitly labelled millimetres for display. Generic primary facts omit undefined/null/empty values; advanced diagnostics omit undefined values. Edit feature in history still opens the same feature definition. No Thread definition, placement, CAD, source geometry or native kernel behavior changed.

Focused inspector tests **6/6 PASS**, including the actual `fillShape` renderer on a selected derived thread, correct 1.5cm→15mm display, cosmetic/modeled values, absent undefined extrusion fields, history edit routing and unchanged authored document. Full gates **686 linked modules /1487 assertions PASS**, no free identifiers; log `scratch/thread-inspector-check-2026-10-11.log`. Owned diff check is clean. Actual browser replay remains parent-owned; source Thread creation acceptance is separate from this presentation fix.
