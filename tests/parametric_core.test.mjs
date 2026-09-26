import test from "node:test";
import assert from "node:assert/strict";

import { createDefinition, createParameter, migrateDefinition } from "../js/core/schema.js";
import { rebuildDefinition } from "../js/core/rebuild.js";
import {
  ensureParametricProject, ensureItemDefinition, rebuildItem,
  requestItemDimension, applyItemDimension, commitDefinition,
} from "../js/core/project.js";
import { refreshRuntimePlacement, runtimeCollisionRects } from "../js/core/runtime.js";
import { assignCabinetManufacturing, cabinetPartFeatureHistory, captureCabinetAdvancedDelta, mergeCabinetAdvanced } from "../js/core/cabinet_advanced.js";

test("copy migration accepts sub-centimetre CAD extents without weakening authored limits", () => {
  const migrated = migrateDefinition({ key: "thin-cad-copy", w: 3.81, d: .1524, h: 1.27, parts: [], features: [], sketches: [] });
  assert.equal(migrated.parameters.depth.value, .1524);
  assert.ok(migrated.parameters.depth.min <= .1524);
  const run = rebuildDefinition(migrated);
  assert.equal(run.issues.some((issue) => issue.code === "parameter-below-minimum"), false);
  const constrained = migrateDefinition({ w: 3.81, d: .1524, h: 1.27, parameters: {
    depth: createParameter("depth", .1524, { min: 1 }),
  } });
  assert.equal(constrained.parameters.depth.min, 1);
  assert.ok(rebuildDefinition(constrained).issues.some((issue) => issue.code === "parameter-below-minimum"));
});

function boxDefinition() {
  return createDefinition({
    id: "definition:test-box",
    name: "Test box",
    parameters: {
      width: createParameter("width", 120, { exposure: "planner", min: 30, max: 600 }),
      depth: createParameter("depth", 60, { exposure: "planner", min: 20, max: 120 }),
      height: createParameter("height", 90, { exposure: "planner", min: 30, max: 300 }),
    },
    features: [{
      id: "body", type: "box", name: "Body", inputs: [],
      params: { x0: -60, x1: 60, y0: 0, y1: "$height", z0: -30, z1: 30 },
    }],
    rules: {
      dimensions: { width: { min: 30, max: 600, continuous: true } },
      module: { parameter: "doorCount", dimension: "width", minSpan: 30, maxSpan: 70, minCount: 1, maxCount: 12, noun: "doors" },
      configuration: { doorCount: 2 },
      invariants: ["panelThickness", "hardwareSpacing"],
    },
  });
}

test("deterministic rebuild resolves parameters and reports broken history references", () => {
  const def = boxDefinition();
  const first = rebuildDefinition(def, { height: 110 }, { now: 42 });
  const second = rebuildDefinition(def, { height: 110 }, { now: 42 });
  assert.equal(first.ok, true);
  assert.equal(first.signature, second.signature);
  assert.equal(first.resultList[0].params.y1, 110);

  def.features.push({ id: "bad-cut", type: "cut", name: "Bad cut", inputs: ["missing"], params: {} });
  const broken = rebuildDefinition(def, {}, { now: 43 });
  assert.equal(broken.ok, false);
  assert.ok(broken.issues.some((issue) => issue.code === "missing-feature-reference"));
});

test("planner resizing changes a driving parameter and proposes a new configuration when spans break", () => {
  const state = { items: [], parametric: null };
  ensureParametricProject(state);
  const item = { id: 1, type: "wardrobe", x: 10, z: 20, rot: 0, w: 120, d: 60, h: 220, definitionId: "definition:test-box", parameterOverrides: { width: 120, depth: 60, height: 220 }, configuration: { doorCount: 2 } };
  state.items.push(item);
  state.parametric.definitions[item.definitionId] = boxDefinition();

  const proposal = requestItemDimension(state, item, "width", 240, {});
  assert.equal(proposal.status, "proposal");
  assert.equal(proposal.code, "configuration-change");
  assert.ok(proposal.alternatives.some((choice) => choice.configuration.doorCount >= 4));
  const choice = proposal.alternatives[0];
  applyItemDimension(state, item, proposal, choice.id, {});
  assert.equal(item.w, 240);
  assert.equal(item.parameterOverrides.width, 240);
  assert.equal(item.configuration.doorCount, choice.configuration.doorCount);
  assert.deepEqual(state.parametric.definitions[item.definitionId].rules.invariants, ["panelThickness", "hardwareSpacing"]);
});

test("instances share one definition while keeping placement and parameter overrides local", () => {
  const state = { items: [], parametric: null };
  ensureParametricProject(state);
  const def = boxDefinition();
  state.parametric.definitions[def.id] = def;
  const a = { id: "a", type: "box", definitionId: def.id, x: 0, z: 0, rot: 0, w: 120, d: 60, h: 90, parameterOverrides: { width: 120, depth: 60, height: 90 } };
  const b = { id: "b", type: "box", definitionId: def.id, x: 300, z: 50, rot: 90, w: 180, d: 60, h: 90, parameterOverrides: { width: 180, depth: 60, height: 90 } };
  state.items.push(a, b);
  rebuildItem(state, a, {});
  rebuildItem(state, b, {});
  assert.equal(ensureItemDefinition(state, a, {}), ensureItemDefinition(state, b, {}));
  assert.equal(a.w, 120);
  assert.equal(b.w, 180);

  const edited = migrateDefinition(def);
  edited.features[0].name = "Edited shared body";
  const committed = commitDefinition(state, edited);
  assert.deepEqual(committed.affected.map((item) => item.id).sort(), ["a", "b"]);
  assert.equal(state.parametric.definitions[def.id].revision, 2);
});

