# AGENTS.md

## Cursor Cloud specific instructions

### What this is
ModelForge (repo `3dhome`) is a **local-first, browser-based parametric CAD / home-design app**. The entire product is static HTML/CSS/JS in the repo root (`index.html`, `js/`, `css/`, `vendor/`); there is no build step and no framework. A tiny zero-dependency Node server (`server/relay.mjs`) both serves those static files and provides a multiplayer WebSocket relay plus two HTTP proxy endpoints (`/api/prodsize` for public product pages, `/api/smarthome` for LAN hubs). All third-party libs (three.js, Rapier, cannon-es, Leaflet, fonts, Phosphor icons) are vendored under `vendor/` — nothing loads from a CDN.

### Run / test / lint (standard commands; see `package.json`)
- Run the app: `npm start` → serves the app + relay on `http://localhost:8765` (port overridable: `node server/relay.mjs <port>`). Open that URL in a real browser.
- Tests: `npm test` → `node --test tests/*.test.mjs` (pure-Node unit/integration tests, ~720 tests).
- Gates (run both before assuming a file-split or export change worked): `npm run check`
  - `node tools/module_check.mjs` — free-identifier walk of `js/`, `server/`, and `tools/` (including `js/core` and `js/physics`). Reports names a file uses but never declares, imports, or gets from a global. Exit 0 on a clean tree.
  - `node tools/link_check.mjs` — follows the `index.html` module graph and checks that every named import exists as an export of the target. This is the silent-boot failure (`npm test` cannot load `js/main.js` because of bare `three` specifiers).
- Full local CI: `npm run ci` → check + test. GitHub Actions runs the same command.

### Non-obvious gotchas
- **A single missing named export breaks the whole UI.** `index.html` loads `js/main.js` as one big static ES-module graph. If any statically-imported module fails to link (e.g. imports a name another module doesn't actually export), the browser throws a module `SyntaxError` at load and the **entire front-end silently fails to initialize** — the page renders but no tools respond. `npm test` does NOT load that graph (Node cannot resolve bare `three` imports). `npm run check:links` does. A remaining reason to load `http://localhost:8765/` in a real browser is GPU/WebGL behaviour, not module linking.
- **`tools/module_check.mjs` must stay green.** A hit that is an ordinary function/const name used in a module but not declared there is a broken export/import and will throw when that line runs. Do not "fix" a real hit by adding it to `GLOBALS` unless it is a platform global.
- **The relay hot-serves static files by mtime**, so editing a `js/`/`css/` file is picked up on the next request without restarting `npm start` (hard-reload the browser to bypass its own cache).
- **3D needs a real GPU/WebGL context.** Headless Chrome without GPU logs "GPU backend init failed / 3D backend failed to initialise" — that's an environment limitation, not an app bug. Use a real browser (computer-use) for UI/3D testing.
- WebSocket upgrades are origin-checked; same-origin (open the served URL directly) works. To serve from another origin set `HOME3D_ALLOWED_ORIGINS`.
