# Exercise 2.3A browser model audit — 2026-10-10

**Nominal native geometry 15/15 PASS; drawing 9/9 PASS. Final workflow pending actual STEP, saved-library cold replay and driver proof.** Source PDF126/printed2-40 requests an isometric drawing with approximate sizing. The native supporting model uses illustrative 80 × 40 × 15 mm base, a 20 × 40 mm upright extruded 35 mm above Y15, and a 15 × 20 mm viewer-facing open fork removed through the base. Dimensions, hidden depth and material are not specified by the publisher.

Protected actual Chrome qualified bundle (133482 bytes) contains three fully defined Top sketches, three dependent features and six valid rebuilt history entries, with no rollback. Native read-only regeneration produces one valid connected solid with 80 × 50 × 40 mm bounds and volume exactly 71,500 mm³, agreeing with 48,000 + 28,000 − 4,500. Cut profile is X30..45/Z20..40 at Y15, reverse 15 mm to Y0; the +X/+Y/+Z isometric view exposes the fork and upright consistently with the source interpretation. Input bytes remain unchanged.

Actual A3 landscape/mm/third-angle Drawing contains four native 1:1 views and two six-line source/construction notes, no imitation primitives, hidden lines off, correct source title/Description. All twelve note rows occur in the protected SVG (16218 bytes). Independently inspected actual PNG shows the upright and open fork, separate readable views/notes, and complete frame/title.

No actual STEP is present at audit time. Export toasts alone are not STEP evidence; read-only native regeneration does not establish a successful browser STEP download, Save persistence or driver replay. Audit JSON: `artifacts/planchard/EXERCISE-2.3A-qualified-browser-2026-10-10-audit.json`; read-only harness: `scratch/planchard/exercise23a-native-readonly-audit.mjs`.


## Actual saved-library cold and STEP acceptance

After actual hardreload/exact library reopen, protected cold bundle134410bytes, actual STEP41194bytes, SVG16218bytes and fresh PNG are available. **Native/STEP17/17 and cold6/6 checks pass (23/23).** Actual STEP contains one valid connected solid with exactly71,500mm³ volume; native-minus-STEP and STEP-minus-native residuals both zero. All authoring/history/source qualification/whole Drawing remain exact against qualified export and SVG bytes are identical. Only derived parts/rebuild/topology cache change and six default origin planes/axes materialize from the previously empty referenceGeometry array. Cold PNG independently inspected: source upright/fork and four separate views/two readable notes remain correct.

This supersedes the earlier missing-STEP/unverified-save observation. The cause of that earlier browser download/save delay is unproven. Driver proof remains pending at this checkpoint, and2.3B is still unfinished; the numbered2.3 identifier is not complete.


## Actual Boss-height driver

Actual Chrome Boss2 height35→36mm driver bundle135394bytes/STEP41203bytes passes native17/17 plus driver isolation6/6 checks (23/23). Native and actual STEP each have one valid connected72,300mm³ solid, bounds80×51×40mm, zero bidirectional residuals. The volume delta is exactly+800mm³, the20×40mm upright footprint times1mm. Only Boss2 depth3.5→3.6cm and derived end5→5.1cm change in feature authoring; all three sketches, six history rows and entire Drawing remain exact. Revision/standards audit and native-derived caches refresh. The Drawing's associative overall height projects51mm without altering its saved dimension definition.

Parent performed actual Undo/Redo/Undo; final restoration bundle/save status remains pending at this checkpoint. No final restoration or whole2.3 acceptance is claimed yet.


## Actual Undo/Redo/Undo restoration accepted

Protected actual restored bundle134410bytes passes6/6 canonical restoration checks against the accepted cold nominal. Every authoring, feature, sketch, history, material/context/reference, native parts/topology cache and whole Drawing field is exact. Boss2 depth35mm/endY50mm is restored. Only lastRebuild timestamp data and lastStandardsAudit.at differ; rebuild is successful with the same canonical signature and standards result remains clean. Actual unsaved status marker was observed by parent; its cause is not established by these bundle comparisons, and is not represented as a new persistence failure because the nominal cold saved record already passed.

**2.3A source-qualified browser model, actual STEP, cold persistence, height driver and canonical restoration accepted.** Overall numbered2.3 stays pending until lower model2.3B is complete.
