import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeParametricHistory,
  applyHistoryToPreviewParts,
  createFeatureDefinition,
  createPartDocument,
  createSketchDefinition,
  reorderHistoryNode,
  setHistoryRollback,
  suppressHistoryNode,
  updateFeatureDefinition,
} from "../js/core/parametric_document.js";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";
import { createTopologyReference } from "../js/core/topology.js";
import { publishRebuildStatus, rebuildParametricDocument } from "../js/core/parametric_rebuild.js";
import { featureDefaults, featureEditorGroups, validateFeatureDefinition } from "../js/core/feature_catalog.js";

function constrainedRectangle(document) {
  return createSketchDefinition(document, {
    id: "sketch:base",
    name: "Base profile",
    referenceId: "plane:top",
    points: [
      { id: "p0", x: 0, y: 0, fixed: true },
      { id: "p1", x: 40, y: 0, fixed: true },
      { id: "p2", x: 40, y: 20, fixed: true },
      { id: "p3", x: 0, y: 20, fixed: true },
    ],
    entities: [
      { id: "e0", type: "line", a: "p0", b: "p1" },
      { id: "e1", type: "line", a: "p1", b: "p2" },
      { id: "e2", type: "line", a: "p2", b: "p3" },
      { id: "e3", type: "line", a: "p3", b: "p0" },
    ],
    constraints: [],
  });
}

test("part documents begin with units and stable reference geometry", () => {
  const document = createPartDocument({ id: "part:bracket", units: { length: "mm", precision: 2 } });
  assert.equal(document.context.units.length, "mm");
  assert.equal(document.context.units.angle, "deg");
  assert.ok(document.references.some((reference) => reference.id === "origin"));
  assert.ok(document.references.some((reference) => reference.id === "plane:top"));
  assert.throws(() => createSketchDefinition(document, {}), /explicit plane or face reference/);
});

test("a sketch and its consuming feature are first-class ordered history nodes", () => {
  const document = createPartDocument({ id: "part:base" });
  const sketch = constrainedRectangle(document);
  const feature = createFeatureDefinition(document, "extrude", {
    id: "feature:pad",
    references: { sketches: [sketch.id], features: [], topology: [], references: [] },
    params: { depth: 12, endCondition: "blind", profileEntityIds: ["e0", "e1", "e2", "e3"] },
  });
  assert.deepEqual(document.history.map((entry) => entry.kind), ["sketch", "feature"]);
  assert.equal(analyzeParametricHistory(document).ok, true);

  const rejected = reorderHistoryNode(document, "history:sketch:" + sketch.id, 1);
  assert.equal(rejected.ok, false);
  assert.deepEqual(document.history.map((entry) => entry.targetId), [sketch.id, feature.id]);
});

test("feature edits and suppression change intent without rewriting geometry", () => {
  const document = createPartDocument({ id: "part:editable" });
  const sketch = constrainedRectangle(document);
  const feature = createFeatureDefinition(document, "extrude", {
    id: "feature:pad",
    references: { sketches: [sketch.id], features: [], topology: [], references: [] },
    params: { depth: 10, profileEntityIds: ["e0", "e1", "e2", "e3"] },
  });
  updateFeatureDefinition(document, feature.id, { params: { depth: 25 } });
  assert.equal(feature.params.depth, 25);
  suppressHistoryNode(document, "history:feature:" + feature.id, true);
  assert.equal(feature.suppressed, true);
  assert.equal(document.history[1].suppressed, true);
});

test("kernel compilation lowers a cut into an explicit tool and boolean", () => {
  const document = createPartDocument({ id: "part:cut" });
  const baseSketch = constrainedRectangle(document);
  const base = createFeatureDefinition(document, "extrude", {
    id: "feature:base",
    references: { sketches: [baseSketch.id], features: [], topology: [], references: [] },
    params: { depth: 20, profileEntityIds: ["e0", "e1", "e2", "e3"] },
  });
  const cutSketch = createSketchDefinition(document, {
    id: "sketch:hole", name: "Hole", referenceId: "plane:top",
    points: [{ id: "hc", x: 20, y: 10, fixed: true }],
    entities: [{ id: "circle", type: "circle", c: "hc", r: 3, fixed: true }],
  });
  createFeatureDefinition(document, "extrudeCut", {
    id: "feature:hole",
    inputs: [base.id],
    references: { sketches: [cutSketch.id], features: [base.id], topology: [], references: [] },
    params: { endCondition: "through-all", depth: 30, profileEntityIds: ["circle"] },
  });
  const compiled = compileKernelFeatureTree(document);
  assert.equal(compiled.ok, true);
  assert.ok(compiled.features.some((feature) => feature.id === "feature:hole:tool" && feature.type === "extrude"));
  assert.ok(compiled.features.some((feature) => feature.id === "feature:hole" && feature.type === "subtract"));
});

