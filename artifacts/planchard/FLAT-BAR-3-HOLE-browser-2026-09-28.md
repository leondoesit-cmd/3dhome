# Fresh FLAT BAR–3 HOLE / 3HOLES browser reconstruction

Date: 2026-09-28. Authoring surface: dedicated desktop Chrome tab 710847511, ModelForge dark UI. Geometry was created from blank through visible UI. No prior model was used as a starting shape.

## Source

David Planchard, Engineering Graphics with SOLIDWORKS 2021. PDF page 260 (printed 5-42), Exercise 5.8; PDF page 474 (printed 9-40), Homework 9.1. Both figures were rendered and inspected visually. Chapter 9.1 deliberately specifies a different material/thickness from Chapter 5.8.

## Chapter 5.8 model

Front-plane centerpoint straight slot; arc centers 1.000 in apart, width .500 in, cap radius .250 in, overall length 1.500 in. Blind extrusion .060 in. One seed Hole Wizard simple ANSI Inch Custom diameter .190 in through all. Linear feature pattern 3 instances at .500 in spacing. Hole centers -0.500, 0, +0.500 in. Ferritic stainless steel (grade unspecified), 7.7 g/cm³. One solid body. Two fully defined sketches and three parametric features (five design-history steps). Saved to library before derivative creation.

Files: FLAT-BAR-3-HOLE-5.8-browser-2026-09-28.mforge, .step, .svg.

## Chapter 9.1 derivative

Created through library Save copy and open from the just-built Chapter 5.8 model. Independent library ID, updated extrusion .090 in and Aluminum 1060. Original stainless/.060 model remains saved. ANSI Letter landscape, third angle, Front/Top/Isometric. Inch dimensions with secondary millimeters, three decimal places, trailing zeros. Front carries associative 1.000 [25.40] arc-center span, .500 [12.70] adjacent center span, and 2X R.250 [6.35] cap callout. Hole note binds to Hole Wizard and derives quantity ×3 and EQ SP. from the live feature pattern. Smart MATERIAL THICKNESS note binds to the extrusion start/end planes and displays .090 [2.29]; Top thickness dimension removed. Title 3HOLES; number 556-099; revision A; author DCP; company D&M ENGINEERING; date 9-1-2021. Material reads from the part.

Files: 3HOLES-9.1-browser-2026-09-28.mforge, .step, .svg, .png. The PNG is the actual visible Chrome UI screenshot, captured by CUA getScreenshot (Uint8Array) and written with Node fs.writeFile.

## Gaps fixed

- Viewport circular edges use the kernel arc midpoint to resolve antipodal endpoints. This removes the phantom inner semicircle on one slot cap; verified after Chrome reload.
- Insert Model Items binds slot arc radii and construction-centerline length to resulting cap edges, with persistent IDs.
- Linear Hole Wizard feature pattern quantity/skipped copies and equal spacing now reach both live and exported callouts.
- Note command exposes Link to model > extrusion depth. Smart thickness notes remeasure normal separation of exact start/end planes and flag missing topology.
- Dimension edit supports Quantity separately from displayed text, retaining associative measurement for 2X radius labels.
- Sheet prompt respects select choices rather than converting select fields to plain text.

## Checks

78 focused tests passed: model items, topology picking, sheet/drawing, and FLAT BAR-specific association/quantity/thickness cases. npm run check passed: no free identifiers, no link errors (575 modules), source assertions green. Browser-reloaded saved derivative has .090 in thickness. Browser-exported SVG verified to contain linked .090 [2.29], 2X R.250 [6.35], .500 [12.70], 1.000 [25.40], EQ SP., Aluminum 1060, and 556-099. Both model bundles preserve fully-defined sketches and intended separate materials/depths.

## Remaining deviations

App font and title-block arrangement differ from the SOLIDWORKS template. Hole label formatting uses leading zero/unit suffix and trailing multiplication count; semantic diameter/quantity/through/equal-spacing content matches. Linear feature patterns are counted; circular/curve/nested pattern callout counting remains a separate gap.

Original model proof captured separately in Chrome tab 710847539: FLAT-BAR-3-HOLE-5.8-browser-2026-09-28.png. Its SVG was refreshed through browser export after the live pattern-count fix. Original geometry/material/history remains unchanged.

## Shaded view and custom properties completed

Latest independent 9.1 artifact: `3HOLES-9.1-shaded-linked-browser-2026-09-28.{mforge,svg,png}`. Chrome view Display style > Shaded with edges now persists on Isometric. Canvas and exported SVG draw directional gray lighting on the actual rebuilt model facets, preserving the open holes and HLR edges. Browser-exported SVG contains 315 filled compound paths and 33 gray tones, with no embedded raster. Adjacent facets of the same tone batch together and use a narrow matching stroke to reduce antialias seams. No material color appearance is claimed; intersecting surfaces are not split for painter ordering.

Model custom properties authored through UI: Description = `3 HOLES`; SWFormatSize = `8.5in*11in`. Note Link to model exposes arbitrary named properties; DESCRIPTION and FORMAT notes re-read those values. Save, reload and library reopen verified the properties, links and display style. Existing thickness and geometric associations remain intact.

84 focused tests now pass, including shaded geometry, open hole/crop, export/cache/rebuild association, arbitrary linked property changes/missing-property flags, and both drawing-transition render paths. `npm run check` is green: no free identifiers, no link errors (577 modules), 1500 source assertions. A new blank Exercise 5.9 model is separately recorded; these entries do not claim ebook completion.
