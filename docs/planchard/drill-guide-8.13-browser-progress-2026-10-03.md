# Drill Guide8.13 — browser progress — 2026-10-03

Current book page: printed8-48 / PDF426. Fresh original dimensions are in `drill-guide-8.13-design.md`; companion dimensions and AVI are unavailable. Task remains incomplete.

## DG01 base accepted

Built from blank through desktop Chrome: annulus OD140/ID64, thickness8mm; four independent fully defined Front ear sketches with symmetric28mm extrusions; Ø6 shared X-axis pivot at Y23/Z0; two outer-only Ø6.45 angle locks atY38/Z8. Aluminum2014,2.80g/cm³. Eight defined sketches,16 history steps, one valid native body; native bounds140×46×140mm. Saved key `cm_mus2lpus`, model `Planchard 8.13 - Drill guide base - fresh designer example 2026-10-03`. Protected native bundle and STEP `DG01-base-browser-2026-10-03` and browser proof saved. Cold library reopen passed. Read-only native audit is in `drill-guide-8.13-dg01-audit-2026-10-03.md`.

## DG02 rotator accepted after groove correction

Authored fresh hub28×46×24mm, Ø5.8 integral X journals, negative-X annular retaining groove and Ø10 blind Top rod socket fromY35 toY12. Plain Carbon Steel7.85g/cm³. Four fully defined sketches/eight history steps after removal of an unused empty sketch. The initial `DG02-rotator-browser-2026-10-03` export had a buried void because the groove cut lost its inner-circle profile. The root browser session edited the groove's outer diameter to Ø6.2, used the new **Refresh sketch contour** action, confirmed one inner hole, and updated the existing cut. The accepted source is `DG02-rotator-corrected-browser-2026-10-03.mforge/.step` with browser proof JPEG. Native replay passes with one connected solid and exposed Ø5.2 neck X−20.3..−19.3mm, no STEP void, volume29.5231333038cm³ and mass231.7565964g. The downstream socket cut remains attached to the same groove feature ID. Right occurrence must rotate180° aboutY to point its grooved journal outward. See the read-only DG audit.

## DG03 rod accepted

Authored from blank through Chrome as one shared guide-rod part for two later assembly occurrences. Fully defined Ø10 Top circle atY12 extruded176mm toY188, then fully defined Ø14 Top circle atY188 extruded4mm to cap atY192. Two sketches/four history steps, one connected native body. Cast Alloy Steel (SOLIDWORKS reference)7.30g/cm³. Protected `DG03-rod-browser-2026-10-03.mforge/.step` and browser proof JPEG. Independent replay/export valid, bounds X/Z±7mm Y12..192mm, volume14.4387598359cm³, mass105.4029468g; STEP has one manifold BREP and no void. See the read-only DG audit.

## DG04 slide accepted

Authored from blank through Chrome: one Top rectangle X±66/Z±14 extruded Y−12..12, then a fully defined Top sketch with Ø14 holes at X±52/Z0 and Ø16.2 central adaptor hole at X0/Z0. One reverse Through All cut crosses the full 24mm plate. Both sketches fully defined; four history entries and one connected native body. Aluminum 2014,2.80g/cm³. Protected `DG04-slide-browser-2026-10-03.mforge/.step` and browser proof JPEG. Independent replay/export valid, bounds132×24×28mm, volume76.3680966227cm³, mass213.8306705g; STEP has one manifold BREP and three open through bores. See the read-only DG audit.

## DG05 collar accepted

Authored from blank through Chrome: fully defined Top annulus OD22/ID10.2 atY36..46, then fully defined Right Ø6.45 circle at Y41/Z0 on X11, blind Reverse cut8mm toX3 opening from the outward side into the bore. Two sketches/four history entries, one connected native body. Aluminum 2014,2.80g/cm³. Protected `DG05-collar-browser-2026-10-03.mforge/.step` and browser proof JPEG. Independent replay/export valid, bounds22×10×22mm, volume2.7865044950cm³, mass7.802212586g; STEP one manifold BREP with no void. See the read-only DG audit.

## DG06 bushing accepted

Authored from blank through Chrome: fully defined Top annulus OD13.98/ID10.2 at Y−12 extruded24mm toY12; fully defined Top annulus OD18/ID10.2 at Y12 fused2mm toY14 as the flange. Both saved sketches have `plane:top` reference identity and both bosses extrude alongY. The Start Top UI initially presented a Right sketch; root changed the plane selector to Top and restored point coordinates(0,0) before finishing the first sketch. The accepted saved bundle has no stale Right-plane mapping; a separate UI agent owns the mislabeled Start/plane selector synchronization fix. Two sketches/four history steps, one connected native body. Custom designer grade C95400 aluminum bronze7.45g/cm³ with Wieland Concast source text; this is a selected grade for the book's aluminum-bronze family. Protected `DG06-bushing-browser-2026-10-03.mforge/.step` and browser proof JPEG. Independent replay/export valid, bounds18×26×18mm, volume2.0683693111cm³, mass15.40935137g; STEP has one manifold BREP with no void. See the read-only DG audit.

## DG07 retaining ring accepted

