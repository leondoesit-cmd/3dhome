# Rust + WebGPU: is a migration worth it? (2026-10-26)

**Question.** Would moving ModelForge to Rust + WebGPU pay off for performance and
security?

**Constraints.**
- The web app must stay, and a native desktop app is wanted too.
- Slowness was reported in four areas, none singled out: 3D open and light changes,
  CAD rebuilds, editing big plans, and import/recognition.

**Method.** Read-only surveys of three areas, each claim checked against the code:
CPU hot paths, the security surface, and how tightly the app depends on three.js.

## Verdict

**No wholesale migration.** Rust earns a place in two bounded spots only:
- the backend of a Tauri 2 desktop shell;
- at most one isolated WASM kernel, and only if measurements still demand one after
  the algorithmic fixes below.

### Performance — the slow parts are not slow because of JavaScript

- **WebGPU is already in place.** Every 3D canvas runs on three r185
  `WebGPURenderer` (`js/gpu.js` `createRenderer`). It beats its WebGL2 fallback:
  128 vs 75 fps in the planner day orbit (`perf-gpu-bench.md`).
- **The 3D frame is three's per-object CPU work**, about 6.4 of 7.9 ms for 785 meshes.
  - The cause is object count: `js/primitives.js` `box()`/`cyl()`/`sph()` create a
    new geometry, material and mesh for every furniture part.
  - three already ships the remedies (`BundleGroup`, shared materials,
    `BatchedMesh`, instancing). They are vendored but unused.
  - A Rust/wgpu renderer would have to replace about 81k lines in 67 files and
    about 1,000 builder calls.
  - three's scene graph is also the data model for picking, 2D furniture heights,
    Rapier colliders, the path tracer, glTF export and plan sprites.
  - The new renderer's WebGPU calls would still cross the JS boundary.
- **Shader-compile stalls are the browser's and the driver's work** (5.3 s for the
  whole planner scene, about 450 ms for a large lit shader). WGSL compiles there
  whatever language submits it, so the fix is fewer shader variants.
- **Numeric compute is about 3% of the code (8.7k of 261k lines).** Its hot spots are
  algorithmic:

  | Hot spot | Measured |
  |---|---|
  | Dense O(n³) sketch solve | 320 variables 79 ms, 640 variables 600 ms |
  | Hidden-line scan, edges × cylinders | 0.6–1.2 s per drawing view |
  | Plan recognition, synchronous on the main thread | p99 2.5 s, max 6.6 s |
  | Document cloning in motion playback | ~31% of a 226 ms frame |

  Every speedup documented in this repo came from caching or algorithm changes
  (2–1000×). A WASM port of JIT-friendly typed-array code typically gains 1.2–2×.
- **The heaviest compute is already C++ compiled to WASM.** No Rust B-rep kernel can
  replace OpenCascade. Its loading and hosting can improve:
  - streaming compile;
  - a worker that is kept warm instead of killed after 120 s idle;
  - no main-thread kernel calls.

### Security — Rust would not fix any finding

JS and Node are memory-safe. Every hardening item is application logic:
- deployment gating
- authorization
- resource limits
- output escaping
- response headers

The only memory-unsafe code that reads untrusted files is third-party and already
sandboxed in WASM: OpenCascade's STEP/BREP readers and Tesseract.

Verified problems before this change:
1. **One `null` WebSocket message crashed the relay** (exit code 1, reproduced). A
   header value with a line break sent through `/api/smarthome` had the same effect.
2. **`/api/smarthome` had no deployment gate.** On Render it forwarded requests into
   the host's private network.
3. **On Windows the static server served private files.** `.relay-identities.json`
   (the friend-code tokens: 27,253 bytes, reproduced), `.git`, `.local` and
   `.model-backups` were reachable through 8.3 short names such as
   `/SERVER/RELAY-~1.JSO` or `/GIT~1/config`, and `/Server/relay.mjs` through case.
   `node_modules`, `docs/`, `tests/` and `scratch/` were served too.
4. **DNS rebinding passed the loopback-only gates.** `allowedOrigin` compares
   `Origin` with `Host`, and a rebinding page controls both.

### Native app — wrap, don't rewrite

- **Tauri 2 shows the same web app in the OS webview:**
  - Windows: WebView2, which is Chromium (156 here) — the engine the tests use.
  - macOS 26+: WKWebView, which has WebGPU.
  - Anywhere else: the WebGL2 fallback.
- **The Rust backend takes over the machine-local endpoints**, so the public relay can
  drop them for good.
- **A Rust-native UI is ruled out.** Rust UI toolkits are weak at the Hebrew RTL
  interface, and the 5,401 Node tests and 663 browser tests target the JS modules.

## Done in this change (Step 0)

| Change | Where |
|---|---|
| Malformed WebSocket messages are ignored. A throwing handler closes only its socket. Failed requests answer 500. Unbuildable outbound requests fail instead of throwing. Header values containing CR/LF/NUL are dropped. Request bodies must be JSON objects. Errors are logged, rate-capped, and are not fatal. | `server/relay.mjs`, `server/security.mjs` |
| `localOnlyRequest` gates model backups and the token-less agent endpoints. `lanOnlyRequest` gates the smart-home proxy (which now requires `Origin`) and blueprint vision. `HOME3D_PUBLIC=1` turns all of them into 404s. | `server/security.mjs`, `server/relay.mjs`, `render.yaml` |
| Static files: private-path rules re-run on the canonical path, case-insensitively. `~digit` segments are refused. Only the top-level allow-list is served. | `server/security.mjs`, `server/public_paths.json` |
| The OpenCascade browser glue is vendored, so `node_modules` is never served. The raw 50 MB `.wasm` fallback is gone; the kernel streams `assets/opencascade.full.wasm.gz`. | `vendor/opencascade/`, `js/cad_kernel.js` |
| Tests | `tests/relay_hardening.test.mjs`, `tests/vendor_opencascade.test.mjs`, `tests/helpers/relay_process.mjs` |

