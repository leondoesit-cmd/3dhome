# Brim attachment to actual deposition

The actual Chrome FLAT Brim diagnostic has a 0.2 mm gap between its exterior bead and the deposited model bead envelope. An inner hole loop contacts the model, so testing only the closest contact anywhere would falsely accept the detached exterior.

Brim now derives its adhesion footprint from the first layer's actual wall, skin and infill bead capsules. A boundary flood fills enclosed gaps in this adhesion mask only. This produces exterior contours around the deposited base, without adding Brim inside CAD holes or interstitial infill gaps. Rings start at this footprint and advance one grid cell; the validated grid spacing is at most half the bead width. Zero width retains one attached exterior contact ring. Native CAD, model paths, support clipping, Skirt and Raft algorithms remain unchanged.

The protected actual-path fixture yields **18 exterior loops**, all connected to deposited material through an independent segment-distance bead-contact network. Every loop spans the exterior FLAT footprint; the initial 294-loop candidate that included inner gaps was superseded before browser replay. Independent tests also cover disconnected model islands, diagonal deposition, invalid widths, same-grid Skirt/Brim material and support equality, closed extrusion paths and bed envelope rejection. The fixture is a read-only extraction of actual browser paths with its source SHA recorded, not CAD authorship.

Focused Brim, toolpath and exact-support regressions passed **16/16**; the three final exterior tests were rerun after adding the exterior-loop assertion. Module and link checks passed (680 modules); comment assertion gate completion is recorded separately by the parent.

Actual corrected browser creation and cold reopening remain the parent's next acceptance step. These tests establish digital attachment and source preservation; they do not certify printer adhesion or physical manufacturing. Earlier FLAT adhesion variants shift the raster origin relative to the no-adhesion baseline, so comparisons against that baseline must disclose the resulting infill phase difference rather than claim all model paths are byte identical.
