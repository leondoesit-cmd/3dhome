# Independent review of the additional bug audit

Reviewer: GPT-6 Astra. Implementers: GPT-6.1 Sol. Existing dirty changes and the
20 cases in `tests/bug_audit_20.test.mjs` are excluded from this audit's count.

Acceptance requires a distinct root cause, a supported input or reachable UI
action, source-level evidence, and a regression expectation. A defensive change
without a demonstrated failure is not a confirmed bug. Approval of a proposed
fix is separate from verification of the implemented change.

| ID | Decision and evidence | Correct fix and regression expectation | Implementation review |
| --- | --- | --- | --- |

| P01 | Confirmed: 25 T branches yield 21 base spans, expected 26; splitter stops after 20 passes. | Collect all finite split stations without near-endpoint slivers. | Implemented source reviewed; focused regression passes. |
| P02 | Confirmed: crossing centerlines yield two disconnected walls rather than four incident spans. | Add actual segment intersections; verify common central node. Distinct from iteration cap. | Implemented source reviewed; focused regression passes. |
| P03 | Confirmed: arc-only CAD doorway disappears; arcs are added after opening assignment. | Build arcs first and use analytic projection and arc length for opening fit/clamp. | Implemented source reviewed; focused regression passes. |
| P04 | Confirmed: paired 320 cm wall faces produce a 270 cm wall; paired metadata drops height. | Retain valid measured height with deterministic face-height policy. | Implemented source reviewed; focused regression passes. |
| P05 | Confirmed: supported bare GeoJSON Polygon produces zero walls. | Normalize supported direct geometries into feature processing; test Polygon/MultiPolygon/LineString. | Implemented source reviewed; focused regression passes. |
| P06 | Confirmed: explicit metre coordinates 4 × 3 become 44,512,541 cm wide due to geographic guessing. | Recognized explicit local units override geographic inference; keep default geographic behavior. | Implemented source reviewed; focused regression passes. |
| P07 | Confirmed: MEP 0→200→100 cm simplifies to 0→100 and loses a device spur. | Require middle point to lie between endpoints before collinear removal; preserve straight simplification. | Implemented source reviewed; focused regression passes. |
| C01 | Confirmed: valid three-point path yields parallel tangent/normal and zero binormal at sharp turn. | Transport or orthogonally reconstruct collapsed normal; verify orthonormal frames and proper rotations. | Implemented source reviewed; focused regression passes. |
| C02 | Confirmed: skip input `1 - 3` returns only 1 and 3; whitespace tokenizer defeats range parser. | Normalize/tokenize spaced ranges before splitting; test ascending/descending and mixed input. | Implemented source reviewed; focused regression passes. |
| C03 | Confirmed: oblique ray's near cylinder root is outside axis trim, far root inside; selected Up To Face incorrectly throws. | Test all positive roots against face trims in extent resolution; preserve public raw-surface nearest-hit semantics. Cylinder/cone variants count once. | Implemented source reviewed; focused regression passes. |
| C04 | Confirmed: inserting an assembly with four pattern occurrences leaves two after flatten/replay; authored recipes and custom properties were omitted from snapshot. | Copy authored componentPatterns and customProperties into isolated embedded snapshot; verify pattern replay and PartNo. | Implemented source reviewed; focused regression passes. |
| C05 | Duplicate of C04: missing PartNo/Description is another omitted snapshot field. | Include in C04 fix and regression; does not increase bug count. | Replacement requested. |
| C06 | Confirmed: translated face retains child-space AABB; valid parent-space hit fails trim test. | Transform all eight bounds corners and rebuild parent-space AABB; verify rotation and source immutability. | Implemented source reviewed; focused regression passes. |
| P08 | Confirmed: transition into spatial-format destination ignores slab hole and allows a void landing. | Normalize destination collision fields. Room metadata pass-through alone does not enforce headroom without detected room polygons. | Approved; focused regression passes. |
| P09 | Confirmed: 100 cm square rotated 45° has extent 50 instead of 70.71 cm. | Compute rotated rectangular bounds for items/voids and include rotation in cache identity. | Implemented source reviewed; focused regression passes. |
| P10 | Confirmed: centerline wall thickness 10→100 cm returns cached 10 cm content bounds. | Include all wall-outline dependencies in bounds cache identity. | Implemented source reviewed; focused regression passes. |
| P11 | Confirmed: requested item rotation 90° overwritten by auto-facing to 180°. | Preserve explicit rotation intent, including zero; omitted rotation still auto-faces. | Implemented source reviewed; focused regression passes. |
| P12 | Confirmed: shape command with supported defaults fails INVALID_PLAN due undefined dimension metadata. | Normalize defaults once for polygon and saved metadata; explicit invalid values remain invalid. | Implemented source reviewed; focused regression passes. |
| P13 | Confirmed: survey import in metres leaves ceiling height 2.4 cm instead of 240 cm. | Scale supported dimensional room metadata with geometry; field variants count once. | Implemented source reviewed; focused regression passes. |
| C07 | Confirmed: finite large angle freezes repeated-subtraction wrapping; independent 1e20 dual wrap timed out. | O(1) modulo in dual/sketch/mate wrappers; construct wrapped dual value directly to avoid cancellation, preserve gradients and ±π semantics. | Implemented source reviewed; focused regression passes. |
| C08 | Confirmed: normalized imported cylinder keeps source referenceOrigin/axisRange; UV range is [20,24] instead of [0,.4]. | Transform all supported topology point/direction/length fields consistently. | Implemented source reviewed; focused regression passes. |
| C09 | Confirmed: 1 mm imported body publishes 1 cm library dimensions while its parameter is .1 cm. | Use shared engineering-scale modelDimensions policy instead of 1 cm clamp. | Implemented source reviewed; focused regression passes. |
| C10 | Confirmed after additional evidence: hollow X-prism recognition falls back to direct mesh; normals are perpendicular to their rotated triangle normals (dot 0 instead of 1). | Rotate normal buffer through normalization frame without translation/unit scaling. | Implemented source reviewed; focused regression passes. |
| P14 | Confirmed: measured floor-reaching scan window gets 90 cm sill instead of zero. | Preserve measured zero while retaining fallback for missing measurements. | Implemented source reviewed; focused regression passes. |
| P15 | Confirmed: nested capturedRoom units alias cm interpreted as metres, 400→40000 cm. | Resolve all supported nested unit aliases before outer fallback. | Implemented source reviewed; focused regression passes. |
| P16 | Confirmed: narrow GeoJSON room outline is wrongly treated as paired wall faces. | Disable face-pair inference for known centerline GeoJSON outlines. | Implemented source reviewed; focused regression passes. |
| P17 | Confirmed: imported Kitchen metadata stored under name, while detected room uses wall-ID key. | Bind metadata to final canonical boundary wall keys, including split/shared edges. | Implemented source reviewed; focused regression passes. |
| P18 | Confirmed: two prepared overlapping doorway commands commit in one batch. | Revalidate opening invariants immediately before mutation and roll back batch on overlap. | Implemented source reviewed; focused regression passes. |
| P19 | Confirmed: curved-wall MEP station yields off-wall endpoint and chord-cutting route. | Use analytic wall projection/positions and sample curved spans; preserve opening barriers. | Implemented source reviewed; focused regression passes. |
| P20 | Confirmed: hip-roof mesh height at (100,300) is 270 instead of analytic 370 cm. | Choose cell diagonal respecting hip ridge; test four corners and rectangular roof. | Implemented source reviewed; focused regression passes. |
| P21 | Confirmed: removing 8 cm GeoJSON boundary segment prevents closed-room detection. | Retain nonzero measured boundary segments without tolerance collapse. | Implemented source reviewed; focused regression passes. |
| P22 | Confirmed: adjacent room polygons duplicate common wall (8 walls instead of 7). | Deduplicate split shared centerline spans before assigning room metadata. | Implemented source reviewed; focused regression passes. |
| P23 | Confirmed: unrelated distant curved wall prevents valid new L-room creation. | Limit unsupported-curve rejection to potential spatial interaction using conservative analytic bounds. | Implemented source reviewed; focused regression passes. |
| P24 | Confirmed: distant diagonal wall's AABB overlap wrongly blocks room resize. | Clip actual segment against expanded target rectangle; preserve real collisions/shared-corner behavior. | Implemented source reviewed; focused regression passes. |
| P25 | Confirmed: planner rejects standard .5 m and -.5 m inputs. | Accept leading decimal grammar in length/area paths while retaining prior signed-feet semantics. | Implemented source reviewed; focused regression passes. |
| C11 | Confirmed: moving recorded extrusion translates outer loop but leaves inner hole at old coordinates. | Translate all nested profile/typed segment points once; includes loft section segments. | Implemented source reviewed; focused regression passes. |
| C12 | Confirmed: recorded radial revolve cutter ignores host translation; exported recipe remains at old axis. | Accumulate xyz radial-revolve placement and preserve it in kernel recipe. | Implemented source reviewed; focused regression passes. |
| C13 | Confirmed: different same-name/same-size meshes receive identical definition IDs and overwrite registration. | Include actual content in deterministic import identity, preserve explicit IDs and unchanged-content stability. | Implemented source reviewed; focused regression passes. |
| C14 | Confirmed: two equal-depth bosses produce one drawing model item because dedupe compares value alone. | Preserve distinct source identities; manual dedupe requires matching anchors. | Implemented source reviewed; focused regression passes. |
| C15 | Confirmed: moved origin-flagged point is returned as sketch origin away from (0,0). | Require actual origin coordinates and active fixation; ignore suppressed fixed relations. | Implemented source reviewed; focused regression passes. |
| C16 | Confirmed: failed cyclic plane resolution still writes recovered offset into document. | Stage resolution/twin repair and publish only after successful graph validation. | Implemented source reviewed; focused regression passes. |
| C17 | Confirmed: circular pattern of four Hole Wizard cuts reports quantity one. | Count all supported pattern modes using placement semantics; respect skipped/suppressed instances and valid equal-spacing meaning. | Implemented source reviewed; focused regression passes. |
| C18 | Confirmed: projected hole at (10,10) binds unrelated inherited bore at (0,0). | Restrict unique-bore legacy fallback to absent projected target. | Implemented source reviewed; focused regression passes. |
| C19 | Confirmed: radial cylindrical hole callout uses origin/Y instead of live entry (0,3.175,1.27)/Z. | Resolve current cylindrical/separate-sketch placement without mutating document; retain ordinary layout behavior. | Implemented source reviewed; focused regression passes. |
| P26 | Confirmed: GeoJSON omits nextId despite allocating from nondefault firstId; UI fallback can collide with imported IDs. | Propagate converter's next unused ID, preserving allocations removed by dedup. | Implemented source reviewed; focused regression passes. |
| P27 | Confirmed: ground walker is supported at 450 cm by unrelated upper-floor stairs. | Filter foreign stair flights by active-floor vertical reach; retain incoming descent flight. | Implemented source reviewed; focused regression passes. |
| P28 | Confirmed: applying survey preview deletes marker added after preparation because fingerprint omits replaced fields. | Fingerprint all replaced geometry and active-floor/permission context; reject stale preview without mutation. | Implemented source reviewed; focused regression passes. |
| P29 | Confirmed: stored upper-floor 700 cm wall measured using active 400 cm wall (390 cm clear). | Resolve target-floor scene before dimension measurement; restore global geometry/revision after query. | Implemented source reviewed; focused regression passes. |
| C20 | Confirmed: rotated cylinder footprint uses original position and misses cut through actual world bounds. | Use supplied transformed envelope for unbaked pattern placements, with native intersection as final decision. | Implemented source reviewed; focused regression passes. |
| C21 | Confirmed: consumed sketch repair updates feature IDs but leaves merged boss loop/analytic segments and host mesh stale. | Synchronize matching merges as well as cuts and invalidate host mesh; preserve idempotence/ambiguity rules. | Implemented source reviewed; focused regression passes. |
| C22 | Confirmed: tangent line/quarter-circle produces only line in tangent chain; arc chord substitutes for endpoint tangent. | Evaluate circular axis×radial tangent at shared endpoint; reject chord-aligned nonsmooth join. | Implemented source reviewed; focused regression passes. |

