import test from "node:test";
import assert from "node:assert/strict";
import {
  solveSketch, removeSketchEntity, pruneOrphanPoints,
  ensureSketch, ensureSketchDoc, addSketch, removeSketch, sketchById, resolveProfilePoints,
} from "../js/sketch_solver.js";
import { resolveSketchExtrusion } from "../js/cad_feature_tree.js";
import { addSmartDimension, currentMeasure, distanceDimensionLayout, drawSketchDimensions, hitSketchDimension } from "../js/sketch_dimensions.js";
import { trimEntity, extendEntity, offsetEntity } from "../js/sketch_trim.js";
import { analyzeSketchProfiles, healSketchEndpoints, pointInProfile, profileCentroid } from "../js/sketch_profiles.js";

test("parametric sketch solver satisfies distance and horizontal constraints", () => {
  const sketch = {
    points: [
      { id: "a", x: 0, y: 0, fixed: true },
      { id: "b", x: 13, y: 7 },
    ],
    entities: [{ id: "l", type: "line", a: "a", b: "b" }],
    constraints: [
      { id: "h", type: "horizontal", entity: "l" },
      { id: "d", type: "distance", entity: "l", value: 25 },
    ],
  };
  const result = solveSketch(sketch);
  assert.equal(result.converged, true);
  assert.ok(Math.abs(sketch.points[1].y) < 1e-4);
  assert.ok(Math.abs(Math.abs(sketch.points[1].x) - 25) < 1e-4);
});

test("a placed smart-ruler dimension keeps its offset and is easy to grab", () => {
  const sketch = {
    points: [{ id:"a", x:0, y:0 }, { id:"b", x:40, y:0 }],
    entities: [],
    constraints: [{ id:"dim", type:"distance", a:"a", b:"b", value:40, offset:15 }],
  };
  const toPx = (x, y) => ({ x:x * 2 + 10, y:y * 2 + 20 });
  const layout = distanceDimensionLayout(sketch, sketch.constraints[0], toPx);
  assert.equal(layout.offset, 35);
  assert.deepEqual(layout.a, { x:10, y:55 });
  assert.deepEqual(layout.b, { x:90, y:55 });
  assert.equal(hitSketchDimension(sketch, layout.label.x + 8, layout.label.y - 4, toPx)?.id, "dim");
  assert.equal(hitSketchDimension(sketch, 200, 200, toPx), null);
});

test("a circle radius leader projects a real sketch-plane rim point", () => {
  const sketch = {
    points: [{ id:"c", x:2, y:3 }],
    entities: [{ id:"circle", type:"circle", c:"c", r:8 }],
    constraints: [{ id:"radius", type:"radius", entity:"circle", value:8 }],
  };
  const lines = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, moveTo(x, y) { lines.push(["move", x, y]); },
    lineTo(x, y) { lines.push(["line", x, y]); }, stroke() {}, fillText() {},
  };
  const toPx = (x, y) => ({ x:10 + x * 3, y:20 + y * 0.5 });
  drawSketchDimensions(ctx, sketch, 999, toPx);
  const direction = -Math.PI / 4;
  const expected = toPx(2 + Math.cos(direction) * 8, 3 + Math.sin(direction) * 8);
  assert.deepEqual(lines[0], ["move", 16, 21.5]);
  assert.ok(Math.abs(lines[1][1] - expected.x) < 1e-9);
  assert.ok(Math.abs(lines[1][2] - expected.y) < 1e-9);
});

test("parametric sketch solver supports parallel, equal and coincident rules", () => {
  const sketch = {
    points: [
      { id: "a", x: 0, y: 0, fixed: true }, { id: "b", x: 20, y: 0, fixed: true },
      { id: "c", x: 4, y: 8, fixed: true }, { id: "d", x: 11, y: 16 },
    ],
    entities: [
      { id: "base", type: "line", a: "a", b: "b" },
      { id: "copy", type: "line", a: "c", b: "d" },
    ],
    constraints: [
      { id: "p", type: "parallel", a: "base", b: "copy" },
      { id: "e", type: "equal", a: "base", b: "copy" },
    ],
  };
  const result = solveSketch(sketch);
  assert.equal(result.converged, true);
  const c = sketch.points[2], d = sketch.points[3];
  assert.ok(Math.abs(d.y - c.y) < 1e-4);
  assert.ok(Math.abs(Math.hypot(d.x - c.x, d.y - c.y) - 20) < 1e-4);
});

