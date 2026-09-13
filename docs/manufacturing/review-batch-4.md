# CAD review: findings 31–40

Verified against the implementation and covered by `tests/review_fourth_batch.test.mjs`.

| Finding | Resolution |
| --- | --- |
| 31 — hole cutters | Compile native cylindrical/conical tools using sketch centres, support frames, drilling direction and current target bounds. Blind holes retain their requested depth. |
| 32 — partial revolution mass | Integrate profile moments over the actual angular interval, including centroid, axis, translation, reverse and symmetric sweeps. Compare with native solid mass properties. |
| 33 — dimension clearance | Choose the baseline in rotated text coordinates; honour it in canvas and SVG. A browser regression measures actual SVG glyph bounds on both sides of a horizontal dimension. |
| 34 — knurl normals | Reverse inward triangle winding. Check every triangle on three axes. |
| 35 — gear degeneracies | Remove adjacent and closing duplicate vertices, including root degeneracies at larger tooth counts. Validate a native gear extrusion. |
| 36 — insert placement | Translate both the outer profile and bore into the requested X/Z position. |
| 37 — through-all threads | Resolve cosmetic length from the ray through target bounds and move its start to the entry point. Without an extent, preserve the THRU callout and mark depth pending instead of inventing a length. |
| 38 — section arrows | Account for sheet Y inversion so horizontal arrows agree with the section projection. |
| 39 — revolution solids | Share the radial-profile recipe across exact bodies and document reconstruction. Preserve axis, sweep and placement; tessellated previews include partial-sweep end caps. |
| 40 — cylinders/frustums | Project mass centroid and bounds along the cylinder axis, including negative height; preserve the same axis in native solids. |

## Corrections to the report

The old per-part exact-mesh eligibility check rejected partial revolutions before the reported hardcoded call could run. Document reconstruction did force a full revolution. Both paths now preserve the requested sweep.

Duplicate gear vertices were reproducible; a universal kernel crash was not established. A through-all thread length cannot safely be guessed from nominal diameter. The implemented overlay extent uses a bounding-box intersection and is not a measurement of thread engagement through arbitrary cavities.

## Follow-up implementation

- The mass panel rebuilds current exact solids, including cuts and finishing operations, before reporting volume, centre of mass and the full centroidal inertia tensor in kg·m². Multi-body inertia uses the parallel-axis theorem. Reports identify exact, approximate or incomplete results; failed modified bodies and bounds-only records are excluded rather than measured as uncut stock. One uniform density is applied to the measured bodies.
- Hole previews and saved legacy cut records use the same cylinder/cone dimensions and placement helper as exact regeneration. Native intersection checks reject cutters that miss material. Application checks the candidate solid before replacing the target's cuts. Save/reload, translation, target resizing and reconstruction have regression coverage.
- The hole form has a separate thread-engagement length. Zero requests an automatic estimate; explicit engagement is checked against drilling depth after the head recess. The overlay starts below the recess. Automatic through-all engagement still uses target bounds: it does not certify continuous engagement through internal cavities, nor model drill-point or tap runout allowances.
- Migration now accepts valid offset, partial, reversed and symmetric revolutions about X/Y/Z. It retains placement and direction in geometry fingerprints, computes swept bounds, and synthesizes an editable profile sketch when an old body has only points. Tests replay the converted features in OpenCascade and compare native volumes and centroids. Unsupported legacy modifiers remain blocked.

Exact geometry is not a material or process certification. Mesh fallback measurements remain approximate, and inertia is withheld unless all measured bodies have exact solid geometry.
