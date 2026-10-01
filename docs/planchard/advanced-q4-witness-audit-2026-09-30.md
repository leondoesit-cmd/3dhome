# Advanced Question 4 — source witnesses and browser trials

Source: PDF page 508. Main renders are `scratch/planchard/advanced-q4-detail-508.png` and `advanced-q4-witnesses-detail.png`. The sharper ear detail is `advanced-q4-rear-ear-witnesses.png` (600 dpi).

## Acceptance status

**Unfinished source interpretation trial.** Native rebuild success establishes that the current geometry is a valid solid; it does not establish agreement with the book. No final volume, mass or centre-of-mass match is claimed. The printed answers have not been used to choose or tune dimensions.

The stock's profile and extrusion axes still need resolution. The current candidate has a 140 mm profile base, an 83 mm inclined leg and a 90 mm symmetric extrusion. The D head has its bore centre 51 mm from its foot and an R32 crown. Rectangular stock corners remain behind that rounded head, which must be reconciled with the printed final geometry and feature sequence.

A later independent reread identifies the 90 witness along the inclined side, distinct from the 64 mm base-width projection, and the 51 witness along the head's long direction. This reopens the alternative interpretation of a 64 mm base / 90 mm inclined profile extruded 140 mm, with the D head's long axis along the extrusion. That alternative also leaves a stock silhouette issue unless a subsequent cut trims the supporting sheet. Neither frame is certified yet.

## Protected interpretation trials

- The original parent-agent six-step trial used a 140 mm profile base, 90 mm inclined leg and 64 mm extrusion. It remains a separate, unaccepted trial.
- A genuinely blank Chrome model used a 64 mm profile base, 90 mm inclined leg and 140 mm symmetric extrusion. Its fully defined open two-line sketch and 6 mm Other-side Thin feature passed native regeneration. Protected bundle: `artifacts/planchard/ADVANCED-Q4-alternative-stock-axis-trial-browser-2026-09-30.mforge` (41,597 bytes).
- The current Library record, **Planchard Advanced Q4 - transverse 90 fresh print trial 2026-09-30**, was corrected through normal point-coordinate forms to a 140 mm base, 83 mm inclined leg and 90 mm symmetric extrusion. The original point and line IDs were retained. Native stock bounds were 90 × 71.880109 × 140 mm.

The stock sketch is `sk_04foq`: points 2124 = (−41.5, 71.880109) mm, 2125 = (0, 0), and 2128 = (−140, 0), with line IDs 2126 and 2129. It is fully defined.

## Slab and groove correction

The enlarged source identifies **18 mm as total inclined slab thickness**, **22 mm as upper groove width**, **42 mm as widened mouth width**, and **6 mm as groove depth**. The earlier 22 mm slab / 11 mm groove interpretation is retracted. Its exported six-step bundle, `ADVANCED-Q4-source-stock-two-bosses-browser-2026-09-30.mforge`, is retained solely as an earlier interpretation checkpoint.

In the current candidate:

- A fully defined 64 × 140 mm rectangle on the stock's upper horizontal face is extruded 13 mm above the 6 mm stock, giving a 19 mm platform.
- A four-entity D profile on the outward inclined native face has a 51 mm centre distance from its foot and an R32 crown. Its 12 mm added boss over 6 mm stock gives an 18 mm slab. The remaining displayed arc-end numerical deviation is 0.001735 mm; no exact mass claim is based on it.
- A six-line groove sketch was drawn on the actual native boss end face. Ordinary coordinate forms fully defined its six shared points with ten constraints. The 42 mm mouth narrows to 22 mm; each 10 mm side expansion spans a longitudinal run of 17.320508 mm, giving the printed 30-degree flare. The cutting sketch extends beyond the crown to open the groove.
- A blind 6 mm reverse cut passed native regeneration as one body and eight history entries.

The first groove attempt was lost when Chrome tab 820 disappeared before Save. It was recreated through the same visible controls in tab 828. Save and ordinary Project bundle export succeeded:

