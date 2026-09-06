# Work order — model editor perf follow-up

Post-implementation review of the `MODEL_EDITOR_PERF_PLAN.md` work. Tasks are
ordered; **do P0 first and do not batch it with anything else.**

**Current status: ALL CLOSED.** Every item below is done. Each behavioural
guard was validated by breaking the code it protects and confirming it fails.

Green at completion: `npm run check` clean · `npm test` **1520/1520** ·
browser suite **174/176** (the 2 failures are the pre-existing drawing-sheet
tests, verified failing at clean HEAD with this work stashed — not caused here).

### Measured outcome — `perf-baseline.md` section (e)

| gesture | updatePreview | buildPart | meshFeatureEdges | clearGroup | rebuildDoc | cloneDomain |
|---|--:|--:|--:|--:|--:|--:|
| hoverModel (20 moves) | **0** | **0** | **0** | 7 | **0** | **0** |
| openEditor (legacy) | 1 | 2 | 2 | 1 | 0 | **21** (was 28) |
| openCanonical | 1 | 2 | 2 | 1 | **1** (was 2) | **62** (was 83) |
| selectCanonical | 1 | 2 | 2 | 1 | **0** (was 1) | **0** (was 55) |

Hover does no geometry work at all. A canonical open rebuilds once, not twice.
A selection click no longer rebuilds the document.

Direct measurement of one `rebuildParametricDocument` on the canonical fixture:
**90 → 40 `structuredClone` calls**, **0.710 → 0.599 ms/run** (200 runs, warmed).
The clone count scales with feature and edge count, so the gap widens on real
documents.

---

## P0 — CLOSED. Verified by sabotage, not by reading.

> **Status: done.** Both items below are complete and each was validated by
> breaking the code it guards and confirming the guard fires. Evidence is
> recorded inline. Do not re-open without re-running the sabotage checks.
>
> Closing them turned up a third defect, now fixed — see F0.


### F0. `decoGroups` was reassigned, orphaning the exported handle (found + fixed)

`updatePreview()` and `closeModeler()` both did `decoGroups = []`. That is a
**reassignment**: the module binding points at a fresh array while
`window.cadDecoGroups`, captured once at module init, keeps pointing at the old
one. After the first `updatePreview()` the exported handle was permanently
stale and always empty.

This is a product defect in its own right — any external observer of
`window.cadDecoGroups` sees an orphaned array — and it was also a second,
independent reason the original isolation test was vacuous: it pushed entries
into the stale array while `refreshDecorations()` iterated the live one, so the
fabricated components were never decorated at all.

Fixed at both sites: `decoGroups.length = 0;` — truncate, never reassign.

### F1. The `THREE` late-binding regression — CLOSED (fix + guard, both verified)

`js/modeler.js` had, at module scope:

```js
var pickRaycaster = new THREE.Raycaster();
var pickPointer = new THREE.Vector2();
```

`THREE` is late-bound. `js/three_lazy.js` exports it as an **empty object**
until `loadThree()` resolves, and its header states the rule outright: *"any
code path that constructs a three object must be downstream of an `await
loadThree()`… every one of those call sites lives inside a function body."*
Constructing at module scope threw `TypeError`, `modeler.js` never finished
evaluating, and **the model editor did not open at all.**

| | clean HEAD | as implemented | after fix |
|---|--:|--:|--:|
| model editor browser tests | 62/62 | **26/62** | 62/62 |

**This came from the plan's own T4 wording** ("hoist … to module-level scratch
instances"). Not your error. The plan has been wrong here and is being
corrected.

**Already applied** — a lazy `pickScratch()` initialiser with both call sites
routed through it. Leave it in place.

**Guard added and verified.** `checkLateBoundThree` (`tools/module_check.mjs:363`)
resolves the local name of `THREE` imported from `three_lazy`, walks module-level
nodes while skipping function and class bodies, and flags `new THREE.*`. Wired
into the scan. Re-injecting the original bug produces:

```
js/modeler.js:
  module-scope instantiation of late-bound THREE (new THREE.Raycaster())  (first use 15866:21)
```

It is generic, so it protects every late-bound module rather than only this one.

Original task, for the record:

