// What a sketch encloses, as opposed to what its endpoints connect.
//
// analyzeSketchProfiles() answers the topology question a stored profile needs;
// these tests pin the arrangement that a feature needs, where two curves that
// merely cross still bound an area — the case an extrude cut has to remove.

import test from "node:test";
import assert from "node:assert/strict";
import { featureAreas, sketchRegions, loopInteriorPoint, pointInLoop } from "../js/sketch_regions.js";
import { analyzeSketchProfiles } from "../js/sketch_profiles.js";

function rectangle(prefix, x0, y0, x1, y1) {
  const ids = [0, 1, 2, 3].map((n) => prefix + "p" + n);
  const points = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y], i) => ({ id:ids[i], x, y }));
  const entities = ids.map((id, i) => ({ id:prefix + "e" + i, type:"line", a:id, b:ids[(i + 1) % 4] }));
  return { points, entities };
}
function doc(...parts) {
  return {
    points:parts.flatMap((p) => p.points),
    entities:parts.flatMap((p) => p.entities),
    constraints:[],
  };
}
function circle(prefix, cx, cy, r) {
  return { points:[{ id:prefix + "c", x:cx, y:cy }], entities:[{ id:prefix, type:"circle", c:prefix + "c", r }] };
}
function line(prefix, x0, y0, x1, y1) {
  return {
    points:[{ id:prefix + "a", x:x0, y:y0 }, { id:prefix + "b", x:x1, y:y1 }],
    entities:[{ id:prefix, type:"line", a:prefix + "a", b:prefix + "b" }],
  };
}

test("a single rectangle is one region with the area it draws", () => {
  const run = sketchRegions(doc(rectangle("r", 0, 0, 10, 4)));
  assert.equal(run.regions.length, 1);
  assert.ok(Math.abs(run.regions[0].area - 40) < 1e-6);
  assert.equal(run.regions[0].holes.length, 0);
});

/* The case that started this: two shapes that overlap enclose one area, and a
   cut has to remove all of it. The endpoint graph sees two untouched loops and
   the old feature path took only the larger one, so the overlap survived. */
test("overlapping shapes merge into one region covering both", () => {
  const sketch = doc(rectangle("a", 0, 0, 10, 10), rectangle("b", 6, 3, 16, 7));
  assert.equal(analyzeSketchProfiles(sketch).profiles.length, 2, "two loops, topologically");
  const run = sketchRegions(sketch);
  assert.equal(run.regions.length, 1);
  // union: 100 + 40 minus the 4 x 4 overlap
  assert.ok(Math.abs(run.regions[0].area - 124) < 1e-6, `union area ${run.regions[0].area}`);
});

test("shapes that do not touch stay separate regions", () => {
  const run = sketchRegions(doc(rectangle("a", 0, 0, 4, 4), circle("k", 20, 0, 3)));
  assert.equal(run.regions.length, 2);
  const areas = run.regions.map((r) => Math.round(r.area));
  assert.ok(areas.includes(16));
  assert.ok(areas.includes(Math.round(Math.PI * 9)));
});

test("a loop drawn inside another loop becomes its hole, not a second region", () => {
  const run = sketchRegions(doc(rectangle("o", 0, 0, 20, 20), rectangle("i", 5, 5, 10, 10)));
  assert.equal(run.regions.length, 1);
  assert.equal(run.regions[0].holes.length, 1);
  assert.ok(Math.abs(run.regions[0].holes[0].area - 25) < 1e-6);
});

test("an island inside a hole is solid again", () => {
  const run = sketchRegions(doc(
    rectangle("o", 0, 0, 40, 40), rectangle("h", 10, 10, 30, 30), rectangle("i", 15, 15, 25, 25),
  ));
  assert.equal(run.regions.length, 2);
  assert.ok(Math.abs(run.regions[0].area - 1600) < 1e-6);
  assert.ok(Math.abs(run.regions[1].area - 100) < 1e-6);
});

/* A line drawn across a shape is what "cut through lines" means: the crossing
   splits the shape into cells the sketch never joined end to end. The outline
   is unchanged — a cut still takes the whole shape — but the pieces are there
   for anything that needs them. */
