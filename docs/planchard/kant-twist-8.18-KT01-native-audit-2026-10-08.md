# Exercise 8.18 KT01 — independent native audit

Final actual Chrome export: `artifacts/planchard/KT01-final-browser-2026-10-08.mforge`, with `KT01-six-features-browser-2026-10-08.step`. Final feature/sketch arrays are byte-equivalent after JSON serialization to the six-feature export; the final revision adds metadata. The audit only reads authored files and rebuilds a disposable verification shape. It does not author or alter geometry. The input checksum remained unchanged.

**Geometry passes the frozen original designer plan.** Six sketches are fully defined without diagnostics; six active features produce twelve rebuilt history entries. Four merged bosses and two Through All cuts form one valid STEP solid. Seventeen compiled kernel operations include the individual profile operations; this is not seventeen authored features.

| Feature | Verified sketch and depth (mm) | Constraints |
|---|---|---|
| Foot | Top Y0, X±50/Z±30, +Y8 | Two horizontal/two vertical; driving100×60; one fixed corner |
| Post | Top Y8, center X40/Z0, Ø16, +Y136 to144 | Fixed center; driving diameter |
| Head | Front Z−9, center X18/Y150, 60×24, +Z18 to9 | Two horizontal/two vertical; driving60×24; fixed corner |
| Rail | Front Z−9, all four exact frozen vertices, +Z18 | Four fixed vertices |
| P/Q bores | Front Z−9, centers(0,150)/(45,174.230769230769), Ø8.2 | Two fixed centers; two driving diameters; Through All +Z |
| Mounting bores | Top Y0, X±35/Z±20, Ø6 | Four fixed centers; four driving diameters; Through All +Y |

All selected profile IDs resolve to the intended sketch entities, including the additional multi-region circles. Blind boss end positions, merge flags, forward direction, zero draft and non-thin settings match the plan. Through All feature `to` values are padded global extents, rather than the stale nominal `depth=18` value; their actual end condition is Through All.

Native verification rebuild volume is **104.12044755680049 cm³**. Independently imported89312-byte STEP volume is **104.12044755679652 cm³**, difference3.97×10⁻¹² cm³. STEP validation reports one valid solid, maximum tolerance10⁻⁷ cm. Both bounds match X−50..53.127425537743, Y0..182.358194768512, Z±30mm. Native center of mass is(16.445384356394,65.720157380578,≈0)mm.

The document uses Alloy Steel reference appearance and density7.70g/cm³; native nominal mass is **801.727446187364g**. Description correctly identifies printed8-53/PDF431, original educational dimensions, unavailable companion CAD/AVI, nominal holes and no rated capacity.

**Final metadata passes:** PartNo=`KT01`, BookItemNo=`1`, and the educational Description are present in the final exported document. The earlier six-feature snapshot contained only Description; this gap was closed through Chrome Custom Properties UI.

Parent reports browser durability passed: cold reload, Start fresh while keeping draft, library reopen, same native one-solid bounds and persistent Description; driving foot width100→110 changed overall X span103.1274→113.1274mm, Undo→103.1274, Redo→113.1274, final Undo→103.1274. Those are parent-observed browser checks, distinct from the independent native audit. Remaining KT02..KT16 and assembled motion/interference remain pending; this stand audit does not accept the proposed complete mechanism.

Evidence:

- `artifacts/planchard/KT01-final-design-consistency-audit-2026-10-08.json` — final exact coordinates, constraints, planes, feature parameters, material/provenance, complete metadata and unchanged input SHA256.
- `artifacts/planchard/KT01-final-native-bundle-audit-2026-10-08.json` — final compiled native rebuild.
- Earlier six-feature audit JSON files remain historical evidence before metadata completion.
- `artifacts/planchard/KT01-six-features-native-step-audit-2026-10-08.json` — independent STEP import/solid validation.
- `scratch/planchard/audit-kt01-readonly.mjs` — repeatable read-only structure comparison.
