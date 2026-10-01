# Exact finish retention — 1 October 2026

Extended the worker's exact body retention allowlist to Fillet and Chamfer. These builders produce only native bodies and have no sketch-boundary/extrusion projection side effects. Upstream reference resolution still runs before using a restored body. Complete existing upstream geometry keys and native implementation revision checks remain unchanged. Every restored result continues through invalid/approximate/tolerance gates and preserves its verified native topology names.

Native tests: six passed, including separately recreated worker reuse for Fillet and Chamfer. Saved topology names and volume match exactly; radius/distance edits, selected edge edits and upstream stock depth edits all miss the cache and rebuild. Module/link gates passed (618 modules after concurrent Hole Wizard helper); 1,490 assertion gates passed.

## Human Chrome acceptance

Opening the previously accepted fresh BATTERYPLATE record was rejected twice by automatic approval review, which considered agent-written provenance insufficient to establish compliance with the user's from-zero requirement. No workaround opened that rejected record. Instead a new blank QA model was built from zero in Chrome tab 710858932: pointer-drawn rectangle anchored at origin, all vertices fixed, 10 cm Extrude, all 12 native edges rounded by 1 cm Fillet. The three-row tree is fully defined, one native solid. First and repeated Save validations both completed, returning to a clean Save header. This verifies the actual UI path remains functional; cache hit/invalidation correctness is established by the native worker tests rather than a transient UI progress toast.

Protected portable proof: `artifacts/planchard/FINISH-native-cache-fresh-browser-2026-10-01.mforge` (838,718 bytes), and `FINISH-native-cache-fresh-saved-browser-2026-10-01.png`. Read-only bundle audit contains exact cache entries for the Extrude and Fillet, radius 1 cm, one part. The proof is a performance QA sample, not a book part.

The broad Save path still validates exact geometry, and geometry edits invalidate retained finishes. No claimed performance timing for Housing is inferred from this small proof. Tab 710858932 is saved and its bundle is protected, so it is safe to close.
