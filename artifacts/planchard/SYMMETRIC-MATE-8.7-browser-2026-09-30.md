# Exercise 8.7 Symmetric mate (PDF p.419) - browser run 2026-09-30

Real desktop Chrome, dark theme, tab 710857242. Source: PDF page 419 (rendered and read). The book uses companion files (Guide Bracket, Guide Roller x2) that are not in the PDF, so this run designs two small fresh parts and documents them as such.

Files: `SYMMETRIC-MATE-8.7-browser-2026-09-30.{mforge,step,png,md}` (mforge is the whole-project bundle, ~99 MB; STEP has 3 solids).

## Parts (authored from blank documents in this run)
* `Planchard 8.7 GUIDE BRACKET - fresh 2026-09-30`: Top-plane centre rectangle 10 x 6 cm (fully defined, centre fixed), 2 cm boss (X10 Y2 Z6 cm).
* `Planchard 8.7 GUIDE ROLLER (also shaft/pin) - fresh 2026-09-30`: Top-plane circle, driving diameter 1.6 cm (fully defined), 3 cm boss (axis Y).

## App gap fixed: the Symmetric mate did not exist
Source: `js/cad_mate_model.js` (`symmetricMeasure`, requirement `mirror`), `js/cad_mate_solver.js` (third reference `c`: resolved, read-only, part of the dependency graph and the Jacobian), `js/modeler.js` (Symmetric mate button, three-pick gate, tree/prune handling), `js/modeler_strings.js`, command `symmetricmate`. A symmetric mate holds two entities as mirror images across a third plane: planes/faces (normals parallel to the mirrored normal, plane offset mirrored) or axes/circular edges (axis parallel to the mirrored axis and lying on it). It reads the first entity and the mirror plane and moves the second.
Tests: `tests/planchard_ch8_mechanical_mates.test.mjs` (axes, planes, follow-the-driver, wrong pairing and missing plane refused).

## Assembly `Planchard 8.7 symmetric mate guide rollers - fresh 2026-09-30`
Bracket grounded; six mates, all resolved (no unresolved), reopened from the library after a page reload with the same six mates:
1. Distance 2 cm, bracket Top plane / roller 1 Top plane (rollers stand on the top face, y = 2).
2. Distance 2 cm, bracket Right / roller 1 Right (x = 2).
3. Distance 2 cm Top/Top for roller 2. 4. Distance 2 cm Right/Right for roller 2.
5. **Symmetric**: roller 1 Front plane, roller 2 Front plane, mirror plane = bracket Front plane (three Ctrl-picks in the assembly tree).
6. Limit (bracket Front / roller 1 Front): travel 0.5 to 2 cm (the book's LimitDistance; the maximum stayed at the default 2, the intended 2.5 was not entered).
DOF: 1 (roller 1 slides along Z inside its limits; roller 2 is fully constrained through the symmetric mate).

## Motion driven through the UI (Placement Z of roller 1, exact readings of roller 2 Z)
| roller 1 Z typed | roller 2 Z (solved) | book expectation |
|---|---|---|
| 1.5 (start) | -1.5 | mirror |
| 1.0 | -1.0 | mirror |
| 1.9 | -1.9 | mirror |
| 3.0 (beyond the 2 cm stop) | roller 1 held at 1.9999, roller 2 -1.9999 | limit stops the pair |

Exact interference (browser): **No interference detected**.
Part edit propagation: roller height 3 -> 4 cm in the part editor and saved; `Update from library` on both rollers in the assembly made them taller with all mates resolved; two Undo steps restored the 3 cm rollers; the library roller was set back to 3 cm and re-saved.

## Gaps
* Rollers mirror through their Front (XY) planes rather than cylindrical faces; the axis form of the mate is proved by unit tests only.
* The book's Coincident/Tangent mates between bracket and rollers are replaced by plane Distance mates (numerically the same poses).
* Typing numbers into the mate-row travel fields while keyboard focus was not in an input fired canvas shortcuts once (view stayed black until the page was reloaded); no data was lost, but the second (maximum) field was never edited.