test("kernel compilation lowers a hole wizard feature into a subtract tool", () => {
  const document = createPartDocument({ id: "part:wizard" });
  const baseSketch = constrainedRectangle(document);
  const base = createFeatureDefinition(document, "extrude", {
    id: "feature:block",
    references: { sketches: [baseSketch.id], features: [], topology: [], references: [] },
    params: { depth: 20, profileEntityIds: ["e0", "e1", "e2", "e3"] },
  });
  const holeSketch = createSketchDefinition(document, {
    id: "sketch:bore", name: "Bore", referenceId: "plane:top",
    points: [{ id: "hc", x: 20, y: 10, fixed: true }],
    entities: [{ id: "circle", type: "circle", c: "hc", r: 2, fixed: true }],
  });
  createFeatureDefinition(document, "hole", {
    id: "feature:bore",
    inputs: [base.id],
    references: { sketches: [holeSketch.id], features: [base.id], topology: [], references: [] },
    params: { diameter: 4, depth: 20, endCondition: "through-all", profileEntityIds: ["circle"] },
  });
  const compiled = compileKernelFeatureTree(document);
  assert.equal(compiled.ok, true);
  const tool = compiled.features.find((feature) => feature.id === "feature:bore:tool");
  assert.equal(tool && tool.type, "holeTool");
  assert.equal(tool.params.diameter, 4);
  assert.equal(tool.params.endCondition, "through-all");
  assert.ok(compiled.features.some((feature) => feature.id === "feature:bore" && feature.type === "subtract"));
});

test("rebuild is deterministic and publishes sketch/feature diagnostics", () => {
  const document = createPartDocument({ id: "part:deterministic" });
  const sketch = constrainedRectangle(document);
  const feature = createFeatureDefinition(document, "extrude", {
    id: "feature:pad",
    references: { sketches: [sketch.id], features: [], topology: [], references: [] },
    params: { depth: 10, profileEntityIds: ["e0", "e1", "e2", "e3"] },
  });
  const first = rebuildParametricDocument(document, {}, { now: 100 });
  const second = rebuildParametricDocument(document, {}, { now: 200 });
  assert.equal(first.ok, true);
  assert.equal(first.signature, second.signature);
  publishRebuildStatus(document, first);
  assert.equal(document.history.find((entry) => entry.targetId === feature.id).status, "rebuilt");
  assert.equal(document.sketches[0].status, "fully-defined");

  updateFeatureDefinition(document, feature.id, { params: { depth: 30 } });
  const edited = rebuildParametricDocument(document, {}, { now: 300 });
  assert.notEqual(first.signature, edited.signature);
});

test("rebuild publishes an under-defined sketch state from the solver's DOF", () => {
  const document = createPartDocument({ id: "part:under-defined" });
  const sketch = createSketchDefinition(document, {
    id: "sketch:free", referenceId: "plane:top",
    points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }],
    entities: [{ id: "line", type: "line", a: "a", b: "b" }],
    constraints: [{ id: "horizontal", type: "horizontal", entity: "line" }],
  });
  const run = rebuildParametricDocument(document);
  assert.equal(run.ok, true);
  assert.ok(run.issues.some((issue) => issue.code === "under-constrained-sketch" && issue.dof > 0));
  publishRebuildStatus(document, run);
  assert.equal(sketch.status, "partially-defined");
});

test("every canonical feature exposes grouped professional parameters", () => {
    /* loft is 7, not 8: "Closed loft" was removed when loft started producing
       a real body, because BRepOffsetAPI_ThruSections has no way to bend the
       last section back onto the first. A control the kernel ignores does not
       count as an exposed parameter. */
    const minimumFields = { extrude:9, extrudeCut:8, revolve:6, sweep:6, loft:7, fillet:4, chamfer:5, shell:5, pattern:8, mirror:3, boolean:3, hole:6, helix:6, thread:6, knurl:6, insert:4 };
  for (const [type, minimum] of Object.entries(minimumFields)) {
    const groups = featureEditorGroups(type);
    assert.ok(groups.length, type + " needs at least one parameter group");
    assert.ok(groups.flatMap((group) => group.fields).length >= minimum, type + " has too few editable parameters");
    assert.ok(Object.keys(featureDefaults(type)).length >= Math.min(2, minimum));
  }
});

