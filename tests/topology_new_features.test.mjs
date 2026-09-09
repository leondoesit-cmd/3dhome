/* Persistent names for the four newest features.
 *
 * thicken, rib, splitBody and moveBody were inheritance-only: they consumed
 * topology names and created none. A fillet taken on a face one of them made
 * therefore bound by extraction — matched against the rebuilt solid's geometry
 * — and lost its grip as soon as an upstream parameter moved. These tests are
 * about the names, and about the two cases deliberately left unnamed because a
 * wrong descriptor mis-binds worse than a missing one.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { topologyForFeature } from "../js/core/topology.js";

const plate = () => ({
  topology: topologyForFeature({ id: "plate", type: "box" }, { x0: 0, x1: 10, y0: 0, y1: 2, z0: 0, z1: 10 }),
});
const facesOf = (list) => list.filter((item) => item.kind === "face");
const bySemantic = (list, semantic) => list.filter((item) => item.semantic === semantic);
const created = (list, id) => list.filter((item) => item.ownerFeatureId === id && !item.inheritedBy);

test("a split names the face it cut, on each piece it kept", () => {
  const both = topologyForFeature({ id: "cut1", type: "splitBody" }, { axis: "y", offset: 1, keep: "both" }, [plate()]);
  const made = created(both, "cut1");
  assert.equal(made.length, 2, "one new face per piece");
  assert.ok(made.every((item) => item.persistentId.startsWith("cut1:face:cut-")), "and both are named, not extracted");
  assert.ok(made.every((item) => Math.abs(item.descriptor.origin.y - 1) < 1e-9), "on the plane the split was asked for");
  const up = made.find((item) => item.semantic === "cut-negative"), down = made.find((item) => item.semantic === "cut-positive");
  assert.equal(up.descriptor.normal.y, 1);
  assert.equal(down.descriptor.normal.y, -1, "the piece above the plane looks back down it");
  // and the name survives the parameter moving, which is the whole point
  const moved = created(topologyForFeature({ id: "cut1", type: "splitBody" }, { axis: "y", offset: 1.5, keep: "both" }, [plate()]), "cut1");
  assert.deepEqual(moved.map((item) => item.persistentId), made.map((item) => item.persistentId));
  assert.notEqual(moved[0].signature, made[0].signature, "the geometry moved, so the signature did too");
});

test("keeping one side of a split makes one face, not two", () => {
  ["positive", "negative"].forEach((keep) => {
    const list = created(topologyForFeature({ id: "cut1", type: "splitBody" }, { axis: "x", offset: 4, keep }, [plate()]), "cut1");
    assert.equal(list.length, 1, keep + " keeps one piece and so one cut face");
    assert.equal(list[0].semantic, "cut-" + keep);
  });
});

test("thicken names the offset twin of every face it was given", () => {
  const source = facesOf(plate().topology).find((item) => item.semantic === "top" || item.descriptor.normal.y === 1);
  const list = topologyForFeature({ id: "th1", type: "thicken" },
    { thickness: 3, direction: "outside", targets: [{ kind: "face", persistentId: source.persistentId, descriptor: source.descriptor }] },
    [plate()]);
  const made = created(list, "th1");
  assert.equal(made.length, 1);
  assert.equal(made[0].semantic, "offset");
  assert.ok(made[0].persistentId.includes(source.persistentId), "the twin is named after the face it came from");
  assert.ok(Math.abs(made[0].descriptor.origin.y - (source.descriptor.origin.y + 3)) < 1e-9, "pushed by the thickness");
  assert.deepEqual(made[0].descriptor.normal, source.descriptor.normal, "and facing the same way");

  const inward = created(topologyForFeature({ id: "th1", type: "thicken" },
    { thickness: 3, direction: "inside", targets: [{ kind: "face", persistentId: source.persistentId, descriptor: source.descriptor }] },
    [plate()]), "th1");
  assert.ok(Math.abs(inward[0].descriptor.origin.y - (source.descriptor.origin.y - 3)) < 1e-9, "inside pulls the other way");
});

test("a blind rib names its web the way an extrusion names a prism", () => {
  const line = [{ u: 0, v: 0 }, { u: 6, v: 0 }];
  const list = topologyForFeature({ id: "rib1", type: "rib" },
    { points: line, thickness: 2, side: "both", extent: "blind", depth: 5, direction: "forward", axis: "y", from: 0 },
    [plate()]);
  const made = created(list, "rib1");
  assert.ok(made.length >= 3, "start, end and a wall per side: " + made.map((item) => item.semantic).join(","));
  assert.equal(bySemantic(made, "start").length, 1);
  assert.equal(bySemantic(made, "end").length, 1);
  const end = bySemantic(made, "end")[0];
  assert.ok(Math.abs(end.descriptor.origin.y - 5) < 1e-9, "the far cap is a depth away from the sketch plane");
  // the web is `thickness` wide about the line, so its cap area is 6 x 2
  assert.ok(Math.abs(end.descriptor.measure - 12) < 1e-6, "got " + end.descriptor.measure);
  const reversed = created(topologyForFeature({ id: "rib1", type: "rib" },
    { points: line, thickness: 2, side: "both", extent: "blind", depth: 5, direction: "reverse", axis: "y", from: 0 }, [plate()]), "rib1");
  assert.ok(Math.abs(bySemantic(reversed, "end")[0].descriptor.origin.y + 5) < 1e-9, "and it follows the run");
});

test("an up-to-body rib is deliberately left unnamed", () => {
  // its depth is measured against the solid it braces, a number this pure
  // function does not have — a wall named at the wrong depth mis-binds
  const list = topologyForFeature({ id: "rib1", type: "rib" },
    { points: [{ u: 0, v: 0 }, { u: 6, v: 0 }], thickness: 2, side: "both", extent: "up-to-body", axis: "y", from: 0 },
    [plate()]);
  assert.equal(created(list, "rib1").length, 0);
  assert.ok(list.length > 0, "but the body it braces is still inherited whole");
});

test("moving a body moves the names with it instead of leaving them behind", () => {
  const before = plate();
  const list = topologyForFeature({ id: "mv1", type: "moveBody" }, { dx: 5, dy: 0, dz: -2, angle: 0 }, [before]);
  assert.equal(list.length, before.topology.length, "a move creates no face and destroys none");
  const source = facesOf(before.topology)[0];
  const moved = list.find((item) => item.persistentId === source.persistentId);
  assert.ok(Math.abs(moved.descriptor.origin.x - (source.descriptor.origin.x + 5)) < 1e-9);
  assert.ok(Math.abs(moved.descriptor.origin.z - (source.descriptor.origin.z - 2)) < 1e-9);
  assert.deepEqual(moved.descriptor.normal, source.descriptor.normal, "a translation turns nothing");
  assert.notEqual(moved.signature, source.signature, "and the signature says where it is now");
});

test("a rotated move still inherits unchanged, because the turn is about a mass it cannot see", () => {
  const before = plate();
  const list = topologyForFeature({ id: "mv1", type: "moveBody" }, { dx: 5, dy: 0, dz: 0, axis: "y", angle: 30 }, [before]);
  const source = facesOf(before.topology)[0];
  const same = list.find((item) => item.persistentId === source.persistentId);
  assert.equal(same.signature, source.signature);
});
