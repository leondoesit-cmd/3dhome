# Fresh HOUSING Shell investigation

The model was authored from blank through desktop Chrome using the book's Base Extrude, BatteryLoftPlane, SketchCircle, SketchSquare, Boss-Loft1 and Boss-Battery workflow. The saved browser checkpoint is `fresh-housing-boss-battery-browser-checkpoint-2026-09-28.mforge` (revision 7). Its neutral pre-Shell exports are `fresh-housing-boss-battery-pre-shell-2026-09-28.step` and `.stl`.

## Input

- Base diameter 4.375 in; base and loft length 1.300 in each.
- Rounded profile side spacing 3.100 in; top 1.600 in above origin; corner radius .500 in; original lower circular arc retained.
- Boss-Battery length 4.400 in, 1 degree draft.
- Shell: .100 in / .254 cm, inside, round, remove the front disk at z=0 (`feature_mukcxaa9_2:face:start`).
- Exact base volume: 1355.6756057276934 cm³; bounds 11.1125 × 11.1125 × 17.78 cm.
- SketchSquare retains a 3 DOF warning after trim and fillets. Its committed geometry matches the book dimensions.

## Bounded Node measurements

All probes have a 240 second supervisor deadline. Logs live under `scratch/planchard/housing-shell-benchmark-*.log`. Timings include the actual exported sketch/history; no previous model was used as the input.

| Construction | Result |
| --- | --- |
| Original generic cavity unions | Timed out at 240 s during final cavity join/repair |
| Fuzzy union first | Timed out at 240 s during final cavity join; rejected |
| Alternate local frame | Timed out at 240 s; rejected |
| Direct plain union, then existing fuzzy fallback | Exact Shell 228.235 s; 1 valid solid; 156.3517466643741 cm³; maximum tolerance .0005890543 cm; export gate passes |
| Compound cavity tool | 90.159 s, but exact attempt produced 3 solids and fell back to sampled approximation; rejected |
| Compound tool then wall-cell fusion | 80.282 s and topologically valid, but volume 1064.1944236 cm³; rejected as wrong geometry |
| Sequential exact cavity cuts | 203.248 s, invalid exact solid and sampled fallback; rejected |
| Fuzzy-first with export tolerance as early-accept threshold | Exact 190.663 s, identical mass/inertia/bounds/tolerance to direct-union result; left unpromoted because it changes the internal precision selection and does not solve UI blocking |

The expensive original path is the generic union helper's extra subtraction/re-union repair of loose overlapping shapes. Shell's junction construction already compares plain and fuzzy cavity joins and does not need that generic repair. The targeted production change builds the plain union once, retains the material-volume, validity and tolerance checks, and retains the exact fuzzy fallback.

## Original browser limitation

The original CAD kernel executed WebAssembly synchronously on the UI thread. Shell preview/commit blocked input for many minutes. The targeted kernel repair removes the pathological extra repair, but a 228 second main-thread operation remains unsuitable for an interactive workflow. The module Worker route below moves this expensive regeneration off the UI thread.

## Worker implementation checkpoint

Exact model regeneration and canonical finish previews now use a module Worker. Results return serialized exact BREP, persistent topology, issues, resolved support updates, and a display mesh; the main thread restores independent native handles for existing mass/export/selection consumers. Exact Shell preview results are cached against upstream history, sketches, supports and parameter overrides and can be reused on commit. Cancellation terminates the worker and rejects its queued jobs; obsolete worker replies and older document/history results cannot publish.

Five worker tests pass, including real exact BREP roundtrip, Shell preview/commit reuse, canonical adapter array references, JSON-normalized frame alias equivalence, upstream geometry and parameter-override invalidation. Two queue tests cover rejection recovery and detaching obsolete work on document replacement. The lifecycle/kernel/finish preview focused group passes (27 tests). Identifier, import-link and source-assertion gates pass.

Desktop Chrome demonstrated a responsive Shell thickness field and cancellation in 1.5 seconds. The exact preview completed in approximately 238 seconds; Accept committed the eighth history step in 1.83 seconds. Exact browser Mass properties reports one solid, 156.3517 cm³ and 11.1125 × 11.1125 × 17.78 cm bounds. Save completed and the UI displays no unsaved changes. The loaded earlier worker version unnecessarily repeated Shell after commit and Save; the array-reference and frame-alias cache fixes are covered by focused tests and require a browser reload. Main-thread BREP hydration can still briefly block input (a roughly ten-second observation timeout occurred during this Save).

Clean ordinary UI exports succeeded: `fresh-housing-shell-saved-browser-2026-09-28.mforge` (70,323,253 bytes), `.step` (1,576,385 bytes), and `.stl` (1,970,284 bytes). The screenshot is `housing-shell-saved-chrome-2026-09-28.png`. Browser automation download listeners and a CDP event read stalled the automation router, so acceptance uses ordinary UI clicks, AX success state, and filesystem download verification.

No faster candidate was accepted merely because it exported or passed topology validation; exact volume and wall/seam checks remain required.

## Regression verification

The positive-Z checkpoint above is a Shell performance fixture, not a completed book HOUSING. Comparing the printed stop location exposed the original fresh build's wrong back-face selection. Browser history is being corrected: SketchCircle uses Base:start at z=0, BatteryLoftPlane lies at z=-3.302 cm, and the exact loft now joins z=0 to z=-3.302 cm. The corrected Shell must open Base:end at z=+3.302 cm; BossStop must grow along +Z from the Front Plane at the cylinder/loft junction. Thread, handle, and later features remain pending. Repair checkpoints preserve the original and in-progress geometry separately.

- `npm run check`: passed (identifier, link and source assertion gates).
- Fresh browser positive-Z HOUSING regression: passed in 289.931 s. It checks an exact exportable single solid, volume 156.35 ± .02 cm³, maximum tolerance below .001 cm, unchanged axial bounds, every sampled crease retaining its wall, and dense perpendicular wall gauges at six elevations.
- The two existing HOUSING exact regressions passed in 310.539 s and 381.243 s (692.36 s total).
