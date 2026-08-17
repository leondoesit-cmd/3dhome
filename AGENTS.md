# AGENTS.md

## Cursor Cloud specific instructions

### What this is
ModelForge (repo `3dhome`) is a **local-first, browser-based parametric CAD / home-design app**. The entire product is static HTML/CSS/JS in the repo root (`index.html`, `js/`, `css/`, `vendor/`); there is no build step and no framework. A tiny zero-dependency Node server (`server/relay.mjs`) both serves those static files and provides a multiplayer WebSocket relay plus one HTTP proxy endpoint (`/api/prodsize`). All third-party libs (three.js, Rapier, cannon-es, Leaflet, fonts, Phosphor icons) are vendored under `vendor/` — nothing loads from a CDN.

### Run / test / lint (standard commands; see `package.json`)
- Run the app: `npm start` → serves the app + relay on `http://localhost:8765` (port overridable: `node server/relay.mjs <port>`). Open that URL in a real browser.
- Tests: `npm test` → `node --test tests/*.test.mjs` (pure-Node unit/integration tests, ~540 tests).
- Static-analysis gate (closest thing to a linter — there is no ESLint/Prettier): `node tools/module_check.mjs js/*.js`. It parses every `js/*.js` module and reports identifiers used but never declared/imported/global — exactly the failure mode a bad file-split or a hidden export produces.

### Non-obvious gotchas
- **A single missing named export breaks the whole UI.** `index.html` loads `js/main.js` as one big static ES-module graph. If any statically-imported module fails to link (e.g. imports a name another module doesn't actually export), the browser throws a module `SyntaxError` at load and the **entire front-end silently fails to initialize** — the page renders but no tools respond. `npm test` does NOT catch this (Node can't load the browser-only graph, which pulls in bare `three` imports). To catch boot-time module/link errors, load `http://localhost:8765/` in headless Chrome and read the DevTools console (`Runtime.exceptionThrown` / `Log.entryAdded` errors).
- **`tools/module_check.mjs` exits non-zero at baseline.** Some hits are browser globals it doesn't know about (e.g. `DOMException`, `DecompressionStream`) — those are false positives. A hit that is an ordinary function/const name used in a module but not declared there is a *real* broken export/import and will break the app in the browser; treat those seriously.
- **The relay hot-serves static files by mtime**, so editing a `js/`/`css/` file is picked up on the next request without restarting `npm start` (hard-reload the browser to bypass its own cache).
- **3D needs a real GPU/WebGL context.** Headless Chrome without GPU logs "GPU backend init failed / 3D backend failed to initialise" — that's an environment limitation, not an app bug. Use a real browser (computer-use) for UI/3D testing.
- WebSocket upgrades are origin-checked; same-origin (open the served URL directly) works. To serve from another origin set `HOME3D_ALLOWED_ORIGINS`.
