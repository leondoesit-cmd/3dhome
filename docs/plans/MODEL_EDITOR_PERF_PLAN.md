# Model editor performance plan

Target: `js/modeler.js` and the CAD modules it drives. Companion to
`LAYERS_PERF_PLAN.md`, same discipline — **measure first, then cut work.**

## Thesis

The model editor has no incremental update path. `updatePreview()` is the only
route to the viewport, and it is a total teardown: dispose every geometry and
material in the document, rebuild every part from scratch, twice. Hover calls
it. Drag calls it per pointermove. Colour sliders call it per input event.

**Almost all of the work is in service of state that does not change the
geometry** — which edge is highlighted, which face is lit, which pane is
visible. The plan is to separate what the model *is* from what the model
*looks like right now*, and stop rebuilding the former to change the latter.

Line numbers below are from commit `abfd944` on `layers-perf` and **will drift
as you edit**. Each task gives a code needle — search for that, not the line.

**Revision note.** This plan has been through a second verification pass against
the codebase. Four things changed: T3 gained a trap that would otherwise have
shipped a real assembly bug, T6 gained a second listener it had missed, and the
two questions T7 and T10 left open ("verify before changing") are now **answered
in the task** — do not re-litigate them.

**Status, Sep 2026.** Phase 1 hover decoupling **landed**. Hover does not call
`updatePreview()`; `hoverModel` measures 0 rebuilds (`MODEL_EDITOR_PERF_FIXES.md`).
Do not quote the thesis above as current hover behaviour. Colour sliders and the
`hasSelection` / `finishActive` decoration gate are **also closed** (see
`MODEL_EDITOR_UX_PLAN.md` T1/T2). Remaining `updatePreview` on hover would be a
regression, not leftover work. UX status lives in that plan; implementation
notes in `docs/model-editor-ux-implementation.md`.

---

## Step 0 — Measure (do this first, do not skip)

`tools/perf_harness.mjs` already rewrites served JS to inject counters without
touching the working tree (see its `INSTRUMENT` array). Add a `modeler` probe
in the same style. Do **not** edit source files to add counters.

Counters to inject:

| needle (file) | counter | why |
|---|---|---|
| `function updatePreview() {` (`/js/modeler.js`) | `mdPreview` | the teardown count |
| `function buildPart(g, p, displayStyle) {` | `mdBuildPart` | meshes built |
| `export function meshFeatureEdges(` (`/js/core/mesh_projection.js`) | `mdEdgeScan` | the expensive per-triangle pass |
| `export function clearGroup(g) {` (`/js/primitives.js`) | `mdDispose` | GPU buffer churn |
| `function refreshAll() {` | `mdRefreshAll` | the cascade |
| `export function rebuildParametricDocument(` (`/js/core/parametric_rebuild.js`) | `mdRebuildDoc` | parametric solve |
| `export function cloneDomain(value) {` (`/js/core/schema.js`) | `mdClone` | deep-copy cost |

Scripted gestures to script through CDP, each 20 moves:

1. **hoverModel** — pointermove across the body in 3D mode, no buttons.
2. **selectFace** — single click on a face.
3. **dragSketchPoint** — pointerdown on a sketch point, 20 moves, pointerup.
4. **dragBody** — 2D `move` drag of a part.
5. **openEditor** — cold `openModeler()` on a reference document.

Record wall-clock per gesture alongside the counters. Write to
`perf-baseline.json` / `.md` the same way the existing probes do.

**Expected baseline (predictions — confirm or correct them, do not assume):**

| metric | predicted now | target |
|---|--:|--:|
| `mdPreview` per hoverModel gesture | ~20 | **0** |
| `mdBuildPart` per hoverModel gesture | 20 × parts | **0** |
| `mdEdgeScan` per hoverModel gesture | 20 × parts | **0** |
| `mdDispose` per hoverModel gesture | ~40 | **0** |
| `mdBuildPart` per `mdPreview` | 2 × parts | 1 × parts |
| `mdRefreshAll` per selectFace | 1 | 1 (unchanged) |
| `mdRebuildDoc` per selectFace | 1 | **0** |
| `mdClone` per `mdRebuildDoc` | ≥ 2 | 1 |
| `mdRebuildDoc` per openEditor | 2 | 1 |

