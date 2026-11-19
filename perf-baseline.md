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

## Planner probes — package E (first 3D open, per-item merge)

`node tools/perf_planner.mjs --only=first_open [--salt] [--head] [--first-open-wait=ms]`, 2026-11-13, WebGPU, RTX 5070 Ti,
apartment seed 3 with infrastructure (44 items). "warm" = driver shader cache warm; "cold" = `--salt` (a per-page salt in
every shader, so neither Chrome's nor the driver's cache answers). Opened 1 s after generating unless noted.

| run | first frame ms | first `renderScene` task ms | longest task ms | meshes (furniture) | materials | pipelines |
|---|--:|--:|--:|--:|--:|--:|
| HEAD warm ×2 | 4022 / 4007 | 1139 / 1122 | 1222 / 1230 | 897 (672) | 827 | 31 |
| merge warm ×2 | 2926* / 3785 | 870 / 847 | 0* / 977 | 488 (263) | 418 | 31 |
| HEAD cold | 9351 | 1136 | 1259 | 897 (672) | 827 | 31 |
| merge cold | 9135 | 894 | 1037 | 488 (263) | 418 | 31 |
| HEAD, opened after 10 s in the plan | 191 | (hidden pane, before the click) | 50 | 897 | 827 | 42 |
| merge, opened after 10 s in the plan ×2 | 148 / 185 | (hidden pane, before the click) | 0 / 51 | 488 | 418 | 43–45 |

\* the hidden pane had finished its rebuild inside the 1 s wait in that run.
Cold first open is GPU-side shader compile: the main thread is idle ~8.3 s of the 9.1 s. Node builds on the first
open: 77 (77 distinct keys, 136 ms); three keys material numbers as on/off, so equal materials already share them.
Steady state (orbit, `--eval` frame probe, 2 runs each): draw calls over the sample 33,960 → 17,600; direct lit
render CPU p50 3.4 → 2.1–3.2 ms; orbit frame p50 8.2 ms both (vsync). Merge cost: 48–51 ms for all 44 items
(their catalogue build is 83–92 ms). 3D picture vs HEAD (`--capture --style=3d --no-thumbs`, back to back, ×2):
55 pixels differ, max 5 levels; each side identical across its two runs.

## Planner probes — review-fixes

Generated 2026-11-13T21:57:36.225Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71,"mepAutoMs":null} · three loaded at reload: true

| scenario | first picture ms | all exact ms | longest task ms | long tasks | bakes | on disk at switch | cached before |
|---|--:|--:|--:|--:|--:|--:|--:|
| sprites_cold | 3197 | 5185 | 73 | 1 | 32 | 0/44 | 0 |
| sprites_warm | 6 | 6 | 0 | 0 | 1 | 36/44 | 44 |
| sprites_warm_now | 1663 | 2400 | 0 | 0 | 12 | 36/44 | 19 |
| sprites_zoom (0.573→2.415) | — | 1718 | 158 | 1 | 40 | — | — |

mep_2d_idle: 29.2 HUD paints/s, 1.583 ms HUD/paint (drawMEP 1.4, signature 0.167), rAF 113.6 fps, main thread busy 75 %.

mep_3d (power): draw calls with MEP 438 (under-floor x-ray off: 391) vs without 379; MEP meshes 59 (+0 instanced) of 488; rebuild3D 32.5 ms (buildMEP3D 9.7); toggle a system (panel eye) until the new frame is drawn: off 36 ms, on 31 ms (with 2 settle frames + GPU drain: 66 / 68 ms; full rebuild3D calls 0); inspector diameter edit until drawn 36 ms (full rebuild3D calls 0).

## Planner probes — review-before

Generated 2026-11-13T22:03:14.974Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71,"mepAutoMs":null} · three loaded at reload: true

| scenario | first picture ms | all exact ms | longest task ms | long tasks | bakes | on disk at switch | cached before |
|---|--:|--:|--:|--:|--:|--:|--:|
| sprites_cold | 3672 | 6400 | 218 | 2 | 35 | 0/44 | 0 |
| sprites_warm | 2 | 2 | 0 | 0 | 0 | 36/44 | 36 |
| sprites_warm_now | 2473 | 2537 | 0 | 0 | 0 | 36/44 | 0 |
| sprites_zoom (0.573→2.415) | — | 2750 | 0 | 0 | 40 | — | — |

