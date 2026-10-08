# Exercise8.18 — final editable assembly, STEP and drawing audit

Read-only audit of actual Chrome exports `KT-assembly-final-exploded-browser-2026-10-08.mforge` (5564185 bytes), `KT-assembly-final-browser-2026-10-08.step` (769890 bytes), and `KT-drawing-first-browser-2026-10-08.svg` (657530 bytes). No authored bundle, STEP or SVG was modified. Geometry was rebuilt only as disposable native verification solids.

The final assembly retains16 accepted native single-solid definitions and25 occurrences. All embedded definition objects exactly match the accepted home source, including original detailed descriptions, materials, features, sketches and provenance. All25 concise occurrence Description overrides are present and independent of those definitions. All36 mate objects match accepted home exactly; home translations are unchanged and all25 current pose objects exactly match the saved Motion Study baseline. References resolve without rebinding or issues. Cold cloned home solve is ok/settled/converged, rank143/144 and1DOF, with exactly unchanged transforms.

Native home exact interference has hits=[] across25 solids. Recipe aggregate volume180.1617864487095cm³ and physical mass1367.4709127324477g (steel7.7 plus NBR1.30) match prior accepted geometry. The STEP imports as25 valid solids at maximum tolerance1e−7cm. STEP integrated volume180.16180685859965cm³ differs by2.0409890×10⁻⁵cm³ from separately summed curved native recipes. Exact bidirectional Boolean subtraction proves geometric equivalence: native-outside-STEP0solids/0volume, STEP-outside-native0solids/0volume, total symmetric difference0. STEP unit-density center of mass is not substituted for the physical mixed-density mass calculation.

Active exploded view has15 editable steps and24 moved occurrences; grounded bench base stays in place. Exploded offsets are presentation data, separate from physical home transforms. Saved Motion Study is10seconds, screw motor4450 at−61.289674428888RPM, baseTurns0, time0, all25 baseline poses present. Parent observed actual Chrome Play reaching10/10seconds and Cancel restoring36mates/free1DOF. This UI observation is parent evidence; the saved data and cancellation baseline are independently verified here.

Drawing sheet is ANSI C landscape558.8×431.8mm, ANSI drafting standard, third-angle isometric exploded view. SVG has16 BOM rows with exact occurrence quantities totaling25. There are25 balloons, and label frequencies exactly equal each BOM quantity: repeated labels3×2,4×4,6×3,7×2,8×2,16×2; all other labels once. All25 balloon circles lie inside the border and no circles overlap. There are25 presentation explode-line segments, no line intrudes into a balloon circle, and no detected explode/balloon annotation line crosses the BOM or title block. Actual browser whole-sheet screenshot was inspected: exploded assembly, descriptions/materials, notes and title block are readable, with coherent callouts and visible third-angle symbol. Hidden SVG `<title>` accessibility labels were excluded from visible-text extraction to avoid mistaking them for duplicate text.

Audit artifacts in `artifacts/planchard`:

- `KT-assembly-final-definition-audit-2026-10-08.json`
- `KT-assembly-final-reference-audit-2026-10-08.json`
- `KT-assembly-final-native-home-audit-2026-10-08.json`
- `KT-assembly-final-step-native-audit-2026-10-08.json`
- `KT-assembly-final-step-equivalence-audit-2026-10-08.json`
- `KT-assembly-final-deliverables-audit-2026-10-08.json`

Related42-pose clearance, native1/3DOF mobility, actual endpoint/rollback and separately preserved original cold-failure/post-fix-success evidence remain in `kant-twist-8.18-native-closed-loop-audit-2026-10-08.md`. Parent owns final browser cold reopen and acceptance/ADVANCE updates; this report does not invent completion of a still-pending cold UI check.