If a measured number contradicts a prediction, **trust the measurement and
re-aim the task.** Say so in the PR rather than optimising toward a number
that was never real.

---

## Phase 1 — The hover/rebuild decoupling

This is where the felt stutter lives. T2 and T3 are coupled and must ship
together; the rest are independent and can land in any order.

### T1 — Gate `roomGrp` on `inRoom`

**Cost now:** every `updatePreview()` builds the whole model twice. The second
copy goes into `E.pv.roomGrp`, which is consumed only by `drawInRoom()`, which
returns immediately unless `E.pv.inRoom` is set (`modeler.js:17250`). The
checkbox is off by default. Half of every rebuild is discarded.

**Change:** in `updatePreview()` (needle `clearGroup(E.pv.roomGrp);`), wrap the
`roomGrp` clear/build/clip block in `if (E.pv.inRoom) { … }`.

**Trap:** when the user *enables* the room checkbox (`modeler.js:5429`,
`E.pv.inRoom = e.target.checked`), `roomGrp` is now empty. That handler must
call `updatePreview()` after setting the flag. Check it does; add it if not.

**Also:** `setSectionState()` calls `applySectionClipping(E.pv.roomGrp)`
unconditionally (`modeler.js:17118`). Harmless on an empty group, leave it.

**Acceptance:** `mdBuildPart` per `mdPreview` halves. Toggling the room
checkbox still renders the model in the room.

---

### T2 — Cache overlay entries on `meshData`

**Cost now:** `overlayEntriesForPart(part, mesh)` (needle
`function overlayEntriesForPart(part, mesh) {`) calls `geometryToMeshData()`
then `meshFeatureEdges()` on every call. That is a full edge-adjacency build,
vertex weld, crease test and chain walk over every triangle
(`core/mesh_projection.js:205`). It runs once per part per `updatePreview()`,
uncached. It is the single most expensive function on the frame.

`topologyEntriesForPart` already has the pattern to copy: `topologyMergeCache`,
a `WeakMap` keyed on `part.meshData` (`modeler.js:2322`).

**Change:**

1. Add `var overlayEntryCache = new WeakMap();` beside `topologyMergeCache`.
2. Key on `part.meshData` when present. When there is no `meshData` the input
   is the tessellated `mesh.geometry`, so key on `mesh.geometry` instead —
   both are replaced wholesale on a real rebuild, which is what makes them
   safe cache keys.
3. The cache value depends on **nothing selection- or hover-related** — verify
   this when you read the function. It returns descriptors only; colour is
   applied later in `addTopologyPickEdges`. If you find a selection read in
   there, stop and re-scope this task.
4. Extend `clearTopologyCache(part)` (`modeler.js:2324`) to delete from the new
   cache too. That function is the existing invalidation choke point — use it,
   do not add a second one.

**While you are in there — T2b, the O(n²):** `overlayEntriesForPart` does a
linear `kernelEdges.find(...)` inside both `features.circles.forEach` and
`features.polylines.forEach`, and the polyline predicate calls `edgePoints()`
per candidate pair. Bucket `kernelEdges` once before the loops — by rounded
radius for circles, by rounded endpoint midpoint for polylines — and look up
the bucket. Keep the existing tolerance semantics (`Math.max(0.45, measure * 0.04)`);
size the buckets so a hit cannot fall outside its own bucket, or probe
neighbouring buckets.

**Acceptance:** `mdEdgeScan` per `mdPreview` drops to 0 for an unchanged
document. `tests/modeler_edge_selection.test.mjs` and
`tests/modeler_topology_pick.test.mjs` still pass.

---

### T3 — Decoration group: hover and topology selection stop rebuilding bodies

**This is the main event.** Do T2 first or the decoration rebuild still pays
for `meshFeatureEdges`.

**What actually depends on hover/selection.** I checked all five builders
called from `buildPart`:

| builder | reads hover/topology selection? | verdict |
|---|---|---|
| `addTopologyPickEdges` | **yes** — `topologySelected` / `topologyHovered` | → decoration |
| `addFaceHighlights` | **yes** — `E.topologySelection`, `E.hoverTopology` | → decoration |
| `addFaceAppearances` | no — reads `E.def.appearances` | stays with body |
| `addPartFeatureOverlays` | no — reads `part.cosmeticThread` etc. | stays with body |
| `addMeshSharpEdges` | no — sets polygon offset on the body material | stays with body |