mep_2d_idle: 29.3 HUD paints/s, 1.577 ms HUD/paint (drawMEP 1.416, signature 0.158), rAF 111.6 fps, main thread busy 81 %.

mep_3d (power): draw calls with MEP 847 (under-floor x-ray off: 800) vs without 788; MEP meshes 59 (+0 instanced) of 897; rebuild3D 40.3 ms (buildMEP3D 8.6); toggle a system (panel eye) until the new frame is drawn: off 31 ms, on 42 ms (with 2 settle frames + GPU drain: 71 / 94 ms; full rebuild3D calls 0); inspector diameter edit until drawn 137 ms (full rebuild3D calls 1).

## Planner probes — mep-x3-cpu4

Generated 2026-11-13T22:17:26.388Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71,"mepAutoMs":null} · MEP scene {"walls":54,"items":132,"mepNodes":189,"mepRuns":203,"mepAutoMs":442} · CPU throttled 4x

mep_2d_idle: 0.2 HUD paints/s, 25 ms HUD/paint (drawMEP 23.2, signature 2.3), rAF 0.2 fps, main thread busy 320 %.

| drag (mep_2d_drag) | grabbed | frame p50 ms | clashes ms/move | status ms/move | signature ms/move | model ms/move | panel ms/move | clashes calls | status calls | makeRouter | panel renders |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| wall | wall | 41.9 | 1.02 | 0.97 | 2.07 | 4.47 | 0 | 3 | 3 | 0 | 0 |
| device | mepNode | 85.4 | 0.4 | 0.59 | 2.18 | 52.38 | 0 | 1 | 1 | 0 | 0 |
| bed | items | 69.8 | 7.32 | 6.98 | 2.17 | 3.52 | 0 | 30 | 30 | 0 | 0 |

drag main-thread busy: 26019.2 ms over all three gestures (4 × 30 moves).

mep_3d (power): draw calls with MEP 1248 (under-floor x-ray off: 1139) vs without 1139; MEP meshes 109 (+0 instanced) of 1283; rebuild3D 364.2 ms (buildMEP3D 101.1); toggle a system (panel eye) until the new frame is drawn: off 252 ms, on 476 ms (with 2 settle frames + GPU drain: 420 / 645 ms; full rebuild3D calls 0); inspector diameter edit until drawn 360 ms (full rebuild3D calls 0).

## Planner probes — mep-x6-cpu6

Generated 2026-11-13T22:27:28.662Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71,"mepAutoMs":null} · MEP scene {"walls":108,"items":264,"mepNodes":366,"mepRuns":401,"mepAutoMs":2963} · CPU throttled 6x

mep_2d_idle: 0.3 HUD paints/s, 77 ms HUD/paint (drawMEP 74.767, signature 5.733), rAF 0.3 fps, main thread busy 431 %.

| drag (mep_2d_drag) | grabbed | frame p50 ms | clashes ms/move | status ms/move | signature ms/move | model ms/move | panel ms/move | clashes calls | status calls | makeRouter | panel renders |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| wall | wall | 134.4 | 0 | 0 | 5.81 | 11.94 | 0 | 0 | 0 | 0 | 0 |
| device | mepNode | 284.9 | 2.57 | 2.1 | 7.35 | 169.08 | 0 | 1 | 1 | 0 | 0 |
| bed | item | 144.8 | 0 | 0 | 5.42 | 11.84 | 0 | 0 | 0 | 0 | 0 |

drag main-thread busy: 85721.9 ms over all three gestures (4 × 30 moves).

mep_3d (power): draw calls with MEP 2413 (under-floor x-ray off: 2218) vs without 2235; MEP meshes 184 (+0 instanced) of 2807; rebuild3D 1335.6 ms (buildMEP3D 373.1); toggle a system (panel eye) until the new frame is drawn: off 830 ms, on 1457 ms (with 2 settle frames + GPU drain: 1309 / 1992 ms; full rebuild3D calls 0); inspector diameter edit until drawn 1206 ms (full rebuild3D calls 0).

