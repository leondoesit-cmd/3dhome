# Exercise 8.11 Shock — fresh designer example

Book location: printed **8-46 / PDF 424**. Required deliverable: own ANSI assembly with components, mates and proper movement; ANSI C landscape third-angle isometric exploded drawing, explode lines, BOM balloons, notes and title properties. Companion sample parts and AVI are unavailable. Dimensions below are declared design choices, not recovered book dimensions or a qualified hydraulic design.

Reference: Öhlins HO591 installation instructions illustrate separate spring, spring supports/seats and retaining hardware: https://www.ohlins.com/storage/5839B0BCBA6619A46864B84599AAE70733418CB5ECF7D29DE4BFE4872C71B783/56762befc8c64059a9a308a80d4d1e52/pdf/media/95e5e0d6523047488d93d447cfc3b929/MI_HO591.pdf. The example will use a simplified bench-mounted shock with explicit axial travel.

## Dimension plan (mm)

| Part | Local geometry | Extended assembly placement |
|---|---|---|
| SH01 cylinder | OD30, ID26, height60, bottom3 | Y0–60 |
| SH02 rod | Ø6 ×60 | Y45–105 |
| SH03 piston | OD25.8, bore6, thickness5 | Y45–50 |
| SH04 lower cap/spring seat | OD42, bore7, thickness3 | Y60–63 |
| SH05 upper spring seat | OD42, bore7, thickness3 | Y90–93 |
| SH06 spring | mean diameter36, wire2, 4 turns, overall27 | Y63–90 |
| SH07 lower mount | 50 ×30 ×5, mounting holes Ø6 at X±18 | Y−5–0 |
| SH08 upper mount | 50 ×30 ×5, mounting holes Ø6 at X±18, center bore6 | Y100–105 |

Rod/piston/upper seat/upper mount form the sliding group. Ground cylinder/lower mount/lower seat. Native coaxial mate and roll orientation retain one axial DOF; piston base position range Y30–45 gives 15 mm travel. Spring overall height is27 extended and12 compressed, centerline height25/10, pitches6.25/2.5 mm, avoiding wire self-overlap. A rigid-body animation does not deform a spring; verify explicit extended/compressed spring configurations and avoid claiming dynamic deformation until supported.

## Completed browser work

SH01 was created from blank via desktop Chrome: Top origin Ø30 fully defined sketch, 60 mm blind boss; second Top origin Ø26 fully defined sketch offset3 mm, forward57 mm blind cut. One native body, four history entries, clean rebuild. Steel304 body density8 g/cm³, document units mm. Saved library key `cm_murrl4b9`; protected native export `artifacts/planchard/SHOCK-cylinder-browser-2026-10-03.mforge`, browser proof `.jpg`. This part is complete; the full shock exercise remains in progress.

All eight parts were independently created from blank through desktop Chrome controls. Their protected native bundles and browser screenshots are in `artifacts/planchard/SHOCK-*browser-2026-10-03.*`.

| Part | Saved library key | Browser acceptance |
|---|---|---|
| SH02 rod | `cm_murrsgrf` | Top origin Ø6, 60 mm boss, Steel304 |
| SH03 piston | `cm_murrukgx` | Top annulus Ø25.8/6, 5 mm boss, Aluminum6061 |
| SH04 lower cap/seat | `cm_murry9uj` | Top annulus Ø42/7, 3 mm boss, Aluminum6061 |
| SH05 upper seat | `cm_murs0g7w` | Top annulus Ø42/7, 3 mm boss, Aluminum6061 |
| SH06 spring | `cm_murs4vgr` | Ø36 source circle, four-turn helix, Ø2 circular sweep, Steel304 |
| SH07 lower mount | `cm_murskrvk` | Centered 50×30 rectangle, 5 mm boss; two Ø6 through holes at (±18,0), Aluminum6061 |
| SH08 upper mount | `cm_mursqrzm` | Centered 50×30 rectangle, 5 mm boss; three Ø6 through holes at (±18,0) and origin, Aluminum6061 |

Every sketch is fully defined. Mount rectangles use typed 50/30 dimensions and fixed corner (25,-15); hole centers use typed coordinates. Every native export reports `lastRebuild.ok=true`, zero issues, and one solid body. All dimensions are mm; native storage is cm.

The spring has captured Extended and Compressed configurations with helix centerline heights25 and10 mm. Switching from Compressed to Extended through the Configurations dialog rebuilt the same sweep and restored bounds38.00129×26.99695×38.00060 mm; Compressed bounds38.00129×11.99951×38.00060 mm. Both snapshots are preserved in `SHOCK-spring-configurations-browser-2026-10-03.mforge`, saved active Extended. This verifies static configuration restoration, not continuous flexible spring motion.

Full tests after the test harness and icon/localization repairs: **3840 passed, 0 failed**, duration910055.7503 ms. `npm run check` passed: no free identifiers, 622 linked modules, 1490 source assertions. The full shock assembly, mates, movement and ANSI C drawing remain to be completed.

## Assembly browser progress