test("solver reports degrees of freedom for an unconstrained line", () => {
  const sketch = {
    points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 4 }],
    entities: [{ id: "l", type: "line", a: "a", b: "b" }],
    constraints: [],
  };
  const result = solveSketch(sketch);
  assert.equal(result.status, "under-constrained");
  assert.equal(result.degreesOfFreedom, 4);
});

/* ---- circles, arcs and the constraints that only make sense with them ---- */

test("a dimensioned rectangle is fully defined and lands on its dimensions", () => {
  const sketch = {
    points: [
      { id: "p1", x: 0, y: 0 }, { id: "p2", x: 40, y: 3 },
      { id: "p3", x: 38, y: 25 }, { id: "p4", x: -2, y: 22 },
    ],
    entities: [
      { id: "l1", type: "line", a: "p1", b: "p2" }, { id: "l2", type: "line", a: "p2", b: "p3" },
      { id: "l3", type: "line", a: "p3", b: "p4" }, { id: "l4", type: "line", a: "p4", b: "p1" },
    ],
    constraints: [
      { id: "c1", type: "horizontal", entity: "l1" }, { id: "c2", type: "vertical", entity: "l2" },
      { id: "c3", type: "horizontal", entity: "l3" }, { id: "c4", type: "vertical", entity: "l4" },
      { id: "c5", type: "fixed", point: "p1", x: 0, y: 0 },
      { id: "c6", type: "distance", entity: "l1", value: 50 },
      { id: "c7", type: "distance", entity: "l2", value: 30 },
    ],
  };
  const result = solveSketch(sketch);
  assert.equal(result.status, "fully-constrained");
  assert.equal(result.degreesOfFreedom, 0);
  const p3 = sketch.points[2];
  assert.ok(Math.abs(p3.x - 50) < 1e-3 && Math.abs(p3.y - 30) < 1e-3);

  // editing the dimension drives the geometry, which is the whole point
  sketch.constraints.find((c) => c.id === "c6").value = 80;
  solveSketch(sketch);
  assert.ok(Math.abs(sketch.points[1].x - 80) < 1e-3);
});

test("contradictory dimensions are reported as a conflict, naming the constraints", () => {
  const sketch = {
    points: [{ id: "a", x: 0, y: 0, fixed: true }, { id: "b", x: 10, y: 0 }],
    entities: [{ id: "l", type: "line", a: "a", b: "b" }],
    constraints: [
      { id: "d1", type: "distance", entity: "l", value: 40 },
      { id: "d2", type: "distance", entity: "l", value: 12 },
    ],
  };
  const result = solveSketch(sketch);
  assert.equal(result.status, "conflicting");
  assert.ok(result.conflicts.length > 0);
});

test("a radius dimension drives a circle, and concentric ties two together", () => {
  const sketch = {
    points: [{ id: "c1", x: 0, y: 0 }, { id: "c2", x: 7, y: 2 }],
    entities: [
      { id: "C1", type: "circle", c: "c1", r: 5 },
      { id: "C2", type: "circle", c: "c2", r: 9 },
    ],
    constraints: [
      { id: "f", type: "fixed", point: "c1", x: 0, y: 0 },
      { id: "r1", type: "radius", entity: "C1", value: 12 },
      { id: "cc", type: "concentric", a: "C1", b: "C2" },
    ],
  };
  solveSketch(sketch);
  assert.ok(Math.abs(sketch.entities[0].r - 12) < 1e-3);
  assert.ok(Math.hypot(sketch.points[1].x, sketch.points[1].y) < 1e-3);
});

