# Exercise 7.4 — fresh swept-cut pencil case example

## Source and chosen design

Visually inspected PDF page 371 (printed 7-63), Exercise 7.4 SWEPT-CUT CASE. The book explicitly leaves dimensions to the designer and requires a pencil case with a semicircular swept cut. This is a labeled designer example, not a measured reproduction of unspecified dimensions.

Authored entirely from blank in desktop Chrome, dark app theme. Initial tab 710849255 was preserved through a five-step exported checkpoint; the same fresh draft continued in tab 710849261. No older model geometry was reused. Accepted library record: **Planchard Exercise 7.4 - swept pencil case example - accepted fresh 2026-09-28**.

| Parameter | Chosen value |
|---|---|
| Outside length × width × height | 200 × 80 × 24 mm |
| Four vertical corner fillets | R15 mm |
| Inward shell wall and floor | 4 mm |
| External groove profile | R2 mm semicircle |
| Groove centre height | 12 mm |
| Material | ABS, app stock density 1.04 g/cm³; designer choice |

## Browser workflow

1. Fully defined Top-plane rectangular sketch: four entities, two driving dimensions, horizontal/vertical and fixed-origin relations; 0 DOF.
2. Blind Boss 24 mm, four-edge vertical Fillet R15, open-top inward Shell 4 mm.
3. Bottom-face sketch converted from the actual rounded boundary, linked to its support face; offset −12 mm along the bottom normal places the closed path at Y12 mm. Eight entities, fully defined.
4. New Right-plane sketch at X15 mm, the path's start: centre (Z0,Y12), arc endpoints (Z0,Y10)/(Z0,Y14), positive-Z semicircle and closing diameter. Three fixed point coordinates, vertical line and two coincident endpoint relations; two entities, six constraints, 0 DOF.
5. Ctrl-select both sketches before opening Sweep Cut; semicircle as profile, converted boundary as path, Follow path, zero twist, scale 1. Seven history steps, one exact solid. The visible groove follows the complete rounded perimeter.

All geometry and parameters above were entered through the visible browser UI. Read-only replay below consumed the actual browser export.

## Acceptance

- Exact Chrome mass: **101638.7 mm³**, **105.7042 g**; centre of mass **(100, 6.600429, 40) mm**.
- Changed the actual upstream Boss depth 24→26 mm in the history editor. Shell, converted path and Sweep Cut rebuilt successfully: **105.8121 cm³**, **110.0446 g**. Screenshot preserved.
- Undo restored 24 mm and closed the previous Mass properties card. Fresh evaluation restored the original exact values and clean Save state.
- Latest Save implementation validated successfully. The recovered draft's inherited library revision caused a genuine conflict; **Save as new copy** preserved the existing record and created the named accepted record above. Actual Saved models click reopened its seven-step history.
- Actual native browser STEP export: **104399 bytes**. Final project bundle: **81199789 bytes**.
- Independent read-only native replay of that bundle: **101.6386786301116 cm³**, centre of mass **(10,0.6600428539211796,4) cm**, no issues, BREP export validation passed.
- No new source fix was necessary for the sweep workflow. The tab was reloaded to validate the worker agent's latest Save transfer fix. No full CI or whole-book completion claim.

## Artifacts

- `SWEPT-CUT-CASE-7.4-browser-2026-09-28.mforge` — final accepted model.
- `SWEPT-CUT-CASE-7.4-browser-2026-09-28.step` — actual native Chrome export.
- `SWEPT-CUT-CASE-7.4-browser-2026-09-28.png` — final restored exact mass and clean Save proof.
- `SWEPT-CUT-CASE-7.4-driving-edit-browser-2026-09-28.png` — 26 mm upstream edit proof.
- Five-step and seven-step browser checkpoint bundles remain protected separately.

The book specifies no unique dimensional/material target. An annotated drawing and pencil-fit study are not claimed here.