test("runtime projection updates placement without rebuilding CAD history", () => {
  const state = { items: [], parametric: null };
  ensureParametricProject(state);
  const item = { id: "runtime", type: "box", x: 0, z: 0, rot: 0, w: 120, d: 60, h: 90, parameterOverrides: { width: 120, depth: 60, height: 90 } };
  state.items.push(item);
  rebuildItem(state, item, { w: 120, d: 60, h: 90, label: "Box" });
  const signature = state.parametric.derived[item.id].signature;
  const before = state.parametric.runtime[item.id].collision[0];
  item.x = 250;
  refreshRuntimePlacement(state, item);
  const after = state.parametric.runtime[item.id].collision[0];
  assert.equal(state.parametric.derived[item.id].signature, signature);
  assert.equal(after.x0 - before.x0, 250);
});

test("imported history-free objects are explicitly classified as direct-only", () => {
  const direct = migrateDefinition({ key: "cm_imported", name: "Imported mesh", parts: [], sketches: [], features: [] });
  assert.equal(direct.authoringMode, "direct-only");
  assert.ok(direct.references.some((reference) => reference.id === "plane:front"));
});

test("advanced cabinet parts survive later composition rebuilds in canonical history", () => {
  const baselineParts=[{id:"cabpart:side:1",featureId:"feature:cabpart:side:1",kind:"box",x0:-90,x1:-88.2,y0:0,y1:220,z0:-30,z1:30,name:"Side"}];
  const baselineSketches=[{id:"sketch:cabinet-front",name:"Cabinet front",plane:"front",offset:30,points:[],entities:[],constraints:[]}];
  const edited={parts:structuredClone(baselineParts),sketches:structuredClone(baselineSketches)};
  const brace={
    id:"advanced:brace",featureId:"feature:advanced:brace",kind:"ext",axis:"frame",
    frame:{origin:{x:0,y:40,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:0,z:-1},normal:{x:0,y:1,z:0}},
    from:0,to:3,pts:[{u:-25,v:-3},{u:25,v:-3},{u:25,v:3},{u:-25,v:3}],holes:[],name:"Authored brace",color:"#777777",metal:.1,rough:.7,
  };
  edited.parts.push(brace);
  edited.sketches.push({id:"sketch:advanced-brace",name:"Brace sketch",plane:"top",referenceId:"plane:top",offset:40,points:[],entities:[],constraints:[]});
  const delta=captureCabinetAdvancedDelta(edited,baselineParts,baselineSketches);
  const resizedParts=[{...baselineParts[0],x0:-120,x1:-118.2}];
  const mergedParts=mergeCabinetAdvanced(resizedParts,delta,"Part"),mergedSketches=mergeCabinetAdvanced(baselineSketches,delta,"Sketch");
  assert.equal(mergedParts.find((part)=>part.id==="cabpart:side:1").x0,-120,"unmodified semantic parts still regenerate");
  assert.ok(mergedParts.some((part)=>part.id==="advanced:brace"));
  assert.ok(mergedSketches.some((sketch)=>sketch.id==="sketch:advanced-brace"));
  const featureRun=cabinetPartFeatureHistory(mergedParts.find((part)=>part.id==="advanced:brace"));
  assert.equal(featureRun.features[0].id,"feature:advanced:brace");
  assert.deepEqual(featureRun.features[0].params.frame,brace.frame);
  assert.equal(delta.requiresManufacturingReview,true);
  assignCabinetManufacturing(brace,{role:"panel",materialRole:"board"});
  edited.parts[edited.parts.length-1]=brace;
  const classified=captureCabinetAdvancedDelta(edited,baselineParts,baselineSketches);
  assert.equal(classified.requiresManufacturingReview,false);
  assert.equal(classified.manufacturing.complete,true);
  assert.ok(classified.manufacturing.total>0);
  assert.equal(classified.manufacturing.nesting.unplaced.length,0);
  assert.ok(classified.manufacturing.nesting.sheets.length>0);
});

/* The three in-home game modes (lava, RC, Night Shift) build their collision
   from this map, so a record for a piece that is no longer in the plan becomes
   solid, invisible geometry to climb and walk into. rebuildProject() prunes the
   map, but nothing guarantees every caller re-derives after swapping the model
   out — the start screen's own scene swaps did not. */
test("collision rects come only from items still in the plan", () => {
  const state = {
    items: [{ id: 7 }],
    parametric: {
      runtime: {
        7: { collision: [{ x0: 0, x1: 10, z0: 0, z1: 10, y0: 0, y1: 40 }] },
        99: { collision: [{ x0: 500, x1: 510, z0: 500, z1: 510, y0: 0, y1: 200 }] },
      },
    },
  };
  const rects = runtimeCollisionRects(state);
  assert.equal(rects.length, 1, "the deleted item contributes nothing");
  assert.equal(rects[0].x0, 0);

  const padded = runtimeCollisionRects(state, { pad: 2 });
  assert.equal(padded[0].x0, -2);
  assert.equal(padded[0].x1, 12);

  assert.deepEqual(runtimeCollisionRects({ items: [], parametric: state.parametric }), []);
  assert.deepEqual(runtimeCollisionRects(null), []);
});
