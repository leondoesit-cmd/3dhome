# Exercise 8.17 — browser checkpoint

Stopping location: printed page **8-52**, PDF page **430** of Engineering Graphics with SOLIDWORKS 2021. Exercise 8.16 is complete in commit `12c88eb`. Exercise 8.17 and the remaining book are unfinished.

## Browser-authored work

BV01 was created from a blank part through native desktop Chrome UI, in millimeters, named `Planchard 8.17 - BV01 Base - fresh designer example 2026-10-03`, library key `cm_musrulf4`.

Completed features: 176 × 70 × 12 mm bed; merged front pedestal and fixed jaw; through-bed slide slot; Right datum journal bore Ø20.2 mm centered Y34/Z0 with a 16 mm blind cut; Top datum retention bore Ø6 mm centered X8/Z0 at Y44 with a 14 mm blind cut. Native UI reported one solid and bounds 176 × 66 × 70 mm. Circle sketches have driving diameters and fixed centers.

The actual Chrome project download is preserved as `artifacts/planchard/BV01-base-retention-checkpoint-browser-2026-10-03.mforge`. This export precedes removal of an unused empty Right sketch and whole-body Alloy Steel assignment. Those later changes were saved to the browser library before reload; the UI confirmed density 7.70 g/cm³ and a clean save button. The preserved export remains a recovery checkpoint, not a finished base.

Remaining BV01 work: Ø4.2 mm nose passage at X8/Z0, Y42.2..44; four Ø6 mm blind foot holes at X30/146, Z±25, Y0..4; source properties, final exports, cold reopen and native acceptance audit. Then build the other nine fresh definitions and the sixteen-occurrence vice assembly according to `bench-vice-8.17-design.md`.

## App repairs included with this checkpoint

- Dimensioned circle UI with exact plane-local center, driving diameter and optional fixed center.
- Screw mate handedness control preserving captured zero, phase and winding.
- Previous complete GPU geometry retained during same-document exact rebuild, explicitly labeled and excluded from geometry picking; model/export caches remain invalidated.
- Start-sketch coach caption names the actual remembered datum used by its action.

Fifteen focused regression tests passed. Module, export-link and source-assertion gates were run for this commit. Browser acceptance of the new controls remains pending: desktop input was stopped twice because Computer Use could not verify the browser URL with sufficient confidence. No scripted model generation was substituted.

## Resume and tabs

Resume by opening the saved BV01 library entry in Chrome at `http://localhost:8765/`. Completed radial-engine work and its protected exports do not depend on open tabs. The saved BV01 checkpoint also survives closing its CAD tab; retain the browser profile/site storage, or use the protected recovery bundle. Unrelated tabs and their unsaved work have not been audited.

Standing scope remains the entire ebook from blank models, human-like desktop Chrome interactions, fixes as encountered, and continuation toward the user's 3–2% remaining-usage target. This checkpoint records a tool-enforced interruption rather than completion of that scope.