test("a tangent line settles exactly one radius away from the circle centre", () => {
  const sketch = {
    points: [{ id: "c", x: 0, y: 0 }, { id: "a", x: -20, y: 9 }, { id: "b", x: 20, y: 9 }],
    entities: [{ id: "C", type: "circle", c: "c", r: 6 }, { id: "L", type: "line", a: "a", b: "b" }],
    constraints: [
      { id: "f", type: "fixed", point: "c", x: 0, y: 0 },
      { id: "h", type: "horizontal", entity: "L" },
      { id: "r", type: "radius", entity: "C", value: 6 },
      { id: "t", type: "tangent", a: "L", b: "C" },
    ],
  };
  solveSketch(sketch);
  assert.ok(Math.abs(Math.abs(sketch.points[1].y) - 6) < 1e-3);
});

test("an arc keeps both of its endpoints on one radius", () => {
  const sketch = {
    points: [{ id: "c", x: 0, y: 0 }, { id: "a", x: 10, y: 0 }, { id: "b", x: 0, y: 7 }],
    entities: [{ id: "A", type: "arc", c: "c", a: "a", b: "b" }],
    constraints: [{ id: "f", type: "fixed", point: "c", x: 0, y: 0 }],
  };
  solveSketch(sketch);
  const rA = Math.hypot(sketch.points[1].x, sketch.points[1].y);
  const rB = Math.hypot(sketch.points[2].x, sketch.points[2].y);
  assert.ok(Math.abs(rA - rB) < 1e-3);
});

test("symmetric mirrors two points across a line", () => {
  const sketch = {
    points: [
      { id: "m1", x: 0, y: 0, fixed: true }, { id: "m2", x: 0, y: 20, fixed: true },
      { id: "x", x: -5, y: 10 }, { id: "y", x: 9, y: 11 },
    ],
    entities: [{ id: "M", type: "line", a: "m1", b: "m2" }],
    constraints: [{ id: "s", type: "symmetric", a: "x", b: "y", entity: "M" }],
  };
  solveSketch(sketch);
  const [, , x, y] = sketch.points;
  assert.ok(Math.abs(x.x + y.x) < 1e-3);
  assert.ok(Math.abs(x.y - y.y) < 1e-3);
});

test("removing an entity drops its constraints and orphaned points", () => {
  const sketch = {
    points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }, { id: "c", x: 10, y: 9 }],
    entities: [
      { id: "l1", type: "line", a: "a", b: "b" },
      { id: "l2", type: "line", a: "b", b: "c" },
    ],
    constraints: [
      { id: "h", type: "horizontal", entity: "l1" },
      { id: "v", type: "vertical", entity: "l2" },
    ],
  };
  removeSketchEntity(sketch, "l1");
  assert.equal(sketch.entities.length, 1);
  assert.ok(!sketch.constraints.some((c) => c.entity === "l1"));
  // "b" is still drawn by l2, "a" is not drawn by anything
  assert.deepEqual(sketch.points.map((p) => p.id).sort(), ["b", "c"]);
});

/* ---- sketch editing tools ---- */

test("trim cuts a line back to its nearest crossing, keeping the far stub", () => {
  const sketch = {
    points: [
      { id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 },
      { id: "c", x: 50, y: -10 }, { id: "d", x: 50, y: 10 },
    ],
    entities: [
      { id: "L1", type: "line", a: "a", b: "b" },
      { id: "L2", type: "line", a: "c", b: "d" },
    ],
    constraints: [],
  };
  assert.equal(trimEntity(sketch, "L1", { x: 80, y: 0 }), true);
  const end = sketch.points.find((p) => p.id === sketch.entities[0].b);
  assert.ok(Math.abs(end.x - 50) < 1e-6);
});

