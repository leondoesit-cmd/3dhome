# Actual FLAT adhesion browser exports

The actual Chrome Skirt and Raft exports preserve the accepted FLAT's sketches, features and six history steps. Independent native regeneration yields one valid connected solid, volume 102.18606488694857 cm³. Fresh native section checks pass for every actual model bead segment. Top orientation, 150 mm bed, 0.2 mm layers/grid, 0.4 mm line width, 20% infill and support Off remain fixed. Cold replay is pending.

Skirt passes 18 native/source/export checks: 204 layers, two first-layer skirt loops, 11971.194018641852 mm filament. The exterior centreline lies approximately 3.6 mm from the native outer footprint, consistent with the selected 3.5 mm spacing under 0.2 mm raster quantization and the book's 3–4 mm recommendation (PDF 544 / 11-24). The second loop surrounds the internal opening; this is disclosed rather than described as an exterior-only skirt. The actual first-layer SVG and complete G-code are byte identical to regeneration from the protected actual JSON.

Raft passes the same 18 native/source/export checks plus 10 independent role/bed/witness checks. Its first two planes contain 152 raft paths at Z 0.2 mm and 279 at Z 0.4 mm. The first model plane contains 156 paths at Z 0.8 mm. Every model plane is raised 0.6 mm; native CAD stays in its original placement. All model XY paths are byte identical to the same-grid Skirt variant, all deposited bead envelopes fit the bed, and all three actual layer SVGs match the protected actual JSON. Raft has 206 layers, 13002.544242233203 mm filament and zero support volume.

Compared with the no-adhesion 20% baseline, adhesion padding changes the raster origin and infill phase: wall count stays 535, skin changes 1833 to 1837, and infill changes 5120 to 5122. Exact source/native identity is established, but complete path identity to the no-adhesion baseline is not claimed.

The initial actual Brim diagnostic remains rejected: its exterior bead envelope has a 0.2 mm air gap, despite an inner-hole loop touching material. The generic exterior deposition-envelope repair is separately tested and awaits actual browser replay. Source-sized geometry and strict model/support guards remain unchanged.

These are digital path and source audits. Physical printer execution, adhesion performance and device settings have not been tested. Audit JSON companions use the `CH11-FLAT-skirt-browser`, `CH11-FLAT-raft-browser`, and `CH11-FLAT-brim-DIAGNOSTIC-browser` prefixes dated 2026-10-10 in `artifacts/planchard`.
