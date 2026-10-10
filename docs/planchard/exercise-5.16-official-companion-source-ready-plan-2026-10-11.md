# Exercise 5.16 — official companion and genuine browser reconstruction

Read-only source audit, 2026-10-11. No CAD was authored or imported by this audit. Browser reconstruction and acceptance remain pending.

## Source recovered

Source: supplied PDF265 / printed5-47, freshly rendered and visually inspected at `scratch/planchard/cosmetic-thread-source-265.png`. Official exercise archive entry: `Chapter 5 Homework/Cosmetic Thread.SLDPRT` in `Eng_Graphics_SW_2021_Exercise_Files_V3.zip`. Extracted part SHA256: `31748a2d6de4fe2ccd228e6233ead87783cc6b029900dec0105d14304d894820`.

Existing read-only compressed-stream inspection produced 48 length/CRC-verified blocks under `scratch/planchard/cosmetic-thread-inspection/`. `42-swXmlContents_KeyWords.xml` explicitly gives Default material 6061 Alloy, Sketch1 diameter .25, Boss-Extrude1 depth2, Sketch2 diameter .375, Boss-Extrude2 depth .25. Inch interpretation is independently corroborated by SI doubles in original resolved-feature/configuration streams: radius .003175m, radius .0047625m, length .0508m, collar height .00635m. The original embedded preview shows the concentric stepped shaft/collar.

| Source feature | Exact recreated size |
| --- | --- |
| Sketch1 / Boss-Extrude1 | Shaft diameter6.35mm (.250in), axial length50.8mm (2.000in) |
| Sketch2 / Boss-Extrude2 | Collar diameter9.525mm (.375in), axial height6.35mm (.250in) |
| Whole body | Concentric, total axial length57.15mm (2.250in) |
| Material | 6061 Alloy |

Original plane/frame and native BRep were not decoded; the chosen Top/+Y construction below is an equivalent frame, explicitly qualified. Metadata and preview establish the two-boss baseline; absence of CosmeticThread in the keyword inventory does not establish exhaustive binary feature absence. The exercise adds the annotation to this baseline.

## Historical witness correction

`EXERCISE-5.16-cosmetic-thread-browser-2026-10-01.mforge` / Saved key `cm_muonh3w3` used a replacement diameter6.35mm cylinder of length31.75mm and no collar. Its report explicitly left circular-edge selection unclaimed and said the companion was unavailable. That historical qualified proxy must remain preserved; it does not prove this exact companion exercise. Availability is now resolved, and the exact source baseline is a genuine remaining task.

## Ordinary Chrome route

1. Create an independent source-correct part in the browser; use mm. On Top, draw a circle centred at the origin, constrain diameter6.35, and Boss extrude50.8mm along +Y.
2. Select the far planar end at Y50.8 (or an explicit Top plane offset50.8), draw a concentric circle diameter9.525 and Boss Add/Merge6.35mm along +Y. One native solid must result. Source frame is illustrative; geometry/dimensions are exact.
3. Set material6061 Alloy. Save independently with a name that identifies official-source 5.16, not replacement stock.
4. Select the **free shaft circular edge opposite the collar**, centre(0,0,0), radius3.175mm. Book says bottom edge; its illustrations rotate the part, so semantic identification is the free end, not screen-bottom. Thread starts there and extends inward along +Y for25.4mm; the collar is outside the threaded interval.
5. Create cosmetic external thread: ANSI Inch / Machine Threads / 1/4-20 UNC / Coarse / class2A / right hand / Blind25.4mm / pitch1.27mm. The source label is 1/4-20-1 UNC2A; the final 1 means one-inch threaded length. Source UI also displays .1905in thread minor-diameter annotation. It does not call for a helical solid cut.
6. Enable cosmetic and shaded cosmetic thread visibility, inspect the feature and its source reference, Save, export native bundle/STEP/SVG where available, and preserve an actual screenshot.

## Confirmed implementation blocker

Current `feature_catalog.js` Thread topology selection allows face only. `modeler.js::createThreadFeature` requires `selectedCylindricalFace` and obtains placement from `threadPlacementFromFace`. Thus face-based cosmetic geometry can be demonstrated today, but the book's genuine circular-edge selection is not supported and must not be claimed.

A bounded generic repair should accept persistent native circular-edge references alongside existing cylinder-face references, derive the centre/radius and inward axial direction from the adjacent cylinder/body, preserve the selected edge in feature references, and reject ambiguous/noncircular/open/stale edges. Do not silently substitute a screen coordinate or face. Existing face workflow must remain valid. Cosmetic mode must leave native solid geometry unchanged.

## Acceptance evidence

### Verified current UI labels and shortest parametric route

`modeler.js::openDimensionedCircle` exposes **Dimensioned circle**, **Center U**, **Center V**, **Diameter**, **Fix center**; it creates a driving diameter and fixed centre. Start a Top sketch, enter0/0/6.35 with Fix center checked, then ordinary Boss Extrude Blind/Forward Depth50.8, operation Add, Merge result enabled. This preserves the source's first sketch/Boss structure instead of claiming a generic primitive is the original feature tree.

For the collar use a new sketch on the far planar end and verify its centre frame before entering0/0. Alternatively the deterministic ordinary **Reference plane** form exposes **Parent plane**, **Offset distance**, **Flip offset**, **Planes to create**. Choose Top,50.8mm, Flip unchecked, count1; start a sketch on that plane, Dimensioned circle0/0/9.525, Fix center checked, Boss6.35 Forward/Add/Merge. The reference plane is an explicitly disclosed equivalent construction choice, not an original source feature. This avoids accidental far-face local-frame origin assumptions.

Then set6061 Alloy through the ordinary material controls. Confirm native one-solid, centred shaft/collar, radial extents4.7625mm and axial0..57.15mm. Retain exact material identity; do not claim an original density/mass where only source grade is recovered. Pick the native free circular edge at axial0 alone, clear any face selection, and proceed with source Thread settings after the generic edge repair.

Exact stepped-cylinder analytic check: `pi*(3.175^2*50.8 + 4.7625^2*6.35) = 2061.2701903598986 mm3`. This is a check of the reconstructed source dimensions, not a measurement of the undecoded original BRep. No original mass or exact density is asserted.

Require actual Chrome edge pick with persisted native reference, one valid native body before/after cosmetic annotation, source-exact two-boss dimensions, start at the free shaft end, length25.4, correct UNC2A label/display, and a bounded parameter driver followed by Undo restoring original annotation. Hard reload and reopen exact Saved record; compare authoring geometry, thread references/settings and displayed annotation. Cosmetic STEP may contain only the uncut stepped solid; this is expected and does not prove annotation persistence by itself.

This closes the former source-unavailable limitation only when that browser proof succeeds. It does not resolve damaged exercise3.9 glyphs or justify a whole-book percentage.
