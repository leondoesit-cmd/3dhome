# CYLINDER 9.2 — drawing and preview repair

The fresh part was originally built from blank in Chrome by the main agent:
Front annulus Ø1.500 / Ø.625 in, Blind 2.000 in, fully defined, two history
steps, AISI 1020 at 7.90 g/cm³. No older geometry was used. This repair reopened
that same fresh library part in independent desktop Chrome dark-theme tab 752;
the original tab 649 and checkpoint were preserved.

## Browser acceptance

- Model → Drawing → Model returned responsive UI in under one second per mode
  change after loading the classic preview renderer.
- Exact regeneration completed in the live browser before final drawing save.
- Front shows two circular rims and center marks, with no triangulation diagonals.
- Right shows its rectangular outline and exactly two hidden bore lines.
- Shaded Isometric shows the whole annular cap and open bore, without missing
  fan triangles. The final vector SVG contains real geometry, not a raster image.
- Save to library displayed success. Project bundle and SVG were downloaded
  through their visible browser commands and copied unchanged into this folder.
- After a full browser reload, the saved model reopened with exact dimensions
  1.500 × 1.500 × 2.000 in. Exact Mass props showed 47.86169 cm³ and .3781073 kg.
  With that card still visible, loading fresh AXLE removed the card from the
  accessibility tree and set its DOM hidden attribute. The CYLINDER drawing was
  then reopened and left visible; `EVALUATION-document-switch-browser-2026-09-28.png`
  captures the successful switch with no stale mass result.

Artifacts: `CYLINDER-9.2-drawing-repaired-browser-2026-09-28.mforge`, `.step`, `.svg`, `.png`.
The separate `CYLINDER-classic-preview-browser-2026-09-28.png` captures Model mode.

The actual driving Blind depth was edited through the feature inspector from
2.000 to 2.100 in, committed and exactly rebuilt in Chrome. Mass props changed
to 50.25477 cm³ / .3970127 kg; the drawing's linked length changed to 2.100.
Model-history Undo restored 2.000 in and 47.86169 cm³ / .3781073 kg. Save and
library reopen retained two steps, a fully defined sketch and the restored
drawing. The visible Export STEP command reported success; the 9,494-byte STEP
was copied unchanged from Chrome Downloads. Three additional PNGs record the
upstream edit, updated drawing, restoration, and a fourth records save/reopen.
Drawing-mode history acceptance now passes with both keyboard and visible
Undo/Redo buttons. The restored document invalidates the cached projections
and refreshes the Sheet inspector; CSS no longer suppresses pointer events
on the two history controls. The linked length returns to 2.000 without
leaving Drawing. `CYLINDER-9.2-drawing-undo-browser-2026-09-28.png` records the
clean restored sheet, and the Redo PNG records 2.100.

After the Chrome runtime restart, independent tab 710849172 loaded the same
fresh saved CYLINDER and entered Drawing immediately after a 2.100 in feature
commit. The exact result appeared with the complete shaded annular cap, two
bore hidden lines, and no dangling dimension warning, without another mode
switch or manual repaint. `CYLINDER-9.2-late-exact-drawing-browser-2026-09-28.png`
records this result. The kernel was warm and the transient lightweight phase
completed before the accessibility snapshot; the late-publication callback
is also covered by a deterministic behavioral regression. Final Undo restored
the printed 2.000 in depth and clean saved state.

## Product repairs

- Editor previews use the vendored classic WebGLRenderer directly, bypassing
  the WebGPURenderer TSL node graph builder seen in the recursive shader stack.
  Planner WebGPU rendering stays on its existing path. Both renderers share
  the same Three core scene/material classes. Section clipping is synchronized
  onto model materials, including asynchronous geometry, and restored on disable.
- Bridged-hole ear clipping recognizes doubled bridge endpoints. The actual
  26-outer/17-inner fallback annulus now has 43 cap triangles covering exactly
  9.355703805730828 cm², instead of the previous incomplete 5.633878658257278.
- Paired fitted cylindrical rims identify axial facet seams independently of
  the crease threshold. Silhouettes remain and are placed at fitted radius;
  Right bore lines are now exactly ±.79375 cm and 5.08 cm long. Sharp box edges
  remain. Hidden rear-rim chords yield to coincident visible circles.
- Switching documents closes the previous evaluation card; pending mass
  results already reject a changed document or closed card.
- Late exact mesh publication invalidates and repaints a visible Drawing,
  including its association diagnostics, even when no 3D preview exists.

Focused renderer/transition/evaluation/annulus tests pass; related exact collar,
flat-bar and shaded drawing regressions also pass. `npm run check` passes.
Full CI is not claimed.

Remaining book deviations: redundant automatic overall dimensions, no THRU
suffix/company graphic, and a different title-block arrangement. General
intersecting shaded surfaces still use average-depth
painter ordering. Closing diagnostic tab 569 did not recover an already frozen
older renderer process; fresh-tab draft recovery was handled by the main agent.
The ebook reconstruction is not complete.

## Drawing history follow-up

Model-history restore now invalidates the drawing cache and refreshes its
inspector. The Drawing header CSS exempts enabled Undo/Redo controls from
pointer suppression. The UI agent verified keyboard and visible-button
Undo/Redo in Chrome, restored the driving length from 2.100 to 2.000 in,
and saved cleanly. Proof: `CYLINDER-9.2-drawing-undo-browser-2026-09-28.png`.

Late exact geometry publication also invalidates the projection cache and
refreshes the visible sheet/inspector. A behavioral test exercises publication
after the sheet has cached a lightweight body, including with no WebGL preview.
All three history/publication tests pass. Final Chrome verification of this
arrival timing remains open because the Windows sandbox cannot start browser
automation (`apply deny-read ACLs`).
