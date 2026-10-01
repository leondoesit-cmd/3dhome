# Fresh HOUSING - complete through Mirror1 (book PDF 335-364), real Chrome

Protected outputs: `HOUSING-final-browser-2026-09-28.{mforge,step,png}` (copies of the checkpoint `HOUSING-mirror1-browser-2026-09-29.*`, exported straight after Mirror1 was saved). Earlier stage notes: `HOUSING-handle-switchhole-browser-2026-09-28.md` (HandlePath .. Rib2 detail and gaps).

## Result

* Library model `Planchard HOUSING - rebuilt 2026-09-28`, 15 features / 27 history steps: Base Extrude, Boss-Loft1, Boss-Battery, Shell 1, Boss-Stop, Draft 1, ThreadPath, Thread, Handle, SwitchHole, Rib1, LPattern1, Pattern 2, Rib2, Mirror1. Saved to the library after Mirror1 (IndexedDB record verified: Mirror1 seed = Rib2, `scope: feature`).
* Exact solid, one body: overall 13.0175 x 13.1128 x 18.034 cm, **volume 230.5156 cm3**, mass 1.809548 kg (default steel 7.85 g/cm3), COM (0.1203528, 0.3428978, -5.560058) cm. (Handle stage was 210.3074 cm3; ribs, patterns, Rib2 and Mirror1 add 20.21 cm3.)
* Native STEP export: 2,947,717 bytes, Open CASCADE 7.6 AP214, one MANIFOLD_SOLID_BREP. Project bundle 13,406,020 bytes. PNG = viewport screenshot (dark theme, shaded with edges, Mirror1 last in the tree).
* Reopen from the library: performed twice this session (the saved Rib2 state, with a cold exact rebuild of about 10 minutes each time, then Mirror1 was added on that reopened model). The Mirror1 save itself was not reopened again after saving.
* Driving-dimension edit and Undo: Boss-Stop depth 0.254 -> 0.3 cm through Edit feature. Full downstream rebuild finished with no error, still one solid, **volume 231.7412 cm3** (+1.2256), COM Z -5.529188. Undo restored **230.5156 cm3** and COM (0.1203528, 0.3428978, -5.560058) exactly, and cleared the unsaved flag. Note: HandlePath's start point is Coincident with the Boss-Stop start rim (Z = 0), so Boss-Stop *thickness* moves the far face only and does not move HandlePath; a HandlePath end that follows an upstream edit is the Boss-Battery corner (`at:"start"` binding, Z -14.478, Y 3.8689), which was not edited separately in Chrome (each edit plus Undo costs about 30 minutes of exact rebuild on this machine).

## Mirror1: an app gap, fixed

The Mirror feature mirrored the whole selected body, and the kernel returned a compound of the body and its reflection (never a single fused solid, and it would reflect the helical thread into the wrong hand). The book mirrors only **Rib2**. Fix: Mirror now has `scope: feature` + `seedFeatureId` (Mirror form: "Mirror scope"; picking a rib/boss in the tree seeds it). The kernel lowering reflects only what the seed added (`seed - seed.input`) and fuses it back (`js/core/kernel_feature_adapter.js`, `js/modeler.js quickMirrorPart`, `js/core/feature_catalog.js`). Test: `tests/planchard_housing_tools.test.mjs` "Features to Mirror" (plate + reflected web exactly, plate not mirrored). Before the fix the Apply check did nothing in the browser (quickMirrorPart needed a solid selected).

## Other gaps fixed this run (details in the stage notes)

Curved-edge chords picked as lines, screen-space picking of model edges/corners, stale model picks, and the multi-surface parallel Rib (Rib2). `npm run check` clean; rib, mirror, pattern and relation tests pass (24 + 5 + 11).

## Not done / caveats

* Rib sketches partially defined (book allows), two Pattern features instead of one two-direction pattern, no rib draft (Parallel Rib refuses draft).
* The Mirror1 volume delta was not measured separately (no exact volume was read between Rib2 and Mirror1).
* The HandlePath-follows-upstream check was only argued from the stored bindings, not exercised with a Boss-Battery edit.
* Environment: the machine blue-screened once during this work; the memory logger `scratch/planchard/chrome-mem-2026-09-29.log` was not running at first and was started late (Chrome main renderer peaked about 2.2 GB, free RAM about 21 GB during rebuilds; no tab crash occurred after the reboot).
