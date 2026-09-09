/* Loop, tangency, connected, invert and vertex derivation — the selection
   grammar's geometry, checked against real topology rather than a fixture.
   These run without a renderer on purpose: the whole point of keeping them in
   core/ is that the maths can be wrong in a way a screenshot would not show. */
import test from "node:test";
import assert from "node:assert/strict";
import { topologyForFeature } from "../js/core/topology.js";
import {
  edgeEndpoints, edgesAreTangent, faceNormalAt, facesAreTangent, facesTouchingEdge,
  growSelection, invertSelection, pointOnEdge, selectConnected, selectLoop,
  selectTangentChain, shrinkSelection, topologyNeighbours, vertexEntriesFrom, vertexKey,
} from "../js/core/topology_selection.js";

const box = () => topologyForFeature({ id: "f1", type: "box" }, { x0: -10, x1: 10, y0: 0, y1: 8, z0: -6, z1: 6 });
const cylinder = () => topologyForFeature({ id: "c1", type: "cylinder" }, { x: 0, y: 0, z: 0, r: 5, h: 12, axis: "y" });
const semantics = (list) => list.map((entry) => entry.descriptor.semantic).sort();

test("a face's loop is the edges that bound it", () => {
  const entries = box();
  const top = entries.find((e) => e.descriptor.semantic === "top");
  assert.deepEqual(semantics(selectLoop(top, entries)),
    ["x:top:back", "x:top:front", "z:left:top", "z:right:top"]);
  // A cylinder wall is bounded by its two rims, not by a chord of the mesh.
  const cyl = cylinder();
  const wall = cyl.find((e) => e.descriptor.surface === "cylinder");
  assert.deepEqual(semantics(selectLoop(wall, cyl)), ["bottom-rim", "top-rim"]);
});

test("an edge's loop is the boundary of the smaller face it bounds", () => {
  const entries = box();
  // This edge borders the top (20x12) and the front (20x8); the front is the
  // tighter of the two, and is what a user pointing at that edge means.
  const edge = entries.find((e) => e.descriptor.semantic === "x:top:front");
  assert.equal(facesTouchingEdge(edge, entries).length, 2);
  assert.deepEqual(semantics(selectLoop(edge, entries)),
    ["x:bottom:front", "x:top:front", "y:left:front", "y:right:front"]);
});

test("tangency stops at a hard corner and follows a smooth one", () => {
  const entries = box();
  const top = entries.find((e) => e.descriptor.semantic === "top");
  // Every join on a box is 90 degrees, so the chain is the picked face alone.
  assert.deepEqual(semantics(selectTangentChain(top, entries)), ["top"]);

  const cyl = cylinder();
  const wall = cyl.find((e) => e.descriptor.surface === "cylinder");
  const rim = cyl.find((e) => e.descriptor.semantic === "top-rim");
  const cap = cyl.find((e) => e.descriptor.semantic === "top");
  assert.equal(facesAreTangent(wall, cap, rim), false, "a cap meets its wall at 90 degrees");

  /* A plane whose normal matches the wall's radial direction at the rim is
     tangent to it — the blend a fillet makes, and the case that decides
     whether "select tangency" is useful at all. */
  const at = pointOnEdge(rim);
  const radial = faceNormalAt(wall, at);
  assert.ok(radial, "a cylinder must report a normal at a point on its surface");
  const tangentPlane = { kind: "face", persistentId: "tp", descriptor: { surface: "plane", origin: at, normal: radial, measure: 100 } };
  assert.equal(facesAreTangent(wall, tangentPlane, rim), true);
  const skew = { kind: "face", persistentId: "sk", descriptor: { surface: "plane", origin: at, normal: { x: 0, y: 1, z: -1 }, measure: 100 } };
  assert.equal(facesAreTangent(wall, skew, rim), false);
});

test("a circle is sampled on its rim, not at its centre", () => {
  const cyl = cylinder();
  const rim = cyl.find((e) => e.descriptor.semantic === "top-rim");
  // The centre lies on the axis, where a cylinder has no radial direction —
  // asking for tangency there answered "no" for every blend along a circle.
  assert.deepEqual(edgeEndpoints(rim), [], "a closed circle has no ends to chain through");
  const at = pointOnEdge(rim);
  assert.ok(Math.abs(Math.hypot(at.x, at.z) - 5) < 1e-9, "the sample must sit on the rim: " + JSON.stringify(at));
  assert.equal(faceNormalAt(cyl.find((e) => e.descriptor.surface === "cylinder"), rim.descriptor.origin), null,
    "the centre still has no radial direction, and must say so rather than guess");
});

