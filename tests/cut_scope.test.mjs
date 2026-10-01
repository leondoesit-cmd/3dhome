import test from "node:test";
import assert from "node:assert/strict";

import { frameFromPlane } from "../js/core/frame.js";
import {
  boundsInFrame,
  cutFootprint,
  loopStrictlyInsideLoop,
  loopsOverlapOrTouch,
  profileLoopIsSeparateHole,
} from "../js/core/cut_scope.js";

const circle = (count, radius, cu, cv) => Array.from({ length: count }, (_, i) => ({
  u: cu + radius * Math.cos(2 * Math.PI * i / count),
  v: cv + radius * Math.sin(2 * Math.PI * i / count),
}));

test("a cut into a merged raised boss survives base-profile broad phase", () => {
  const part = {kind:"ext",axis:"z",from:0,to:1,
    pts:[{u:0,v:0},{u:4,v:0},{u:4,v:1},{u:0,v:1}],
    merges3d:[{axis:"z",from:1,to:2,loop:circle(24,1,2,4)}]};
  const bounds={x0:0,x1:4,y0:0,y1:5,z0:0,z1:2};
  const frame=frameFromPlane({x:0,y:0,z:2},{x:0,y:0,z:1});
  assert.equal(contains(cutFootprint(part,bounds,null,"z"),{u:2,v:4}),true);
  const projected=cutFootprint(part,bounds,frame,"frame");
  assert.equal(contains(projected,{u:2,v:4}),true);
  part.merges3d[0].suppressed=true;
  assert.equal(contains(cutFootprint(part,bounds,null,"z"),{u:2,v:4}),false);
});

test("only a cut wholly inside the profile is a lightweight hole", () => {
  const profile = [{ u: -5, v: -5 }, { u: 5, v: -5 }, { u: 5, v: 5 }, { u: -5, v: 5 }];
  const enclosed = [{ u: -2, v: -1 }, { u: 2, v: -1 }, { u: 2, v: 1 }, { u: -2, v: 1 }];
  const breaksRim = [{ u: -2, v: -1 }, { u: 7, v: -1 }, { u: 7, v: 1 }, { u: -2, v: 1 }];
  const touchesRim = [{ u: -2, v: -1 }, { u: 5, v: -1 }, { u: 5, v: 1 }, { u: -2, v: 1 }];

  assert.equal(loopStrictlyInsideLoop(enclosed, profile), true);
  assert.equal(loopStrictlyInsideLoop(breaksRim, profile), false);
  assert.equal(loopStrictlyInsideLoop(touchesRim, profile), false);
});

test("overlapping or touching voids cannot remain separate profile holes", () => {
  const first = [{ u: -3, v: -1 }, { u: 1, v: -1 }, { u: 1, v: 1 }, { u: -3, v: 1 }];
  const overlap = [{ u: 0, v: -1 }, { u: 3, v: -1 }, { u: 3, v: 1 }, { u: 0, v: 1 }];
  const touch = [{ u: 1, v: -1 }, { u: 3, v: -1 }, { u: 3, v: 1 }, { u: 1, v: 1 }];
  const separate = [{ u: 2, v: -1 }, { u: 4, v: -1 }, { u: 4, v: 1 }, { u: 2, v: 1 }];

  assert.equal(loopsOverlapOrTouch(first, overlap), true);
  assert.equal(loopsOverlapOrTouch(first, touch), true);
  assert.equal(loopsOverlapOrTouch(first, separate), false);
  const outer = [{ u: -8, v: -5 }, { u: 8, v: -5 }, { u: 8, v: 5 }, { u: -8, v: 5 }];
  assert.equal(profileLoopIsSeparateHole(separate, outer, [first]), true);
  assert.equal(profileLoopIsSeparateHole(overlap, outer, [first]), false);
});

// the same containment rule the modeller applies to a cut loop
function contains(footprint, point) {
  if (footprint.type === "poly") {
    let inside = false;
    const pts = footprint.pts;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.v > point.v) !== (b.v > point.v) && point.u < ((b.u - a.u) * (point.v - a.v)) / (b.v - a.v) + a.u) inside = !inside;
    }
    return inside;
  }
  return point.u >= footprint.u0 && point.u <= footprint.u1 && point.v >= footprint.v0 && point.v <= footprint.v1;
}

