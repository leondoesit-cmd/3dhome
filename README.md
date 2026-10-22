# ModelForge (3dhome)

A local-first, browser-based home designer and parametric CAD app. Draw walls and
rooms in 2D, furnish and light them in 3D, model custom parts in the CAD editor,
design cabinets for production, and export to Blender, STL, 3MF and drawings.

The whole app is static HTML/CSS/JS with no build step and no framework.
Third-party libraries (three.js, Rapier, cannon-es, Leaflet, fonts, icons) are
vendored under `vendor/`, so nothing loads from a CDN.

## Quick start

Needs Node 22 or newer.

```bash
npm install
npm start
```

Then open <http://localhost:8765> in a desktop browser with a GPU (the 3D views
use WebGPU, falling back to WebGL2). `node server/relay.mjs <port>` picks
another port.

`server/relay.mjs` serves the app and adds a multiplayer WebSocket relay, a
product-dimension lookup (`/api/prodsize`) and a LAN smart-home proxy
(`/api/smarthome`). It has no dependencies.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | App + relay on port 8765 |
| `npm test` | Pure-Node unit and integration tests |
| `npm run check` | Module and link gates: every name a file uses is declared or imported, and every import in the `index.html` graph exists |
| `npm run test:browser` | Browser tests (needs a local Chrome) |
| `npm run ci` | check + test + browser tests |

GitHub Actions runs `npm run check` and `npm test` on every push
(`.github/workflows/ci.yml`).

## Layout

| Path | Contents |
| --- | --- |
| `index.html`, `js/`, `css/` | The app. `js/main.js` boots it; `js/view3d.js` is the planner's 3D view, `js/plan2d.js` the 2D plan, `js/modeler.js` the CAD editor |
| `js/core/`, `js/physics/` | Geometry, topology and simulation shared by the editors |
| `server/` | The relay and its helpers |
| `tests/` | `*.test.mjs` (Node) and `*.browser.mjs` (Chrome) |
| `tools/` | Gates, benchmarks, audits and asset pipelines |
| `vendor/` | Vendored third-party libraries |
| `assets/` | Textures (`assets/materials` is in Git LFS), models, icons |
| `artifacts/` | Saved models and drawings; the `.mforge` files still tracked are test fixtures |
| `docs/` | Design notes, audits and plans (`docs/plans/`) |
| `native/` | Android and iOS shells |

## Further reading

- [AGENTS.md](AGENTS.md): working notes for contributors and coding agents,
  including the gotchas that make the UI fail silently.
- [docs/](docs/): feature write-ups, audits and plans.
