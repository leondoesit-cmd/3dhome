import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWallGeometry,
  wallCurveGeom,
  pointAtWall,
  tangentAtWall,
  projectToWall,
  curvedWallOutline,
  makeArcFromThreePoints,
  makeTangentArc,
  reverseWallCurve,
  normalizeWallProfile,
  wallProfileHeight,
  normalizeWallKind,
  verticalSegments,
} from "../js/wall_curves.js";

const near = (actual, expected, tolerance = 1e-7, message = "") =>
  assert.ok(Math.abs(actual - expected) <= tolerance, message || `${actual} is near ${expected}`);
const nearPoint = (actual, expected, tolerance = 1e-7) => {
  near(actual.x, expected.x, tolerance);
  near(actual.z, expected.z, tolerance);
};

test("straight walls retain the familiar measured geometry", () => {
  const nodes = [{ x: 0, z: 0 }, { x: 30, z: 40 }];
  const geometry = normalizeWallGeometry({ a: 0, b: 1 }, nodes);
  assert.equal(geometry.kind, "line");
  assert.equal(geometry.length, 50);
  assert.equal(geometry.L, 50);
  near(geometry.ux, 0.6);
  near(geometry.uz, 0.8);
  nearPoint(pointAtWall({ a: 0, b: 1 }, 25, nodes), { x: 15, z: 20 });
  nearPoint(tangentAtWall({ a: 0, b: 1 }, 500, nodes), { x: 0.6, z: 0.8 });
});

test("node references can be arrays, maps, objects or direct points", () => {
  const wall = { a: "left", b: "right" };
  const asMap = new Map([["left", { x: 1, z: 2 }], ["right", { x: 4, z: 6 }]]);
  assert.equal(wallCurveGeom(wall, asMap).length, 5);
  assert.equal(wallCurveGeom(wall, { left: { x: 1, y: 2 }, right: { x: 4, y: 6 } }).length, 5);
  assert.equal(wallCurveGeom({ a: { x: 1, z: 2 }, b: { x: 4, z: 6 } }).length, 5);
  assert.equal(wallCurveGeom({ a: 0, b: 1 }, [{ id: 7, x: 0, z: 0 }]), null);
});

test("a positive unit bulge is a counter-clockwise semicircle", () => {
  const nodes = [{ x: -10, z: 0 }, { x: 10, z: 0 }];
  const wall = { a: 0, b: 1, bulge: 1 };
  const geometry = wallCurveGeom(wall, nodes);
  assert.equal(geometry.kind, "arc");
  nearPoint(geometry.center, { x: 0, z: 0 });
  near(geometry.radius, 10);
  near(geometry.sweep, Math.PI);
  near(geometry.length, Math.PI * 10);
  nearPoint(pointAtWall(wall, geometry.length / 2, nodes), { x: 0, z: -10 });
  nearPoint(tangentAtWall(wall, geometry.length / 2, nodes), { x: 1, z: 0 });
});

test("negative and major bulges preserve direction and arc length", () => {
  const nodes = [{ x: 0, z: 0 }, { x: 10, z: 0 }];
  const clockwise = wallCurveGeom({ a: 0, b: 1, bulge: -Math.tan(Math.PI / 8) }, nodes);
  near(clockwise.sweep, -Math.PI / 2);
  assert.equal(clockwise.clockwise, true);
  const major = wallCurveGeom({ a: 0, b: 1, bulge: Math.tan((Math.PI * 1.5) / 4) }, nodes);
  near(major.sweep, Math.PI * 1.5);
  assert.equal(major.largeArc, true);
  assert.ok(major.length > clockwise.length);
});

test("center/radius arcs and radius-only arcs normalize to the same circle", () => {
  const nodes = [{ x: -10, z: 0 }, { x: 10, z: 0 }];
  const centered = wallCurveGeom({
    a: 0,
    b: 1,
    curve: { type: "arc", center: { x: 0, z: 0 }, radius: 10, clockwise: false },
  }, nodes);
  near(centered.sweep, Math.PI);
  const radiusOnly = wallCurveGeom({ a: 0, b: 1, curveType: "arc", radius: 10, clockwise: true }, nodes);
  near(radiusOnly.sweep, -Math.PI);
  near(radiusOnly.radius, 10);
  assert.equal(radiusOnly.clockwise, true);
});

test("impossible or corrupt arc metadata safely falls back to its chord", () => {
  const nodes = [{ x: 0, z: 0 }, { x: 10, z: 0 }];
  assert.equal(wallCurveGeom({ a: 0, b: 1, radius: 2 }, nodes).kind, "line");
  assert.equal(wallCurveGeom({ a: 0, b: 1, center: { x: 0, z: 0 }, radius: 4 }, nodes).kind, "line");
  assert.equal(wallCurveGeom({ a: 0, b: 0, bulge: 1 }, nodes), null);
  assert.equal(wallCurveGeom(null, nodes), null);
});

