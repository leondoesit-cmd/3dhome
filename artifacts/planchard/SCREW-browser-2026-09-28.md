# SCREW — exercise 6.4, fresh Chrome construction

Source: PDF page 304 / printed page 6-36. Created from a blank document in desktop Chrome, with the dark application theme, under `Planchard SCREW - rebuilt 2026-09-28`. No older model was used.

## Construction and comparison

- Front sketch: five lines and a centerpoint arc, six entities total; four driving line dimensions, fixed origin and arc center, vertical arc-end relation, reference overall-height dimension. Fully defined, 0 DOF.
- Shaft Ø.190 × .375 in; head Ø.373, crown R.304, overall uncut height .500 in. Arc center Y=.196 in; side intersection Y=.43607030220333376 in follows the circle equation.
- 360° Y revolve; a new fully defined Front rectangle makes the .050 in Mid-plane recess, floor Y=.470 in (.030 below the crown).
- Fourfold circular feature pattern about Y, followed by a .010 in circular rim fillet. Six authored history steps, one solid; Plain Carbon Steel, 7.85 g/cm³. ANSI inch, third-angle, Letter drawing settings.
- Actual exported history independently replays through the exact kernel without issues: 13 compiled kernel steps; volume .3356317225676424 cm³; mass 2.634709022 g. Bounds 9.474202 × 12.64760182 × 9.474202 mm. Recess cuts remove the original apex, so the final height is below .500 in.

## Acceptance

The final fresh document is `Planchard SCREW - rebuilt 2026-09-28 final`. Save-as-copy preserved the original checkpoint after a revision conflict. A clean Chrome reload and library reopen restored all six steps, both fully defined sketches and a successful rebuild without the stale fillet diagnostic. STEP export succeeded in 1.347 seconds. The final exact mass card shows 335.6317 mm³ and 2.634709 g with the correct recessed crown visible.

The final geometry follows the print; two interaction sequences differ: the crown was drawn directly with Centerpoint Arc rather than Tangent Arc/Trim, and the recess was manually sketched rather than using Convert Entities. A separate construction centerline was not added; the profile's axis boundary and Y reference axis define the revolve. These workflow differences remain recorded rather than counted as an exact tutorial reproduction.

Final unmodified Chrome downloads: `SCREW-final-browser-2026-09-28.mforge` and `.step`; screenshot `.png`. Verification command: `node scratch/planchard/verify-fresh-browser-part.mjs artifacts/planchard/SCREW-final-browser-2026-09-28.mforge`. The earlier artifact remains a checkpoint with the now-resolved restored-state diagnostic/export problem.
