# Issue: Shell of a lofted/drafted body produces an invalid solid, and every later boolean loses the body

Status: **open, blocking** HOUSING at Planchard book step 377 (Boss-Stop), branch `planchard`.
Found: 2026-09-14. Guard commit: `bf54618` (makes the failure loud; does not fix it).

## Summary

HOUSING's history is:

`Base Extrude → Boss-Loft1 → Boss-Battery → Shell1 → Boss-Stop`

Every step through Boss-Battery gives a valid solid. **Shell1** is built with OpenCascade's `BRepOffsetAPI_MakeThickSolid.MakeThickSolidByJoin`, removing the Base Extrude's front face at a 0.254 cm inside wall. It returns a solid whose volume looks right (917.011 cm³) but which fails `BRepCheck_Analyzer`.

The next feature, Boss-Stop, fuses a thin ring onto Shell1. The fuse "succeeds" but returns only a 37.781 cm³ tube (the Base Extrude section plus the ring); Boss-Loft1 and Boss-Battery disappear. Before `bf54618` the rebuild reported success. Now:

- Shell1 carries a `warning` issue `invalid-solid`.
- Boss-Stop fails with `regeneration-failed`: "OpenCascade union lost material (917.011 and 11.371 cm³ gave 37.781 cm³); an input solid is likely invalid".

**The fix needed:** Shell1 must yield a *valid* solid for this body, so the Boss-Stop union gives ≈ 926.2 cm³ and the rest of HOUSING can be built.

## Geometry (all lengths cm, part frame; Front Plane is z = 0, +Z toward the front)

| Step | Definition | Exact result |
|---|---|---|
| Base Extrude | Circle Ø 11.1125 (4.375 in) on Front Plane, blind 3.302 (1.300 in) forward | cylinder z 0 → 3.302, 320.251 cm³, 3 faces |
| BatteryLoftPlane | Offset 3.302 from Base Extrude start face (z = 0, normal −Z) | plane at z = −3.302 |
| Boss-Loft1 | Loft from Sketchcircle (Ø 11.1125 on the start face) to Sketchsquare (on BatteryLoftPlane: 7.874 wide × top 4.064, R 1.27 fillets, round bottom R 5.556), merge | tool 276.095 cm³, 13 faces (B-spline sides); union 596.346 cm³, 14 faces |
| Boss-Battery | Face sketch = Copy face boundary of the loft's back cap (11 entities), extrude 11.176 (4.400 in) away, 1° draft inward, merge | tool 759.329 cm³ (cone/B-spline faces); union 1355.676 cm³, 25 faces, **valid** |
| Shell1 | Shell, thickness 0.254 (.100 in), Inside, remove Base Extrude `face:end` (z = +3.302, normal +Z), join Arc, tolerance 1e-4 | 917.011 cm³, 26 faces, 1 solid, **INVALID** |
| Boss-Stop tool | Front Plane: converted circle R 5.3023 (Shell1 inner edge) + circle Ø 13.0175 (5.125 in); extrude 0.254 forward (z 0 → 0.254) | ring 11.371 cm³, 4 faces |
| Boss-Stop union | Shell1 ∪ ring | **37.781 cm³, 8 faces** (expected ≈ 917.011 + 11.371 − 2.20 overlap ≈ 926.18 cm³) |

The expected Boss-Stop bounds are 130.175 × 130.175 × 177.8 mm.

## Diagnosis so far (run in the page with the real kernel)

The invalid shape comes straight from `shellBrep` (`js/cad_kernel.js`, `MakeThickSolidByJoin`).

- `BRepCheck_Analyzer(shape).IsValid_2()` = false. Exactly **one face** is invalid, plus its shell and solid; all edges and vertices are valid.
- The invalid face is the inner offset cylinder: radius 5.3023, axis (0,0,−1) at the origin, V range [−3.302, −0.0589], so it spans z 0.0589 → 3.302. Area 108.043 cm². One wire.
  - It stops **0.589 mm short** of z = 0, where the Base Extrude meets the loft. That junction is G0/tangent: the loft's first section is the Base Extrude's circular edge.
  - `BRepCheck_Face` on it: IntersectWires, ClassifyWires and OrientationOfWires all return `BRepCheck_NoError`. The failure is therefore in the face/shell consistency, not the wire, and is most likely the gap or overlap with the neighbouring offset B-spline loft face.
  - The status list could not be read: `BRepCheck_ListIteratorOfListOfStatus_2` isn't exposed in this opencascade.js build.
