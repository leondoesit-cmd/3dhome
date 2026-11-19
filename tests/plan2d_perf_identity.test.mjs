/* Plan paint work cut without changing a single answer:
   - measure4 (js/measure.js) builds each wall's thick quad and each item's
     corners once per HUD paint (withMeasureObstacles) instead of once per
     direction per origin;
   - the dimension chains (js/plan2d/dim_chains.js chainSides) look wall
     thickness up in one first-match map instead of a find per wall;
   - the custom-layer counts (js/ui_layers.js syncCounts) count every layer in
     one pass over the items (userLayerCounts);
   - hitMEP (js/mep/clashes.js) normalizes the MEP state once per hit test.
   Each is checked against the old algorithm, kept here verbatim. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { S } from "../js/state.js";
import { wallGeom, distSeg } from "../js/geometry.js";
import { isLamp } from "../js/furniture.js";
import {
  DIRS4, itemCorners, measure4, measureFootprintBuilds, rayToCorners, withMeasureObstacles,
} from "../js/measure.js";
import { addUserLayer, itemsOnUserLayer, userLayerCounts } from "../js/user_layers.js";
import { resetLayers, layerRank } from "../js/layers.js";
import { addNode, addRun, ensureMEP, hitMEP, mepLayerVisible, mepVisible } from "../js/mep.js";
import { nodePos } from "../js/mep/topology.js";
import { sourceFunctionText } from "./helpers/source_function.mjs";

// a small deterministic PRNG, so a failure reproduces
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---- 1. measure4 ---- */
// measure4 as it was: every footprint rebuilt per direction
function oldMeasure4(ox, oz, ownCs, skip, options) {
  options = options || {};
  var target = options.target || "nearest";
  var wallIds = options.wallIds || null;
  var both = target === "both";
  var out = [];
  DIRS4.forEach(function (d) {
    var ownT = ownCs ? rayToCorners(ox, oz, d.dx, d.dz, ownCs) : 0;
    if (ownT === null) return;
    var wallT = null;
    var itemT = null;
    S.walls.forEach(function (w) {
      if (target === "object") return;
      if (target === "manual" && (!wallIds || wallIds.indexOf(w.id) === -1)) return;
      var gm = wallGeom(w);
      if (!(gm.L > 0)) return;
      var h = (w.thickness || 0) / 2, nx = -gm.uz * h, nz = gm.ux * h;
      var face = rayToCorners(ox, oz, d.dx, d.dz, [
        { x: gm.a.x + nx, z: gm.a.z + nz }, { x: gm.b.x + nx, z: gm.b.z + nz },
        { x: gm.b.x - nx, z: gm.b.z - nz }, { x: gm.a.x - nx, z: gm.a.z - nz },
      ]);
      if (face === null) return;
      if (face > ownT + 0.5 && (wallT === null || face < wallT)) wallT = face;
    });
    S.items.forEach(function (o) {
      if (target === "wall" || target === "manual") return;
      if (o === skip || isLamp(o)) return;
      var tt = rayToCorners(ox, oz, d.dx, d.dz, itemCorners(o));
      if (tt !== null && tt > ownT + 0.5 && (itemT === null || tt < itemT)) itemT = tt;
    });
    function pushHit(hitT, kind) {
      if (hitT === null) return;
      var gap = hitT - ownT;
      if (gap < 1) return;
      out.push({ dir: d, ownT: ownT, hitT: hitT, gap: gap, kind: kind });
    }
    if (both) {
      pushHit(wallT, "wall");
      pushHit(itemT, "item");
      return;
    }
    if (wallT === null && itemT === null) return;
    if (itemT === null || (wallT !== null && wallT <= itemT)) pushHit(wallT, "wall");
    else pushHit(itemT, "item");
  });
  return out;
}

// a room of random (often diagonal) walls, a zero-length one, rotated pieces and a lamp
function randomScene(r) {
  const n = 4 + Math.floor(r() * 5);
  S.nodes = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    const rad = 250 + r() * 250;
    S.nodes.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad });
  }
  S.nodes.push({ x: S.nodes[0].x, z: S.nodes[0].z });
  S.walls = [];
  for (let i = 0; i < n; i++) S.walls.push({ id: "w" + i, a: i, b: (i + 1) % n, thickness: 5 + r() * 25, height: 270 });
  S.walls.push({ id: "p", a: 0, b: Math.floor(n / 2), thickness: 10, height: 270 }); // a diagonal partition
  S.walls.push({ id: "z", a: 0, b: n, thickness: 10, height: 270 }); // zero length
  S.items = [];
  const k = 3 + Math.floor(r() * 6);
  for (let i = 0; i < k; i++) {
    S.items.push({ id: "i" + i, type: i === 1 ? "ceilingLight" : "sofa", x: (r() - 0.5) * 300, z: (r() - 0.5) * 300,
      w: 30 + r() * 120, d: 30 + r() * 80, rot: r() * 360 });
  }
}

