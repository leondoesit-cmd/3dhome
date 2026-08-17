import test from "node:test";
import assert from "node:assert/strict";

import {
  booleanBrep,
  chamferBrep,
  circularPatternBrep,
  compoundBrep,
  deserializeBrep,
  disposeBrep,
  exportStep,
  extractBrepTopology,
  importStep,
  linearGridPatternBrep,
  makeBrepExtrusion,
  makeBrepRevolve,
  makeBrepPrimitive,
  serializeBrep,
  shapeToMeshData,
  transformBrep,
} from "../js/cad_kernel.js";
import { addFeature, regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { createFeatureDefinition, createPartDocument, createSketchDefinition } from "../js/core/parametric_document.js";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";
import { createTopologyReference, topologyForFeature } from "../js/core/topology.js";
import { createImportedDefinition, detectStepLengthUnit, normalizeImportedGeometry } from "../js/core/import_normalization.js";
import { encodeBinaryPayload } from "../js/core/binary_payload.js";
import { rebuildDefinition } from "../js/core/rebuild.js";
import { inferAuthoringMode } from "../js/core/authoring_mode.js";
import { externalizeAttachments, isAttachmentReference } from "../js/core/attachment_store.js";

function boxFeature(width = 40) {
  return { id: "body", type: "box", params: { x: 0, y: 0, z: 0, w: width, h: 30, d: 20 } };
}

test("the exact kernel builds one bounded multi-axis pattern with skipped offsets", async () => {
  const source=await makeBrepPrimitive({type:"box",x:0,y:0,z:0,w:2,h:2,d:2});
  let pattern;
  try {
    pattern=await linearGridPatternBrep(source,{offsets:[{x:10,y:0,z:0},{x:0,y:-20,z:0},{x:10,y:-20,z:0}]});
    const mesh=await shapeToMeshData(pattern),xs=mesh.positions.filter((_,index)=>index%3===0),ys=mesh.positions.filter((_,index)=>index%3===1);
    assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-12)<1e-6);
    assert.ok(Math.abs(Math.max(...ys)-Math.min(...ys)-22)<1e-6);
  } finally { disposeBrep(pattern);disposeBrep(source); }
});

test("the exact circular kernel rotates the seed around an offset axis", async () => {
  const source=await makeBrepPrimitive({type:"box",x:0,y:0,z:0,w:2,h:2,d:2});let pattern;
  try {
    pattern=await circularPatternBrep(source,{axis:"y",count:2,angle:180,radialDistance:30});
    const mesh=await shapeToMeshData(pattern),xs=mesh.positions.filter((_,index)=>index%3===0);
    assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-64)<1e-6);
  } finally {disposeBrep(pattern);disposeBrep(source);}
});

test("OpenCascade subshapes bind to semantic topology and mesh face ranges", async () => {
  const feature = boxFeature();
  const brep = await makeBrepPrimitive({ type: "box", ...feature.params });
  try {
    const expected = topologyForFeature(feature, feature.params);
    const exact = extractBrepTopology(brep, { ownerFeatureId: feature.id, expectedTopology: expected });
    assert.equal(exact.topology.filter((item) => item.kind === "face").length, 6);
    assert.equal(exact.topology.filter((item) => item.kind === "edge").length, 12);
    assert.deepEqual(
      exact.topology.filter((item) => item.kind === "face").map((item) => item.persistentId).sort(),
      ["back", "bottom", "front", "left", "right", "top"].map((name) => "body:face:" + name).sort(),
    );

    const mesh = await shapeToMeshData(brep);
    assert.equal(mesh.faceRanges.length, 6);
    assert.ok(mesh.faceRanges.every((range) => range.persistentId && range.triangleCount > 0));
    assert.deepEqual(
      mesh.faceRanges.map((range) => range.persistentId).sort(),
      exact.topology.filter((item) => item.kind === "face").map((item) => item.persistentId).sort(),
    );
  } finally {
    disposeBrep(brep);
  }
});