test("extend reaches the next entity, and refuses when there is nothing to meet", () => {
  const make = (withTarget) => ({
    points: [
      { id: "a", x: 0, y: 0 }, { id: "b", x: 30, y: 0 },
      { id: "c", x: 80, y: -10 }, { id: "d", x: 80, y: 10 },
    ],
    entities: [{ id: "L1", type: "line", a: "a", b: "b" }].concat(
      withTarget ? [{ id: "L2", type: "line", a: "c", b: "d" }] : []),
    constraints: [],
  });
  const hit = make(true);
  assert.equal(extendEntity(hit, "L1", { x: 29, y: 0 }), true);
  assert.ok(Math.abs(hit.points[1].x - 80) < 1e-6);
  assert.equal(extendEntity(make(false), "L1", { x: 29, y: 0 }), false);
});

test("offset copies a line across and keeps the copy parallel to its parent", () => {
  const sketch = {
    points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }],
    entities: [{ id: "L", type: "line", a: "a", b: "b" }],
    constraints: [],
  };
  const copy = offsetEntity(sketch, "L", 5);
  assert.ok(copy);
  assert.equal(sketch.points.find((p) => p.id === copy.a).y, 5);
  assert.ok(sketch.constraints.some((c) => c.type === "parallel"));
});

test("a smart dimension measures what is there, then drives it", () => {
  const sketch = {
    points: [{ id: "a", x: 0, y: 0, fixed: true }, { id: "b", x: 10, y: 0 }],
    entities: [{ id: "L", type: "line", a: "a", b: "b" }],
    constraints: [],
  };
  assert.ok(Math.abs(currentMeasure(sketch, { type: "line", id: "L" }) - 10) < 1e-9);
  addSmartDimension(sketch, { type: "line", id: "L" }, 25);
  solveSketch(sketch);
  assert.ok(Math.abs(sketch.points[1].x - 25) < 1e-3);
});

test("trimming strands no points: a trimmed sketch can still be fully defined", () => {
  const sketch = {
    points: [
      { id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 },
      { id: "c", x: 50, y: -10 }, { id: "d", x: 50, y: 10 },
    ],
    entities: [
      { id: "L1", type: "line", a: "a", b: "b" },
      { id: "L2", type: "line", a: "c", b: "d" },
    ],
    constraints: [],
  };
  const before = solveSketch(sketch).degreesOfFreedom;
  trimEntity(sketch, "L1", { x: 80, y: 0 });
  // the old right-hand endpoint is gone, so the trim costs no extra freedom
  assert.equal(sketch.points.length, 4);
  assert.equal(solveSketch(sketch).degreesOfFreedom, before);
  assert.equal(pruneOrphanPoints(sketch), 0);
});

/* ---- sketches belong to planes ---- */

test("a legacy plane-less sketch migrates onto the top plane it was drawn on", () => {
  const def = { sketch: { points: [{ id: "a", x: 1, y: 2 }], entities: [{ id: "L", type: "line", a: "a", b: "a" }], constraints: [] } };
  const list = ensureSketchDoc(def);
  assert.equal(list.length, 1);
  assert.equal(list[0].plane, "top");
  assert.equal(list[0].entities.length, 1);
  assert.equal(def.sketch, undefined);       // the old field is gone, not shadowed
  assert.equal(def.activeSketch, list[0].id);
});

test("a document with no sketch at all gets one, and ensureSketch returns the active one", () => {
  const def = {};
  const first = ensureSketch(def);
  assert.equal(def.sketches.length, 1);
  assert.equal(first.plane, "top");
  const second = addSketch(def, "front", 12);
  assert.equal(def.activeSketch, second.id);
  assert.equal(ensureSketch(def).id, second.id);
  assert.equal(second.plane, "front");
  assert.equal(second.offset, 12);
  assert.equal(sketchById(def, first.id).id, first.id);
});

test("sketches keep their own geometry: editing one cannot touch the other", () => {
  const def = {};
  const top = ensureSketch(def);
  top.points.push({ id: "p", x: 5, y: 5 });
  const front = addSketch(def, "front", 0);
  front.points.push({ id: "q", x: 9, y: 9 });
  assert.equal(top.points.length, 1);
  assert.equal(front.points.length, 1);
  assert.notEqual(top.id, front.id);
});