Initial reproductions were run independently against the pre-fix product source.

Review corrections required for P01 (preserve short original segments and deduplicate
against the last kept station) and P06 (do not claim extra unit support without
corresponding factors). These are implementation corrections, not additional bugs.

C01–C03 implementation diff independently inspected and their three focused
regressions pass. C03 additional raw-hit compatibility and cone coverage requested.

P01–P13 implementation diffs inspected; all thirteen focused regressions pass.
P01/P06 review corrections are implemented and accepted.

C04 and C06–C09 implementation diffs inspected; their focused tests pass.
Current confirmed total: 50 (29 planner, 21 core). C05 is excluded as duplicate.

## Final independent implementation review

All 50 accepted fixes have been checked against their implemented source and
their focused regression results. Independently rerun: 29 planner cases pass,
21 core cases pass, including the actual OpenCascade export-centroid regression.
Additional preservation assertions cover valid doorway batches, curved-wall
doorway barriers, rectangular hip roofs, actual neighbor collisions, stair
descent, stale-preview rejection, and ordinary existing geometry behavior.

C05 was merged into C04 and excluded from the count. C10 was held until a
real hollow-prism direct-mesh fallback demonstrated the affected rendering data.
P01/P06 implementation defects were corrected before acceptance and were not
counted as extra bugs. The prior 20-case audit was not recounted.