Fresh assembly key `asm_mursyoqf`, eight fresh components. Six native Lock mates group lower cap/mount/spring with the grounded cylinder, and piston/upper seat/upper mount with the movable rod. Exact concentric bore/rod axes plus a zero-degree Front-plane angle mate leave one axial degree of freedom. A native Top-plane Limit mate bounds rod base Y30–45 mm. The initial Coincident Front-plane trial flipped orientation; it was undone before using the zero-degree Angle mate. Final accepted solve showed no overridden Lock mates.

Extended rod base Y45: piston45, upper seat90, upper mount100 mm. Compressed rod base Y30: piston30, upper seat75, upper mount85 mm. Fixed lower seatY60, spring placementY64, lower mountY−5 mm. Spring occurrence configuration was switched through the Component inspector to match each endpoint. Both browser interference reports said **No interference detected**, all visible components. Independent native compressed recovery bundle: `SHOCK-assembly-compressed-browser-2026-10-03.mforge`; native inspection confirmed coordinates and limit values3–4.5 cm. Endpoint report screenshots are preserved.

Discovered and repaired assembly placement fields using unlabeled raw centimeters in mm documents. X/Y/Z now display document units and convert both inline edits and Apply consistently. A second ownership gap saved unit settings to the inactive part; assembly settings now persist in the assembly context independently. Configuration rebuild now publishes worker meshes without unnecessarily restoring native handles on the UI. Focused conversion, save/reopen, isolation and configuration restoration tests pass. Linear motor and transient flexible spring motion work is in progress; do not claim completed motion or full exercise yet.

## Motion and drawing checkpoint, 06:45 local

Browser Motion Study 1 uses rod2455, signed stroke−15 mm, duration1 s, worldY, no reciprocation. Its stable baseline is rodY45 mm. At time0.5 the rod is halfway through its travel and the constant-wire spring preview is explicitly marked VISUAL PREVIEW; clicking Save produced the expected exact-endpoint requirement. At time1 the saved Compressed spring rebuilt natively (bounds38.00129×11.99951×38.00060 mm). Time0 restored Extended natively (height26.99695 mm including wire). Native bundle preserves the study and spring binding to rod2455; its endpoint heights are10/25 mm. This is a sampled kinematic study, not real-time hydraulic simulation.

Seven default exploded steps now use60 mm spacing, offsets60–420 mm, and completed the seven-second browser animation. A duplicate step-ID issue was found in the exported document, repaired in the app, then verified through browser reopen/play/save/export: all seven IDs are distinct with unchanged offsets. Reset restored assembled placements before exporting `SHOCK-assembly-motion-checkpoint-browser-2026-10-03.mforge`. The compressed static endpoint bundle remains a separate recovery file.

Component custom properties SH01–SH08 and short descriptions were entered through the Placement inspector. Browser reopen restored drawing unitsmm, C-ANSI22×17in landscape, third-angle projection, titleSHOCK ASSEMBLY - DESIGNER EXAMPLE, drawingPL8.11, revisionA, authorModelForge, company, date and six general notes. Exported SVG contains all eight BOM rows/balloons and seven explode leaders. Native face identity preservation removes false internal mesh creases. Remaining spring silhouette fragments are under investigation; do not mark the full drawing accepted yet. The full updated test suite is running; the previous3840-pass baseline and targeted new feature tests are recorded separately.

## Accepted complete Exercise8.11, 06:53 local

The remaining spring drawing fragments came from pen-scale line consolidation moving adjacent curved segments apart. Numerical consolidation tolerance preserves their connections, with native mesh, face boundaries, silhouettes and projected bounds unchanged. The whole eight-part exploded diagnostic reduced dangling endpoints3616→124;88 drawing regressions and all624-module/1490-source gates passed.

Root hard-reloaded Chrome, reopened the saved assembly, played all seven exploded steps to Complete, then exported and visually inspected the full ANSI C sheet. Spring coils and all nine circular openings now have clean continuous outlines. The accepted SVG has eight distinct BOM items SH01–SH08, eight balloons, seven explode leaders, third-angle symbol, notes and title properties. Saved drawing `SHOCK-ANSI-C-exploded-browser-2026-10-03.svg` is495229 bytes; full-sheet Chrome proof is `SHOCK-ANSI-C-drawing-browser-2026-10-03.jpg`.

Accepted editable recovery bundle `SHOCK-assembly-accepted-browser-2026-10-03.mforge` is11483009 bytes. Independent read-only inspection confirms8 components,9 native topology mates,1 linear motor,7 unique exploded step IDs, ANSI_C/mm/fit/third/landscape settings and assembly contextmm. It includes the spring binding and both saved native endpoint configurations. The separately exported motion checkpoint preserves the assembled view; the compressed endpoint bundle preserves the earlier static compression proof.

The requested own-design assembly, proper sampled motion and exploded sheet are complete. Declared simplifications remain: educational bench mounts, missing companion dimensions/AVI, no hydraulic sealing or damping, and intermediate spring states are visual previews with exact output blocked. Next book task: Exercise8.12 Quick Acting Clamp, printed8-47/PDF425. Book-wide work remains unfinished.