- `ADVANCED-Q4-corrected-18mm-slab-browser-2026-09-30.mforge`: 260,569 bytes, six entries.
- `ADVANCED-Q4-groove-checkpoint-browser-2026-09-30.mforge`: 403,614 bytes, eight entries.

Screenshots are protected beside these bundles. Read-only inspection confirms feature depths of 90 mm, 13 mm, 12 mm and 6 mm respectively.

## Rear ear witnesses

The sharper crop resolves the 3 mm witness: the outside circular R19 cap is 3 mm proud of its lower rectangular foot. A second agent independently agrees. Thus each outside recess leaves a **16 mm foot below a 19 mm circular crown**. There is no witness for recessing both sides to 13 mm.

The lower 32 mm dimension runs transversely, parallel to the 64 mm platform width, locating the ear axis at half width. The 19 / 29 / 19 mm chain gives ear thickness, clear gap and second-ear thickness longitudinally. With a 17 mm rear setback on the 140 mm base, the front ear starts 56 mm from the front datum. The bore centre is 25 mm above the 19 mm platform, giving Y = 44 mm in this candidate's frame.

A new Front-plane D profile was drawn with a 38 mm stem from Y = 19 mm to Y = 44 mm and an R19 semicircular crown. Shared endpoints were merged through the ordinary repair control. Three point-coordinate forms and a horizontal centre-to-arc-end relation fully defined it. Offset −56 mm and a 19 mm reverse boss passed native regeneration as one body and ten entries.

The bore is a fully defined circle at X = 0, Y = 44 mm, on Front offset −56 mm. The first inline dimension edit failed to reach its stored driving constraint, leaving a 20 mm bore. Read-only inspection of the exported bundle detected this. Normal keyboard selection, typing and blur corrected the driving value to 1.9 cm. The reverse through-all native cut then passed, with twelve entries and one body.

Protected corrected bundle: `artifacts/planchard/ADVANCED-Q4-first-ear-bore19-browser-2026-09-30.mforge` (729,055 bytes). Its actual circle radius is 0.95 cm. The earlier `first-ear-bore` bundle is a superseded 20 mm trial.

## Reference plane and remaining work

An **Ear midpoint** reference plane was created from Front Plane at −89.5 mm. The protected twelve-entry trial plus this plane is `artifacts/planchard/ADVANCED-Q4-ear-midpoint-unaccepted-browser-2026-09-30.mforge` (729,411 bytes). Its plane ID is `plane_2210`, origin (0, 0, −8.95) cm, normal +Z.

The Mirror dialog accepts a single feature seed. The book's one Mirror needs the ear boss and preceding bore cut together; multiple feature seeds are an identified application gap under investigation. The pending mirror was cancelled and the reference-plane checkpoint saved.

Remaining work: resolve the stock frame and silhouette, mirror the ear and bore, add the two outside foot recesses, inclined bore and counterbore, two foot holes, material, full native validation, final mass/COM comparison, STEP export and cold reopen. All browser geometry has been authored with ordinary visible controls.

## Multiple-feature Mirror workflow repair

The ordinary Mirror form now provides a checkbox collector for multiple source features. In the protected trial, Boss 4 and Cut 2 were selected together and mirrored across the named Ear midpoint datum. The command created one Mirror history feature, native rebuild succeeded with one body, and Save completed. Reopening the Mirror editor retained both checked features and the named datum.

The mixed operation mirrors the additive delta, merges it onto the current body, then reflects and subtracts the cutting tools in history order. A regression verifies volume after an upstream pad-width edit and requires native STEP export tolerance validation. Unrelated source bodies and missing seeds are rejected. Existing single-feature lowering remains unchanged.

Proof: `artifacts/planchard/ADVANCED-Q4-multi-feature-mirror-editor-browser-2026-09-30.png` and `ADVANCED-Q4-multi-feature-mirror-unaccepted-browser-2026-09-30.mforge` (1,126,645 bytes). This proves the Mirror workflow, not the unresolved stock orientation or a final book mass match.
