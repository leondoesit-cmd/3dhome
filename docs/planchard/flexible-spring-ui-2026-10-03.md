# Flexible spring UI and exact endpoint safety

Source changes only; root owns Chrome verification and saved book geometry.

## Workflow

Select SH06 spring, open Finish inspector, choose Flexible spring…, select SH03 moving rod and Positive travel extends. Apply from the exact Extended configuration captures the current rod and spring positions (root checkpoint rod Y45 mm, spring height25 mm).

Motion study Linear motor with signed travel−15 mm: sampled time0.5 produces height17.5 mm. The amber procedural tube preserves circular2 mm wire sections and leaves native source meshes unchanged. This intermediate state is explicitly a visual preview. Save, publication, bundle, STEP, GLB, drawing export/print and exact interference reject it. At time1 the Compressed10 mm saved configuration is regenerated natively before being marked exact. Restore exact spring and remove binding returns the captured endpoint configuration. Cancel during the initial asynchronous binding restores the original definition and invalidates the pending worker result.

Motion presently samples the user selected time when Apply is clicked; this change does not introduce realtime playback. Supported spring source is one circular, constant radius/pitch helix sweep body with matching endpoint wire diameter, radius, turns and axis. Additional finish features are rejected rather than silently approximated.

## Verification

29 related tests passed, including source driven endpoint native completion, failed exact restore, cancellation during pending binding, all wire ring radii, immutable native mesh, translation invariance, preview export guards, component worker mesh restore, assembly units, custom property persistence and linear motion forms. npm run check: no free identifiers,624 linked modules,1490 source assertions. git diff --check clean.

Assembly Undo serializes complete assembly metadata including context.units and syncs the document header on restoration. The observed distance caption/parser discrepancy came from feature field rendering with the inactive part units; the motion agent fixed that renderer to honor explicit input units and active document units.

Hard reload required for browser validation. No saved geometry or assembly artifact was authored by this agent.

## Native spring drawing edges

The assembly drawing bake and part tessellator discarded native faceRanges. Hidden line projection therefore mistook coarse triangles within a single B-spline wall for geometric creases. These stages now preserve native face identity; only within-face crease candidates are suppressed. Open boundaries, boundaries between native faces and front/back silhouettes remain intact, with unchanged fallback for untagged meshes.

Read-only SH06 native proof mesh diagnostic:57320 triangles/four native faces; visible isometric segments3273 before vs2646 after, with identical projected bounds.16 targeted drawing tests pass including native smooth facets, silhouette preservation, sharp edges, true annular rims/bores and collar visibility. Root must reload and re-export for visual verification; no SVG/model artifacts changed by this agent.

### Continuous outline consolidation correction

Remaining spring speckling was not hidden ink: isometric hidden lines were already omitted. Closed native SH06 mesh had zero open welded edges and no flipped adjacent face normals. The defect was HLR line consolidation using scene span×0.0015: nearby curved chords were grouped and moved onto the first chord's line, separating shared endpoints. Projection consolidation now uses numerical span×1e−7 (floor1e−8); public consolidateSegments remains unchanged.

Read-only exact saved SHOCK assembly checkpoint with its seven exploded steps applied to an in-memory copy:4450 numerical-consolidated visible segments have124 dangling endpoints, versus3626 pen-consolidated segments with3616 dangling endpoints. Projected bounds unchanged. An experimental smooth normal contour replacement was not retained because it increased split fragments.23 targeted drawing tests and65 additional HLR/sheet/real-hole regressions passed. Caption singular DOF string no longer includes a redundant1 since countLabel already supplies the count.

### Quick-form unit captions

Six live length form captions (Sketch Pattern pitch, Offset, Edge length, Shell wall thickness, sheet metal thickness and flange length) no longer hardcode cm in either language. Their existing unit badges and numeric conversions follow the active document. Actual Sketch Pattern regression:30 cm default displays300 mm, and typed45 mm converts to4.5 cm internally; no geometry semantics changed. Five quick-form unit tests passed. Extrusion numeric feature fields already use active document units; the reported60/600 widget mismatch remains under investigation pending its DOM element identity.

### Instant3D document units

Root's real DOM identified the incorrect widget as md-instant3d-value: it displayed0.6 under an mm caption while the numeric feature form correctly displayed6 mm. The chip previously displayed raw internal centimetres, parsed typed display values as centimetres, and the handle-to-form update likewise wrote centimetres directly into unit-aware form fields. Pure Instant3D display/model conversion helpers now map lengths through document units while leaving angles unchanged. Chip display, typing and handle→form updates use those helpers; per-field label metadata avoids the fused Depthmm (mm) tooltip.0.6 cm now displays6 mm and typing6 mm publishes0.6 cm exactly once. Focused text and12 significant digit precision are preserved.65 targeted tests passed including mm/cm/in, angles, actual chip renderer/input handler, numeric form parsing, stale poses and existing drag/performance behaviour. Source/link gates passed624 modules. Hard reload needed for browser verification.

### Native bundle capability metadata

QC01/QC03/QC04 browser bundles retained the empty new-document cached direct-only classification despite successful editable native histories4/6/8. UI status already reinfers capability from current history. createProjectBundle now refreshes only ModelForge-authored parametric-v1 snapshot classification from current recipes, sketches and body kinds, retaining conservative hybrid/direct results for actual imported/direct geometry and preserving catalog/external explicit modes. Live document state is not mutated. Read-only real QC01/QC03/QC04 bundles each produce fully-parametric export snapshots with unchanged body geometry/history;11 bundle/classification tests pass. Root must reload and export each through browser to replace stale downloaded metadata.