## Planner probes — mep-x6-webgl2

Generated 2026-11-13T22:37:31.125Z by `node tools/perf_planner.mjs` · webgl2 · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71,"mepAutoMs":null} · MEP scene {"walls":108,"items":264,"mepNodes":366,"mepRuns":401,"mepAutoMs":388}

mep_2d_idle: 3.9 HUD paints/s, 10.333 ms HUD/paint (drawMEP 10, signature 1.608), rAF 5.3 fps, main thread busy 587 %.

| drag (mep_2d_drag) | grabbed | frame p50 ms | clashes ms/move | status ms/move | signature ms/move | model ms/move | panel ms/move | clashes calls | status calls | makeRouter | panel renders |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| wall | wall | 53.1 | 0 | 0 | 0.64 | 1.58 | 0 | 0 | 0 | 0 | 0 |
| device | mepNode | 60.4 | 0.32 | 0.26 | 0.75 | 19.35 | 0 | 1 | 1 | 0 | 0 |
| bed | item | 45 | 0 | 0 | 0.57 | 1.32 | 0 | 0 | 0 | 0 | 0 |

drag main-thread busy: 4120.3 ms over all three gestures (4 × 30 moves).

mep_3d (power): draw calls with MEP 2411 (under-floor x-ray off: 2209) vs without 2230; MEP meshes 184 (+0 instanced) of 2851; rebuild3D 181 ms (buildMEP3D 45); toggle a system (panel eye) until the new frame is drawn: off 190 ms, on 178 ms (with 2 settle frames + GPU drain: 232 / 232 ms; full rebuild3D calls 0); inspector diameter edit until drawn 181 ms (full rebuild3D calls 0).

## Planner probes — webgl2-review

Generated 2026-11-13T22:47:33.220Z by `node tools/perf_planner.mjs` · webgl2 · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71,"mepAutoMs":null} · tiled scene {"walls":54,"items":132,"mepNodes":71,"mepRuns":71,"mepAutoMs":null}

| scenario | first picture ms | all exact ms | longest task ms | long tasks | bakes | on disk at switch | cached before |
|---|--:|--:|--:|--:|--:|--:|--:|
| sprites_cold | 1815 | 4029 | 197 | 2 | 32 | 0/44 | 0 |
| sprites_zoom (0.573→2.415) | — | 1730 | 0 | 0 | 35 | — | — |

mep_3d (power): draw calls with MEP 438 (under-floor x-ray off: 391) vs without 379; MEP meshes 59 (+0 instanced) of 488; rebuild3D 32.4 ms (buildMEP3D 7.3); toggle a system (panel eye) until the new frame is drawn: off 63 ms, on 59 ms (with 2 settle frames + GPU drain: 75 / 75 ms; full rebuild3D calls 0); inspector diameter edit until drawn 59 ms (full rebuild3D calls 0).

| planner_rebuild | items | rebuild3D ms | structure | items | MEP | itemSig n / ms | meshes | item meshes | pipelines |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| apartment | 44 | 35.4 | 22.9 | 4 | 7.6 | 46 / 1.6 | 488 | 263 | — |
| tiled ×copies | 132 | 79.7 | 57.7 | 12.6 | 9.4 | 141 / 4.8 | 1367 | 789 | — |

## Planner probes — review-zoom-1

Generated 2026-11-13T23:17:36.023Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71,"mepAutoMs":null}

| scenario | first picture ms | all exact ms | longest task ms | long tasks | bakes | on disk at switch | cached before |
|---|--:|--:|--:|--:|--:|--:|--:|
| sprites_cold | 3227 | 5354 | 89 | 1 | 34 | 0/44 | 0 |
| sprites_zoom (0.573→2.415) | — | 2374 | 0 | 0 | 36 | — | — |

## Planner probes — review-zoom-2

Generated 2026-11-13T23:21:38.161Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71,"mepAutoMs":null}

