# Native export reuse audit — 1 October 2026

Concrete redundant invalidation: applying STL/3MF/AMF tessellation preferences adds an undo history node. The exact native run previously remained stamped with the prior node, so the immediate export rebuilt unchanged geometry. The new `applyPrintMeshExportSettings` checks that the native run is already current before the metadata edit, then advances its stamp to the new history node. Expired, absent and mesh-only runs continue to rebuild. Geometry/reference edits keep their existing invalidation checks.

Focused STL and reuse tests: 7 passed. Module/link/source gates passed (617 modules / 1,490 assertions).

Separate findings: Save unconditionally validates a canonical native run; worker retention only caches shell, draft and union operations. These paths were not broadened because exact rebuild operations can have projection side effects and signature safety must remain intact. The export fix reduces a demonstrated redundant rebuild without claiming cold loads or save are generally instant.

Initial Chrome transport timeouts delayed acceptance. The resumed successful browser verification is recorded below.

## Real Chrome acceptance

After transport recovered, reopened the fresh BATTERYPLATE task record in Chrome 710858903. The first Fine export correctly rebuilt native geometry from its cold mesh-only load and downloaded a 3,275,484-byte STL at 22:17:49 UTC. Reopened Export STL and clicked Apply again without changing geometry. The second Apply returned in 2,550 ms and showed `✓ Fine binary STL exported · mm`, with no Computing exact geometry status. The second file downloaded at 22:18:21 UTC, also 3,275,484 bytes. Screenshot: `artifacts/planchard/BATTERYPLATE-repeat-Fine-export-reuse-browser-2026-10-01.png`.

This verifies immediate native-run reuse through human UI controls. Save remains a separate native validation; it was invoked to retain a clean checkpoint afterward.

The two browser-produced baseline/reused STL files have identical SHA256: 2E6A4195FB1DF7194FD26AECC1477D75200264DF5A40493B98DA69CAA530E440.


Final save validation completed; header is Save to library without Unsaved changes. Tab 710858903 is safe to close.

Later in this session, separately audited retention was extended to native Fillet and Chamfer results. See `exact-finish-retention-2026-10-01.md` for its native invalidation tests and fresh Chrome QA sample; the earlier allowlist observation above records the state before that change.
