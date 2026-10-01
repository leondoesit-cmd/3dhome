# Advanced sample Question 1 — fresh browser reconstruction

Source: ebook PDF page 504, drawing on printed page 10-24. Started from an empty desktop Chrome document, inch units, September 30, 2026.

Current checkpoint has four editable history steps, two fully defined sketches and one native solid:

- Rear flange: Front-plane 3 × 3 in centered rectangle, four R0.50 sketch fillets. Its untrimmed lower-left construction corner is fixed; width, height and all radii remain driving dimensions. Plane offset 2.20 in; Blind boss 0.40 in, along normal. Native face locations visibly read Z 5.588 and 6.604 cm.
- Connecting boss: independent Front-plane circle, origin fixed and driving diameter 1.10 in; Blind boss 2.20 in along normal, merged with the rear flange.

Saved to the library and exported through Output → Project bundle. Protected `artifacts/planchard/ADVANCED-Q1-rear-tube-checkpoint-browser-2026-09-30.{mforge,jpg}`. This is an unfinished checkpoint, not a completed exercise.

Remaining: scalloped front flange (four R0.50 convex corners / four R1.50 concave sides, A = 2.00 in hole-center pitch), Ø0.75 through bore, front Ø1.50 × 45° entry and 0.10 protrusion, R0.10 junctions, eight Ø0.35 flange holes, Aluminum 1060, native mass/COM verification and save/reopen/export acceptance. The figure’s 2.60 in axial overall is used for the two main flange outer faces; dimensions are read from the figure, not fitted to the published mass.

## Continued browser build
Front flange now committed as a 3 x 3 inch centered Front-plane sketch with four driving R0.50 corners, followed by a 0.50 inch boss. Four R1.50 circular cuts use centers at (+/-2.732050808,0) and (0,+/-2.732050808) inches; that distance is 1+sqrt(3), derived from tangency to the R0.50 lobes centered at (+/-1,+/-1). A visible four-copy 90-degree sketch pattern produced four fully defined circles, then a Blind 0.50 inch cut along normal. Current model: eight editable steps, four fully defined sketches, one native solid, clean library save.

Independent source reread corrects the earlier entry interpretation: the diameter1.50 x45degree leader points to the outer annular slope. The 0.10 axial projection is interpreted as an external collar taper from diameter1.50 at the flange to diameter1.30 at its outer end, with a straight diameter0.75 bore. This is a drawing-based inference, not a mass fit. Collar, bore, holes and junction fillets remain unfinished.

Protected eight-step browser checkpoint: `artifacts/planchard/ADVANCED-Q1-scalloped-flanges-checkpoint-browser-2026-09-30.mforge` (1,153,425 bytes) and companion JPEG. The next Front-plane sketch is an origin-fixed diameter 1.50 inch circle, fully defined. A Reverse-normal 0.10 inch boss with positive inward 45 degree draft has been committed through the visible extrusion form; its native replay is still computing, so the collar is not yet accepted.

## Fifteen-step audit checkpoint

The collar and symmetric through-all diameter 0.75 bore subsequently completed. A seventh fully defined Front sketch places four diameter 0.35 holes at (+/-1,+/-1) inches, using a fixed origin point and a four-copy 90-degree circular pattern. The symmetric through-all cut produces eight flange holes. The fourteen-step document was saved, reopened in a new Chrome page and rebuilt successfully as one native solid. Protected bundle: `ADVANCED-Q1-eight-holes-checkpoint-browser-2026-09-30.mforge` (2,862,416 bytes), with screenshot.

Two actual circular junction edges, radius 0.55 in at Z 0.50 and 2.20 in, were selected through the fillet UI; its seam edge was deselected. A radius 0.10 in native fillet succeeded, giving fifteen editable steps. Aluminum 1060 was assigned through the material inspector; the exercise's explicit 0.097 lb/in^3 density overrides the stock nominal 0.0975 and is recorded in the engineering material data. Protected fifteen-step bundle: `ADVANCED-Q1-fillets-mass-audit-browser-2026-09-30.mforge` (4,794,819 bytes), with screenshot.

**Not accepted against the book's mass answer.** Before the density override, the native result was 7.529691 in^3, 0.7341449 lb at 0.0975 lb/in^3, centroid (0,0,1.283224) in. Published volume is 6.01 in^3 and centroid Z 1.51 in. The front profile also retains short straight portions between the quarter-circle corner fillets and concave cuts; a smooth tangent outline needs longer convex arcs. An independent arc-area calculation gives 7.52481118889 in^2 for the inferred smooth front outline, so correcting those short segments alone cannot explain the mass discrepancy. Dimensions remain under audit; no mass-fitting changes were made. The rear and front 2.00/A leaders were independently checked as hole-center pitch dimensions.
