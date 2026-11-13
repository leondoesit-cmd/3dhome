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

## Planner probes — baseline

Generated 2026-11-13T13:22:27.342Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71} · tiled scene {"walls":54,"items":132,"mepNodes":71,"mepRuns":71}

| scenario | first picture ms | all exact ms | longest task ms | long tasks | bakes | on disk at switch | cached before |
|---|--:|--:|--:|--:|--:|--:|--:|
| sprites_cold | 3485 | 8135 | 157 | 5 | 32 | 0/44 | 0 |
| sprites_warm | 252 | 252 | 0 | 0 | 0 | 36/44 | 0 |
| sprites_zoom (0.573→2.415) | — | 2941 | 0 | 0 | 32 | — | — |

pres_paint (132 items): technical model 8.23 ms / paint, presentation model 6.45 ms (drawItemPresentation 1.29 ms); pan: 1.05 model paints / move, 7.72 ms model / move.

mep_2d_idle: 29.5 HUD paints/s, 1.493 ms HUD/paint (drawMEP 1.3, signature 0.145), rAF 116.5 fps, main thread busy 63 %.

| drag (mep_2d_drag) | grabbed | frame p50 ms | clashes ms/move | status ms/move | signature ms/move | model ms/move | panel ms/move | clashes calls | status calls | makeRouter | panel renders |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| wall | wall | 13 | 1.42 | 0.12 | 0.18 | 0.43 | 0 | 8 | 8 | 0 | 0 |
| device | mepNode | 13.8 | 0.35 | 0.03 | 0.16 | 4.46 | 0 | 2 | 2 | 0 | 0 |
| bed | items | 10.7 | 3.58 | 0.4 | 0.16 | 0.3 | 0 | 30 | 30 | 0 | 0 |

drag main-thread busy: 1283.5 ms over all three gestures (3 × 30 moves).

mep_route: started true; frame p50 13.9 ms; makeRouter 23 calls (0.03 ms/move), wallPath 0.06 ms/move, routeResolve 0.07 ms/move; busy 660.5 ms / 30 moves.

mep_3d (power): draw calls with MEP 1218 vs without 793; MEP meshes 425 (+0 instanced) of 1263; rebuild3D 32.9 ms (buildMEP3D 10.8); toggle off 157 ms, on 184 ms (rebuild3D calls 1).

| planner_rebuild | items | rebuild3D ms | structure | items | MEP | itemSig n / ms | meshes | item meshes | pipelines |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| apartment | 44 | 27.1 | 16.2 | 3.1 | 7.7 | 46 / 1.6 | 1263 | 672 | 51 |
| tiled ×copies | 132 | 66.2 | 45.1 | 13.5 | 7.6 | 141 / 5.3 | 2982 | 2016 | 67 |

## Planner probes — debug

Generated 2026-11-13T16:52:31.041Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71}

| scenario | first picture ms | all exact ms | longest task ms | long tasks | bakes | on disk at switch | cached before |
|---|--:|--:|--:|--:|--:|--:|--:|
| sprites_cold | 3265 | 5300 | 218 | 1 | 35 | 0/44 | 0 |
| sprites_zoom (0.573→2.415) | — | 2124 | 0 | 0 | 40 | — | — |

## Planner probes — after C+D

Generated 2026-11-13T16:41:46.539Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71} · tiled scene {"walls":54,"items":132,"mepNodes":71,"mepRuns":71}

| scenario | first picture ms | all exact ms | longest task ms | long tasks | bakes | on disk at switch | cached before |
|---|--:|--:|--:|--:|--:|--:|--:|
| sprites_cold | 3463 | 5465 | 230 | 1 | 36 | 0/44 | 0 |
| sprites_warm | 1 | 1 | 0 | 0 | 0 | 36/44 | 32 |
| sprites_zoom (0.573→2.415) | — | 2213 | 288 | 1 | 44 | — | — |

pres_paint (132 items): technical model 7.87 ms / paint, presentation model 6.56 ms (drawItemPresentation 1.35 ms); pan: 1.05 model paints / move, 7.8 ms model / move.

mep_2d_idle: 29.5 HUD paints/s, 1.525 ms HUD/paint (drawMEP 1.308, signature 0.165), rAF 116.1 fps, main thread busy 67 %.

| drag (mep_2d_drag) | grabbed | frame p50 ms | clashes ms/move | status ms/move | signature ms/move | model ms/move | panel ms/move | clashes calls | status calls | makeRouter | panel renders |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| wall | wall | 14.1 | 0.11 | 0.12 | 0.18 | 0.45 | 0 | 8 | 8 | 0 | 0 |
| device | mepNode | 15.3 | 0.02 | 0.03 | 0.14 | 4.62 | 0 | 2 | 2 | 0 | 0 |
| bed | items | 11.9 | 0.28 | 0.38 | 0.15 | 0.29 | 0 | 30 | 30 | 0 | 0 |

drag main-thread busy: 1132.1 ms over all three gestures (4 × 30 moves).

mep_route: started true; frame p50 14.2 ms; makeRouter 23 calls (0.04 ms/move), wallPath 0.08 ms/move, routeResolve 0.07 ms/move; busy 628.8 ms / 30 moves.

mep_3d (power): draw calls with MEP 847 (under-floor x-ray off: 800) vs without 788; MEP meshes 59 (+0 instanced) of 897; rebuild3D 31.9 ms (buildMEP3D 7.3); toggle a system (panel eye) until the new frame is drawn: off 32 ms, on 38 ms (with 2 settle frames + GPU drain: 76 / 85 ms; full rebuild3D calls 0).

| planner_rebuild | items | rebuild3D ms | structure | items | MEP | itemSig n / ms | meshes | item meshes | pipelines |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| apartment | 44 | 31.5 | 18.8 | 3.4 | 7.3 | 46 / 1.4 | 897 | 672 | 52 |
| tiled ×copies | 132 | 68.5 | 47 | 11.4 | 9.3 | 141 / 4.5 | 2616 | 2016 | 67 |

## Planner probes — after C+D, switch after 10 s

Generated 2026-11-13T16:47:46.417Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71}

| scenario | first picture ms | all exact ms | longest task ms | long tasks | bakes | on disk at switch | cached before |
|---|--:|--:|--:|--:|--:|--:|--:|
| sprites_cold | 1 | 1 | 0 | 0 | 0 | 0/44 | 48 |

