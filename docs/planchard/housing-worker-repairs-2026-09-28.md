# HOUSING continuation and exact worker repair

The fresh browser model is saved through Draft 1 (11 history steps) and ThreadPlane. The latest authoritative browser export is `artifacts/planchard/fresh-housing-thread-plane-saved-exact-browser-2026-09-28.mforge`. Thread, handle, switch hole, ribs, patterns and mirror remain unfinished.

## Accepted geometry

- Front base: Ø4.375 in, 1.300 in deep, Z 0 to +3.302 cm.
- Battery loft: from Z 0 to −3.302 cm; rounded square is 3.100 in wide, top 1.600 in above origin, corner radius .500 in.
- Boss-Battery: 4.400 in towards negative Z, inward 1° draft.
- Shell: .100 in inside, front circular face removed.
- Stop: projected inner shell circle and Ø5.125 in outer circle, .100 in forward extrusion.
- Draft: 5° on the outer front base cylinder, neutral front face at Z 3.302 cm.
- ThreadPlane: .125 in flipped from front face, Z 2.9845 cm.

All five sketches are fully defined. Draft was accepted through exact Chrome preview, Finish and Save; ThreadPlane was saved afterward. Current saved bounds are 13.0175 × 13.0175 × 17.78 cm.

## Worker display and export contract

Background display and Save request exact worker meshes, topology and proof without deserializing OpenCascade BREP on the UI thread. Native export requests still restore actual BREP for all surviving heads or the explicitly requested rollback head. Consumed upstream results retain exact topology and meshes for reference resolution. A display-only run cannot satisfy the native export cache guard.

Focused native verification used serial WASM compilation. A union and independent body retained 45 and 1 cm³ exact volume, topology identities, and successful STEP/IGES writes. Requested upstream rollback export retained native BREP. Display publication rejects obsolete document/history results.

## Verified topology cache

Source-backed loft/sweep display snapshots do not participate in geometry stamps because the exact rebuild overwrites them from sketches. Saved and current signatures apply the same rule. Numeric origin round-off with absolute magnitude below 1e-12 cm is canonicalized to zero; a 1e-8 cm frame change and actual point changes invalidate the cache. Legacy signatures containing `[circular]` remain untrusted.

A partial requested-head capture now retains independently verified upstream entries, preventing a Shell-only result from removing Revolve face names when a later Fillet is appended. Changed inputs, explicit failed results and approximate results remove old entries.

Focused checks: 29 worker/display/native/lifecycle checks, 8 topology-cache checks, and module/link/source-assertion gates passed (586 modules, 1498 assertions). Full CI is not claimed.

## Current limitation

A cold HOUSING shell remains expensive (several minutes). Chrome tab 710849273 stayed responsive while the worker reported Shell 1 at 242 seconds and Boss-Stop at 340 seconds, then visibly reached `Rebuild succeeded`, one part, matching bounds, and all healthy tree rows. The Chrome connection disappeared before the final screenshot/Save action could dispatch. No new authored edits were pending. The earlier responsive computation screenshot is `artifacts/planchard/HOUSING-worker-responsive-cold-shell-browser.png`. The older tab 710849231 stalled during native restoration and could not receive a reload or close action; its authored work was already saved and exported. No completed thread or full HOUSING acceptance is claimed yet.