function originsOf(r) {
  const out = [];
  for (let i = 0; i < 4; i++) out.push({ x: (r() - 0.5) * 400, z: (r() - 0.5) * 400, cs: null, skip: null });
  S.items.forEach((it) => out.push({ x: it.x, z: it.z, cs: itemCorners(it), skip: it }));
  return out;
}

const targets = (r) => [
  {}, { target: "nearest" }, { target: "both" }, { target: "wall" }, { target: "object" },
  { target: "manual", wallIds: S.walls.filter(() => r() < 0.5).map((w) => w.id) }, { target: "manual" },
];

test("measure4 gives the old hits, in the old order, scoped to a paint or not", () => {
  const r = rng(7);
  for (let scene = 0; scene < 60; scene++) {
    randomScene(r);
    const origins = originsOf(r), opts = targets(r);
    const expected = [], got = [], scoped = [];
    origins.forEach((o) => opts.forEach((op) => {
      expected.push(oldMeasure4(o.x, o.z, o.cs, o.skip, op));
      got.push(measure4(o.x, o.z, o.cs, o.skip, op));
    }));
    withMeasureObstacles(() => origins.forEach((o) => opts.forEach((op) => scoped.push(measure4(o.x, o.z, o.cs, o.skip, op)))));
    assert.deepEqual(got, expected, "scene " + scene);
    assert.deepEqual(scoped, expected, "scene " + scene + " (one paint)");
    assert.ok(expected.some((h) => h.length), "the scenes do hit things");
  }
});

test("measure4 builds each footprint once per paint, and reads moved pieces on the next one", () => {
  randomScene(rng(3));
  S.items = S.items.filter((it) => !isLamp(it));
  const origins = [{ x: 0, z: 0 }, { x: 40, z: -30 }, { x: -60, z: 20 }, { x: 10, z: 90 }];
  let before = measureFootprintBuilds();
  withMeasureObstacles(() => origins.forEach((o) => measure4(o.x, o.z, null, null)));
  assert.equal(measureFootprintBuilds() - before, S.walls.length + S.items.length, "one build per wall and piece per paint");
  // a single call outside a paint still shares them across its four directions
  before = measureFootprintBuilds();
  measure4(0, 0, null, null);
  assert.equal(measureFootprintBuilds() - before, S.walls.length + S.items.length);
  // a drag between two paints: the next paint measures the piece where it is now
  const it = S.items[0];
  it.x = 0; it.z = 0; it.rot = 0; it.w = 20; it.d = 20;
  const first = withMeasureObstacles(() => measure4(100, 0, null, null, { target: "object" }));
  it.x = 60;
  const second = withMeasureObstacles(() => measure4(100, 0, null, null, { target: "object" }));
  assert.deepEqual(second, oldMeasure4(100, 0, null, null, { target: "object" }));
  assert.notDeepEqual(first, second);
});

/* ---- 2. the dimension chains' wall thickness ---- */
const chainSrc = readFileSync(new URL("../js/plan2d/dim_chains.js", import.meta.url), "utf8");
function oldChainSides(Sx, walls) {
  var bb = { minx: Infinity, minz: Infinity, maxx: -Infinity, maxz: -Infinity }, band = 0;
  walls.forEach(function (w) {
    w.pts.forEach(function (p) {
      bb.minx = Math.min(bb.minx, p.x); bb.maxx = Math.max(bb.maxx, p.x);
      bb.minz = Math.min(bb.minz, p.z); bb.maxz = Math.max(bb.maxz, p.z);
    });
    var t = (Sx.walls.find(function (sw) { return sw.id === w.id; }) || {}).thickness;
    if (t > band) band = t;
  });
  band += 2;
  var top = [], bottom = [], left = [], right = [], exterior = {};
  walls.forEach(function (w) {
    var lo = { x: Infinity, z: Infinity }, hi = { x: -Infinity, z: -Infinity };
    w.pts.forEach(function (p) {
      lo.x = Math.min(lo.x, p.x); lo.z = Math.min(lo.z, p.z);
      hi.x = Math.max(hi.x, p.x); hi.z = Math.max(hi.z, p.z);
    });
    if (lo.z <= bb.minz + band) top.push(w);
    if (hi.z >= bb.maxz - band) bottom.push(w);
    if (lo.x <= bb.minx + band) left.push(w);
    if (hi.x >= bb.maxx - band) right.push(w);
    var horiz = Math.abs(Math.cos(w.ang)) > Math.abs(Math.sin(w.ang));
    if (horiz ? (lo.z <= bb.minz + 0.5 || hi.z >= bb.maxz - 0.5)
      : (lo.x <= bb.minx + 0.5 || hi.x >= bb.maxx - 0.5)) exterior[w.id] = true;
  });
  return { top: top, bottom: bottom, left: left, right: right, exterior: exterior };
}

