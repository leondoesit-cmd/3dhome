# Exercise 8.17 assembly — browser progress

Source: printed 8-52 / physical PDF 430. Original designer example; companion CAD/AVI unavailable. The book illustration's ARBOR PRESS title conflicts with the Bench Vice exercise heading. This checkpoint is not final exercise acceptance.

Ten fresh browser-authored definitions form sixteen occurrences. Thirteen rigid locks group feet/fasteners, keeper/jaw, and handle/globes. Native shaft and jaw axes, base datum guidance and a 0–50 mm limit support a free coupled Tr20×4 RH screw joint.

## Verified motion controls

New Screw creation now captures the current component-origin home without first applying the legacy centroid alignment. Pitch and limit values commit on Enter. Drive and coupling changes validate on a clone; failed requests preserve the last valid pose and undo history.

The browser seated the jaw at X0 before recreating Screw4053. Actual Drive−1 produced X4 mm, Drive−12.5 produced X50 mm; Y/Z and all jaw rotation fields remained zero. Drive−13 was rejected, restoring −12.5 and preserving X50. Returning Drive0 then blank saved a free home. Protected actual exports distinguish the earlier incorrect diagnostic zero from the corrected zero.

## Clearance revision

The first complete exact audit found rear foot X146 interfering from 29 mm travel; its keeper screw began interference at 44 mm. The original designer plan was revised to rear foot/bolts/base holes X170. Parent performed these edits through visible Chrome controls, with three rigid locks recaptured and both final-sketch circle centers committed to U170, V±25, diameter6 mm.

The repaired browser export contains sixteen valid native solids. Its independent exact audit found zero positive-volume clashes in all 51 quarter-turn samples from 0–50 mm. The revised base volume remains 198.6971671170941 cm³. Foot contact is nominally 16×70 mm; its outer edge projects 4 mm beyond the base. These checks do not certify strength.

## Current verified checkpoint

Finish component now awaits fresh native regeneration before publishing the component. Browser reopened BV01 in context, finished, and recreated journal4057 against current exact axes. All19 stored mates are active with no issues or unresolved references. Final51-pose clearance audit confirms the revised assembly. Numerical settled:false reports stricter optimization convergence; all engineering mate checks pass, endpoint maximum linear error4.58e-10cm.

Full browser motion Play completed10.00/10.00 seconds. Cancel restored its opening pose, then Drive0 and blank returned a free home. Saved exploded offsets, spanning3.38m, explained the tiny viewport model. Visible Exploded view collapsed the presentation and restored normal rendering; meshes were intact. Latest actual protected export is `BV-assembly-rearfoot170-collapsed-home-browser-2026-10-08.mforge`.

Parent also revised global library BV01 Circle3/4 to U170 through Chrome, saved and exported `BV01-base-rearfoot170-browser-2026-10-08.mforge` and `.step`. Independent verification pending.

## Outstanding acceptance

- Revised global BV01 independent native/STEP consistency audit and cold library verification.
- Proportionate exploded presentation, then exploded-isometric drawing with lines,10BOM rows,16balloons and export/layout QA. First assembled drawing preview confirms automatic10rowBOM/16balloons and correct ANSI A landscape/mm/third-angle settings. Existing long descriptions/materials ellipsize; UI agent investigating readability.
- Saved views/presentation quality review after explosion UI changes.

Use ADVANCE.md for the exact latest browser state. This remains a checkpoint, not final exercise or entire-book acceptance.
