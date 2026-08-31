# Work-set layers + 2D paint overhaul

Revision of the "Planner work-set layers" plan. Two changes of substance:

1. **The layer model is corrected** — hit *priority*, not binary pickability; no
   default-on structure lock. Both were internally inconsistent as specified.
2. **The performance work is re-aimed at what `perf-baseline.md` actually
   measures.** The original plan proposed a five-band 2D cache and a
   `matrixAutoUpdate` freeze. Neither addresses a measured cost. They are
   dropped and replaced.

The thesis stays: **a layer system is permission to skip work.** Once the app
knows what you are editing, it can decline to draw, hit-test, snap to, and
raycast everything else. Perf is the payoff of layers, not a bolt-on.

---

## Measured baseline

Regenerated with `node tools/perf_harness.mjs` on this branch's base commit
(`089e2c5`). **The numbers in the previously committed `perf-baseline.md` were
stale** — taken at `ee81bf1` with 79 dirty files — and several moved enough to
re-aim the work. Trust the table below, not the older one.

| metric | now | target |
|---|--:|--:|
| `render2D()` per pointermove, **dragWall** | **3.40** | 1.00 |
| `render2D()` per pointermove, dragItem | 1.05 | 1.00 |
| `render2D()` per pointermove, panPlan | 1.05 | 1.00 |
| cost of one full `render2D()` | see correction below | — |
| model-canvas paints per move during a drag | 1.05 – 3.40 | **0** |
| dragWall gesture wall-clock (20 moves) | 640 ms | not a paint target — see below |
| dragItem gesture wall-clock (20 moves) | 448 ms | < 200 ms |
| `history.snap()` per drag gesture | 4 | 1 |
| `render2D()` in 3 s idle | 0 (see caveat) | 0 |
| 3D painted frames/s at idle | 0 | 0 (no change) |

Three facts drive the plan:

- **`dragWall` paints 3.4× per pointermove** — 68 `render2D()` calls for 20
  moves. `requestRender2D()` already exists and coalesces
  ([plan2d.js:1041](js/plan2d.js:1041)) but is called from **exactly 5 places,
  all inside `plan2d.js`**; the 330 call sites across 25 other files all call
  `render2D()` directly and bypass it. That is the 3.4. **dragWall is the
  target for the coalescing work — dragItem is already at 1.05.**
- ~~**One full `render2D()` costs about 19 ms.**~~ **This was wrong** — it was
  panPlan's 393 ms ÷ 21 paints, but the harness awaits a `requestAnimationFrame`
  between synthetic moves, so any 20-move gesture has a ~333 ms floor no matter
  what a paint costs. Directly timed, a full `render2D()` is **0.48 ms** model /
  0.02 ms HUD on the harness's 4-wall room, and **3.6 ms model / 0.1 ms HUD** on
  a 16-room, 64-wall, 48-item plan. The canvas split is still right, but for a
  different reason than stated: the payoff is the **~30× ratio**, and the fact
  that only the model half grows with the model. Two consequences: the
  "< 8 ms per paint" target was meaningless, and **the dragWall < 250 ms
  wall-clock target is unreachable by any paint work** while the harness inserts
  a frame per move. That row needs a different gesture driver, not more
  optimization.
- **`history.snap()` still runs 4× per drag gesture** — confirmed, unchanged
  from the old baseline.

**Idle caveat.** Idle now measures 0 paints, where the stale baseline showed 8.
Nothing was fixed: `ensureMEPAnim` / `ensureWarnAnim` / `ensureAngleGuideAnim`
([plan2d.js:106](js/plan2d.js:106), [:141](js/plan2d.js:141),
[:1955](js/plan2d.js:1955)) are self-cancelling and only run when there is a
live warning or MEP flow to animate. The old harness scene had one and the
current one does not. A plan with a single unresolved constraint warning still
pays a **full plan repaint at 22 Hz, forever** — and taxes every frame of every
drag on top. Do not treat the 0 as evidence the HUD split is unnecessary; treat
it as a hole in the harness, and have Q1 add a warning-glow idle case.

