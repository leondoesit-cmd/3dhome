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
| `/index.html` | 125.6 KB | 23.4 KB | br | 8.2 ms | 8.3 ms | 0.5 ms | 0.5 ms |
| `/vendor/three/three.webgpu.js` | 2121.5 KB | 358.4 KB | br | 32.4 ms | 32.7 ms | 0.6 ms | 0.7 ms |
| `/js/modeler.js` | 984.0 KB | 249.5 KB | br | 18.9 ms | 19 ms | 0.4 ms | 0.5 ms |
| `/js/icon_theme_assets.js` | 6.8 KB | 2.0 KB | br | 1 ms | 1 ms | 0.3 ms | 0.3 ms |
| `/js/i18n.js` | 4.6 KB | 1.8 KB | br | 0.8 ms | 0.8 ms | 0.3 ms | 0.3 ms |
| `/js/view3d.js` | 172.9 KB | 53.0 KB | br | 3.9 ms | 3.9 ms | 0.3 ms | 0.3 ms |
| `/css/styles.css` | 683.1 KB | 128.9 KB | br | 9.3 ms | 9.4 ms | 0.3 ms | 0.3 ms |
| **total** | | | | | **75.1 ms** | | **2.9 ms** |

cold = first request after a fresh `node server/relay.mjs` (empty staticCache); cachedStatic() compresses the file on that first request (brotli quality 5, off-thread). warm = second request, served from the in-process cache. TTFB is measured from before fetch() to the first body chunk.

## (b) Boot cost (game modules excluded)

| metric | value |
|---|--:|
| network requests (total) | 176 |
| network requests (excl. game modules) | 176 |
| JS requests | 164 |
| JS uncompressed | 7475.4 KB |
| JS transferred | 7507.4 KB |
| all resources uncompressed | 8598.6 KB |
| time to interactive (nav -> __home3dBooted + 1 frame) | 1248 ms |
| DOM elements at idle | 3484 |
| buttons at idle | 381 |
| form controls at idle | 151 |
| canvases at idle | 4 |
| JS heap at idle | 17.5 MB |

Largest JS modules by uncompressed size:

| module | uncompressed |
|---|--:|
| `/vendor/three/three.webgpu.js` | 2121.5 KB |
| `/vendor/three/three.core.js` | 1409.2 KB |
| `/js/interaction.js` | 229.5 KB |
| `/js/view3d.js` | 172.9 KB |
| `/js/ui.js` | 171.0 KB |
| `/vendor/leaflet/leaflet.js` | 144.1 KB |
| `/js/plan2d.js` | 142.2 KB |
| `/js/cabinet.js` | 133.9 KB |
| `/js/i18n/en.js` | 108.1 KB |
| `/js/icon_themes/lucide.js` | 87.2 KB |
| `/js/ui_props.js` | 85.2 KB |
| `/js/planner_tutorial.js` | 75.2 KB |
| `/js/planner_tutorial.js` | 75.2 KB |
| `/js/wall_constraints.js` | 72.2 KB |
| `/js/furniture_models.js` | 70.7 KB |

Served by the harness's own no-store static server (no brotli, no cache), so `transferred` here is close to raw size and is NOT the relay's number — use (a) for delivery. Game modules (zombies/drive/rc/kart/track/race/lava) are lazily imported and did not load; they are excluded from every total below.

## (c) 2D paint count — model vs. HUD paints per gesture

| gesture | pointermoves | model paints | model/move | HUD paints | paint requests | HUD requests | snap() calls | wall ms | moved by |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| dragWall | 20 | 2 | 0.1 | 21 | 60 | 11 | 2 | 695.3 | 60 |
| dragItem | 20 | 2 | 0.1 | 21 | 21 | 0 | 2 | 607.2 | 220 |
| drawWall | 20 | 22 | 1.1 | 22 | 25 | 1 | 1 | 495.1 | - |
| panPlan | 20 | 21 | 1.05 | 21 | 21 | 0 | 0 | 469.5 | - |
| idle3000ms | - | 0 | - | 0 | 0 | 0 | 0 | - | - |
| idleWarning3000ms | - | 0 | - | 61 | 0 | 60 | 0 | - | - |

### What one paint costs (timed synchronously, no rAF in the loop)

| scene | walls | full paint (model+HUD) | model pass | HUD pass |
|---|--:|--:|--:|--:|
| paintCostSmall | 4 | 0.512 ms | 0.492 ms | 0.02 ms |
| paintCostBig16Rooms | 40 | 7.065 ms | 6.998 ms | 0.067 ms |

Paints counted by injected counters (see INSTRUMENT in this file — no source file is modified). `modelPaints` is renderModel(), the plan document image; `hudPaints` is renderHUD(), the overlay; `paintRequests` is render2D()+requestRender2D(), which only schedule a frame. Each drag gesture dispatches 20 pointermove events, one animation frame apart, because interaction.js rAF-throttles planMove — so a gesture's wall-clock has a hard floor of MOVES frames (~333 ms at 60 Hz) that no amount of paint work can go under; read paints, not wallMs, for paint cost. `dragWall` pins S.workSet to "all": under the default "furniture" work set a wall is rank 1 and canDrag() refuses, so the gesture would measure a hover. `historySnapshots` counts history.js snap() calls (the expensive JSON.stringify).

## (d) 3D idle cost

Backend: `webgpu` · canvas 820x851

Humans: 6 items placed, 6 human meshes in the scene, 0 of them direct children of the dyn group (only those keep the loop live) · 370 objects in the scene graph

| sample | rAF fps | painted frames/s | draw calls/frame | tris/frame | shadow passes/s |
|---|--:|--:|--:|--:|--:|
| idle, no animated people | 120 | 0 | 0 | 0 | 0 |
| idle, animated people on | 120 | 719.91 | 0 | 0 | 0 |

Headless Chrome; if `backend` is not "webgpu" the numbers came through a software rasteriser and are relative-only. rafFps is the requestAnimationFrame rate (a display/browser ceiling, ~60 or ~120) and says nothing about app cost — view3d.js's loop runs every frame but only calls renderScene() when needsRender/live/settle says the image changed. `renderedFramesPerSecond` is the real idle cost: it counts renderer.info.render.calls (cumulative) and a wrapper on renderer.render(), whichever moved more. Shadow passes are counted by intercepting assignments of renderer.shadowMap.needsUpdate = true, because polling the flag would miss passes the renderer clears in the same frame.

## (e) Modeler CAD performance — gesture counters & wall clock

| gesture | moves | updatePreview | buildPart | meshFeatureEdges | clearGroup | refreshAll | rebuildDoc | cloneDomain | wall ms |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| hoverModel | 20 | 0 | 0 | 0 | 7 | 0 | 0 | 0 | 174.9 |
| selectFace | 0 | 1 | 2 | 2 | 1 | 1 | 0 | 0 | 72.7 |
| dragSketchPoint | 20 | 1 | 2 | 2 | 1 | 1 | 0 | 0 | 206.2 |
| dragBody | 20 | 1 | 2 | 2 | 1 | 1 | 0 | 0 | 207.7 |
| openEditor | 0 | 1 | 2 | 2 | 1 | 1 | 0 | 21 | 233.5 |
| openCanonical | 0 | 1 | 2 | 2 | 1 | 1 | 1 | 62 | 250.5 |
| selectCanonical | 0 | 1 | 2 | 2 | 1 | 1 | 0 | 0 | 192.4 |

Model editor CAD gesture baseline: teardowns, part builds, edge scans, disposals, rebuilds.
