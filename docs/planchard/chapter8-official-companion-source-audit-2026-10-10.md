# Chapter 8 official companion identity/dimension audit — 2026-10-10

Read-only source extraction from the official 2021 exercise ZIP and comparison with accepted representative WEIGHT-LINK bundle. No source file/model/browser/state modifications. CRC32 and uncompressed size validated for each recovered XML/PNG block using the same compressed-block method as5.17. Raw source remains in ZIP; no SOLIDWORKS launch/native feature import or full topology identity claimed.

Archive: `C:/Users/liron/Downloads/Eng_Graphics_SW_2021_Exercise_Files_V3.zip`, SHA256 bfdd94a72cab5e7328c9bcd7681af9b00153f39c8395056643cb64da881443e2. Extracted metadata evidence `scratch/planchard/ch8-companion-inspection/inventory.json` and `source-dimensions.json`, one subfolder per component. Dimensions below are source inch display labels; app canonical lengths are cm. Source unit properties retained in ISolidWorksInformation XML.

| Part | Original source identity / configuration | Source recovered values | Saved WEIGHT-LINK comparison |
|---|---|---|---|
| Axle | Chapter8 Homework/Axle.SLDPRT, Default, BOM GIDS-SC-10017 | Sketch1 diameter0.188in=4.7752mm; Boss-Extrude1 length1.375in=34.925mm. Material not specified. | Component451 circleD0.47752cm and midplane depth3.4925cm match dimensional values. Original datum/origin identity not recovered. |
| FLATBAR | Chapter8 Homework/FLATBAR.SLDPRT, Default9HOLES; alternatives3HOLE/5HOLE/7HOLE; Number56-10222, BOM GIDS-SC-10009-9 | Boss thickness0.09in=2.286mm; centerline4in=101.6mm; two endR0.25in=6.35mm;9holesD0.19in=4.826mm; pitch0.5in=12.7mm;2014 Alloy. | Component452 matches centerline, radii, bore, pitch,count. **Thickness differs:0.06in=1.524mm**. Canonical component def has no material/engineeringData. |
| WEIGHT | Chapter8 Homework/WEIGHT.SLDPRT, Default | Base rectangle1×0.75in=25.4×19.05mm; upper square0.5in=12.7mm; offsetPlane1 at0.5in=12.7mm; cutD0.15in=3.81mm; Pure Lead. | Component442 loft sections/offset match these values. Canonical def has no material/engineeringData. Cut circle source values need full recovered topology to establish source identity; matched displayed bore value alone is limited evidence. |
| HOOK | Chapter8 Homework/HOOK.SLDPRT, Default | SweepD0.15in=3.81mm; Sketch-Path D3=1in, D1=.25in, D2=R.5in; Dome .05in=1.27mm; Threadplane.02in=.508mm; Threadpath height.2in=5.08mm/pitch.05in=1.27mm/4turns/start0°; Thread Cut-Sweep profileD.03in=.762mm. Material not specified. | Component443 sweepD and dome match; stem.25in/firstR.5in match. Upper path/loop is saved explicit approximation. **Saved thread is #8-36 UNF2A modeled length6.35mm/pitch.7055556mm/9turns, not the source custom helix**. |

Source previews confirm open curved hook with threaded lower stem; original FLATBAR active configurationDefault nine holes. XML Features streams describe configuration identities and contain no expanded CAD feature objects (`swExtFeatureList count0`); Keywords streams give feature names/dimension labels but not complete sketch coordinates, end conditions, boolean bodies or original persistent-face IDs. In particular HOOK path D3=1in cannot be assigned to a precise datum from metadata alone; do not invent a driving constraint.

## Concrete outcome

“Companion unavailable” is no longer accurate. Axle/weight primary dimensions and many FLATBAR/hook values match the prior browser reconstructions, but publisher-equivalent geometry is **not** certified: FLATBAR thickness and HOOK modeled thread differ, material assignments are absent in inspected canonical component defs, upper hook loop remains explicitly approximate. Previous representative workflow acceptance survives with these qualifications; complete book source-model acceptance needs honest repairs or recorded limitations rather than silently relabeling representative models as exact.

Recommended next finite source repair: actual browser component452 Boss thickness1.524→2.286mm in a saved copy, regenerate/rebind exact assembly mates, verify front-plane placements/finite tangent and native interference, preserve original until accepted. HOOK custom helix/profile requires separate source-equivalent modeling plan: changing thread pitch only in ANSI preset would still leave mismatched length/turns/cut profile. Apply source materials only using genuine canonical material fields and verify native mass; do not infer an unspecified Axle/hook grade. Any changed part affects8.1/8.2 dependent saved assemblies; check those links and source frames before replacing records.

## SHA256 identities

- `Chapter 8 Homework/Axle.SLDPRT` — 65227 bytes; SHA256 `fba31610a298e3c6aeacf1875e4824f3729938ad3b09340a7cddeaa844135177`.
- `Chapter 8 Homework/FLATBAR.SLDPRT` — 115596 bytes; SHA256 `8a67f2fc0465024bf906b11ce8137fbed2812957d8754b735e6e9ae58e34165f`.
- `Chapter 8 Homework/HOOK.SLDPRT` — 155292 bytes; SHA256 `352e398e121cc6b7a507f83d82b75d4ec080bc6554560892b7bbc244b6c53a78`.
- `Chapter 8 Homework/WEIGHT.SLDPRT` — 66690 bytes; SHA256 `6abab7bbe9446bc624f59981ea679b8852b3ade7608f6624e25da145b129ccbf`.

## Source hierarchy correction — book thread versus legacy companion

The primary Chapter7 tutorialPDF370/printed7-62 explicitly requests a right-hand#8-36InchDie cut thread, diameter.150in/pitch.02777778in, TrimwithStartface and PlainCarbonSteel. The existing modeled#8-36 feature therefore matches the book's thread specification; its difference from the recovered legacy companion custom4turnhelix is not itself a Chapter7 book error. The customhelix path is an optional alternate companion reconstruction/app-quality branch and must preserve the tutorial branch rather than replace it silently. Original end-face/offset selection still needs its own visual/source qualification.

Chapter8 has a distinct instruction:PDF413/8-35 explicitly copies WEIGHT andHOOK fromChapter8Homework, andPDF414/8-36 inserts that8.1subassembly intoWeight-Link. Thus legacy companion parity is relevant to that copy-source assembly scope, while the tutorial#8-36 substitution may remain an explicitly qualified browser reconstruction. PureLead from copied companionWEIGHT is supported; exact source-native import and original persistent IDs are not claimed. Report descriptions must distinguish these two source paths. Earlier thread-mismatch statements in this report describe companion parity only, not a required replacement of the Chapter7 tutorial thread.
