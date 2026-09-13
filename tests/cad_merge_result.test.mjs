/* "Merge result" — the control extrude, revolve, sweep and loft all declared
 * and none of them wired.
 *
 * Before this, every additive feature made a body of its own whatever the box
 * said, so the option was a no-op on the four commonest features in the editor.
 * A merged feature now records its solid on the body it lands on (`merges3d`,
 * the additive mirror of `cuts3d`) and the exact rebuild fuses it there.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { featureDefaults, featureSpec } from "../js/core/feature_catalog.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { booleanBrep, disposeBrep, loadCadKernel, makeBrepExtrusion, makeBrepPrimitive } from "../js/cad_kernel.js";

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
/* Pure part geometry and the exact-kernel part recipe, split out of js/modeler.js. */
const partGeometry = readFileSync(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");

const volume = async (brep) => {
  const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
};

const solidCount = async (brep) => {
  const oc = await loadCadKernel();
  const explorer = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let n = 0;
  try { while (explorer.More()) { n++; explorer.Next(); } } finally { explorer.delete(); }
  return n;
};

const square = (half) => [{ u: -half, v: -half }, { u: half, v: -half }, { u: half, v: half }, { u: -half, v: half }];

/* --- the geometry a merge produces -------------------------------------- */

test("a merged boss is one solid with the plate, not two bodies that touch", async () => {
  // the shape the editor now builds: a 20x2x20 plate with a 6x6 boss 5 tall
  // grown off its top face, recorded on the plate rather than added beside it
  let plate = null, boss = null, fused = null;
  try {
    plate = await makeBrepPrimitive({ type: "box", x: -10, y: 0, z: -10, w: 20, h: 2, d: 20 });
    boss = await makeBrepExtrusion({ axis: "y", from: 2, to: 7, points: square(3) });
    fused = await booleanBrep("union", plate, boss);
    assert.equal(await solidCount(fused), 1, "the fusion is a single body");
    assert.ok(Math.abs(await volume(fused) - (800 + 180)) < 1e-6, "and it carries both volumes");
  } finally { [plate, boss, fused].forEach((entry) => entry && disposeBrep(entry)); }
});

test("the union the merged tree emits rebuilds the same single body", async () => {
  // exactly what rebuildFeatureTreeFromDocument now writes for a merged boss:
  // the host, the boss as its own extrude, and a union of the two
  const def = {
    featureVersion: 1,
    features: [
      { id: "plate", type: "box", name: "Plate", params: { x: -10, y: 0, z: -10, w: 20, h: 2, d: 20 }, inputs: [], references: [] },
      { id: "boss", type: "extrude", name: "Merged boss 1", params: { axis: "y", from: 2, to: 7, points: square(3) }, inputs: [], references: [] },
      { id: "merge", type: "union", name: "Merge 1", params: {}, inputs: ["plate", "boss"], references: [] },
    ],
  };
  const run = await regenerateFeatures(def);
  try {
    assert.ok(run.ok, JSON.stringify(run.issues));
    assert.equal(await solidCount(run.finalShape), 1);
    assert.ok(Math.abs(await volume(run.finalShape) - 980) < 1e-6);
  } finally { releaseRegeneration(run); }
});

test("a body that touches nothing cannot merge, so the option leaves it alone", async () => {
  // the rule mergeTargetBody enforces: no overlap, no second body to become
  let plate = null, floating = null, fused = null;
  try {
    plate = await makeBrepPrimitive({ type: "box", x: -10, y: 0, z: -10, w: 20, h: 2, d: 20 });
    floating = await makeBrepExtrusion({ axis: "y", from: 20, to: 25, points: square(3) });
    fused = await booleanBrep("union", plate, floating);
    assert.equal(await solidCount(fused), 2, "fusing them anyway would still be two lumps in one shell");
  } finally { [plate, floating, fused].forEach((entry) => entry && disposeBrep(entry)); }
});

/* --- the wiring ---------------------------------------------------------- */

test("every additive feature that offers the option consults it", () => {
  ["extrude", "revolve", "sweep", "loft"].forEach((type) => {
    assert.equal(featureDefaults(type).mergeResult, true, type + " still offers Merge result");
  });
  // one rule, stated once, and it is what decides whether a body is created
  assert.match(modeler, /function mergeTargetBody\(box, params\) \{/);
  assert.match(modeler, /params\.mergeResult === false \|\| params\.operation === "new-body"/);
  assert.match(modeler, /var host=mergeTargetBody\(partBounds\(part\),params\);/);      // extrude
  assert.match(modeler, /var revolveHost=mergeTargetBody\(partBounds\(revolved\),params\);/);
  assert.match(modeler, /var mergeHost=cutTarget\?null:mergeTargetBody\(kernelRecipeBounds\(type,params\),params\);/);
  assert.match(modeler, /var helixHost=mergeTargetBody\(kernelRecipeBounds\(type,params\),params\);/);
});

test("a merged sweep reaches the exact tree too, not only the viewport", async () => {
  // What emitPartMerges now writes for a merges3d entry with a kind: the swept
  // solid as its own feature and a union onto the host. Before this the branch
  // ran only for extruded hosts and skipped every kinded merge, so STEP export
  // and mass built a body the viewport did not show.
  const def = {
    featureVersion: 1,
    features: [
      { id: "plate", type: "box", name: "Plate", params: { x: -10, y: 0, z: -10, w: 20, h: 2, d: 20 }, inputs: [], references: [] },
      { id: "rod", type: "sweep", name: "Merged body 1", inputs: [], references: [], params: {
        profile: [{ x: -1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: -1, y: 1, z: 0 }],
        path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }], solid: true,
      } },
      { id: "merge", type: "union", name: "Merge 1", params: {}, inputs: ["plate", "rod"], references: [] },
    ],
  };
  const run = await regenerateFeatures(def);
  try {
    assert.ok(run.ok, JSON.stringify(run.issues));
    assert.equal(await solidCount(run.finalShape), 1, "the swept rod fuses into the plate");
    // 800 plate + a 2x2 rod 10 long, less the 2x1x10 of it already inside the plate
    assert.ok(Math.abs(await volume(run.finalShape) - (800 + 40 - 20)) < 1e-6, "actual " + await volume(run.finalShape));
  } finally { releaseRegeneration(run); }
});

