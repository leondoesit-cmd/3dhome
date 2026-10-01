# Sketch fillet: preserve fixed sharp corners

## Repair

`js/sketch_fillet.js` now recognizes a point's `fixed: true` flag as a constrained corner, in addition to explicit constraints. A retained line-line corner is marked `virtualSharp` and constrained to both trimmed lines. This holds their original intersection while the fillet radius changes. The line-arc path also recognizes fixed point flags.

Previously, coordinate-form fixed corners were pruned. Even corners retained through explicit constraints could remain detached from the trimmed lines when no driving length dimension existed.

## Verification

- Fresh seven-point fixed wire path, six lines: five successive fillets remain at zero degrees of freedom after every operation. Changing the middle radius and reopening a JSON copy preserve all original corner coordinates and the updated radius.
- Existing line-arc mirrored housing fillet tests remain green. Both fillet test files: 14 tests passed.
- Actual Chrome 710858422: fresh blank Front sketch, human-clicked connected L path, Fix, Sketch Fillet with Keep constrained corners checked. The result remains Fully defined. Radius changed through the inspector from 1.27 cm to 2 cm; the trimmed path remains Fully defined with 3 entities, 10 constraints and one dimension.
- Screenshot: `artifacts/planchard/SKETCH-FILLET-kept-fixed-corner-browser-2026-09-30.png`.
- Parent browser acceptance on the actual fresh binder wire: reopened the saved sharp path after reload and recreated all five R .08 in fillets through point selectors. Fully defined remained at zero degrees of freedom; the inspector retained five virtual corners with point-on-entity relations to both trimmed lines.

Existing saved sketches that already lost their original fixed corners must be recreated from their unrounded state; the missing corner locations cannot be recovered reliably from a rounded path alone.

## Blank Front origin follow-up

Fresh Chrome blank Front sketch was dragged after pressing/releasing Shift, then returned to Normal To. A settled screenshot showed origin at (1272,1087). Clicking that rendered crossing produced X 0 / Y 0 cm. The reported viewport-centre crossing at Y730 mapping to Y30 cm was not reproduced. Browser screenshot captures immediately after UI changes can show the previous paint; a separate settled screenshot is required before choosing canvas coordinates.
