import test from "node:test";
import assert from "node:assert/strict";
import {
  createTopologyRegistry, resolveFeatureTopologyReferences, resolveTopologyReference,
} from "../js/core/topology.js";
import { resolvedSubshapeIds } from "../js/cad_feature_tree.js";

const line = (id, owner, x, semantic) => ({
  persistentId:id, ownerFeatureId:owner, kind:"edge", semantic,
  descriptor:{curve:"line", origin:{x,y:0,z:0}, axis:{x:0,y:1,z:0}, measure:10,
    bounds:{min:{x,y:0,z:0},max:{x,y:10,z:0}}},
});

test("a fillet keeps a lowered cut-tool edge when generated ordinals change", () => {
  const wanted = line("cut:tool:edge:generated:line:7", "cut", 2, "generated-7");
  const registry = createTopologyRegistry([
    line("base:edge:generated:line:7", "base", 2, "generated-7"),
    line("cut:edge:generated:line:7", "cut", 2, "generated-7"),
    line("cut:tool:edge:generated:line:6", "cut:tool", 8, "generated-7"),
    line("cut:tool:edge:generated:line:8", "cut:tool", 2, "generated-8"),
  ]);
  // The old ID is intentionally absent: this is the state after kernel names
  // shift. Its owner remains the authoring feature for dependency ordering.
  const resolved = resolveTopologyReference(wanted, registry);
  assert.equal(resolved.status, "rebound");
  assert.equal(resolved.topology.persistentId, "cut:tool:edge:generated:line:8");
  const feature = { id:"fillet2", name:"Fillet 2", type:"fillet", references:{topology:[wanted]} };
  const checked = resolveFeatureTopologyReferences(feature, registry);
  assert.equal(checked.issues.filter((issue) => issue.severity === "error").length, 0);
});

test("saved face bounds resolve two faces with the same plane, centre and area", () => {
  const descriptor = (halfWidth) => ({surface:"plane",origin:{x:0,y:10,z:0},normal:{x:0,y:1,z:0},measure:100,
    bounds:{min:{x:-halfWidth,y:10,z:-5},max:{x:halfWidth,y:10,z:5}}});
  const wanted = {kind:"face",ownerFeatureId:"cut",persistentId:"cut:face:generated:plane:4",
    semantic:"generated-4",descriptor:descriptor(5)};
  const registry = createTopologyRegistry([
    {kind:"face",ownerFeatureId:"cut",persistentId:"cut:face:generated:plane:8",semantic:"generated-8",descriptor:descriptor(10)},
    {kind:"face",ownerFeatureId:"cut",persistentId:"cut:face:generated:plane:9",semantic:"generated-9",descriptor:descriptor(5)},
  ]);
  const resolved = resolveTopologyReference(wanted, registry);
  assert.equal(resolved.status, "rebound");
  assert.equal(resolved.topology.persistentId, "cut:face:generated:plane:9");
});

test("rebound circular edges do not pass stale member IDs to the fillet kernel", () => {
  const reference = {kind:"edge",persistentId:"old:circle",memberPersistentIds:["base:old-rim:1","base:old-rim:2"]};
  const topology = {kind:"edge",persistentId:"cut:new-rim",memberPersistentIds:["cut:new-rim:1","cut:new-rim:2"]};
  assert.deepEqual(resolvedSubshapeIds([{status:"rebound",reference,topology}],"edge"),
    ["cut:new-rim","cut:new-rim:1","cut:new-rim:2"]);
  assert.deepEqual(resolvedSubshapeIds([{status:"exact",reference,topology}],"edge"),
    ["cut:new-rim","base:old-rim:1","base:old-rim:2"]);
});