1. `tools/module_check.mjs` already walks every module. Extend it to fail on a
   **module-scope `new THREE.*`** in any file that imports `THREE` from
   `./three_lazy.js`. Top-level only — inside a function body is legal and is
   the norm. This is the cheap, permanent fix; it protects every late-bound
   module, not just this one.
2. Add a browser test asserting the editor opens and `window.cadPreviewView`
   exists. Any module-eval throw in `modeler.js` fails it.

**Acceptance:** revert the `pickScratch()` fix locally, confirm `npm run check`
*fails*, restore it. If check still passes, the guard does not work.

---

### F2. Behavioural tests — CLOSED, both validated by sabotage

Both tests existed but neither guarded anything. Rewritten and proven:

| sabotage applied | assertion that fired | was |
|---|---|---|
| all 3 `refreshDecorations()` → `updatePreview()` | `zero buildPart calls` — **actual 18, expected 0** | read 0 forever; dead |
| `E.buildComponent = entry.component` → `= null` | `second instance must NOT be decorated` — **actual 1, expected 0** | passed on broken code |

Two root causes, both fixed:

1. **The buildPart spy could not observe anything.** Every internal caller uses
   the local `buildPart` binding, so patching `window.cadBuildPart` was inert —
   and `buildPart` itself reassigned `window.cadBuildPart = buildPart` on every
   call, actively destroying any spy. Replaced with an in-module counter read
   through `window.cadBuildPartCount()`; the self-reassignment is deleted.
2. **The isolation test never hovered anything.** With no `E.hoverTopology`,
   `addFaceHighlights` painted nothing for either component, so
   `comp2 === 0` was trivially true — and it asserted only that half. It now
   drives a real hover through `window.cadSetHoverTopology()` against a part the
   editor actually built (a hand-rolled part yields no edges — the new positive
   control catches that), forces both entries dirty so the rebuild filter cannot
   mask the behaviour, and asserts **both** halves: comp1 lights, comp2 does not.

**The rule this establishes:** a new test on this branch is not done until it has
been shown to fail with its invariant removed. Both tests above passed on broken
code before this pass.

Original task, for the record:

`tests/modeler_perf.test.mjs` is ~90% `assert.match(modelerSource, /regex/)`.
It passed 1516/1516 **while the editor was completely dead.** That is the
problem, not a nitpick: the suite certified every task while the feature did
not load.

One test ("decoration group preserves part mesh identity") constructs an inline
mock and asserts against *that mock*. It exercises no product code and can never
fail for a real reason. Delete it.

Rewrite the file to assert behaviour. The two that matter, both named in the
plan and neither present:

1. **Hover does no geometry work.** Open the editor on a reference document,
   record disposals and part builds, drive a hover across the model, assert
   **zero part-geometry disposals and zero `buildPart` calls.** That is the
   invariant T3 buys and the one most likely to be silently undone later.
2. **Assembly multi-instance isolation.** Place two components off one library
   model, hover a face on one, assert the other's decoration group holds no
   highlight mesh. `E.buildComponent` is ambient state restored by hand in
   `refreshDecorations`; nothing else will catch a dropped restore.

Keep source-regex assertions only where they encode a rule with no runtime
signature (for example "no module-scope `new THREE.*`") — and prefer F1.1 for
that one.

---

## P1

### F3. Redo T5 properly — the signature memo is wrong and is shipping bugs

`fillInspector` was implemented as a value-signature memo rather than the
active-tab gating the plan specified. Two confirmed user-visible bugs:

- **Dimension edit.** `applyDimensionEditor()` changes `constraint.value` /
  `.driven` / `.name`, then calls `refreshAll()`. The signature carries only
  `constraints.length`, which does not change → early return → **the sketch pane
  keeps showing the old dimension value.**
- **Texture apply/clear.** `p.tex = url; updatePreview(); fillInspector();` —
  `tex` is not in the signature → the pane does not re-render. Same for
  `delete p.tex`.

`fillLook()` also renders display style, edge colours, light azimuth/elevation/
distance, section state and appearances — none of which are in the signature.
And **`fillInspector(true)` is never called anywhere**, so the `force` escape
hatch is dead code.

It also does not deliver the win: when the signature *does* change, all four
panes are still rebuilt.

