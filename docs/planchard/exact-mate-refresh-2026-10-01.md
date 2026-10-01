# Exact mate reference refresh — 1 October 2026

A successful native reference refresh previously replaced the verified topology cache and repainted only selection controls. Mate diagnostics, component freedom and solved placement continued to describe the previous reference set until another assembly operation caused a solve. The refresh now solves the current assembly quietly and performs its full UI refresh before reporting success. Failed native rebuilds and delayed results belonging to a changed assembly retain their guards.

Focused verification: `node --test tests/mate_reference_refresh.test.mjs tests/exact_topology_cache.test.mjs` — 14 passed. Module/link checks passed (617 modules); 1,490 source assertions passed.

Read-only cold audit of the protected CAPANDLENS bundle found valid surviving native topology on every leaf: LENSCAP 55 entries, O-RING 12, LENS 60 and BULB 114. No change to topology signature safety was needed.

Chrome tab 710858895 opened the latest fresh CAPANDLENS library record from a new page. All six mates resolved immediately; O-RING and rigid LENSANDBULB were fully constrained. Proof: `artifacts/planchard/CAPANDLENS-cold-native-cache-browser-2026-10-01.png`. This shows cold cache persistence acceptance, not a new whole-assembly interference claim.

The visible O-RING native reference refresh was also invoked for direct acceptance; final progress observation is pending. No model geometry was authored by script.

After the visible refresh action, Chrome still showed both movable occurrences fully constrained and all six mate rows without unresolved warnings. Additional proof: `artifacts/planchard/CAPANDLENS-post-refresh-native-cache-browser-2026-10-01.png`. Native input transport timed out while dispatching, so its transient success toast was not captured; do not overstate that this browser run reproduced the original stale-diagnostic transition. Unit tests verify the changed success/failure/stale-result paths explicitly.