**Reproduction.** Temporary private copies of the pre-change `relay.mjs` and
`security.mjs` showed the crash (`exitCode = 1` after one `null` message) and the
token-file leak (HTTP 200, 27,253 bytes). The same requests against the new code are
asserted in `tests/relay_hardening.test.mjs`.

**Browser check.** On the hardened relay, the app boots with no console errors. The
CAD kernel loads from `vendor/opencascade/` and the gzip, both on the main thread and
in a module worker. A 10×20×30 box returns volume 6000, and no request touches
`node_modules`.

## Status (2026-10-27)

**Track C1 (Windows) passed.** Results are in [desktop/README.md](../desktop/README.md):
- the app boots in WebView2 on WebGPU, with zero console errors;
- the CAD kernel loads on the main thread and in a worker; Rapier and Tesseract load;
- a 20 MB POST reaches the Rust side intact;
- IndexedDB survives a restart, and the relay WebSocket connects;
- 3D runs 6–10% below Chrome;
- the release executable is 3.0 MB and the app has booted ~0.9 s after launch;
- the estimated installer is ~76 MB without materials, ~316 MB with them.

The macOS check is still to do.

**Track B1 measured.** See [performance-2026-10-27.md](performance-2026-10-27.md).
The worst costs:
- **Wall drags in a large plan:** 181 ms per move. The hidden 3D view rebuilds and
  three re-builds node shaders on every move.
- **Crossing 18:00 in the time of day:** a 4.4 s freeze, 80% of it GPU/driver
  pipeline compiles.
- **Cold whole-scene shader compile:** 9.3 s.

None of these is language-bound.

## Roadmap

Each track has a gate. The numbers to beat come from Track B1.

**Track A — remaining hardening**
- **WebSocket limits:**
  - parser chunking, which is O(n²) today;
  - message size caps, `hello` and idle timeouts;
  - connection limits per server and per IP;
  - backpressure;
  - a per-connection rate limit.
- **Identity store:** hashed tokens, a size cap, and a rate limit on new identities
  per IP.
- **`/api/prodsize`:** rate limiting.
- **Multiplayer authorization:**
  - the owner admits each join;
  - guests accept operations only from the room owner;
  - `watch` no longer grants sending.
- **Security headers and CSP:** Report-Only first. Before it can be enforced:
  - the inline boot scripts move to `js/boot_guard.js`;
  - OpenCascade's `createNamedFunction` must stop using `new Function`;
  - tesseract runs without a blob worker;
  - one inline `onclick` goes.
- **HTML escaping:** the modeler's `el()` call sites, i18n interpolation that lands
  in HTML, texture names, and `href` schemes.
- **Low priority:** a DXF recursion budget, service-worker response checks,
  `npm audit` in CI.

**Track B — performance**
- **B1, measure:**
  - shader-build time, split between three's JS node builder and the driver;
  - GPU timestamps;
  - attribution of the ~13 ms wall-drag cost;
  - OpenCascade cold start;
  - long tasks during import.
- **B2, fix in measured order, with zero-pixel-difference gates on WebGPU and WebGL2:**
  - per-item `BundleGroup` and shared opaque materials;
  - fewer shader variants and fixed light slots;
  - a kernel worker kept warm, with module reuse and streaming compile;
  - remaining main-thread OpenCascade calls moved to the worker;
  - sketch solve: skip zero multipliers, flat `Float64Array`, solve per cluster;
  - hidden line: bucket cylinders and move to a worker;
  - a plan-recognition worker;
  - motion-playback revision counters instead of clones.

**Track C — Tauri 2 desktop**
- **C1, a spike of three days at most:**
  - one custom scheme serves both the assets and `/api`, so the app's relative calls
    work unchanged;
  - the WebSocket connects to the public relay;
  - the GPU browser tests run against WebView2 over CDP.
- **Stop and reconsider** if WebView2 is more than 20% slower than Chrome, or the Mac
  needs more than three days of workarounds.
- **C2, port the endpoints to Rust in this order:**
  1. `ping`
  2. model backup
  3. smart-home
  4. agent
  5. product sizes, which are forwarded to the public relay rather than ported
  6. blueprint
  7. agent bridge

**Track D — one Rust→WASM kernel (conditional)**
- **Candidate:** the sketch solver's linear algebra.
- **Adopt only if:**
  - after B2, an interaction still misses its budget;
  - a prototype built in three days or less is at least 2.5× faster end to end on
    Chrome, WebView2 and WKWebView;
  - it is equivalent to the JS implementation, which stays as the test oracle.

**Not worth doing now**
- A full rewrite, a Rust renderer or a Rust UI.
- Native OpenCascade in Tauri.
- WASM threads via COOP/COEP: WKWebView lacks `credentialless`, and the tile and
  texture hosts send no CORP header.
- An OpenCascade rebuild before the loader fixes.
- A WebGPU-compute path tracer for photo mode would gain 10–100×, but photo mode is
  not a reported pain point; it is a separate project.
