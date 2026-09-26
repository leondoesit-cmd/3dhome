# Collar drawing verification — 2026-09-22

Exercise 5.7 was created through the browser as SHAFT COLLAR - exercise 5.7.

Fixed two drawing defects encountered on that model:
- Edge-on tessellation facets could suppress cylinder silhouettes. The Right view lost top/bottom outlines; tangent neighbours now participate in silhouette detection without including coplanar diagonals.
- Diameter references matched a concentric rim by centre alone. Selecting the outer rim could attach its annotation to the bore. Circular references now also match radius.

Browser verification after saving and reloading: Right view has a complete rectangular outline and two hidden bore walls. Front view retains separate outer diameter 0.438 in [11.13 mm] and bore 0.188 in [4.78 mm] callouts. Thickness is 0.250 in [6.35 mm].

66 focused drawing/projection tests passed. Module/link/source-assertion checks passed (505 modules, 1452 assertions). Full test suite not claimed.

Added accessible names and shortcut tooltips to compact drawing toolbar buttons. Presets remain setup conveniences, not a claim of complete ANSI/ISO drafting compliance.