**A reviewer has suggested patching the signature — adding `p.tex`, coordinates,
a `p.rev` counter. Do not do this.** The signature has to enumerate every field
every pane reads, across four panes, forever. It is already wrong in at least
five places after one pass. Each miss is a silently stale panel, which is worse
than a slow one. The failure mode is invisible in tests and invisible in review.

**Do this instead — the plan's T5, unchanged:**

1. Delete `lastInspectorSignature`, the `sig` computation and the `force`
   parameter.
2. `var inspectorDirty = { sketch: true, shape: true, look: true, ops: true };`
3. `fillInspector()` marks all four dirty, then fills **only** `activeTab("R")`
   and clears that one's flag.
4. `setTab(id)` — after the class toggles — fills the pane it activates if its
   flag is set, and clears it. **Both halves are required:** `setTab` currently
   only toggles a class, so gating without this shows a stale pane on switch.
5. Keep the `#mdSelName` update where it now is, above any early return. That
   part is correct.
6. Check `showModelerSheet` in `js/modeler_mobile.js` — the sheets *borrow* the
   real panels, so a borrowed pane must be filled even when it is not the active
   desktop tab.

**Acceptance:** ~4× fewer inspector DOM builds per `refreshAll`; edit a
dimension value and the sketch pane shows the new number; apply and clear a
texture and the pane re-renders; every tab is current when switched to, on
desktop and in the mobile sheets.

---

### F4. Restore `perf-baseline.md` / `.json`

The harness was run with `--only=modeler`, which **overwrites** the output.
Sections (a) server, (b) boot, (c) paint and (d) three are gone. Those are
referenced by `LAYERS_PERF_PLAN.md`.

1. Run the **full** harness (`node tools/perf_harness.mjs`, no `--only`) and
   restore all five sections.
2. Make `--only` merge into an existing baseline instead of replacing it, so
   this cannot happen again.
3. **Capture a before/after pair.** The current file has only "after" numbers,
   so none of the wins are demonstrable as deltas. Measure at the stash point
   and at HEAD.

**Also: the counters do not currently exercise the parametric path.**
`rebuildDoc` is **0 for every gesture, including `openEditor`**, which means the
harness document is not a canonical-authoring document — so **T10 and T11 are
entirely unmeasured.** Make the `openEditor` probe load a canonical document, or
say plainly in the baseline that those two rows are unverified.

Minor: the plan's acceptance criterion "`mdDispose` 0 on hover" is worded wrong.
`refreshDecorations` legitimately calls `clearGroup` per decoration group, which
is why hover shows 14. The criterion should read **zero *part-geometry*
disposals**. Fix the wording, do not chase the 14.

---

## P2 — Finish the partials

Do not record these as done; they are half-landed.

### F5. T2b is a partition, not a bucketing
Kernel edges were split into circle/line arrays. That halves a constant and
leaves the algorithm O(n²). Bucket by rounded radius (circles) and rounded
endpoint midpoint (polylines) as specified, sizing buckets so a hit cannot fall
outside its own, or probe neighbours. Preserve the existing tolerance
(`Math.max(0.45, measure * 0.04)`).

### F6. T2's cache misses every primitive
`var cacheKey = (part && part.meshData) || (mesh && mesh.geometry) || null;` —
for a part with no `meshData` the key is `mesh.geometry`, which `buildPart`
recreates on every rebuild, so the cache never hits for box/cyl/sph/ext. The
`meshFeatureEdges 0` in the baseline comes from T3 (hover no longer builds at
all), not from T2 — **T2's value is currently unproven.** Either key primitives
on something stable, or measure a non-hover path and confirm the cache earns
its keep. If it does not, say so.

### F7. T6 coalescing was not done
Rect caching landed, and the self-invalidating per-RAF cache is good — better
than what the plan specified, and `autoPanFrom` was correctly included. But the
**RAF coalescing of `pointermove` is missing**, so `resolveSketch()` still runs
per raw pointer event during a sketch-point drag. Copy the pattern from the 3D
hover path (`var queued = null, latestHoverEvent = null;`): keep only the newest
event snapshot, keep `pointerdown`/`pointerup` synchronous, and flush any
pending frame at the top of `pointerup`.

