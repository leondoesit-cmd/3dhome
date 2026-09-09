import test from "node:test";
import assert from "node:assert/strict";

import { isSegmentProfile, pathFrames, segmentProfilePoints, sketchProfileSegments } from "../js/core/profile_curves.js";
import { resolveSketchExtrusion, resolveSketchProfile } from "../js/cad_feature_tree.js";
import { disposeBrep, extractBrepTopology, loadCadKernel, makeBrepExtrusion, makeBrepLoft, makeBrepSweep } from "../js/cad_kernel.js";

const surfaces = (brep) => extractBrepTopology(brep).topology.filter((item) => item.kind === "face").map((item) => item.descriptor.surface);
const volume = async (brep) => {
  const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
};
const sampledCircle = (count, radius, cx = 0, cy = 0) => Array.from({ length: count }, (_, i) => {
  const angle = (2 * Math.PI * i) / count;
  return { u: cx + Math.cos(angle) * radius, v: cy + Math.sin(angle) * radius };
});

/* --- the conversion itself, no WASM ------------------------------------- */

test("a sketch circle converts to one circle segment, not a ring of chords", () => {
  const sketch = { points: [{ id: "c", x: 3, y: 4 }], entities: [{ id: "e", type: "circle", c: "c", r: 9 }] };
  const segments = sketchProfileSegments(sketch, ["e"]);
  assert.deepEqual(segments, [{ type: "circle", center: { u: 3, v: 4 }, radius: 9 }]);
  assert.ok(isSegmentProfile(segments), "and it reads as the typed form");
  const points = segmentProfilePoints(segments);
  assert.ok(points.length > 16, "sampling it back still gives a polyline for the mesh side");
  points.forEach((p) => assert.ok(Math.abs(Math.hypot(p.u - 3, p.v - 4) - 9) < 1e-9, "every sample is on the circle"));
});

test("an ellipse keeps both semi-axes and its tilt", () => {
  const sketch = { points: [{ id: "c", x: 0, y: 0 }], entities: [{ id: "e", type: "ellipse", c: "c", rx: 10, ry: 4, rot: 0.5 }] };
  const [segment] = sketchProfileSegments(sketch, ["e"]);
  assert.equal(segment.type, "ellipse");
  assert.equal(segment.rx, 10);
  assert.equal(segment.ry, 4);
  assert.equal(segment.rot, 0.5);
});

test("a line and arc chain comes back in traversal order however the ids were listed", () => {
  const sketch = {
    points: [{ id: "p0", x: 0, y: 0 }, { id: "p1", x: 10, y: 0 }, { id: "p2", x: 10, y: 10 }, { id: "p3", x: 0, y: 10 }, { id: "cc", x: 10, y: 5 }],
    entities: [
      { id: "bottom", type: "line", a: "p0", b: "p1" },
      { id: "right", type: "arc", c: "cc", a: "p1", b: "p2" },
      { id: "top", type: "line", a: "p2", b: "p3" },
      { id: "left", type: "line", a: "p3", b: "p0" },
    ],
  };
  const segments = sketchProfileSegments(sketch, ["top", "left", "bottom", "right"]);
  assert.deepEqual(segments.map((s) => s.type), ["line", "line", "line", "arc"]);
  // whatever the starting entity, the chain is continuous end to start
  segments.forEach((segment, index) => {
    const next = segments[(index + 1) % segments.length];
    assert.deepEqual(segment.to, next.from, "segment " + index + " hands its end to the next");
  });
  const arc = segments[3];
  assert.ok(Math.abs(Math.hypot(arc.mid.u - 10, arc.mid.v - 5) - 5) < 1e-9, "the arc's interior point is on its own circle");
  // the sampled form still bulges out past the chord, which is the whole point
  assert.ok(Math.max(...segmentProfilePoints(segments).map((p) => p.u)) > 14.9, "the arc really bows outwards");
});

test("a profile we cannot describe exactly converts to nothing rather than to a guess", () => {
  const sketch = {
    points: [{ id: "p0", x: 0, y: 0 }, { id: "p1", x: 10, y: 0 }],
    entities: [{ id: "a", type: "line", a: "p0", b: "p1" }, { id: "b", type: "spline", a: "p1", b: "p0" }],
  };
  assert.equal(sketchProfileSegments(sketch, ["a", "b"]), null, "an unknown entity kind");
  assert.equal(sketchProfileSegments(sketch, ["a"]), null, "an open chain");
  assert.equal(sketchProfileSegments(sketch, ["a", "missing"]), null, "a deleted entity");
  assert.equal(isSegmentProfile(sampledCircle(8, 4)), false, "and a bare point array is never mistaken for one");
});

