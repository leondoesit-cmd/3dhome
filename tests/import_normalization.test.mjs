import test from "node:test";
import assert from "node:assert/strict";

import { inferAuthoringMode } from "../js/core/authoring_mode.js";
import { createImportedDefinition, detectStepLengthUnit, normalizeImportedGeometry, stepUnitCorrection } from "../js/core/import_normalization.js";
import { decodeBinaryPayload, encodeBinaryPayload } from "../js/core/binary_payload.js";
import { rebuildDefinition } from "../js/core/rebuild.js";
import { evaluateDimensionRequest } from "../js/core/smart_dimension.js";
import { registerImportedDefinition } from "../js/core/project.js";

function directMesh() {
  return {positions:[10,4,20,30,4,20,10,24,20,30,4,20,30,24,20,10,24,20]};
}

test("import normalization centers geometry, rests it on the floor and preserves hierarchy", () => {
  const normalized=normalizeImportedGeometry({name:"Panel",format:"generated",meshData:directMesh(),hierarchy:[{id:"root",type:"assembly",children:["panel"]}]});
  assert.deepEqual(normalized.bounds,{min:{x:-10,y:0,z:0},max:{x:10,y:20,z:0}});
  assert.equal(normalized.hierarchy[0].type,"assembly");
  assert.equal(normalized.source.format,"generated");
});

test("import normalization converts source coordinates and topology into centimetres", () => {
  const topology=[{kind:"edge",persistentId:"edge",descriptor:{curve:"line",origin:{x:20,y:14,z:20},measure:20,endpoints:[{x:10,y:4,z:20},{x:30,y:4,z:20}]}}];
  const normalized=normalizeImportedGeometry({name:"Millimetre panel",format:"mesh",unitScale:.1,sourceUnit:"mm",meshData:directMesh(),topology});
  assert.deepEqual(normalized.bounds,{min:{x:-1,y:0,z:0},max:{x:1,y:2,z:0}});
  assert.equal(normalized.topology[0].descriptor.measure,2);
  assert.equal(normalized.source.workingUnit,"cm");
  assert.equal(normalized.sourceTransform.scale,.1);
});

test("STEP unit declarations and exact binary payloads survive serialization", () => {
  assert.equal(detectStepLengthUnit("#1=(LENGTH_UNIT() SI_UNIT(.MILLI.,.METRE.));"),"mm");
  assert.equal(detectStepLengthUnit("#1=(LENGTH_UNIT() SI_UNIT(.CENTI.,.METRE.));"),"cm");
  assert.equal(detectStepLengthUnit("#1=(LENGTH_UNIT() SI_UNIT($,.METRE.));"),"m");
  assert.equal(detectStepLengthUnit("#1=CONVERSION_BASED_UNIT('INCH',#2);"),"in");
  assert.equal(stepUnitCorrection("mm","auto"),1);
  assert.equal(stepUnitCorrection("cm","mm"),.1);
  assert.equal(stepUnitCorrection("mm","in"),25.4);
  const payload=encodeBinaryPayload(new Uint8Array([0,1,2,127,128,255]),{format:"brep"});
  const persisted=JSON.parse(JSON.stringify(payload));
  assert.deepEqual(Array.from(decodeBinaryPayload(persisted)),[0,1,2,127,128,255]);
  assert.throws(()=>decodeBinaryPayload({...persisted,checksum:"00000000"}),/checksum/);
});

test("constant-section polygonal imports reconstruct as an editable sketch extrusion", () => {
  const loop=[[0,0],[30,0],[30,10],[10,10],[10,25],[0,25]];
  const edge=(a,b,y,id)=>({kind:"edge",persistentId:id,descriptor:{curve:"line",endpoints:[{x:a[0],y,z:a[1]},{x:b[0],y,z:b[1]}]}});
  const topology=[
    {kind:"face",persistentId:"cap0",descriptor:{surface:"plane",origin:{x:5,y:0,z:5},normal:{x:0,y:-1,z:0}}},
    {kind:"face",persistentId:"cap1",descriptor:{surface:"plane",origin:{x:5,y:40,z:5},normal:{x:0,y:1,z:0}}},
    ...loop.map((point,index)=>({kind:"face",persistentId:"side"+index,descriptor:{surface:"plane",origin:{x:point[0],y:20,z:point[1]},normal:index%2?{x:1,y:0,z:0}:{x:0,y:0,z:1}}})),
    ...loop.map((point,index)=>edge(point,loop[(index+1)%loop.length],0,"bottom"+index)),
    ...loop.map((point,index)=>edge(point,loop[(index+1)%loop.length],40,"top"+index)),
    ...loop.map((point,index)=>edge(point,point,0,"vertical"+index)).filter(()=>false),
  ];
  const meshData={positions:[0,0,0,30,0,0,0,40,25,30,0,0,30,40,25,0,40,25],topology};
  const definition=createImportedDefinition({name:"L prism",format:"mesh",meshData,topology});
  assert.equal(definition.metadata.import.recognition,"extrusion");
  assert.equal(definition.authoringMode,"hybrid");
  assert.equal(definition.sketches[0].entities.length,6);
  assert.deepEqual(definition.features.map((feature)=>feature.type),["sketch","extrude"]);
  assert.equal(definition.parameters.height.adjustable,true);
  assert.equal(definition.parameters.width.adjustable,false);
  const run=rebuildDefinition(definition,{height:60},{now:12});
  assert.equal(run.ok,true,JSON.stringify(run.issues));
  assert.equal(run.parameters.height,60);
});

