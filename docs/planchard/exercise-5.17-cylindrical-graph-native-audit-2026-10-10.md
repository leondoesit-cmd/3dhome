# Exercise5.17 cylindrical constraint graph: actual browser/native audit

**Nominal source geometry, exact density, bounded point graph and native/STEP PASS; full two-sketch workflow and cold durability remain pending.** Parent authored actual Chrome model `Planchard 5.17 - official source constraints - browser 2026-10-10`, key `cm_mv26kzd9`. Independent audit reads its protected native bundle and contemporaneous STEP; repository compile/regenerate/Boolean APIs are used only to inspect temporary shapes. No model definitions or protected inputs are changed.

## Source and saved authoring

Source PDF266–267 /printed5-48–49; official companion bare cylinderØ1.5in ×1.25in =Ø38.1mm ×31.75mm. One fully defined Top circular sketch feeds one blind+Y additive Boss. The subsequent Hole Wizard is subtractive: **ANSI Inch,1/4 socket-head cap screw,Normal,Counterbore,Through All**, boreØ**7.14375mm**, recessØ**11.1125mm**, recessdepth**8.89mm**. Source extraheadclearance.100in is included. Saved history has three entries: base sketch,Boss,Hole. There are **not yet** independently editable original3D placement and generated profile sketches in this saved record.

Hole cylindrical source references the actual base Boss/circle and native cylindrical side face. Placement graph uses OnSurface,AlongZ constructionline and AlongY point relations, with topdistance.25in/**6.35mm** and positiveZ branch. Solved points in mm are **A(0,31.75,0),B(0,31.75,19.05),P(0,25.4,19.05)**. Graph is **fully defined,0DOF**, maximum residual**2.220446049250313e-16cm**; every relation residual is below1e-12cm. The solvedP drives cutter frame; outwardnormal+Z drives inward bore, rather than a frozen imported hole point.

Actual graph-defined/underdefined screenshots were visually reviewed. They show0DOF with allthree switches enabled, and2DOF whenAlongY is disabled. These are **intermediate editor parameter states**: defined screenshot has6.35mm recessdepth; underdefined screenshot temporarily shows1/2inHex/otherdiameters. They prove the editable graph status, **not final source sizes**. Final nominal bundle/STEP/drawing provide the correct1/4/8.89mm state.

## Native geometry, STEP and material

All**20 nominal checks PASS**. Native BREP valid, oneconnectedsolid, volume**34,188.16210206099mm³**; unchanged envelopeØ38.1×31.75mm. NativeCOMmm approximately **(−0.000001075,15.3150717733,−0.2070368136)**. Exact source-density mass**92.30803767556467g**.

Actual STEP**38,180bytes** imports valid,oneconnectedsolid. Native-minus-STEP and STEP-minus-native residualvolumes are both**zero**. Its scalar integrated volume**34,188.126899637226mm³** differs from native by**0.035202423766mm³**, a numerical integration residual retained explicitly; zero Boolean geometric residual does not imply scalar masses are byte-exact. No dimensions were fitted to a target mass.

Source density now **exactly2.7g/cm³** in both body and its linked customengineeringmaterial, superseding the earlierbase preset2.698790709 only for this later graph record. Grade `Aluminum 1060 - official Planchard companion density`; customcatalog,source2700kg/m³ citation and officialsourceSHA256 `966cb075642fcfd11a7b74133e1ca577b623a5af6165c88b8afcbfbd6f99cdb1` persist. Strength/service data arezero; this accepts density/source identity, not a certified strength rating.

Protected nominal `artifacts/planchard/EXERCISE-5.17-graph-native-browser-2026-10-10.mforge`273,821bytes; same-stemSTEP/SVG andPNG. Native auditJSON `EXERCISE-5.17-graph-native-audit-2026-10-10.json` records hashes/fullgraph/material/mass/nativeSTEP checks. SVG122,528bytes contains all13 genuineLF note rows, two notes6/7rows, and fourviews. ActualdrawingPNG reviewed: Top/Front/Right plusisometric, hidden/centerlines, declaredsource/datum/scope, dual mm/in dimensions38.10[1.500] and31.75[1.250]. Screenshot lower titlearea is slightly viewportclipped, so the protectedSVG is the complete sheet evidence.

## Actual upstream driver

Parent changed actualBossheight**31.75→32.75mm**, protected `EXERCISE-5.17-graph-height32.75-browser-2026-10-10.mforge`276,218bytes andPNG. Independent native replay validates oneconnectedsolid and graphP**(0,26.4,19.05)mm**, retaining6.35mm belowtop. Volume rises by**1140.0918281106342mm³**, matching cylinderarea×1mm analytic**1140.0918279693702mm³** within1.5e-7mm³. The translated radial hole retains its native cutter volume.

All**11 driving checks PASS**: entirebase sketch,Holefeature/history/material/Drawing exactly unchanged; Bossparams differ only `depth`/`to`; sourceposition update and analyticvolumedelta agree. Parent actualUndo→Redo→Undo restoration is separately reported browser evidence. Modified-height bundle is a protected transient proof, not the accepted nominal or a replacement library state. DrivingJSON `EXERCISE-5.17-graph-driving-native-audit-2026-10-10.json` records bothstates and exact preservation checks.

## Explicit remaining scope

This is a **bounded cylinder-specific3D constraint graph**, with real points/relations/residuals driving nativecutters. It is not acceptance of a general3D placement sketch plus a separately editable planar hole-profile sketch, as the book's fullworkflow describes. Those authoring objects, final fullcold save/library durability and completeExercise5.17 source-workflow acceptance remain pending. The currentreport does not silently equate a valid radialhole with every printedworkflowstep or claim the wholebook finished.
