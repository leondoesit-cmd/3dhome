# Exercise 8.10 — fresh valve parts, 1 October 2026

Source: PDF page 423, printed page 8-45. The exercise asks the reader to design a butterfly valve from web references and prepare an assembly drawing. These are explicitly declared designer examples, not dimensions supplied by a companion model. Public arrangement reference: [Emerson Keystone butterfly valves](https://www.emerson.com/en/final-control/products/keystone-figure-1-2-butterfly-valves).

## Completed body and seat tasks

Both parts were started from blank models through desktop Chrome's visible controls. No script authored their geometry. Each has four editable history steps, two fully defined sketches, and one exact native solid. Front-plane concentric circles share a fixed origin and driving diameters; Top-plane stem circles have a fixed origin and driving diameter.

| Part | Front-plane diameters | Symmetric thickness | Top-plane stem passages |
| --- | --- | --- | --- |
| Body | Outside 110 mm, bore 66 mm | 24 mm, Z −12…12 mm | Diameter 12 mm; symmetric 140 mm cut along Y |
| Seat | Outside 66 mm, bore 60 mm | 24 mm, Z −12…12 mm | Diameter 12 mm; symmetric 140 mm cut along Y |

Saved names are `Planchard 8.10 - Butterfly body - fresh design example 2026-10-01` and the matching `Butterfly seat` name. Actual browser downloads were copied to `artifacts/planchard/BUTTERFLY-{body,seat}-stem-bores-browser-2026-10-01.mforge` (259,741 and 259,594 bytes respectively). Same-stem PNGs show the native bores. Read-only bundle inspection confirms circle radii, shared origin points, sketch planes, extrusion ranges and exact topology caches.

The seat was closed and reopened from the local library for a cold native regeneration check. Both saved models and their portable bundles can survive closing the verified task tabs.

## Completed stem task

The fresh stem is a Top-plane origin circle with a driving 11.8 mm diameter and a symmetric 160 mm extrusion along Y (−80…80 mm). Its sketch is fully defined, its two history steps rebuild into one native solid, and Save returned clean. The 0.1 mm radial clearance to the declared 12 mm stem passages is a designer choice. Saved name: `Planchard 8.10 - Butterfly stem - fresh design example 2026-10-01`. Actual Chrome export: `artifacts/planchard/BUTTERFLY-stem-browser-2026-10-01.mforge`, 56,038 bytes, with same-stem PNG. A subsequent cold library reopen rebuilt the native solid successfully; `BUTTERFLY-stem-cold-reopen-browser-2026-10-01.png` records the check. Attachment, actuator and materials remain pending.

## Remaining exercise

The final stem material task selected **Steel 304** through the body material controls, with the app's displayed density **8.00 g/cm³**, and saved clean. This is a declared designer material choice. The actual updated browser export is `BUTTERFLY-stem-steel304-browser-2026-10-01.mforge` (56,333 bytes), with same-stem PNG; read-only inspection confirms the body density is 8 and its appearance matches the chosen catalog entry. The earlier 56,038-byte bundle remains the geometry checkpoint before this material assignment. No production suitability or mass acceptance is inferred.

Materials, remaining valve parts, assembly mates, motion, interference audit and ANSI A landscape third-angle drawing with exploded view, BOM, balloons and notes remain pending. This report does not accept the complete exercise or claim production valve sizing.

## Disc completion and cold reopen — 2026-10-01

A fresh, declared designer-example disc was built entirely through Chrome controls from a blank part. Saved name: **Planchard 8.10 Butterfly disc - fresh designer example 2026-10-01**; library key `cm_muop5g9a`.

- Front-plane circle fixed at the origin, driving diameter 59.8 mm; symmetric 8 mm extrusion.
- Separate Front-plane origin circle, driving diameter 24 mm; symmetric 20 mm merged hub.
- Separate Top-plane origin circle, driving diameter 12 mm; symmetric 140 mm Extrude Cut. The hub keeps the disc connected around the transverse stem passage.
- Six editable history entries, three fully defined sketches, one native body, rebuild succeeded with no saved issues. All measurements are declared designer choices for Exercise 8.10 (PDF 423, printed 8-45); the full assembly and drawing remain pending.

The completed part was clean-saved and exported through Project bundle: `artifacts/planchard/BUTTERFLY-disc-browser-2026-10-01.mforge` (300,306 bytes). The read-only saved backup independently confirms the two symmetric boss ranges (-4..4 mm and -10..10 mm), symmetric cut range (-70..70 mm), and unchanged driving constraints.

After an actual browser reload, the part was reopened through Saved models. Chrome visibly showed six valid steps, all three fully defined sketches and Rebuild succeeded · 1 parts. Proof: `BUTTERFLY-disc-browser-2026-10-01.png` and `BUTTERFLY-disc-cold-reopen-browser-2026-10-01.png` in the artifacts directory. Bundle import through the browser file chooser could not run because the Chrome extension does not have file URL access; no permissions were changed. Saved-library cold reopen succeeded, and the exported bundle is protected on disk.

The completed disc is durable in the native library, its disk backup, and the exported bundle; its tab can be closed safely. No further geometry was started after this checkpoint.

## Final disc correction: continuous web, symmetric 14 mm plate

The previous 8 mm plate checkpoint is superseded: a 12 mm transverse bore opened slots through its front/back sealing faces, even though the merged hub kept the part connected. Through human Chrome feature editing, the first boss depth was changed from 8 mm to **14 mm**, symmetric about Front (Z = -7..+7 mm). The 24 mm diameter / 20 mm symmetric hub and 12 mm diameter / 140 mm symmetric Top-plane cut remain as authored. This leaves a nominal 1 mm continuous front and back web around the 12 mm stem passage. These are declared designer-example choices; no strength or valve-sealing certification is claimed.

Corrected history remains six valid entries with three fully defined sketches and one native body. Chrome showed rebuild succeeded, clean Save, and Project bundle exported. Corrected protected bundle: `artifacts/planchard/BUTTERFLY-disc-solid-web-browser-2026-10-01.mforge` (257,688 bytes); corrected PNG with both sealed front face and upper stem opening: `BUTTERFLY-disc-solid-web-browser-2026-10-01.png`. The earlier 8 mm bundle and proofs remain preserved as superseded examples. The corrected saved library record is durable; the tab can close safely. Full Exercise 8.10 assembly remains pending at PDF 423 / printed 8-45.
