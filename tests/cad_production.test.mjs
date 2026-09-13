import test from "node:test";
import assert from "node:assert/strict";
import { addFeature, ensureFeatureTree, reorderFeature, resolveSketchExtrusion } from "../js/cad_feature_tree.js";
import { createDrawingSvg } from "../js/cad_drawings.js";
import { addEdgeFlange, bendAllowance, createSheetMetalPart, flatPattern } from "../js/cad_sheet_metal.js";
import { MATE_REQUIREMENT, mateFrameSupports, mateRequirementFor, solveTopologyMates, topologyReference } from "../js/cad_mates.js";
import { eulerMatrix, matrixEuler, mul, normalizePose, quatMatrix, rotationOf, rotationVectorMatrix, setRotation } from "../js/cad_mate_model.js";

test("mate frame validation matches the geometry each mate needs", () => {
  const origin = { x: 0, y: 0, z: 0 };
  const normal = { x: 0, y: 1, z: 0 };
  const axis = { x: 1, y: 0, z: 0 };
  assert.equal(mateFrameSupports("planar", { surface: "plane", origin, normal }), true);
  assert.equal(mateFrameSupports("planar", { surface: "cylinder", origin, normal }), false,
    "a cylinder normal is not a planar reference");
  assert.equal(mateFrameSupports("planar", { surface: "plane", origin, normal: { x: 0, y: 0, z: 0 } }), false);
  assert.equal(mateFrameSupports("planar", { curve: "circle", origin, axis, radius: 2 }), true,
    "a circular edge lies in a plane and is a valid coincident reference");
  assert.equal(mateFrameSupports("axis", { surface: "cylinder", origin, axis }), true);
  assert.equal(mateFrameSupports("axis", { curve: "circle", origin, axis, radius: 2 }), true);
  assert.equal(mateFrameSupports("axis", { surface: "cylinder", axis }), false,
    "an axis without a place cannot position a component");
  assert.equal(mateFrameSupports("round", { surface: "cylinder", origin, axis, radius: 2 }), true);
  assert.equal(mateFrameSupports("round", { curve: "circle", origin, axis, radius: 2 }), true);
  assert.equal(mateFrameSupports("round", { surface: "cylinder", origin, axis, radius: 0 }), false);
  assert.equal(mateFrameSupports("round", { surface: "cylinder", origin, normal, radius: 2 }), false);
});

test("feature tree retains ordered parametric dependencies", () => {
  const def = {};
  const a = addFeature(def, {type:"box",params:{w:10,h:10,d:10}});
  const b = addFeature(def, {type:"cylinder",params:{r:2,h:10}});
  const cut = addFeature(def, {type:"subtract",inputs:[a.id,b.id]});
  assert.equal(ensureFeatureTree(def).length, 3);
  assert.equal(cut.inputs[0], a.id);
  assert.equal(reorderFeature(def, cut.id, 2), true);
});

test("drawing generator produces three associative orthographic views", () => {
  const svg = createDrawingSvg({name:"Bracket",parts:[{kind:"box",x0:0,x1:20,y0:0,y1:5,z0:0,z1:10}]});
  assert.match(svg, /FRONT/); assert.match(svg, /TOP/); assert.match(svg, /RIGHT/);
  assert.match(svg, /Bracket/);
  // the overall width, dimensioned from the projection rather than the caption
  assert.match(svg, /<text[^>]*>20<\/text>/);
  // a real sheet says which projection convention it was drawn in, and prints
  // at the paper size its title block claims
  assert.match(svg, /THIRD ANGLE/);
  assert.match(svg, /width="420mm" height="297mm"/);
  // ISO line weights: visible outlines heavier than dimensions
  assert.match(svg, /stroke-width="0.5"/);
});

test("sheet metal flat pattern carries bend allowance and deduction", () => {
  const sheet = createSheetMetalPart({thickness:0.2,insideRadius:0.3,kFactor:0.4,base:{width:20,height:10}});
  addEdgeFlange(sheet,"right",4,90);
  const flat = flatPattern(sheet);
  assert.equal(flat.bends.length,1);
  assert.ok(flat.bends[0].allowance > 0);
  assert.equal(flat.bends[0].allowance,bendAllowance(90,0.3,0.2,0.4));
});