test("edges chain when they meet and continue in the same direction", () => {
  const a = { kind: "edge", persistentId: "a", descriptor: { curve: "line", origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, measure: 10 } };
  const b = { kind: "edge", persistentId: "b", descriptor: { curve: "line", origin: { x: 10, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, measure: 10 } };
  const corner = { kind: "edge", persistentId: "c", descriptor: { curve: "line", origin: { x: 5, y: 9, z: 0 }, axis: { x: 0, y: 1, z: 0 }, measure: 4 } };
  assert.equal(edgesAreTangent(a, b), true);
  assert.equal(edgesAreTangent(a, corner), false);
  assert.deepEqual(selectTangentChain(a, [a, b, corner]).map((e) => e.persistentId), ["a", "b"]);
});

test("connected takes the body, invert takes the complement of the same kinds", () => {
  const entries = box();
  const top = entries.find((e) => e.descriptor.semantic === "top");
  assert.equal(selectConnected(top, entries).length, 6);
  assert.deepEqual(semantics(invertSelection([top], entries)), ["back", "bottom", "front", "left", "right"]);
  // Inverting an edge selection must not hand back faces.
  const edge = entries.find((e) => e.kind === "edge");
  const inverted = invertSelection([edge], entries);
  assert.equal(inverted.length, 11);
  assert.ok(inverted.every((e) => e.kind === "edge"));
  assert.deepEqual(invertSelection([], entries), []);
});

test("corners are one reference per point, however many edges report them", () => {
  const entries = box();
  assert.equal(entries.filter((e) => e.kind === "edge").length, 12);
  const corners = vertexEntriesFrom(entries);
  assert.equal(corners.length, 8, "a box has eight corners, not twenty-four edge ends");
  assert.ok(corners.every((c) => c.kind === "vertex" && c.persistentId && c.descriptor.point));
  assert.equal(new Set(corners.map((c) => c.persistentId)).size, 8);
  // Keyed by position, so float noise from a rebuild does not fork the id.
  assert.equal(vertexKey({ x: -10, y: 0, z: -6 }), vertexKey({ x: -10.000000001, y: 0, z: -6 }));
  assert.notEqual(vertexKey({ x: -10, y: 0, z: -6 }), vertexKey({ x: 10, y: 0, z: -6 }));
  assert.deepEqual(vertexEntriesFrom([]), []);
});

test("the operations answer safely when there is nothing to grow from", () => {
  const entries = box();
  for (const op of [selectLoop, selectTangentChain, selectConnected]) {
    assert.deepEqual(op(null, entries), []);
    assert.deepEqual(op({ kind: "face", persistentId: "missing" }, []), []);
  }
  // A reference the entries do not contain resolves to itself and finds nothing
  // rather than throwing.
  assert.deepEqual(selectLoop({ kind: "edge", persistentId: "ghost", descriptor: {} }, entries), []);
});

test("grow spreads across corners, shrink pulls the boundary back", () => {
  const entries = box();
  const top = entries.find((e) => e.descriptor.semantic === "top");
  // Adjacency, not tangency: a box has no smooth joins, and grow must still
  // cross its corners or it would be a second name for select-tangency.
  assert.deepEqual(semantics(topologyNeighbours(top, entries)), ["back", "front", "left", "right"]);
  assert.equal(growSelection([top], entries).length, 5);
  assert.equal(growSelection(growSelection([top], entries), entries).length, 6, "a second ring takes the whole box");

  // Shrink drops anything with an unselected neighbour, so a lone face goes.
  assert.deepEqual(shrinkSelection([top], entries), []);
  // With every face selected, nothing is on the boundary and nothing is lost.
  const faces = entries.filter((e) => e.kind === "face");
  assert.equal(shrinkSelection(faces, entries).length, 6);

  // Edges chain through shared endpoints, not through shared faces.
  const loop = selectLoop(top, entries);
  assert.equal(loop.length, 4);
  assert.equal(growSelection(loop, entries).length, 8, "the four verticals the loop meets join it");
  assert.ok(growSelection(loop, entries).every((e) => e.kind === "edge"), "grow must not change kind");
});

test("grow and shrink answer safely on nothing", () => {
  const entries = box();
  assert.deepEqual(growSelection([], entries), []);
  assert.deepEqual(shrinkSelection([], entries), []);
  assert.deepEqual(growSelection([{ kind: "face", persistentId: "ghost" }], []), []);
});
