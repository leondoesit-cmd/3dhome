# AGENTS.md

## Cursor Cloud specific instructions

### What this is
ModelForge (repo `3dhome`) is a **local-first, browser-based parametric CAD / home-design app**. The entire product is static HTML/CSS/JS in the repo root (`index.html`, `js/`, `css/`, `vendor/`); there is no build step and no framework. A tiny zero-dependency Node server (`server/relay.mjs`) both serves those static files and provides a multiplayer WebSocket relay plus two HTTP proxy endpoints (`/api/prodsize` for public product pages, `/api/smarthome` for LAN hubs). All third-party libs (three.js, Rapier, cannon-es, Leaflet, fonts, Phosphor icons) are vendored under `vendor/` — nothing loads from a CDN.

### Run / test / lint (standard commands; see `package.json`)
- Run the app: `npm start` → serves the app + relay on `http://localhost:8765` (port overridable: `node server/relay.mjs <port>`). Open that URL in a real browser.
- Tests: `npm test` → `node --test --test-timeout=600000 tests/*.test.mjs uikit/tests/*.test.mjs` (pure-Node unit/integration tests; 11–19 min locally). The 10-minute per-test timeout turns a stuck CAD-kernel run into a failure instead of a stuck run. `planchard_housing_shell` is the genuinely slow one: its custom exact shell runs for several minutes on its own, so it can time out when parallel files starve it of CPU.
- Gates (run both before assuming a file-split or export change worked): `npm run check`
  - `node tools/module_check.mjs` — free-identifier walk of `js/`, `server/`, and `tools/` (including `js/core` and `js/physics`). Reports names a file uses but never declares, imports, or gets from a global. Exit 0 on a clean tree.
  - `node tools/link_check.mjs` — follows the `index.html` module graph and checks that every named import exists as an export of the target. This is the silent-boot failure (`npm test` cannot load `js/main.js` because of bare `three` specifiers).
- Full local CI: `npm run ci` → check + test + `test:browser` (the browser suite needs a local Chrome, and a GPU for 3D). GitHub Actions (`.github/workflows/ci.yml`) runs `npm run check` and `npm test` only, without LFS.

### Non-obvious gotchas
- **A single missing named export breaks the whole UI.** `index.html` loads `js/main.js` as one big static ES-module graph. If any statically-imported module fails to link (e.g. imports a name another module doesn't actually export), the browser throws a module `SyntaxError` at load and the **entire front-end silently fails to initialize** — the page renders but no tools respond. `npm test` does NOT load that graph (Node cannot resolve bare `three` imports). `npm run check:links` does. A remaining reason to load `http://localhost:8765/` in a real browser is GPU/WebGPU behaviour, not module linking.
- **`tools/module_check.mjs` must stay green.** A hit that is an ordinary function/const name used in a module but not declared there is a broken export/import and will throw when that line runs. Do not "fix" a real hit by adding it to `GLOBALS` unless it is a platform global.
- **The relay hot-serves static files by mtime**, so editing a `js/`/`css/` file is picked up on the next request without restarting `npm start` (hard-reload the browser to bypass its own cache).
- **Every 3D canvas runs on three's `WebGPURenderer`** (built only through `js/gpu.js` `createRenderer`): a real WebGPU backend where the browser has one, its WebGL2 fallback elsewhere (`?forceWebGL` pins the fallback for testing). Raw `ShaderMaterial`/GLSL, `PointsMaterial` and classic `WebGLRenderer` are gated out by `tests/webgpu_renderer.test.mjs`; port to node (TSL) materials instead. The AR room scan's raw WebXR WebGL layer is the one intentional exception.
- **3D needs a real GPU.** Headless Chrome without GPU logs "GPU backend init failed / 3D backend failed to initialise" — that's an environment limitation, not an app bug. Use a real browser (computer-use) for UI/3D testing.
- WebSocket upgrades are origin-checked; same-origin (open the served URL directly) works. To serve from another origin set `HOME3D_ALLOWED_ORIGINS`.
- **The relay serves only the top-level paths in `server/public_paths.json`** (index.html, manifest, the survey service worker and its asset list, and `js/`, `css/`, `vendor/`, `assets/`, `uikit/`, `plans/`). A new top-level file or folder the app fetches must be added there, or `npm start` answers 404 for it. The browser-test harness has its own static server, so the browser suite will not notice. `node_modules` is never served: browser code loads vendored copies (OpenCascade's glue is `vendor/opencascade/`).
- **Machine-local endpoints are gated per request** (`server/security.mjs`):
  - `/api/model-backup` and the token-less agent endpoints answer only to this machine, addressed by a loopback name (`localOnlyRequest`).
  - `/api/smarthome` and `/api/blueprint` also accept LAN peers that address the server by a private IP, a `.local` name or a single-label name (`lanOnlyRequest`).
  - A Host that is a public domain (DNS rebinding) or any forwarding header disqualifies a request.
  - `HOME3D_PUBLIC=1` (set in `render.yaml`) turns these routes into 404s. `HOME3D_ALLOWED_HOSTS` lists extra hostnames that count as this machine.

### Writing tests
- **Prefer behaviour over source text.** Put the logic in a function Node can import (no bare `three` import at module level; take `THREE`/`TSL` as arguments, as `js/room_bounce.js` does) and test inputs against outputs. A regex over a source file passes while the behaviour is wrong and breaks on harmless refactors.
- Regexes over source are for wiring Node cannot run (a GPU-only call, an event hook). Match code, never the wording of a comment (`tools/comment_assertions.mjs` flags assertions only a comment satisfies).
- Tests that need `js/modeler.js` source read it through `tests/helpers/modeler_source.mjs` (`modelerSource()`), which includes the modules split out under `js/modeler/`.
