import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../vendor/three/three.core.js";
import { THREE } from "../js/three_lazy.js";
import { FURN, buildItem } from "../js/furniture.js";
import { itemEnvelope, forEachEnvelopeProjection } from "../js/room_bounce.js";

Object.assign(THREE, core);

function exhaustive(coords, geo, mat, visit) {
  const index = geo.index, count = index?.count ?? coords.length / 3;
  for (const section of Array.isArray(mat) ? geo.groups : [{start: 0, count}]) {
    const material = Array.isArray(mat) ? mat[section.materialIndex] : mat;
    if (!material) continue;
    for (let i = section.start; i + 2 < Math.min(count, section.start + section.count); i += 3) {
      const offsets = [i, i + 1, i + 2].map(j => 3 * (index ? index.getX(j) : j));
      for (let axis = 0; axis < 3; axis++) visit(...offsets, axis, material);
    }
  }
}

test("rejected catalogue projections leave per-material areas and floor contacts bit-identical", t => {
  const counts = [0, 0];
  for (const type of ["sofa", "bed", "rug", "floorLamp", "tableLamp", "toilet", "base", "fridge", "sink"]) {
    const group = new core.Group(), {w, h, d} = FURN[type];
    buildItem(group, {type, w, h, d, variant: "", rot: 0});
    group.rotation.y = 0.87;
    group.position.set(-230, 8.5, 650);
    const results = [exhaustive, forEachEnvelopeProjection].map((project, k) =>
      itemEnvelope(group.clone(), core, (coords, geo, mat, visit) =>
        project(coords, geo, mat, (...args) => { counts[k]++; visit(...args); })));
    assert.deepEqual(results[1], results[0], type);
  }
  t.diagnostic("projectTriangle calls: " + counts.join(" -> "));
  assert.ok(counts[1] < counts[0] * 0.7);
});

test("a triangle touching a half-integer sample keeps both projections along that axis", () => {
  const coords = new Float32Array([0.5, 1, 1, 0.25, 3, 2, 0.3, 2, 4]);
  const axes = [];
  const project = () => forEachEnvelopeProjection(coords, {}, {}, (_a, _b, _c, axis) => axes.push(axis));
  project();
  assert.deepEqual(axes, [0, 1, 2]);
  axes.length = 0;
  coords[0] = 0.49999997;
  project();
  assert.deepEqual(axes, [0]);
});

test("normalization retains both Float32 roundings with one write per coordinate", t => {
  let intermediateVertices = 0;
  class CountedVector extends core.Vector3 {
    toArray(dst, offset) {
      if (dst instanceof Float32Array) intermediateVertices++;
      return super.toArray(dst, offset);
    }
  }
  const group = new core.Group(), { w, h, d } = FURN.floorLamp;
  buildItem(group, { type: "floorLamp", variant: "arc", w, h, d });
  group.position.set(275.6, 0.04, -41.37);
  group.rotation.y = 1.2;
  group.updateWorldMatrix(true, true);
  const inv = group.matrixWorld.clone().invert(), bounds = new core.Box3(), parts = [];
  group.traverse(mesh => {
    if (!mesh.isMesh || !mesh.visible) return;
    const transform = inv.clone().multiply(mesh.matrixWorld);
    mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(transform));
    parts.push({ transform, pos: mesh.geometry.attributes.position });
  });
  const min = bounds.min.toArray(), span = bounds.getSize(new core.Vector3()).toArray();
  const point = new CountedVector();
  const original = parts.map(({ transform, pos }) => {
    const coords = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      point.fromBufferAttribute(pos, i).applyMatrix4(transform).toArray(coords, i * 3);
      for (let a = 0; a < 3; a++) coords[3 * i + a] = (coords[3 * i + a] - min[a]) * 12 / (span[a] || 1);
    }
    return coords;
  });
  const before = intermediateVertices;
  intermediateVertices = 0;
  let part = 0;
  itemEnvelope(group, { ...core, Vector3: CountedVector }, coords => {
    assert.deepEqual(coords, original[part++]);
  });
  assert.equal(part, parts.length);
  assert.ok(before > 100);
  assert.equal(intermediateVertices, 0);
  t.diagnostic("intermediate Float32 vertex writes: " + before + " -> 0");
});
