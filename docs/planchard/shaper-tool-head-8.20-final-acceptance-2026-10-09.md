# Exercise 8.20 — Shaper tool head acceptance

Original designer interpretation of printed8-55 / PDF433, built through visible desktop Chrome in ModelForge's dark theme. All16 part definitions started blank, with native fully constrained sketches and accepted native STEP equivalents. This is an educational reconstruction with declared dimensions and proxies; companion CAD and movement AVI were unavailable. Final cold browser motion and protected final bundle verification are still in progress; read ADVANCE.md before treating this report as final.

## Parts, mechanism and exact geometry

The actual assembly is “Planchard 8.20 - Shaper tool head - fresh assembly 2026-10-09”, sixteen occurrences SH01–SH16, only SH01 grounded. Eleven Locks and twelve native guide/joint/coupling/limit mates give two free physical DOFs: down feed and outward clapper lift. The apron is clamped by Angle0; releasing it exposes a third DOF. Feed-only/clapper-only/both-driven configurations report1/1/0DOF.

Native coupled Screw5276 is RH1mm/rev with captured zero phase/axial origin and blank global Drive. Aligned Top Limit is−20..0mm; slide originY0→−20mm. Directed hinge5283 uses the actual+X circular-edge frames with−20..0° and Reverse false. Origin Front apron distance is34.2mm. Actual Chrome endpoint drives and both beyond-stop attempts for each actuator passed; rejected inputs retain the previous pose and setting. Full104-pose native audit passes settled convergence, correct feed/lift and zero exact solid intersections. It samples the declared feed, lift, apron and fractional-rotation configurations; it does not certify continuous swept clearance or rated capacity.

Accepted mixed native volume271.02632156325114cm³, mass2.141068745839738kg at disclosed reference densities. Actual browser assembled STEP `SH-assembly-assembled-browser-2026-10-09.step` is477174bytes:16 valid native solids and16 valid STEP solids, zero bidirectional Boolean residual, identical bounds. Curved mass integration differs by7.9e−7cm³, within native tolerances.

SH11's initially proposed OD12 washer clashed during apron swivel; the accepted OD10/ID6.2 washer correction is declared. SH15's initial circle quick form produced a D10 socket; independent audit caught its clash with the D12 tool neck. Actual driving dimension was corrected toD12.2, then dimensional Undo/Redo, cold reopen, native and STEP checks repeated. Original failures remain diagnostics. Accepted SH15 volume10.51588321612872cm³; SH16 annulusOD20/ID12.2×2mm volume.39452120543780617cm³.

## Saved studies and source repairs

Feed study: Screw5276,+120RPM,10s,20mm downfeed, saved directed clapperDrive0 with Screw free. Clapper study: rotary SH15 component5259, worldX, local pivot(0,14,7)mm,−1/3RPM,10s, outward20°; saved ScrewDrive0 with directed hinge free. All16 study baseline poses match closed home. Both studies were explicitly recaptured in Chrome with the new “Use current pose and actuator Drives as time zero” option; ordinary time10 edits preserve that configuration. Final global mates remain free.

The original pose-only feed study failed cold reproduction: its free clapper moved−14.1424786679°, although the geometry was valid. The source repair captures native actuator Drives including free states, applies them only to the evaluation trial, lets each motor override its own captured Drive, and preserves legacy studies until explicit recapture. Actual downloaded recaptured studies pass cold0/10 evaluations with0DOF, correct independent travel/lift, no exact clashes, unchanged global mates, and free2DOF after ordinary refresh. Original failed report remains preserved.

Tiny nonzero Rodrigues corrections had been discarded below1e−10rad, producing false non-convergence at five valid sampled poses. The narrow repair keeps nonzero corrections without relaxing solver tolerance; all104 actual poses now converge. The UI now shows checked “0 degrees of freedom” and distinguishes missing/stale mobility. Actual Chrome0DOF and−4° checks passed. Mate inspector rows now wrap long labels, retain content height and scroll vertically rather than overflowing or overlapping; actual Chrome verification and23-row isolated Chrome layout checks passed.

## Drawing and persistence

Browser-exported `SH-drawing-browser-2026-10-09.svg` is423538bytes, ANSI C landscape558.8×431.8mm, third-angle exploded isometric, displayed scale1:1/mm. Sixteen concise occurrence descriptions leave original part definitions and their detailed assumptions intact. Sixteen BOM rows each have quantity1;16 unique balloons,16 leaders and15 explode centerlines correspond to15 UI-created explosion steps. Independent geometry annotation audit: all circles inside border, minimum edge gap2.393mm, no BOM/title crossings or explode-circle intrusions. Full exported-sheet Chrome screenshot `SH-drawing-sheet-browser-2026-10-09.jpg` is2560×1632 and visually verified.

Title “SHAPER TOOL HEAD - EXPLODED ASSEMBLY”, NumberPLANCHARD-8.20-SH, RevisionA, Drawn byBrowser reconstruction, Date2026-10-09, displayed mass2.141069kg, mixed reference steel materials and four explanatory notes. Notes disclose original dimensions, missing CAD/AVI, ideal smooth threads/fastener proxy, Steel304 substitution, clearance corrections and absence of a full cutting-stroke machine model.

Protected recaptured checkpoint: `SH-assembly-recaptured-studies-browser-2026-10-09.mforge`,3798383bytes, actual download5, clean Save followed by cold library reopen. Independent preservation audit matches all16 definitions,23 mates, home poses, occurrence descriptions, explosion and drawing settings against the drawing checkpoint. Final cold browser Play, repeated SVG equality and final bundle export are pending.

## Verification and scope

Parent focused checks:7 new solver/mobility tests,14 existing motion/KT playback tests,6 new form/configuration tests pass. Agents report64 core and39 UI/native focused tests passed; source gates no free identifiers,647 linked modules,1489 source assertions. The full suite is currently running with concurrency2; no complete-suite result is claimed. One isolated external bridge test encountered sandbox localhostEACCES and passed unchanged outside the sandbox.

AISI1020 reference7.9g/cm³ is used for most parts; SH04 Plain Carbon Steel7.85; SH07 Steel3048.0 is a disclosed substitute with Atlas supplier density provenance. No certified stock, manufactured thread contact, actual AVI equivalence or load rating is asserted. This report does not complete the entire ebook; the remaining queue and ADVANCE.md retain the next work.
