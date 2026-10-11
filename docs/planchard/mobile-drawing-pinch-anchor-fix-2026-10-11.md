# Mobile Drawing pinch anchor repair

The parent reproduced a stationary-centroid two-finger pinch on the saved Orthographic worksheet: zoom increased while Top moved down and Front left the viewport. The first contact had started a single-pointer paper pan; its subsequent pointer moves overwrote the offsets produced by pinch zoom.

The Drawing controller now cancels an initial pan or primitive draft when the second contact arrives. If a view, dimension or note drag already moved, takeover restores its original layout and cancels its provisional history transaction. Pointer moves and releases remain guarded throughout the two-contact gesture and its remaining single contact. Pointer cancellation does not prematurely release that guard: only the native touchend/touchcancel event with no remaining contacts ends it. A subsequent fresh single-pointer pan works normally.

Drawing pinch zoom now follows the actual distance ratio rather than applying a fixed wheel step per event. The existing wheel anchor calculation receives `log(previousDistance/currentDistance)/log(1.0016)`. Sketch and 3D gesture branches retain their existing behavior. No authored drawing, CAD geometry or saved library data is changed by zoom.

Modified production files: `js/modeler_drawing.js` (controller gesture ownership) and the existing canvas gesture listener region in `js/modeler.js`.

Validation: `node --test tests/drawing_pinch.test.mjs tests/drawing_primitives.test.mjs tests/cad_sheet.test.mjs` passed **81/81**, with no skips. Tests execute the actual extracted production touch listeners against the real Drawing controller: interleaved pointer moves retain a stationary paper anchor; a 50→130 pixel spread yields exactly 2.6× zoom with 1, 6 or 1000 move events; view/note takeover restores layout and cancels history; primitive drafts do not commit; cancelled pointer IDs cannot release contact ownership. Existing paper primitive/history and sheet layout tests remain green.

Final `npm run check` exited 0: no free identifiers, **692 linked modules** and **1487 source assertions** passed. Owned diff whitespace checks are clean. The gate log is `scratch/planchard/mobile-drawing-pinch-gates-final-2026-10-11.log`. Parent-owned actual phone acceptance followed these checks and is recorded below.


Parent actual phone acceptance: cold reload updated app, SavedBridge15annotations/4notes reopened through touch, nativeFit, identical50→130px stationary-centroid spread over6moves. TOP stays above FRONT and RIGHT stays visible; fresh one-finger upward20px pan resumes after contacts lift. Actual screenshots orthographic5-touch-zoom-verified.png / orthographic5-touch-pan-after-pinch.png. Native SVG after gesture byte-identical to original (SHA25641da231c7f0788a18cd9bb7a08cc59f69a15fbe03c963d8341236382252421eb). No physical-phone claim.
