# Exercise 8.16 browser progress

Source: printed page **8-51**, physical PDF page **429**. Exercise in progress; assembly and full-cycle motion acceptance remain pending. Original dimensions and provisional book quantities are documented in `radial-engine-8.16-design.md`.

All new geometry is authored from blank documents through desktop Chrome's visible controls. Scripts only inspect actual exported bundles; no geometry or model state is injected.

## Root parts

### RE05 piston pin — accepted

- Fresh Front sketch: fixed origin, driving diameter 8 mm, fully defined; offset -22 mm.
- Native extrusion 44 mm along +Z, one valid solid, exact bounds X/Y ±4 mm and Z ±22 mm.
- Selected Plain Carbon Steel (grade unspecified), representative density 7.85 g/cm³. Book/source/proxy/ideal-retention properties persisted.
- Actual Chrome bundle and STEP protected as `artifacts/planchard/RE05-piston-pin-browser-2026-10-03.*`.
- Cold reload and library reopen retained two editable history steps and the fully defined sketch. Visible native mass panel: volume 2.211681 cm³, mass 0.01736170 kg, COM at origin. Read-only native audit agrees: volume 2.211681228127215 cm³, mass 0.017361697640798635 kg, valid solid count 1.
- Screenshot: `scratch/planchard/RE05-cold-mass-browser-2026-10-03.png`.

### RE06 small-end bushing — accepted