test("unrecognized triangle bodies become fixed direct-only canonical definitions", () => {
  const definition=createImportedDefinition({name:"Scan",format:"mesh",meshData:directMesh()});
  assert.equal(definition.authoringMode,"direct-only");
  assert.equal(definition.parts[0].kind,"direct");
  assert.equal(definition.features[0].type,"import");
  assert.equal(definition.parameters.width.adjustable,false);
  const run=rebuildDefinition(definition,{}, {now:9});
  assert.equal(run.ok,true,JSON.stringify(run.issues));
  assert.deepEqual(run.bounds,{min:{x:-10,y:0,z:0},max:{x:10,y:20,z:0}});
  assert.equal(evaluateDimensionRequest(definition,{},"width",50).code,"fixed-dimension");
});

test("complex orthogonal trays are not reconstructed as drilled boxes", () => {
  const plane=(normal,id)=>({kind:"face",persistentId:id,descriptor:{surface:"plane",origin:{x:0,y:0,z:0},normal}});
  const cylinder=(radius,id)=>({kind:"face",persistentId:id,descriptor:{surface:"cylinder",origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0},radius}});
  const circle=(id)=>({kind:"edge",persistentId:id,descriptor:{curve:"circle",origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0},radius:4}});
  const topology=[
    plane({x:1,y:0,z:0},"right"),plane({x:-1,y:0,z:0},"left"),
    plane({x:0,y:1,z:0},"top"),plane({x:0,y:-1,z:0},"bottom"),
    plane({x:0,y:0,z:1},"front"),plane({x:0,y:0,z:-1},"back"),
    // The extra planar face represents a tab/boss on a tray or housing.
    plane({x:0,y:1,z:0},"tab"),
    cylinder(20,"outer-rim"),cylinder(17,"inner-rim"),cylinder(2,"fastener-hole"),
    circle("rim-a"),circle("rim-b"),circle("hole-a"),circle("hole-b"),
  ];
  const definition=createImportedDefinition({name:"Circular tray",format:"step",meshData:directMesh(),topology});
  assert.equal(definition.metadata.import.recognition,"none");
  assert.equal(definition.authoringMode,"direct-only");
  assert.equal(definition.parts[0].kind,"direct");
  assert.deepEqual(definition.parts[0].meshData.positions,[-10,0,0,10,0,0,-10,20,0,10,0,0,10,20,0,-10,20,0]);
});

test("authoring classification distinguishes analytic history from direct geometry", () => {
  assert.equal(inferAuthoringMode({features:[{id:"box",type:"box"}]}),"fully-parametric");
  assert.equal(inferAuthoringMode({parts:[{kind:"direct",meshData:directMesh()}]}),"direct-only");
  assert.equal(inferAuthoringMode({features:[{id:"body",type:"box"},{id:"scan",type:"import"}]}),"hybrid");
});

test("generated/imported meshes enter the shared project definition registry", () => {
  const state={items:[]};
  const definition=registerImportedDefinition(state,{name:"AI body",format:"generated",generator:"test",meshData:directMesh()});
  assert.equal(state.parametric.definitions[definition.id],definition);
  assert.equal(definition.metadata.import.generator,"test");
  assert.equal(definition.metadata.derivedRepresentation.collision,"envelope");
});

test("direct import topology is available to downstream canonical features", () => {
  const mesh=directMesh();
  const topology=[{ownerFeatureId:"source",kind:"face",persistentId:"source:face",semantic:"front",descriptor:{surface:"plane",origin:{x:20,y:14,z:20},normal:{x:0,y:0,z:1},measure:400}}];
  const definition=createImportedDefinition({name:"Direct face",format:"mesh",meshData:mesh,topology});
  const run=rebuildDefinition(definition,{}, {now:10});
  assert.equal(run.ok,true,JSON.stringify(run.issues));
  assert.equal(run.topology.length,1);
  assert.equal(run.topology[0].ownerFeatureId,definition.features[0].id);
  assert.equal(run.topology[0].descriptor.origin.x,0);
});

