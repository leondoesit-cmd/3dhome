# Detail view native cropped bounds

Actual BATTERY Front Detail A showed clipped geometry in its circular bubble but a selection box/caption based on the whole parent. Its source draft is protected as `BATTERY-front-detail-source-draft-browser-2026-10-10.mforge/.svg`, child`v1eocwbj`, parent Front`v95ql2my`. Source PDF453/9-19 calls for this Front-derived Detail at1:1.

Confirmed cause: `cropProjection` clips segments and writes circular bounds but spreads the parent's native `exactBounds`. `projectionBounds` prioritizes those exact parent bounds, so layout, selection and caption treat the Detail as full stock. The bounded fix replaces the Detail's exact/display bounds with its crop circle's bounds and uses that circle's centre for presentation. Parent geometry, source measurement metadata and clipped geometry remain untouched. Each nested Detail similarly gets its own bubble bounds.

The new meaningful native-bounds regression failed before the fix: a40mm Detail bubble incorrectly acquired200mm native stock width. It now verifies40mm square selection/layout bounds, bubble centre, caption7mm below the bubble, cold SVG equality and a20mm nested Detail. **78/78** related sheet/Crop/shaded/scale tests pass.

Independent read-only rebuild of the actual protected BATTERY draft confirms width/height **55.1845882594644mm**, centre(-.9094294751,10.1685681157)cm, scale1:1, bubble bottom118.6470252731mm and captionY125.6470252731mm. The saved paper centre(128.7663442833,91.0547311433)mm is retained; source file bytes are unchanged. These scene coordinates are not a claimed browser pixel screenshot. Parent actual reload/layout/cold acceptance remains pending.

Final gates: no free identifiers;679 modules linked;1487 source assertions. Scoped whitespace clean. Owned changes: `js/core/hidden_line.js` cropProjection only, one regression in `tests/cad_sheet.test.mjs`, and this report. No browser/CAD/ADVANCE/Git authoring.
