# Exercise 8.17 — BV03 movable jaw accepted

Accepted 2026-10-08 through visible desktop Chrome browser controls, dark app theme. Source: Planchard 2021, printed8-52/PDF430. Original designer dimensions follow `bench-vice-8.17-design.md`; companion parts are unavailable. Assembly, motion and drawing remain unfinished.

Started a blank mm document, named `Planchard 8.17 - BV03 Vice Jaw - fresh designer example 2026-10-08`. Three fixed-center, driving-dimension Top rectangles and merged Blind bosses define carriage X70..110/Y12..20/Z±28, upright X96..110/Y20..66/Z±28, tongue X72..108/Y−0.2..12/Z±7.8. Right fixed-center Ø20.2 atU0/V34, datum offset96, Blind14 Along normal cuts the screw bore. Top fixed-center Ø6.6 circles atU80/90,V0, offset−0.2, Blind20.2 Along normal cut both keeper holes. Five features/ten history steps; all five sketches fully defined. One native solid, bounds40×66.2×56mm.

Applied Alloy Steel reference7.70g/cm³ through body material UI. Added PartNo BV03, Description, Source, OriginalDesignerExample, BookItemNo3, BookMaterial and ThreadRepresentation through Custom props. The Ø20.2 bore is a smooth ideal nut envelope, with planned assembly lead4mm/rev; no load rating or physical thread contact is asserted.

Exact browser mass:54.96672cm³,0.4232438kg; COM(97.59399,31.14006,approximately0)mm. Analytic volume `(40*56*8 +14*56*46 +36*15.6*12.2 −pi*10.1²*14 −2*pi*3.3²*20.2)/1000` =54.96672333019953cm³. One keeper driving diameter6.6→7.6 yielded54.74144cm³, expected delta0.2252819425cm³. Browser Undo→Redo→Undo restored both nominal diameters; clean library save state restored. Cold page reload, preserved draft, actual saved-library entry reopened: same ten steps, one native solid and nominal exact mass.

Actual Chrome downloads protected:

- `artifacts/planchard/BV03-vice-jaw-final-browser-2026-10-08.mforge`426386bytes
- `artifacts/planchard/BV03-vice-jaw-final-browser-2026-10-08.step`56112bytes
- `BV03-exact-mass-browser-2026-10-08.jpg`, `BV03-cold-reopen-mass-browser-2026-10-08.jpg`
- `BV03-native-export-audit-2026-10-08.json`: exported feature recipe regenerates without issues, export validator passes,54.96672333019949cm³.14 adapter kernel operations are distinct from five authored features.
- `BV03-native-step-audit-2026-10-08.json`: valid STEP,one solid,54.966723330199315cm³,max tolerance1e−7cm.

Browser camera gap found and repaired: off-origin orbit Fit reset its target to origin, only fixed-frame views re-centered. UI agent now centers X/Z and offsets Y relative to the existing solid-Y camera baseline. Six focused camera tests and full source gates pass. Source reload and actual BV03/BV04 visible Fit prove centered complete geometry; `BV03-centered-camera-browser-2026-10-08.jpg` preserves the corrected proof. Native geometry unchanged. BV04 keeper also accepted; next BV05..BV10 and actual sixteen-occurrence mechanism acceptance.