### F8. T13 remainder
The per-face node cache landed and is the main win. Still open: preallocate a
`Float32Array` from `NbTriangles() * 9` instead of `positions.push`, and replace
the O(faces × subshapes) `IsSame()` scan with a lookup.

---

## P3 — Nits, cheap

- **`coreRunFresh` is set unconditionally** in `openModeler`, including when
  `!isCanonicalAuthoring()`. `refreshAll` only clears it inside its
  `isCanonicalAuthoring()` branch, so it can survive and cause a later refresh to
  skip a rebuild it needed. Set it only on the canonical path.
- **`window.addEventListener("resize", …)` in `createEditorView` is never
  removed.** Repeated view creation (language change → `destroyDOM`/`buildDOM`)
  accumulates listeners. Return a disposer or use the existing teardown.
- **T4 behaviour change, confirm intended:** during `facePick`, `hoverAssemblyTopology`
  now receives `null` instead of computing a handle hit, so an instant-3D handle
  no longer suppresses topology hover in face-pick mode. Probably an improvement.
  Decide deliberately rather than by accident.

---

## Separate track — cabinet designer

**Different file, different feature, not perf work.** Do not fold this into the
model editor branch. It surfaced because `ui_cabinet_inspect.js` has the same
teardown shape as `fillInspector`.

### F9. `changed()` destroys focus (real, moderate — the reported severity is overstated)

`api.changed()` in `js/ui_cabinet.js:853` calls `fillInspector`, `fillLook`,
`fillTechnical`, `fillHardware`, `fillChecks` and `fillBOM`, each of which wipes
its container with `innerHTML = ""`.

**Correction to the report:** it claims keystrokes are lost while typing. They
are not — `numInput` (`js/ui_cabinet_ctx.js:338`) commits on **`change`**, not
`input`, so typing never triggers a teardown. The real defect is narrower:
committing with **Enter** fires `change` while the field still holds focus, the
DOM is destroyed under it, and focus resets to `<body>` — so Tab afterwards
restarts from the top of the document instead of moving to the next field.

Fix by preserving and restoring focus across `changed()` (record
`document.activeElement`'s stable id and selection range, restore after the
rebuild), or — better and in line with F3 — rebuild only the panel that the edit
affects.

### F10. Guard the empty-column case

`js/ui_cabinet_inspect.js:197-203`:

```js
var col = sp().cols[E.sel.col];
if (!col) { E.sel = { col: 0, sec: 0 }; col = sp().cols[0]; }
if (E.sel.sec != null && !(col.kind && col.kind !== "normal")) {   // throws if cols is empty
```

**Honest scoping:** I could **not** demonstrate a reachable path. `delColumn`
guards with `if (cols.length <= 1) return;`, so the UI cannot empty the list.
This is hardening against a malformed or imported spec, not a confirmed crash —
so treat it as cheap defence, not an incident.

It is worth doing because the file is already inconsistent: line 60 uses
`col && col.secs[...]` and line 470 uses `if (!col || …)`, but line 203 does
not. Make it match: `if (col && E.sel.sec != null && …)`, and decide what the
panel shows when there are no columns rather than falling through.

---

## Order of work

| step | tasks | why this order |
|---|---|---|
| 1 | F1, F2 | a guard and real tests, before anything else moves |
| 2 | F3 | it is shipping visible bugs today |
| 3 | F4 | restores a shared artifact others depend on |
| 4 | F5–F8 | finish what is half-done |
| 5 | F9, F10 | separate branch, separate review |

Run after every step:

```bash
npm run check && npm test
```

Run before calling any step done:

```bash
node --test --test-concurrency=3 tests/model_editor_desktop.browser.mjs tests/model_editor_layout.browser.mjs
```