Non-findings, so nobody "fixes" them: `detectRooms()` is already memoized
([geometry.js:1240](js/geometry.js:1240), `roomListCache`), and 3D idle already
renders on demand at 0 painted frames/s.

---

## Corrections to the layer model

### Hit priority, not pickability

The original spec says `isLayerPickable(id) = (workSet === id)`, which makes
walls unclickable while furnishing — then says structure stays "pickable +
locked" so the inspector still works. Both cannot hold.

The right primitive is **rank**, not a boolean:

```
layerRank(id) →  0   focused (work set, or workSet === "all")
                 1   visible but off-work-set
                 ∞   ghosted or hidden — genuinely unhittable
```

Hit tests still run over every rank-0 and rank-1 layer; **the first rank-0 hit
wins outright**, and rank-1 is consulted only when every focused layer misses.
Off-work-set objects therefore still select and still fill the inspector, but
never start a drag (`canDrag()` requires rank 0).

This is what fixes the actual bug: a TV against a wall wins the pick because
furniture is rank 0, without walls becoming invisible to the mouse.

### No default-on structure lock

`layers.structure.locked = true` by default is counterproductive under a work
set. While furnishing, structure is already undraggable by rank, so the lock
does nothing. The moment you switch the work set *to* structure, it is
guaranteed to be in the way — your first action is always "unlock". Friction
placed exactly where it is never wanted.

`S.lockStruct` keeps its `false` default ([state.js:275](js/state.js:275)) and
keeps its 5 consumers via the getter/setter alias. The pill then only appears
for explicitly-locked things, where it is informative.

### Snap filtering starts minimal

Do **not** ship the full snap policy table. Dropping `midpoint`/`corner` while
furnishing removes centering a sofa on a wall — a top-tier furnishing snap.
Ship only: hidden layers contribute no candidates, and MEP contributes none
outside the MEP work set. `snapKinds` stays the user's control. Tune from use.

---

## Wave 0 landed — the API you actually import

`js/layers.js`, `js/state.js` and `tests/layers.test.mjs` are done and green
(1333 tests pass). **Read this before writing any consumer.**

**The layer table lives in `state.js`, the policy lives in `layers.js`.**
`state.js` cannot import `layers.js` without a cycle, so if `layers.js` installed
the table at load, `S.layers` would read as `undefined` in any module that
touches it without importing `layers.js`. Hence: `LAYER_IDS` and
`defaultLayers()` are exported from **`state.js`** (`LAYER_IDS` is re-exported
from `layers.js` too, so either import works); every predicate comes from
**`layers.js`**.

Exports of `js/layers.js`: `LAYER_IDS`, `resetLayers`, `layerOf`, `layerState`,
`isLayerVisible`, `isLayerGhosted`, `isLayerHidden`, `isLayerLocked`,
`layerRank`, `canDrag`, `canDelete`, `layerAllowsSnapKind`, `initLayers`,
`saveLayers`.

Behaviour worth knowing:

- `layerRank` checks `pickOverride` **first** in both directions, then
  visibility, then focus. An unknown layer id ranks `Infinity` — it fails closed.
- `canDrag` object-lock semantics deliberately mirror `targetLocked` in
  `interaction.js`: a multi-selection counts as locked only when *every* ref is,
  and `kind: "room"` reads `S.roomMeta[ref].locked` because a room selection's
  `ref` is a key, not an object. `canDelete` delegates to `canDrag` but is a
  separate export so H1 has a seam to diverge at.

**Corrected `lockStruct` sites** (the earlier numbers in this plan were stale by
13–23 lines — there are **7** reads across 2 files, not 5):
[interaction.js:3597](js/interaction.js:3597), [:3621](js/interaction.js:3621),
[:3711](js/interaction.js:3711), [:3732](js/interaction.js:3732),
[:4870](js/interaction.js:4870) (the `L` shortcut), and
[ui.js:656–667](js/ui.js:656) (`setLockStruct`) plus
[ui.js:2948](js/ui.js:2948) (the toolbar action). The accessor covers all of
them, including the non-boolean writes (`!!on`, `!S.lockStruct`).

