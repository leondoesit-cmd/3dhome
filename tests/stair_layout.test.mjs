import test from "node:test";
import assert from "node:assert/strict";
import {
  stairLayout, stairPreset, autoStair, applyStairConfig, stairCodeReport, mirrorStair, setRunSteps,
  setRiserCount, fitStair, addStairTurn, removeStairRun, presetOf, stairRiserCount, stairEdges,
  stairRulesFrom, stairVariantShape,
} from "../js/stair_layout.js";
import { rotateGrip, gripAngle, gripHitPx } from "../js/rotate_grip.js";
import { symbolPrims } from "../js/plan_symbols.js";
import { codeProfile } from "../js/code_profiles.js";
import { spriteKey } from "../js/plan_sprite_key.js";

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const IL = { maxRiser: 17.5, minTread: 26 };
function bbox(lay) {
  const pts = lay.steps.flatMap((s) => s.poly);
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}
function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j].x * poly[i].z - poly[i].x * poly[j].z;
  return Math.abs(a / 2);
}
function walkLength(lay) {
  let L = 0;
  for (let i = 1; i < lay.walk.length; i++) L += Math.hypot(lay.walk[i].x - lay.walk[i - 1].x, lay.walk[i].z - lay.walk[i - 1].z);
  return L;
}
const rectOf = (s) => {
  const xs = s.poly.map((p) => p.x), zs = s.poly.map((p) => p.z);
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
};

/* The catalogue's three plans, exactly as the 3D builder computed them before
   stair_layout.js existed (copied formulas, two sizes each). */
function oldStraight(w, d, n) {
  const hw = w / 2, hd = d / 2, out = [];
  for (let s = 0; s < n; s++) out.push([-hw, hw, hd - ((s + 1) * d) / n, hd - (s * d) / n, s]);
  return out;
}
function oldL(w, d, n) {
  const hw = w / 2, hd = d / 2, fw = Math.min(w * 0.45, 100), n1 = Math.max(1, Math.round(n * 0.55)), n2 = n - n1 - 1,
    len1 = d - fw, len2 = w - fw, out = [];
  for (let i = 0; i < n1; i++) out.push([-hw, -hw + fw, hd - ((i + 1) * len1) / n1, hd - (i * len1) / n1, i]);
  out.push([-hw, -hw + fw, -hd, -hd + fw, n1]);
  for (let j = 0; j < n2; j++) out.push([-hw + fw + (j * len2) / n2, -hw + fw + ((j + 1) * len2) / n2, -hd, -hd + fw, n1 + 1 + j]);
  return out;
}
function oldU(w, d, n) {
  const hw = w / 2, hd = d / 2, flightW = Math.min(w * 0.45, 100), landingD = Math.min(flightW, d * 0.35);
  const flightD = d - landingD, first = Math.max(1, Math.floor((n - 1) / 2)), second = Math.max(1, n - first - 1), out = [];
  for (let u1 = 0; u1 < first; u1++) out.push([-hw, -hw + flightW, hd - (u1 + 1) * flightD / first, hd - u1 * flightD / first, u1]);
  out.push([-hw, hw, -hd, -hd + landingD, first]);
  for (let u2 = 0; u2 < second; u2++)
    out.push([hw - flightW, hw, -hd + landingD + u2 * flightD / second, -hd + landingD + (u2 + 1) * flightD / second, first + 1 + u2]);
  return out;
}

