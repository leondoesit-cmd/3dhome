# CAD Undo memory in the vanity and rolled-hinge workflow

## What was reported, and what it does not prove

Edge showed one ModelForge tab at about 2.1 GB and another at 739 MB during vanity and hinge work. A tab's memory figure alone does not distinguish a leak from expected one-time costs, so each candidate was measured separately against a baseline.

Measurements used a real windowed Chrome 156.0.8078.80 (the engine Edge 156 shares) on this Windows 11 machine with an RTX 5070 Ti and the WebGPU backend. Each run used a fresh profile. The app was served by the repo's own static server, and the driver used CDP. Every reading forces three `HeapProfiler.collectGarbage` passes first. It then records `Runtime.getHeapUsage` (JS heap used) and the Windows private bytes of the renderer process hosting the tab. Process figures move by up to ±100 MB between readings, so only large, repeated differences are reported.

## Costs that are expected and unchanged

| State | JS heap | Tab private bytes |
| --- | ---: | ---: |
| Planner booted, nothing opened | 32–48 MB | 640–690 MB |
| After building and exactly solving a 13-tab rolled hinge | 140–155 MB | 1,320–1,440 MB |

The 739 MB tab is consistent with an ordinary planner tab. The first exact CAD operation adds roughly 650–800 MB to the tab. That covers the compiled OpenCascade module the page keeps (84.6 MB of compiled WASM code in a heap snapshot), the exact-CAD worker and its native heap, and the 3D preview. When the idle worker was terminated, about 160 MB of private bytes was released. The client already does this after 10 idle minutes. This document does not change any of these costs.

Two repetition probes found no leak:

- **Assembly switching.** Eight cycles of open assemblies → Vanity/Door/Vanity/Door/Vanity → close. The heap settled at 202–204 MB (+0.3 MB per cycle) and the tab stayed at 810–830 MB.
- **Hinge authoring.** Eight cycles of new sketch → extrude → sheet metal → rolled hinge tabs (exact) → two undo/redo pairs → close. The heap went 276.5 → 278.7 MB and the tab stayed at 1,320–1,360 MB.

## The problem: every Undo step stored a full copy of embedded hinge caches

The modeler's history snapshot is `JSON.stringify({d: E.def, a: E.assembly})`, and the history keeps up to 60 steps (61 nodes). The vanity in this workflow has two carcass sides, two tops and two Door subassemblies, each with a panel and the saved rolled hinge. Its snapshot was **8.0 MB**, and 7.8 MB of that was derived data from the two embedded hinges: `exactTopologyCache` (5.9 MB) and `meshData` (1.9 MB). Moving a door changes none of it, but each placement edit stored another 8 MB string. A heap snapshot after the earlier hinge session showed the closed modeler's history `nodes` map holding 7.6–10 MB `snap` strings.

### Controlled A/B

Both arms used the same scripted workflow from a fresh profile. The script builds and saves the hinge part, creates the Door (panel + hinge) and the Vanity, saves both, and reloads. It then reopens the Vanity and applies 60 edits through the door's **Apply placement** button, followed by 10 Undos, then closes the modeler. The control arm served `js/modeler.js` with the three changed calls reverted, through CDP request interception. Nothing else differed.

| Vanity session | Control: JS heap | Control: tab private | Fixed: JS heap | Fixed: tab private |
| --- | ---: | ---: | ---: | ---: |
| Reopened, 0 edits | 115 MB | 700 MB | 116 MB | 881 MB |
| 10 placement edits | 233 MB | 897 MB | 141 MB | 866 MB |
| 30 placement edits | 389 MB | 1,056 MB | 178 MB | 962 MB |
| 60 placement edits | 652 MB | 1,375 MB | 224 MB | 1,000 MB |
| After 10 Undos | 672 MB | 1,352 MB | 238 MB | 942 MB |
| Modeler closed | 673 MB | 1,287 MB | 238 MB | 855 MB |

Across 60 edits the control heap grew by 537 MB (about 8.9 MB per edit) and the fixed heap by 108 MB. The script also timed the synchronous `Apply placement` click. That took 67.5 s in total for the control arm (1.13 s per edit) and 21.2 s for the fixed arm (0.35 s per edit). Both arms ended with the door at the same position, and Undo brought back the same hinge mesh and the same 27-entry topology cache.

The fixed build then made 120 more edits in the same tab. The heap went from 200 to 229 MB by edit 60, then stayed between 229.3 and 229.5 MB through edit 120. Growth stops at the history cap. In the control arm the same cap allows about 61 full copies, roughly 500 MB per open vanity session. History also stays in memory after the modeler closes, until another document opens. Together with the kernel cost above, this accounts for a tab well above 2 GB, though the user's exact session was not replayed.

A heap snapshot of the fixed arm after closing shows the 61-node history map retaining 9.4 MB in total. The largest remaining items are a fixed number of whole-vanity copies of about 8 MB each: the library cache, the assembly baseline, the recovery draft and its baseline JSON. They do not grow with edits.

## Fix

`createHistorySnapshotCodec` in `js/core/history_value_pool.js` uses the existing content-interning history value pool. Values under `meshData` and `exactTopologyCache` that serialize to at least 4 KB are stored once, and the snapshot holds a `@model-history:N` token instead. Decoding still uses `JSON.parse`, so every Undo or Redo gets fresh objects and a later live edit cannot change an older state. The modeler's history `onChange` releases pooled values that no retained snapshot refers to. Starting a new session (`H.clear()`) therefore empties the pool. A token whose value was released decodes as missing derived data, never as a string where an object belongs.

The history object index (`scanDoc`) still sees a changed signature exactly when the mesh content changes, because identical content always maps to the same token.

## Scope and limitations

- Only edits that leave an embedded body's mesh and exact topology unchanged share them. Examples: placements, mates, names and visibility in an assembly, and sketch or property edits in a part before a rebuild. A geometry edit still stores one copy of each distinct mesh state, up to the history cap.
- Each snapshot still serializes the caches in order to compare them by content, so the CPU cost of `JSON.stringify` remains. The faster edits match the history object index parsing a few kilobytes per step instead of 8 MB, and the lower GC pressure, but the click time was not profiled further.
- Only the CAD modeler's history uses the codec. The planner and cabinet histories are unchanged.
- The one-time kernel cost and the fixed per-document copies (library cache, baselines, drafts) were measured but not changed.
- The measurements come from one machine and browser build. The edit timings include load from other sessions' test runs on the same machine. Edge's own figures were not captured.
- The 2.1 GB figure was not replayed exactly. The fixed build was confirmed only for the scripted workflow above: assembly placement edits, then exact hinge undo/redo in part mode.

## Tests

```powershell
node --test tests/cad_undo_memory.test.mjs
```

The first test checks the codec. Sixty vanity snapshots store the two hinges' caches once. Decoded states are independent. Small caches stay inline, and tokens under other keys are untouched. Releasing values works, and a released token decodes as missing data. The second test runs the modeler's actual `snapDoc` and history code in a VM over a synthetic vanity. After 60 placement edits, 61 nodes retain less than two plain snapshots' worth of bytes; before the fix this was 24.1 MB, about 60 copies of a 0.4 MB snapshot. It then checks that Undo restores the transform and embedded caches, that Redo returns to the edited state, and that a new session empties the pool.