test("a line drawn across a shape splits it into faces without changing the outline", () => {
  const run = sketchRegions(doc(rectangle("r", 0, 0, 10, 10), line("cut", -4, 5, 14, 5)));
  assert.equal(run.regions.length, 1);
  assert.ok(Math.abs(run.regions[0].area - 100) < 1e-6);
  const faces = run.faces.map((f) => Math.round(f.area)).sort((a, b) => a - b);
  assert.deepEqual(faces, [50, 50], "the crossing splits the rectangle in two");
});

test("geometry that encloses nothing yields no region", () => {
  assert.equal(sketchRegions(doc(line("a", 0, 0, 10, 0), line("b", 0, 4, 10, 4))).regions.length, 0);
  // an L that never closes, and a stub poking out of nothing
  assert.equal(sketchRegions(doc(line("a", 0, 0, 10, 0), line("b", 10, 0, 10, 8))).regions.length, 0);
});

test("a stub sticking out of a closed shape is pruned away", () => {
  const run = sketchRegions(doc(rectangle("r", 0, 0, 10, 10), line("stub", 10, 5, 18, 5)));
  assert.equal(run.regions.length, 1);
  assert.ok(Math.abs(run.regions[0].area - 100) < 1e-6);
});

test("construction geometry is not material", () => {
  const sketch = doc(rectangle("r", 0, 0, 10, 10));
  sketch.entities.push({ id:"ref", type:"line", a:"rp0", b:"rp2", construction:true });
  const run = sketchRegions(sketch);
  assert.equal(run.regions.length, 1);
  assert.equal(run.faces.length, 1, "the construction diagonal splits nothing");
});

test("a closed region keeps the entity ids that bound it", () => {
  const run = sketchRegions(doc(rectangle("r", 0, 0, 10, 10)));
  assert.deepEqual(run.regions[0].entityIds.slice().sort(), ["re0", "re1", "re2", "re3"]);
});

test("the interior point of an L-shape is inside the L, unlike its centroid", () => {
  // an L drawn as one closed chain; its average point sits in the missing corner
  const points = [[0, 0], [10, 0], [10, 3], [3, 3], [3, 10], [0, 10]];
  const loop = points.map(([u, v]) => ({ u, v }));
  const centroid = { u:loop.reduce((s, q) => s + q.u, 0) / loop.length, v:loop.reduce((s, q) => s + q.v, 0) / loop.length };
  assert.equal(pointInLoop(centroid, loop), false, "the centroid is outside the L");
  assert.equal(pointInLoop(loopInteriorPoint(loop), loop), true);
});

test("a big sketch of many circles still resolves in reasonable time", () => {
  const parts = [];
  for (let i = 0; i < 40; i++) parts.push(circle("c" + i, (i % 8) * 7, Math.floor(i / 8) * 7, 4));
  const started = process.hrtime.bigint();
  const run = sketchRegions(doc(...parts));
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(run.regions.length >= 1);
  assert.ok(ms < 2000, `arrangement took ${Math.round(ms)} ms`);
});

/* ---- what a feature is handed ---- */

function areasOf(sketch, selectedIds = []) {
  return featureAreas(analyzeSketchProfiles(sketch, { selectedIds }), sketchRegions(sketch), selectedIds);
}

test("an ordinary closed loop is still handed over as a parametric profile", () => {
  const areas = areasOf(doc(rectangle("r", 0, 0, 10, 10)));
  assert.equal(areas.length, 1);
  assert.deepEqual(areas[0].entityIds.slice().sort(), ["re0", "re1", "re2", "re3"]);
  assert.equal(areas[0].holes.length, 0);
});

/* The reported bug: a cut was built from one loop, so everything the other
   loops enclosed stayed behind. Every area now goes to the feature. */
test("two separate loops are two areas, biggest first", () => {
  const areas = areasOf(doc(rectangle("a", 0, 0, 4, 4), rectangle("b", 20, 0, 30, 10)));
  assert.equal(areas.length, 2);
  assert.ok(areas[0].area > areas[1].area);
  areas.forEach((area) => assert.ok(area.entityIds, "each stays parametric"));
});