test("face mate aligns component frame origins", () => {
  const frameA={surface:"plane",origin:{x:5,y:0,z:0},normal:{x:1,y:0,z:0}};
  const frameB={surface:"plane",origin:{x:0,y:0,z:0},normal:{x:-1,y:0,z:0}};
  const assembly={components:[
    {id:"a",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[{id:"m",type:"coincident",a:topologyReference("a","face","fa",frameA),b:topologyReference("b","face","fb",frameB)}]};
  const result=solveTopologyMates(assembly);
  assert.equal(result.ok,true);
  assert.equal(assembly.components[1].transform.x,5);
});

test("circular-edge coincident and concentric both place a component", () => {
  const circleA = { curve: "circle", origin: { x: 0, y: 8, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 2 };
  const circleB = { curve: "circle", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 2 };
  const coincident = {
    components: [
      { id: "a", grounded: true, transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: "b", transform: { x: 12, y: 4, z: 0, rx: 0, ry: 0, rz: 0 } },
    ],
    topologyMates: [{
      id: "m", type: "coincident",
      a: topologyReference("a", "edge", "ea", circleA),
      b: topologyReference("b", "edge", "eb", circleB),
    }],
  };
  const coincidentResult = solveTopologyMates(coincident);
  assert.equal(coincidentResult.ok, true, "two hole rims are a valid coincident pair");
  assert.equal(Math.round(coincident.components[1].transform.y), 8);

  const concentric = {
    components: [
      { id: "a", grounded: true, transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: "b", transform: { x: 12, y: 0, z: 3, rx: 0, ry: 0, rz: 0 } },
    ],
    topologyMates: [{
      id: "m", type: "concentric",
      a: topologyReference("a", "edge", "ea", circleA),
      b: topologyReference("b", "edge", "eb", circleB),
    }],
  };
  const concentricResult = solveTopologyMates(concentric);
  assert.equal(concentricResult.ok, true, "two hole rims are a valid concentric pair");
  assert.ok(Math.abs(concentric.components[1].transform.x) < 0.05, "concentric should share the axis in X");
  assert.ok(Math.abs(concentric.components[1].transform.z) < 0.05, "concentric should share the axis in Z");
});

test("face mates are stable across repeated assembly rebuilds", () => {
  const frameA={surface:"plane",origin:{x:5,y:0,z:0},normal:{x:1,y:0,z:0}};
  const frameB={surface:"plane",origin:{x:-5,y:0,z:0},normal:{x:-1,y:0,z:0}};
  const assembly={components:[
    {id:"a",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:30,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[{id:"m",type:"coincident",a:topologyReference("a","face","fa",frameA),b:topologyReference("b","face","fb",frameB)}]};
  solveTopologyMates(assembly);
  assert.equal(assembly.components[1].transform.x,10);
  solveTopologyMates(assembly);
  assert.equal(assembly.components[1].transform.x,10);
});

test("a face-mated component follows its reference component", () => {
  const frameA={surface:"plane",origin:{x:5,y:0,z:0},normal:{x:1,y:0,z:0}};
  const frameB={surface:"plane",origin:{x:-5,y:0,z:0},normal:{x:-1,y:0,z:0}};
  const assembly={components:[
    {id:"a",transform:{x:4,y:2,z:-3,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:30,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[{id:"m",type:"coincident",a:topologyReference("a","face","fa",frameA),b:topologyReference("b","face","fb",frameB)}]};
  const IDENTITY={q:{x:0,y:0,z:0,w:1},rx:0,ry:0,rz:0};
  solveTopologyMates(assembly);
  // The quaternion is the orientation; rx/ry/rz mirror it for the renderer.
  assert.deepEqual(assembly.components[1].transform,{x:14,y:0,z:0,...IDENTITY});
  assembly.components[0].transform.y=12;
  solveTopologyMates(assembly);
  assert.deepEqual(assembly.components[1].transform,{x:14,y:0,z:0,...IDENTITY});
});

test("legacy assembly-space mate frames migrate once without rebuild drift", () => {
  const legacyA={componentId:"a",kind:"face",persistentId:"fa",frame:{surface:"plane",origin:{x:5,y:0,z:0},normal:{x:1,y:0,z:0}}};
  const legacyB={componentId:"b",kind:"face",persistentId:"fb",frame:{surface:"plane",origin:{x:25,y:0,z:0},normal:{x:-1,y:0,z:0}}};
  const assembly={components:[
    {id:"a",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:30,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[{id:"m",type:"coincident",a:legacyA,b:legacyB}]};
  solveTopologyMates(assembly);
  const first=assembly.components[1].transform.x;
  solveTopologyMates(assembly);
  assert.equal(assembly.components[1].transform.x,first);
  assert.equal(legacyA.frameSpace,"component");
  assert.equal(legacyB.frameSpace,"component");
});

test("concentric mates rotate axes exactly and remain stable", () => {
  const axisA={surface:"cylinder",origin:{x:0,y:4,z:0},normal:{x:0,y:1,z:0},axis:{x:0,y:1,z:0}};
  const axisB={surface:"cylinder",origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0},axis:{x:1,y:0,z:0}};
  const assembly={components:[
    {id:"a",grounded:true,transform:{x:2,y:3,z:4,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:20,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[{id:"m",type:"concentric",a:topologyReference("a","axis","aa",axisA),b:topologyReference("b","axis","ab",axisB)}]};
  solveTopologyMates(assembly);
  const first={...assembly.components[1].transform};
  assert.ok(Math.abs(first.rz-90)<1e-8);
  assert.deepEqual({x:first.x,y:first.y,z:first.z},{x:2,y:0,z:4});
  solveTopologyMates(assembly);
  assert.ok(Math.abs(assembly.components[1].transform.rz-first.rz)<1e-8);
  assert.deepEqual({x:assembly.components[1].transform.x,y:assembly.components[1].transform.y,z:assembly.components[1].transform.z},{x:2,y:0,z:4});
});

// NB: sketch entities carry `type`, not `kind` — `kind` is the solid-part
// field. This fixture used to say `kind`, which no sketch the editor produces
// has ever had; the old resolver simply never looked at the field.
test("sketch-backed extrusion resolves its live closed profile", () => {
  const def = { sketch: { points: [
    { id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 },
    { id: "c", x: 10, y: 8 }, { id: "d", x: 0, y: 8 },
  ], entities: [
    { id: "e1", type: "line", a: "a", b: "b" }, { id: "e2", type: "line", a: "b", b: "c" },
    { id: "e3", type: "line", a: "c", b: "d" }, { id: "e4", type: "line", a: "d", b: "a" },
  ] } };
  const resolved = resolveSketchExtrusion(def, { axis: "y", from: 0, to: 5, profileEntityIds: ["e1", "e2", "e3", "e4"] });
  assert.equal(resolved.points.length, 4);
  assert.deepEqual(resolved.points[2], { u: 10, v: 8 });
});

test("a profile whose loop was broken is refused rather than silently reshaped", () => {
  const def = { sketch: { points: [
    { id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }, { id: "c", x: 10, y: 8 },
  ], entities: [
    { id: "e1", type: "line", a: "a", b: "b" }, { id: "e2", type: "line", a: "b", b: "c" },
  ] } };
  assert.throws(() => resolveSketchExtrusion(def, { profileEntityIds: ["e1", "e2"] }), /open|missing/);
  assert.throws(() => resolveSketchExtrusion(def, { profileEntityIds: ["e1", "gone"] }), /open|missing/);
});

/* Both of these mates used to change the model on every rebuild, and the
   viewport re-solves on each one. A screw with a fractional turn count spun a
   further half turn each time; an angle mate walked past its target and stuck
   at whatever value the unsigned measurement happened to reach. */
test("screw mates hold one roll across repeated solves", () => {
  const axis={surface:"cylinder",origin:{x:0,y:0,z:0},normal:{x:0,y:1,z:0},axis:{x:0,y:1,z:0}};
  const assembly={components:[
    {id:"a",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:30,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[{id:"m",type:"screw",pitch:.5,turns:.5,
    a:topologyReference("a","axis","aa",axis),b:topologyReference("b","axis","ab",axis)}]};
  solveTopologyMates(assembly);
  const settled={...assembly.components[1].transform};
  assert.ok(Math.abs(settled.y-.25)<1e-9, "half a turn advances half a pitch");
  for (let pass=0; pass<3; pass++) {
    solveTopologyMates(assembly);
    for (const key of ["x","y","z","rx","ry","rz"]) {
      assert.ok(Math.abs(assembly.components[1].transform[key]-settled[key])<1e-8, key+" drifted on re-solve");
    }
  }
});

test("angle mates reach the angle asked for and stay there", () => {
  const faceA={surface:"plane",origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}};
  const faceB={surface:"plane",origin:{x:0,y:0,z:0},normal:{x:0,y:0,z:1}};
  const assembly={components:[
    {id:"a",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[{id:"m",type:"angle",value:45,
    a:topologyReference("a","face","fa",faceA),b:topologyReference("b","face","fb",faceB)}]};
  solveTopologyMates(assembly);
  const measure = () => {
    const t=assembly.components[1].transform, y=t.ry*Math.PI/180, x=t.rx*Math.PI/180, z=t.rz*Math.PI/180;
    const a=Math.cos(x), b=Math.sin(x), c=Math.cos(y), d=Math.sin(y), e=Math.cos(z), f=Math.sin(z);
    // component-local +Z turned into assembly space, then the angle it makes
    // with the fixed component's +X face normal
    const n={x:d, y:-b*c, z:a*c};
    return Math.acos(Math.max(-1,Math.min(1,n.x)))*180/Math.PI;
  };
  assert.ok(Math.abs(measure()-45)<1e-6, "first solve lands on 45, got "+measure());
  solveTopologyMates(assembly);
  solveTopologyMates(assembly);
  assert.ok(Math.abs(measure()-45)<1e-6, "angle drifted on re-solve, got "+measure());
});

test("angle mates escape parallel stationary poses and report endpoint freedom", () => {
  const face={surface:"plane",origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}};
  const build=(value)=>({components:[
    {id:"a",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[{id:"m",type:"angle",value,
    a:topologyReference("a","face","fa",face),b:topologyReference("b","face","fb",face)}]});

  const angled=build(35), angledResult=solveTopologyMates(angled);
  assert.equal(angledResult.ok,true,"a valid angle must not be discarded as over-constrained");
  assert.deepEqual(angledResult.unsatisfied,[]);
  assert.equal(angledResult.degreesOfFreedom,5,"an interior angle removes one rotational freedom");

  const opposed=build(180), opposedResult=solveTopologyMates(opposed);
  assert.equal(opposedResult.ok,true,"a half-turn angle must escape the parallel starting pose");
  assert.equal(opposedResult.degreesOfFreedom,4,
    "an anti-parallel endpoint fixes the normal's two rotational freedoms");
});

/* The solver stores every pose it probes as rx/ry/rz and reads it straight
   back as a matrix, so matrixEuler has to be an exact inverse of eulerMatrix.
   Anything it drops is a motion the assembly cannot make. */
test("a pose survives the round trip through Euler angles, including at the poles", () => {
  const worst = (a, b) => Math.max(...a.flatMap((row, i) => row.map((v, j) => Math.abs(v - b[i][j]))));
  const trip = (transform) => worst(eulerMatrix(transform), eulerMatrix(matrixEuler(eulerMatrix(transform))));
  for (const ry of [0, 45, 89, 89.999, 90, 90.001, -90, -89.999, 91]) {
    assert.ok(trip({ rx: 0, ry, rz: 0 }) < 1e-9, `ry=${ry} survives the round trip`);
    assert.ok(trip({ rx: 20, ry, rz: 35 }) < 1e-9, `rx/ry=${ry}/rz survives the round trip`);
  }
  /* The Jacobian probe: a 1e-5 rad nudge off a pose sitting exactly on the
     pole. Guarding gimbal lock on |m02| against a fat epsilon collapsed the Z
     turn to zero for anything within ~0.026° of the pole, so this nudge came
     back as no rotation at all and the Z column measured as identically
     zero — a rigid assembly then reported a freedom it did not have. */
  const pole = eulerMatrix({ rx: 0, ry: -90, rz: 0 });
  for (const axis of [{ x: 1e-5, y: 0, z: 0 }, { x: 0, y: 1e-5, z: 0 }, { x: 0, y: 0, z: 1e-5 }]) {
    const nudged = mul(rotationVectorMatrix(axis), pole);
    assert.ok(worst(nudged, eulerMatrix(matrixEuler(nudged))) < 1e-9,
      `a nudge about (${axis.x},${axis.y},${axis.z}) off the pole is not thrown away`);
  }
});

test("the freedom left does not depend on where Euler angles happen to be singular", () => {
  const plane = (n) => ({ surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: n });
  const pair = (mate) => ({ components: [
    { id: "a", grounded: true, transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    { id: "b", transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
  ], topologyMates: [mate] });

  /* One coincident face mate takes the same freedoms away whichever pair of
     faces it joins. The X-to-Z pair is the one that lands on ry = ±90°. */
  const coincident = (nA, nB) => {
    const assembly = pair({ id: "m", type: "coincident",
      a: topologyReference("a", "face", "fa", plane(nA)), b: topologyReference("b", "face", "fb", plane(nB)) });
    const result = solveTopologyMates(assembly);
    assert.equal(result.ok, true);
    return result.degreesOfFreedom;
  };
  const X = { x: 1, y: 0, z: 0 }, Y = { x: 0, y: 1, z: 0 }, Z = { x: 0, y: 0, z: 1 };
  const baseline = coincident(X, Y);
  assert.equal(coincident(X, Z), baseline, "a mate that solves onto the Euler pole takes the same freedoms");
  assert.equal(coincident(Y, Z), baseline);
  assert.equal(coincident(X, X), baseline);

  /* Same assembly, only the angle asked for changes. The reported freedom used
     to climb 0 -> 1 -> 2 as the angle approached 90° and fall back after it. */
  const angled = (value) => {
    const assembly = pair({ id: "m", type: "angle", value,
      a: topologyReference("a", "face", "fa", plane(X)), b: topologyReference("b", "face", "fb", plane(X)) });
    const result = solveTopologyMates(assembly);
    assert.equal(result.ok, true, `${value}° solves`);
    return result.degreesOfFreedom;
  };
  for (const value of [30, 60, 89, 89.999, 90, 90.001, 91, 120]) {
    assert.equal(angled(value), 5, `an interior angle of ${value}° removes exactly one rotational freedom`);
  }
});

/* `transform.q` is the orientation; rx/ry/rz mirror it for the renderer and
   for anything that reads a document written before the quaternion. */
test("the quaternion is the orientation and the Euler triple mirrors it", () => {
  const worst = (a, b) => Math.max(...a.flatMap((row, i) => row.map((v, j) => Math.abs(v - b[i][j]))));
  const plane = (o, n) => ({ surface: "plane", origin: o, normal: n });
  const build = (transform) => ({ components: [
    { id: "a", grounded: true, transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    { id: "b", transform },
  ], topologyMates: [{ id: "m", type: "concentric",
    a: topologyReference("a", "axis", "fa", { surface: "cylinder", origin: { x: 0, y: 4, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 3 }),
    b: topologyReference("b", "axis", "fb", { surface: "cylinder", origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, radius: 3 }) }] });

  // A document written before the quaternion has one derived from its angles.
  const legacy = build({ x: 20, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
  assert.equal(solveTopologyMates(legacy).ok, true);
  const solved = legacy.components[1].transform;
  assert.ok(solved.q, "the solve leaves a quaternion behind");
  assert.ok(worst(quatMatrix(solved.q), eulerMatrix(solved)) < 1e-9,
    "the written triple describes the same orientation as the quaternion");

  // Re-solving a document that already carries one changes nothing at all.
  const settled = JSON.stringify(solved);
  solveTopologyMates(legacy);
  assert.equal(JSON.stringify(legacy.components[1].transform), settled,
    "re-solving is byte-identical, so a save is stable");

  // A missing or unusable quaternion falls back to the angles rather than
  // leaving the component in an orientation nobody asked for.
  for (const broken of [{ x: 0, y: 0, z: 0, w: 0 }, { x: NaN, y: 0, z: 0, w: 1 }, null, "nope"]) {
    const assembly = build({ x: 20, y: 0, z: 0, rx: 0, ry: 0, rz: 90, q: broken });
    assert.equal(solveTopologyMates(assembly).ok, true, `q=${JSON.stringify(broken)} still solves`);
    assert.ok(Math.abs(assembly.components[1].transform.rz - 90) < 1e-6);
  }
});

/* A usable quaternion is the orientation, whatever the angles beside it say or
   fail to say. Deciding between the two by comparing them — asking which looks
   like the newer edit — cannot tell a deliberate change from the mirror's own
   rounding, and read a transform carrying nothing but a valid quaternion (the
   natural shape for anything written against this contract) as an edit back to
   identity: the orientation was destroyed on the next normalize. */
test("a valid quaternion survives whatever state its mirror is in", () => {
  const worst = (a, b) => Math.max(...a.flatMap((row, i) => row.map((v, j) => Math.abs(v - b[i][j]))));
  const quarterTurnY = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
  const want = quatMatrix(quarterTurnY);

  const shapes = {
    "no mirror at all": { x: 0, y: 0, z: 0 },
    "mirror in step": { x: 0, y: 0, z: 0, rx: 0, ry: 90, rz: 0 },
    "mirror half written": { x: 0, y: 0, z: 0, rx: 0, ry: 90 },
    "mirror NaN": { x: 0, y: 0, z: 0, rx: NaN, ry: NaN, rz: NaN },
    "mirror stale": { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
  };
  for (const [label, base] of Object.entries(shapes)) {
    const transform = { ...base, q: { ...quarterTurnY } };
    normalizePose(transform);
    assert.ok(worst(want, rotationOf(transform)) < 1e-9, `${label}: the quaternion is kept`);
    assert.ok(worst(want, eulerMatrix(transform)) < 1e-9, `${label}: the mirror is derived from it`);
    assert.ok(Math.abs(transform.ry - 90) < 1e-6, `${label}: and reads as 90° (got ${transform.ry})`);
  }

  // The same through a whole solve, on a component no mate constrains.
  const assembly = { components: [
    { id: "a", grounded: true, transform: { x: 0, y: 0, z: 0, q: { ...quarterTurnY } } },
  ], topologyMates: [] };
  solveTopologyMates(assembly);
  assert.ok(worst(want, rotationOf(assembly.components[0].transform)) < 1e-9,
    "a solve does not move a component nothing constrains");
});

/* An editor that lets somebody type an angle says so, at the point of the
   edit. This is the contract the three of them keep (modeler's transform
   inspector and drag restore, and cad_motion_study's rotary motor); without
   it `q` still describes where the component used to be and the next
   normalize puts it straight back. */
test("an angle typed into a transform becomes the orientation", () => {
  const worst = (a, b) => Math.max(...a.flatMap((row, i) => row.map((v, j) => Math.abs(v - b[i][j]))));
  const transform = normalizePose({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });

  // Writing the mirror alone is not an edit: q still holds, as it must.
  transform.ry = 37;
  normalizePose(transform);
  assert.equal(transform.ry, 0, "a mirror write on its own is re-derived away");

  // Going through setRotation is.
  transform.ry = 37;
  setRotation(transform, eulerMatrix(transform));
  normalizePose(transform);
  assert.ok(Math.abs(transform.ry - 37) < 1e-9, "an edit made through setRotation sticks");
  assert.ok(worst(quatMatrix(transform.q), eulerMatrix(transform)) < 1e-9, "and the two agree");
});

/* The whole point of carrying the orientation as a quaternion: an angle mate
   asked for 90° puts a component exactly on the Euler pole, where composing a
   pose through rx/ry/rz could only hold it to about 1e-11 rad — above the
   residual target the solve uses to decide it has finished, so the answer was
   discarded and the mate reported as contradictory. */
test("an angle mate is honoured on both sides of the Euler pole", () => {
  const plane = (n) => ({ surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: n });
  const X = { x: 1, y: 0, z: 0 };
  const achieved = (value) => {
    const assembly = { components: [
      { id: "a", grounded: true, transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: "b", transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    ], topologyMates: [{ id: "m", type: "angle", value,
      a: topologyReference("a", "face", "fa", plane(X)), b: topologyReference("b", "face", "fb", plane(X)) }] };
    const result = solveTopologyMates(assembly);
    const rotation = rotationOf(assembly.components[1].transform);
    const turned = { x: rotation[0][0], y: rotation[1][0], z: rotation[2][0] };
    const angle = Math.acos(Math.max(-1, Math.min(1, turned.x))) * 180 / Math.PI;
    return { ok: result.ok, angle, unsatisfied: result.unsatisfied.length };
  };
  for (const value of [89.99, 89.999, 89.9999, 90, 90.0001, 90.001, 90.01]) {
    const got = achieved(value);
    assert.equal(got.ok, true, `${value}° is honoured`);
    assert.equal(got.unsatisfied, 0, `${value}° is not reported as contradictory`);
    assert.ok(Math.abs(got.angle - value) < 1e-6, `${value}° lands within a millionth of a degree (got ${got.angle})`);
  }
});

/* Both XYZ triples for an orientation reconstruct it exactly, so which one is
   written down is free to be the one a person would recognise. */
test("the written angles take the short way round", () => {
  const plane = (n) => ({ surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: n });
  const X = { x: 1, y: 0, z: 0 };
  const written = (value) => {
    const assembly = { components: [
      { id: "a", grounded: true, transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: "b", transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    ], topologyMates: [{ id: "m", type: "angle", value,
      a: topologyReference("a", "face", "fa", plane(X)), b: topologyReference("b", "face", "fb", plane(X)) }] };
    solveTopologyMates(assembly);
    return assembly.components[1].transform;
  };
  // 91° used to be written (180, -89, 180): the same orientation, unreadable.
  for (const value of [91, 100, 135]) {
    const t = written(value);
    assert.ok(Math.abs(t.rx) < 1e-6 && Math.abs(t.rz) < 1e-6,
      `${value}° is one turn about Y, not a half turn on three axes (got ${t.rx}, ${t.ry}, ${t.rz})`);
    assert.ok(Math.abs(Math.abs(t.ry) - value) < 1e-5, `${value}° reads as ${value}° (got ${t.ry})`);
  }
});

test("a drawing balloons the list it is handed rather than one per outline", () => {
  const draw = createDrawingSvg;
  const def = { kind: "assembly", name: "Rig", parts: [
    { kind: "box", name: "Frame", x0:0, x1:20, y0:0, y1:5, z0:0, z1:10 },
    { kind: "box", name: "Frame", x0:20, x1:40, y0:0, y1:5, z0:0, z1:10 },
  ]};
  const rows = (svg) => (svg.match(/>Frame</g) || []).length;
  assert.equal(rows(draw(def, {})), 2, "one parts-list row per outline when nothing better is handed in");
  const perItem = draw(def, { balloons: [{ item: 1, name: "Frame", qty: 2 }] });
  assert.equal(rows(perItem), 1, "two of one part is one line item");
  assert.match(perItem, /DESCRIPTION/, "the list is a parts table on the sheet");
});

/* One pass down the mate list places a component against whatever pose the
   components before it happened to have, so a chain listed back to front never
   settled. Repeating the pass does, because every step is an absolute
   placement rather than a nudge. */
test("mates settle a chain listed in the wrong order", () => {
  const plane = (o, n) => ({ surface: "plane", origin: o, normal: n });
  const comp = (id, x, grounded) => ({ id, grounded: !!grounded, transform: { x, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } });
  const assembly = { components: [comp("a", 0, true), comp("b", 80), comp("c", 200)], topologyMates: [
    // c is mated to b first, while b is still nowhere near its own mate
    { id: "cb", type: "coincident",
      a: topologyReference("b", "face", "bf", plane({x:5,y:0,z:0}, {x:1,y:0,z:0})),
      b: topologyReference("c", "face", "cf", plane({x:-5,y:0,z:0}, {x:-1,y:0,z:0})) },
    { id: "ba", type: "coincident",
      a: topologyReference("a", "face", "af", plane({x:5,y:0,z:0}, {x:1,y:0,z:0})),
      b: topologyReference("b", "face", "bf2", plane({x:-5,y:0,z:0}, {x:-1,y:0,z:0})) },
  ]};
  const result = solveTopologyMates(assembly);
  assert.equal(result.ok, true);
  assert.equal(result.settled, true);
  assert.equal(assembly.components[1].transform.x, 10, "b sits on a");
  assert.equal(assembly.components[2].transform.x, 20, "c follows b, not b's stale pose");
  solveTopologyMates(assembly);
  assert.equal(assembly.components[2].transform.x, 20, "settled chain does not drift");
});

/* Repetition cannot satisfy two mates that want different things. The last one
   still wins — what changed is that the loser is now reported instead of
   looking exactly like a mate that holds. */
test("a mate another mate overrides is reported, not hidden", () => {
  const plane = (o, n) => ({ surface: "plane", origin: o, normal: n });
  const held = topologyReference("b", "face", "bf", plane({x:0,y:0,z:0}, {x:-1,y:0,z:0}));
  const assembly = { components: [
    { id: "a", grounded: true, transform: { x:0,y:0,z:0,rx:0,ry:0,rz:0 } },
    { id: "c", grounded: true, transform: { x:0,y:0,z:0,rx:0,ry:0,rz:0 } },
    { id: "b", transform: { x:5,y:0,z:0,rx:0,ry:0,rz:0 } },
  ], topologyMates: [
    { id: "m1", type: "coincident", a: topologyReference("a", "face", "af", plane({x:0,y:0,z:0}, {x:1,y:0,z:0})), b: held },
    { id: "m2", type: "coincident", a: topologyReference("c", "face", "cf", plane({x:100,y:0,z:0}, {x:1,y:0,z:0})), b: held },
  ]};
  const result = solveTopologyMates(assembly);
  assert.equal(result.ok, false, "an assembly with a broken mate is not ok");
  assert.deepEqual(result.unsatisfied.map((entry) => entry.mate), ["m1"]);
  assert.ok(result.unsatisfied[0].linear > 99, "the report carries how far out it is");
  assert.equal(assembly.components[2].transform.x, 100, "the last mate still wins");
  solveTopologyMates(assembly);
  assert.equal(assembly.components[2].transform.x, 100, "and the outcome is the same on every rebuild");
});

test("the caller's own mates run inside the loop, not once before it", () => {
  const assembly = { components: [
    { id: "a", grounded: true, transform: { x:0,y:0,z:0,rx:0,ry:0,rz:0 } },
    { id: "b", transform: { x:9,y:0,z:0,rx:0,ry:0,rz:0 } },
  ], topologyMates: [] };
  let passes = 0;
  const result = solveTopologyMates(assembly, { beforePass: () => { passes++; } });
  assert.ok(passes >= 1, "the hook runs at the head of every pass");
  assert.equal(result.ok, true);
});

/* The gate the editor puts in front of the mate buttons and the gate the solver
   puts in front of placing a mate have to be the same gate. They were not: the
   solver accepted `axis || normal` where the editor demanded a real axis, so a
   mate the buttons refused could still be built by SmartMate and then be
   placed — wrongly but silently. Both now ask mateFrameSupports, and this
   walks every mate type against frames that satisfy each requirement and frames
   that do not, asserting the solver refuses exactly what the gate refuses. */
test("the solver refuses exactly the frames the mate buttons refuse", () => {
  const FRAMES = {
    plane: { surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
    axis: { surface: "cylinder", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 } },
    round: { surface: "cylinder", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 2 },
    circle: { curve: "circle", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 2 },
    // the shape that started this: a flat face offered where an axis is needed
    normalOnly: { surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
    placeless: { surface: "cylinder", axis: { x: 0, y: 1, z: 0 }, radius: 2 },
  };
  const solverRefuses = (type, frame) => {
    const assembly = {
      components: [
        { id: "a", grounded: true, transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
        { id: "b", transform: { x: 7, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      ],
      topologyMates: [{
        id: "m", type, pitch: 0.2, turns: 0, value: 0,
        a: topologyReference("a", "face", "fa", frame),
        b: topologyReference("b", "face", "fb", frame),
      }],
    };
    const result = solveTopologyMates(assembly);
    const refused = result.issues.some((issue) => issue.mate === "m" && /invalid-.*-frame/.test(issue.code));
    // a refused mate must also have left the component exactly where it was
    if (refused) assert.equal(assembly.components[1].transform.x, 7, type + " moved a component it refused");
    return refused;
  };

  for (const type of ["coincident", "distance", "limit", "angle", "concentric", "screw", "tangent"]) {
    const requirement = mateRequirementFor(type);
    for (const [name, frame] of Object.entries(FRAMES)) {
      const gateAllows = mateFrameSupports(requirement, frame);
      assert.equal(solverRefuses(type, frame), !gateAllows,
        type + " and the " + name + " frame: the gate and the solver disagree");
    }
  }
});

test("the requirement table covers every mate type the editor can build", () => {
  // an unlisted type would silently fall through to "planar" and be placed by
  // rules it was never checked against
  for (const type of ["coincident", "distance", "limit", "angle", "concentric", "screw", "tangent"]) {
    assert.ok(MATE_REQUIREMENT[type], type + " has no stated requirement");
  }
  assert.equal(mateRequirementFor("something-new"), "planar", "an unknown type falls back to the strictest common case");
});

test("a face mate flips a component whose faces point the same way along the mate axis", () => {
  /* Both normals are +Y, so satisfying the mate is a straight flip about a
     horizontal axis. The turn used to be attempted about Y itself, which
     leaves a pair of vertical normals exactly where they were. */
  const frameA={surface:"plane",origin:{x:0,y:5,z:0},normal:{x:0,y:1,z:0}};
  const frameB={surface:"plane",origin:{x:0,y:0,z:0},normal:{x:0,y:1,z:0}};
  const assembly={components:[
    {id:"a",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:0,y:20,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[{id:"m",type:"coincident",a:topologyReference("a","face","fa",frameA),b:topologyReference("b","face","fb",frameB)}]};
  const result=solveTopologyMates(assembly);
  assert.equal(result.ok,true,"the flipped face should end up facing the fixed one");
  assert.deepEqual(result.unsatisfied,[]);
});

test("a cycle of mates that cannot all hold is diagnosed, not split down the middle", () => {
  /* Neither component is grounded and each mate places one against the other,
     ten centimetres apart in opposite directions. There is no pose that
     honours both. Solving the system as one finds that at the first attempt —
     the solve stops improving while both mates are still out — and re-solves
     without the older of the two, so the assembly lands exactly where its
     newer mate asks instead of at the halfway pose that satisfies neither. */
  const face=(x,nx)=>({surface:"plane",origin:{x,y:0,z:0},normal:{x:nx,y:0,z:0}});
  const assembly={components:[
    {id:"a",transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[
    {id:"m1",type:"distance",value:10,a:topologyReference("a","face","fa",face(0,1)),b:topologyReference("b","face","fb",face(0,-1))},
    {id:"m2",type:"distance",value:10,a:topologyReference("b","face","fb",face(0,1)),b:topologyReference("a","face","fa",face(0,-1))},
  ]};
  const result=solveTopologyMates(assembly);
  assert.equal(result.ok,false);
  assert.deepEqual(result.unsatisfied.map((entry)=>[entry.mate,entry.code]),[["m1","over-constrained"]]);
  assert.equal(assembly.components[0].transform.x,10,"the surviving mate is honoured exactly");
  assert.equal(assembly.components[1].transform.x,0,"the component only the dropped mate moved stays put");
  solveTopologyMates(assembly);
  assert.equal(assembly.components[0].transform.x,10,"and the same document solves the same way twice");
  assert.equal(assembly.components[1].transform.x,0);
});

test("conflict diagnosis keeps older mates that agree with the newest mate", () => {
  const face={surface:"plane",origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}};
  const assembly={components:[
    {id:"a",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[0,10,0].map((value,index)=>({
    id:"m"+(index+1),type:"distance",value,aligned:true,
    a:topologyReference("a","face","fa"+index,face),
    b:topologyReference("b","face","fb"+index,face),
  }))};
  const result=solveTopologyMates(assembly);
  assert.deepEqual(result.unsatisfied.map((entry)=>entry.mate),["m2"],
    "the agreeing oldest mate is redundant, not over-constrained");
  assert.equal(assembly.components[1].transform.x,0,"the newest mate still wins");
});

/* Solving every mate at once, rather than placing one component at a time and
   repeating the list, is what these three are about. */
test("the order mates are listed in does not change where the components land", () => {
  const plane=(o,n)=>({surface:"plane",origin:o,normal:n});
  const build=(order)=>{
    const mates=[
      {id:"ba",type:"coincident",
        a:topologyReference("a","face","af",plane({x:5,y:0,z:0},{x:1,y:0,z:0})),
        b:topologyReference("b","face","bf",plane({x:-5,y:0,z:0},{x:-1,y:0,z:0}))},
      {id:"cb",type:"coincident",
        a:topologyReference("b","face","bf2",plane({x:5,y:0,z:0},{x:1,y:0,z:0})),
        b:topologyReference("c","face","cf",plane({x:-5,y:0,z:0},{x:-1,y:0,z:0}))},
    ];
    return {components:[
      {id:"a",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
      {id:"b",transform:{x:80,y:0,z:0,rx:0,ry:0,rz:0}},
      {id:"c",transform:{x:200,y:0,z:0,rx:0,ry:0,rz:0}},
    ],topologyMates:order==="reversed"?mates.reverse():mates};
  };
  const forward=build("listed"), backward=build("reversed");
  solveTopologyMates(forward); solveTopologyMates(backward);
  assert.deepEqual(forward.components.map((c)=>c.transform),backward.components.map((c)=>c.transform));
  assert.equal(forward.components[2].transform.x,20);
});

test("the solve reports the freedom each component has left", () => {
  const plane=(o,n)=>({surface:"plane",origin:o,normal:n});
  const assembly={components:[
    {id:"a",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:40,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[{id:"m",type:"coincident",
    a:topologyReference("a","face","af",plane({x:0,y:0,z:0},{x:1,y:0,z:0})),
    b:topologyReference("b","face","bf",plane({x:0,y:0,z:0},{x:-1,y:0,z:0}))}]};
  const result=solveTopologyMates(assembly);
  assert.equal(result.ok,true);
  // A plane mate leaves two in-plane translations and rotation about its normal.
  assert.equal(result.degreesOfFreedom,3);
  assert.equal(result.clusters.length,1);
  assert.equal(result.clusters[0].perComponent.b,3);
});

test("components no chain of mates connects are solved as separate systems", () => {
  const plane=(o,n)=>({surface:"plane",origin:o,normal:n});
  const pair=(fixed,moving,at)=>({id:fixed+moving,type:"coincident",
    a:topologyReference(fixed,"face","af"+fixed,plane({x:at,y:0,z:0},{x:1,y:0,z:0})),
    b:topologyReference(moving,"face","bf"+moving,plane({x:0,y:0,z:0},{x:-1,y:0,z:0}))});
  const assembly={components:[
    {id:"a",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:50,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"c",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"d",transform:{x:90,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[pair("a","b",7),pair("c","d",13)]};
  const result=solveTopologyMates(assembly);
  assert.equal(result.ok,true);
  assert.equal(result.clusters.length,2,"two unrelated pairs are two systems, not one");
  assert.deepEqual(result.clusters.map((cluster)=>cluster.components).flat().sort(),["b","d"]);
  assert.equal(assembly.components[1].transform.x,7);
  assert.equal(assembly.components[3].transform.x,13);
});

test("the editor's older align mates are solved alongside the topology mates", () => {
  const plane=(o,n)=>({surface:"plane",origin:o,normal:n});
  const assembly={components:[
    {id:"a",grounded:true,transform:{x:0,y:6,z:0,rx:0,ry:0,rz:0}},
    {id:"b",transform:{x:30,y:0,z:0,rx:0,ry:0,rz:0}},
  ],
  mates:[{id:"legacy",type:"alignY",a:"a",b:"b"}],
  topologyMates:[{id:"m",type:"coincident",
    a:topologyReference("a","face","af",plane({x:5,y:0,z:0},{x:1,y:0,z:0})),
    b:topologyReference("b","face","bf",plane({x:-5,y:0,z:0},{x:-1,y:0,z:0}))}]};
  const result=solveTopologyMates(assembly);
  assert.equal(result.ok,true,"both kinds of mate hold at once");
  assert.equal(assembly.components[1].transform.x,10);
  assert.equal(assembly.components[1].transform.y,6);
});

/* A mate reads one component and moves another, so most assemblies decompose
   into small systems that can be solved one after another. What does not
   decompose is a loop, and those two cases are what these cover. */
test("a chain is solved as one small system per component, in dependency order", () => {
  const plane=(o,n)=>({surface:"plane",origin:o,normal:n});
  const components=[{id:"c0",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}}];
  const topologyMates=[];
  for (let i=1;i<=4;i++) {
    // deliberately nowhere near where the mate wants it, and listed last first
    components.push({id:"c"+i,transform:{x:400-40*i,y:0,z:0,rx:0,ry:0,rz:0}});
    topologyMates.unshift({id:"m"+i,type:"coincident",
      a:topologyReference("c"+(i-1),"face","a"+i,plane({x:10,y:0,z:0},{x:1,y:0,z:0})),
      b:topologyReference("c"+i,"face","b"+i,plane({x:0,y:0,z:0},{x:-1,y:0,z:0}))});
  }
  const result=solveTopologyMates({components,topologyMates});
  assert.equal(result.ok,true);
  assert.deepEqual(result.clusters.map((system)=>system.components),[["c1"],["c2"],["c3"],["c4"]],
    "four systems of one component, solved from the grounded end outwards");
  assert.deepEqual(components.map((component)=>component.transform.x),[0,10,20,30,40]);
});

test("components in a loop are solved together, and a loop with no answer names the mates that lost", () => {
  const plane=(o,n)=>({surface:"plane",origin:o,normal:n});
  const link=(from,to,id,at)=>({id,type:"coincident",
    a:topologyReference(from,"face","a"+id,plane({x:at,y:0,z:0},{x:1,y:0,z:0})),
    b:topologyReference(to,"face","b"+id,plane({x:0,y:0,z:0},{x:-1,y:0,z:0}))});
  const ring=(closing)=>({components:[
    {id:"c0",grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"c1",transform:{x:70,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:"c2",transform:{x:130,y:0,z:0,rx:0,ry:0,rz:0}},
  ],topologyMates:[link("c0","c1","m1",10),link("c1","c2","m2",10),link("c2","c1","m3",closing)]});

  /* c2 is placed from c1 and c1 from c2, so neither can be solved before the
     other and no order of placements settles them. Solved as one system they
     both land, because -10 back is the same relation as +10 out. */
  const closed=ring(-10);
  const result=solveTopologyMates(closed);
  assert.equal(result.ok,true);
  assert.deepEqual(result.clusters.map((system)=>system.components.slice().sort()),[["c1","c2"]],
    "the loop is one system, not two");
  assert.deepEqual(closed.components.map((component)=>component.transform.x),[0,10,20]);

  // the same ring asking to come back +10 instead of -10, which cannot close
  const impossible=ring(10);
  const broken=solveTopologyMates(impossible);
  assert.equal(broken.ok,false);
  /* The two loop edges contradict one another. Once the older moving edge is
     dropped, c2 is no longer a target of any surviving mate and therefore
     stays at its entry pose; the grounded edge then also conflicts with the
     newest closing edge. The directional contract never moves a component on
     behalf of a mate that was already rejected. */
  assert.deepEqual(broken.unsatisfied.map((entry)=>entry.mate),["m1","m2"]);
  assert.ok(broken.unsatisfied.every((entry)=>entry.code === "over-constrained"),
    "the mates contradict each other, which is not the same as being too hard to solve");
});
