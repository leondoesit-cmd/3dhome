# Exercise 8.16 — fresh piston head and ring acceptance

Source: Planchard, *Engineering Graphics with SOLIDWORKS 2021*, PDF page 429, printed 8-51. The book supplies the radial-engine assembly concept; these dimensions are the explicit designer example frozen in `radial-engine-8.16-design.md`.

Both parts were authored from blank documents through desktop Chrome in dark theme. Sketches, dimensions, features, properties, materials, saving, native STEP export and cold library reopening were performed with visible controls. No geometry was injected or copied from an earlier part.

## Saved records

| Part | Saved name | Key | History | Cold exact volume | Proxy mass |
|---|---|---|---|---|---|
| RE03 | Planchard 8.16 - RE03 Piston head - fresh designer example 2026-10-03 | cm_musjttll | 9 steps; 4 fully defined sketches; 1 solid | 23.80330 cm³ | 64.26891 g |
| RE04 | Planchard 8.16 - RE04 Piston ring - fresh designer proxy 2026-10-03 | cm_muskzlqo | 2 steps; 1 fully defined sketch; 1 solid | 0.3981026 cm³ | 0.4180078 g |

## Geometry and native checks

RE03: Y-axis cup, outer diameter 44 mm over Y −10…30 mm; cavity diameter 36 mm over Y −10…22 mm; 8 mm crown; wrist bore diameter 8.2 mm through Z at X/Y zero. Four 2 mm annular grooves have root diameter 42 mm at Y 10…12, 14…16, 18…20 and 22…24 mm. The first groove is an annular extruded cut; a seed-feature linear pattern repeats only this cut along Y, four instances at 4 mm pitch. Native bounds are 44 × 40 × 44 mm. Cold mass matches the warm result at density 2.70 g/cm³. COM is approximately (0, 14.46939, 0) mm.

RE04: a fully defined Front sketch rectangle spans X 21.2…22.8 mm and Y −0.9…0.9 mm, revolved 360° about Y using sketch coordinates. Native bounds are 45.6 × 1.8 × 45.6 mm; COM is zero. The exact volume agrees with π(22.8² − 21.2²) × 1.8 mm³. Cold mass matches the warm result.

Both cold reopenings show valid rebuild order and one native body. Every sketch remains fully defined. Final exports additionally retain BookItemNo, PartNo, BookMaterial, MaterialProxy, Source, DesignStatus and Representation properties.

## Material limitations

RE03 uses actual Aluminum 6061 at 2.70 g/cm³ as an explicit mass proxy for the book's C355.0-T61 Permanent Mold cast (SS) material. This does not qualify the cast alloy's mechanical properties.

RE04 uses Parker E0529 EPDM at 1.05 g/cm³ solely as a mass proxy for book Rubber. The [primary Parker compound datasheet](https://www.parker.com/content/dam/Parker-com/Literature/Praedifa/Compound_Data_Sheets/EMG_PTD_Compound-Data-Sheet_EPDM_E0529_EN.pdf), released 17 April 2024, lists typical density 1.05 ± 0.02 g/cm³ under DIN EN ISO 1183-1. The saved engineering data cites this reference and says engine suitability is unresolved. No strength, seal performance, deformation or engine suitability is claimed; the ring is a rigid rectangular annulus in this demonstration.

## Protected browser exports and proofs

Under `artifacts/planchard/`:

- `RE03-piston-head-browser-2026-10-03.mforge` — 881,229 bytes, final metadata.
- `RE03-piston-head-browser-2026-10-03.step` — 115,424 bytes, native geometry.
- `RE03-piston-head-mass-browser-2026-10-03.jpg` and `RE03-piston-head-cold-browser-2026-10-03.jpg`.
- `RE04-piston-ring-browser-2026-10-03.mforge` — 139,690 bytes, final metadata.
- `RE04-piston-ring-browser-2026-10-03.step` — 9,295 bytes, native geometry.
- `RE04-piston-ring-mass-browser-2026-10-03.jpg` and `RE04-piston-ring-cold-browser-2026-10-03.jpg`.

Native geometry was cold-verified before the final disclosure-only property save; final exported JSON was read to confirm all disclosure properties persisted. Tabs 710860260 and 710860384 are clean saved deliverables; no unfinished geometry commands remain.
