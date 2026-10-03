# Exercise 8.10 continuation - 3 October 2026

Source: printed page 8-45 / PDF page 423. The exercise leaves valve dimensions to the reader. This is a declared designer example continuing the task-created fresh body, seat, disc and stem from 1 October.

## Fresh actuator lever completed

Built from a blank part through visible desktop Chrome controls, circle/rectangle pointer drawing, point positioning, Smart Dimensions, extrusion forms and material controls. No script authored geometry.

- Top-plane origin circle: diameter 26 mm; symmetric 8 mm boss along Y.
- Separate Top-plane arm: X -100 to -8 mm, Z -8 to +8 mm. Fixed inner corner and driving 92 mm length / 16 mm width; symmetric 8 mm merged boss.
- Top-plane origin shaft bore: diameter 12 mm, symmetric 20 mm cut along Y.
- Front-plane origin cross-pin passage: diameter 3 mm, symmetric 30 mm cut along Z.
- Four fully defined sketches, eight history entries, one exact native body; rebuild succeeded with no saved issues.
- Body material: Aluminum 6061, displayed density 2.70 g/cm3. This is a designer choice, not production qualification.

Saved library name: `Planchard 8.10 - Butterfly lever - fresh design example 2026-10-03`; key `cm_murodqbk`.

Protected actual browser exports:

- `artifacts/planchard/BUTTERFLY-lever-shaft-bore-browser-2026-10-03.mforge`: earlier checkpoint before cross-pin passage/material.
- `artifacts/planchard/BUTTERFLY-lever-cross-pin-al6061-browser-2026-10-03.mforge`: accepted completed lever checkpoint.
- `artifacts/planchard/BUTTERFLY-lever-cold-reopen-browser-2026-10-03.jpg`: browser reload and saved-library reopen, eight valid history entries, one native part, visible shaft and transverse pin passages.

Read-only export inspection independently confirms exact dimensions, principal planes, symmetric extents, material and clean rebuild status. After loading the new sketch-display code, the cold-reopened lever has no stray consumed sketch profiles in its 3D view. Curved surface display fixes have targeted test coverage; curved browser visual acceptance is still pending.

## Matching passages, pins and materials completed

All changes below were made with visible Chrome controls and pointer sketching, then saved and exported through Project bundle.

- Stem: two fully defined Front-plane circles, diameter 3 mm, centers (0,0) and (0,70 mm). One symmetric 30 mm Z cut; four history entries, one native body. Existing Steel 304 retained.
- Disc: fully defined Front-plane origin circle, diameter 3 mm, symmetric 30 mm Z cut. Eight history entries, one native body. Steel 304 assigned to the body (8.00 g/cm3).
- Fresh disc pin: blank part, Front-plane origin circle diameter 2.9 mm, symmetric 20 mm Z boss. Key `cm_murp3bqy`.
- Fresh lever pin: separate blank part, Front-plane origin circle diameter 2.9 mm, symmetric 26 mm Z boss. Key `cm_murp5dri`. Cold reload/library reopen confirmed two valid history entries and one native body.
- Both pins have one fully defined sketch and Steel 304 body material. Their nominal 0.1 mm diametral clearance is a declared designer choice; axial retention and manufacturing tolerances are not production-qualified.
- Body: Steel 304 assigned to the body; seat: Nitrile rubber assigned to the body, density 1.30 g/cm3. An initial face-only body appearance action was undone before assigning the body material.

Protected accepted exports are `BUTTERFLY-stem-cross-pins-browser-2026-10-03.mforge`, `BUTTERFLY-disc-cross-pin-steel304-browser-2026-10-03.mforge`, `BUTTERFLY-disc-pin-browser-2026-10-03.mforge`, `BUTTERFLY-lever-pin-browser-2026-10-03.mforge`, `BUTTERFLY-body-steel304-browser-2026-10-03.mforge`, and `BUTTERFLY-seat-nitrile-browser-2026-10-03.mforge` in `artifacts/planchard/`. Read-only inspection confirms native clean rebuilds, exact circle centers/radii, symmetric depths and materials.

After reloading the performance change, a cold-opened seat's first Save reported `data-exact-save-validation=rebuilt`; repeated Save reported `reused`. Both saves finished clean. Browser timing was inconclusive, so no speedup percentage is claimed.

The completed parts are durable in the library and protected bundles; tabs can close safely after Save. Remaining work is assembly mates/motion/interference and the required ANSI A landscape third-angle exploded drawing with explode lines, BOM, balloons, notes and properties. Full Exercise 8.10 remains incomplete, at printed page 8-45 / PDF page 423.