**Known gap, for X2 in particular.** `layerAllowsSnapKind` filters by *snap
kind*, and `corner` / `midpoint` / `onwall` deliberately map to no layer — that
is exactly what keeps centring a sofa on a wall alive while furnishing. The
consequence: **hiding structure does not stop it offering corner snaps.** If
hidden structure must stop contributing, `beginSnapSession(layerFilter)` has to
filter candidates by their *source* layer at index-build time, not by kind.
Do that in the index, not by widening the kind table.

---

## Performance work

### P1 — Invert the paint default

One edit fixes 330 call sites. Rename the immediate painter to `render2DNow()`
and make the **exported `render2D()` the coalescing one**. Then audit the small
set that genuinely needs a synchronous canvas — the plan PNG export
([ui.js:3907](js/ui.js:3907)), `video_studio.js`'s `plan.toDataURL`, and any
test that reads pixels right after a mutation — and point those at
`render2DNow()`.

Expected: **dragWall 3.40 → 1.00** paints/move (the big one), dragItem
1.05 → 1.00, no behaviour change anywhere.

### P2 — Split the plan into a model canvas and a HUD canvas

This replaces the five-band cache. `index.html` has one `<canvas id="plan">`
([index.html:683](index.html:683)); add `<canvas id="plan-hud">` stacked over it
with identical sizing and transform.

- **Model canvas** — underlay, grid, reference floor, rooms, items, slab voids,
  walls, openings, nodes, MEP geometry, markers. Repaints **only** when the
  model or the view transform changes.
- **HUD canvas** — everything that tracks the pointer or animates: selection
  chrome, snap flash and glyphs, align guides, wall probe, stack host, angle
  guide, snap guides, MEP flow phase, warn glow, plan cursors, touch readout,
  the unlock pill. Repaints per frame, cheaply, over an untouched model image.

`render2D()` spans [plan2d.js:374](js/plan2d.js:374)–683. There is **no single
clean cut line** — an earlier draft of this plan claimed the tail from ~474 was
purely HUD, and that is wrong. Here is the verified map; split by this list, not
by a line number:

| line | call | canvas |
|--:|---|---|
| 400 | `drawSiteUnderlay` | model |
| 401 | `drawBlueprintUnderlay` | model |
| — | grid loop (inline, 402–427) | model |
| 428 | `drawReferenceFloor` | model |
| 429 | `drawCachedRooms` | model |
| 432 | `drawSlabOpenings` | model |
| — | items loop (inline, 434–440) | model |
| — | walls / openings loops (inline, 441–450) | model |
| — | `drawSegPreview` (inline, 451–453) | **HUD** |
| 455 | `drawWallProbe` | **HUD** |
| 457 | `drawSnapFlash` | **HUD** |
| 459 | `drawNodes` | model |
| 461 | `drawMEP` + `ensureMEPAnim` | model geometry, **HUD** flow phase |
| 464 | `drawMarkers` | model |
| 465 | `drawPlanCursors` | **HUD** |
| 467 | `drawWarnGlow` + `ensureWarnAnim` | **HUD** |
| ~474 | stack-host outline (inline) | **HUD** |
| ~497 | align guides (inline) | **HUD** |
| 519 | `drawWallCons` | model |
| 520 | `drawWallAngleGuide` + `ensureAngleGuideAnim` | **HUD** |
| ~523 | snap guides (inline) | **HUD** |
| 574 | `drawWalker` | **HUD** |
| 663 | `drawSnapMark` | **HUD** |
| 665 | `drawMeasureOverlay` | **HUD** |
| 678 | `drawNorth` | either — put it on the HUD, it is cheap |
| 680 | `drawTouchGuide` | **HUD** |

Three traps in that table, all of which a naive line-number split gets wrong:

- `drawPlanCursors` (465) and `drawWarnGlow` (467) are HUD but sit **above**
  most model draws. They must move down into `renderHUD()` regardless of
  position.
- `drawMEP` (461) is split down the middle: the pipe/cable geometry is model,
  but `mepFlowPhase` is what animates. Either pass the phase only on the HUD
  pass, or draw static MEP geometry on the model canvas and the flowing dashes
  on the HUD. Read the function before choosing.