**Note:** two failures in `tests/model_editor_drawing.browser.mjs` ("a sheet
opens on the standard views…" and "drawing mode hides tree toggle…") are
**pre-existing** — verified failing at clean HEAD with the perf work stashed.
They are not yours and not caused by this work. Do not chase them here.

---

## Completion record

Everything below was open when this order was written. All of it is now done.

| item | outcome |
|---|---|
| **F0** `decoGroups` reassignment | fixed — `length = 0`, handle stays live |
| **F1** late-bound `THREE` guard | `checkLateBoundThree` in `module_check`; verified by re-injecting the bug |
| **F2** behavioural tests | both rewritten; each proven to fail under sabotage |
| **F3** T5 active-tab gating | landed as `inspectorDirty`; signature and `force` gone |
| **F4** baseline + canonical coverage | 5 sections restored; `--only` merges; **new canonical fixture + 2 gestures** |
| **F5** O(n²) edge matching | bucketed; **0 mismatches** against a full scan over 25 real rebuilds |
| **F6** primitive cache misses | measured and closed as correct — see below |
| **F7** 2D pointermove coalescing | landed (RAF + flush on `pointerup`) |
| **F8** kernel meshing | node cache landed; positions conversion **deliberately declined** — see below |
| **F9** cabinet focus loss | landed (focus restore + Enter commit) |
| **F10** empty-column guard | fixed in both `fillHits` and the inspector pane |
| **T9** split `refreshAll` | selection slice done: `refreshSelection()` |
| **P3** `coreRunFresh` leak | fixed — cleared outside the canonical branch |

### Two items closed by deciding *not* to do them

Both are documented in code so they are not "finished" into a bug later.

**F6 — primitives are deliberately not cached.** Measured cost of the pass the
cache avoids: box 12 tri **0.04 ms**, cylinder 192 tri **0.40 ms**, kernel body
2000 tri **3.76 ms**, kernel body 8000 tri **15.46 ms**. The expensive case keys
on `meshData` and does hit. Caching primitives would need a hand-rolled value
signature over every field the entries depend on — the same trap F3 removed —
and a miss is a silently stale edge overlay. Not worth 0.4 ms.

**F8 — `positions` stays a plain Array.** Converting it to `Float32Array` would
save the push boxing, but `meshData` rides into localStorage through
`saveLib()` → `JSON.stringify`, where a typed array serialises as
`{"0":..,"1":..}` — a saved model would reload with no usable geometry. Six
readers also still gate on `Array.isArray`. The real win here was the per-face
node cache (~6× fewer WASM crossings), which landed.

### Test seams added to `js/modeler.js`

`window.cadBuildPartCount()`, `window.cadRebuildDocCount()`,
`window.cadSetHoverTopology()`. These exist because the previous attempt at
instrumentation could not observe anything: every internal caller uses the local
binding, and `buildPart` was overwriting its own `window` handle on each call.

### The rule this work established

**A test is not done until it has been shown to fail with its invariant
removed.** Three tests on this branch passed on broken code before that rule was
applied, and one source-regex test broke the moment a counter was added a line
above the pattern it matched — it has been replaced with a behavioural
equivalent.

---

## Follow-up: the open-path clone cost

`openCanonical` was left at `cloneDomain 83` when the work order was first
closed. Traced by attributing every `structuredClone` to its caller, rather than
guessing. Two redundant layers, both removed:

**1. `topologyItem()` cloned a descriptor every caller had just built.**
`js/core/topology.js` did `descriptor: clone(descriptor)` while all 18 call
sites pass a fresh object literal and keep no reference to it — **32 clones per
rebuild of a two-feature document**, scaling with edge count. Removed.

That makes sibling descriptors share nested point objects (`middle`, `base`,
`axis` in `cylinderTopology`), which is safe only while descriptors stay
read-only. Verified: there is no `descriptor.<field> =`, no
`Object.assign(x.descriptor, …)` and no `delete x.descriptor.<field>` anywhere
in `js/`; the two places that replace a descriptor swap the whole object.
`tests/topology_descriptor_immutability.test.mjs` now enforces that — validated
against all three mutation shapes, and two of them slipped through the first
version of the pattern because it did not allow brackets in an object path.

**2. `legacyReference()` cloned references that were already private.**
`js/core/schema.js` deep-cloned each reference inside `migrateDefinition`, which
had already done `raw = cloneDomain(source)` three lines earlier and never
touches `raw.references` again — and whatever survives is handed to
`createDefinition()`, which deep-clones references once more. Three copies of
every reference per migrate; now one.

**What is left is not redundant.** The remaining ~40 clones are
`createDefinition()` building the canonical document one field at a time. That
is the copy that makes the document independent of its source, which is the
whole point of the call. Stopping here.