So hover is **fully** decoupleable. Topology selection is too.

**Trap — do not lift the decoration group to the scene root.**
`buildPart` reassigns `g` to a nested `bodyGroup` when the part carries pattern
rotations (needle `for(var rotationIndex=rotations.length-1;`). Edges added to a
root-level group would not follow the pattern transform. The decoration group
must be created **at the same `g`** the mesh is, so it inherits the same chain.

**Trap — `addTopologyPickEdges` finds its mesh by `parent.traverse`.** Once the
decoration group is a sibling of the mesh rather than its parent, that traverse
finds nothing. Pass the mesh in explicitly.

**Trap — `E.buildComponent` is ambient state, and `refreshDecorations` runs
outside its scope.** This one is subtle and would ship as a visible assembly
bug. `buildAssembly` sets `E.buildComponent = component` around each component's
`buildPart` loop (needle `E.buildComponent = component;`), and
`topologyRefInBuiltComponent` **returns `true` when it is null**
(`modeler.js:2572`). Two components off the same library model share every
persistent id, so that flag is the only thing stopping a hovered face from
lighting up on every instance — the comment at `modeler.js:17170` says exactly
this.

A `refreshDecorations()` that iterates `decoGroups` runs with
`E.buildComponent === null`, so every reference passes the filter and **hovering
one component highlights the matching face on all of them.** Capture the
component at build time and restore it during the refresh.

**Change:**

1. Module-level `var decoGroups = [];`.
2. In `buildPart`, after the mesh exists:
   ```js
   var deco = new THREE.Group();
   deco.userData.cadDeco = p.id;
   g.add(deco);
   decoGroups.push({ part: p, mesh: me, group: deco, component: E.buildComponent || null });
   ```
3. Move the `addTopologyPickEdges(g, p)` and `addFaceHighlights(g, p, me)`
   calls to target `deco`, and change `addTopologyPickEdges(parent, part)` to
   `addTopologyPickEdges(parent, part, mesh)` — drop its internal `traverse`.
4. Reset `decoGroups = []` at the top of `updatePreview()`, before the clears.
5. New function — note the `try/finally`, matching the convention `buildAssembly`
   already uses and for the same stated reason (a throw that leaves the flag set
   filters every later hover against a component that is no longer being built,
   and highlights stop appearing anywhere until the editor is reopened):
   ```js
   function refreshDecorations() {
     if (!E.pv) return;
     decoGroups.forEach(function (entry) {
       clearGroup(entry.group);
       E.buildComponent = entry.component || null;
       try {
         addTopologyPickEdges(entry.group, entry.part, entry.mesh);
         addFaceHighlights(entry.group, entry.part, entry.mesh);
       } finally {
         E.buildComponent = null;
       }
     });
     E.pv.render();
   }
   ```
6. Repoint the hover call sites at it:
   - `hoverAssemblyTopology`, needle `E.hoverTopology = next;` → `refreshDecorations()`
   - same function, needle `if (E.hoverTopology) { E.hoverTopology = null; updatePreview(); }`
   - the `pointerleave` handler, needle `E.hoverTopology = null;` followed by `updatePreview()`

**What must still call `updatePreview()`:** `E.sel` (part selection) and
`E.dependencyHighlight` both clone and recolour the **body** material inside
`buildPart` (needle `if (p === E.sel && me.material)`). Those are a different
selection concept from `E.topologySelection`. Leave them on the full path in
this task. Narrowing them is T9's job.

**Note on `view.pickBounds`:** `E.pv.rebuild()` recomputes it. `refreshDecorations`
bypasses `rebuild`, so bounds are not refreshed — which is correct here, since
decoration does not move the model. Do not add a bounds recompute in this task.
(T7 does need one, for a different path — `syncGroups()` during an assembly
drag genuinely does move geometry without a rebuild. See T7(b).)

**Acceptance:** `mdPreview`, `mdBuildPart`, `mdEdgeScan` and `mdDispose` all
**0** across a hoverModel gesture. Hover highlight still tracks the cursor.
Edge/face selection still highlights. Two explicit manual checks, both of which
this task can silently break:

