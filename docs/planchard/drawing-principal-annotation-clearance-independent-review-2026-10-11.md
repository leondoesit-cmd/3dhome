# Independent review — principal annotation clearance

**Accepted within the bounded automatic-layout scope.** Read-only review of UI agent's frozen `js/cad_sheet.js` changes and new `tests/cad_sheet.test.mjs` regression; reviewer made no production/test edits and did not run browser work concurrently with parent authorship.

`node --test tests/cad_sheet.test.mjs`: **66/66 PASS** independently. The new seven-view test covers first/third-angle projection and both −12mm/+12mm horizontal automatic overall dimension offsets. It checks real rendered caption/dimension items against other view geometry, positive upper-band separation, negative lower-caption clearance, zero geometry overlaps, projection alignment, authored-document identity and preservation of explicitly placed Top Y123. Existing dimensions, sections/details, fixed scales, manual view alignment, save/Undo and SVG tests remain green.

Source review confirms:

- `dimensionItems` uses signed horizontal paper offsets: negative lies below its reference midpoint, positive above. The new helper reserves a conservative outward band from the view outline plus the caption allowance; it does not claim an exact glyph bound.
- Principal cluster metrics separately retain the primary, above and below vertical bands. Placement uses the two opposing annotation bands when determining each vertical gap, and includes outer bands in the cluster height used to choose a fitting standard scale. Merely increasing a local gap without adjusting fit height would be insufficient; this implementation handles both.
- First/third-angle side selection and shared horizontal alignment remain intact. The accepted separate Rear-column reservation is preserved. Explicit authored positions still pass through the existing `num(view.x/y, automatic)` rule and are not rewritten to improve layout.
- Automatic horizontal bands apply only to `auto:"extent"` dimensions. Manually placed dimensions/runs retain their existing interaction/layout behavior; this change does not promise arbitrary annotation collision avoidance. Oversized forced unannotated scales preserve existing best-effort behavior rather than silently overriding the chosen scale.

No confirmed defect was found within this finite scope. The regression's proxy box intentionally uses the actual BRACKET witness extents to test layout, not to claim regeneration of its original native shape. Source projections/canonical CAD are not edited by these functions. Actual corrected Chrome warm/cold BRACKET acceptance belongs to the parent's separate browser witness; this review does not assert it has happened.

Final owner gates were pending at the independent test completion; their result is recorded below when available. These targeted tests are not a fresh full-CI pass.

Final owner freeze confirmation: `npm run check` exited0, no free identifiers, **691** linked modules and **1487** assertions PASS; owned source diff clean. Independent review remains accepted, with no reviewer production edits.