- `drawWallCons` (519) is model (constraint annotations are part of the
  document) even though it sits deep in the HUD-heavy region.

Verify your split empirically: with the HUD canvas hidden, the model canvas
alone must look like today's plan minus selection chrome, guides and cursors.

**Drag proxy.** For the duration of a gesture, the dragged object is excluded
from the model canvas and drawn on the HUD. The model canvas then paints **zero
times** across a whole furniture drag.

**Export regression — do not miss this.** Four places read the plan canvas's
pixels directly and would silently export the model layer only once the canvas
is split: [ui.js:3908](js/ui.js:3908) (the "download 2D plan PNG" button) and
[video_studio.js:449](js/video_studio.js:449), [:484](js/video_studio.js:484),
[:528](js/video_studio.js:528). Each needs to composite model + HUD into one
offscreen canvas first. There is no `render2D()` immediately followed by a pixel
read anywhere in `js/` (checked), so these are the whole set — but `ui.js` and
`video_studio.js` are **not yours**: fix the compositing behind a helper you
export from `plan2d.js` (e.g. `planImageCanvas()`), and report the call sites
for U1 to repoint in wave 2.

Selection chrome is currently inline in `drawItem`/`drawWall`/`drawNodes`
(verified). Moving it to the HUD means those functions take a `chrome: false`
flag on the model pass, and the HUD pass redraws just the selected object's
outline. Do not try to keep chrome on the model canvas and key the cache on
selection — that reintroduces a full repaint on every click.

Expected: model-canvas paints per move → **0** for the whole of any drag, and
an animated warning glow stops costing a full ~19 ms plan repaint per frame.
This is the item that actually decides whether dragging feels smooth: at ~19 ms
a paint, P1 alone still leaves one full repaint on every move.

### P3 — Shared spatial index for hits and snaps

`snapPoint()` ([interaction.js:1208](js/interaction.js:1208)) rebuilds its
candidate set from scratch on every pointermove — a full pass over
`usedNodes()`, `S.markers`, `S.walls`, `S.items`. The `hit*` functions scan the
same arrays linearly. Both run per move.

Add `js/spatial_index.js`: a uniform grid over the plan, cell size derived from
the median wall length, holding `{kind, id, aabb}` records. Built lazily,
invalidated by model mutation (same hooks that already call `render2D`).

- `beginSnapSession(layerFilter)` builds/reuses the index with off-layer kinds
  omitted, so a furniture drag never considers MEP nodes at all.
- `query(x, z, r)` returns the candidate records for the cells in range.
- `hit*` and `snapPoint` both go through it; `layerRank` orders the results.

Expected: the bulk of the dragItem 546 ms.

### P4 — One history snapshot per gesture

The harness measures **4** `history.snap()` calls per 20-move drag. `snap()` is
a `JSON.stringify` of the entire project ([history.js:128](js/history.js:128)) —
spatial, workspace, parametric, MEP, smarthome. The drag pattern is documented
as capture-on-pointerdown / commit-on-pointerup
([history.js:606](js/history.js:606)), so 4 is a bug, not a design. Find the
extra three and remove them.

### P5 — 3D pickable roots

Split `dyn` into `structureRoot` / `itemsRoot` / `mepRoot`, and change the two
planner raycasts — [view3d.js:2337](js/view3d.js:2337) and
[:2399](js/view3d.js:2399) — from `intersectObjects([dyn], true)` to a pickable
root list derived from the work set. That is the 3D half of the TV-vs-wall bug
and it also stops testing wall triangles on every 3D pointermove.

`buildMEP3D(group, THREE)` already takes its parent as a parameter
([mep.js:1284](js/mep.js:1284)) — only the caller in `view3d.js` changes.

**Leave RC / zombies / physics raycasts on the full `dyn` tree.**

**Do not** add `matrixAutoUpdate = false` on `structureRoot`. It saves
microseconds per frame on a few hundred meshes and buys a whole family of "the
wall didn't move after the edit" bugs. Cut.

### Out of scope, deliberately

Boot cost is the largest number in the baseline — 184 JS requests, 9.5 MB
uncompressed, 1389 ms TTI — and has nothing to do with layers. It gets its own
plan or it will swallow this one.

