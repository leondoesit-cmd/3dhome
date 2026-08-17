import test from "node:test";
import assert from "node:assert/strict";
import { addFeature, ensureFeatureTree, reorderFeature, resolveSketchExtrusion } from "../js/cad_feature_tree.js";
import { createDrawingSvg } from "../js/cad_drawings.js";
import { addEdgeFlange, bendAllowance, createSheetMetalPart, flatPattern } from "../js/cad_sheet_metal.js";
import { solveTopologyMates, topologyReference } from "../js/cad_mates.js";

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
  assert.match(svg, /Bracket/); assert.match(svg, /20 cm/);
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
  solveTopologyMates(assembly);
  assert.deepEqual(assembly.components[1].transform,{x:14,y:2,z:-3,rx:0,ry:0,rz:0});
  assembly.components[0].transform.y=12;
  solveTopologyMates(assembly);
  assert.deepEqual(assembly.components[1].transform,{x:14,y:12,z:-3,rx:0,ry:0,rz:0});
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
  assert.deepEqual({x:first.x,y:first.y,z:first.z},{x:2,y:7,z:4});
  solveTopologyMates(assembly);
  assert.ok(Math.abs(assembly.components[1].transform.rz-first.rz)<1e-8);
  assert.deepEqual({x:assembly.components[1].transform.x,y:assembly.components[1].transform.y,z:assembly.components[1].transform.z},{x:2,y:7,z:4});
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
