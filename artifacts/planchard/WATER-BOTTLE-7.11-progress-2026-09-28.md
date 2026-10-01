# Exercise 7.11 water bottle — fresh Chrome checkpoint

This is a progress record, not completed exercise acceptance. Source: supplied PDF page 375 (printed 7-67), visually inspected via `scratch/planchard/pdf-page-375.png`.

## Browser-authored geometry

Started from a new blank document in desktop Chrome with the dark app theme. Library name: **Planchard Exercise 7.11 - water bottle - fresh 2026-09-28**.

- Fully defined six-line Front profile, 360° Y-axis Revolve.
- Printed Ø4.00 in body, Ø1.50 in neck, 8.00 in overall height, .75 in neck height, 105° shoulder included angle. The driving sketch uses the supplementary 75° acute angle.
- Derived shoulder elevation 6.91506350946 in and sloping edge length 1.29409522551 in follow the printed sizes and angle.
- Inside open-neck Shell, chosen .060 in wall; three external circular edge fillets, chosen R.030 in.
- PBT General Purpose reference assigned and saved. Its 1.31 g/cm³ density is a representative grade reference, not a claimed exact SOLIDWORKS library density.

Four authored steps, one solid. Save completed clean after assigning PBT. Latest library record includes material; the protected four-step bundle below predates material assignment.

## Protected evidence

- `WATER-BOTTLE-7.11-shell-face-browser-checkpoint-2026-09-28.mforge`: actual three-step Chrome export.
- `WATER-BOTTLE-7.11-four-step-browser-checkpoint-2026-09-28.mforge`: actual four-step Chrome export, 82,635,845 bytes.
- Read-only native replay of the four-step browser bundle: no issues, valid export BREP, volume **109.612343366582 cm³**, COM approximately **(0,9.058288362361,0) cm**, bounds **Ø10.16 ×20.32 cm** (kernel tolerance about 1e-7 cm).

## Remaining acceptance

The printed variable helix and threaded neck are not yet authored. Required rows are pitch .1875 in with revolution/diameter pairs (0,1.3), (.25,1.5), (2.25,1.5), (2.5,1.3); reverse direction, start angle 0°, clockwise. Thread cross-section and wall are estimates permitted by the exercise.

Latest source repairs preserve identical native upstream topology when a downstream preview publishes only a partial exact result. Browser reload to validate that repair closed Chrome; CUA reported no browsers and the Chrome process inventory was empty. Current saved library and exported checkpoints are protected. No final STEP, final threaded screenshot, canonical reopen, or upstream edit/Undo acceptance is claimed yet.

## Continued fresh Chrome authoring (2026-09-28)

Reopened the explicitly named fresh browser-built canonical record in desktop Chrome tab 710851383. Chosen wall changed to .125 in to embed the thread run-in/run-out. Added a Top-parent datum at Y7.9 in and a fully defined origin-centered Ø1.3 in circle (diameter plus fixed center). Added the four printed variable helix rows, pitch .1875 in, revolution/diameter 0/1.3, .25/1.5, 2.25/1.5, 2.5/1.3; reverse direction, right hand/clockwise, start 0°. Linked Circular Profile Sweep Ø.0625 in is a labeled estimated thread profile.

The first UI sweep exposed a real Merge result gap: the circular-helix branch created a separate body despite Add material and Merge result. Protected seven-step gap bundle: `WATER-BOTTLE-7.11-thread-merge-gap-browser-checkpoint-2026-09-28.mforge` (94,189,506 bytes). Exact UI evaluated stock 222.615 cm³ plus separate thread .581659 cm³; this is not final acceptance. Fixed the branch to consume the intersecting current host, retain helix dependency, reconnect downstream consumers, and preserve host material. Focused merge tests 10/10 pass; module/link checks pass (587 modules). Actual Chrome reloaded, six-step saved checkpoint reopened, and Sweep recreated through UI: one body now shown. Final mass, export/reopen and edit/Undo still pending. ANSI inch/third-angle preset and Letter sheet selected through Drawing UI.

## Final threaded geometry and acceptance

Actual Chrome rebuilt the repaired Sweep as **one solid**, preserving PBT General Purpose reference density 1.31 g/cm³. UI exact volume **222.8659 cm³**, mass **.2919544 kg**, COM cm approximately (-.00007332079, 9.086292, .0000004810987). Outer envelope remains Ø4 ×8 in. Seven editable steps; both sketches fully defined, zero DOF. The original printed outer dimensions are retained; .125 in wall, R.03 fillets, datum Y7.9 in, and Ø.0625 round thread profile are documented designer estimates.

Actual UI Project bundle **87,656,894 bytes** and STEP **1,290,829 bytes** protected as `WATER-BOTTLE-7.11-browser-2026-09-28.{mforge,step}`. Screenshot of actual dark Chrome one-body model with exact mass card: `WATER-BOTTLE-7.11-browser-2026-09-28.png`. Independent read-only native replay passed with no issues, 8 compiled features, valid exact solid, **222.8659759324239 cm³**, bounds Ø10.1600002 ×20.3200001 cm; log `scratch/planchard/verify-bottle-threaded-2026-09-28.log`. The small UI/replay numerical difference is within 0.0001 cm³.

Actual upstream edit: region 3 pitch .1875→.2 in; displayed final helix height .46875→.4828125 in. Downstream Sweep regenerated one solid and exact mass changed to **222.8641 cm³ / .2919520 kg**. Undo restored clean original history. Canonical library record reopened seven steps with one body, two fully defined sketches; final baseline mass check pending below.

Canonical reopen baseline exact mass completed: 222.8659 cm³ / .2919544 kg, original COM and 1.31 density match. One solid, seven steps, both sketches fully defined, clean Save. Protected reopened proof WATER-BOTTLE-7.11-reopened-browser-2026-09-28.png. Exercise 7.11 geometry, material, ANSI/IPS setting, export, upstream edit/Undo, and canonical reopen are accepted.

## Current-source cold browser acceptance (2026-09-30)

Dedicated desktop Chrome tab740 reopened the fresh canonical bottle created during this book task. Seven editable steps, one body, both sketches fully defined, rebuild order valid. Evaluate → Mass properties regenerated native geometry and matched the previous accepted baseline: 222.8659 cm³, .2919544 kg, PBT density1.31g/cm³, envelope Ø4×8in. No geometry was authored by scripts or added to the accepted model.

Actual Output → Project bundle exported4,996,509 bytes, preserved as `WATER-BOTTLE-7.11-current-compact-browser-2026-09-30.mforge`, compared with87,656,894 bytes previously. Current cold proof `WATER-BOTTLE-7.11-current-cold-browser-2026-09-30.png`. The PDF exercise allows estimated dimensions and does not require a draft feature.