---

## Wave 1 landed

`js/layers.js` consumers are wired in 2D and 3D, and the plan canvas is split.
**1381 tests pass, 0 fail; `npm run check` clean.**

**P1** — `render2DNow()` is the immediate painter; the exported `render2D()`
coalesces, which fixed all 330 bypassing call sites at once. `<canvas
id="plan-hud">` added. Verified by pixel diff against HEAD on a deterministic
scene: composite vs. old with nothing selected is **0 differing pixels of
236 280**; the model canvas with a selection vs. without is **0** — selection no
longer touches the model canvas at all. Drag proxy measured at **2–3 model
paints per whole gesture**, and those are only the two bracket paints from
`setDragProxy`/`clearDragProxy`; zero occur during the moves.

**H1** — two-pass `runSelectPass(pass)`, each band wrapped in
`if (layerRank(id) === pass)`. Ordering preserved verbatim within a pass.
Intended behaviour change: a locked structure layer now refuses **delete** of
walls, corners, openings, rooms and slab voids; previously `lockStruct` blocked
the drag and the delete went through silently.

**V1** — `structureRoot` / `itemsRoot` / `mepRoot`; two rank-ordered raycasts.
Two landmines found: `initPhysicsForScene` and `updateSeeThrough` were the only
places iterating `dyn.children` **one level deep**, so nesting walls would have
killed the dollhouse cut and merged every wall into one physics body. Also: the
vendored three `intersect()` helper does **not** test `object.visible`, so
`root.visible = false` would still have produced hits — excluding roots from the
raycast *list* is the only mechanism that works, and a test now pins that claim
against the vendored file.

### Carried into wave 2 — do not lose these

1. **The drag proxy is built but not wired.** `interaction.js` must
   `import { setDragProxy, clearDragProxy } from "./plan2d.js"`, call
   `setDragProxy(S.sel)` right after `S.action` is set on pointerdown (item,
   wall and node drags), and `clearDragProxy()` on pointerup/cancel/abort.
   Anything that changes geometry *other than* the dragged object mid-gesture
   must `clearDragProxy()` first — the model image is deliberately frozen.
   **Until this is wired, the headline perf win is not in the app.**
2. **PNG/video export is still reading the raw canvas.** Repoint
   `js/ui.js:3866` and `js/video_studio.js:449`/`:484`/`:528` at
   `planImageCanvas()`. Gotcha: `ui.js:3875` computes dpr from
   `src.clientWidth`, which is `0` on an offscreen canvas and silently yields
   dpr 1 — read it from the live `#plan` element instead.
3. **3D has no select-only path.** With the default `furniture` work set,
   structure is rank 1, so openings can no longer be dragged in 3D and a rank-1
   click does nothing visible except fire `layers:blocked-drag`. **The layer UI
   is a hard dependency of this wave being usable, not a nicety.**
4. **`drawMEP` could not be split as P2 described.** It collapses a missing
   phase to `0` (`js/mep.js:1003`), so there is no geometry-without-flow call.
   P1 worked around it per-canvas via one predicate governing both the overlay
   and the animation loop. A `phase === false` geometry-only mode in `mep.js`
   would allow the intended split.
5. **`layers:blocked-drag` detail is `{sel, layer, reason, where}`** — reconciled
   across both panes; `where` is `"2d"` or `"3d"`.

### Wave 2 landed (U1, X2)

**The drag proxy is wired and the target is met.** Model paints across a
20-move gesture, measured with the harness anchor moved to `renderModel`:

| gesture | before | after |
|---|--:|--:|
| dragWall | 21 | **2** |
| dragItem | 21 | **2** |

The 2 are the bracket paints from `setDragProxy` / `clearDragProxy` — **zero
model paints during the moves**. Four mid-gesture mutations genuinely needed
handling: stacked children moved by `carryChildren()` (fixed by *widening* the
proxy at arm time, not clearing), `enforceLocks()` + `dragSolve()` moving
corners the drag never grabbed (an audit against the snapshot those paths
already take drops the proxy, and the drop *is* the repair),
`splitIntersectionWalls()`, and `weldNodes()` renumbering `S.nodes`.

