# Fresh HOUSING - HandlePath (book PDF 350-351), stopped mid-handle

Status: PARTIAL. Continued from the canonical 15-step `Planchard HOUSING - rebuilt 2026-09-28` (Thread sweep, 185.8030 cm3). No new protected `.mforge/.step/.png` export exists for this stage because the Chrome session became unusable before Save (see Blockers). The previous protected bundle `HOUSING-thread-browser-2026-09-28.{mforge,step,png}` is unchanged and remains the last accepted HOUSING state.

## Done in actual desktop Chrome (dark theme, real UI, no injected geometry)

- The Chrome profile in use had an empty model library (IndexedDB `home3d_model_library` had 0 models). The library was refilled with the app's own Model > Library > "Restore from disk backup" (50 models). The canonical HOUSING was then opened from the library card; the cold Shell/Boss-Stop exact rebuild finished in about 6 minutes, 15 steps, one solid.
- Sketch 16 on the Right Plane (Z-Y view) authored with the sketch tools and typed lengths, then renamed `HandlePath` through the tree context menu (Rename). Tree reported `16 HandlePath - Right Plane - fully defined`.
  - Construction centreline 0.254 cm from the origin along -Z (Boss-Stop back face Z = -0.254, from the Boss-Stop feature: sketch on Front plane, Z 0 to -0.254).
  - Construction centreline 6.35 cm up (2.500 in from the origin, book step 481; typed `2.5in` was accepted and converted to 6.35 cm).
  - Path line 14.224 cm toward -Z (ends at the housing back end Z = -14.478 = -3.302 - 11.176 from Boss-Loft/Boss-Battery).
  - Path line 1.93941476 cm down to Y = 4.410585 cm, the housing top at its back end (Boss-Battery profile top 4.605663 cm minus 11.176 cm x tan 1 deg draft).
  - 2D Sketch Fillet R 1.27 cm (0.500 in, book step 461) at the top-back corner.
  - Sketch status: Fully defined.
- Deviation from the book: the book gets the two path ends from Coincident/Intersection relations to model edges of the Boss-Stop and Housing. Selecting model edges as relation targets was not possible in the sketcher (Ctrl-click on a model edge selected nothing; Project projects a whole-body bounding rectangle; Convert silhouette is cylinder/cone only), so the same positions were entered as derived driving dimensions from the stored feature parameters. If Boss-Stop thickness, base depth or the Boss-Battery depth/draft change, HandlePath will not follow. This is an app gap (external edge relations in a plane sketch), not fixed.

## Not done

Handle profile (slot 1.000 in centres, R .100 in, Pierce to HandlePath), Handle sweep, SwitchHole, Rib1, LPattern1, LongRibPlane, Rib2, Mirror1; Save, library reopen, driving-dimension edit/Undo, native STEP, PNG. Nothing beyond HandlePath was authored, and HandlePath itself was never saved to the library (only the app's autosave draft could contain it; the tab froze first).

## Blockers observed (environment, not geometry)

- Several agents drive the same Chrome window/renderer. The window was repeatedly minimized (JS saw `visibilityState hidden`, `outerWidth 159`), which throttled the page: screenshots timed out about every other call, layouts flipped between a 2560 and a 1032 css-px viewport, so clicks placed from a screenshot taken in the other layout hit the wrong controls. `resize_window` only helped briefly.
- Consequence of that flakiness: stray keystrokes typed "HandlePath" as tool shortcuts (F2 did not open an inline rename), which suppressed sketch 16 and created an empty sketch 17 until Undo/Unsuppress repaired it. Lesson: rename through the tree context menu, not F2 typing.
- After many wheel/resize calls the WebGL render loop threw `RangeError: Maximum call stack size exceeded` in three.js `renderBufferDirect` (via `js/gpu.js:157`, `editor_view.js:479`), the app showed "Something went wrong", and the renderer stopped answering CDP (`Runtime.evaluate` timeouts of 45 s, even after a forced reload). Not reproduced on a healthy tab, so no source change was made; it looks like a consequence of the hidden/minimised window plus resize thrash. Note for whoever continues: tabs of one origin share a renderer process, so another agent's cold Shell rebuild also freezes every sibling tab.
- Face-based sketch on the Boss-Stop back face was started (New sketch, click face; the app named it `Face - feature_mukla4fv_1:tool:face:start` and turned the camera) but not confirmed to be the Z = -0.254 back face rather than the Z = 0 front face; the Pierce relation would have proved it.

## Method notes for the next run

- Line/Centreline tools accept typed input: after the first click type length, Tab, angle, Enter. In the Right (Z-Y) sketch, angle 0 goes toward +Z (screen left), 180 toward -Z (screen right), 90 up, 270 down. Typed lengths become driving dimensions.
- Smart dimension between two points is always an aligned dimension; use point-to-line for horizontal/vertical distances.
- Sketch on face: New sketch, then click the face in a Back view; use tree Rename from the context menu.
