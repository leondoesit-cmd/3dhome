# Exercise 6.3 — fresh conical mounting nut

Source inspected visually before authoring: PDF page 303 / printed 6-35. The exercise asks the reader to measure a physical metric nut; no body dimensions are supplied. The user-approved example uses **17 mm across flats, 8 mm thickness and a Ø10 mm plain bore**. No measured-nut, thread-fit or standard-compliance claim is made.

## Actual Chrome construction

Started from a blank document in desktop Chrome, dark app theme; no previous geometry was loaded. MMGS part. Two Front-plane sketches are fully defined (0 DOF).

1. Origin-centred annulus, outer diameter `19.629909152447276 mm` (`2 × 17 / √3`), bore Ø10 mm; Blind Boss 8 mm.
2. Two-distance chamfer on the front circular stock rim: 2 mm / 1 mm.
3. Two-distance chamfer on the back circular stock rim: 1 mm / 2 mm. Opposite edge orientation reverses the distance ordering; both conical ends have 1 mm radial / 2 mm axial removal.
4. A fresh centred 24×24 mm rectangle surrounding a constrained regular hexagon of the same circumdiameter. Nested-region Through All cut forms the six flats **after** the conical chamfers, preserving curved cone/flat intersections as illustrated.
5. Both bore rims receive 0.5 mm / 45° chamfers.

Seven authored history steps, five features, one solid. Plain Carbon Steel (grade unspecified), app density 7.85 g/cm³. Construction guides and relations remain editable in both sketches.

## Browser acceptance

Save completed cleanly. A clean Chrome reload and Saved models reopen retained seven steps, one solid and both fully defined sketches. Exact measurements were reevaluated after reopening:

| Property | Browser exact result |
|---|---:|
| Volume | 1350.461 mm³ |
| Mass | 10.60112 g |
| Centre of mass | (0, 0, 4) mm |
| Bounds | 19.6299 × 17 × 8 mm |
| Inertia at COM | diag(333.627, 333.627, 557.095) g·mm² |

Driving stock depth **8→8.5 mm** rebuilt the two conical chamfers, hex cut and bore chamfers successfully. Exact edited volume was **1436.332 mm³**, mass **11.27520 g**, COM Z **4.25 mm**. Undo/Redo followed the edit; final Undo restored 8 mm, original exact values and a clean document. No annotated drawing is claimed. Authoring time and click count were not recorded.

The first STEP attempt was a no-op while an older exact job remained queued. After one clean reload/reopen, actual UI Export STEP showed **✓ STEP exported** and produced a **103,707-byte STEP** in Downloads. Its copied artifact is listed below. This is browser export acceptance; independent STEP/BREP replay is not claimed here.

## Concrete UI repair

Undo initially left the open Mass properties card displaying the former 8.5 mm result beside restored 8 mm tree bounds. The model-history restore callback now closes the evaluation card before replacing the document. The existing asynchronous mass result guard also rejects results from the replaced document. A behavioral regression executes the actual history callback and card-closing function for Undo/Redo. Latest Chrome acceptance repeated the 8.5 mm edit, opened exact Mass properties and pressed Undo: the card disappeared, 8 mm bounds and clean header returned. Six focused drawing-history/signed-angle tests and `npm run check` passed (582 modules; 1498 source assertions). Full CI is not claimed.

## Artifacts

- `MOUNTING-NUT-6.3-conical-browser-2026-09-28.mforge` — actual UI bundle after Save/exact evaluation.
- `MOUNTING-NUT-6.3-conical-browser-2026-09-28.step` — actual Chrome STEP export after clean reopen.
- `MOUNTING-NUT-6.3-conical-save-reopen-browser-2026-09-28.png` — reopened geometry/history.
- `MOUNTING-NUT-6.3-conical-reopen-mass-browser-2026-09-28.png` — exact reopened mass/material.
- `MOUNTING-NUT-6.3-conical-upstream-edit-browser-2026-09-28.png` — depth edit and exact downstream result.
- `MOUNTING-NUT-6.3-conical-restored-browser-2026-09-28.png` — original depth/exact mass after Undo/Redo.
- `MOUNTING-NUT-6.3-conical-undo-card-fix-browser-2026-09-28.png` — actual fixed Undo closes stale card.

Earlier conical checkpoint and initial mass screenshot are preserved. The separate `MOUNTING-NUT-6.3-example-*` planar-chamfer variant remains a labeled earlier example; this fresh construction closes its conical workflow fidelity gap. This exercise does not complete the ebook.