test("extrusion direction and mid-plane intent lower into exact ranges", () => {
  const document = createPartDocument({ id:"part:extents" });
  const sketch = constrainedRectangle(document);
  createFeatureDefinition(document, "extrude", {
    id:"feature:reverse", references:{sketches:[sketch.id],features:[],topology:[],references:[]},
    params:{depth:20,offset:5,direction:"reverse",endCondition:"blind"},
  });
  let compiled = compileKernelFeatureTree(document).features.find((feature) => feature.id === "feature:reverse");
  assert.equal(compiled.params.from, 5);
  assert.equal(compiled.params.to, -15);
  updateFeatureDefinition(document, "feature:reverse", { params:{direction:"forward",symmetric:true,endCondition:"mid-plane"} });
  compiled = compileKernelFeatureTree(document).features.find((feature) => feature.id === "feature:reverse");
  assert.equal(compiled.params.from, -5);
  assert.equal(compiled.params.to, 15);
});

test("circular patterns compile total extent into an instance step", () => {
  const document = createPartDocument({ id:"part:pattern" });
  const sketch = constrainedRectangle(document);
  const seed = createFeatureDefinition(document,"extrude",{id:"feature:seed",references:{sketches:[sketch.id],features:[],topology:[],references:[]},params:{depth:5}});
  createFeatureDefinition(document,"pattern",{id:"feature:pattern",inputs:[seed.id],references:{sketches:[],features:[seed.id],topology:[],references:["axis:y"]},params:{mode:"circular",count:6,angle:360,radialDistance:25,equalSpacing:true,axis:"y",skipInstances:"2, 4"}});
  const pattern = compileKernelFeatureTree(document).features.find((feature) => feature.id === "feature:pattern");
  assert.equal(pattern.type,"circularPattern");
  assert.equal(pattern.params.angle,60);
  assert.equal(pattern.params.radialDistance,25);
  assert.deepEqual(pattern.params.skipIndices,[2,4]);
});

test("linear patterns compile independent axes and skipped copies into one bounded grid", () => {
  const document = createPartDocument({ id:"part:multi-axis-pattern" });
  const sketch = constrainedRectangle(document);
  const seed = createFeatureDefinition(document,"extrude",{id:"feature:seed",references:{sketches:[sketch.id],features:[],topology:[],references:[]},params:{depth:5}});
  createFeatureDefinition(document,"pattern",{
    id:"feature:pattern",inputs:[seed.id],references:{sketches:[],features:[seed.id],topology:[],references:[]},
    params:{mode:"linear",axisX:true,countX:3,spacingX:12,spacingIncrementX:3,axisY:true,countY:2,spacingY:-8,axisZ:false,skipInstances:"2"},
  });
  const pattern = compileKernelFeatureTree(document).features.find((feature) => feature.id === "feature:pattern");
  assert.equal(pattern.type,"linearGridPattern");
  assert.deepEqual(pattern.inputs,[seed.id]);
  assert.deepEqual(pattern.params.offsets,[
    {x:0,y:-8,z:0},
    {x:12,y:-8,z:0},
    {x:27,y:0,z:0},
    {x:27,y:-8,z:0},
  ]);
});

test("legacy linear pattern direction fields still lower to their chosen axis", () => {
  const document = createPartDocument({ id:"part:legacy-pattern-direction" });
  const sketch = constrainedRectangle(document);
  const seed = createFeatureDefinition(document,"extrude",{id:"feature:seed",references:{sketches:[sketch.id],features:[],topology:[],references:[]},params:{depth:5}});
  createFeatureDefinition(document,"pattern",{
    id:"feature:pattern",inputs:[seed.id],references:{sketches:[],features:[seed.id],topology:[],references:[]},
    params:{mode:"linear",count:3,spacing:8,directionAxis:"y",direction:{x:0,y:1,z:0}},
  });
  const pattern = compileKernelFeatureTree(document).features.find((feature) => feature.id === "feature:pattern");
  assert.equal(pattern.type,"linearGridPattern");
  assert.deepEqual(pattern.params.offsets,[{x:0,y:8,z:0},{x:0,y:16,z:0}]);
});

test("partial circular extents include both ends and preserve the selected axis", () => {
  const document = createPartDocument({ id:"part:x-axis-pattern" });
  const sketch = constrainedRectangle(document);
  const seed = createFeatureDefinition(document,"extrude",{id:"feature:seed",references:{sketches:[sketch.id],features:[],topology:[],references:[]},params:{depth:5}});
  createFeatureDefinition(document,"pattern",{
    id:"feature:pattern",inputs:[seed.id],references:{sketches:[],features:[seed.id],topology:[],references:["axis:x"]},
    params:{mode:"circular",count:3,angle:180,equalSpacing:true,axis:"x"},
  });
  const pattern = compileKernelFeatureTree(document).features.find((feature) => feature.id === "feature:pattern");
  assert.equal(pattern.type,"circularPattern");
  assert.equal(pattern.params.axis,"x");
  assert.equal(pattern.params.angle,90);
});