`snapPoint` is 2.2–3.2× faster realistically, 4.0–9.4× warm. The gap is the
invalidation policy: every paint request marks the index stale, so a drag that
mutates geometry pays a rebuild per move. **Finer-grained invalidation is the
next win** and would recover the warm column.

Equivalence was proved by driving the real `snapPoint` twice per cursor
position — the reference run widens `planIndex.query` to the whole plane so
every pass degenerates to the linear scan it replaced — over ~15k positions
across two plans and two zooms, comparing the winner, `S.snapInfo.type` and the
full ranked `S.snapAlts`. The tests were shown to be *sensitive* by mutating
the source eight ways and confirming each is caught.

### Carried into wave 3 (Q1)

- **The harness's `dragWall` gesture has not dragged a wall since wave 1.** With
  the default `furniture` work set, structure is rank 1, `canDrag()` refuses,
  and the pointerdown falls into `blockedDrag` — the 20 following "moves" are
  the idle hover path, which is why the row still read a plausible 1.05.
  **Every dragWall number reported after wave 1 is therefore measuring a hover,
  not a wall drag**, and the plan's `dragWall 3.40 → 1.00` row cannot be read
  off the stock harness at all. Pin `S.workSet = "all"` (or `"structure"`) in
  that scenario before trusting the row again.
- **Move the harness `INSTRUMENT` anchor.** It hooks `export function
  render2D() {`, which is now the *coalescing* entry, so the column counts
  paint **requests**, not paints. Move it to `function renderModel() {`.
- Re-aim the dragWall wall-clock row (see the correction above).
- Add a warning-glow idle case — idle reads 0 only because the harness scene has
  nothing animating.
- V1's unverifiable-in-Node list: that the roots populate and render
  identically; **the dollhouse cut** (`updateSeeThrough`, highest risk); that a
  wall is still one physics body per wall; ghost opacity/depth and that
  repeated toggling leaks no materials; the TV-vs-wall pick itself.

---

## Agent plan

Nine agents, **Opus 5, medium effort**, in four waves. Waves are barriers:
every agent in a wave must land and pass gates before the next wave starts.

**File ownership is exclusive within a wave.** `js/interaction.js` (4950 lines)
and `js/plan2d.js` (3675 lines) are the contended files; the wave structure
exists mainly to serialize them.

### Preamble for every brief

Paste this into each agent prompt:

> Repo: `/Users/leonkhey/Documents/3dhome` — ModelForge, a local-first
> browser CAD/home-design app. **No build step, no framework, no bundler.**
> Plain ES modules loaded from `index.html`; all third-party libs vendored
> under `vendor/`. Read `AGENTS.md` first.
>
> **Gates — all must be green before you report done:**
> - `npm run check` — `module_check.mjs` (free-identifier walk),
>   `link_check.mjs` (every named import resolves), `comment_assertions.mjs`.
>   A single missing named export silently kills the entire front-end, and
>   `npm test` will not catch it. Never silence a `module_check` hit by adding
>   the name to `GLOBALS` unless it is a genuine platform global.
> - `npm test`
>
> **House style:** this codebase comments the *why*, densely, in prose. Match
> the surrounding density and voice. `comment_assertions.mjs` checks that
> comments' factual claims hold — do not write a comment asserting something
> you have not verified.
>
> **Touch only the files listed as yours.** If a change seems to require a file
> you do not own, stop and report it instead of editing it.

---

### Wave 0 — foundation (1 agent, blocking)

**L0 · layer policy engine**
Owns: `js/layers.js` (new), `js/state.js`, `tests/layers.test.mjs` (new).

Implement the pure policy module. No consumers yet — this wave ships logic and
tests only, and everything downstream imports from it.

- `S.layers.<id>` for the five ids `structure | furniture | mep | annotations |
  underlay`, each `{vis: "show"|"ghost"|"hide", locked, pickOverride,
  snapOverride, autoLock}`. `S.workSet` defaults to `"furniture"`;
  `S.workSetPinned` defaults false.
- `layerOf(kind)` — `wall|walls|node|nodes|room|opening|slabvoid` → structure;
  `item|items` → furniture; `mepNode|mepRun` → mep; `marker|con` → annotations.
