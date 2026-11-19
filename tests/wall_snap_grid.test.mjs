/* GRID along a wall. The on-wall snap used to land on the raw foot of the
   cursor, so a partition started on an outer wall measured 3591 or 2513 even
   with the grid on, and every wall of a plan had to be retyped afterwards. */
import test from "node:test";
import assert from "node:assert/strict";

// the minimum DOM for the interaction.js module graph to link (as in
// tests/snap_broad_phase.test.mjs); nothing here renders
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  location: { href: "http://localhost/" },
};
globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    Object.assign(this, init || {});
  }
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    getContext: () => null,
    style: {},
    classList: { add() {}, remove() {} },
    addEventListener() {},
  }),
  addEventListener() {},
  body: { classList: { add() {}, remove() {} } },
};

const { S, SNAP_GRID } = await import("../js/state.js");
const { snapPoint } = await import("../js/interaction.js");
const { render2DNow } = await import("../js/plan2d.js");

// a 1000 x 800 room with its corners off the grid's origin, plus one 30° wall
function plan() {
  Object.assign(S, {
    nodes: [{ x: -630, z: -480 }, { x: 370, z: -480 }, { x: 370, z: 320 }, { x: -630, z: 320 },
      { x: 600, z: 0 }, { x: 600 + 400 * Math.cos(Math.PI / 6), z: 400 * Math.sin(Math.PI / 6) }],
    walls: [
      { id: 1, a: 0, b: 1, thickness: 10 }, { id: 2, a: 1, b: 2, thickness: 10 },
      { id: 3, a: 2, b: 3, thickness: 10 }, { id: 4, a: 3, b: 0, thickness: 10 },
      { id: 5, a: 4, b: 5, thickness: 10 },
    ],
    openings: [], items: [], markers: [], mep: null, slabOpenings: [], roomMeta: {},
    sel: null, SC: 1, snapKinds: null, snapOnly: null, snapCycle: 0,
    osnap: true, ortho: false, gsnap: true, tool: "wall", drawing: false,
    drawStart: null, drawWalls: [], blueprintTrace: null, snapStrength: 1,
  });
  render2DNow();
}

test("a point snapped onto an axis-aligned wall lands on the grid along it", () => {
  plan();
  const top = snapPoint(-251.3, -478, null);
  assert.equal(S.snapInfo.type, "wall");
  assert.equal(top.wall.id, 1);
  assert.equal(top.x, -250);
  assert.equal(top.z, -480, "still exactly on the wall");

  const left = snapPoint(-627, -120.6, null);
  assert.equal(left.wall.id, 4);
  assert.equal(left.x, -630);
  assert.equal(left.z, -120);
  // the station the commit uses agrees with the point it shows
  // (wall 4 runs from z=320 up to z=-480)
  assert.ok(Math.abs(left.s - 440) < 1e-9, "s = " + left.s);
});

test("an oblique wall rounds the distance along it", () => {
  plan();
  const p = snapPoint(600 + 123.4 * Math.cos(Math.PI / 6), 123.4 * Math.sin(Math.PI / 6), null);
  assert.equal(p.wall.id, 5);
  assert.ok(Math.abs(p.s - 125) < 1e-9, "s = " + p.s);
  assert.ok(Math.abs(Math.hypot(p.x - 600, p.z) - 125) < 1e-9);
  assert.equal(SNAP_GRID, 5);
});

test("with GRID off the on-wall point follows the cursor", () => {
  plan();
  S.gsnap = false;
  const p = snapPoint(-251.3, -478, null);
  assert.equal(p.wall.id, 1);
  assert.ok(Math.abs(p.x - -251.3) < 1e-9);
});
