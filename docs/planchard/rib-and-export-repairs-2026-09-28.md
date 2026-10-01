# Exercise 7.5 Rib and 7.6 export repairs

## Parallel-to-sketch Rib

PDF page 372 / printed 7-64 was inspected visually. The book's side-plane open profile defines the upper boundary of a web growing down to the base; its .38 in thickness lies normal to the sketch plane. The previous Rib only offset the line within the sketch plane and extruded it along the normal, producing a broad plate for this workflow.

The Rib form now exposes **Rib orientation → Parallel to sketch** and **In-plane growth → Down (−V), Up (+V), Left (−U), Right (+U)**. Both sides applies half the thickness to each side of the sketch plane. Parallel mode uses Up to the body and zero draft; incompatible normal depth/direction/draft controls are hidden and normalized when changing modes. Existing perpendicular behavior and defaults remain compatible.

Exact regeneration casts rays from free profile points across the thickness to actual first-hit body faces. A single planar stopping surface closes the profile in the growth direction; the exact web is extruded across the plane (or lofted for a support plane inclined across its thickness), then fused into the existing body. Curved or multiple stopping surfaces and nonzero parallel draft fail explicitly. These cases are not silently replaced with a bounding-box floor. Open chain references are stored and reread from the solved driving sketch on rebuild; an edited profile changes the web instead of reusing a frozen point snapshot. Parallel-web topology is named from the regenerated exact body, avoiding obsolete perpendicular preview-face names.

The specific 7.5 path is Z/Y `(.55,.50) → (2.25,2.00) → (3.25,2.00)` in, offset X1.81 in, thickness .38 in. The focused exact test measures the added web at **X1.62–2.00, Y.50–2.00, Z.55–3.25 in**, fused into one valid exportable solid. Its area is `1.70 ×1.50 /2 +1.00 ×1.50 =2.775 in²`; added volume **1.0545 in³ /17.279865588 cm³**.

Root's actual fresh Chrome 7.5 workflow accepted Parallel/Down/.38, followed by a two-instance X feature pattern at 2 in spacing with merge. Eleven steps, one body, clean Save; exact browser volume **306.9601 cm³**, mass **.8287924 kg**, COM **(5.289176,1.810299,7.925371) cm**. Browser proof: `artifacts/planchard/EXERCISE-7.5-rib-pattern-exact-browser-2026-09-28.png`. Final independent bundle replay, upstream edit and exchange acceptance are tracked by root; they are not asserted here.

A consumed valid open Rib path now reports **Open rib path ready** and **path endpoints**, rather than a red generic open-profile warning. A branch, missing consumed entity, extra unconsumed geometry or a sketch not consumed by Rib retains its ordinary health warning. This final copy requires the next browser reload; the geometry proof above predates that copy change.

## SOAP 7.6 export tolerance

The actual fresh Chrome SOAP bundle independently regenerated with valid topology and volume **36.34955724789027 cm³**. Export validation nevertheless refused the nominal `.001 cm` tolerance. Exact diagnostics showed faces `1e-7 cm`, edges exactly `.001 cm`, and vertices `.0010000000000000005 cm`: only two double ULPs above the requested limit, caused by OCCT's edge-to-vertex tolerance promotion.

The export comparison now permits only **four double ULPs at the nominal limit**, without changing that limit or rounding the reported actual tolerance down. The original bundle verifier subsequently reports no export warning and the same volume/COM. A regression replays a small canonical recipe captured from the actual fresh browser bundle (meshes/caches/unrelated library assets omitted). A second regression raises the native vertex tolerance to `.001001 cm` and confirms that the unchanged `.001 cm` gate still rejects it.

## Gates

Combined focused run: **27 tests pass** across existing/perpendicular Rib, parallel Rib, live sketch association, form behavior, consumed-path health, SOAP tolerance and expression handling. `npm run check` passes its free-identifier/import/source-assertion gates (582 modules, 1498 assertions). Full CI and ebook completion are not claimed.

## Parallel Rib over more than one stopping surface (HOUSING Rib2, 2026-09-29)

Book steps 631-644: the LongRibPlane profile is a horizontal line plus a tangent arc; its growth (down) meets the housing floor with the line and the lofted transition and Boss-Stop with the arc. The kernel refused this ("Parallel Rib reaches different stopping surfaces; split the profile into separate ribs").

`parallelRibBrep` still builds the exact single-plane web (loft/extrude to the plane) or the single curved face trim when every sample meets one surface. When it meets several, it grows an oversize slab through the rib thickness, subtracts the body and keeps only the free pieces connected to the profile (seed points just below it), then fuses them. The web is therefore bounded by whatever first surfaces the growth meets; pieces past the walls are disconnected from the profile and dropped, so nothing is guessed or floored. Tests: `tests/cad_rib_parallel.test.mjs` (stepped floor, exact +96; floor plus cylindrical boss, exact half-disc subtraction, one solid, exportable). The old "refuses stepped stopping faces" expectation was inverted on purpose.