test("an imported STEP box is reconstructed as an aligned hybrid feature", async () => {
  const brep=await makeBrepPrimitive({type:"box",x:25,y:12,z:-8,w:40,h:30,d:20});
  try {
    extractBrepTopology(brep,{ownerFeatureId:"source"});
    const meshData=await shapeToMeshData(brep);
    const definition=createImportedDefinition({name:"Imported box",format:"step",meshData,topology:brep.topology});
    assert.equal(definition.authoringMode,"hybrid");
    assert.equal(definition.metadata.import.recognition,"box");
    assert.equal(definition.parts[0].kind,"box");
    assert.deepEqual([definition.w,definition.h,definition.d],[40,30,20]);
    const rebuilt=rebuildDefinition(definition,{width:80,height:45,depth:25},{now:12});
    assert.equal(rebuilt.ok,true,JSON.stringify(rebuilt.issues));
    assert.deepEqual(rebuilt.bounds,{min:{x:-40,y:0,z:-12.5},max:{x:40,y:45,z:12.5}});
    const exact=await regenerateFeatures(definition,{parameterOverrides:{width:80,height:45,depth:25}});
    try {
      assert.equal(exact.ok,true,JSON.stringify(exact.issues));
      const right=exact.topology.find((item)=>item.semantic==="right");
      assert.equal(right.descriptor.origin.x,40);
    } finally { releaseRegeneration(exact); }
  } finally { disposeBrep(brep); }
});

test("an imported constant-section prism reconstructs and rebuilds as exact sketch history", async () => {
  const source=await makeBrepExtrusion({axis:"y",from:0,to:40,points:[{u:0,v:0},{u:30,v:0},{u:30,v:10},{u:10,v:10},{u:10,v:25},{u:0,v:25}]});
  let exact;
  try {
    extractBrepTopology(source,{ownerFeatureId:"source"});
    const meshData=await shapeToMeshData(source); meshData.topology=source.topology;
    const definition=createImportedDefinition({name:"Imported L prism",format:"step",meshData,topology:source.topology});
    assert.equal(definition.metadata.import.recognition,"extrusion");
    assert.deepEqual(definition.features.map((feature)=>feature.type),["sketch","extrude"]);
    exact=await regenerateFeatures(definition,{parameterOverrides:{height:65}});
    assert.equal(exact.ok,true,JSON.stringify(exact.issues));
    const mesh=await shapeToMeshData(exact.finalShape), ys=mesh.positions.filter((_,index)=>index%3===1);
    assert.ok(Math.abs(Math.max(...ys)-Math.min(...ys)-65)<1e-6);
  } finally { disposeBrep(source); releaseRegeneration(exact); }
});

test("a drilled orthogonal body reconstructs as base, analytic cutter and pocket history",async()=>{
  const base=await makeBrepPrimitive({type:"box",x:-20,y:0,z:-15,w:40,h:20,d:30}),hole=await makeBrepPrimitive({type:"cylinder",x:0,y:-1,z:0,r:4,h:22});
  const source=await booleanBrep("subtract",base,hole);disposeBrep(base);disposeBrep(hole);let exact;
  try{extractBrepTopology(source,{ownerFeatureId:"source"});const meshData=await shapeToMeshData(source);meshData.topology=source.topology;const definition=createImportedDefinition({name:"Drilled block",format:"step",meshData,topology:source.topology});
    assert.equal(definition.metadata.import.recognition,"pocket-box");assert.deepEqual(definition.features.map((feature)=>feature.type),["box","cylinder","subtract"]);exact=await regenerateFeatures(definition,{parameterOverrides:{holeRadius1:6}});assert.equal(exact.ok,true,JSON.stringify(exact.issues));assert.equal(exact.finalShape.topology.filter((entry)=>entry.descriptor.surface==="cylinder")[0].descriptor.radius,6);
  }finally{disposeBrep(source);releaseRegeneration(exact);}
});

test("an axisymmetric stepped body reconstructs as a sketch-driven revolve",async()=>{
  const source=await makeBrepRevolve({points:[{u:0,v:0},{u:10,v:0},{u:10,v:12},{u:6,v:12},{u:6,v:30},{u:0,v:30}],angle:360});let exact;
  try{extractBrepTopology(source,{ownerFeatureId:"source"});const meshData=await shapeToMeshData(source);meshData.topology=source.topology;const definition=createImportedDefinition({name:"Turned shaft",format:"step",meshData,topology:source.topology});
    assert.equal(definition.metadata.import.recognition,"revolve");assert.deepEqual(definition.features.map((feature)=>feature.type),["sketch","revolve"]);assert.ok(definition.sketches[0].entities.length>=5);exact=await regenerateFeatures(definition);assert.equal(exact.ok,true,JSON.stringify(exact.issues));
  }finally{disposeBrep(source);releaseRegeneration(exact);}
});

