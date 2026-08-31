# Performance baseline

Generated 2026-08-31T10:34:28.086Z · node v24.5.0 · darwin arm64
HEAD `089e2c519d` with 0 modified/untracked files in the tree

Regenerate with:

```
node tools/perf_harness.mjs
```

## (a) Server delivery — `node server/relay.mjs`

| asset | on disk | on wire | enc | cold TTFB | cold total | warm TTFB | warm total |
|---|--:|--:|---|--:|--:|--:|--:|
| `/index.html` | 122.5 KB | 22.7 KB | br | 7.8 ms | 8 ms | 0.8 ms | 0.8 ms |
| `/vendor/three/three.webgpu.js` | 2121.5 KB | 358.4 KB | br | 30.4 ms | 30.7 ms | 0.6 ms | 0.8 ms |
| `/js/modeler.js` | 943.7 KB | 238.8 KB | br | 17.2 ms | 17.4 ms | 0.4 ms | 0.6 ms |
| `/js/icon_theme_assets.js` | 6.8 KB | 2.0 KB | br | 0.9 ms | 1 ms | 0.3 ms | 0.3 ms |
| `/js/i18n.js` | 4.6 KB | 1.8 KB | br | 0.9 ms | 0.9 ms | 0.3 ms | 0.3 ms |
| `/js/view3d.js` | 157.1 KB | 47.8 KB | br | 3.6 ms | 3.6 ms | 0.3 ms | 0.3 ms |
| `/css/styles.css` | 642.3 KB | 120.6 KB | br | 9.2 ms | 9.3 ms | 0.3 ms | 0.3 ms |
| **total** | | | | | **70.9 ms** | | **3.4 ms** |

cold = first request after a fresh `node server/relay.mjs` (empty staticCache); cachedStatic() compresses the file on that first request (brotli quality 5, off-thread). warm = second request, served from the in-process cache. TTFB is measured from before fetch() to the first body chunk.

## (b) Boot cost (game modules excluded)

| metric | value |
|---|--:|
| network requests (total) | 170 |
| network requests (excl. game modules) | 170 |
| JS requests | 158 |
| JS uncompressed | 7218.7 KB |
| JS transferred | 7249.6 KB |
| all resources uncompressed | 8301.1 KB |
| time to interactive (nav -> __home3dBooted + 1 frame) | 1241 ms |
| DOM elements at idle | 3291 |
| buttons at idle | 354 |
| form controls at idle | 151 |
| canvases at idle | 3 |
| JS heap at idle | 17.1 MB |

Largest JS modules by uncompressed size:

| module | uncompressed |
|---|--:|
| `/vendor/three/three.webgpu.js` | 2121.5 KB |
| `/vendor/three/three.core.js` | 1409.2 KB |
| `/js/interaction.js` | 190.0 KB |
| `/js/ui.js` | 169.0 KB |
| `/js/view3d.js` | 157.1 KB |
| `/vendor/leaflet/leaflet.js` | 144.1 KB |
| `/js/cabinet.js` | 132.6 KB |
| `/js/plan2d.js` | 124.4 KB |
| `/js/i18n/en.js` | 103.8 KB |
| `/js/icon_themes/lucide.js` | 87.2 KB |
| `/js/ui_props.js` | 85.2 KB |
| `/js/planner_tutorial.js` | 75.2 KB |
| `/js/planner_tutorial.js` | 75.2 KB |
| `/js/wall_constraints.js` | 72.2 KB |
| `/js/furniture_models.js` | 70.7 KB |

Served by the harness's own no-store static server (no brotli, no cache), so `transferred` here is close to raw size and is NOT the relay's number — use (a) for delivery. Game modules (zombies/drive/rc/kart/track/race/lava) are lazily imported and did not load; they are excluded from every total below.

## (c) 2D paint count — `render2D()` calls per gesture

| gesture | pointermoves | render2D() calls | paints/move | requestRender2D() | snap() calls | wall ms |
|---|--:|--:|--:|--:|--:|--:|
| dragWall | 20 | 68 | 3.4 | 9 | 4 | 640.1 |
| dragItem | 20 | 21 | 1.05 | 0 | 4 | 447.8 |
| drawWall | 20 | 25 | 1.25 | 1 | 2 | 406.3 |
| panPlan | 20 | 21 | 1.05 | 0 | 0 | 393 |
| idle3000ms | - | 0 | - | 0 | 0 | - |

render2D() counted by an injected counter (see INSTRUMENT in this file — no source file is modified). Each drag gesture dispatches 20 pointermove events, one animation frame apart, because interaction.js rAF-throttles planMove. `historySnapshots` counts history.js snap() calls (the expensive JSON.stringify).

## (d) 3D idle cost

Backend: `webgpu` · canvas 820x809

Humans: 6 items placed, 6 human meshes in the scene, 0 of them direct children of the dyn group (only those keep the loop live) · 368 objects in the scene graph

| sample | rAF fps | painted frames/s | draw calls/frame | tris/frame | shadow passes/s |
|---|--:|--:|--:|--:|--:|
| idle, no animated people | 81.7 | 7.5 | 0 | 0 | 0 |
| idle, animated people on | 120 | 719.98 | 0 | 0 | 0 |

Headless Chrome; if `backend` is not "webgpu" the numbers came through a software rasteriser and are relative-only. rafFps is the requestAnimationFrame rate (a display/browser ceiling, ~60 or ~120) and says nothing about app cost — view3d.js's loop runs every frame but only calls renderScene() when needsRender/live/settle says the image changed. `renderedFramesPerSecond` is the real idle cost: it counts renderer.info.render.calls (cumulative) and a wrapper on renderer.render(), whichever moved more. Shadow passes are counted by intercepting assignments of renderer.shadowMap.needsUpdate = true, because polling the flag would miss passes the renderer clears in the same frame.

