import test from "node:test";
import assert from "node:assert/strict";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";
import { captureExactTopology } from "../js/core/exact_topology_cache.js";
import { rebuildParametricDocument } from "../js/core/parametric_rebuild.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";

const reference = (edge, authoringOwner) => ({
  type:"topology-reference",kind:edge.kind,ownerFeatureId:authoringOwner || edge.ownerFeatureId,
  persistentId:edge.persistentId,descriptor:structuredClone(edge.descriptor),signature:edge.signature,
});

async function exactRun(document) {
  const compiled = compileKernelFeatureTree(document);
  assert.equal(compiled.ok, true, JSON.stringify(compiled.issues));
  const run = await regenerateFeatures({ ...compiled.document, features:compiled.features });
  return { compiled, run };
}

test("a changed base depth needs exact topology restoration before downstream fillets are reported", async () => {
  const base = {id:"base",name:"Base",type:"extrude",inputs:[],references:{topology:[]},params:{
    points:[{u:-3.429,v:-3.429},{u:3.429,v:-3.429},{u:3.429,v:3.429},{u:-3.429,v:3.429}],
    axis:"y",from:0,to:10.414,depth:10.414,sketchId:"profile",profileEntityIds:["e0","e1","e2","e3"],
  }};
  base.references.sketches=["profile"];
  const sketch={id:"profile",name:"Top Plane sketch",plane:"top",referenceId:"plane:top",offset:0,
    points:base.params.points.map((point,index)=>({id:"p"+index,x:point.u,y:point.v})),
    entities:base.params.points.map((point,index)=>({id:"e"+index,type:"line",a:"p"+index,b:"p"+((index+1)%4),construction:false})),
    constraints:[]};
  const document = {id:"fresh-depth-edit",kind:"part",sketches:[sketch],features:[base],parts:[{id:"body",kind:"ext",featureId:"base"}]};
  let exact = await exactRun(document);
  try {
    assert.equal(exact.run.ok, true, JSON.stringify(exact.run.issues));
    const vertical = exact.run.results.get("base").topology.filter((entry) => entry.kind === "edge" && Math.abs(entry.descriptor.axis?.y) > .99);
    assert.equal(vertical.length, 4);
    document.features.push({id:"round1",name:"Fillet 1",type:"fillet",inputs:["base"],references:{features:["base"],topology:vertical.map((entry) => reference(entry))},params:{radius:1.27}});
  } finally { releaseRegeneration(exact.run); }

  exact = await exactRun(document);
  try {
    assert.equal(exact.run.ok, true, JSON.stringify(exact.run.issues));
    const topArc = exact.run.results.get("round1").topology.find((entry) => entry.kind === "edge"
      && entry.descriptor.curve === "circle" && Math.abs(entry.descriptor.origin.y - 10.414) < 1e-6);
    assert.ok(topArc);
    document.features.push({id:"round2",name:"Fillet 2",type:"fillet",inputs:["round1"],
      references:{features:["round1"],topology:[reference(topArc,"round1")]},params:{radius:.127}});
  } finally { releaseRegeneration(exact.run); }

  exact = await exactRun(document);
  try {
    assert.equal(exact.run.ok, true, JSON.stringify(exact.run.issues));
    document.exactTopologyCache = captureExactTopology(document, exact.compiled.features, exact.run);
  } finally { releaseRegeneration(exact.run); }

  base.params.depth = base.params.to = 10.668;
  const lightweight = rebuildParametricDocument(document);
  assert.ok(lightweight.issues.some((issue) => issue.code === "missing-topology-reference"),
    "the lightweight pass cannot infer generated fillet edges after an upstream geometry edit");
  exact = await exactRun(document);
  try {
    assert.equal(exact.run.ok, true, JSON.stringify(exact.run.issues));
    assert.ok(exact.run.results.get("round2")?.shape);
  } finally { releaseRegeneration(exact.run); }
});
