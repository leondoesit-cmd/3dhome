# CAD drawing redraw and editor resize-listener lifetime

## Drawing precision and zones

Open a drawing with front, top, right and isometric views. Let all four views finish projecting, then change dimension precision or toggle sheet zones. Both edits previously routed through the drawing host's full invalidation before repainting. The projector lost its hidden-line results even though the triangles and view directions still matched.

The benchmark builds the existing 300-boss plate fixture as one body (56,412 triangles). It warms the sheet, then applies precision 3, zones off, precision 2 and zones on. Both paths use the same controller and geometry. The control reinstates the former full invalidation in the dirty callback. The fixed path runs the production callback. On Windows with Node 24.19.0, elapsed milliseconds for the four edits were:

| Dirty callback | Precision 3 | Zones off | Precision 2 | Zones on | Projections rebuilt per edit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full invalidation | 1,815 | 1,547 | 1,445 | 1,415 | 4 |
| Layout invalidation | 24 | 8 | 8 | 12 | 0 |

The independent initial probe measured 1.45–1.94 s with full invalidation and 17–18 ms with projections retained. Both probes time CPU work on a warm sheet. The regression checks projection identity, counts and changed drawing output. Timings vary with load and exclude canvas painting, DOM panel updates, history capture and the first projection of a model.

Paper settings, dimensions, notes, images and paper primitives now invalidate the sheet scene. The projector remains bound to its drawing object and body generation. A replacement document forces a new projector even when its IDs, settings and generation match. Undo/redo restores and geometry rebuilds keep their full invalidation, including publication of a late exact mesh. Source switches and projection-dependent settings invalidate geometry. Revising a referenced model changes the per-view source token so a new projection is used on repaint. Cuts and hatching can affect derived views. Scale edits retain ordinary projections, but a sheet with a broken view rebuilds because its gap depends on paper scale.

Reproduce from the repo root in PowerShell:

```powershell
$env:DRAWING_BENCH = '1'
node --test tests/drawing_projection_cache.test.mjs tests/drawing_history_restore.test.mjs
Remove-Item Env:DRAWING_BENCH
```

## Editor resize listener

Open CAD, close it, switch application language, then reopen CAD. The language change causes the old editor DOM to be destroyed and a new view to be created. Repeat, counting the resize handlers installed by editor views. Ordinary close/reopen with the same language reuses the DOM.

Previously the window held an anonymous resize handler for every created view. Teardown disposed the renderer and removed the DOM but left the window subscription live. The original controlled probe retained 20 of 20 listeners after 20 cycles. The fixed controlled test creates a real editor view and executes the CAD DOM teardown for each of 20 cycles. Every live view responds to resize. After each teardown there are **zero view resize listeners** and the unrelated window listener is still registered.

The view now owns an idempotent disposer. It unregisters its resize handler, cancels a pending long press, guards queued paints and calls the renderer disposer once. Both CAD and the cabinet editor use it when discarding their DOM. The test substitutes a renderer and counts listeners on an EventTarget. GPU allocations, browser heap collection and total process memory were outside the measurement.

```powershell
node --test tests/editor_view_dispose.test.mjs
```

## Exact-mesh publication and Save

Sol’s 20-body probe recorded 20 sheet redraws and 80 projections during one batch. Each changed body called the single-body refresh, which invalidated and synchronously painted all four views. During Save, that also let the sheet display a mixture of old and newly copied meshes.

The regression drives the exact rebuild publication path and the live-document mesh update used after a successful Save. Each starts with a warm four-view drawing, then replaces 20 box meshes with different exact geometry. Counts exclude the initial paint.

| Work per 20-body batch | Original probe | Exact publication after fix | Save after fix |
| --- | ---: | ---: | ---: |
| Sheet redraws | 20 | 1 | 1 |
| View projections | 80 | 4 | 4 |
| Body topology caches refreshed | — | 20 | 20 |
| Drawing inspector refreshes | — | 1 | 1 |

Both final drawings match a fresh projection of the complete document. Mesh preparation stages results through the last asynchronous transfer. If a later transfer fails or the result becomes stale, the prior body generation stays intact. Save still checks the live document and history before copying meshes. Force Rebuild batches its initial clearing of derived bodies separately from the later exact result. A single late mesh still refreshes immediately. A hidden drawing is invalidated and waits until it is shown to project. The counts cover publication and Save’s mesh-copy step. Kernel execution, file I/O and later workflow refreshes are outside the probe.