- **Pattern-rotated parts** show their edges in the right place — build a
  circular pattern and hover one instance.
- **Assembly multi-instance isolation** — place two components off the same
  library model, hover a face on one, confirm the other does **not** light up.
  This is the `E.buildComponent` trap; it will not show up in a part document.

---

### T4 — Hoist the duplicate `hitInstant3d`

**Cost now:** the 3D canvas `pointermove` handler computes
`overHandle = !E.facePick && !!(instant3dAuthoringState() && hitInstant3d(event, E.pv))`
(needle `var overHandle = !E.facePick`). When that misses — the common case — it
falls through to `hoverAssemblyTopology`, which calls `hitInstant3d(event, view)`
again (needle `var handle = E.docType === "part" ? hitInstant3d(event, view) : null;`).

Each call does `view.place()` (mutates the camera), a `getBoundingClientRect()`,
a **full `view.grp.traverse()`** to collect handles, and allocates a fresh
`Raycaster`. Paid twice per hover frame, on top of `resolveTopologyPick`.

**Change:** give `hoverAssemblyTopology` an optional third parameter for a
pre-computed handle hit and pass the one the pointermove handler already has.
Keep the parameter optional — `hoverAssemblyTopology` has other callers; check
them before changing the signature shape.

**Bonus, cheap — but read this before doing it.** Reuse one `THREE.Raycaster`
and one `THREE.Vector2` across `hitInstant3d` and `resolveTopologyPick` instead
of allocating per call. **Initialise them lazily inside a function, never at
module scope.** `THREE` is late-bound: `js/three_lazy.js` exports an *empty
object* until `loadThree()` resolves, so a module-scope `new THREE.Raycaster()`
throws at evaluation time and takes the whole of `modeler.js` down with it —
the editor then never opens at all. This plan previously said "hoist to
module-level scratch instances" and that instruction shipped exactly that bug.

```js
var pickRaycaster = null, pickPointer = null;
function pickScratch() {
  if (!pickRaycaster) { pickRaycaster = new THREE.Raycaster(); pickPointer = new THREE.Vector2(); }
  return pickRaycaster;
}
```

**Acceptance:** one `view.grp.traverse()` per hover frame instead of two.

---

### T5 — `fillInspector()` fills only the visible pane

**Cost now:** `fillInspector()` calls `fillShape(); fillLook(); fillOps(); fillSketchPane();`
unconditionally (needle `fillShape();\n  fillLook();`). Each starts with
`host.innerHTML = ""` and rebuilds. Four panes built, one visible.

The right-hand panel has five panes: `sketch`, `shape`, `look`, `ops`, `hist`
(`modeler.js:5044-5048`). `hist` is already handled separately by
`histPanel.refresh()`.

**Trap — `setTab` does not refill.** It only toggles the `on` class
(`modeler.js:7531`). If you gate `fillInspector` without touching `setTab`, a
tab switch shows whatever was in that pane at its last full fill — stale or
empty. **Both halves are required.**

**Change:**

1. `var inspectorDirty = { sketch: true, shape: true, look: true, ops: true };`
2. `fillInspector()` marks all four dirty, then fills only `activeTab("R")`
   (the helper already exists at `modeler.js:7544`) and clears that one's flag.
3. `setTab(id)` — after the class toggles — if `id` is one of the four and its
   flag is set, fill it and clear the flag.
4. Keep `fillSketchPane` and friends individually callable. `fillSketchPane()`
   has a direct caller in `runDiagnosticAction` (needle `setTab("sketch");\n    fillSketchPane();`)
   — that path must keep working.

**Trap — mobile.** `js/modeler_mobile.js` sheets *borrow* the real panels
rather than re-rendering them (see the module's header comment and the
`3dhome-modeler-mobile` note). A sheet that borrows `#mdLook` while the pane is
not the active tab would show a stale panel. Check `showModelerSheet` and make
it fill the pane it borrows.

**Acceptance:** ~4× fewer inspector DOM builds per `refreshAll`. Every tab shows
current content when switched to, on desktop and in the mobile sheets.
`tests/model_editor_layout.browser.mjs` and `tests/model_editor_desktop.browser.mjs`
pass.

---