- Boss-Battery's union (the shell's input) **is valid**.

### Attempts that did NOT give a valid solid

| Attempt | Result |
|---|---|
| Fuse with `SetFuzzyValue` 1e-5 / 1e-4 / 1e-3 | same 37.781 cm³ |
| `ShapeFix_Shape` on Shell1, then fuse | volume becomes 1104.52 (wrong), fuse 1123.98 |
| `ShapeFix_Solid` | 1104.52, still invalid |
| `BRepLib.OrientClosedSolid` | still invalid, 917.011 |
| MakeThickSolidByJoin, join Arc, tolerance 1e-5 / 1e-4 / 1e-3 | all invalid, 917.011, fuse 37.781 |
| MakeThickSolidByJoin, join Intersection | throws (OCC exception) |
| `ShapeUpgrade_UnifySameDomain` on the body, then shell | body valid, shell invalid (938.915), fuse 37.781 |
| body − `BRepOffsetAPI_MakeOffsetShape(body, −0.254)` (then cut the opening) | inner offset invalid (198 cm³, should be ≈ 438) |
| `BRepLib.SameParameter_2(shape, 1e-5, true)` | not run: binding expects 4 args |
| `rotationalShell` fallback | not applicable: it needs coaxial plane/cone/cylinder faces |

## Suspected cause

OpenCascade's join offset mishandles the **tangent junction between the extrude's cylinder and the loft's B-spline side faces**. There may also be a contribution from the 1° drafted faces of Boss-Battery meeting the loft. The inner offset cylinder is trimmed at the wrong place (0.589 mm short). The offset loft face probably overlaps or misses it, so the sewn shell is not closed or consistent, although it has one solid and a plausible volume.

## Where the code is

- `js/cad_kernel.js`
  - `shellBrep`: MakeThickSolidByJoin → `shapeIsValid` → `rotationalShell` fallback → otherwise returns `{ …, invalid: "…" }`.
  - `booleanBrep`: volume-plausibility guard via `booleanVolumePlausible`.
  - `validateBrepForExport`: an existing full validity/tolerance check that can be reused.
  - `shapeBounds`, `solidPieces`, `extractBrepTopology`.
- `js/cad_feature_tree.js`, `regenerateFeatures`: runs each lowered feature. A result with `.invalid` adds a `warning` issue `invalid-solid`; an exception becomes `regeneration-failed`.
- `js/core/kernel_feature_adapter.js`, `compileKernelFeatureTree` / `loweredFeature`: the shell lowers to `type: "shell"`; bosses lower to `extrude` tool + `union`.

## How to reproduce

### In the browser (fastest, real data)

1. Open http://localhost:8765. In the model editor, Library ▸ HOUSING (the saved record contains Boss-Stop as "Extrude / Boss 3").
2. In the page console:

```js
const tree = await import('/js/cad_feature_tree.js');
const adapter = await import('/js/core/kernel_feature_adapter.js');
const db = await new Promise(r => { const q = indexedDB.open('home3d_model_library'); q.onsuccess = () => r(q.result); });
const all = await new Promise(r => { const q = db.transaction('models').objectStore('models').getAll(); q.onsuccess = () => r(q.result); });
const h = JSON.parse(JSON.stringify(all.find(m => m.name === 'HOUSING')));
delete h.exactTopologyCache; h.parts.forEach(p => delete p.meshData);
const compiled = adapter.compileKernelFeatureTree(h);
const run = await tree.regenerateFeatures({ ...compiled.document, features: compiled.features });
console.log(run.ok, run.issues);   // expect: Shell1 invalid-solid warning, Extrude / Boss 3 regeneration-failed
tree.releaseRegeneration(run);
```

