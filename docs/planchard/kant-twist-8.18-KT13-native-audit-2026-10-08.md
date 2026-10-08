# Exercise 8.18 KT13 Handle grip — independent native audit

Final actual Chrome export: `artifacts/planchard/KT13-final-browser-2026-10-08.mforge`,193602 bytes, with matching13468-byte `KT13-three-features-browser-2026-10-08.step`. Final feature/sketch arrays equal the earlier three-feature snapshot after JSON serialization; metadata/material retained. This audit only reads authored files and rebuilds disposable native verification geometry. Final input SHA256 remains unchanged.

**Geometry matches the frozen original designer plan.** Three fully defined Right circle sketches, three features and six active rebuilt history entries. All ordinary circles have fixed centerU/V=(0,0), driving diameters and correct offsets/profile selections. +X forward, blind, zero draft/non-thin; body merges:

| Feature | Diameter (mm) | X interval /depth (mm) |
|---|---:|---|
| Rubber body |14 |−40..−16 /24 |
| Grip socket |6.2 |−32..−16 /16 |
| Fastener passage |4.4 |−40..−32 /8 |

Socket and passage meet atX−32, forming an open stepped bore withØ6.2 opening atX−16 andØ4.4 opening atX−40. Minimum radial wall is3.9mm; the shoulder accommodates the bar tip while the smaller passage continues to the outboard fastener. No diagnostics or native rebuild issues; eight compiled kernel operations implement three authored features.

Native volume **3.089819206658635cm³**, STEP **3.0898192066587113cm³**, difference7.64×10⁻¹⁴cm³. STEP reports one valid solid, maximum tolerance10⁻⁷cm. Bounds X−40..−16mm,Y/Z±7mm,24×14×14mm. COM≈(−28.310395314788,0,0)mm. Nominal density1.30g/cm³ gives mass **4.016764968656226g**.

Material passes: `Nitrile rubber (NBR-770 reference)`, catalog`stock:rubber`, black low-metal appearance, density1.30. Independently inspected [Burly Seal Products materials](https://www.burlyseal.com/materials/) lists NBR-770 Nitrile70ShoreA specific gravity1.30, supporting the nominal CAD density. This educational selection is explicitly different from the book's unspecified Rubber library value. No material/load certification is claimed. PartNo=`KT13`, BookItemNo=`13`; Description discloses this reference substitution, original educational geometry, printed8-53/PDF431 and unavailable companion CAD/AVI.

**Parent reports browser durability passed:** socket6.2→6.4mm changed native volume to3.058152cm³/mass0.003975598kg; Undo/Redo/Undo and Save restored nominal geometry. Cold reload→preserve draft→saved library`cm_muzufld4` reopened six fully defined history steps, one native solid24×14×14mm,3.089819cm³/0.004016765kg,NBR1.30; nominal/edit/coldmass/coldfinal/source screenshots protected. These are parent-observed browser checks, distinct from independent verification. No standalone KT13 acceptance gaps remain; assembled bar/socket/fastener fit and full handle rotation clearance remain pending.

Evidence:

- `artifacts/planchard/KT13-final-design-consistency-audit-2026-10-08.json`
- `artifacts/planchard/KT13-final-native-bundle-audit-2026-10-08.json`
- `artifacts/planchard/KT13-three-features-native-step-audit-2026-10-08.json`
- `scratch/planchard/audit-kt-circle-part-readonly.mjs` — repeatable frozen-spec inspection.
- Earlier three-feature snapshot audit files remain historical evidence; STEP comparison applies to the identical final recipe.