test("every merge kind has an exact-tree recipe, and every part kind emits them", () => {
  assert.match(modeler, /function mergeFeatureRecipe\(merge\) \{/);
  assert.match(modeler, /return toolFeatureRecipe\(merge\);/);
  // emitted from the shared branch, so a boss merged onto a box is not dropped
  assert.match(modeler, /feature = emitPartMerges\(target, part, feature\);/);
  assert.doesNotMatch(modeler, /no analytic extrusion to emit/);
});

test("a merged solid is fused by the exact rebuild and shows the body needs it", () => {
  assert.match(partGeometry, /var merges = \(p\.merges3d \|\| \[\]\)\.filter/);
  assert.match(partGeometry, /await booleanBrep\("union", solid, addition\)/);
  assert.match(partGeometry, /if \(\(p\.merges3d \|\| \[\]\)\.some\(function \(entry\) \{ return !entry\.suppressed; \}\)\) return true;/);
  // and the exact feature tree says the same thing the viewport shows
  assert.match(modeler, /type:"union", name:"Merge " \+ \(mergeIndex\+1\)/);
});

test("sweep no longer offers a body choice it cannot make good on", () => {
  const sweep = featureSpec("sweep");
  assert.ok(sweep.parameters.operation.values.includes("new-body"), "\"new body\" is the un-merged answer");
  assert.ok(sweep.parameters.operation.values.includes("add"));
});

test("canonical successive bosses fuse through the current body history", async () => {
  const { createFeatureDefinition, createSketchDefinition, ensureParametricDocument } = await import("../js/core/parametric_document.js");
  const { compileKernelFeatureTree } = await import("../js/core/kernel_feature_adapter.js");
  const doc = ensureParametricDocument({ id: "merged-history" });
  const sketch = createSketchDefinition(doc, { referenceId: "plane:top" });
  const base = createFeatureDefinition(doc, "box", { params: { x:-10,y:0,z:-10,w:20,h:2,d:20 } });
  let head = base.id;
  for (const u of [-5, 5]) {
    const boss = createFeatureDefinition(doc, "extrude", {
      inputs:[head], references:{sketches:[sketch.id],features:[head]},
      params:{...featureDefaults("extrude"),axis:"y",offset:2,depth:5,points:square(1).map(p=>({u:p.u+u,v:p.v}))},
    });
    head=boss.id;
  }
  const compiled=compileKernelFeatureTree(doc);
  assert.deepEqual(compiled.issues,[]);
  assert.equal(compiled.features.filter(f=>f.type==="union").length,2);
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    assert.deepEqual(run.issues,[]);
    assert.equal(await solidCount(run.finalShape),1);
    assert.ok(Math.abs(await volume(run.finalShape)-840)<1e-6);
  } finally { releaseRegeneration(run); }
});

test("explicit separate-body extrusions never lower to a union", async () => {
  const { createFeatureDefinition, createSketchDefinition, ensureParametricDocument } = await import("../js/core/parametric_document.js");
  const { compileKernelFeatureTree } = await import("../js/core/kernel_feature_adapter.js");
  for (const options of [{mergeResult:false},{operation:"new-body"}]) {
    const doc=ensureParametricDocument({id:"separate"});
    const sketch=createSketchDefinition(doc,{referenceId:"plane:top"});
    const base=createFeatureDefinition(doc,"box",{params:{w:10,h:2,d:10}});
    const boss=createFeatureDefinition(doc,"extrude",{inputs:[base.id],references:{sketches:[sketch.id],features:[base.id]},params:{...featureDefaults("extrude"),...options,depth:5,points:square(1)}});
    const compiled=compileKernelFeatureTree(doc);
    assert.equal(compiled.features.find(f=>f.id===boss.id).type,"extrude");
    assert.equal(compiled.features.some(f=>f.type==="union"),false);
  }
});