test("a path frame carries its normal along instead of recomputing it", () => {
  // a right-angle bend: Frenet would flip the normal at the corner
  const frames = pathFrames([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }]);
  assert.equal(frames.length, 3);
  assert.ok(frames[0].t === 0 && Math.abs(frames[2].t - 1) < 1e-12, "stations are placed by arc length");
  frames.forEach((frame) => {
    const dot = frame.tangent.x * frame.normal.x + frame.tangent.y * frame.normal.y + frame.tangent.z * frame.normal.z;
    assert.ok(Math.abs(dot) < 1e-9, "the normal stays perpendicular to the tangent");
    assert.ok(Math.abs(Math.hypot(frame.binormal.x, frame.binormal.y, frame.binormal.z) - 1) < 1e-9, "and the frame stays unit length");
  });
  // consecutive normals never jump: that jump is exactly the unwanted twist
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].normal, b = frames[i].normal;
    assert.ok(a.x * b.x + a.y * b.y + a.z * b.z > 0.5, "the normal is carried, not flipped, at station " + i);
  }
  assert.equal(pathFrames([{ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }]), null, "a path with no length has no frame");
});

/* --- the producer: a feature really does hand the curves down ------------ */

function circleSketchDocument() {
  return {
    sketches: [{
      id: "s1",
      points: [{ id: "c", x: 0, y: 0 }],
      entities: [{ id: "circle", type: "circle", c: "c", r: 9 }],
    }],
  };
}

test("a sketch-driven extrusion carries the curve kinds down, not only the samples", () => {
  const params = resolveSketchExtrusion(circleSketchDocument(), { sketchId: "s1", profileEntityIds: ["circle"], axis: "y", from: 0, to: 12 });
  assert.ok(params.points.length > 8, "the sampled polyline is still there for the mesh");
  assert.deepEqual(params.segments, [{ type: "circle", center: { u: 0, v: 0 }, radius: 9 }]);
  const revolved = resolveSketchProfile(circleSketchDocument(), { sketchId: "s1", profileEntityIds: ["circle"] });
  assert.deepEqual(revolved.segments, params.segments, "and a revolve resolves the same way");
});

/* --- and the kernel builds real geometry from them ----------------------- */

test("an extruded sketch circle is one exact cylinder, not an n-sided prism", async () => {
  const square = [{ u: 0, v: 0 }, { u: 10, v: 0 }, { u: 10, v: 10 }, { u: 0, v: 10 }];
  const points = sampledCircle(40, 9);
  const polygon = await makeBrepExtrusion({ points: square, axis: "z", from: 0, to: 12 });
  const exact = await makeBrepExtrusion({ points, segments: [{ type: "circle", center: { u: 0, v: 0 }, radius: 9 }], axis: "z", from: 0, to: 12 });
  try {
    assert.equal(surfaces(polygon).filter((kind) => kind === "plane").length, 6, "a bare point array still builds the polygon it always did");
    assert.equal(surfaces(exact).filter((kind) => kind === "cylinder").length, 1, "the typed circle builds one round wall");
    assert.ok(Math.abs(await volume(exact) - Math.PI * 81 * 12) < 1e-6, "and it holds a cylinder's volume, not a 40-gon's");
  } finally { disposeBrep(polygon); disposeBrep(exact); }
});

test("a typed ellipse holds its own area whichever semi-axis is the longer", async () => {
  const points = sampledCircle(40, 9);
  const wide = await makeBrepExtrusion({ points, segments: [{ type: "ellipse", center: { u: 0, v: 0 }, rx: 10, ry: 5, rot: 0 }], axis: "z", from: 0, to: 4 });
  const tall = await makeBrepExtrusion({ points, segments: [{ type: "ellipse", center: { u: 0, v: 0 }, rx: 5, ry: 10, rot: 0 }], axis: "z", from: 0, to: 4 });
  try {
    assert.ok(Math.abs(await volume(wide) - Math.PI * 10 * 5 * 4) < 1e-6, "a wide ellipse");
    assert.ok(Math.abs(await volume(tall) - Math.PI * 10 * 5 * 4) < 1e-6, "and the same one stood on end");
  } finally { disposeBrep(wide); disposeBrep(tall); }
});

