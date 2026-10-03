# Exploded Fit and assembly drawing gaps — 2026-10-03

## Exploded viewport Fit

Assembly bounds already include visible components' exploded offsets. The camera fit measured their span but reset its look target to the world origin. An asymmetric explosion therefore enlarged the camera distance while keeping its center away from the exploded group; the butterfly lever at approximately Y 39 cm could remain outside the viewport.

Assembly Fit now centers its target on the visible bounds. A fixed camera frame, if present, receives the corresponding local target. Empty assemblies keep the existing fallback. Geometry and saved explode offsets are unchanged.

Verification: nine fit and projection tests passed, covering asymmetric bounds, fixed-frame centering, empty assemblies, and existing sketch camera projection behavior. Browser visual confirmation requires reload.

## Assembly drawing gaps found

- Assembly SVG export builds a new isometric sheet with BOM and balloons. It does not pass an editable drawing document or saved user notes to the drawing engine.
- The assembly drawing settings dialog contains sheet/title properties without a note field.
- The Drawing ribbon Note command selects the 3D note tool against the part editor document. Assembly SVG export does not consume those notes.
- Viewport explode leaders are generated separately. Their data is not passed to the assembly SVG drawing scene.

## Drawing corrections

The assembly Drawing settings dialog now saves a multiline Drawing notes field. The Drawing ribbon Note command opens and focuses that field. Export writes those saved notes in a wrapped bottom-left block, reserves the corresponding view band, and escapes note text in SVG.

Viewport and drawing export now share the same explode leader endpoint generator. It measures visible assembled occurrence bounds, then applies each actual explode offset once. The native sheet renders those world endpoints through the same isometric projection and scale as its geometry, using dashed center lines. Collapsed views have no leaders. Nested paths and invisible occurrences retain the existing explode semantics.

The selected component inspector now exposes Description and Part number. These save occurrence custom properties used by the BOM without editing library source geometry. Blank overrides fall back to source document properties.

## Assembly sheet containment and ANSI C

Human review found that an explicit 1:4 sheet could overlap the title block. Automatic single-isometric assembly layout now tries both the full-width middle band and the upper-right region beside the BOM, with the notes/title band and view caption reserved. Fit chooses the largest standard scale that fits one of these regions. Assembly SVG export rejects an explicit scale that cannot fit, asking for Fit or a larger sheet; it does not change the requested scale silently. Existing manually positioned part drawing views retain their prior layout behavior.

ANSI C is available as a physical 22 × 17 inch sheet (558.8 × 431.8 mm landscape), including portrait orientation in the native drawing engine.

## Description persistence

Human saved-bundle review found a stale hidden header Description overwrote the newly committed custom property during assembly Save. Custom properties Save and assembly drawing settings apply now synchronize the header after committing document properties. Three regression tests exercise the actual dialog handlers and subsequent assembly Save, plus the part Save header read; the edited Description survives.

Verification: 21 targeted drawing, explode, selection and refresh tests passed; the new tests exercise the actual notes apply handler, save round trip, SVG escaping and wrapping, view reservation, component BOM overrides, and assembled-world leader generation. Browser confirmation is performed by the parent agent after reload. No geometry was authored by this source work.

```
node --test tests/assembly_fit.test.mjs tests/editor_projection.test.mjs
npm run check
```