### T6 — RAF-coalesce the 2D canvas `pointermove`, cache the rect

**Cost now:** the 2D canvas `pointermove` (needle `cv.addEventListener("pointermove", function (e) {`)
runs synchronously per raw event. A 1000 Hz mouse fires ~16 per paint. Each one
does `cv.getBoundingClientRect()` at entry, and the `dimension` branch does a
second one. During a `spoint` drag it also runs `resolveSketch()` and
`fillInspector()` per event; during a `move` drag, `updatePreview()`.

**There is a second `pointermove` listener on the same canvas.** `autoPanFrom`
is registered separately (needle `cv.addEventListener("pointermove", autoPanFrom);`)
and opens with its own `var rect = cv.getBoundingClientRect();`. So every raw
move event currently forces **two** synchronous layout reads, not one. Fixing
only the main handler leaves half the reflow in place — point `autoPanFrom` at
the same cached rect.

Its RAF loop (`apStep`) is already coalesced and calls `drawSketch()` +
`syncStatus()` once per frame — leave that alone, it is correct.

The 3D hover path already has the pattern to copy (needle
`var queued = null, latestHoverEvent = null;`): snapshot the latest coordinates
into a plain value object, coalesce to one `requestAnimationFrame`.

**Change:**

1. Cache the canvas rect in `E._cvRect`, refreshed on `pointerdown` and from the
   existing `ResizeObserver` (`watchSketchSize`, `modeler.js:9401`). Replace both
   `getBoundingClientRect()` calls in the move handler **and the one in
   `autoPanFrom`**. Note the pane can also scroll or the panel be dragged
   without a resize firing — refresh the cache on `pointerdown` unconditionally,
   which covers every gesture start.
2. Coalesce the handler body into one RAF, keeping only the newest event
   snapshot — retaining the first event in the frame makes the cursor lag.
3. **Keep `pointerdown` and `pointerup` synchronous.** Only `pointermove` is
   coalesced. Flush any pending frame at the top of `pointerup` so the release
   position is not dropped.

**Trap:** `E.drag.px` / `E.drag.py` are updated inside the orbit branch and read
as deltas. With coalescing, one RAF handles a multi-event delta — that is fine
for orbit (it wants the total) but verify the `gesture` branch's 12px threshold
and the dimension drag's 2px `moved` threshold still behave.

**Acceptance:** dragSketchPoint and dragBody gestures do at most one handler run
per animation frame. No `getBoundingClientRect` in the move path.

---

## Phase 2 — Structural

### T7 — Stop paying for invisible edges

Three changes in `addTopologyPickEdges`:

1. **`line.visible = false` instead of `opacity: 0`** (needle
   `opacity: visible ? (selected || hovered ? .98`). An invisible line is
   currently still submitted to the GPU.
2. ~~**`line.raycast = function () {};` on hidden lines**~~ — **do NOT do this.
   Question resolved: picking deliberately relies on hitting hidden edges.**
   `modeler_topology_pick.js:104-113` sets `var allowInvisible = prefer === "edge";`
   and then `if (!allowInvisible && !finish && hit.object.userData.cadPickVisible === false) return false;`.
   So with the **Edge** selection filter active — or during a finish command —
   invisible edges are intentionally pickable, which is what lets you select an
   edge with edge display toggled off. Killing their raycast would break that.
   Keep hidden lines raycastable; `line.visible = false` alone gets the draw-call
   win with no behaviour change, because `cadPickVisible` is a separate flag that
   the picker reads and the renderer does not.
3. **Merge visible default-colour edges into one `THREE.LineSegments` per part.**
   Selected and hovered edges stay individual (they need their own colour and
   glow). Turns hundreds of draw calls into ~3 per part.

   **Design constraint this creates:** picking resolves an edge through
   `hit.object.userData.cadTopology`, which a merged object cannot carry per
   segment. Two ways out — pick one deliberately:
   - **(a)** merged `LineSegments` for display, keep the individual `Line`s at
     `visible = false` purely as pick targets. Simplest, preserves picking
     exactly, still wins the draw calls (invisible objects are not submitted),
     but keeps the object count.
   - **(b)** raycast the merged object and map the hit back through a segment
     range table, the way faces already resolve through
     `mesh.userData.cadFaceRanges`. Cleaner and cuts object count too, but it
     is real work in `resolveTopologyPick` and `chooseTopologyHit`.

   **Start with (a).** It is a contained change with a measurable win. Only go
   to (b) if Step 0 shows object count — not draw calls — is what still hurts.