test("projection uses arc distance and clamps outside the finite sweep", () => {
  const nodes = [{ x: 10, z: 0 }, { x: 0, z: 10 }];
  const wall = { a: 0, b: 1, center: { x: 0, z: 0 }, radius: 10, clockwise: false };
  const middle = projectToWall(wall, 20, 20, nodes);
  nearPoint(middle, { x: Math.SQRT1_2 * 10, z: Math.SQRT1_2 * 10 });
  near(middle.s, Math.PI * 10 / 4);
  near(middle.distance, Math.hypot(20, 20) - 10);
  assert.ok(middle.signedOffset < 0, "the radial outside is right of a CCW tangent");

  const beforeStart = projectToWall(wall, 10, -4, nodes);
  near(beforeStart.s, 0);
  nearPoint(beforeStart, nodes[0]);
  const afterEnd = projectToWall(wall, -3, 10, nodes);
  near(afterEnd.s, Math.PI * 5);
  nearPoint(afterEnd, nodes[1]);
});

test("projection works on major arcs rather than silently selecting the minor arc", () => {
  const nodes = [{ x: 10, z: 0 }, { x: 0, z: 10 }];
  const wall = { a: 0, b: 1, center: { x: 0, z: 0 }, radius: 10, clockwise: true };
  const geometry = wallCurveGeom(wall, nodes);
  near(geometry.sweep, -Math.PI * 1.5);
  const opposite = projectToWall(wall, -20, 0, nodes);
  nearPoint(opposite, { x: -10, z: 0 });
  near(opposite.s, Math.PI * 10);
});

test("curved outlines have exact concentric faces and stable winding", () => {
  const nodes = [{ x: 10, z: 0 }, { x: 0, z: 10 }];
  const wall = { a: 0, b: 1, center: { x: 0, z: 0 }, radius: 10, clockwise: false, thickness: 4 };
  const outline = curvedWallOutline(wall, undefined, nodes, 4);
  assert.equal(outline.length, 10);
  outline.slice(0, 5).forEach((p) => near(Math.hypot(p.x, p.z), 8));
  outline.slice(5).forEach((p) => near(Math.hypot(p.x, p.z), 12));
  nearPoint(outline[0], { x: 8, z: 0 });
  nearPoint(outline[4], { x: 0, z: 8 });

  const straight = curvedWallOutline({ a: 0, b: 1, thickness: 2 }, undefined, [{ x: 0, z: 0 }, { x: 10, z: 0 }]);
  assert.deepEqual(straight, [
    { x: 0, z: 1 }, { x: 10, z: 1 }, { x: 10, z: -1 }, { x: 0, z: -1 },
  ]);
});

test("three points define the arc that actually passes through the middle point", () => {
  const minor = makeArcFromThreePoints({ x: 10, z: 0 }, { x: Math.SQRT1_2 * 10, z: Math.SQRT1_2 * 10 }, { x: 0, z: 10 });
  nearPoint(minor.center, { x: 0, z: 0 });
  near(minor.radius, 10);
  near(minor.sweep, Math.PI / 2);
  const major = makeArcFromThreePoints({ x: 10, z: 0 }, { x: -10, z: 0 }, { x: 0, z: 10 });
  near(major.sweep, -Math.PI * 1.5);
  assert.equal(major.largeArc, true);
  assert.equal(makeArcFromThreePoints({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }), null);
});

test("a feasible line fillet is tangent to both segments", () => {
  const arc = makeTangentArc(
    { a: { x: -20, z: 0 }, b: { x: 0, z: 0 } },
    { a: { x: 0, z: 0 }, b: { x: 0, z: 20 } },
    5,
  );
  nearPoint(arc.intersection, { x: 0, z: 0 });
  nearPoint(arc.a, { x: -5, z: 0 });
  nearPoint(arc.b, { x: 0, z: 5 });
  nearPoint(arc.center, { x: -5, z: 5 });
  near(arc.sweep, Math.PI / 2);
  nearPoint(tangentAtWall(arc, 0), { x: 1, z: 0 });
  nearPoint(tangentAtWall(arc, arc.length), { x: 0, z: 1 });
});