test("chainSides: the same sides and shell from one first-match thickness map", () => {
  const ctx = vm.createContext({ S: {}, Map });
  vm.runInContext(sourceFunctionText(chainSrc, "chainSides") + "\nthis.chainSides = chainSides;", ctx);
  const r = rng(11);
  for (let k = 0; k < 80; k++) {
    const walls = [], all = [];
    const n = 3 + Math.floor(r() * 30);
    for (let i = 0; i < n; i++) {
      const id = Math.floor(r() * n * 0.8); // duplicate ids: the FIRST wall's thickness counts
      const x = r() * 1000, z = r() * 800, L = 20 + r() * 400, ang = r() < 0.5 ? 0 : r() < 0.5 ? Math.PI / 2 : r() * 6;
      const t = 5 + r() * 40;
      all.push({ id, thickness: t });
      const ux = Math.cos(ang), uz = Math.sin(ang), h = t / 2;
      if (r() < 0.8) walls.push({ id, ang, pts: [
        { x: x - uz * h, z: z + ux * h }, { x: x + ux * L - uz * h, z: z + uz * L + ux * h },
        { x: x + ux * L + uz * h, z: z + uz * L - ux * h }, { x: x + uz * h, z: z - ux * h },
      ] });
    }
    walls.push({ id: "ghost", ang: 0, pts: [{ x: 1, z: 1 }, { x: 2, z: 1 }] }); // no wall of that id
    let reads = 0;
    // count element reads of S.walls: once over the list, not once per descriptor
    ctx.S.walls = new Proxy(all, { get(tgt, p, rcv) { if (typeof p === "string" && /^\d+$/.test(p)) reads++; return Reflect.get(tgt, p, rcv); } });
    const got = ctx.chainSides(walls);
    assert.ok(reads <= all.length, "one pass over S.walls (" + reads + " reads for " + all.length + " walls, " + walls.length + " descriptors)");
    const want = oldChainSides({ walls: all }, walls);
    for (const side of ["top", "bottom", "left", "right"]) assert.deepEqual(Array.from(got[side], (w) => walls.indexOf(w)), want[side].map((w) => walls.indexOf(w)), side);
    assert.deepEqual({ ...got.exterior }, want.exterior);
  }
});

/* ---- 3. custom-layer counts ---- */
test("userLayerCounts gives itemsOnUserLayer(id).length for every layer", () => {
  S.workspace = { ...S.workspace, userLayers: [] };
  const L1 = addUserLayer("A"), L2 = addUserLayer("B"), L3 = addUserLayer("Empty");
  const r = rng(5);
  S.items = [null];
  for (let i = 0; i < 50; i++) S.items.push({ id: "i" + i, ulayer: r() < 0.4 ? L1.id : r() < 0.5 ? L2.id : r() < 0.5 ? undefined : "gone" });
  const counts = userLayerCounts();
  for (const id of [L1.id, L2.id, L3.id, "gone", undefined]) assert.equal(counts.get(id) || 0, itemsOnUserLayer(id).length, String(id));
});

test("syncCounts writes the same numbers from one pass over the items", () => {
  const src = readFileSync(new URL("../js/ui_layers.js", import.meta.url), "utf8");
  const layers = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const rows = {};
  layers.forEach((L) => (rows["ul:" + L.id] = { count: { textContent: "" } }));
  const items = [];
  for (let i = 0; i < 20; i++) items.push({ ulayer: ["a", "b", "b", "x"][i % 4] });
  let passes = 0;
  const S2 = { get items() { passes++; return items; } };
  const ctx = vm.createContext({
    LAYER_IDS: [], rows, layerCount: () => null, userLayers: () => layers, S: S2, String, Map,
    itemsOnUserLayer: (id) => S2.items.filter((it) => it && it.ulayer === id),
  });
  vm.runInContext(
    sourceFunctionText(readFileSync(new URL("../js/user_layers.js", import.meta.url), "utf8"), "userLayerCounts").replace(/^export\s+/, "")
      + "\n" + sourceFunctionText(src, "syncCounts") + "\nthis.syncCounts = syncCounts;", ctx);
  ctx.syncCounts();
  assert.deepEqual(layers.map((L) => rows["ul:" + L.id].count.textContent), ["5", "10", "0", "0"]);
  assert.equal(passes, 1, "one pass for every row");
});