3. For each result, `kernel.shapeMassProperties(run.results.get(id))` (from `/js/cad_kernel.js`) and `new oc.BRepCheck_Analyzer(shape, true, false).IsValid_2()` give the numbers in the table above.

The Browser-pane profile has been wiped between sessions twice. If HOUSING is missing, it must be rebuilt through the UI from `docs/planchard/workflow-audit.md` (book steps 265–379). Export the library (Library ▸ Export library) once you have it.

### In node (for a regression test)

Build the same history without the UI, using the numbers in the table:

1. Cylinder R 5.55625, h 3.302 on +Z.
2. Loft to the Sketchsquare outline at z = −3.302, and fuse.
3. Drafted 1° extrude of that outline to z = −14.478, and fuse.
4. `shellBrep(body, 0.254, { facePersistentIds: [front cap] })`.
5. Fuse a ring (R 5.3023 → 6.50875, z 0 → 0.254).

The existing kernel tests show the helpers: `makeBrepPrimitive`, `makeBrepLoft`/`makeBrepExtrude`, `booleanBrep`, `shellBrep`, `extractBrepTopology`, `shapeMassProperties`. See `tests/cad_kernel_topology.test.mjs` and `tests/cad_lenscap_shell.test.mjs`. The Sketchsquare outline as typed segments is in the saved record: `features[Boss-Loft1].params.sectionSegments[0]`.

## Acceptance criteria

1. Shell1 on HOUSING yields a solid with `BRepCheck_Analyzer.IsValid_2() === true`.
   - Volume within 0.01 cm³ of the analytic thin wall: the current invalid solid reads 917.011; the true value should be close to that.
   - Wall 0.254 everywhere, front opening at z = 3.302.
   - Exact bounds 111.125 × 111.125 × 177.8 mm (`shapeMassProperties(...).bounds`, tolerance-free).
2. The Boss-Stop union gives a valid solid of ≈ 926.18 cm³, bounds 130.175 × 130.175 × 177.8 mm. The saved-record rebuild shows no `invalid-solid` or `regeneration-failed` issues.
3. No regressions: `npm test` (2,771+ tests) and `npm run check` stay green, including `tests/cad_lenscap_shell.test.mjs`, `tests/kernel_body_finish.test.mjs`, `tests/cad_pattern_merge.test.mjs`, `tests/planchard_shell_exact_bounds.test.mjs` and `tests/planchard_boolean_volume_guard.test.mjs`.
4. Keep the guards from `bf54618`: an invalid shell must never pass silently, and a boolean that loses material must still fail loudly.
5. Add a node regression test that builds the extrude → loft → drafted boss → shell → ring chain and asserts 1 and 2.

## Directions worth trying (not verified)

- **Other offset options:** `MakeThickSolidByJoin` with `Intersection = true` (the 7th argument, currently false), `SelfInter = true`, or `RemoveIntEdges = true` (the 9th argument). Also `BRepOffset_Pipe` mode. Check each with `IsValid_2`.
- **Per-face offset and sew:** offset each non-removed face with `BRepOffsetAPI_MakeOffset` / `BRepOffset_MakeOffset` face by face; trim against neighbours; sew outer and inner skins with `BRepBuilderAPI_Sewing`; `MakeSolid`; validate.
- **Rebuild the offset inner cylinder:** replace only the invalid face with an exact analytic cylinder trimmed to the loft's offset face, then `ShapeFix_Shell`/`ShapeFix_Solid` **only** if the volume is unchanged. A full ShapeFix changed the volume and is not acceptable.
- **Avoid the tangent seam:** check whether shelling each merged feature's tool separately and fusing the thin walls gives a valid result. The inner walls then must be booleaned consistently.
- **Newer kernel:** check whether a newer opencascade.js / OCCT fixes this offset case (OCCT 7.7+ has offset fixes around tangent B-spline faces).

Contact point for review: the Planchard session resumes HOUSING at Boss-Stop once this issue is fixed. See `docs/planchard/workflow-audit.md` → "Steps 367–379, Boss-Stop".