test("a line fillet reports infeasible finite geometry instead of extending silently", () => {
  const shortLine = { a: { x: -2, z: 0 }, b: { x: 0, z: 0 } };
  const second = { a: { x: 0, z: 0 }, b: { x: 0, z: 20 } };
  assert.equal(makeTangentArc(shortLine, second, 5), null);
  assert.ok(makeTangentArc(shortLine, second, 5, { extend: true }));
  assert.equal(makeTangentArc(shortLine, { a: { x: 0, z: 1 }, b: { x: 4, z: 1 } }, 1), null);
});

test("reversing an arc preserves its locus and restores on a second reversal", () => {
  const original = {
    id: 4,
    a: 0,
    b: 1,
    length: 100,
    curve: { type: "arc", bulge: 0.5, clockwise: false },
    profile: [{ s: 0, height: 200 }, { s: 100, height: 250 }],
  };
  const reversed = reverseWallCurve(original);
  assert.equal(reversed.a, 1);
  assert.equal(reversed.b, 0);
  assert.equal(reversed.curve.bulge, -0.5);
  assert.equal(reversed.curve.clockwise, true);
  assert.deepEqual(reversed.profile, [{ s: 0, height: 250 }, { s: 100, height: 200 }]);
  assert.deepEqual(reverseWallCurve(reversed), original);
  assert.equal(original.curve.bulge, 0.5, "the source was not mutated");
});

test("height profiles normalize, deduplicate and interpolate against base height", () => {
  const wall = {
    height: 240,
    length: 100,
    profile: [
      { t: 0.5, h: 100 },
      [25, 200],
      { s: 50, height: 120 },
      { s: 200, top: 300 },
      { s: 10, height: -5 },
      { s: "bad", height: 10 },
    ],
  };
  assert.deepEqual(normalizeWallProfile(wall), [
    { s: 10, height: 0 },
    { s: 25, height: 200 },
    { s: 50, height: 120 },
    { s: 100, height: 300 },
  ]);
  near(wallProfileHeight(wall, 5, 240), 120);
  near(wallProfileHeight(wall, 37.5, 240), 160);
  near(wallProfileHeight(wall, 75, 240), 210);
  assert.equal(wallProfileHeight({ height: 260 }, 20), 260);
});

test("special wall kinds accept persisted and human-readable aliases", () => {
  assert.equal(normalizeWallKind("normal"), "normal");
  assert.equal(normalizeWallKind({ wallKind: "room-divider" }), "roomDivider");
  assert.equal(normalizeWallKind({ specialKind: "Half Wall" }), "half");
  assert.equal(normalizeWallKind({ kind: "pony_wall" }), "pony");
  assert.equal(normalizeWallKind({ type: "balustrade" }), "railing");
  assert.equal(normalizeWallKind("unknown future kind"), "normal");
});

test("vertical segments describe normal, invisible, half and pony walls", () => {
  const types = new Map([
    ["brick", { id: "brick", name: "Brick" }],
    ["block", { id: "block", name: "Block" }],
    ["stud", { id: "stud", name: "Stud" }],
  ]);
  const normal = verticalSegments({ height: 260, wallTypeId: "brick" }, types);
  assert.deepEqual(normal.map(({ role, bottom, top, solid }) => ({ role, bottom, top, solid })), [
    { role: "body", bottom: 0, top: 260, solid: true },
  ]);
  assert.equal(normal[0].wallType.name, "Brick");
  assert.deepEqual(verticalSegments({ wallKind: "roomDivider", height: 260 }, types), []);
  assert.equal(verticalSegments({ wallKind: "half", halfHeight: 95 }, types)[0].top, 95);

  const pony = verticalSegments({
    wallKind: "pony",
    height: 280,
    splitHeight: 90,
    lowerWallTypeId: "block",
    upperWallTypeId: "stud",
  }, types);
  assert.deepEqual(pony.map(({ role, bottom, top, wallTypeId }) => ({ role, bottom, top, wallTypeId })), [
    { role: "lower", bottom: 0, top: 90, wallTypeId: "block" },
    { role: "upper", bottom: 90, top: 280, wallTypeId: "stud" },
  ]);
});

test("railing walls can carry a solid curb beneath a non-solid rail band", () => {
  const segments = verticalSegments({
    wallKind: "railing",
    railingHeight: 110,
    curbHeight: 15,
    wallTypeId: "curb",
    railingTypeId: "glass",
  }, (id) => ({ id }));
  assert.deepEqual(segments.map(({ role, bottom, top, solid, wallTypeId }) => ({ role, bottom, top, solid, wallTypeId })), [
    { role: "base", bottom: 0, top: 15, solid: true, wallTypeId: "curb" },
    { role: "railing", bottom: 15, top: 110, solid: false, wallTypeId: "glass" },
  ]);
});