test("a boss away from the origin is still under a cut drawn on its own face", () => {
  // a cylinder standing on a plate, nowhere near the world origin
  const base = frameFromPlane({ x: 0, y: 30, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
  const boss = { kind: "ext", axis: "frame", frame: base, from: 0, to: 20, pts: circle(48, 6, 16, -11) };
  // the frame's v axis runs along -z, so a profile at v = -11 stands at z = +11
  const bossBounds = { x0: 10, x1: 22, y0: 30, y1: 50, z0: 5, z1: 17 };
  // the sketch for the cut sits on the boss's top face, so its frame origin is
  // the face, not the world origin — and the loop is written around (0, 0)
  const faceFrame = frameFromPlane({ x: 16, y: 50, z: 11 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
  const slot = [{ u: -3, v: -1 }, { u: 3, v: -1 }, { u: 3, v: 1 }, { u: -3, v: 1 }];

  const footprint = cutFootprint(boss, bossBounds, faceFrame, "frame");
  slot.forEach((corner) => assert.equal(contains(footprint, corner), true, "the slot is on the boss"));
  assert.equal(contains(footprint, { u: 0, v: 0 }), true);

  // the plate underneath is measured in the same space and also takes the cut
  const plate = { kind: "box" };
  const plateFootprint = cutFootprint(plate, { x0: -23, x1: 23, y0: 0, y1: 30, z0: -16, z1: 16 }, faceFrame, "frame");
  assert.equal(contains(plateFootprint, { u: 0, v: 0 }), true);

  /* The bug this replaced: measuring the same body in world X/Z while the loop
     is in the face's (u, v). The boss's world footprint is centred on (16, 11),
     so a loop written around (0, 0) misses it entirely — the cut went through
     the plate and left the cylinder above it whole. */
  const worldFootprint = { u0: bossBounds.x0, u1: bossBounds.x1, v0: bossBounds.z0, v1: bossBounds.z1 };
  assert.equal(contains(worldFootprint, { u: 0, v: 0 }), false, "which is exactly how the miss used to happen");
});

test("a body's footprint follows the frame it is measured in", () => {
  const frame = frameFromPlane({ x: 5, y: 12, z: -4 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
  const box = boundsInFrame({ x0: 0, x1: 10, y0: 0, y1: 12, z0: -10, z1: 2 }, frame);
  assert.ok(Math.abs(box.u0 - -5) < 1e-9 && Math.abs(box.u1 - 5) < 1e-9, "u is measured from the frame origin");
  assert.ok(Math.abs(Math.max(Math.abs(box.v0), Math.abs(box.v1)) - 6) < 1e-9, "and so is v");

  // a cut on a principal plane keeps the plain world mapping per axis
  const bounds = { x0: -2, x1: 4, y0: 0, y1: 9, z0: -7, z1: 1 };
  assert.deepEqual(cutFootprint({ kind: "box" }, bounds, null, "y"), { u0: -2, u1: 4, v0: -7, v1: 1 });
  assert.deepEqual(cutFootprint({ kind: "box" }, bounds, null, "z"), { u0: -2, u1: 4, v0: 0, v1: 9 });
  assert.deepEqual(cutFootprint({ kind: "box" }, bounds, null, "x"), { u0: -7, u1: 1, v0: 0, v1: 9 });

  // an extrude on the cut's own axis reports its real profile, not its box
  const wedge = { kind: "ext", axis: "y", pts: [{ u: 0, v: 0 }, { u: 10, v: 0 }, { u: 0, v: 10 }] };
  const footprint = cutFootprint(wedge, { x0: 0, x1: 10, y0: 0, y1: 5, z0: 0, z1: 10 }, null, "y");
  assert.equal(footprint.type, "poly");
  assert.equal(contains(footprint, { u: 1, v: 1 }), true);
  assert.equal(contains(footprint, { u: 9, v: 9 }), false, "the corner the box would have claimed");
});