test("legacy straight / L / U lay out exactly the steps the old builder made", () => {
  const cases = [
    ["straight", oldStraight, { w: 100, d: 250, h: 260 }, 14],
    ["straight", oldStraight, { w: 90, d: 330, h: 300, steps: 17 }, 17],
    ["L", oldL, { w: 200, d: 300, h: 280 }, 14],
    ["L", oldL, { w: 260, d: 360, h: 300, configuration: { stepCount: 18 } }, 18],
    ["U", oldU, { w: 220, d: 280, h: 280, configuration: { shape: "U" } }, 14],
    ["U", oldU, { w: 240, d: 320, h: 300, configuration: { shape: "U", stepCount: 17 } }, 17],
  ];
  for (const [shape, old, it, n] of cases) {
    const lay = stairLayout(it, shape === "L" ? "L" : null);
    assert.equal(lay.designed, false);
    assert.equal(lay.shape, shape);
    assert.equal(lay.legacy.n, n);
    assert.ok(near(lay.riser, it.h / n));
    const want = old(it.w, it.d, n);
    assert.equal(lay.steps.length, want.length, shape + " step count");
    lay.steps.forEach((s, i) => {
      const r = s.rect;
      assert.deepEqual([r.x0, r.x1, r.z0, r.z1, s.k], want[i], shape + " step " + i);
      assert.ok(near(s.top, (s.k + 1) * (it.h / n)));
    });
  }
  // the straight going is the depth over the steps; L / U have one per flight
  assert.ok(near(stairLayout({ w: 100, d: 250, h: 260 }).going, 250 / 14));
  assert.equal(stairLayout({ w: 200, d: 300, h: 280 }, "L").going, null);
  assert.equal(stairLayout({ w: 200, d: 300, h: 280 }, "L").flights.length, 2);
  // the curved variant always keeps its fan, even with a design stored
  assert.equal(stairLayout({ w: 250, d: 250, h: 280, configuration: { stair: stairPreset("L", { risers: 16 }) } }, "curved").designed, false);
});

test("designed straight: bbox, equal risers, top step at the rise, walking line", () => {
  const it = { h: 280 };
  const cfg = stairPreset("straight", { risers: 16, width: 95, going: 27 });
  const lay = applyStairConfig(it, cfg, 280);
  assert.equal(lay.risers, 16);
  assert.ok(near(lay.riser, 17.5));
  assert.equal(lay.going, 27);
  assert.ok(near(it.w, 95) && near(it.d, 16 * 27) && it.h === 280);
  const b = bbox(lay);
  assert.ok(near(b.x0, -47.5) && near(b.x1, 47.5) && near(b.z0, -216) && near(b.z1, 216), "centred on the item");
  assert.ok(near(Math.max(...lay.steps.map((s) => s.top)), 280), "the top step is flush with the floor above");
  assert.ok(near(walkLength(lay), 16 * 27));
  assert.ok(lay.walk[0].z > lay.walk[lay.walk.length - 1].z, "the flight climbs from the front toward -z");
  assert.equal(it.configuration.stepCount, 16);
  assert.equal(it.configuration.shape, "straight");
});

test("designed L and U: footprint, risers, merged half landing at one level", () => {
  const L = stairLayout({ h: 300, configuration: { stair: stairPreset("L", { risers: 17, width: 100, going: 28, turn: "R" }) } });
  assert.equal(L.risers, 17);
  assert.deepEqual(L.config.runs, [8, 8]);
  assert.equal(L.steps.filter((s) => s.kind === "landing").length, 1);
  assert.ok(near(L.w, 100 + 8 * 28) && near(L.d, 8 * 28 + 100));
  assert.ok(near(walkLength(L), 8 * 28 + 50 + 50 + 8 * 28));
  assert.ok(near(Math.max(...L.steps.map((s) => s.top)), 300));

  const U = stairLayout({ h: 300, configuration: { stair: stairPreset("U", { risers: 17, width: 100, going: 28, turn: "R" }) } });
  assert.deepEqual(U.config.runs, [8, 0, 8]);
  const landings = U.steps.filter((s) => s.kind === "landing");
  assert.equal(landings.length, 1, "a 0-step middle run merges the two quarter landings");
  assert.ok(near(polyArea(landings[0].poly), 200 * 100), "one 2W x W half landing");
  assert.equal(U.risers, 17);
  assert.ok(near(U.w, 200) && near(U.d, 100 + 8 * 28));
  // up the left, down the right: the bottom and the top of the flight sit side by side at the front
  const first = U.steps.find((s) => s.k === 0), last = U.steps.find((s) => s.k === 16);
  assert.ok(rectOf(first)[0] < rectOf(last)[0]);
  assert.ok(near(rectOf(first)[3], U.d / 2) && near(rectOf(last)[3], U.d / 2));
});