- `layerRank(id)` → `0 | 1 | Infinity` per the rule above.
- `canDrag(sel)` — rank 0, layer unlocked, and the object itself not `locked`.
- `canDelete(sel)`, `isLayerVisible`, `isLayerGhosted`, `layerAllowsSnapKind`.
- `S.lockStruct` becomes a getter/setter alias of `layers.structure.locked`,
  **default `false`**. Verify the 5 existing consumers still work:
  [interaction.js:3620](js/interaction.js:3620), [:3644](js/interaction.js:3644),
  [:3734](js/interaction.js:3734), [:3755](js/interaction.js:3755),
  [ui.js:656](js/ui.js:656).
- `initLayers()` restores vis/lock/workSet/overrides from `localStorage`,
  following the pref pattern in [cad_hud.js](js/cad_hud.js).

`layers.js` must import from **nothing** in `js/` except `state.js` — every hit
module will import *it*, so any back-edge is a cycle that `module_check` will
flag.

Tests: the mapping table; rank for focused / unfocused / ghost / hide;
`canDrag` for locked layer vs locked object; the `lockStruct` alias in both
directions; overrides beating the work set.

---

### Wave 1 — four agents, disjoint files

**P1 · paint coalescing + HUD canvas**
Owns: `js/plan2d.js`, `index.html`, `css/styles.css`.

Implements **P2 and P1** above, in that order (do the canvas split first; the
coalescing audit is easier once the two passes are separate).

1. Rename the immediate painter to `render2DNow()`; make the exported
   `render2D()` coalescing. Audit and repoint the sync callers
   ([ui.js:3907](js/ui.js:3907) — read only, report it, do not edit `ui.js`;
   list it for wave 2).
2. Add `<canvas id="plan-hud">`, sized and transformed identically by
   `sizeCanvas()` ([plan2d.js:152](js/plan2d.js:152)).
3. Split the tail of `render2D()` from [plan2d.js:474](js/plan2d.js:474) into
   `renderHUD()`. Move selection chrome out of `drawItem`/`drawWall`/`drawNodes`
   behind a `chrome` flag.
4. Point `ensureMEPAnim` / `ensureWarnAnim` / `ensureAngleGuideAnim` at
   `requestRenderHUD()` instead of `requestRender2D()`.
5. Gate the draw bands on `isLayerVisible` / `isLayerGhosted` (ghost ≈ 0.35
   alpha).
6. `pickCon()` ([plan2d.js:3578](js/plan2d.js:3578)) lives in your file — gate
   it on `layerRank("annotations")`.

Also run `node tools/perf_harness.mjs` before and after and report both idle
paints and dragItem paints/move.

**H1 · 2D pick priority and lock policy**
Owns: `js/interaction.js`, `js/markers.js`, `js/mep.js`, `js/slab_openings.js`,
`js/constraint_engine.js`, `js/elevation.js`.

- Every `hit*` returns null for rank-`Infinity` layers:
  [interaction.js:136](js/interaction.js:136) (`hitNode`, `hitOpening`,
  `hitItem`, `hitWall`, `hitRoom`), [markers.js:309](js/markers.js:309),
  [mep.js:953](js/mep.js:953), [slab_openings.js:34](js/slab_openings.js:34),
  [constraint_engine.js:1096](js/constraint_engine.js:1096), plus
  `elevationHit*` and `pickErase` ([interaction.js:2188](js/interaction.js:2188)).
- Restructure the pointerdown chain to two passes: all rank-0 hits in today's
  order, then rank-1. Preserve the existing order *within* a rank — the marker
  comment at [interaction.js:3629](js/interaction.js:3629) explains why points
  precede items, and that reasoning still holds.
- `S.action` is only set when `canDrag(sel)`. A rank-1 hit selects and returns.
- Extend `targetLocked` ([interaction.js:2125](js/interaction.js:2125)) beyond
  items to structure and MEP.
- Hover in select-tool idle must not light rank-1 geometry.
- Fire a `layers:blocked-drag` event where a drag was refused — P-wave/U1 draws
  the pill; you do not create DOM.

