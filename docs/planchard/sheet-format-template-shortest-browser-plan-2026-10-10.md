# Sheet format/template browser witness without image upload

Read-only UI/source plan. Source PDF446 (9-12), steps67–76, separates MY-A-FORMAT from A-IN-ANSI/A-MM-ISO templates; PDF447 (9-13), steps77–81, creates a new drawing from a template. This witness exercises native local formats/templates; logo insertion remains separately pending and no SOLIDWORKS binary interoperability is claimed.

## Start from the accepted source

Exact Saved name: **Planchard BATTERY - tolerance logo template witness - browser 2026-10-10**, key `cm_mv2jcwy0_6408`. Latest protected cold bundle: `BATTERY-front-detail-native-angle-precision-cold-browser-2026-10-10.mforge`.

Current drawing: Letter landscape, inches/ANSI/third-angle, sheet1:2, nominal precision2/trailing zeros, secondary mm precision2, zones/hidden/centers enabled. Five views/twelve dimensions, no images or paper primitives. Reusable company is D&M ENGINEERING; author empty; general tolerance `ANG ±0°30′ · .X ±.01 · .XX ±.005`. A CHAPTER9 free note and a live Material note are present. Start clean Saved. These save-preset commands only write the separate local preset library and do not alter this drawing or its saved CAD.

## Shortest ordinary sequence

1. In Drawing, scroll the vertical tool rail to **Save sheet format**. Form **Local preset name** = `MY-A-FORMAT`. Leave **Include independent paper notes and geometry** unchecked. **Apply**. Expect `Local sheet format saved`.
2. **Save drawing template**. **Local preset name** = `A-IN-ANSI`. Leave the same checkbox unchecked. **Apply**. Expect `Local drawing template saved`. No file chooser occurs in either step.
3. **New from drawing template**. **Saved local preset** = `A-IN-ANSI`; **Apply**. With the source clean, this opens an independent new Drawing named `Drawing from A-IN-ANSI`. If an unsaved guard appears, keep editing and save the accepted source before repeating; do not discard source work for this test.
4. The new sheet must retain Letter landscape, inches/ANSI/third-angle,1:2, precision2, secondary mm2, zones, company and general tolerance. It must contain **zero CAD parts/features/sketches, zero views/dimensions/notes/images/primitives**. BATTERY title/number/mass/description and its live Material note must not be cloned. Its stored drawing carries `templateSource.name=A-IN-ANSI` and `sheetFormat.name=A-IN-ANSI`.
5. On this blank Drawing, **Apply sheet format** → **Saved local preset** `MY-A-FORMAT` → **Apply**. Matching Letter landscape allows it. Expect `Sheet format applied; source views, dimensions and CAD preserved`; provenance becomes MY-A-FORMAT, templateSource remains A-IN-ANSI. Company/general tolerance remain visible. **Undo** returns sheetFormat provenance A-IN-ANSI; **Redo** restores MY-A-FORMAT. Applying MY-A-FORMAT again must not accumulate paper content.
6. **Save** under independent name `Planchard native A-IN-ANSI template and MY-A-FORMAT witness - browser 2026-10-10`. Export **Project bundle** and **SVG**. Hard reload, reopen this exact independent Saved name, Drawing/Zoom fit, export again. Cold persistence compares whole drawing/defaults/provenance; selection styling may differ. Reopening **New from drawing template** after reload should still list A-IN-ANSI; cancel without creating another document.
7. Reopen the accepted BATTERY Saved source and export a final bundle if preservation evidence is needed. Compare all source authoring/native geometry and its five views/twelve dimensions against the accepted cold baseline. Preset capture and new blank document creation must leave it unchanged.

## Optional stronger preservation witness

Applying a format to the independent blank sheet proves reusable format application and Undo, while preserving the accepted source untouched. To independently verify application onto a populated drawing, first create an ordinary **Save copy** of BATTERY named `Planchard BATTERY format-application witness - browser 2026-10-10`; apply MY-A-FORMAT there. Export before/after/Undo/Redo. All views, twelve dimensions, live Material note, source/native geometry and part title/number must remain exact; only reusable company/author/general tolerance/zones and format provenance may change. Because this no-image preset has no paper art, applying it twice must preserve the note count and all dimensions. This optional copy is unnecessary for the shortest blank-template proof.

## Capture boundaries and qualification

Unchecked paper-art capture excludes both CHAPTER9 and Material notes. If checked, only independent free notes/primitives are eligible; model-linked or leader/feature notes still remain excluded. Neither preset captures views, associative dimensions, source CAD, part description/number/mass or per-dimension precision. Templates capture document drafting defaults; formats capture matching paper/zone/title-format data. Embedded local images would always be included, but current source has none and this plan does not claim logo completion.

The library is browser-profile local (`modelForge.drawingPresets.v1`), limited to12 presets/2MiB. Saving the same kind/name replaces that preset. Sheet format application rejects mismatched paper size/orientation. Assembly drawing preset use is explicitly rejected by the current controller; this witness is a part drawing. Cross-profile transfer and `.slddrt`/`.drwdot` import/export remain outside scope.
