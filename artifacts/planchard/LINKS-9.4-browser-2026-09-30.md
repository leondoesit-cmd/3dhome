# LINKS assembly and drawing (Planchard Exercise 9.4, PDF p.477) - browser run 2026-09-30

Real desktop Chrome, dark theme, tab 710857242, all authoring through the UI. Source: user-supplied PDF page 477 (rendered and read).
Book asks for: LINK assembly from three FLATBAR configurations (7HOLES, 5HOLES, 3HOLES) and a SHAFT-COLLAR, A-landscape assembly drawing with BOM and balloons.

Files (this folder): `LINKS-9.4-browser-2026-09-30.{mforge,step,png}`, `LINKS-9.4-browser-2026-09-30-drawing.{svg,png}`.

## Parts (all derived from this project's fresh browser-authored parts)

* `Planchard FLAT BAR - 7 HOLES / 5 HOLES / 3 HOLES (9.4 variant of 9 HOLE) 2026-09-30`: the fresh FLAT BAR - 9 HOLE (5.9) part was copied with "Save copy and open" and its three driving values changed through the UI: slot span dimension 4 -> 3 / 2 / 1 in, hole seed translated by +0.5 / +1.0 / +1.5 in (Translate sketch geometry), Pattern X instances 9 -> 7 / 5 / 3 (0.5 in spacing). Each saved to the library, 0.060 in thick, Aluminum 1060, Ø.190 holes.
* `Planchard SHAFT COLLAR - rebuilt 2026-09-28` (fresh 5.7 part) unchanged.

DEVIATION: the book uses one part with three SOLIDWORKS configurations. The app has configurations (suppression and circular-sweep design table only) but an assembly component cannot choose a configuration, and a configuration cannot override a sketch dimension or pattern count. So the three configurations are three saved variants of the same source part, not one part with a design table. Not fixed (larger feature: per-component configuration plus dimension overrides).

## Assembly `Planchard 9.4 LINKS assembly - fresh 2026-09-30`

4 components, 8 mates, all resolved, no unresolved mates after Save, page reload and reopen from the library (reopened: 4 components, 8 mates, 1 degree of freedom).

| Mate | References |
|---|---|
| 1-3 (7-hole bar grounded, 5-hole bar) | Concentric: 7-hole bar right-end hole edge / 5-hole bar first hole edge (viewport edge picks). Distance 0.06 in (aligned) 7-hole Front plane / 5-hole Front plane (stacks the bars, thickness .06). Angle 90 deg 7-hole Right plane / 5-hole Right plane. |
| 4-6 (5-hole bar, 3-hole bar) | Concentric: 5-hole bar top-end hole / 3-hole bar first hole. Distance 0.06 in Front/Front. Angle 90 deg Right/Right. |
| 7-8 (collar) | Concentric collar outer circle / 7-hole bar seed hole (left end). Distance 0.06 in Front/Front. |

DOF: 5-hole bar and 3-hole bar fully constrained; the collar spins about its axis (1 rotational DOF, physically meaningful, as with a real collar on a pin). The 90 degree Angle mates fix the zig-zag; the book leaves the links free to swing (deleting the two Angle mates gives the mechanism).
Exact interference (browser): **No interference detected**.
Part edit propagation: SHAFT COLLAR boss depth .25 -> .30 in edited in the part editor and saved; in the assembly `Update from library` on the collar made it visibly longer, all 8 mates stayed resolved (1 DOF); assembly Undo restored the .25 collar. The library part was then set back to .25 in (0.635 cm) and re-saved.

## Drawing

App export (Drawing > Drawing on the assembly): A3 landscape, third angle, hidden-line isometric, four numbered balloons with leaders, BOM (ITEM, QTY, DESCRIPTION, MATERIAL), overall dimensions 8.37 x 5.37 cm, title block with the assembly name.
Gaps versus the book sheet: A3 (not A ANSI), MATERIAL column empty (the parts carry no assigned material in their documents), no PART NUMBER column, no company/third-angle icon images (third angle symbol is drawn by the app), no custom properties (Number, Revision, DrawnBy...) filled, sheet scale note reads "4:1 - cm" while the view label reads "2:1" (inconsistent labels in the app output, not investigated), only one isometric view, tangent edges not removed.

## Files and STEP

`LINKS-9.4-browser-2026-09-30.step`: browser assembly STEP, 120,257 bytes, 4 MANIFOLD_SOLID_BREP.
`LINKS-9.4-browser-2026-09-30.mforge`: project bundle export (100 MB, whole library).