test("a typed hole loop stays a hole whichever way round it was wound", async () => {
  const outline = [{ u: -20, v: -20 }, { u: 20, v: -20 }, { u: 20, v: 20 }, { u: -20, v: 20 }];
  const hole = { points: sampledCircle(24, 8), segments: [{ type: "circle", center: { u: 0, v: 0 }, radius: 8 }] };
  const brep = await makeBrepExtrusion({ points: outline, holes: [hole], axis: "z", from: 0, to: 5 });
  try {
    assert.equal(surfaces(brep).filter((kind) => kind === "cylinder").length, 1, "the bore is one round wall");
    assert.ok(Math.abs(await volume(brep) - (1600 - Math.PI * 64) * 5) < 1e-6, "and it really is a void, not an island");
  } finally { disposeBrep(brep); }
});

test("sweep orientation, twist and end scale each change the solid they claim to", async () => {
  const profile = [{ x: -2, y: -2, z: 0 }, { x: 2, y: -2, z: 0 }, { x: 2, y: 2, z: 0 }, { x: -2, y: 2, z: 0 }];
  const path = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 20 }];
  const built = {};
  for (const orientation of ["follow-path", "minimum-twist", "fixed"]) built[orientation] = await makeBrepSweep({ profile, path, orientation });
  const twisted = await makeBrepSweep({ profile, path, twistAngle: 90 });
  const tapered = await makeBrepSweep({ profile, path, scale: 2 });
  try {
    for (const [orientation, brep] of Object.entries(built)) {
      assert.ok(Math.abs(await volume(brep) - 16 * 20) < 1e-6, orientation + " sweeps a straight run without distorting it");
    }
    // a twisted prism loses volume to the ruled surface between its stations,
    // so a difference here is proof the angle reached the kernel at all
    const straight = await volume(built["follow-path"]);
    assert.ok(Math.abs(await volume(twisted) - straight) > 1, "twist really turns the section: " + await volume(twisted));
    assert.ok(surfaces(twisted).filter((kind) => kind !== "plane").length > 0, "and it is no longer four flat sides");
    // a linear taper from 4x4 to 8x8 is a frustum: h/3 * (A1 + sqrt(A1 A2) + A2)
    assert.ok(Math.abs(await volume(tapered) - (20 / 3) * (16 + 32 + 64)) < 1e-3, "end scale tapers the run exactly");
  } finally { Object.values(built).forEach(disposeBrep); disposeBrep(twisted); disposeBrep(tapered); }
});

test("a swept or lofted circle is round in the exact body too", async () => {
  const ring = (radius, z) => Array.from({ length: 40 }, (_, i) => {
    const angle = (2 * Math.PI * i) / 40;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z };
  });
  const swept = await makeBrepSweep({
    profile: ring(2, 0), profileSegments: [{ type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 2 }],
    path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 20 }],
  });
  const lofted = await makeBrepLoft({
    sections: [
      { points: ring(2, 0), segments: [{ type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 2 }] },
      { points: ring(4, 10), segments: [{ type: "circle", center: { x: 0, y: 0, z: 10 }, radius: 4 }] },
    ],
  });
  // an ellipse: sampled, nothing recognises it, so it stays forty flat panels
  const oval = (a, b, z) => Array.from({ length: 40 }, (_, i) => {
    const angle = (2 * Math.PI * i) / 40;
    return { x: Math.cos(angle) * a, y: Math.sin(angle) * b, z };
  });
  const sampledLoft = await makeBrepLoft({ sections: [ring(2, 0), ring(4, 10)] });
  const facetedLoft = await makeBrepLoft({ sections: [oval(2, 1, 0), oval(4, 2, 10)] });
  try {
    assert.ok(surfaces(swept).every((kind) => kind === "cylinder" || kind === "plane"), "the pipe wall is cylindrical: " + surfaces(swept));
    assert.ok(Math.abs(await volume(swept) - Math.PI * 4 * 20) < 1e-6, "and holds a pipe's volume");
    // one wall between two exact circles, where the sampled sections gave forty
    assert.equal(surfaces(lofted).filter((kind) => kind !== "plane").length, 1, "a loft between typed circles has one wall: " + surfaces(lofted));
    assert.equal(surfaces(facetedLoft).length, 42, "an unrecognised sampled loop still lofts forty flat panels plus two caps");
    // Sampled COAXIAL CIRCLES are the one sampled case that is now recognised
    // and handed to the cone primitive, so screen and B-rep finally agree here.
    assert.equal(surfaces(sampledLoft).filter((kind) => kind !== "plane").length, 1, "sampled circles reach the cone too");
    assert.ok(Math.abs(await volume(lofted) - await volume(sampledLoft)) < 1e-6, "and both are the exact cone");
  } finally { [swept, lofted, sampledLoft, facetedLoft].forEach(disposeBrep); }
});
