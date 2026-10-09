# Basic Q5 — explicit straight Natural Rib extension

Status: generic capability and disposable source-coordinate reconstruction verified; actual Chrome adoption remains parent-owned. No authored model, browser state, or ADVANCE file was changed by this investigation.

SOLIDWORKS documents Natural Rib as continuation of the contour equation until a body boundary; its Linear option has different behavior. Primary reference: [Rib PropertyManager](https://help.solidworks.com/2019/english/SolidWorks/sldworks/HIDD_FEAT_RIB.htm?format=P&value=). The companion's original growth-selector value has not been decoded, so choosing the app's Natural mode is a disclosed interpretation.

The app now exposes **Guide ends → Natural — straight ends to body** for Parallel to sketch Rib. The default remains **Finite sketch ends**. Native regeneration continues each open end's straight tangent and measures the first body intersection at 33 thickness stations, taking the furthest contact while preserving the measured boundary station. Before accepting that end, native intersections along the complete width partition every material interval, and every interval must lie in the body. Missing or incomplete contact rejects the operation. Linked curved sketches reject Natural until continuation of their actual curve equation is supported; their existing finite behavior remains available.

Two additional in-plane growth choices are **Normal to straight guide — left** and **Normal to straight guide — right**. They derive the normal from the actual selected line, without exercise constants. Ambiguous bends and degenerate guides reject. Cardinal defaults remain unchanged.

Implementation: cad_kernel.js, cad_feature_tree.js, core/rib_profile.js, core/feature_catalog.js, modeler_feature_form.js. The input body and driving sketch are preserved. Existing Blind and finite Rib paths retain their prior behavior.

New native tests in cad_rib_natural_extension.test.mjs prove:

- A short guide reaches a cylindrical contact across its full thickness and produces one valid solid. Bidirectional native subtraction against the analytic cylinder-side contact reference is zero.
- Reversed chain order and an explicit rotated sketch frame produce the same result.
- A tangent pointing away from the body, or a wall wider than the contact, rejects without changing the input.

Two further tests verify the guide normal at 0°, 45°, 48°, and 120°, opposite polarity, ambiguous-guide rejection, and native invariance under rotated sketch frames. The catalog contract test was updated for the new serialized parameter. Combined new and existing Rib tests: 33 passed, zero failures. Raw output: scratch/planchard/rib-natural-focused-tests-2026-10-09.txt.

## Actual Basic Q5 disposable observation

Input: BASIC-Q5-source-finite-rib-diagnostic-browser-2026-10-09.mforge. Only a disposable compiled verification clone received profileExtension=natural; no output model was authored or exported.

The exact original short guide is Right Z=50.8/Y=0 to Z=7.831363998772758/Y=47.72150488810343 mm. The clone rebuilt without issues, one valid native solid, V=483.4622741338602 cm³, COM=(0,18.067605587045932,−22.290741211875726) mm.

This exceeds the finite-guide result (~470.7661 cm³), but does **not** reproduce the long-guide checkpoint V=501.9421365323172 cm³, COM=(0,18.506710,−21.855585) mm. The first endpoint body boundary and the finite long guide's projection beneath the tube produce different spans. Neither is silently declared identical to the source. Source bounded Rib side edges remain needed to resolve that distinction; source aggregate mass/COM are validation evidence only, not construction targets.

Historical evidence: artifacts/planchard/BASIC-Q5-natural-extension-disposable-native-verification-2026-10-09.json. This initial cardinal-growth observation was superseded by the source boundary finding below.

## Source boundary resolution

Independent raw companion point extraction found paired full-width stations at X=±12.7 mm:

- Outer contact: Y=58.24693008072934, Z=−1.64577141262195.
- Inner contact: Y=32.98607393837516, Z=−29.700794379620486.

Both stations have inclined coordinate v=44.3871407126934 mm. Their difference is exactly −N, where N=(0,.669130606358858,.743144825477394). The previous app cardinal Down (−V) is world −Y and therefore cannot represent this source direction.

The ordered source guide has Right tangent (−.6691306064,+.7431448255); its left normal maps to world −N. With the unchanged exact finite source endpoints, **Natural — straight ends to body** plus **Normal to straight guide — left** rebuilt one valid solid without issues: V=502.1831767155926 cm³, COM=(0,18.51309967466808,−21.857927858968065) mm. Source density2.7 gives1355.8945771321g, which rounds to cached1355.895g; COM rounds to source18.513/−21.858mm. These are independent validation observations after the source boundary direction fixed the construction.

Reproducible disposable reader: scratch/planchard/basic5-natural-rib-readonly.mjs. Evidence compares unchanged finite, Natural cardinal, and Natural source-normal cases: artifacts/planchard/BASIC-Q5-natural-source-normal-native-verification-2026-10-09.json. Bounded source point evidence: BASIC-Q5-source-rib-boundary-points-2026-10-09.json. No claim of complete source BREP equality is made.

Exact visible parent recipe: edit Rib1; **Parallel to sketch**; **In-plane growth → Normal to straight guide — left**; **Guide ends → Natural — straight ends to body**; **Both sides**, thickness1in. Use the source short endpoint RightU=.308321417274518in/V=1.878799405043442in, with startU2in/V0.

Final shared-tree gates: no free identifiers; 653 module links; 1489 source assertions passed. Actual Chrome adoption and cold persistence are separate parent acceptance work.
