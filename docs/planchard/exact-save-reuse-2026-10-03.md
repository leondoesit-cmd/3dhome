# Repeated exact Save reuse — 2026-10-03

Source review confirmed that every canonical Save regenerated its full feature history, including repeated saves after body material or appearance changes. The worker's persisted body cache deliberately excludes extrusions and operations with boundary/projection side effects, so it does not eliminate this repeated Save computation.

Save now retains one isolated snapshot of its own successful worker-proven exact mesh results per open document. Subsequent saves may reuse that proof when the existing complete worker geometry keys match. These keys include driving geometry, sketch and reference inputs, parameters, source payloads, and native operation revisions. They use full canonical strings rather than short hashes.

The snapshot contains copied mesh/topology data. It does not borrow live native handles or change STEP/native-export freshness checks. Failed, approximate, unverified, or native-handle results cannot enter the cache. Document identity is required. First Save, cold reopen, and changed geometry still regenerate. Save still performs its normal topology handling, mesh publication, lightweight validation, library write, and clean-state guard.

Verification:

- 21 targeted tests passed: cache fidelity and invalidation, sketch-only saves, material density/mass serialization, and native worker body cache fidelity.
- `npm run check` passed: no free identifiers, 622 linked modules, 1490 source assertions.
- An additional lifecycle test run passed 22 of 23. Its existing STEP-export whitespace regex failure is present in HEAD: the test requires spaces around a ternary that source already writes without spaces. No export behavior was changed by this work.
- Desktop Chrome verification: after reload and cold seat reopen, the first completed Save exposed `data-exact-save-validation=rebuilt`; the next completed Save exposed `reused`, with a clean saved document. The actual kernel validation reuse is confirmed. Browser timing was inconclusive, so no speedup measurement is claimed here.

Follow-up audit: the protected fresh lever-pin bundle compiles as one sketch plus one extrusion. Its complete 2645-byte geometry key stays identical after material/name/color edits. Worker mesh-mode payloads exclude native handles and receive the verified exact marker on restoration, matching cache admission requirements. Save completion now distinguishes **geometry validated** from **previously validated geometry retained**. The Save button retains `data-exact-save-validation="rebuilt"` or `"reused"` for DOM-backed inspection after the temporary completion message fades.

The main agent's initial Chrome measurements were 2642 ms for the first Save action plus accessibility snapshot and 7057 ms for the repeated action plus snapshot. These include browser/tool transport and library/UI work; they do not establish a speedup or reveal which validation path ran. The explicit completion diagnostic was added afterward to make that path observable.

```
node --test tests/exact_save_cache.test.mjs tests/model_sketch_only_save.test.mjs tests/material_density_assignment.test.mjs tests/worker_body_cache.test.mjs
npm run check
```
