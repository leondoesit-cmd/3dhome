import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The browser supplies Three through its import map.  Elevation geometry is
// pure, but its furniture dependency imports the namespace for builders that
// these tests never execute, so provide the smallest Node-side import-map
// equivalent before loading the application module.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "three")
      return { url: "data:text/javascript,export default {};", shortCircuit: true };
    if (specifier.startsWith("three/"))
      return { url: "data:text/javascript,export class RoundedBoxGeometry {}", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { S } = await import("../js/state.js");
const {
  ceilingHeight,
  drawElevation,
  elevationHit,
  wallElevationSamples,
  wallElevationSpan,
} = await import("../js/elevation.js");

function setScene(wall, openings = []) {
  S.nodes = [{ x: 10, z: 0 }, { x: 0, z: 10 }];
  S.walls = [wall];
  S.openings = openings;
  S.items = [];
}

const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is near ${expected}`);

test("elevation samples the physical arc and its local projected thickness", () => {
  const wall = {
    id: 1,
    a: 0,
    b: 1,
    height: 270,
    thickness: 4,
    geometry: { type: "arc", center: { x: 0, z: 0 }, radius: 10, clockwise: false },
  };
  setScene(wall);
  const samples = wallElevationSamples("front", wall, { includeOpenings: false });
  assert.ok(samples.length >= 13, "an arc has intermediate elevation stations");
  const middle = samples.reduce((best, sample) =>
    Math.abs(sample.s - Math.PI * 2.5) < Math.abs(best.s - Math.PI * 2.5) ? sample : best
  );
  near(middle.x, Math.SQRT1_2 * 10, 0.03);
  near(middle.z, Math.SQRT1_2 * 10, 0.03);
  assert.ok(middle.hi > middle.lo, "the wall faces use the arc's local tangent");
});

test("intermediate top and base controls determine the elevation span", () => {
  const length = Math.PI * 5;
  const wall = {
    id: 2,
    a: 0,
    b: 1,
    height: 220,
    thickness: 10,
    geometry: { type: "arc", center: { x: 0, z: 0 }, radius: 10, clockwise: false },
    profile: {
      top: [{ s: 0, height: 180 }, { s: length / 2, height: 325 }, { s: length, height: 210 }],
      base: [{ s: 0, height: 15 }, { s: length / 2, height: 45 }, { s: length, height: 20 }],
    },
  };
  setScene(wall);
  const span = wallElevationSpan(wall);
  near(span.bottom, 15);
  near(span.top, 325);
  const samples = wallElevationSamples("front", wall, { includeOpenings: false });
  const peak = samples.find((sample) => Math.abs(sample.s - length / 2) < 1e-7);
  assert.ok(peak, "profile controls are preserved as exact stations");
  near(peak.bottom, 45);
  near(peak.top, 325);
  near(ceilingHeight(), 325);
});

test("compact endpoint slopes and opening jambs remain exact elevation stations", () => {
  const wall = {
    id: 3,
    a: 0,
    b: 1,
    height: 270,
    thickness: 10,
    profile: { topA: 240, topB: 300, baseA: 10, baseB: 30 },
  };
  setScene(wall, [{ id: 9, wall: 3, s: 7, width: 4, sill: 80, height: 100, type: "window" }]);
  const samples = wallElevationSamples("right", wall);
  const length = Math.hypot(10, 10);
  near(samples[0].top, 240);
  near(samples[0].bottom, 10);
  near(samples.at(-1).top, 300);
  near(samples.at(-1).bottom, 30);
  [5, 7, 9].forEach((s) => assert.ok(samples.some((sample) => Math.abs(sample.s - s) < 1e-7)));
  near(wallElevationSpan(wall).top, 300);
  assert.ok(length > samples[0].s);
});

test("room dividers do not raise the physical ceiling", () => {
  setScene({ id: 4, a: 0, b: 1, height: 999, thickness: 0, kind: "roomDivider" });
  near(ceilingHeight(), 270);
});

test("drawing and hit-testing share the curved sloped silhouette", () => {
  const length = Math.PI * 5;
  const wall = {
    id: 5,
    a: 0,
    b: 1,
    height: 200,
    thickness: 6,
    geometry: { type: "arc", center: { x: 0, z: 0 }, radius: 10, clockwise: false },
    profile: { top: [{ s: 0, height: 150 }, { s: length / 2, height: 280 }, { s: length, height: 170 }] },
  };
  setScene(wall);
  S.CW = 800;
  S.CH = 600;
  S.viewAxis = "front";
  S.markers = [];
  const calls = [];
  const context = new Proxy({
    measureText(text) { return { width: String(text).length * 6 }; },
  }, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === "symbol") return target[key];
      return (...args) => calls.push([key, ...args]);
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  drawElevation(context);
  assert.ok(calls.some((call) => call[0] === "fill"), "sampled wall strips were painted");

  const samples = wallElevationSamples("front", wall, { includeOpenings: false });
  const middle = samples.find((sample) => Math.abs(sample.s - length / 2) < 1e-7);
  const uMin = Math.min(...samples.map((sample) => sample.lo));
  const uMax = Math.max(...samples.map((sample) => sample.hi));
  const scale = Math.min((S.CW * 0.86) / (uMax - uMin), (S.CH * 0.7) / 280);
  const ox = (S.CW - (uMax - uMin) * scale) / 2 - uMin * scale;
  const y0 = S.CH - Math.max(70, S.CH * 0.14);
  const px = ox + middle.u * scale;
  const pyInside = y0 - 200 * scale;
  const pyAbove = y0 - 300 * scale;
  assert.equal(elevationHit(px, pyInside)?.ref, wall);
  assert.equal(elevationHit(px, pyAbove), null);
});