test("regular disconnected box members reconstruct as an editable linear pattern",async()=>{
  const members=[];for(const x of [-30,0,30])members.push(await makeBrepPrimitive({type:"box",x,y:0,z:0,w:10,h:20,d:8}));const source=await compoundBrep(members);members.forEach(disposeBrep);let exact;
  try{extractBrepTopology(source,{ownerFeatureId:"source"});const meshData=await shapeToMeshData(source);meshData.topology=source.topology;const definition=createImportedDefinition({name:"Rail pattern",format:"step",meshData,topology:source.topology});assert.equal(definition.metadata.import.recognition,"linear-pattern");assert.equal(definition.features.at(-1).type,"linearPattern");exact=await regenerateFeatures(definition,{parameterOverrides:{instanceCount:4,spacing:25}});assert.equal(exact.ok,true,JSON.stringify(exact.issues));assert.equal(exact.finalShape.topology.filter((entry)=>entry.kind==="face").length,24);
  }finally{disposeBrep(source);releaseRegeneration(exact);}
});

test("non-identical disconnected boxes reconstruct as placed assembly components",async()=>{
  const a=await makeBrepPrimitive({type:"box",x:-25,y:0,z:0,w:10,h:20,d:8}),b=await makeBrepPrimitive({type:"box",x:20,y:0,z:0,w:20,h:12,d:14}),source=await compoundBrep([a,b]);disposeBrep(a);disposeBrep(b);let exact;
  try{extractBrepTopology(source,{ownerFeatureId:"source"});const meshData=await shapeToMeshData(source);meshData.topology=source.topology;const definition=createImportedDefinition({name:"Two part assembly",format:"step",meshData,topology:source.topology});assert.equal(definition.metadata.import.recognition,"box-assembly");assert.equal(definition.parts.length,2);assert.equal(definition.features.at(-1).type,"assembly");exact=await regenerateFeatures(definition);assert.equal(exact.ok,true,JSON.stringify(exact.issues));
  }finally{disposeBrep(source);releaseRegeneration(exact);}
});

test("radial repeated members reconstruct as an editable circular pattern",async()=>{
  const members=[];for(const [x,z] of [[30,0],[0,30],[-30,0],[0,-30]])members.push(await makeBrepPrimitive({type:"box",x:x-4,y:0,z:z-4,w:8,h:8,d:8}));const source=await compoundBrep(members);members.forEach(disposeBrep);let exact;
  try{extractBrepTopology(source,{ownerFeatureId:"source"});const meshData=await shapeToMeshData(source);meshData.topology=source.topology;const definition=createImportedDefinition({name:"Radial pattern",format:"step",meshData,topology:source.topology});assert.equal(definition.metadata.import.recognition,"circular-pattern");assert.equal(definition.features.at(-1).type,"circularPattern");exact=await regenerateFeatures(definition,{parameterOverrides:{instanceCount:6}});assert.equal(exact.ok,true,JSON.stringify(exact.issues));assert.equal(exact.finalShape.topology.filter((entry)=>entry.kind==="face").length,36);
  }finally{disposeBrep(source);releaseRegeneration(exact);}
});

test("STEP export and import preserve centimetre dimensions across declared units", async () => {
  const source=await makeBrepPrimitive({type:"box",x:0,y:0,z:0,w:40,h:30,d:20});
  let restored;
  try {
    for (const [outputUnit,declaredUnit] of [["CM","cm"],["MM","mm"]]) {
      const bytes=await exportStep(source,"unit-roundtrip-"+outputUnit+".step",{outputUnit});
      assert.equal(detectStepLengthUnit(bytes),declaredUnit);
      restored=await importStep(bytes,"unit-roundtrip-"+outputUnit+".step");
      const mesh=await shapeToMeshData(restored), xs=mesh.positions.filter((_,index)=>index%3===0), ys=mesh.positions.filter((_,index)=>index%3===1), zs=mesh.positions.filter((_,index)=>index%3===2);
      assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-40)<1e-6);
      assert.ok(Math.abs(Math.max(...ys)-Math.min(...ys)-30)<1e-6);
      assert.ok(Math.abs(Math.max(...zs)-Math.min(...zs)-20)<1e-6);
      disposeBrep(restored); restored=null;
    }
  } finally {
    disposeBrep(source); disposeBrep(restored);
  }
});

