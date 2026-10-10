# Normal To with no selected drafting frame

Confirmed parent actualChrome issue: from arbitrary/isometric orbit without selected face/active sketch, `orientModelToView(true)` fell through to `orbitTo`, leaving a perspective camera. The ordinary Perspective button also reported retained orbit preference instead of the current fixed-frame projection. Source Chapter4 Normal To is a drafting view workflow; neither behavior should imply an orthographic normal view while perspective remains active.

Bounded production fix in `modeler.js::orientModelToView` supplies the current Top/Front/Right datum when valid, or explicitly Front for an arbitrary orbit with no defined plane. Existing selected face/sketch frame remains first priority. It uses genuine `lookAtFrame`, enforcing orthographic Normal To and retaining orbit projection preference for later return. No source face/dimension is invented; Front is a disclosed UI fallback, not a recovered selected source face.

`syncViewButtons` now reports Perspective unchecked while fixed Normal To is active, with control disabled and its retained-orbit-preference explanation. Returning to orbit restores actual prior preference. The fix does not alter CAD authoring functions.

Focused `node --test tests/editor_orbit_projection.test.mjs tests/editor_projection.test.mjs tests/committed_sketch_plane_ui.test.mjs`: **17/17 PASS**. New regression invokes actual handler with absent face/sketch and arbitrary orbit, genuine camera switch, and actual button sync; verifies Front datum, real orthographic camera, retained perspective orbit preference, unchecked/disabled button, and refusal to call perspective orbit fallback. Existing drafting frame and picking regressions remain green.

Final independent `npm run check` **PASS**: no free identifiers,689module/link,1487assertions. This follow-up invalidates any pre-change full-CI claim. Parent owns actual browser reload/witness/cold and Git checkpoint.
