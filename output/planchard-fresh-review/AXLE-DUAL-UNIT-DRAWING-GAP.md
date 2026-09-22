# AXLE exercise 5.6: dual units and ANSI drawing setup

Browser reproduction, 2026-09-22. Source: Planchard ebook PDF page 259 / printed 5-41. The AXLE exercise requires IPS primary units, dual-unit dimensions, and ANSI overall drafting standard. The illustration uses diameter .188 [4.78] and length 1.375 [34.93].

## Saved checkpoint

Model **AXLE - exercise 5.6 - Aluminum 1060** has a drawing with inches, three decimal places, trailing zeros and third-angle projection. Title block: AXLE, Aluminum 1060, measured mass 1.688024 g. Cleared the unrequested default ISO 2768-m general tolerance rather than assigning unsupported manufacturing tolerances.

## Reproduction

1. Open the saved model and switch to Drawing.
2. Expand Sheet. Units offers mm, cm, m, in; there is one precision selector and no secondary-unit control.
3. Select in and precision 3. No millimeter equivalents can be configured.
4. Expand Title block. General tolerance initially remains ISO 2768-m. There is no ANSI overall drafting-standard selector. Changing units alone does not establish ANSI formatting.
5. Focused source search confirms no dual-unit/alternate-unit fields in the drawing implementation; cad_sheet.js supplies the default ISO tolerance.

## Required change

Add a persisted drafting-standard setting and independent primary/secondary units and precision. Render secondary dimensions from the same measured geometry, not manually entered annotation text. Support the ebook's inch-primary, millimeter-secondary output with bracketed metric values. Keep general tolerance an explicit separate choice; do not infer a manufacturing tolerance merely from units or drafting standard.

Acceptance: AXLE diameter displays 0.188 [4.78] and length 1.375 [34.93]. Editing geometry updates both values. Sheet reload, SVG export and print retain the selected standard, units, precision and formatting. Verify linear, diameter/radius and tolerance annotations; angle values must not undergo length-unit conversion. Confirm settings do not alter the model geometry or mass.

Stopped at this new functionality gap as instructed. No application code changed during this continuation. Dimensions have not yet been placed; the drawing is a saved setup checkpoint, not a completed manufacturing drawing.
