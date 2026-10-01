# PIN — exercise 6.2

Source: local Planchard ebook, PDF page 303. Created from a blank part through desktop Chrome; no prior model or scripted geometry was used.

## Browser construction

- Front-plane closed six-edge stepped profile, fixed at the left head centre.
- Six horizontal/vertical relations and four named driving dimensions: HeadRadius 1.000 in, HeadLength 1.375 in, ShaftLength 2.101 in, ShaftRadius .7625 in. Fully defined, 0 DOF.
- 360° X-axis revolve: Ø2.000 in head, Ø1.525 in shaft, total length 3.476 in.
- One Distance-and-angle Chamfer feature: .100 in / 45° on the outer head shoulder circle and free shaft-end circle.
- Aluminum 6061, density 2.70 g/cm³; inch document units and ANSI inch/third-angle drafting preset.

## Acceptance

Three editable history steps, one exact solid. Saved to the new library entry, reopened in Chrome, then exported as `.mforge` and exact `.step`.

- Exact volume: 132.8004 cm³.
- Mass: 358.5611 g.
- Centre of mass: X 38.10703 mm, Y 0, Z 0.
- Bounds: 88.2904 × 50.8 × 50.8 mm.
- Independent analytic cylinder volume minus the two 45° chamfer annuli: 132.8004001224 cm³.
- Upstream HeadLength edit 1.375 → 1.475 in preserved 0 DOF, both chamfers and one solid; total length became 3.576 in, volume 137.9485 cm³. Restored the printed dimension before final save/export.

A renderer stack overflow interrupted an initial Drawing transition. Reopening the saved fresh part recovered it; the final ANSI selection, save, exports and exact mass evaluation succeeded. Renderer diagnosis remains a separate product issue.