Do **not** touch `js/plan2d.js`. Do **not** implement the snap policy table
beyond the two minimal rules above.

**V1 · 3D pickable roots**
Owns: `js/view3d.js`.

Implements P5. Split the roots, change the two planner raycasts to a pickable
root list, wire `root.visible` and ghosting from layer vis. `targetOf()`
([view3d.js:2385](js/view3d.js:2385)) additionally skips rank-1 items and
locked openings. `begin3DItemDrag` ([interaction.js:2818](js/interaction.js:2818))
must use `canDrag` — but that file is H1's, so report the one-line change
rather than making it.

Leave RC/zombies/physics on full `dyn`. No `matrixAutoUpdate` changes.

**X1 · spatial index module**
Owns: `js/spatial_index.js` (new), `tests/spatial_index.test.mjs` (new).

Build the module from P3 with **no wiring** — pure data structure plus tests.
Uniform grid, `build(records)`, `query(x, z, r)`, `invalidate()`, cell size from
median wall length with sane fallbacks for an empty or single-wall model. Tests
cover: empty model, one wall, 5000 items, a query spanning four cells, and
correctness against a brute-force scan on random input.

---

### Wave 2 — three agents

**X2 · wire the index**
Owns: `js/interaction.js`, plus invalidation hooks in `js/plan2d.js`.

Route `snapPoint()` and the `hit*` broad phase through `spatial_index.js`.
Add `beginSnapSession(layerFilter)` / `endSnapSession()` around gestures.
Verify identical snap results before and after on a non-trivial plan — this is
a pure optimization and must not change which snap wins.

**U1 · layers UI**
Owns: `js/ui_layers.js` (new), `index.html`, `css/styles.css`,
`js/i18n/en.js`, `js/i18n/he.js`, `js/ui.js`, `js/main.js`,
`js/planner_chrome.js`.

Chip strip in `#plan-tools` after `#lockStructBtn` — one chip per layer, name,
3-state eye, lock; the active chip is the work set. Shift-click eye = solo.
Expanded popover for overrides and `autoLock`. Keep `#lockStructBtn`, synced to
the structure chip. `Shift+1`…`Shift+5` for solo — **`1`–`5` stay `setTool`**.
The unlock pill DOM, listening for `layers:blocked-drag`. Double-click / double-tap
to unlock. `setTool()` sets the work set unless pinned. Amber `structure-live`
rim while structure is explicitly unlocked. Chips in compact-nav for mobile;
RTL-safe. Also repoint the sync `render2D` callers P1 reported.

**H2 · history snapshot cost**
Owns: `js/history.js`.

Implements P4. Instrument, find the extra `snap()` calls per gesture, cut to
one. Do not change the snapshot's *contents* — `snap()` deliberately includes
MEP and excludes display flags, and both are load-bearing
([history.js:128](js/history.js:128) comments).

---

### Wave 3 — verification (1 agent)

**Q1 · measure and verify**
Owns: `perf-baseline.json`, `perf-baseline.md`,
`tests/layers.browser.mjs` (new).

- `npm run ci` green.
- `node tools/perf_harness.mjs`, commit the regenerated baseline, and report
  every metric against the target table above. A missed target is a finding,
  not something to round off.
- Browser pass in a real browser (headless has no GPU — see `AGENTS.md`):
  drag a TV along a wall in 2D without grabbing the wall; click the wall and
  confirm the inspector still fills; MEP work set clicks through ghosted walls;
  `L` and the chip lock agree; the pill appears on a refused drag and
  double-click clears it; pan/zoom repaints the model canvas cleanly; 3D edit
  mode drags the TV, not the wall; and RC/zombie modes still pick geometry.

---

## Why this ordering

L0 blocks everything because it defines the vocabulary. Wave 1 is the whole
bug fix plus the two big perf wins, in four files that never overlap. Wave 2 is
the optimization wiring and the UI, both of which need wave 1's structure to
exist. Q1 is last because the perf claims are only worth anything measured
against the committed baseline.

The riskiest item is P1's canvas split — it is also the one with the largest
measured payoff, and it is confined to one agent and three files, so it can be
reverted on its own.