No outstanding source-review blocker remains for these fixes. Confidence is
high for the reproduced behaviors; full repository gates and real-browser/GPU
coverage are integration responsibilities and are not implied by these focused
Node results. This audit does not claim all application defects are exhausted.

## Integration follow-up

The browser oblique-sketch regression exposed an asynchronous preview startup
race: `setMode` relocated the canvas while `E.pv` was null, then delayed
`initPreview` created a view with `big:false`. Its 16px thumbnail padding caused
the measured 998x599 renderer versus 1014x615 sketch overlay mismatch (full CI:
998x620 versus 1014x636, with `big:false`). Reviewed
the localized correction: replay the existing viewport swap using the current
mode/split after renderer creation, with rendering suppressed until normal
initialization completes. Independently reran all three viewport-transition
tests, including delayed loading in 3D, split, 2D, and drawing modes; all pass.
The unchanged three-test browser sequence also passes after the correction.
The browser's 1.25px preview/commit assertion and readiness timeout are retained.
This integration correction is outside, and does not increase, the 50-case count.

## Integration verification

The primary agent completed verification after Sol's fixes and Astra's review:

- Repository module, named-export, and source-assertion checks pass (713 modules).
- The full Node suite passed 5,251 tests with zero failures, including the exact HOUSING shell cases.
- After the preview startup correction, all 109 affected Node and performance tests passed, including the added delayed-load regression.
- The final complete browser run passed 445 tests with zero failures and 210 expected skips. Both previously failing viewport cases passed with their original assertions.
- Regular Chrome rendered the furnished 3D room without recorded browser errors. The existing recovery prompt and project data were left untouched.

The initial combined CI run's two browser failures were superseded by the
reviewed startup correction, affected-test run, and clean full browser rerun.
Results are recorded locally in `audit50-ci.log`, `audit50-affected-node.log`,
and `audit50-browser-final.log`.
