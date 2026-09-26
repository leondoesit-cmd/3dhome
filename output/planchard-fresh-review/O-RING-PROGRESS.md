# O-RING — chapter 7

Browser-authored from the user's *Engineering Graphics with SOLIDWORKS 2021* PDF, physical pages 312–314 (printed 7-4 to 7-6), on 2026-09-24. Saved in the ModelForge library as **O-RING - chapter 7 - lens seal**; the local disk backup is `.model-backups/cm_mueycj6t/latest.json`.

- The Front-plane **Sketch-path** is a fully defined circle centered at the origin with a driving Ø4.350 in dimension (11.049 cm).
- **Base-Sweep** carries a circular Ø0.125 in profile (0.3175 cm) around the closed path as one exact solid. The outer diameter is 4.475 in, the inner diameter is 4.225 in, and the section thickness is 0.125 in. The saved tree has the book's one path sketch and one Sweep feature, both rebuilt successfully.
- Exact mass-properties evaluation gives 0.1677062 in³, matching the analytic torus volume `2π² × 2.175 × 0.0625² = 0.16770617 in³`. The book does not specify an O-ring material. ModelForge displays a steel-assumed mass when no material is assigned; that readout is not a material-qualified mass for this part.

The workflow exposed two presentation gaps. Renaming a standalone generating feature left its inherited solid-body name and selected-body breadcrumb stale; a feature rename now follows through to its body when the body has not been independently named. The one-sketch circular Sweep form also labeled its path “Second selected sketch”; it now shows the actual selected sketch name. A third display issue came from measuring the sampled sweep mesh for the tree size: the exact BREP bounds now take precedence, and the readout shows **4.475 × 0.125 × 4.475 in** without tessellation or tolerance noise.

Verification: after a hard browser reload and library reopen, the ring rendered as one solid with two editable steps, a valid build order, the synchronized **Base-Sweep** body and feature labels, the corrected size, and no browser console errors. Opening a new Sweep command showed **Sketch-path** in the Path field; it was cancelled without changing the model. The focused kernel/tree tests passed 60/60; `npm run check` passed with 546 linked modules and 1,470 source assertions; `git diff --check` passed.