test("designed three runs and a straight intermediate landing", () => {
  const cfg = { width: 90, going: 27, runs: [5, 4, 5], turns: ["S", "L"], turnType: "landing" };
  const lay = stairLayout({ h: 289, configuration: { stair: cfg } });
  assert.equal(lay.risers, 14 + 2);
  assert.ok(near(lay.riser, 289 / 16));
  assert.equal(lay.steps.filter((s) => s.kind === "landing").length, 2);
  assert.ok(near(lay.w, 90 + 5 * 27) && near(lay.d, 5 * 27 + 90 + 4 * 27 + 90));
  assert.equal(presetOf(lay.config), "custom");
  // tread lines and an outline come out of the same blocks
  const e = stairEdges(lay);
  assert.ok(e.inner.length >= 14 && e.outer.length >= 6);
});

test("winders: three wedges per quarter turn that tile the square", () => {
  const lay = stairLayout({ h: 300, configuration: { stair: stairPreset("L", { risers: 17, width: 100, going: 28, turnType: "winder" }) } });
  const wedges = lay.steps.filter((s) => s.kind === "winder");
  assert.equal(wedges.length, 3);
  assert.ok(near(wedges.reduce((a, s) => a + polyArea(s.poly), 0), 100 * 100, 1e-6));
  assert.equal(lay.risers, 17);
  assert.deepEqual(lay.config.runs, [7, 7]);
  assert.ok(near(lay.winderGoing, Math.PI * 100 / 12));
  const rep = stairCodeReport(lay, IL), going = rep.find((r) => r.rule === "stairMinTread");
  assert.equal(going.note, "winder-walkline");
  assert.ok(near(going.value, Math.PI * 100 / 12));
  // a U with winders turns through six
  const U = stairLayout({ h: 300, configuration: { stair: stairPreset("U", { risers: 18, width: 100, going: 28, turnType: "winder" }) } });
  assert.equal(U.steps.filter((s) => s.kind === "winder").length, 6);
  assert.equal(U.risers, 18);
});

test("auto: every code row passes for the Israeli limits at common rises", () => {
  for (const rise of [270, 300, 320]) {
    for (const preset of ["straight", "L", "U"]) {
      for (const turnType of ["landing", "winder"]) {
        const cfg = autoStair({ rise, rules: IL, preset, width: 110, turn: "L", turnType });
        const lay = stairLayout({ h: rise, configuration: { stair: cfg } });
        const rows = stairCodeReport(lay, IL);
        assert.ok(rows.length >= 2);
        rows.forEach((r) => assert.ok(r.ok, `${preset}/${turnType} at ${rise}: ${r.rule} ${r.value} vs ${r.limit}`));
        assert.ok(near(Math.max(...lay.steps.map((s) => s.top)), rise));
        assert.equal(lay.config.width, 110);
      }
    }
  }
  // stride / pitch limits (UK-like) push the numbers too
  const uk = { maxRiser: 22, minTread: 22, maxPitch: 42, strideMin: 55, strideMax: 70 };
  const lay = stairLayout({ h: 265, configuration: { stair: autoStair({ rise: 265, rules: uk, preset: "straight" }) } });
  stairCodeReport(lay, uk).forEach((r) => assert.ok(r.ok, r.rule));
  // a real profile's rules read straight into the numbers
  assert.equal(stairRulesFrom(codeProfile("il")).maxRiser, 17.5);
  assert.ok(fitStair(stairPreset("U", { risers: 9 }), 300, IL).runs.every((n, i) => i === 1 ? n === 0 : n >= 1));
});