## Renderer closed during initialization

The renderer starts backend initialization before the editor view is ready. In Sol’s probe, early teardown called the renderer disposer while it could do no work. Initialization subsequently completed with nobody left to dispose the live backend.

Editor teardown now removes the listener immediately. If initialization is pending, its success callback performs disposal instead of the first paint. An already-ready backend is disposed during teardown. The editor handles a rejected initialization without scheduling a paint.

The controlled lifecycle test alternates the order across 20 creations. In all **10 close-before-ready** cycles, initialization was followed by exactly one effective disposal and zero renders. In all **10 ready-before-close** cycles, the live view rendered and teardown disposed it exactly once. A rejected initialization was also exercised. These are renderer-double and listener observations for CAD and the shared cabinet editor view. They do not measure hardware GPU memory, driver cleanup or unrelated renderer owners.

## Referenced model revisions

Sol’s probe retained 21 projections of one view after the initial projection and 20 updates of its source. The cache had stored every source token as a distinct key for the lifetime of the projector.

Each view now keeps entries for its current source and revision. A revision replaces that view’s entire set of display variants on its next projection. Detail views can still request their parent in a different style. Other views continue using their own cached projections. The cache can hold several variants for a live view, including shaded and alternate-position geometry.

With the projector kept live, a Node probe held weak references to the initial result and the 20 revised results. After one event-loop turn and forced collection, **1 of 21** was reachable, and looking up the current revision returned that same object. The ordinary regression also revisits each prior token with new geometry and verifies recomputation while an unrelated view stays warm. The reachability count applies to one view and one style. Other consumers may hold references of their own.

Run the follow-up probes from the repo root:

```powershell
node --expose-gc --test tests/drawing_projection_cache.test.mjs tests/drawing_batch_publication.test.mjs tests/editor_view_dispose.test.mjs
```

## Rebuild interrupted after the first transfer

The earlier interruption test exercised the mesh publisher by itself. Sol reproduced a failure one level up, in `regenerateExactModelNow`. Before asking for the second mesh, the caller had already synchronized extrusion recipes, deleted old meshes and published new topology. When the transfer failed, the drawing still served its cached SVG even though a cold drawing read different geometry.

The regression now calls the rebuild entry point with 20 bodies, a warm four-view sheet, an existing exact mesh, and a cut whose resolved axis and interval change on success. It pauses transfer number two, then either rejects the transfer or makes the build stale. At the pause and after either interruption, the original cut, mesh, native run and topology are still present. The cached and cold SVGs both equal the original. Each interrupted attempt records **2 transfer attempts, 0 sheet invalidations, 0 redraws and 1 release of the abandoned run**. A successful retry publishes the changed cut and mesh, refreshes the sheet once and matches a cold projection.

The rebuild transfers onto shallow copies of the active bodies. After transfer, it prepares the extrusion records, topology, lightweight rebuild and status on a draft. It checks ownership again immediately before publishing the completed result. It refreshes the union of bodies affected by recipe changes and mesh publication. The old native run remains available while transfers are pending, so the two runs can overlap in memory. This probe measures publication correctness and redraw counts. It does not measure peak native memory or kernel execution time.

## Moving a broken drawing view

The Break projector used the serialization of every sheet view in its cache key. Moving a view changed that key even when only its paper coordinates changed. Sol measured **322–340 ms per move**, versus roughly **1 ms** when the projection was reused.

The projector now checks the saved Break against its current source and cluster. Its key includes the validation outcome, effective paper scale and Break modifier. Paper coordinates still change the layout. A changed member, source, configuration or scale that makes the cluster invalid still produces its repair diagnostic.

A Node 24 run moved one front view of the 56,412-triangle boss plate three times at 1:4 scale. Both paths started warm. Rebuilding the projection for each move took **449, 386 and 318 ms**. Retaining it took **3, 3 and 2 ms**. The latter performed **0 additional projections** and produced the same final SVG as the forced-rebuild control. These times cover sheet layout and projection on the CPU, excluding canvas paint and pointer-event dispatch.

## Backend resources on rejected initialization

A vendored Three.js renderer can acquire a WebGL2 context and register its context-loss listener before a capability query fails. At that point its initialized flag is still false. In the bare-renderer failure probe, the canvas retained **1 backend listener** and the context received **0 loss requests**.