test("a complex direct STEP body restores its exact BREP after JSON persistence", async () => {
  const left=await makeBrepPrimitive({type:"box",x:25,y:12,z:-8,w:40,h:30,d:20});
  const right=await makeBrepPrimitive({type:"box",x:55,y:12,z:-8,w:20,h:50,d:20});
  const source=await booleanBrep("union",left,right);
  disposeBrep(left); disposeBrep(right);
  let canonical, restoredProbe, exact;
  try {
    extractBrepTopology(source,{ownerFeatureId:"source"});
    const meshData=await shapeToMeshData(source); meshData.topology=source.topology;
    const normalized=normalizeImportedGeometry({name:"Imported L body",format:"step",sourceUnit:"mm",meshData,topology:source.topology});
    assert.equal(normalized.recognition,null);
    canonical=await transformBrep(source,normalized.sourceTransform);
    const serialized=await serializeBrep(canonical,"imported-l-body.brep");
    restoredProbe=await deserializeBrep(serialized,"imported-l-body.brep");
    assert.ok((await shapeToMeshData(restoredProbe)).positions.length>0);
    normalized.exactPayload=encodeBinaryPayload(serialized,{format:"brep",mediaType:"model/vnd.opencascade.brep"});
    let definition=JSON.parse(JSON.stringify(createImportedDefinition(normalized)));
    assert.equal(definition.authoringMode,"direct-only");
    assert.equal(definition.features[0].params.sourcePayload.format,"brep");
    const importId=definition.features[0].id;
    definition.features.push(
      {id:"authored-box",type:"box",name:"Authored box",inputs:[],params:{x:-5,y:0,z:-5,w:10,h:10,d:10}},
      {id:"authored-union",type:"union",name:"Authored union",inputs:[importId,"authored-box"],params:{}},
    );
    definition.authoringMode=inferAuthoringMode({...definition,authoringMode:null});
    assert.equal(definition.authoringMode,"hybrid");
    definition=await externalizeAttachments(definition);
    assert.equal(isAttachmentReference(definition.features[0].params.sourcePayload),true);
    exact=await regenerateFeatures(definition);
    assert.equal(exact.ok,true,JSON.stringify(exact.issues));
    assert.ok(exact.finalShape?.shape);
    assert.equal(exact.results.get(importId).topology.filter((item)=>item.kind==="face").length,source.topology.filter((item)=>item.kind==="face").length);
    assert.deepEqual(Array.from(exact.results.keys()),[importId,"authored-box","authored-union"]);
  } finally {
    releaseRegeneration(exact);
    disposeBrep(source); disposeBrep(canonical); disposeBrep(restoredProbe);
  }
});

test("a history fillet resolves and rounds only the selected exact edge", async () => {
  const body = boxFeature();
  const selected = topologyForFeature(body, body.params).find((item) => item.persistentId === "body:edge:x:bottom:back");
  const definition = { features: [] };
  addFeature(definition, body);
  addFeature(definition, {
    id: "round", type: "fillet", inputs: ["body"],
    params: { radius: 2, targets: [createTopologyReference(selected.ownerFeatureId, selected.kind, selected.persistentId, selected.descriptor)] },
  });

  const run = await regenerateFeatures(definition);
  try {
    assert.equal(run.ok, true, JSON.stringify(run.issues));
    assert.deepEqual(Array.from(run.results.keys()), ["body", "round"]);
    assert.equal(run.finalShape.topology.filter((item) => item.descriptor.surface === "cylinder").length, 1);
    assert.ok(run.finalShape.topology.some((item) => item.persistentId === "round:face:generated:cylinder:1"));
    assert.equal(run.topologyBindings[0].status, "exact");
  } finally {
    releaseRegeneration(run);
  }
});

test("generated exact topology names remain deterministic across rebuilds", async () => {
  async function build() {
    const body = boxFeature();
    const selected = topologyForFeature(body, body.params).find((item) => item.persistentId === "body:edge:x:bottom:back");
    const definition = { features: [] };
    addFeature(definition, body);
    addFeature(definition, {
      id: "round", type: "fillet", inputs: ["body"],
      params: { radius: 2, targets: [createTopologyReference(selected.ownerFeatureId, selected.kind, selected.persistentId, selected.descriptor)] },
    });
    return regenerateFeatures(definition);
  }

  const first = await build(), second = await build();
  try {
    assert.deepEqual(
      first.finalShape.topology.map((item) => item.persistentId).sort(),
      second.finalShape.topology.map((item) => item.persistentId).sort(),
    );
  } finally {
    releaseRegeneration(first);
    releaseRegeneration(second);
  }
});

