# Exercise 8.16 — rods and added journals: browser acceptance

Four source parts were authored from separate blank models through actual dark Chrome tab 710860247. Circles were drawn with pointer input and given driving diameter dimensions; fixed origins, translated fixed anchors, and explicit Front datum offsets preserve their sketch planes. Extrusions and through cuts were committed through the feature UI. No model geometry was generated or injected by scripts.

These are original designer dimensions for the missing companion geometry, following `radial-engine-8.16-design.md`. The source is Planchard 2021, physical PDF page 429 / printed 8-51. This acceptance covers four parts, not the engine assembly, motion, or drawing.

## Accepted sources

| Role | Saved key | Editable steps / fully defined sketches / solids | Volume cm³ | Mass g | Bounds mm | COM mm |
|---|---|---|---|---|---|---|
| RE01 master rod | `cm_musgpbe1` | 18 / 9 / 1 | 24.668524130155 | 66.605015151 | 54 × 107 × 12 | 0, 9.458495683, 6 |
| RE02 articulated rod | `cm_muskji8q` | 10 / 5 / 1 | 5.663850921634 | 15.292397488 | 24 × 88 × 6 | 0, 40.696032004, 15 |
| RE13 rear journal, added fixture | `cm_musl3kys` | 2 / 1 / 1 | 3.619114736935 | 28.410050685 | 12 × 12 × 32 | 0, 0, −16 |
| RE14 front journal, added fixture | `cm_muslanph` | 2 / 1 / 1 | 1.809557368468 | 14.205025342 | 12 × 12 × 16 | 0, 0, 40 |

Each saved source was reopened from the library after an actual page reload. Chrome reported the same editable tree, fully defined sketches, one solid, successful rebuild, exact volume/mass, and no unsaved state. Native regeneration of each protected export and independent STEP import agree in volume and bounds. The audits are read-only checks of the human-authored geometry.

## Geometry and interfaces

- RE01 hub Ø54, Z0..12; Ø24.2 hub bore. Stem X±6/Y20..60/Z3..9 and Ø24 wrist boss centred Y68/Z3..9, with Ø12.2 wrist bore. Four separate Ø6.2 knuckle bores at radius20 and angles 72°, 144°, 216°, 288°; no extra 0° hole.
- RE02 big end Ø16, stem X±5/Y6..60, wrist boss Ø24 centred Y68; all material Z12..18. Bores Ø10.2 at the big end and Ø12.2 at the wrist. All five sketches explicitly use Front offset12 mm.
- RE13 was independently drawn as Ø12 at Front offset−32 mm, extruded32 mm to Z0.
- RE14 was independently drawn as Ø12 at Front offset32 mm, extruded16 mm to Z48.

## Material and source disclosure

RE01 and RE02 retain `BookMaterial = C355.0-T61 Permanent Mold cast (SS)` and book item numbers1/2. Their actual app material is Aluminum6061 at2.70 g/cm³, explicitly described as a selected mass proxy, not a certified C355 casting.

RE13 and RE14 have `BookItemNo = Additional`: they are explicit designer fixtures, not book BOM roles. Their actual app material is Plain Carbon Steel (grade unspecified), representative density7.85 g/cm³. Source and representation properties disclose original geometry, ideal bearings/axial retention, and no load or thermal qualification.

## Protected artifacts and evidence

Under `artifacts/planchard/`, each stem has `.mforge` and `.step` exports plus `-native-mass-browser-2026-10-03.jpg` and `-cold-reopen-browser-2026-10-03.jpg` proofs:

- `RE01-master-rod-browser-2026-10-03`
- `RE02-articulated-rod-browser-2026-10-03`
- `RE13-rear-journal-browser-2026-10-03`
- `RE14-front-journal-browser-2026-10-03`

Read-only native/STEP numeric reports: `scratch/planchard/RE01-native-step-audit-2026-10-03.json` through the analogous RE02/RE13/RE14 reports. The native and STEP volume differences are below 1e−11 cm³ for all four parts.

Saved names begin `Planchard 8.16 - RE01 master rod`, `RE02 articulated rod`, `RE13 rear journal`, and `RE14 front journal`; the rod suffix is `- fresh designer example 2026-10-03`, and the journal suffix is `- fresh designer fixture 2026-10-03`.

No app source changes were needed for these four part workflows. Browser input dispatch occasionally timed out during concurrent CAD work; visible state was inspected before proceeding to avoid duplicated actions.
