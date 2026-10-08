# Exercise 8.18 saved endpoint solver correction

The actual Chrome closed endpoint and Motion Study endpoint exposed a numerical convergence defect. Their geometry satisfied all physical mate tolerances, but a cold solve aggregated 317 signed residual rows into an L2 objective just above its fixed `1e-11` convergence threshold. The closed endpoint exhausted 120 iterations at `1.1291542871392422e-11` despite its largest row being only `6.828315690654563e-12`. Diagnostic subset solving consequently dropped valid mate 4432 with measured linear/angular residuals both zero, producing a false two-DOF result. The browser Motion Study endpoint refresh likewise reported an unresolved mate and three freedoms.

`js/cad_mate_solver.js` now checks the same `1e-11` optimizer tolerance individually on every signed residual row. Least-squares minimization still uses the L2 objective. Physical acceptance thresholds remain `1e-3` cm linear and `1e-4` rad angular, and failed poses still go through diagnostic subset solving. This removes the dependence of optimizer convergence on the number of redundant residual rows; it does not change travel limits, resolve broken references, or hide physically unsatisfied mates.

The reduced `tests/fixtures/kant-twist-browser-native-mates.json` retains untouched saved occurrence poses, canonical mate values, and the exact native reference descriptors actually read by the solver. It removes authored feature recipes, native geometry and display caches. It is derived from these actual browser exports:

- `KT-assembly-drive-closed-endpoint-browser-2026-10-08.mforge`
- `KT-assembly-drive-negative-quarter-browser-2026-10-08.mforge`
- `KT-assembly-parallel-free-home-browser-2026-10-08.mforge`
- `KT-motion-study-endpoint-unresolved-browser-2026-10-08.mforge`

Five regressions in `tests/kant_twist_saved_solver.test.mjs` pass: three successive cold endpoint JSON reopenings retain all 36 mates and rank 144/144 (zero driven freedoms); the saved quarter pose retains all driven constraints; the actual free Motion Study endpoint refresh retains rank 143/144 (one freedom); applying the actual saved screw motor to time 10 then refreshing its free mates retains one freedom and a 10 mm jaw opening; requesting Drive −10.5 beyond the closed stop still fails with a physical residual above the unchanged acceptance threshold. Pose preservation is compared in translations and full rotation matrices rather than Euler triples.

The saved quarter pose remains physically accepted but can still report a truthful stalled optimizer flag (`settled=false`), because its independently quantized residual floor is above the optimizer threshold. This correction does not relabel that optimizer outcome as converged. It retains `ok=true`, all mates and zero driven freedoms. Browser acceptance of a repeated Motion Study operation is parent-owned and separate from these source regressions.

Seventeen existing saved precision, closed-loop, coupled screw, limit and lock tests also passed. All source gates passed: no free identifiers, 640 module links, and 1489 source assertions (21 not a plain regex literal). The independent post-fix full-definition audit also confirmed all 16 accepted source recipes and 25 valid native occurrences, with zero translation change and maximum rotation matrix change 3.33×10⁻¹⁶. Its separate `KT-assembly-closed-endpoint-postfix-definition-audit-2026-10-08.json` preserves the original pre-fix failure report as historical evidence.