The shared renderer factory now releases partially initialized backends on rejection. It removes the backend’s listener and requests loss of an owned GL context when the loss extension is available. It also releases a failed primary backend that Three replaced during fallback. The readiness promise preserves the original initialization error.

The regression uses the vendored renderer with a canvas event target and an injected GL capability failure. After rejection it counts **0 backend listeners and 1 loss request** for the owned context. With a caller-supplied context it counts **0 backend listeners and 0 loss requests**. An unrelated listener survives both cases. Fallback ownership is checked separately with renderer doubles. This measures the vendored initialization path and cleanup calls with a controlled context. Actual driver memory reclamation and hardware WebGPU failure were outside the measurement.

Run the three re-review probes from the repo root:

```powershell
$env:DRAWING_BENCH = '1'
node --test tests/drawing_batch_publication.test.mjs tests/drawing_break.test.mjs tests/webgpu_renderer.test.mjs
Remove-Item Env:DRAWING_BENCH
```

## Failures after all exact meshes transfer

The transfer-only fix still adopted the candidate native run and released the previous run before synchronizing extrusion records, capturing exact topology and rebuilding the lightweight model. Sol injected exceptions at those boundaries. A failure could delete an old mesh and leave the drawing serving its cached SVG while a fresh projection of the same live document produced a different SVG.

Canonical rebuilds now prepare the rest of the publication on a private document draft. This includes exact diagnostics, updated cuts and bindings, topology, solved sketch state, feature/history status and mesh replacements. Existing display meshes are read-only inputs during preparation. The draft computes and validates the changes to the live records before the final ownership check. Publication applies those data changes synchronously, installs the new native run and invalidates the sheet before releasing the previous run. Timer changes, viewport updates and paint follow publication. An abandoned candidate releases only its own native resources.

The regression calls `regenerateExactModelNow` with a warm four-view sheet, a previous native run and a pending body timer. Each of nine cases reaches its boundary **after all 20 exact meshes have transferred**:

- Exact diagnostic capture
- Extrusion projection synchronization, after changing a cut and a reference
- Invalidation of the staged mesh
- Exact topology capture, after editing the draft cache
- Lightweight rebuild, after editing a nested sketch point
- Combination of kernel and lightweight diagnostics
- Status publication, after editing feature and history records
- Write validation, with a read-only field on a live body
- Loss of ownership immediately before publication

In **9 of 9 failures**, the live document matched its snapshot. The previous native run, run stamp, lightweight result, diagnostics, exact mesh and topology retained their identities. Each attempt released its candidate once, left the old timer in place and recorded **0 drawing invalidations and 0 redraws**. The cached SVG and a fresh projection both matched the original.

Each case then retried through the same entry point with a fresh candidate. **9 of 9 retries** released the previous native run exactly once, cleared the old timer, refreshed all 20 body topology caches and produced **1 drawing invalidation and 1 redraw**. The new SVG matched a cold projection, and the existing body, cut and sketch objects reflected the new geometry.

These counts cover canonical document publication with controlled native results. UI paint, native kernel execution time and peak memory are outside the measurements. The draft temporarily holds writable authoring records alongside the previous generation.

```powershell
node --test --test-name-pattern='post-transfer' tests/drawing_batch_publication.test.mjs
```

## Shared records, new bindings and replaced bodies

Three probes through `regenerateExactModelNow` failed before this correction. When a body was reachable through both the parts list and another document field, publication replaced its point array instead of updating the existing array and point. A newly created binding retained a private copy of its point and still read **4** after the live point changed to **7**. Replacing a body under the same ID left its old timer registered.

The draft now copies each source record or array once. When preparing the commit it also visits newly created records and arrays, so a new binding resolves to the live point even if the binding is the only remaining path to that point. The binding and its shared containers keep their own identities. The sheet and bulk display buffers remain read-only inputs.

Timers follow the owning body object. After a successful commit, publication cancels timers for detached bodies and bodies whose exact mesh was just published. A cabinet regression exercises the real status publisher: on an injected failure both old body timers survive; on retry it cancels the timers for the replaced and removed objects. An unrelated object's timer survives even when its body ID matches. The resulting sheet matches a cold projection.

```powershell
node --test --test-name-pattern='aliased body|new binding|replaced body|cabinet regeneration|point reachable' tests/drawing_batch_publication.test.mjs
```