test("a nested loop rides along as a hole rather than as its own area", () => {
  const areas = areasOf(doc(rectangle("o", 0, 0, 20, 20), rectangle("i", 5, 5, 10, 10)));
  assert.equal(areas.length, 1);
  assert.equal(areas[0].holes.length, 1);
  assert.deepEqual(areas[0].holeEntityIds[0].slice().sort(), ["ie0", "ie1", "ie2", "ie3"]);
});

/* An area born from a crossing has no chain of whole entities behind it, so it
   cannot claim to be parametric — resolveProfilePoints would never find it. */
test("an area made by crossing geometry carries points, not a false profile reference", () => {
  const areas = areasOf(doc(rectangle("a", 0, 0, 10, 10), rectangle("b", 6, 3, 16, 7)));
  assert.equal(areas.length, 1);
  assert.equal(areas[0].entityIds, null);
  assert.ok(areas[0].points.length > 4);
  assert.ok(pointInLoop(areas[0].interior, areas[0].points));
});

test("selecting geometry narrows the feature to the areas that geometry bounds", () => {
  const sketch = doc(rectangle("a", 0, 0, 4, 4), rectangle("b", 20, 0, 30, 10));
  const areas = areasOf(sketch, ["ae0"]);
  assert.equal(areas.length, 1);
  assert.ok(Math.abs(areas[0].area - 16) < 1e-6);
});

test("selecting something that bounds no area falls back to every area", () => {
  const sketch = doc(rectangle("a", 0, 0, 4, 4), line("loose", 40, 0, 50, 0));
  assert.equal(areasOf(sketch, ["loose"]).length, 1);
});

/* Overlapping loops fusing into one area is the whole point of the arrangement
   — but only among the loops a feature is actually allowed to act on. A circle
   already extruded into a boss, with a slot later drawn across it in the same
   sketch, must not come back fused to that slot and be inflated a second time. */
test("scoping the arrangement separates a new profile from one a feature already owns", () => {
  const sketch = {
    points: [
      { id: "c", x: 10, y: 0 },
      { id: "a1", x: -20, y: -2 }, { id: "b1", x: 6, y: -2 },
      { id: "b0", x: 6, y: 2 }, { id: "a0", x: -20, y: 2 },
      { id: "ca", x: -20, y: 0 }, { id: "cb", x: 6, y: 0 },
    ],
    entities: [
      { id: "circle", type: "circle", c: "c", r: 8 },
      { id: "side1", type: "line", a: "a1", b: "b1" },
      { id: "capB", type: "arc", c: "cb", a: "b1", b: "b0" },
      { id: "side0", type: "line", a: "b0", b: "a0" },
      { id: "capA", type: "arc", c: "ca", a: "a0", b: "a1" },
    ],
  };
  const slotIds = ["side1", "capB", "side0", "capA"];
  const analysis = analyzeSketchProfiles(sketch, {});
  const circleArea = Math.PI * 64, slotArea = 26 * 4 + Math.PI * 4;

  // the whole sketch: one fused area, and no chain to name it by
  const whole = featureAreas(analysis, sketchRegions(sketch, { tolerance: 0.05 }), []);
  assert.equal(whole.length, 1);
  assert.ok(whole[0].area > circleArea, "the crossing loops enclose more than either of them");
  assert.equal(whole[0].entityIds, null, "a fused area has no parametric chain");
  // selecting the slot cannot separate it: the fused outline is bounded by both
  assert.equal(featureAreas(analysis, sketchRegions(sketch, { tolerance: 0.05 }), slotIds)[0].area, whole[0].area);

  // arranged over the slot alone, it is the slot — and it stays parametric
  const scoped = featureAreas(analysis, sketchRegions(sketch, { tolerance: 0.05, entityIds: slotIds }), []);
  assert.equal(scoped.length, 1);
  assert.ok(Math.abs(scoped[0].area - slotArea) < slotArea * 0.05, "the slot's own area: " + scoped[0].area);
  assert.deepEqual(scoped[0].entityIds.slice().sort(), slotIds.slice().sort());

  // and the circle on its own is still the circle
  const justCircle = featureAreas(analysis, sketchRegions(sketch, { tolerance: 0.05, entityIds: ["circle"] }), []);
  assert.equal(justCircle.length, 1);
  assert.ok(Math.abs(justCircle[0].area - circleArea) < circleArea * 0.05);
  assert.deepEqual(justCircle[0].entityIds, ["circle"]);
});
