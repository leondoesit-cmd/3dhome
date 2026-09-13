# Completion of the four CAD follow-ups

Implemented after review batch 7. These changes add usable editing and geometry workflows while keeping the boundary between a geometric check and manufacturing approval explicit.

## Rack-generated gears

The gear command now opens a form for module, tooth count, pressure angle, rounded cutter-tip radius, cutter depth, backlash, face width, and mating tooth count. It generates an external, unshifted spur gear from the rolling envelope of a rounded rack cutter. The old reference generator remains available for existing records; new form-created gears record `rootGeometry: rack-generated` and their cutter parameters.

The root follows the rounded cutter's envelope and joins the involute flank. Invalid cutters, undercutting, folded teeth, and missing tip lands are refused. Pair checks calculate contact ratio, positive tip/root clearance, and whether the mating tip enters the generated root transition. The mating gear in this form shares the module, pressure angle and cutter, with an independently specified tooth count.

The outline is sampled for the native extrusion, not a mathematically exact analytic trochoid BREP. `estimatedChordErrorMm` is an estimate, not a certified tolerance. The standards audit still blocks production compliance until production tolerances, material, and load capacity are validated. Shifted, helical, and internal gears are outside this generating model and are not substituted silently.

Implementation: `js/cad_gear_geometry.js`, `js/cad_standards.js`, and the gear form in `js/modeler.js`.

### Independent geometry checks

For rack coordinates `(x,y)` relative to the pitch point, rolling transforms the cutter into the gear frame by `R(t) · (x + rp·t, rp + y)`. The envelope condition is `x′(x + rp·t) + y′y = 0`. The generator applies this to the straight flank and rounded cutter tip. A regression independently uses the inverse rolling transform to check that the moving cutter does not penetrate the generated boundary.

A 20/20-tooth, module-2, 20-degree pair gives contact ratio approximately 1.556838 and 0.5 mm tip/root clearance. Native-kernel tests build the generated profile into a solid and measure its volume.

Engineering references: [FVA cylindrical gear geometry](https://doc.fva-service.de/60/en/root-cylindrical-gear-geometry.html) explains tool-generated roots; [KHK gear dimensions](https://khkgears.net/gear-knowledge/gear-technical-reference/calculation-gear-dimensions/) describes standard external gear geometry and meshing. These references do not certify this implementation or a manufactured part.

## Editable cubic sketch splines

Choose **Cubic spline** in the Sketch ribbon. Click the start point, start handle, end handle, then the end point. A live control polygon and curve preview show the construction. All four control points persist in the ordinary sketch point table; selecting, dragging, fixing, dimensioning, mirroring, and patterning operate on those points. Selecting a spline and line enables endpoint tangency at their nearest ends.

The same cubic Bezier controls reach OpenCascade as a Bezier curve, rather than being refitted from display samples. Closed profiles can include spline segments. Sweeps retain typed path segments and source sketch references through saving, regeneration, merged/cut tool recipes, and translation. Editing a saved path's controls changes the rebuilt solid.

Trim splits the cubic by de Casteljau subdivision, preserving the retained curve exactly. Intersections with lines use cubic polynomial roots; intersections with circles/arcs use degree-six polynomial roots and arc-span filtering. Spline-to-spline trimming and arbitrary-degree/rational NURBS authoring are not exposed as supported operations. Spline extension is not inferred from a click: the Extend tool supports lines and arcs.

Implementation: `js/sketch_spline.js`, sketch profile/solver/pattern modules, typed profile conversion, and the existing kernel sweep path.

## Trim/extend relationship repair

Removed or changed constraints are retained in `sketch.repairs`, outside the active solver, with the original references and operation. The sketch panel shows a persistent pending count and offers **Repair sketch relationships**; the same command is in the Sketch ribbon.

Select a relationship, choose compatible replacements for missing references, and adjust its dimension if required. Restoration is solved on a copy first; conflicting restoration leaves the sketch and pending record untouched. **Accept removal** acknowledges an intentional deletion. Repairs survive ordinary document serialization and undo uses the existing editor history.

Unchanged spline/arc endpoints keep their identifiers when trimming. This reduces unnecessary loss of references at the surviving end. Existing downstream profile diagnostics continue to report profiles broken by removing geometry.

Implementation: `js/sketch_edit_repair.js` and the trim/extend and sketch-panel integration.

## Exact cut scope

The cheap footprint check now includes polygon-edge crossings, including crossing strips with no contained vertices. Drafted cutters go to the exact stage because they may expand beyond the sketch boundary.

Before recording a cut on a candidate body, the editor rebuilds its exact shape, creates the actual cutter, and measures their Boolean common volume. Bounding-box overlap, face-only contact, and a cutter missing material do not add a cut. Kernel failure is reported as an unresolved cut, not a confirmed miss.

Candidate edits are staged, and the original document/parts/sketch are checked again before publication. The editor is marked busy during the asynchronous scope operation to prevent overlapping user edits. Rebuilt temporary solids are released in success and failure paths.

Implementation: `brepMaterialIntersection` in `js/cad_kernel.js`, `exactCutIntersection` in `js/modeler_part_geometry.js`, and the editor's cut transaction.

## Verification

`tests/cad_completion.test.mjs` covers native spline sweeps with STEP export/import volume checks, saved-source rebuilds, exact Bezier trimming, solver and pattern behavior, repair success/refusal, independent rack rolling, native gear solids, contact checks, and exact cut scope. `tests/cad_completion.browser.mjs` drives the actual gear form, four canvas clicks, and relationship-repair controls. Existing drawing and model-lifecycle browser tests are also run. Final suite counts are recorded in the task response.

Verified results: 2,484 unit/integration tests passed, plus 19 browser tests across the completion, drawing, and model-lifecycle suites. The strengthened 13-test completion suite and 9 touch-policy tests also passed after the final checks. Module identifiers, 462-module import linking, and 1,402 source assertions passed.

Material qualifications and preliminary service/tolerance checks are now available for every catalog material and custom materials. See [material validation](material-validation.md) for the workflow and its production-review limits.
