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
