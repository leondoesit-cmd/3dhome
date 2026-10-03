# Exercise 8.16 — RE03 connected piston repair

The original browser-authored piston export contained five disconnected native solids. The seed groove cut used outer circle 3480 without retaining inner circle 3483, so its four patterned cuts removed complete disks. A displayed projection part count of one did not establish connected native geometry. The original exports are preserved as diagnostics and are superseded for acceptance.

## Actual Chrome repair

Opened this run's saved source **Planchard 8.16 - RE03 Piston head - fresh designer example 2026-10-03**, key `cm_musjttll`. Through visible history controls: selected Extrude Cut 3 → Edit feature in history → Refresh sketch contour → Update feature. The UI reported one inner hole. Saved the rebuilt source to the library and exported the actual editable bundle and native STEP.

The seed `feature_muskm5n4_4` retains outer `profileEntityIds: [3480]` and now persists `holeProfileEntityIds: [[3483]]`. Sketch `sk_4s09a`, feature IDs and the four-copy pattern are preserved. The repaired groove has Ø42 mm root diameter; the cavity remains Ø36 mm, leaving a continuous wall through all four grooves. No geometry was generated or injected by scripts.

## Native, STEP and cold UI acceptance

| Check | Actual result |
|---|---|
| Native connected solids | **1**, valid |
| Native volume | **26.743832886563 cm³** |
| STEP import | **1 valid solid**, 26.743681088230 cm³ |
| Native/STEP volume difference | 0.000151798333 cm³ |
| Material mass proxy | Aluminum 6061, **2.70 g/cm³** |
| Native mass | **72.2083487937 g** |
| Bounds | **44 × 40 × 44 mm** |
| Cold UI reopen | **9 editable steps / 4 fully defined sketches / native solids 1** |
| Cold UI center of mass | Y **14.74764 mm**, X/Z zero |

The assembly audit agent independently replayed the actual exported native recipe and imported STEP. A fresh Chrome tab then reopened the saved library source and confirmed the native solid count, volume, mass and unchanged fully defined history. The book's cast-material label remains disclosed separately from the selected aluminum mass proxy.

## Protected browser evidence

- [Editable repaired bundle](../../artifacts/planchard/RE03-piston-head-annular-repair-browser-2026-10-03.mforge), 891,661 bytes.
- [Native repaired STEP](../../artifacts/planchard/RE03-piston-head-annular-repair-browser-2026-10-03.step), 102,680 bytes.
- [Cold reopen and native mass screenshot](../../artifacts/planchard/RE03-piston-head-annular-repair-cold-browser-2026-10-03.jpg).

The repaired source is accepted. The main agent subsequently updated all five piston occurrences through the library and exported the revised assembly and STEP. The [final native assembly audit](radial-engine-8.16-annular-assembly-audit-2026-10-03.md) confirms 55 connected valid solids, preserved 75 mates and one physical DOF, zero native positive-volume clashes across 25 crank poses, and exact full-cycle closure. Earlier assembly clearance and drawing artifacts use the old piston geometry and are not acceptance evidence for the repaired assembly.