Authored from blank through Chrome: fully defined Right annulus OD10/ID5.2 at X0 extruded0.8mm, then fully defined Right rectangle Z±0.5/Y2..6 cut Through All across X0..0.81 to form a 1mm split on positiveY. Both saved sketches show `plane:side` and `referenceId:plane:right`; both features follow X, so the root's Top-to-Right selector change saved consistently under the UI agent's plane-sync fix. Two sketches/four history steps, one connected native split ring. Custom designer grade 51CrV4 / AISI 6150 spring steel7.85g/cm³ with Einsal source text; the book says only alloy steel. Protected `DG07-retaining-ring-browser-2026-10-03.mforge/.step` and browser proof JPEG. Independent replay/export valid, approximate bounds10×10×0.8mm, volume0.04391590411cm³, mass0.3447398473g; STEP one manifold BREP/no void. See the read-only DG audit.

## DG08 drill adaptor accepted

Authored from blank through Chrome: five fully defined Top circles drive Ø16 bearing Y−12..12, Ø22 flange Y12..15, Ø8 upper drive Y15..39, Ø8 lower stem Y−75..−12, then Ø6 blind bore Y−75..−60 along +Y. Five sketches/ten history steps, one connected native body. Plain Carbon Steel (grade unspecified)7.85g/cm³. Protected `DG08-adaptor-browser-2026-10-03.mforge/.step` and browser proof JPEG. Independent replay/export valid, bounds22×114×22mm, volume9.9148664147cm³, mass77.83170136g; STEP one manifold BREP with no void. This is an educational adaptor geometry, not a rated chuck. See the read-only DG audit.

## DG09 thumb screw accepted

Authored from blank through Chrome: fully defined Right Ø6.35 shaft X0..13.46, then fully defined Right Ø18 hand head X13.46..17.46. Both saved sketches retain `plane:side` / `referenceId:plane:right`; two features/four history steps, one connected native body. Aluminum 2014,2.80g/cm³. Protected `DG09-thumb-screw-browser-2026-10-03.mforge/.step` and browser proof JPEG. Independent replay/export valid, bounds17.46×18×18mm, volume1.4441436866cm³, mass4.043602322g; STEP one manifold BREP/no void. Four assembly occurrences are planned. This is a plain-shaft designer example with no physical .25-20 thread or certified flat point. See the read-only DG audit.

## Sketch rendering and face-picker QA

Cold DG01 library reopen verified Sketch support face choices now show mm, e.g.Y46.000mm/X−70.000mm; protected UI proof `DG01-mm-face-picker-browser-2026-10-03.jpg`. New extrusion choices, Draft/other face choices share active unit labels; geometry descriptors unchanged. Seven root focused tests passed, agent17tests/gates625modules1490assertions passed.

On DG02, temporary surface-UV sketches were drawn through human UI solely to verify the Split curved-overlay correction. Active sketch9 lineU0..8,V2mm followed the journal surface in Split and remained on it after orbit; browser proof `DG02-surface-UV-Split-browser-2026-10-03.jpg`. Read-only audit confirms surface axis−X, midpointoriginX18mm/radius2.9mm, validV−4..+4mm; V18maps tohubX0 and is outside this journal face. The fixed-point coordinate case involved a conflicting horizontal relation at the other endpoint. The UI agent verified the corrected relation handling and journal-midpoint Split overlay in `DG02-UV-conflict-guide-QA-2026-10-03.jpg` and `DG02-UV-journal-midpoint-Split-QA-2026-10-03.jpg`; its QA bundle is preserved. These temporary QA sketches are separate from the accepted DG02 rotator part.

Automatic approval review initially rejected discarding the temporary DG02 QA sketches. The user subsequently approved that discard; the protected QA bundle remained available, and the browser reopened the accepted DG02 library part. All nine fresh distinct DG01–DG09 source parts now have accepted protected bundles and STEP exports.

## Assembly placement checkpoint — 17 instances, zero mates

The root browser session created a fresh assembly and placed all 17 intended occurrences through Chrome. Protected checkpoint: `artifacts/planchard/DG-assembly-placed-browser-2026-10-03.mforge`, assembly key `asm_mus4qtcx`, context units mm. A read-only bundle audit found 17 visible components, zero mates, and exactly one grounded component (DG01 base). Each component's definition, sketches, features and material match its accepted fresh DG01–DG09 source bundle; DG02 uses the corrected groove source. The bill of materials at this checkpoint is DG01 base ×1, DG02 rotator ×2, DG03 rod guide ×2, DG04 slide ×1, DG05 collar ×2, DG06 bushing ×2, DG07 retaining ring ×2, DG08 drill adaptor ×1 and DG09 thumb screw ×4, totaling 17 instances. Material assignments remain Al2014 2.80g/cm³, plain carbon steel 7.85g/cm³, cast alloy steel 7.30g/cm³, custom C95400 aluminum bronze 7.45g/cm³, and custom 51CrV4/AISI6150 spring steel 7.85g/cm³ according to their corresponding source parts.

The placed poses are a recoverable construction checkpoint. No hinge, slider, lock or fastener mates, clearance/motion acceptance or exploded drawing are established by this checkpoint; the root browser session is adding mates now. Native reference guidance: DG01 outer Ø6 pivot bores are centered at X±68/Y23/Z0mm, while DG02 Ø5.8 outer journals share those axes. Seat each hub against the corresponding outer ear inner plane X±66mm after a concentric hinge mate. DG04 Ø14 guide bores are at X±52/Z0mm; mate each DG06 Ø13.98 tube to its bore and its flange underside to the slide top, then use the DG06 Ø10.2 bore concentric with the DG03 Ø10 guide rod to close the slider loop. Keep both rotators free to pivot and attach rods to them. Assembly solve, actual motion, interference and ANSI C drawing remain to be verified.