test("a history chamfer consumes only its selected persistent edge", async () => {
  const body = boxFeature();
  const selected = topologyForFeature(body, body.params).find((item) => item.persistentId === "body:edge:x:top:back");
  const definition = { features: [] };
  addFeature(definition, body);
  addFeature(definition, {
    id: "bevel", type: "chamfer", inputs: ["body"],
    params: { mode:"two-distance", distance:2, secondDistance:4, angle:45, flip:false, targets: [createTopologyReference(selected.ownerFeatureId, selected.kind, selected.persistentId, selected.descriptor)] },
  });

  const run = await regenerateFeatures(definition);
  try {
    assert.equal(run.ok, true, JSON.stringify(run.issues));
    assert.equal(run.finalShape.topology.filter((item) => item.kind === "face").length, 7);
    assert.equal(run.finalShape.topology.some((item) => item.persistentId === selected.persistentId), false);
    assert.ok(run.finalShape.topology.some((item) => item.persistentId.startsWith("bevel:face:generated:plane:")));
    assert.equal(run.topologyBindings[0].status, "exact");
    const mesh=await shapeToMeshData(run.finalShape);
    const hasAsymmetricCorner=mesh.positions.some((x,index)=>index%3===0 && Math.abs(x)<1e-5 && Math.abs(mesh.positions[index+1]-30)<1e-4 && Math.abs(mesh.positions[index+2]-4)<1e-4);
    assert.equal(hasAsymmetricCorner,true);
  } finally {
    releaseRegeneration(run);
  }
});

test("chamfer type, second distance, angle and flip drive exact OCCT geometry", async () => {
  const feature = boxFeature();
  const edgeId = "body:edge:x:top:back";
  const build = async (options) => {
    const body = await makeBrepPrimitive({ type:"box", ...feature.params });
    let result;
    try {
      extractBrepTopology(body, { ownerFeatureId:feature.id, expectedTopology:topologyForFeature(feature, feature.params) });
      result = await chamferBrep(body, 3, { edgePersistentIds:[edgeId], ...options });
      const mesh = await shapeToMeshData(result);
      const yz = [];
      for (let index = 0; index < mesh.positions.length; index += 3) {
        if (Math.abs(mesh.positions[index]) > 1e-5) continue;
        const pair = [mesh.positions[index + 1], mesh.positions[index + 2]];
        if (!yz.some(([y,z]) => Math.abs(y-pair[0]) < 1e-4 && Math.abs(z-pair[1]) < 1e-4)) yz.push(pair);
      }
      return yz;
    } finally { disposeBrep(result); disposeBrep(body); }
  };
  const has = (points, y, z) => points.some((point) => Math.abs(point[0]-y) < 1e-4 && Math.abs(point[1]-z) < 1e-4);

  const symmetric = await build({ mode:"equal-distance" });
  assert.ok(has(symmetric, 27, 0) && has(symmetric, 30, 3));

  const twoDistance = await build({ mode:"two-distance", secondDistance:5 });
  assert.ok(has(twoDistance, 27, 0) && has(twoDistance, 30, 5));

  const angle30 = await build({ mode:"distance-angle", angle:30 });
  const angle60 = await build({ mode:"distance-angle", angle:60 });
  assert.ok(has(angle30, 30, 3 * Math.tan(Math.PI / 6)));
  assert.ok(has(angle60, 30, 3 * Math.tan(Math.PI / 3)));

  const flipped = await build({ mode:"two-distance", secondDistance:5, flip:true });
  assert.ok(has(flipped, 25, 0) && has(flipped, 30, 3));
});

test("a history shell removes the selected face and creates an exact inner skin", async () => {
  const body = boxFeature();
  const selected = topologyForFeature(body, body.params).find((item) => item.persistentId === "body:face:top");
  const definition = { features: [] };
  addFeature(definition, body);
  addFeature(definition, {
    id: "hollow", type: "shell", inputs: ["body"],
    params: { thickness: 2, targets: [createTopologyReference(selected.ownerFeatureId, selected.kind, selected.persistentId, selected.descriptor)] },
  });

  const run = await regenerateFeatures(definition);
  try {
    assert.equal(run.ok, true, JSON.stringify(run.issues));
    assert.equal(run.finalShape.topology.filter((item) => item.kind === "face").length, 11);
    assert.equal(run.finalShape.topology.some((item) => item.persistentId === selected.persistentId), false);
    assert.equal(run.finalShape.topology.filter((item) => item.persistentId.startsWith("hollow:face:generated:plane:")).length, 6);
    assert.equal(run.topologyBindings[0].status, "exact");
  } finally {
    releaseRegeneration(run);
  }
});