test("mirror, risers and run edits keep the design consistent", () => {
  const cfg = stairPreset("L", { risers: 17, width: 100, going: 28, turn: "R" });
  assert.deepEqual(mirrorStair(cfg).turns, ["L"]);
  assert.deepEqual(mirrorStair(mirrorStair(cfg)).turns, ["R"]);
  const a = stairLayout({ h: 300, configuration: { stair: cfg } }), b = stairLayout({ h: 300, configuration: { stair: mirrorStair(cfg) } });
  assert.ok(near(a.w, b.w) && near(a.d, b.d));

  // autoSteps: the riser count stays, the last run gives
  const s1 = setRunSteps(cfg, 0, 10);
  assert.deepEqual(s1.runs, [10, 6]);
  assert.equal(stairRiserCount(s1), 17);
  const s2 = setRunSteps(cfg, 1, 10);
  assert.deepEqual(s2.runs, [6, 10]);
  assert.equal(setRunSteps(cfg, 0, 16), null, "the other run would vanish");
  assert.equal(setRunSteps(cfg, 0, 0), null, "an end run keeps at least one tread");
  // not auto: the riser count follows
  const free = Object.assign({}, cfg, { autoSteps: false });
  assert.equal(stairRiserCount(setRunSteps(free, 0, 12)), 21);
  // a U's middle run may be 0 (merged landing) and grow to a real run
  const U = stairPreset("U", { risers: 17 });
  assert.deepEqual(setRunSteps(Object.assign({}, U, { autoSteps: false }), 1, 2).runs, [8, 2, 8]);

  assert.equal(stairRiserCount(setRiserCount(cfg, 20)), 20);
  assert.equal(stairRiserCount(setRiserCount(stairPreset("U", { risers: 17 }), 19)), 19);
  const added = addStairTurn(stairPreset("straight", { risers: 16 }), "L");
  assert.deepEqual(added.turns, ["L"]);
  assert.equal(added.runs.reduce((x, y) => x + y, 0), 16);
  assert.deepEqual(removeStairRun(added, 1).runs, [16]);
});

test("the plan symbol draws a designed stair from its layout", () => {
  const it = { h: 300 };
  applyStairConfig(it, stairPreset("L", { risers: 17, width: 100, going: 28 }), 300);
  const prims = symbolPrims("stairs", it.w, it.d, { configuration: it.configuration });
  assert.ok(prims.some((p) => p.upLabel), "UP at the foot");
  const walk = prims.filter((p) => p.walk);
  assert.ok(walk.length >= 4, "a walking line with its arrow head");
  assert.ok(prims.filter((p) => p.k === "line" && p.weight === "heavy" && !p.walk).length >= 6, "a heavy outline");
  // every line stays inside the derived footprint
  prims.filter((p) => p.k === "line").forEach((p) => {
    [p.x1, p.x2].forEach((x) => assert.ok(Math.abs(x) <= it.w / 2 + 0.1));
    [p.z1, p.z2].forEach((z) => assert.ok(Math.abs(z) <= it.d / 2 + 0.1));
  });
  assert.equal(stairVariantShape("lShape"), "L");
  assert.equal(stairVariantShape("dark"), null);
  // the presentation plan's cached render refreshes when the design changes
  const before = spriteKey(Object.assign({ type: "stairs" }, it), 128);
  applyStairConfig(it, mirrorStair(it.configuration.stair), 300);
  assert.notEqual(spriteKey(Object.assign({ type: "stairs" }, it), 128), before);
});

test("rotate grip: handle beyond the back edge, angle from the pointer, 15° snaps", () => {
  const it = { x: 100, z: 200, w: 80, d: 60, rot: 0 };
  const g = rotateGrip(it, 2, 26);
  assert.ok(near(g.stem.x, 100) && near(g.stem.z, 170));
  assert.ok(near(g.handle.x, 100) && near(g.handle.z, 170 - 13));
  const g90 = rotateGrip(Object.assign({}, it, { rot: 90 }), 2, 26);
  assert.ok(near(g90.stem.x, 130) && near(g90.stem.z, 200), "turned 90°, the back edge faces +x");
  assert.equal(gripAngle(it, 100, 100), 0);
  assert.equal(gripAngle(it, 200, 200), 90);
  assert.equal(gripAngle(it, 100, 300), 180);
  assert.equal(gripAngle(it, 0, 200), 270);
  // the handle under the pointer reproduces the item's own angle
  for (const rot of [0, 30, 135, 300]) {
    const h = rotateGrip(Object.assign({}, it, { rot }), 1).handle;
    assert.equal(gripAngle(it, h.x, h.z), rot);
  }
  const p = { x: 100 + Math.sin(22 * Math.PI / 180) * 50, z: 200 - Math.cos(22 * Math.PI / 180) * 50 };
  assert.equal(gripAngle(it, p.x, p.z), 15, "snapped");
  assert.equal(gripAngle(it, p.x, p.z, true), 22, "Shift: whole degrees");
  assert.ok(gripHitPx("touch") > gripHitPx("mouse") && gripHitPx("pen") > gripHitPx("mouse"));
});