| scenario | first picture ms | all exact ms | longest task ms | long tasks | bakes | on disk at switch | cached before |
|---|--:|--:|--:|--:|--:|--:|--:|
| sprites_cold | 3858 | 5951 | 77 | 3 | 32 | 0/44 | 0 |
| sprites_zoom (0.573→2.415) | — | 1575 | 0 | 0 | 36 | — | — |

## Planner probes — review-zoom-head-1

Generated 2026-11-13T23:25:40.303Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71,"mepAutoMs":null}

| scenario | first picture ms | all exact ms | longest task ms | long tasks | bakes | on disk at switch | cached before |
|---|--:|--:|--:|--:|--:|--:|--:|
| sprites_cold | 3870 | 6748 | 203 | 2 | 35 | 0/44 | 0 |
| sprites_zoom (0.573→2.415) | — | 2862 | 0 | 0 | 40 | — | — |

## Planner probes — mep-x1-cpu1

Generated 2026-11-14T08:53:38.016Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71,"mepAutoMs":null}

mep_2d_idle: 1.3 HUD paints/s, 1.9 ms HUD/paint (drawMEP 1.65, signature 0.2), rAF 2 fps, main thread busy 74 %.

| drag (mep_2d_drag) | grabbed | frame p50 ms | clashes ms/move | status ms/move | signature ms/move | model ms/move | panel ms/move | clashes calls | status calls | makeRouter | panel renders |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| wall | wall | 18.6 | 0.21 | 0.17 | 0.31 | 0.58 | 0 | 8 | 8 | 0 | 0 |
| device | mepNode | 21 | 0.05 | 0.05 | 0.21 | 5.69 | 0 | 2 | 2 | 0 | 0 |
| bed | items | 17.4 | 0.33 | 0.37 | 0.15 | 0.29 | 0 | 30 | 30 | 0 | 0 |

drag main-thread busy: 1696.2 ms over all three gestures (4 × 30 moves).

mep_3d (power): draw calls with MEP 438 (under-floor x-ray off: 391) vs without 379; MEP meshes 59 (+0 instanced) of 488; rebuild3D 40.1 ms (buildMEP3D 9.9); toggle a system (panel eye) until the new frame is drawn: off 38 ms, on 35 ms (with 2 settle frames + GPU drain: 74 / 86 ms; full rebuild3D calls 0); inspector diameter edit until drawn 36 ms (full rebuild3D calls 0).

## Planner probes — mep-x1-cpu4

Generated 2026-11-14T08:58:50.037Z by `node tools/perf_planner.mjs` · webgpu · real GPU Chrome · scene {"walls":18,"items":44,"mepNodes":71,"mepRuns":71,"mepAutoMs":null} · CPU throttled 4x

mep_2d_idle: 1.2 HUD paints/s, 7.125 ms HUD/paint (drawMEP 5.95, signature 0.825), rAF 1.5 fps, main thread busy 250 %.

| drag (mep_2d_drag) | grabbed | frame p50 ms | clashes ms/move | status ms/move | signature ms/move | model ms/move | panel ms/move | clashes calls | status calls | makeRouter | panel renders |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| wall | wall | 32.7 | 0.8 | 0.77 | 1.14 | 2.25 | 0 | 8 | 8 | 0 | 0 |
| device | mepNode | 44.6 | 0.2 | 0.2 | 0.95 | 27.52 | 0 | 2 | 2 | 0 | 0 |
| bed | items | 19.9 | 1.47 | 1.6 | 0.73 | 1.48 | 0 | 30 | 30 | 0 | 0 |

drag main-thread busy: 11181.3 ms over all three gestures (4 × 30 moves).

mep_3d (power): draw calls with MEP 438 (under-floor x-ray off: 391) vs without 379; MEP meshes 59 (+0 instanced) of 488; rebuild3D 146.1 ms (buildMEP3D 39.1); toggle a system (panel eye) until the new frame is drawn: off 174 ms, on 223 ms (with 2 settle frames + GPU drain: 264 / 304 ms; full rebuild3D calls 0); inspector diameter edit until drawn 160 ms (full rebuild3D calls 0).