**And the broad phase:** `resolveTopologyPick` does
`ray.intersectObjects(view.grp.children, true)` over the entire graph. `view.pickBounds`
is computed in `editor_view.js:471` but used only for `worldPerPixel` sizing.
An early-out against it saves the whole traversal when the ray misses the model
— which is most of the time while the pointer moves around the viewport.

**A naive `ray.intersectsSphere(view.pickBounds)` is wrong twice over.** Both
must be fixed or the early-out becomes a correctness bug.

**(a) The sphere must be padded by the line threshold.** `pickBounds` is the
bounds of the *geometry*; line picking is deliberately looser than that.
`ray.params.Line.threshold` is set from
`topologyCandidateWorldThreshold(worldPerPixel, farWorldPerPixel, pickPixels)`,
which is `max(near, far worldPerPixel) × pixelRadius` — and `pixelRadius`
reaches **14** on touch with the Edge filter
(`modeler_topology_pick.js:7-13`), measured against the **far** side of the
model. That is several centimetres on a typical part, not a rounding error. A
ray passing just outside the silhouette can legitimately hit a boundary edge, so
an unpadded test throws away exactly the silhouette picks users aim for:

```js
if (view.pickBounds) {
  var slack = view.pickBounds.radius + (ray.params.Line.threshold || 0);
  if (ray.ray.distanceToPoint(view.pickBounds.center) > slack) return null;
}
```

Returning `null` is safe — all eight call sites either guard with `|| {}` or
read through `found && found.…`; check that still holds before you commit.

**(b) `pickBounds` goes stale during an assembly component drag — fix this
first.** It is written **only** in `view.rebuild` (`editor_view.js:471`). But
`beginAssemblyComponentDrag`'s `syncGroups()` (needle
`view.grp.traverse(function (object) {` inside that function) moves component
groups by setting `object.position` / `object.rotation` directly and then calls
`view.render()` — it never goes through `rebuild`. So while you drag a component
away from the assembly, the model moves and the sphere does not follow it. A
hard early-out on that stale sphere **stops the dragged component from being
pickable**, and stays broken until the next full rebuild.

This is latent today: `farthestWorldPerPixel()` already reads the stale bounds,
but it only mis-sizes a threshold slightly, so nothing visibly breaks. Adding an
early-out on the same data is what turns it into a bug.

**Fix:** expose `view.refreshPickBounds()` in `editor_view.js` (factor the two
lines out of `rebuild`), call it at the end of `syncGroups()`, and only then add
the early-out. This also quietly corrects the existing `worldPerPixel`
staleness.

**Acceptance for the broad phase specifically:** with the Edge filter active on
a touch pointer, silhouette edges remain pickable; and a component dragged well
clear of the assembly is still pickable mid-drag. Neither is covered by the
existing tests — check both by hand.

### T8 — `entityStatuses` id maps

`core`/`modeler_inference.js:120` does `entities.some(e => e.id === id)` inside a
constraint loop — O(N×M). Called from `drawSketch` every paint
(needle `var statuses = entityStatuses(sketch, E.solveInfo);`). Build a
`Map` of id→entity and id→point once at the top and look up. Pure win, no
behaviour change.

### T9 — Split `refreshAll()`

207 call sites. Introduce three narrower entry points and repoint call sites to
the narrowest that applies:

- `refreshSelection()` — tree row classes, inspector, decoration group. **No**
  parametric rebuild, no body rebuild.
- `refreshChrome()` — status bar, hint, workflow, context actions, mobile shell.
- `refreshGeometry()` — the current full cascade.

Start with the highest-value repoint: the selection click in
`pickAssemblyComponent` (needle `E.selectedReferenceId = found.helixId;`) and the
tree-row click handlers. Do **not** attempt all 207 in one pass — repoint the
interactive paths, leave the rest on `refreshGeometry` and let them migrate
opportunistically.

