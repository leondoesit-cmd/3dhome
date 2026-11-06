import test from "node:test";
import assert from "node:assert/strict";
import {
  booleanBrep, brepContainsPoint, compoundBrep, compoundShellMembers, deserializeBrep, disposeBrep, extractBrepTopology, makeBrepExtrusion,
  makeBrepLoft, serializeBrep, shapeMassProperties, shellBrep, validateBrepForExport,
} from "../js/cad_kernel.js";
import {cadWorkerGeometryKeys, createCadWorkerExecutor} from "../js/core/cad_worker_runtime.js";

// Build a native solid missing one face, so the invalid case exercises real
// invalid geometry all the way through worker serialization.
function openBoxSolid(box) {
  const {oc} = box, builder = new oc.TopoDS_Builder();
  const shell = new oc.TopoDS_Shell(), solid = new oc.TopoDS_Solid();
  const faces = new oc.TopExp_Explorer_2(box.shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try {
    builder.MakeShell(shell);
    for (faces.Next(); faces.More(); faces.Next()) {
      const face = faces.Current();
      try { builder.Add(shell,face); } finally { face.delete(); }
    }
    builder.MakeSolid(solid);
    builder.Add(solid,shell);
    return {oc,shape:solid,kind:"solid"};
  } catch (error) {
    solid.delete();
    throw error;
  } finally { faces.delete(); shell.delete(); builder.delete(); }
}

async function verifySiblingWarning(flag,warning,issueCode) {
  const sibling = await makeBrepExtrusion({axis:"z",from:0,to:4,
    points:[[8,0],[12,0],[12,4],[8,4]].map(([u,v])=>({u,v}))});
  let upstream;
  try {
    const source = flag==="invalid" ? openBoxSolid(sibling) : sibling;
    try {
      upstream = {bytes:await serializeBrep(source),metadata:{kind:"solid",[flag]:warning},
        topology:extractBrepTopology(source,{ownerFeatureId:"sibling"}).topology};
    } finally { if (source!==sibling) disposeBrep(source); }
  } finally {disposeBrep(sibling);}
  const document = {features:[
    {id:"box",type:"box",inputs:[],params:{w:4,h:4,d:4}},
    {id:"sibling",type:"shell",inputs:["box"],params:{thickness:.5}},
    {id:"both",type:"assembly",inputs:["box","sibling"],params:{}},
  ]};
  const siblingKey = cadWorkerGeometryKeys(document,document.features).get("sibling");
  const execute = createCadWorkerExecutor({bodyStore:{get:key=>key===siblingKey ? upstream : null,put(){}}});
  const {topology} = await execute({kind:"topology",head:"both",document});
  const opening = topology.find(face=>face.kind==="face" && face.descriptor.normal.z>.99 && face.descriptor.origin.x<8);
  assert.ok(opening);
  document.features.push({id:"hollow",type:"shell",inputs:["both"],params:{thickness:.5},references:[opening]});
  const run = await execute({kind:"regenerate",document,meshOnly:true});
  assert.ok(run.ok,JSON.stringify(run.issues));
  const results = new Map(run.results);
  for (const id of ["both","hollow"]) {
    const payload = results.get(id);
    assert.equal(payload.metadata[flag],warning,id);
    assert.ok(run.issues.some(issue=>issue.feature===id && issue.code===issueCode && issue.message===warning),id);
    assert.equal(payload.proof,undefined,id);
    assert.ok(payload.bytes.byteLength && payload.meshData.positions.length,id);
  }
  if (flag==="invalid") {
    const body = await deserializeBrep(results.get("hollow").bytes);
    try { await assert.rejects(validateBrepForExport(body),/invalid BREP topology or geometry/); }
    finally { disposeBrep(body); }
  }
}

test("worker preserves a retained sibling's approximation through assembly and Shell", () =>
  verifySiblingWarning("approximate","Shell used a sampled-section approximation","approximate-shell"));

test("worker preserves a retained sibling's invalid status through assembly and Shell", () =>
  verifySiblingWarning("invalid","Shell produced an invalid solid","invalid-solid"));

test("shelling the sink opening hollows the loft and retains the edge-touching countertop", async () => {
  const bodies = [];
  const own = body => (bodies.push(body), body);
  function ring(rx, ry, z) {
    return Array.from({length:48}, (_, i) => {
      const angle = i * Math.PI / 24;
      return {x:rx*Math.cos(angle), y:ry*Math.sin(angle), z};
    });
  }
  try {
    const slab = own(await makeBrepExtrusion({axis:"z", from:0, to:2,
      points:[[-20,-15],[20,-15],[20,15],[-20,15]].map(([u,v]) => ({u,v}))}));
    const opening = own(await makeBrepExtrusion({axis:"z", from:0, to:2,
      points:ring(12,8,0).map(({x:u,y:v}) => ({u,v})),
      segments:[{type:"ellipse",center:{u:0,v:0},rx:12,ry:8,rot:0}]}));
    const counter = own(await booleanBrep("subtract",slab,opening));
    const upper = {points:ring(12,8,0),segments:[{type:"ellipse", center:{x:0,y:0,z:0},
      normal:{x:0,y:0,z:1},majorAxis:{x:1,y:0,z:0},rx:12,ry:8}]};
    const lower = {points:ring(2,2,-10)};
    lower.segments = [0,24].map(i => ({type:"arc",from:lower.points[i],mid:lower.points[i+12],to:lower.points[(i+24)%48]}));
    const bowl = own(await makeBrepLoft({solid:true,sections:[upper,lower]}));
    const merged = own(await booleanBrep("union",counter,bowl));
    assert.equal((await shapeMassProperties(merged)).solidCount,2);
    const top = body => extractBrepTopology(body).topology.find(t => t.kind==="face" &&
      t.descriptor.normal.z>.99 && Math.abs(t.descriptor.origin.z)<1e-6 &&
      Math.abs(t.descriptor.measure-Math.PI*12*8)<.01);
    const hollow = async body => own(await shellBrep(body,.25,{facePersistentIds:[top(body).persistentId]}));
    const bowlWall = await hollow(bowl);
    const result = await hollow(merged);
    assert.ok(!result.invalid && !result.approximate,"the bowl has an exact offset");
    const checked = await validateBrepForExport(result);
    assert.equal(checked.solidCount,2);
    const expected = (await shapeMassProperties(counter)).volume + (await shapeMassProperties(bowlWall)).volume;
    assert.ok(Math.abs(checked.volumeCm3-expected)<1e-5);
    assert.equal(brepContainsPoint(result,{x:0,y:0,z:-4}),false,"the bowl is open");
    assert.equal(brepContainsPoint(result,{x:0,y:0,z:-9.9}),true,"the bowl has a floor");
    assert.equal(brepContainsPoint(result,{x:16,y:0,z:1}),true,"the counter retains its core");
  } finally { bodies.reverse().forEach(disposeBrep); }
});

test("assembling shell members carries the largest reported tolerance regardless of member order", async () => {
  const bodies = [];
  try {
    for (const x of [0,4,8]) bodies.push(await makeBrepExtrusion({axis:"z",from:0,to:2,
      points:[[x,0],[x+2,0],[x+2,2],[x,2]].map(([u,v])=>({u,v}))}));
    // These are the diagnostics supplied by the member offset operations.
    bodies[0].looseTolerance = .012;
    bodies[1].looseTolerance = .002;
    for (const members of [bodies,[...bodies].reverse()]) {
      const result = await compoundShellMembers(members);
      try { assert.equal(result.looseTolerance,.012); }
      finally { disposeBrep(result); }
    }
    const tight = await compoundShellMembers([bodies[2]]);
    try { assert.equal(tight.looseTolerance,undefined); }
    finally { disposeBrep(tight); }
  } finally { bodies.forEach(disposeBrep); }
});

test("shelling one solid reports the export-blocking native tolerance of its untouched sibling", async () => {
  const bodies = [];
  try {
    for (const x of [0,8]) bodies.push(await makeBrepExtrusion({axis:"z",from:0,to:4,
      points:[[x,0],[x+4,0],[x+4,4],[x,4]].map(([u,v])=>({u,v}))}));
    const sibling = bodies[1], oc = sibling.oc;
    const setter = new oc.ShapeFix_ShapeTolerance();
    try { setter.SetTolerance(sibling.shape,.012,oc.TopAbs_ShapeEnum.TopAbs_VERTEX); }
    finally { setter.delete(); }
    sibling.looseTolerance = .012;
    const source = await compoundShellMembers(bodies);
    bodies.push(source);
    assert.equal(source.looseTolerance,.012);
    const opening = extractBrepTopology(source).topology.find(face => face.kind==="face" &&
      face.descriptor.normal.z>.99 && face.descriptor.origin.x<4);
    const result = await shellBrep(source,.5,{facePersistentIds:[opening.persistentId]});
    bodies.push(result);
    const native = await validateBrepForExport(result,{maxToleranceCm:.02});
    assert.equal(native.solidCount,2);
    assert.equal(native.maxToleranceCm,.012);
    await assert.rejects(validateBrepForExport(result),/body tolerance exceeds/);
    assert.equal(result.looseTolerance,native.maxToleranceCm);
  } finally { bodies.reverse().forEach(disposeBrep); }
});

test("inward Shell rejects loose edges and vertices even when also present beneath a solid", async () => {
  const boxes = [], owned = [];
  try {
    for (const x of [0,8]) boxes.push(await makeBrepExtrusion({axis:"z",from:0,to:2,
      points:[[x,0],[x+2,0],[x+2,2],[x,2]].map(([u,v])=>({u,v}))}));
    const oc = boxes[0].oc;
    for (const type of [oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_VERTEX]) {
      const explorer = new oc.TopExp_Explorer_2(boxes[0].shape,type,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      owned.push(explorer);
      const loose = explorer.Current();
      owned.push(loose);
      const nested = await compoundBrep([{oc,shape:loose}]);
      try {
        for (const solids of [boxes.slice(0,1),boxes]) {
          const mixed = await compoundBrep([...solids,nested]);
          try {
            const opening = extractBrepTopology(mixed).topology.find(f=>f.kind==="face" && f.descriptor.normal.z>.99);
            await assert.rejects(shellBrep(mixed,.25,{facePersistentIds:[opening.persistentId]}),/geometry outside a solid/);
          } finally {disposeBrep(mixed);}
        }
      } finally {disposeBrep(nested);}
    }
  } finally { owned.reverse().forEach(handle=>handle.delete()); boxes.forEach(disposeBrep); }
});

test("openings on separate solids shell both, and an override needs an opening on its owner", async () => {
  const boxes = [], results = [];
  try {
    for (const x of [0,10]) boxes.push(await makeBrepExtrusion({axis:"z",from:0,to:4,
      points:[[x,0],[x+4,0],[x+4,4],[x,4]].map(([u,v])=>({u,v}))}));
    const body = await compoundBrep(boxes);
    results.push(body);
    const faces = extractBrepTopology(body).topology.filter(f=>f.kind==="face");
    const caps = faces.filter(f=>f.descriptor.normal.z>.99).sort((a,b)=>a.descriptor.origin.x-b.descriptor.origin.x);
    assert.equal(caps.length,2);
    await assert.rejects(shellBrep(body,.5,{facePersistentIds:[caps[0].persistentId],
      faceThicknesses:[{facePersistentId:caps[1].persistentId,thickness:.7}]}),/opening on the same native solid/);
    await assert.rejects(shellBrep(body,.5,{facePersistentIds:[caps[0].persistentId,"missing"]}),/could not be resolved/);
    const result = await shellBrep(body,.5,{facePersistentIds:caps.map(f=>f.persistentId)});
    results.push(result);
    const checked = await validateBrepForExport(result);
    assert.equal(checked.solidCount,2);
    assert.ok(Math.abs(checked.volumeCm3-2*(64-3*3*3.5))<1e-6);
  } finally {results.reverse().forEach(disposeBrep);boxes.forEach(disposeBrep);}
});
