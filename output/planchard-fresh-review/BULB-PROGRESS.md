# BULB — chapter 6 browser recreation

Verified 2026-09-23 in the real in-app browser at localhost:8765.
Saved library record: **BULB - chapter 6**, key `cm_mud6tnom`.

Completed through the textbook eight-instance circular pattern:

- Base revolve and merged Bézier cap, each from a fully defined Right-plane sketch.
- Fully defined thin revolve cut; 0.381 cm outward thickness, connector end radius 0.3302 cm.
- Dome height 0.254 cm on the rear connector face.
- Ten editable history steps; one solid. Overall axial length 3.278 cm (32.78 mm).
- Deleted and recreated Dome through viewport face selection, saved, and reopened from Saved models. The reopened document reports BREP geometry regenerated and Rebuild succeeded.

Fixes made during this workflow:

- Quick coordinate forms reveal the collapsed tree panel.
- Thin revolve line-chain outward direction follows the rotation axis instead of drawing order; shared preview and rebuild calculation.
- Fixed a native ownership error in Bézier profile construction. The curve belongs to its OpenCascade handle and must not also be deleted directly. The old code corrupted later rebuilds, surfacing as null-function or memory-access errors during Dome creation, deletion, and saving.
- Exact mesh warnings retain the original Error for diagnosis.

Validation:

- New browser-authored BULB history regression fails on the old Bézier ownership code and passes with the fix.
- Nine focused Bézier lifecycle, Dome, and thin-revolve tests pass.
- Twenty repeated full BULB builds and disposal cycles pass in a standalone diagnostic.
- Module/link gates pass (526 modules), 1,457 source assertions checked, git diff whitespace check clean.
- No new browser kernel error during the fixed delete/create/save/reopen sequence.

Flange workflow completed in the real browser:

- Converted the annular face boundary, made the inner circle and radial centerline construction geometry, and dynamically mirrored the V.
- Midpoint, symmetry, and perpendicular relations fully define the sketch without dimensions.
- Trimmed the outer circle to the V cap and created the through-all SeedCut.
- Created four equally spaced circular instances, then edited to eight.
- Saved and reopened **BULB - chapter 6**; ten history steps, one solid, successful rebuild, and all eight notches visually verified.

Additional fixes and validation:

- Fit Sketch uses the available zoom range for millimetre-scale parts instead of enforcing a 20 cm minimum span.
- Trimming a fixed circle preserves its radius as an implicit arc constraint.
- Removed endpoint-on-circle relations that become implicit arc endpoints no longer produce false broken-relation diagnostics.
- Eleven focused trim, thin-revolve, and Bézier lifecycle tests pass. Module/link checks and git diff whitespace checks pass.

Pattern editor follow-up: irrelevant mode fields and their empty groups are now hidden. Real-browser verification switched Circular → Linear → Along a curve → Circular; eight instances, 360° extent, Z axis, and equal spacing were retained. Module/link gates and whitespace checks pass.

Next review: converted-boundary associativity after adding and trimming geometry needs explicit parent-edit verification.

 Full ebook recreation and the full test suite are not complete. Broader thin-revolve direction coverage (curved chains and legacy coordinate modes) remains to be reviewed.

Parent edit verification: changing ShoulderDrop from 0.2413 cm to 0.2 cm exposed preliminary missing-face diagnostics for Dome. The exact kernel rebuilt the edited model successfully. Finish Sketch now runs the exact dependent-history rebuild for consumed sketches and omits the new-feature offer. Browser verification confirmed successful automatic rebuild, then restoration of the 0.2413 cm textbook dimension. Module/link and whitespace checks pass. This closes the Finish Sketch diagnostic gap; trimmed-boundary radius propagation is still unverified.

Converted circular boundary propagation fixed: concentric source circles now update existing circle/trimmed-arc entities before solving, preserving entity ids and V relations. Unsupported changes in region count or circular geometry report an error. Five focused boundary/trim tests pass, including a shoulder edit producing inner radius 0.5493 cm and V midpoint 0.6493 cm. Browser rebuild succeeds. The previous restoration attempt had not committed its input; native input now committed ShoulderDrop=0.2413 cm and the saved disk backup verifies inner radius 0.508 cm, outer arc radius 0.7493 cm. General non-circular trimmed boundary propagation remains outside this fix.

Textbook pp. 298–299 follow-up: added Temporary axes display toggle for exact cylindrical/conical faces, merging coaxial faces and extending the visible axis beyond their extents. Real-browser verification shows a cyan dashed axis through BULB. Mesh dashes render reliably where line primitives did not; display geometry does not intercept picking. Two geometric tests cover reversed coaxial faces, separate bores, and oblique axes. This is display-only; selectable temporary axes, keyboard customization, toolbar customization, and Freeform remain gaps.

Keyboard customization follow-up: Settings now supports assigning/removing unused single-letter command shortcuts, persisted per user. Existing built-in bindings and duplicate custom bindings are rejected. Temporary axes is available in command search and the shortcut command list. Browser checks rejected R, assigned U to Temporary axes, confirmed no activation while typing, and verified U after reload/reopen. U remains assigned, axes are hidden. Two shortcut policy tests and npm run check pass. Modifier chords, overriding built-in shortcuts, selectable axes, and toolbar customization remain unsupported.
