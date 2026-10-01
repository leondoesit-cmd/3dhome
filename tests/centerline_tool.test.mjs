import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sketchRegions } from "../js/sketch_regions.js";
import { toggleConstruction } from "../js/sketch_trim.js";

const source = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
const start = source.indexOf("function makeWallSegment(");
const end = source.indexOf("\nfunction finishWallChain(", start);

function sketchLineBuilder(sketch) {
  let next = 0;
  const uid = () => `centerline-${++next}`;
  const point = (doc, p) => {
    if (p.pointId && doc.points.some((q) => q.id === p.pointId)) return p.pointId;
    const id = uid();
    doc.points.push({ id, x: p.u, y: p.v });
    return id;
  };
  const state = { wallWidth: 5, _osnap: null, _suppressInference: false, dynamicMirror: null };
  const makeLine = new Function(
    "E", "sketchForView", "newSketchPoint", "uid", "sketchPoint", "inferTangentCircle",
    "inferLineRelations", "constraintAlreadyPresent", "resolveSketch", "pruneImpliedRelations", "solveSketch",
    source.slice(start, end) + ";return makeWallSegment;",
  )(state, () => sketch, point, uid,
    (doc, id) => doc.points.find((p) => p.id === id), () => null, () => [], () => false,
    () => {}, () => [], () => ({ status: "under-constrained" }));
  return makeLine;
}

test("a newly drawn centreline is construction geometry and never splits a solid profile", () => {
  const points = [[0, 0], [10, 0], [10, 10], [0, 10]].map(([x, y], i) => ({ id: `p${i}`, x, y }));
  const entities = points.map((p, i) => ({ id: `edge${i}`, type: "line", a: p.id, b: points[(i + 1) % 4].id }));
  const sketch = { points, entities, constraints: [] };
  const before = sketchRegions(sketch);
  assert.equal(before.faces.length, 1);

  const centerline = sketchLineBuilder(sketch)({ u: 0, v: 5 }, { u: 10, v: 5 }, { construction: true });
  assert.equal(centerline?.type, "line");
  assert.equal(centerline.name, "Centreline");
  assert.equal(centerline.construction, true);
  assert.equal(sketchRegions(sketch).faces.length, 1, "the centerline does not cut the profile into two faces");

  assert.equal(toggleConstruction(sketch, centerline.id), true, "selected geometry still toggles");
  assert.equal(centerline.construction, false);
  assert.equal(sketchRegions(sketch).faces.length, 2, "only regular sketch geometry divides the profile");
});

test("the same builder still creates a normal line and ignores coincident endpoints", () => {
  const sketch = { points: [], entities: [], constraints: [] };
  const makeLine = sketchLineBuilder(sketch);
  assert.equal(makeLine({ u: 0, v: 0 }, { u: 0, v: 0 }, { construction: true }), null);
  assert.equal(sketch.entities.length, 0);
  const line = makeLine({ u: 0, v: 0 }, { u: 4, v: 0 });
  assert.equal(line.construction, false);
  assert.equal(line.name, "Line");
});