Note `refreshAll` already has the pattern for this: the `assemblySolveFresh`
flag (needle `if (E.docType === "assembly" && E.assembly && !assemblySolveFresh)`)
consumes a solve that just ran rather than repeating it. Reuse that idea.

### T10 — The double `cloneDomain`

`rebuildParametricDocument` (`core/parametric_rebuild.js`) clones the whole
document **twice** per call — `cloneDomain(source)` at the top, then
`cloneDomain(snapshot)` to build `executable`. `ensureParametricDocument` clones
each sketch's entities/constraints/dimensions again on top.

`cloneDomain` is `structuredClone` (`core/schema.js:14`).

**Question resolved — you do not need to go and check this.** I audited every
write `rebuildDefinition` makes to its input document. It mutates **exactly
two** things:

| write | location | shielded by |
|---|---|---|
| `definition.lastRebuild = {…}` | `core/rebuild.js:326` | the spread — `executable` is a new object |
| `sketch.surface = {…}` | `core/rebuild.js:286` | **needs a per-sketch shallow copy** |

Nothing writes to `entities`, `constraints`, `dimensions` or `points` — verified
by grep for both assignment and mutating array methods across `rebuild.js` and
`parametric_document.js`. So a shallow copy one level deep is exactly
sufficient; you do not need to clone the sketch sub-arrays.

**Change:**
```js
const executable = {
  ...snapshot,
  features: compiled.features.filter((feature) =>
    ![...dropped].some((id) => feature.id === id || feature.id.startsWith(id + ":"))),
  sketches: (snapshot.sketches || []).map((sketch) => ({ ...sketch })),
};
```

The `sketches` line is load-bearing, not defensive padding — without it,
`sketch.surface` writes through into `snapshot`, which `bodiesFromResults(snapshot, …)`
and the returned `status` both read afterwards.

The **first** clone (`cloneDomain(source)`) is also load-bearing — it is what
keeps a failed feature from half-mutating the user's authoring document, and the
comment above it says so. **Keep it.** This task removes one clone, not two.

### T11 — `openModeler` rebuilds the document twice

`openModeler` sets `E.coreRun = rebuildParametricDocument(...)` (needle
`E.coreRun = isCanonicalAuthoring() ? rebuildParametricDocument`), then calls
`refreshAll()` a few lines later, which does it again. Open-time only, so low
urgency — but it is a free fix with the `assemblySolveFresh` pattern: set a
`coreRunFresh` flag and have `refreshAll` consume it.

### T12 — `editor_view` layout read per frame

`view.render()` calls `view.resize()`, which does `getBoundingClientRect()`
every frame (`editor_view.js:450`, `:361`).

**Trap — do not just delete the call.** There is deliberate settling logic at
`editor_view.js:365-373` handling the first render landing on a 0-width panel;
its comment explains the postage-stamp bug it fixes. Removing `resize()` from
`render()` reintroduces it.

**Change:** add a `sizeDirty` flag set by a `ResizeObserver` on the canvas
parent and by the existing settling path. `render()` calls `resize()` only when
`sizeDirty` is set or `settling > 0`. Keep the bounded settling retry intact.

---

## Phase 3 — Kernel

### T13 — `shapeToMeshData` WASM boundary

`cad_kernel.js:661-673`. Per triangle: `Triangle(i)`, then per vertex `Node(id)`,
`Transform()`, `X()`, `Y()`, `Z()`, `delete()`. ~21 Emscripten crossings and 4
alloc/free per triangle, pushed into a plain JS array. Shared vertices are
re-fetched and re-transformed once per incident triangle (~6× redundant).

Three changes, in increasing order of effort:

1. **Per-face node cache.** Fetch and transform each node **once** per face into
   a local `Float64Array`, then index it per triangle. Removes ~5/6 of the
   crossings. Do this one first — it is contained and large.
2. **Preallocate a `Float32Array`** sized from `NbTriangles() * 9` instead of
   `positions.push`.
3. **The subshape lookup** below it is an O(faces × subshapes) scan of
   `IsSame()` (needle `if (entry.kind === "face" && entry.shape.IsSame(face))`).
   Build a lookup keyed on a cheap face hash once per call.

A C++ helper that memcpy's the triangulation into a shared heap buffer is the
real fix, but it needs an opencascade.js rebuild — treat as out of scope unless
1–3 prove insufficient.