test("removing a sketch moves the active pointer, and the last one cannot be removed", () => {
  const def = {};
  const a = ensureSketch(def);
  const b = addSketch(def, "front", 0);
  assert.equal(removeSketch(def, b.id), true);
  assert.equal(def.activeSketch, a.id);
  assert.equal(removeSketch(def, a.id), false, "a document always keeps one sketch");
  assert.equal(def.sketches.length, 1);
});

test("an extrusion resolves the sketch its profile came from, not whichever is active", () => {
  const def = {};
  const top = ensureSketch(def);
  top.points.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }, { id: "c", x: 10, y: 10 });
  top.entities.push(
    { id: "L1", type: "line", a: "a", b: "b" },
    { id: "L2", type: "line", a: "b", b: "c" },
    { id: "L3", type: "line", a: "c", b: "a" },
  );
  addSketch(def, "front", 0);                 // active is now the FRONT sketch
  const resolved = resolveSketchExtrusion(def, { profileEntityIds: ["L1", "L2", "L3"], sketchId: top.id });
  assert.equal(resolved.points.length, 3);
  assert.throws(() => resolveSketchExtrusion(def, { profileEntityIds: ["L1"], sketchId: def.activeSketch }),
    /missing/, "a profile pointed at the wrong sketch fails loudly");
});

/* ---- profiles resolve live, which is what makes a solid parametric ---- */

const squareSketch = () => ({
  plane: "top", offset: 0,
  points: [
    { id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 },
    { id: "c", x: 10, y: 6 }, { id: "d", x: 0, y: 6 },
  ],
  entities: [
    { id: "e1", type: "line", a: "a", b: "b" }, { id: "e2", type: "line", a: "b", b: "c" },
    { id: "e3", type: "line", a: "c", b: "d" }, { id: "e4", type: "line", a: "d", b: "a" },
  ],
  constraints: [],
});

test("a stored profile re-resolves from the sketch as it is now, not as it was", () => {
  const sketch = squareSketch();
  const ids = ["e1", "e2", "e3", "e4"];
  const before = resolveProfilePoints(sketch, ids);
  assert.equal(before.length, 4);

  // drive the sketch, exactly as a dimension edit would
  sketch.constraints.push({ id: "d1", type: "distance", entity: "e1", value: 40 });
  sketch.points[0].fixed = true;
  solveSketch(sketch);
  const after = resolveProfilePoints(sketch, ids);
  const width = Math.max(...after.map((p) => p.u)) - Math.min(...after.map((p) => p.u));
  assert.ok(Math.abs(width - 40) < 1e-3, `profile followed the dimension, got ${width}`);
});

test("profile resolution walks the loop in order regardless of how the ids are listed", () => {
  const sketch = squareSketch();
  const shuffled = resolveProfilePoints(sketch, ["e3", "e1", "e4", "e2"]);
  assert.equal(shuffled.length, 4);
  // consecutive points must actually be joined by an edge of the square
  for (let i = 0; i < shuffled.length; i++) {
    const a = shuffled[i], b = shuffled[(i + 1) % shuffled.length];
    assert.ok(Math.abs(a.u - b.u) < 1e-9 || Math.abs(a.v - b.v) < 1e-9, "edges stay axis-aligned, so the walk is in order");
  }
});

test("a broken, open or deleted profile resolves to null instead of a wrong shape", () => {
  const sketch = squareSketch();
  assert.equal(resolveProfilePoints(sketch, ["e1", "e2", "e3"]), null, "open loop");
  assert.equal(resolveProfilePoints(sketch, ["e1", "e2", "e3", "gone"]), null, "deleted entity");
  assert.equal(resolveProfilePoints(sketch, ["e1", "e3"]), null, "disconnected pieces");
  assert.equal(resolveProfilePoints(sketch, []), null);
});

