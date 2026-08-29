# Performance baseline

Generated 2026-08-29T12:33:33.778Z · node v24.5.0 · darwin arm64
HEAD `ee81bf1a45` with 79 modified/untracked files in the tree

Regenerate with:

```
node tools/perf_harness.mjs
```

## (a) Server delivery — `node server/relay.mjs`

| asset | on disk | on wire | enc | cold TTFB | cold total | warm TTFB | warm total |
|---|--:|--:|---|--:|--:|--:|--:|
| `/index.html` | 122.1 KB | 19.6 KB | br | 129.8 ms | 129.9 ms | 0.7 ms | 0.7 ms |
| `/vendor/three/three.webgpu.js` | 2121.5 KB | 301.0 KB | br | 2622.7 ms | 2623 ms | 1.3 ms | 1.4 ms |
| `/js/modeler.js` | 829.4 KB | 181.4 KB | br | 1028 ms | 1028.2 ms | 0.5 ms | 0.6 ms |
| `/js/icon_theme_assets.js` | 1170.3 KB | 116.6 KB | br | 1322.8 ms | 1323 ms | 0.3 ms | 0.4 ms |
| `/js/i18n.js` | 236.0 KB | 58.2 KB | br | 280.9 ms | 280.9 ms | 0.3 ms | 0.4 ms |
| `/js/view3d.js` | 152.6 KB | 41.5 KB | br | 177.8 ms | 177.9 ms | 0.4 ms | 0.4 ms |
| `/css/styles.css` | 612.4 KB | 94.5 KB | br | 726.4 ms | 726.6 ms | 0.3 ms | 0.3 ms |
| **total** | | | | | **6289.5 ms** | | **4.2 ms** |

cold = first request after a fresh `node server/relay.mjs` (empty staticCache); cachedStatic() runs brotliCompressSync at default quality on the request thread. warm = second request, served from the in-process cache. TTFB is measured from before fetch() to the first body chunk.

## (b) Boot cost (game modules excluded)

| metric | value |
|---|--:|
| network requests (total) | 196 |
| network requests (excl. game modules) | 196 |
| JS requests | 184 |
| JS uncompressed | 9573.9 KB |
| JS transferred | 9609.8 KB |
| all resources uncompressed | 10626.5 KB |
| time to interactive (nav -> __home3dBooted + 1 frame) | 1389 ms |
| DOM elements at idle | 3244 |
| buttons at idle | 348 |
| form controls at idle | 150 |
| canvases at idle | 3 |
| JS heap at idle | 21.8 MB |

Largest JS modules by uncompressed size:

| module | uncompressed |
|---|--:|
| `/vendor/three/three.webgpu.js` | 2121.5 KB |
| `/vendor/three/three.core.js` | 1409.2 KB |
| `/js/icon_theme_assets.js` | 1170.3 KB |
| `/js/modeler.js` | 829.4 KB |
| `/js/i18n.js` | 236.0 KB |
| `/js/interaction.js` | 184.5 KB |
| `/js/ui.js` | 165.1 KB |
| `/js/view3d.js` | 152.6 KB |
| `/vendor/leaflet/leaflet.js` | 144.1 KB |
| `/js/cabinet.js` | 132.6 KB |
| `/js/plan2d.js` | 122.5 KB |
| `/js/ui_props.js` | 85.1 KB |
| `/js/planner_tutorial.js` | 74.2 KB |
| `/js/wall_constraints.js` | 72.2 KB |
| `/js/furniture_models.js` | 70.7 KB |

Served by the harness's own no-store static server (no brotli, no cache), so `transferred` here is close to raw size and is NOT the relay's number — use (a) for delivery. Game modules (zombies/drive/rc/kart/track/race/lava) are lazily imported and did not load; they are excluded from every total below.

## (c) 2D paint count — `render2D()` calls per gesture

| gesture | pointermoves | render2D() calls | paints/move | requestRender2D() | snap() calls | wall ms |
|---|--:|--:|--:|--:|--:|--:|
| dragWall | 20 | 31 | 1.55 | 9 | 4 | 633.9 |
| dragItem | 20 | 29 | 1.45 | 8 | 4 | 546.4 |
| drawWall | 20 | 31 | 1.55 | 8 | 2 | 415.2 |
| panPlan | 20 | 27 | 1.35 | 6 | 0 | 379.8 |
| idle3000ms | - | 8 | - | 8 | 0 | - |

Who paints while the app sits idle (3 s, no input at all):

- 8x `at requestRender2D (http://127.0.0.1:49689/js/plan2d.js:1041:133) <- at http://127.0.0.1:49689/js/plan2d.js:2033:7`
- 8x `at render2D (http://127.0.0.1:49689/js/plan2d.js:374:125) <- at http://127.0.0.1:49689/js/plan2d.js:1046:5`

render2D() counted by an injected counter (see INSTRUMENT in this file — no source file is modified). Each drag gesture dispatches 20 pointermove events, one animation frame apart, because interaction.js rAF-throttles planMove. `historySnapshots` counts history.js snap() calls (the expensive JSON.stringify).

## (d) 3D idle cost

Backend: `webgpu` · canvas 818x809

Humans: 6 items placed, 6 human meshes in the scene, 0 of them direct children of the dyn group (only those keep the loop live) · 368 objects in the scene graph

| sample | rAF fps | painted frames/s | draw calls/frame | tris/frame | shadow passes/s |
|---|--:|--:|--:|--:|--:|
| idle, no animated people | 120 | 0 | 0 | 0 | 0 |
| idle, animated people on | 120 | 0 | 0 | 0 | 0 |

Headless Chrome; if `backend` is not "webgpu" the numbers came through a software rasteriser and are relative-only. rafFps is the requestAnimationFrame rate (a display/browser ceiling, ~60 or ~120) and says nothing about app cost — view3d.js's loop runs every frame but only calls renderScene() when needsRender/live/settle says the image changed. `renderedFramesPerSecond` is the real idle cost: it counts renderer.info.render.calls (cumulative) and a wrapper on renderer.render(), whichever moved more. Shadow passes are counted by intercepting assignments of renderer.shadowMap.needsUpdate = true, because polling the flag would miss passes the renderer clears in the same frame.