### T14 — Drag-scoped sketch profile analysis

**Correction to a claim you may have seen:** `sketchProfileAnalysis()` **is
already memoized** on a geometry fingerprint (`profileMemo`, `modeler.js:10487`;
the comment above it says so). Hover and orbit hit the memo. It is not "run
every frame".

The real problem is narrow: a point drag mutates coordinates, so
`sketchFingerprint` changes every sample and busts the memo, running full loop
decomposition per move. **Do not add caching** — add a drag-scoped skip. During
`E.drag.mode === "spoint"`, suppress the region-fill pass in `drawSketch`
(needle `if (live) {\n    var profileInfo = sketchProfileAnalysis();`) and run it
once on `pointerup`.

---

## Do not do these

Claims that surfaced in review and did not survive verification:

- **"`sketchProfileAnalysis` runs uncached every frame"** — false, see T14.
- **"Remove `view.resize()` from `view.render()`"** — breaks the settling
  recovery, see T12.
- **"Disable raycast on invisible edge lines"** — breaks the Edge selection
  filter, see T7.2.
- **"`refreshAll` has 160 / 209 call sites"** — it is **207**. `grep -c 'refreshAll();'`
  gives 207; a looser `refreshAll\s*\(` gives 209 because it also catches the
  function definition and one mention inside a comment. Budget for 207.
- **Do not add a second topology cache invalidation path.** `clearTopologyCache`
  is the choke point; everything new hangs off it.
- **Do not "fix" `E.buildComponent` by removing the null check** in
  `topologyRefInBuiltComponent`. Returning `true` on null is correct — part
  documents never set it, and every reference there has no `componentId`.
- **Do not add the T7 pick broad phase without both fixes** — unpadded sphere,
  or stale bounds during an assembly drag, and it silently eats valid picks.
  A perf early-out that loses selections is worse than the traversal it saves.
- **Never construct a three object at module scope** in any file that imports
  `THREE` from `./three_lazy.js` — see T4. It throws at module-eval time and
  kills the whole module. Lazy-init inside a function.
- **Do not "fix" a stale inspector pane by adding fields to a value signature.**
  T5 is dirty flags plus active-tab rendering. A signature has to enumerate
  every field every pane reads, forever; each omission is a silently stale
  panel, which is worse than a slow one. See `MODEL_EDITOR_PERF_FIXES.md` F3 —
  this was tried and shipped two visible bugs.

---

## Verification

Run after every task:

```bash
npm run check && npm test
```

Run after Phase 1 and again at the end:

```bash
npm run test:browser
```

Regenerate the numbers and diff them into the PR:

```bash
node tools/perf_harness.mjs --only=modeler --repeats=3
```

Browser tests that specifically cover this surface — treat a failure in any of
them as a regression, not a test to update:

- `tests/model_editor_desktop.browser.mjs`
- `tests/model_editor_layout.browser.mjs`
- `tests/model_editor_drawing.browser.mjs`
- `tests/modeler_topology_pick.test.mjs`
- `tests/modeler_edge_selection.test.mjs`
- `tests/model_editor_hard_qa.test.mjs`

**Add two new tests.**

1. `tests/modeler_perf.test.mjs`, mirroring `tests/zombies_performance.test.mjs`:
   assert that a hover change disposes zero geometries and builds zero parts.
   That is the invariant T3 buys, and it is the one most likely to be silently
   undone by a later change.
2. An **assembly multi-instance highlight** case — two components off one
   library model, hover a face on one, assert the other's decoration group holds
   no highlight mesh. `E.buildComponent` is ambient state restored by hand in
   `refreshDecorations`; nothing else will catch it if a later refactor drops
   the restore.

---

## Suggested sequencing

| PR | contents | risk |
|---|---|---|
| 1 | Step 0 harness probe + baseline | none — measurement only |
| 2 | T1, T4 | low, independent |
| 3 | **T2 + T3 together** | medium — the main win |
| 4 | T5, T6 | medium — UI-visible |
| 5 | T7, T8 | low |
| 6 | T9, T10, T11, T12 | medium — wide blast radius |
| 7 | T13, T14 | low, contained |

PR 3 is the one that matters. If time is short, ship PRs 1–3 and stop.