test("an exact face-supported extrusion follows an upstream dimension change", async () => {
  async function build(height) {
    const body = { id: "body", type: "box", params: { x: 0, y: 0, z: 0, w: 40, h: height, d: 20 } };
    const top = topologyForFeature(body, body.params).find((item) => item.persistentId === "body:face:top");
    const support = createTopologyReference(top.ownerFeatureId, top.kind, top.persistentId, top.descriptor);
    const definition = { features: [] };
    addFeature(definition, body);
    addFeature(definition, {
      id: "pad", type: "extrude", inputs: ["body"],
      params: { axis: "y", from: height, to: height + 8, baseOffset: 0, depth: 8, support, points: [{ u: 5, v: 5 }, { u: 15, v: 5 }, { u: 15, v: 15 }, { u: 5, v: 15 }] },
    });
    return regenerateFeatures(definition);
  }

  const first = await build(30), second = await build(55);
  try {
    assert.equal(first.ok, true, JSON.stringify(first.issues));
    assert.equal(second.ok, true, JSON.stringify(second.issues));
    assert.equal(first.results.get("pad").topology.find((item) => item.semantic === "start").descriptor.origin.y, 30);
    assert.equal(second.results.get("pad").topology.find((item) => item.semantic === "start").descriptor.origin.y, 55);
    assert.equal(second.topologyBindings[0].status, "exact");
  } finally {
    releaseRegeneration(first);
    releaseRegeneration(second);
  }
});

test("exact kernel regenerates a hole wizard as a through subtract", async () => {
  const document = createPartDocument({ id: "part:exact-hole" });
  const baseSketch = createSketchDefinition(document, {
    id: "sketch:base", name: "Base", referenceId: "plane:top",
    points: [
      { id: "p0", x: 0, y: 0, fixed: true }, { id: "p1", x: 40, y: 0, fixed: true },
      { id: "p2", x: 40, y: 20, fixed: true }, { id: "p3", x: 0, y: 20, fixed: true },
    ],
    entities: [
      { id: "e0", type: "line", a: "p0", b: "p1" }, { id: "e1", type: "line", a: "p1", b: "p2" },
      { id: "e2", type: "line", a: "p2", b: "p3" }, { id: "e3", type: "line", a: "p3", b: "p0" },
    ],
  });
  const base = createFeatureDefinition(document, "extrude", {
    id: "feature:block",
    references: { sketches: [baseSketch.id], features: [], topology: [], references: [] },
    params: { depth: 20, profileEntityIds: ["e0", "e1", "e2", "e3"] },
  });
  const holeSketch = createSketchDefinition(document, {
    id: "sketch:bore", name: "Bore", referenceId: "plane:top",
    points: [{ id: "hc", x: 20, y: 10, fixed: true }],
    entities: [{ id: "circle", type: "circle", c: "hc", r: 3, fixed: true }],
  });
  createFeatureDefinition(document, "hole", {
    id: "feature:bore",
    inputs: [base.id],
    references: { sketches: [holeSketch.id], features: [base.id], topology: [], references: [] },
    params: { diameter: 6, depth: 20, endCondition: "through-all", profileEntityIds: ["circle"] },
  });
  const compiled = compileKernelFeatureTree(document);
  assert.equal(compiled.ok, true, JSON.stringify(compiled.issues));
  const exact = { sketches: compiled.document.sketches, features: [] };
  compiled.features.forEach((feature) => addFeature(exact, feature));
  const run = await regenerateFeatures(exact);
  try {
    assert.equal(run.ok, true, JSON.stringify(run.issues));
    assert.ok(run.results.get("feature:bore:tool")?.shape, "hole tool extrusion is missing");
    assert.ok(run.finalShape && run.finalShape.shape);
    const faces = (run.finalShape.topology || []).filter((entry) => entry.kind === "face");
    assert.ok(faces.length > 6, "through hole should add inner faces, got " + faces.length);
  } finally {
    releaseRegeneration(run);
  }
});