/* ---- 4. hitMEP ---- */
function oldHitMEP(px, pz, scale = S.SC) {
  if (layerRank("mep") === Infinity) return null;
  if (!isFinite(scale) || scale <= 0) scale = 1;
  var m = ensureMEP();
  var tolN = 12 / scale, tolV = 9 / scale, tolR = 8 / scale;
  var bn = null, bd = tolN;
  m.nodes.forEach(function (n) {
    if (!mepVisible(n.sys) || !mepLayerVisible(n.layer)) return;
    var p = nodePos(n), d = Math.hypot(px - p.x, pz - p.z);
    if (d < bd) { bd = d; bn = n; }
  });
  if (bn) return { kind: "mepNode", ref: bn };
  var bv = null, bvd = tolV;
  var br = null, brd = tolR;
  m.runs.forEach(function (r) {
    if (!mepVisible(r.sys) || !mepLayerVisible(r.layer) || !r.pts) return;
    for (var i = 0; i < r.pts.length; i++) {
      var d = Math.hypot(px - r.pts[i].x, pz - r.pts[i].z);
      if (d < bvd) { bvd = d; bv = { r: r, vi: i }; }
    }
    for (var j = 1; j < r.pts.length; j++) {
      var ds = distSeg(px, pz, r.pts[j - 1].x, r.pts[j - 1].z, r.pts[j].x, r.pts[j].z);
      if (ds < brd) { brd = ds; br = r; }
    }
  });
  if (bv) return { kind: "mepRun", ref: bv.r, vi: bv.vi };
  if (br) return { kind: "mepRun", ref: br, vi: -1 };
  return null;
}

test("hitMEP: the old picks with one MEP normalization per hit test", () => {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  S.walls = [0, 1, 2, 3].map((i) => ({ id: i + 1, a: i, b: (i + 1) % 4, thickness: 10, height: 270 }));
  S.items = []; S.openings = []; S.mep = null; S.SC = 1;
  resetLayers();
  S.layers.mep.vis = "show";
  const r = rng(9), systems = ["power", "water", "hvac", "data"], layers = ["wall", "ceiling", "floor", undefined];
  const kinds = { power: "socket", water: "tap", hvac: "supply", data: "data" };
  for (let i = 0; i < 25; i++) {
    const sys = systems[i % 4];
    addNode(sys, kinds[sys], 20 + r() * 560, 20 + r() * 360, null, null, layers[i % 3]);
  }
  for (let i = 0; i < 12; i++) {
    const pts = [];
    for (let k = 0; k < 2 + (i % 3); k++) pts.push({ x: 20 + r() * 560, z: 20 + r() * 360 });
    addRun(systems[i % 4], "circuit", pts, null, null, layers[i % 3]);
  }
  ensureMEP().runs.push({ id: "bare", sys: "power", layer: undefined, pts: null }); // a run with no points
  ensureMEP().nodes.forEach((n, i) => { if (i % 5 === 0) n.layer = undefined; });
  const m = ensureMEP(), picked = { mepNode: 0, mepRun: 0 };
  for (const [vis, layerVis, show] of [
    [{}, {}, true], [{ power: false }, {}, true], [{}, { ceiling: false }, true], [{ water: false, hvac: false }, { wall: false }, true], [{}, {}, false],
  ]) {
    m.vis = Object.assign({}, vis); m.layerVis = Object.assign({}, layerVis); m.show = show;
    for (let k = 0; k < 300; k++) {
      const px = r() * 600, pz = r() * 400, sc = [1, 0.5, 2, 0, NaN][k % 5];
      const want = oldHitMEP(px, pz, sc);
      if (want) picked[want.kind]++;
      assert.deepEqual(hitMEP(px, pz, sc), want, JSON.stringify({ vis, layerVis, show, px, pz, sc }));
    }
  }
  assert.ok(picked.mepNode > 5 && picked.mepRun > 5, "devices and runs were picked: " + JSON.stringify(picked));
  // ensureMEP re-makes S.mep.vis on every call: count those
  m.show = true;
  let made = 0, v = m.vis;
  Object.defineProperty(m, "vis", { configurable: true, get: () => v, set: (x) => { made++; v = x; } });
  hitMEP(300, 200, 1);
  assert.equal(made, 1, "one ensureMEP per hit test (" + made + ")");
  delete m.vis; m.vis = v;
});