- Fresh fully defined concentric Front circles OD12/ID8.2 mm, offset -3 mm; native 6 mm extrusion, one body and displayed 12×12×6 mm envelope.
- Explicit custom C95400 aluminum-bronze mass proxy 7.45 g/cm³, [Wieland Concast density source](https://www.concast.com/c95400.php); book material remains Aluminum Bronze. Native property rows saved.
- Library save and actual bundle/STEP protected as `artifacts/planchard/RE06-small-end-bushing-browser-2026-10-03.*`. Cold reload/library reopen retained two steps, fully defined annular sketch and one body. Native mass panel and read-only audit agree: volume 0.361722978134329 cm³, mass 0.002694836187100751 kg, COM at origin, exact Z ±3 mm. Screenshot `scratch/planchard/RE06-cold-mass-browser-2026-10-03.png`.

### RE07 lower bushing — accepted

Fresh fully defined OD10/ID6.2 annular Front sketch, offset -3 mm, 6 mm native extrusion and one valid body. C95400 proxy at 7.45 g/cm³ and provenance properties assigned. Actual bundle/STEP protected as `artifacts/planchard/RE07-lower-bushing-browser-2026-10-03.*`. Cold library reopen retained all history and dimensions; exact volume 0.29009466563248143 cm³, mass 0.0021612052589619866 kg and COM at origin agree with read-only native audit. Screenshot `scratch/planchard/RE07-cold-mass-browser-2026-10-03.png`.

### RE09 master bushing — accepted

Fresh fully defined Front annulus OD24/ID12.2 mm, offset 0; extrusion 12 mm along Z, one valid body. Labeled C95400 density 7.45 and source properties assigned. Saved bundle/STEP protected as `artifacts/planchard/RE09-master-bushing-browser-2026-10-03.*`; cold library reopen and exact mass panel agree with the read-only audit: volume 4.025888153722248 cm³, mass 0.029992866745230752 kg, COM (0,0,6) mm. Screenshot `scratch/planchard/RE09-cold-mass-browser-2026-10-03.png`.

### RE10 crankpin — accepted

Fresh fully defined Front origin circle Ø12, sketch offset -10 mm, native extrusion 42 mm along +Z, one valid body and 12×12×42 mm envelope. Plain Carbon Steel proxy 7.85 and original-dimension/source/representation properties assigned. Actual bundle/STEP protected as `artifacts/planchard/RE10-crankpin-browser-2026-10-03.*`. Cold library reopen retained two steps and the fully defined sketch. Native mass and read-only audit agree: volume 4.7500880922277675 cm³, mass 0.037288191523987976 kg, COM (0,0,11) mm and Z -10..32 mm. Screenshot `scratch/planchard/RE10-cold-mass-browser-2026-10-03.png`.

### RE08 cap pin — accepted

Fresh shaft Ø6 Z0..18 and head Ø10 Z18..20, authored as two fully defined Front sketches and two native extrusions. One valid fused body, 10×10×20 mm envelope. Steel proxy 7.85 and source properties assigned; provisional book quantity4 labeled. Actual bundle/STEP protected as `artifacts/planchard/RE08-cap-pin-browser-2026-10-03.*`. Cold library reopen (new root tab381 after prior200 closed) retained four steps and both fully defined sketches; native mass panel agrees with read-only audit: volume 0.6660176425610297 cm³, mass 0.005228238494104083 kg, COM Z11.358490566037664 mm. Screenshot `scratch/planchard/RE08-cold-mass-browser-2026-10-03.png`.

## Assembly placement checkpoint — 34 occurrences, pending joints

Fresh empty Assembly created in root Chrome381, mm, named `Planchard 8.16 - Radial engine assembly - fresh designer example 2026-10-03`. Inserted only newly accepted RE definitions via visible Component model / Insert component controls; typed each pose in native Placement fields.

Occurrence order: 1 RE12 carrier (grounded); 2/3 RE11 rear/front cheeks; 4 RE10 crankpin; 5 RE01 master rod; 6 RE09 master bushing; 7–10 RE02 rods alpha72/144/216/288; 11–15 RE03 heads alpha0/72/144/216/288; 16–20 RE05 wrist pins; 21–25 RE06 wrist bushings (master Z6, others Z15); 26–29 RE07 knuckle bushings; 30–33 RE08 cap pins; 34 RE13 rear journal. All other poses use the frozen design plan. No mates yet, and only carrier grounded. Occurrence names are committed through Apply placement; a missing Enter name commit is assigned for UI repair. Carrier's full saved name currently retained.

Saved library and actual browser bundle protected as `artifacts/planchard/RE-assembly-34-placement-browser-2026-10-03.mforge` (10,752,866 bytes). Next: add accepted RE14 front journal and 20 accepted RE04 ring occurrences, then native clearance and actual closed-loop joint acceptance. Assembly exercise remains incomplete.

## Parallel parts

RE01/02 master and articulated rods, RE03/04 piston and rings, and RE11/12 crank cheeks and guide carrier are being authored in separate Chrome tabs. Their acceptance documents are owned by the corresponding agents.

The ring uses a disclosed Parker E0529 EPDM **mass proxy** at 1.05 g/cm³, supported by [Parker's compound datasheet](https://www.parker.com/content/dam/Parker-com/Literature/Praedifa/Compound_Data_Sheets/EMG_PTD_Compound-Data-Sheet_EPDM_E0529_EN.pdf). BookMaterial remains Rubber; no combustion suitability is inferred.

## Resume

Finish RE09 acceptance, then build RE08/10/13/14 fresh. After all 14 definitions are accepted, author the 55-occurrence assembly through visible UI, close the guided slider/crank loops, verify a full native crank cycle and produce the requested ANSI C exploded drawing. The exercise is not complete until those gates pass.

## Current continuation checkpoint (supersedes Resume above)

All 14 definitions are accepted, saved, cold reopened, and protected as actual native bundles and STEP. Five new piston groups now contain all 20 rings: the native assembly has55 occurrences. Actual `RE-assembly-55-25-mates-browser-2026-10-03.mforge` was saved and cold reopened with all55/25 intact. The later67/69-mate diagnostic bundles preserve live UI-authored joint work.

Native joints reached69:45 initial mates (43 rigid attachments plus journal Concentric/Distance), master Concentric/Distance, four knuckle Concentric/Distance pairs, five piston guide Concentric/Angle0 pairs, and two wrist Concentric/Distance pairs. Three wrist pairs remain. Default Opposed Front-datum distance alignment produced180-degree bearing-lock conflicts; native Aligned toggles are being applied consistently. Motion, full55 clearance, one physical DOF and ANSI C drawing remain pending. This exercise is not complete.

Source repairs: sketch-plane/offset edits synchronize extrusion preview records; component names commit on Enter/blur; hidden library thumbnail work is deferred until visible; topology mate pose updates reuse component meshes with full-rebuild fallback. Focused regressions and module/link/assertion gates passed. Browser timing remains variable; do not claim all latency is resolved.

### Crank-lock repair continuation

Reached71 mates (three wrist pairs closed; two remain) and mathematical5 DOF, but rejected the shortcut with RE13 Rx180: RE13 is axially asymmetric (local Z-32..0), so its flipped shaft invades the hub. The original rear journal Opposed seat had been captured before four crank Locks, creating this physical inconsistency. Recovery export `RE-assembly-55-71-mates-before-recapture-browser-2026-10-03.mforge` is protected.

Deleted only the four rear-journal crank Locks through native mate-row remove buttons, set its carrier Front distance Aligned, and restored journal Rx0 and Rz0; RE14 Rx0; rear/front cheeks origin(0,0,-10)/(0,0,22), Rx/Ry/Rz0 through native Placement. There are67 remaining mates. Typed RE10 crankpin(0,18,0) currently drifts to(4.47948512,17.38621524,0)mm because the unanchored connected loop solver changes the selected placement target. A narrow Placement driver repair is assigned before recreating the four Locks. Assembly/motion/drawing remain incomplete; accepted14 part definitions are independent of this assembly repair.

## Correct home and drawing checkpoint — supersedes earlier incomplete assembly notes

Atomic native Placement now holds the edited component during mate solving, checks physical satisfaction, and rolls back invalid edits. The four crank locks were recaptured with the correct journal Rx0. All remaining wrist joints closed: **55 occurrences, 14 definitions, 75 mates, one physical DOF, zero unresolved**. Chrome set RE13 Rz0 and RE10 centre (0,18,0) mm. All physical poses match the saved motion baseline.

Saved native motor `RE crank cycle - five closed rod-piston loops` drives RE13 about world Z at12 RPM with origin pivot. Native solver replay at0/1.25/2.5/3.75/5 seconds resolved every mate and returned all poses to home; exact positive-volume collision checks at these five samples found zero clashes. This is sampled evidence, not a continuous collision guarantee. Finer sampling is in progress.

The browser-authored ANSI C landscape Third Angle drawing has10 intentional explode steps,53 moved occurrences,53 explode guides,55 balloons with leaders, and14 BOM rows totaling55. Source limitations and material proxies appear in drawing notes. Actual native export `artifacts/planchard/RE-assembly-drawing-browser-2026-10-03.mforge`, SVG/PNG `RE-ANSI-C-drawing-browser-2026-10-03.*`, and CSV `RE-BOM-browser-2026-10-03.csv` are protected. The later `RE-assembly-home-drawing-browser-2026-10-03.mforge` retains the same drawing steps with assembled presentation, home pose and5-second duration.

Cold Chrome reload retained55/75, native motor and drawing metadata. New worker-backed Play/Pause/Reset/scrub/Keep/Cancel preview controls are under actual Chrome QA. End scrub successfully reached5seconds; continuous Play exposed an unbound requestAnimationFrame receiver and is being repaired before exercise acceptance. Explode metadata Apply now avoids redundant mate solving and mesh rebuilding; live performance verification remains pending. **Do not mark8.16 complete until playback QA and final sampled clearance evidence are recorded.**

## Final annular repair and actual playback QA — supersedes prior blockers

An independent native/STEP audit found that the original piston groove cut produced five disconnected sections. Through actual Chrome history controls, RE03's inner Ø42 mm circle was restored to the seed annular cut; the four-copy pattern rebuilt, and a fresh saved-library reopen verified one connected native solid. [Source repair evidence](radial-engine-RE03-annular-repair-2026-10-03.md) preserves the same source and feature IDs. All five assembly occurrences were updated from the library through native Chrome controls.

The [final repaired native assembly and actual STEP](radial-engine-8.16-annular-assembly-audit-2026-10-03.md) now validate as **55 connected valid solids / 14 definitions / 75 mates / one physical DOF**. All **25 sampled crank poses at 15° increments** have zero unresolved joints and zero positive-volume native interference. Full-cycle translation and rotation closure are exactly zero.

Actual Chrome **Play completed 5.00 / 5.00 seconds**, visibly demonstrated in [the protected motion screenshot](../../artifacts/planchard/RE-motion-annular-repair-complete-browser-2026-10-03.jpg). The root reset to zero, kept the home pose and saved, then reopened the ten-step exploded presentation and downloaded the corrected drawing. [Final SVG and browser preview acceptance](radial-engine-8.16-drawing-audit-2026-10-03.md) confirms ANSI C landscape Third Angle, 55 balloons with leaders, 53 exploded guide lines and 14 BOM rows totaling 55. The final clean [time-zero exploded bundle](../../artifacts/planchard/RE-assembly-annular-repair-exploded-drawing-browser-2026-10-03.mforge) independently preserves all ten steps, 53 presentation offsets and unchanged physical home for all 55 components. Earlier disconnected-piston exports remain preserved as superseded diagnostics. The original designer-example geometry, native joint cycle and requested drawing gates now pass; source quantity/material limitations remain disclosed.

## Exercise 8.16 — complete as the disclosed original designer example

The final clean [assembled home bundle](../../artifacts/planchard/RE-assembly-annular-repair-home-browser-2026-10-03.mforge), 13,762,015 bytes, preserves **55 occurrences / 14 definitions / 75 joints**, saved study time **0**, all 55 physical baseline poses exactly, exploded false and zero presentation offsets. All ten manual explode steps and ANSI C landscape Third Angle settings remain available. Every part's saved feature/sketch geometry is identical to the independently native-audited repaired assembly, and all five piston annular bindings persist. [Final home machine audit](../../scratch/planchard/re816-final-home-audit-2026-10-03.json).

Fresh parts, cold source reopening, editable assembly, native joints, actual Chrome full-cycle Play, 25-pose native clearance, valid 55-solid STEP, exploded drawing and BOM now have protected evidence. The companion parts/AVI are absent, so this completes an explicitly original designer example rather than reproducing unavailable vendor geometry. Provisional RE08/RE11 quantities, additional RE12–14 fixtures and disclosed material mass proxies remain documented in source properties and drawing notes. No continuous swept-clearance or load rating is inferred.

### Final desktop checkpoint

Chrome reloaded and reopened the saved engine from its library after the final home export. The clean save button and footer retained 55 components, 75 mates and one degree of freedom. Evidence: `artifacts/planchard/RE-annular-repair-cold-home-browser-2026-10-03.jpg`. The final library card was fully reachable after the library flex sizing fix.

The mate solver now skips exact zero Jacobian products while preserving accumulation order and the existing dense solve. A regression against the old dense calculation produces exactly identical poses and diagnostics. A local repaired-engine pose benchmark at 0.3 seconds improved from 8.10 to 2.96 seconds; this is a local measurement, not a universal timing guarantee. Module/link/source assertion checks passed (637 modules, 1,490 assertions); focused motion and solid-count tests passed 23/23, and the optimization agent's combined regression set passed 25/25.

Exercise 8.16 ends at printed page **8-51 / PDF 429**. Next is 8.17, printed **8-52 / PDF 430**, using the committed fresh-design plan. Completed engine tabs are safe to close: source parts, final native home/exploded bundles, STEP, SVG and acceptance notes are protected on disk. No future engine work depends on an open tab.
