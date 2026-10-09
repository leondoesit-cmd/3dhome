# Sketch 2D fit around visible HUD — validation, 2026-10-09

The parent observed a 30 × 50 mm source profile at approximately21.05 px/mm after Sketch Zoom to fit: its1052.5 px height was centred in the full canvas, placing its top around203.4 px behind the174–220 px coach and its bottom around1255.9 px behind the1250–1296 px status. Source `fitSketch` used the whole measured canvas with only40 px padding on each edge, while floating HUD controls occupied more than that.

The actual read-only DOM measurements supplied by the parent were canvas `(265.333,163.333,2013.333,1132.667)`, context toolbar `(1265.333,215.333,13.333,9.333)`, bottom hint `(1134.12,1170.667,275.76,29.333)`, selection rail zero height at1242, and status `(781.333,1250,1497.333,46)`. The protected screenshot `DRAFTING-1.6-sketch-fit-ui-context-browser-2026-10-09.jpg` documents the active top coach and bottom controls; it shows the later rear sketch/base ghost, not a new reproduction of the earlier base-only fit.

The generic fit now measures intersecting visible top Coach/Workflow/Context rectangles and bottom hint/selection/status rectangles, fits geometry in the clear canvas region, and centres in that region. It retains the existing40 px margin inside that area. The narrow vertical left view rail is not classified as a top obstruction. Hidden, zero-area and off-canvas controls do not reserve space. If canvas layout momentarily reports zero size, the last measured canvas dimensions remain the fallback.

For the recorded fixture, the clear area spans approximately224.666–1170.667 px. The30 ×50 mm profile therefore fits at approximately17.32002 px/mm, with its corners at least40 px clear of both bands. Existing Front/Top/attached-frame vertical sign conventions are retained. No sketch points, constraints, features, topology/cache, model dimensions, canvas CSS or Drawing sheet fit behavior are modified. The projected3D sketch path still returns to the existing camera fitter before this2D computation.

Validation:

- `node --test tests/sketch_fit_hud.test.mjs tests/paperclip_inference_fit.test.mjs tests/planchard_sketch_zoom_limit.test.mjs`: **15/15 pass**. Five new cases cover measured HUD viewport bounds, invisible/off-canvas controls, and the actual source `fitSketch` handler for Front, Top and attached-frame signs, with every source point inside the clear area and byte-identical synthetic document geometry. The existing resize test uses the real imported helper and a momentarily zero-size DOM canvas, retaining its prior fit bounds. Existing analytic arc bounds, camera fit and zoom-limit checks pass.
- Final `npm run check` result follows below; module identifiers and659 links already passed.
- This later patch is validated by its focused tests; no result from an earlier-started concurrent full-suite run is attributed to it.

Parent browser validation: save the actual source worksheet checkpoint, reload, enter Sketch mode, invoke Zoom to fit on the30 ×50 mm base profile (or the full base ghost plus active rear sketch). Verify both extreme edges/dimensions remain clear of coach and footer/hint, then return to normal authoring. Confirm changing ordinary point/sketch parameters still drives geometry and that fit itself creates no Undo step or document change.

Owned files: `js/core/sketch_fit_viewport.js`, narrow `fitSketch` changes in `js/modeler.js`, `tests/sketch_fit_hud.test.mjs`, and actual-helper binding in `tests/paperclip_inference_fit.test.mjs`. No protected models, browser authoring or ADVANCE edits.

Final gates: npm run check passes — no free identifiers, 659 module links, 1489 source assertions. Scoped git diff --check clean.

Parent actual cold Chrome QA completed09:40: loaded saved Exercise1.6 keycm_mv0l3ysl, edited existing fullydefinednotch sketch (noaddedsketch), enteredSketch2D andZoomtofit. Actual17.51px/mm and both baseghost30x50corners/topnotch driving10/15 visible clear ofcoach/bottomhint/status, screenshot DRAFTING-1.6-cold-sketch-fit-browser-2026-10-09.jpg. FitcreatesnoUndo/documentdirty; headerCtrl+Zdisabled/cleanSave. Differentactual17.51 versus fixture17.32 reflects currentoverlaylayout, not a fixedscale promise. Parent repeated15/15focusedPASS. Finishedexisting sketch, returnedDrawing, exacttwo4LFnotes readCancel, cold export follows separate nativeaudit.
