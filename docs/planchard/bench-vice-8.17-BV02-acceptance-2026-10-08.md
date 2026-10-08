# Exercise 8.17: BV02 mounting-foot acceptance

Original designer example under printed8-52/PDF430, using `bench-vice-8.17-design.md`; companion parts/AVI absent. This accepts one part definition for two later occurrences, not the assembly/book.

Fresh blank part in actual desktop Chrome localhost8765 dark app, browser controls only. Unitsmm. Top fixed-center rectangle20x90mm centeredU0/V0, offset-12mm, Blind Extrude/Boss12mm Along normal. New Top sketch offset-12mm: two driving-diameter6.6mm circles, fixed centersU0/V+/-25; Through All Extrude Cut Along normal. Two features/four fully-defined history steps, one native solid, bounds20x12x90mm. Whole-body Alloy Steel reference density7.70g/cm3.

PartNo BV02,Description,Source PDF430/8-52,BookItemNo2,BookMaterial,OriginalDesignerExample authored in Custom props UI. Final name `Planchard 8.17 - BV02 Base Plate - fresh designer example 2026-10-08` committed through normal field blur and saved. Earlier unnamed downloads are superseded by the protected named exports.

Native volume20.77891334405777cm3 exactly matches analytic `(20*90*12 - 2*pi*3.3^2*12)/1000`. UI mass0.1599976kg, COM(0,-6,0)mm. One diameter6.6->7.6mm rebuilt downstream hole: UI20.64508cm3, analytic20.645081497014846cm3. Undo->Redo->Undo restored nominal dimensions and mass.

Cold browser reload and reopen from saved library preserved four steps, one solid, nominal bounds, volume and mass. Actual Chrome outputs:

- `artifacts/planchard/BV02-base-plate-final-browser-2026-10-08.mforge`
- `artifacts/planchard/BV02-base-plate-final-browser-2026-10-08.step`
- `BV02-exact-mass-browser-2026-10-08.jpg`, `BV02-cold-reopen-mass-browser-2026-10-08.jpg`
- `BV02-native-export-audit-2026-10-08.json`: independent read-only rebuild, no issues, volume20.77891334405777cm3; adapter expands two authored features to five kernel operations.
- `BV02-native-step-audit-2026-10-08.json`: actual STEP reimport/export validity and one-solid mass/bounds audit.

The foot's local X-10..10,Y-12..0,Z+/-45 interfaces and hole positions match the frozen design. Later two instances translateX30 andX146. Nominal thread envelopes in the base and missing screw thread suffix authority remain disclosed by the design plan. Time/click count not reliably measured; no speed comparison claimed.

Next BV03 movable jaw from blank, then BV04..BV10,16-occurrence assembly/motion/clearance/drawing acceptance.