test("a recognized cylinder uses the analytic radius when the mesh falls short of it", () => {
  const topology = [
    { kind: "face", persistentId: "side", descriptor: { surface: "cylinder", origin: { x: 0, y: 10, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 10 } },
    { kind: "face", persistentId: "bot", descriptor: { surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: -1, z: 0 } } },
    { kind: "face", persistentId: "top", descriptor: { surface: "plane", origin: { x: 0, y: 20, z: 0 }, normal: { x: 0, y: 1, z: 0 } } },
    { kind: "edge", persistentId: "c0", descriptor: { curve: "circle", origin: { x: 0, y: 0, z: 0 }, radius: 10 } },
    { kind: "edge", persistentId: "c1", descriptor: { curve: "circle", origin: { x: 0, y: 20, z: 0 }, radius: 10 } },
  ];
  const meshData = { positions: [4, 0, 0, -4, 0, 0, 0, 20, 4, -4, 0, 0, 0, 20, 4, 4, 20, 0] };
  const definition = createImportedDefinition({ name: "Coarse cylinder", format: "mesh", meshData, topology });
  assert.equal(definition.metadata.import.recognition, "cylinder");
  assert.equal(definition.parts[0].r, 10);
  assert.equal(definition.parameters.width.value,20);
  assert.equal(definition.parameters.depth.value,20);
  assert.equal(definition.parameters.radius.expression, "width/2");
  const resized=rebuildDefinition(definition,{width:30,depth:30});
  assert.equal(resized.ok,true,JSON.stringify(resized.issues));
  assert.equal(resized.parameters.radius,15);
  assert.equal(resized.bounds.max.x-resized.bounds.min.x,30);
  assert.equal(resized.bounds.max.z-resized.bounds.min.z,30);
});

test("a recognized tube preserves its through-bore and native material volume after cold rebuild", async () => {
  const cylinder = (radius, id) => ({ kind: "face", persistentId: id, descriptor: { surface: "cylinder", origin: { x: 0, y: 10, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius } });
  const plane = (y, id, ny) => ({ kind: "face", persistentId: id, descriptor: { surface: "plane", origin: { x: 0, y, z: 0 }, normal: { x: 0, y: ny, z: 0 } } });
  const topology = [cylinder(10, "outer"), cylinder(4, "inner"), plane(0, "bot", -1), plane(20, "top", 1)];
  const ring = (y, r) => [r, y, 0, 0, y, r, -r, y, 0, 0, y, -r];
  const meshData = { positions: [...ring(0, 10), ...ring(0, 4), ...ring(20, 10), ...ring(20, 4)] };
  const definition = createImportedDefinition({ name: "Tube", format: "mesh", meshData, topology });
  assert.equal(definition.metadata.import.recognition, "revolve");
  const radii = definition.parts[0].pts.map(point => point.u);
  assert.ok(radii.every(radius => Math.abs(radius - 4) < 1e-6 || Math.abs(radius - 10) < 1e-6), radii.join(","));
  assert.ok(radii.some(radius => Math.abs(radius - 4) < 1e-6));
  const cold=JSON.parse(JSON.stringify(definition));
  assert.equal(rebuildDefinition(cold,{}).ok,true);
  const {regenerateFeatures,releaseRegeneration}=await import('../js/cad_feature_tree.js');
  const {shapeMassProperties}=await import('../js/cad_kernel.js');
  const run=await regenerateFeatures(cold);
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const mass=await shapeMassProperties(run.finalShape);
    assert.ok(Math.abs(mass.volume-Math.PI*(10**2-4**2)*20)<1e-5,JSON.stringify(mass));
  }finally{releaseRegeneration(run);}
});

test("a full-circle import stores the sweep, not the step between copies", () => {
  const box = (cx, cz) => {
    const positions = [];
    const x0 = cx - 5, x1 = cx + 5, y0 = 0, y1 = 10, z0 = cz - 5, z1 = cz + 5;
    const faces = [
      [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
      [[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]],
      [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]],
      [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]],
      [[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]],
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
    ];
    for (const face of faces) positions.push(...face[0], ...face[1], ...face[2], ...face[0], ...face[2], ...face[3]);
    return positions;
  };
  const normals = [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }];
  const topology = [];
  const centers = [[50, 0], [0, 50], [-50, 0], [0, -50]];
  centers.forEach((_, index) => {
    normals.forEach((normal, face) => topology.push({ kind: "face", persistentId: "f" + index + "-" + face, descriptor: { surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal } }));
    for (let edge = 0; edge < 12; edge++) topology.push({ kind: "edge", persistentId: "e" + index + "-" + edge, descriptor: { curve: "line", endpoints: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] } });
  });
  const meshData = { positions: centers.flatMap(([x, z]) => box(x, z)) };
  const definition = createImportedDefinition({ name: "Radial boxes", format: "mesh", meshData, topology });
  assert.equal(definition.metadata.import.recognition, "circular-pattern");
  assert.equal(definition.features.at(-1).params.angle, 360);
});
