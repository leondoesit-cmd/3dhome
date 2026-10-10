# Chapter 11 FFF independent implementation review

Read-only source/code/test review of the new bounded raster implementation.
No browser, CAD, saved artifact, ADVANCE or commit operations performed.

## Source and genuine behavior

Source PDF 541–544 / printed 11-21–24 discusses slicer machine-code output,
walls, top/bottom skins, infill, speeds, support placement and bed adhesion.
The new implementation supplies actual digital geometry for those operations:
native prepared mm/Z-up print meshes → closed geometric sections → even/odd
raster regions → conservative closed wall loops, rectilinear skin/infill,
vertical-column support and skirt/brim/raft paths. These are separate from the
previously accepted mid-slab Layer analysis.

Concave regions, holes and diagonal island contacts are handled by masks and
closed traced boundaries, rather than convex-only offsets. Support is seeded
from unsupported regions relative to the previous layer, propagated downward,
and masked away from model regions; bed-only mode removes columns not continuous
to the first layer. Raft creates extra deposition layers and raises the model.
G-code uses explicit mm coordinates, absolute XYZ/E, specified speeds and
computed filament extrusion. It contains no printer homing/heating/retraction
commands and is qualified as an illustrative digital study.

The UI requires saved Print setup and a validated native solid, uses actual
chosen placement and custom 0.01 mm / 5° native tessellation, guards document
identity/source stamp/dialog changes before publishing, and refuses exporting
settings changed since Apply. It persists study settings separately from CAD
features. Accepted STL feasibility evidence explicitly retains
`actualBrowserSlicerAcceptance:false`; it is not browser acceptance.

## Concrete defect sent to implementation owner

Initial `toolpathsFromLayers` and G-code bed checks considered centerlines only.
Reproduced with a 10×10 mm square on a 10×10 mm bed, grid 0.125 mm, line width
0.4 mm, Brim and adhesion width 0: accepted boundary path centers at ±5 mm,
although deposited beads extend to ±5.2 mm. Default grid 0.2 happened to reject
the same case through floating-point rounding; that did not resolve the defect.
Sent to theory agent and parent: include half bead width in deposited XY
footprint/bounds, validate explicit finite positive bed dimensions, and enforce
the same envelope independently in G-code export. The implementation owner
corrected both checks and added the binary-exact regression and independent
G-code envelope test. Independent rerun: 10/10 core/UI tests PASS. The new
original-contour bead clearance guard also rejects a 0.01 mm sub-grid slot
rather than extruding a bridge through it. No remaining blocking defect was
found within this bounded review.

## Limits that must remain explicit

This is a bounded raster digital study, not a verified production/printer
profile. The two-cell conservative margin shifts exterior wall centers inward
and hole walls outward; it can omit narrow regions. Thin-region diagnostics
currently detect whole objects with no resolved walls, not every partially
collapsed narrow branch. Rectilinear pattern only; shared wall/skin and
infill/support speeds; support angle, filament diameter and raft layer count
have core settings but no dedicated controls in this initial form. There is no
adaptive width, path optimization, travel collision avoidance or retraction.
Volume uses a rectangular bead approximation; time excludes travel and
acceleration. Mesh/grid/path/layer budgets reject oversized jobs. Physical
printing, material behavior, printer compatibility and support removal access
remain separate evidence requirements.

## Validation

Initial independent run: 8/8 PASS; final independent run after the concrete
fix and sub-grid clearance regression: 10/10 PASS. Tests include hole
avoidance along segments, concavity/island loops, density comparison, true
internal shoulder support, Every­where versus bed-only support, adhesion/raft
geometry, extrusion replay, native-prepared UI settings/export, stale native
preparation and cancelled dialogs. Actual Chrome acceptance remains parent's
work; no full-suite claim made here.