test("a lone circle is a closed profile on its own", () => {
  const sketch = { points: [{ id: "c", x: 2, y: 3 }], entities: [{ id: "C", type: "circle", c: "c", r: 9 }], constraints: [] };
  const pts = resolveProfilePoints(sketch, ["C"]);
  assert.ok(pts.length >= 16);
  pts.forEach((p) => assert.ok(Math.abs(Math.hypot(p.u - 2, p.v - 3) - 9) < 1e-6));
  sketch.entities[0].r = 20;
  assert.ok(Math.abs(Math.hypot(resolveProfilePoints(sketch, ["C"])[0].u - 2, 0) - 20) < 1e-6, "and it follows its radius");
});

test("profile analysis tolerates a visually closed split endpoint and can heal it", () => {
  const sketch = {points:[
    {id:"a",x:0,y:0},{id:"b",x:10,y:0},{id:"c",x:10,y:8},{id:"d",x:0,y:8},{id:"almost",x:0.02,y:0.01},
  ],entities:[
    {id:"e1",type:"line",a:"a",b:"b"},{id:"e2",type:"line",a:"b",b:"c"},
    {id:"e3",type:"line",a:"c",b:"d"},{id:"e4",type:"line",a:"d",b:"almost"},
  ],constraints:[]};
  const analysis = analyzeSketchProfiles(sketch,{tolerance:0.05});
  assert.equal(analysis.profiles.length,1);
  assert.equal(analysis.nearMergeCount,1);
  assert.equal(healSketchEndpoints(sketch,analysis.profiles[0].entityIds,0.05),1);
  assert.equal(sketch.entities[3].b,"a");
  assert.ok(resolveProfilePoints(sketch,["e1","e2","e3","e4"]));
});

test("a valid loop remains usable when unrelated open geometry exists", () => {
  const sketch={points:[
    {id:"a",x:0,y:0},{id:"b",x:10,y:0},{id:"c",x:10,y:10},{id:"d",x:0,y:10},
    {id:"x",x:20,y:0},{id:"y",x:25,y:3},
  ],entities:[
    {id:"e1",type:"line",a:"a",b:"b"},{id:"e2",type:"line",a:"b",b:"c"},
    {id:"e3",type:"line",a:"c",b:"d"},{id:"e4",type:"line",a:"d",b:"a"},
    {id:"loose",type:"line",a:"x",b:"y"},
  ],constraints:[]};
  const analysis=analyzeSketchProfiles(sketch);
  assert.equal(analysis.status,"partial");
  assert.equal(analysis.profiles.length,1);
  assert.equal(analysis.openEnds.length,2);
});

test("nested loops are reported separately so the inner loop can become a hole", () => {
  const points=[],entities=[];
  const rectangle=(prefix,x0,y0,x1,y1)=>{
    const ids=[0,1,2,3].map((n)=>prefix+n);
    [[x0,y0],[x1,y0],[x1,y1],[x0,y1]].forEach(([x,y],i)=>points.push({id:ids[i],x,y}));
    ids.forEach((id,i)=>entities.push({id:prefix+"e"+i,type:"line",a:id,b:ids[(i+1)%4]}));
  };
  rectangle("o",0,0,20,20); rectangle("i",5,5,10,10);
  const analysis=analyzeSketchProfiles({points,entities,constraints:[]});
  assert.equal(analysis.profiles.length,2);
  assert.ok(Math.abs(analysis.profiles[0].area)>Math.abs(analysis.profiles[1].area));
  assert.equal(pointInProfile(profileCentroid(analysis.profiles[1].points),analysis.profiles[0].points),true);
});

test("a line and an arc can form an extrudable closed profile", () => {
  const sketch={points:[
    {id:"a",x:-5,y:0},{id:"b",x:5,y:0},{id:"c",x:0,y:0},
  ],entities:[
    {id:"line",type:"line",a:"b",b:"a"},
    {id:"arc",type:"arc",c:"c",a:"a",b:"b"},
  ],constraints:[]};
  const analysis=analyzeSketchProfiles(sketch);
  assert.equal(analysis.profiles.length,1);
  assert.ok(analysis.profiles[0].points.length>4);
  assert.ok(resolveProfilePoints(sketch,["line","arc"]));
});
