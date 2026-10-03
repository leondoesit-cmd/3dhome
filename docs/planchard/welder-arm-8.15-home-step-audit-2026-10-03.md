# Exercise 8.15 welder arm: home assembly STEP audit

Read-only check of the actual browser export `artifacts/planchard/WA-assembly-home-browser-2026-10-03.step` against the protected browser-authored home assembly `artifacts/planchard/WA-assembly-native-joints-browser-2026-10-03.mforge`. No model or browser state was changed.

| Measure | Native feature-tree replay | Imported browser STEP |
| --- | ---: | ---: |
| Visible occurrences / valid solids | 18 / 18 | 18 valid solids |
| Total volume | 485.6869152876 cm³ | 485.6869082016 cm³ |
| Bounds X | −50 to 110 mm | −50 to 110 mm |
| Bounds Y | 0 to 245 mm | 0 to 245 mm |
| Bounds Z | −50 to 50 mm | −50 to 50 mm |

The STEP volume is lower by 0.0000070860 cm³ (about 0.00000146%), consistent with STEP transfer tolerance; its maximum reported BREP tolerance is 0.0000014144 mm. The browser export is 666,914 bytes.

The 18 browser-authored occurrences resolve to 12 distinct native part recipes. With the saved ferritic-stainless proxy density of 7.70 g/cm³ and Toolbox steel density of 7.85 g/cm³, native replay gives **3.7407361251 kg** and mass-weighted center of mass **(36.62832711, 79.24019325, approximately 0) mm**. These agree with the browser Mass Properties display (3.740736 kg; 36.62833, 79.24019, 0 mm). Imported STEP reports a geometric, volume-weighted center (36.61558460, 79.21056085, approximately 0) mm because STEP does not carry this app's saved material assignments. That center must not be compared as a mass-weighted result.

The home bundle's 23 mates independently solve with four degrees of freedom and no changed component poses. Exact pairwise BREP interference on the same saved poses found no positive-volume overlap. Motion-study acceptance remains separate from this static export audit.

Audit outputs: `scratch/planchard/wa-home-step-audit-2026-10-03.json` and `scratch/planchard/wa-home-native-mass-audit-2026-10-03.json`.