test("rollback and suppression drop later compiled features and hide baked preview operations", () => {
  const document = createPartDocument({ id: "part:history-preview" });
  const sketch = constrainedRectangle(document);
  const pad = createFeatureDefinition(document, "extrude", {
    id: "feature:pad",
    references: { sketches: [sketch.id], features: [], topology: [], references: [] },
    params: { depth: 20, profileEntityIds: ["e0", "e1", "e2", "e3"] },
  });
  const hole = createFeatureDefinition(document, "extrudeCut", {
    id: "feature:hole",
    inputs: [pad.id],
    references: { sketches: [sketch.id], features: [pad.id], topology: [], references: [] },
    params: { depth: 30, profileEntityIds: ["e0"] },
  });
  const fillet = createFeatureDefinition(document, "fillet", {
    id: "feature:fillet",
    inputs: [pad.id],
    references: { sketches: [], features: [pad.id], topology: [createTopologyReference(pad.id, "edge", pad.id + ":edge:x:top:front", { curve: "line" })], references: [] },
    params: { radius: 2 },
  });
  document.parts = [{
    id: "body",
    featureId: pad.id,
    kind: "ext",
    cuts3d: [{ featureId: hole.id, loop: [{ u: 0, v: 0 }, { u: 4, v: 0 }, { u: 4, v: 4 }, { u: 0, v: 4 }] }],
    exactOperations: [{ id: fillet.id, type: "fillet", amount: 2, suppressed: false }],
  }];
  setHistoryRollback(document, document.history.findIndex((entry) => entry.targetId === hole.id));
  let compiled = compileKernelFeatureTree(document);
  assert.ok(compiled.features.some((feature) => feature.id === pad.id));
  assert.equal(compiled.features.some((feature) => feature.id === hole.id || feature.id === hole.id + ":tool"), false);
  assert.equal(compiled.features.some((feature) => feature.id === fillet.id), false);
  let preview = applyHistoryToPreviewParts(document);
  assert.equal(!!document.parts[0].suppressed, false);
  assert.equal(document.parts[0].cuts3d[0].suppressed, true);
  assert.equal(document.parts[0].exactOperations[0].suppressed, true);
  assert.ok(preview.dirtyPartIds.includes("body"));

  setHistoryRollback(document, null);
  applyHistoryToPreviewParts(document);
  assert.equal(document.parts[0].cuts3d[0].suppressed, false);
  assert.equal(document.parts[0].exactOperations[0].suppressed, false);
  suppressHistoryNode(document, "history:feature:" + fillet.id, true);
  preview = applyHistoryToPreviewParts(document);
  assert.equal(document.parts[0].exactOperations[0].suppressed, true);
  assert.equal(document.parts[0].cuts3d[0].suppressed, false);
  compiled = compileKernelFeatureTree(document);
  assert.equal(compiled.features.some((feature) => feature.id === fillet.id), false);
  assert.ok(compiled.features.some((feature) => feature.id === hole.id || feature.type === "subtract"));
});

test("a fillet can be authored from a selected face, not only from edges", () => {
  const document = createPartDocument({ id: "part:fillet-face" });
  const sketch = constrainedRectangle(document);
  const pad = createFeatureDefinition(document, "extrude", {
    id: "feature:pad",
    references: { sketches: [sketch.id], features: [], topology: [], references: [] },
    params: { depth: 12, profileEntityIds: ["e0", "e1", "e2", "e3"] },
  });
  const fillet = createFeatureDefinition(document, "fillet", {
    inputs: [pad.id],
    references: {
      sketches: [],
      features: [pad.id],
      topology: [createTopologyReference(pad.id, "face", pad.id + ":face:top", { surface: "plane", semantic: "top" })],
      references: [],
    },
    params: { radius: 4 },
  });
  assert.equal(fillet.references.topology[0].kind, "face");
  assert.equal(fillet.params.radius, 4);
});

test("an extrude stored as params.sketchId plus from/to still compiles", () => {
  const document = createPartDocument({ id: "part:housing-base" });
  const sketch = constrainedRectangle(document);
  const feature = createFeatureDefinition(document, "extrude", {
    id: "feature:base",
    references: { sketches: [], features: [], topology: [], references: [] },
    params: { axis: "z", from: 0, to: 3.302, sketchId: sketch.id, profileEntityIds: ["e0", "e1", "e2", "e3"] },
  });
  assert.equal(validateFeatureDefinition(feature).filter((issue) => issue.severity === "error").length, 0);
  const compiled = compileKernelFeatureTree(document);
  assert.equal(compiled.ok, true, JSON.stringify(compiled.issues));
  const lowered = compiled.features.find((item) => item.type === "extrude");
  assert.equal(lowered.params.from, 0);
  assert.equal(lowered.params.to, 3.302);
  assert.equal(lowered.params.sketchId, sketch.id);
});
