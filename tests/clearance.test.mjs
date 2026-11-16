// Live distances from real outlines: js/item_outline.js, js/clearance.js and
// js/measure.js measureSides. Pure geometry in, numbers out.
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { itemOutline, isRoundItem, OUTLINE_SEGS } from "../js/item_outline.js";
import { floorClearances, labelSpots, minSeparation, sideDirs, sweepGap, verticalClearances, wallGap } from "../js/clearance.js";
import { measure4, measureSides, measureVertical } from "../js/measure.js";
import { seedVSpan, vSpanKeyOf } from "../js/furniture_api.js";

function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= (tol || 0.01), (msg || "") + " expected " + b + " got " + a);
}
const WALL = { id: 1, a: { x: 0, z: 0 }, b: { x: 600, z: 0 }, t: 10 }; // inner face z = 5
const box = (x, z, w, d, rot) => itemOutline({ type: "box", x, z, w, d, rot: rot || 0 });
const E = { x: 1, z: 0 }, W = { x: -1, z: 0 }, N = { x: 0, z: -1 };

test("outlines: rectangle, a 64-gon for round pieces, the L of a sectional", () => {
  assert.equal(box(0, 0, 100, 50).length, 4);
  const round = itemOutline({ type: "roundTable", x: 0, z: 0, w: 120, d: 100, rot: 0 });
  assert.equal(round.length, OUTLINE_SEGS);
  round.forEach((p) => near(Math.hypot(p.x, p.z), 50, 1e-9)); // min(w, d) / 2
  assert.ok(isRoundItem({ type: "pouf" }) && !isRoundItem({ type: "sofa" }));
  const sect = itemOutline({ type: "sofa", variant: "sectionalR", x: 0, z: 0, w: 240, d: 90, rot: 0 });
  assert.equal(sect.length, 6);
  const zMax = Math.max(...sect.map((p) => p.z));
  near(zMax, 45 + 90 * 0.85); // the return reaches out in front of the body
});

test("to a wall: a turned box measures from its nearest corner", () => {
  // a 100 x 100 box turned 45 deg, centre 100 from the wall line: corner reach 50 * sqrt 2
  const g = wallGap(box(300, 100, 100, 100, 45), WALL);
  near(g.gap, 100 - 5 - 50 * Math.SQRT2, 1e-6);
  near(g.from.x, 300, 1e-6); near(g.to.z, 5, 1e-6); // perpendicular, from the corner to the face
});

test("to a wall: a round table is centre distance minus radius", () => {
  const t = itemOutline({ type: "roundTable", x: 300, z: 105, w: 100, d: 100, rot: 0 });
  const g = wallGap(t, WALL);
  near(g.gap, 105 - 5 - 50, 0.07); // the inscribed 64-gon is within 0.12% of r
});

test("sweep: a circle toward a box meets it at the first contact, not bounding box to box", () => {
  const circle = itemOutline({ type: "roundTable", x: 0, z: 0, w: 100, d: 100, rot: 0 });
  const b = box(100, 60, 40, 40); // its near corner at (80, 40): off the circle's equator
  const s = sweepGap(circle, b, E);
  // the circle's point at height z=40 is x = sqrt(50^2 - 40^2) = 30, so 80 - 30 = 50
  near(s.gap, 50, 0.4);
  assert.ok(s.gap > 80 - 50 - 0.01, "more than the bounding-box gap of 30");
});

test("sweep: an L (concave) vs a box where the bounding box gives the wrong number", () => {
  const L = [{ x: 0, z: 0 }, { x: 200, z: 0 }, { x: 200, z: 50 }, { x: 60, z: 50 }, { x: 60, z: 150 }, { x: 0, z: 150 }];
  const b = box(130, 125, 40, 30); // sits in the L's notch: x 110..150, z 110..140
  const s = sweepGap(L, b, E);
  near(s.gap, 50); // from the leg's edge x=60 to the box at x=110
  const up = sweepGap(L, b, { x: 0, z: 1 }); // down the plan from the foot of the L
  near(up.gap, 60); // z 50 -> 110
});

test("overlapping outlines give 0, and a piece beside the swept band is not in the way", () => {
  assert.equal(sweepGap(box(0, 0, 100, 100), box(40, 0, 100, 100), E).gap, 0);
  assert.equal(minSeparation(box(0, 0, 100, 100), box(40, 0, 100, 100)).gap, 0);
  const a = box(0, 0, 100, 100), aside = box(120, 120, 40, 40); // diagonal
  assert.equal(sweepGap(a, aside, E), null);
  assert.equal(sweepGap(a, aside, { x: 0, z: 1 }), null);
  const m = minSeparation(a, aside);
  near(m.gap, Math.hypot(50, 50)); near(m.from.x, 50); near(m.to.x, 100);
});

test("floorClearances: first obstacle per side, walls perpendicular, a nearest neighbour line", () => {
  const poly = box(300, 100, 100, 60); // front +z
  const hits = floorClearances({
    poly, dirs: sideDirs(0, false), walls: [WALL],
    others: [{ id: "chair", poly: box(450, 100, 50, 50) }, { id: "lamp", poly: box(300, 190, 40, 40) }],
  });
  const by = Object.fromEntries(hits.map((h) => [h.dir, h]));
  near(by.back.gap, 100 - 30 - 5); assert.equal(by.back.kind, "wall");
  near(by.front.gap, 170 - 130); assert.equal(by.front.kind, "item");
  near(by.right.gap, 425 - 350); assert.equal(by.right.id, "chair");
  assert.equal(by.left, undefined); // nothing that way within reach
  const lone = floorClearances({ poly, dirs: sideDirs(0, false), walls: [], others: [{ id: "d", poly: box(420, 230, 40, 40) }] });
  assert.deepEqual(lone.map((h) => h.kind), ["near"]);
});

test("round piece: measured along the nearest wall's normal and tangent", () => {
  const poly = itemOutline({ type: "roundTable", x: 300, z: 105, w: 100, d: 100, rot: 33 });
  const dirs = sideDirs(33, true, [WALL], poly);
  near(dirs[0].x, 0, 1e-9); near(dirs[0].z, -1, 1e-9); // "front" faces the wall
  const hits = floorClearances({ poly, dirs, walls: [WALL], others: [] });
  near(hits.find((h) => h.dir === "front").gap, 50, 0.07);
});

test("measureSides reads the plan; the Point tool's measure4 is unchanged", () => {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }];
  S.walls = [{ id: 1, a: 0, b: 1, thickness: 10, height: 270 }];
  const it = { id: 1, type: "sofa", x: 300, z: 100, w: 200, d: 90, rot: 180 };
  S.items = [it];
  const hits = measureSides(it);
  const front = hits.find((h) => h.dir === "front"); // rot 180: front toward -z, the wall
  near(front.gap, 100 - 45 - 5); assert.equal(front.kind, "wall");
  const m4 = measure4(300, 100, null, it);
  assert.ok(m4.some((r) => r.dir.key === "n" && Math.abs(r.gap - 95) < 0.01));
});

test("floorClearances: an overlapped piece or wall drops out alone, the other sides still report", () => {
  const poly = box(300, 100, 100, 60); // z 70..130
  const rug = { id: "rug", poly: box(300, 100, 300, 200) }; // under it, overlapping everything
  const hits = floorClearances({ poly, dirs: sideDirs(0, false), walls: [WALL], others: [rug, { id: "c", poly: box(450, 100, 50, 50) }] });
  const by = Object.fromEntries(hits.map((h) => [h.dir, h]));
  near(by.back.gap, 70 - 5); assert.equal(by.right.id, "c");
  // pushed 3 cm into the wall: only the side heading into it closes
  const stuck = box(300, 32, 100, 60), side = { id: 9, a: { x: 500, z: -50 }, b: { x: 500, z: 300 }, t: 10 };
  const s = floorClearances({ poly: stuck, dirs: sideDirs(0, false), walls: [WALL, side], others: [] });
  assert.deepEqual(s.map((h) => h.dir).sort(), ["right"]); // front open, left open, back flush
  near(s[0].gap, 495 - 350);
});

test("floorClearances: a closest-points line to every near piece no side reports, nearest 4, within 200", () => {
  // an armchair against the wall; a sofa and side table to its right-front, a coffee table to its front-left
  const chair = box(100, 50, 80, 80); // x 60..140, z 10..90, flush-ish to WALL (face z 5)
  const others = [
    { id: "sofa", poly: box(260, 190, 160, 80) }, // diagonal: off both swept bands
    { id: "side", poly: box(170, 150, 30, 30) }, // diagonal, nearer
    { id: "coffee", poly: box(30, 170, 40, 40) }, // front-left, off the front band (x 10..50 < 60)
    { id: "far", poly: box(500, 380, 40, 40) }, // beyond 200
  ];
  const hits = floorClearances({ poly: chair, dirs: sideDirs(0, false), walls: [WALL], others });
  const near_ = hits.filter((h) => h.kind === "near");
  assert.deepEqual(near_.map((h) => h.id), ["side", "coffee", "sofa"]); // nearest first, "far" out of range
  near_.forEach((h) => near(h.gap, minSeparation(chair, others.find((o) => o.id === h.id).poly).gap, 1e-9));
  assert.ok(hits.some((h) => h.kind === "wall" && h.dir === "back"), "the directional results stay");
  // range is an option (gaps: side 47, coffee 61, sofa 72)
  assert.deepEqual(floorClearances({ poly: chair, dirs: sideDirs(0, false), walls: [], others, near: 65 })
    .filter((h) => h.kind === "near").map((h) => h.id), ["side", "coffee"]);
});

test("floorClearances: at most 4 near lines; a piece a side already reports is not repeated", () => {
  const poly = box(300, 200, 60, 60); // x 270..330, z 170..230
  const ring = [[200, 100], [400, 100], [200, 300], [400, 300], [180, 90]].map(([x, z], i) => ({ id: "d" + i, poly: box(x, z, 30, 30) }));
  const hits = floorClearances({ poly, dirs: sideDirs(0, false), walls: [], others: ring });
  const nears = hits.filter((h) => h.kind === "near");
  assert.equal(nears.length, 4);
  assert.ok(!nears.some((h) => h.id === "d4"), "the farthest diagonal drops out");
  for (let i = 1; i < nears.length; i++) assert.ok(nears[i].gap >= nears[i - 1].gap);
  // a table straight in front: measured by the front side, no closest-points copy
  const front = { id: "t", poly: box(300, 300, 80, 40) };
  const h2 = floorClearances({ poly, dirs: sideDirs(0, false), walls: [], others: [front, ring[0]] });
  assert.deepEqual(h2.filter((h) => h.id === "t").map((h) => h.kind), ["item"]);
  assert.deepEqual(h2.filter((h) => h.kind === "near").map((h) => h.id), ["d0"]);
});

test("floorClearances: no near line through a wall; the same room still measures; the cap takes the next visible piece", () => {
  const chair = box(300, 50, 80, 80); // x 260..340, z 10..90; WALL's solid is z -5..5
  const nextRoom = { id: "next", poly: box(450, -60, 40, 40) }; // diagonal, behind the wall, ~103 away
  const sameRoom = { id: "same", poly: box(450, 140, 40, 40) }; // diagonal, in front, ~95 away
  const hits = floorClearances({ poly: chair, dirs: sideDirs(0, false), walls: [WALL], others: [nextRoom, sameRoom] });
  assert.deepEqual(hits.filter((h) => h.kind === "near").map((h) => h.id), ["same"]);
  // without the wall the piece next door would be measured
  assert.ok(floorClearances({ poly: chair, dirs: sideDirs(0, false), walls: [], others: [nextRoom] }).some((h) => h.id === "next"));
  // the cap: two pieces behind the wall are nearer, the four nearest VISIBLE ones still fill it
  const small = box(300, 50, 60, 60); // x 270..330, z 20..80
  const behind = [{ id: "b1", poly: box(300, -40, 40, 40) }, { id: "b2", poly: box(200, -60, 30, 30) }];
  const front = [200, 400, 150, 450, 100].map((x) => ({ id: "f" + x, poly: box(x, 150, 30, 30) }));
  const capped = floorClearances({ poly: small, dirs: sideDirs(0, false), walls: [WALL], others: [...behind, ...front] });
  assert.deepEqual(capped.filter((h) => h.kind === "near").map((h) => h.id).sort(), ["f150", "f200", "f400", "f450"]);
});

test("floorClearances: flush to a wall, a neighbour along the same face is measured; a piece behind a wall is never a side's hit", () => {
  const flush = box(100, 45, 80, 80); // z 5..85: its back on the wall face z = 5
  const beside = { id: "beside", poly: box(250, 25, 40, 40) }; // z 5..45, also flush
  // no directions: only the closest-points path, its line runs along the face
  const n = floorClearances({ poly: flush, dirs: [], walls: [WALL], others: [beside] });
  assert.deepEqual(n.map((h) => [h.kind, h.id]), [["near", "beside"]]);
  near(n[0].gap, 230 - 140);
  // straight behind the wall, in the back sweep band: the wall is what is met
  const chair = box(300, 50, 80, 80);
  const hidden = { id: "hidden", poly: box(300, -60, 80, 40) };
  const h = floorClearances({ poly: chair, dirs: sideDirs(0, false), walls: [WALL], others: [hidden] });
  const back = h.find((x) => x.dir === "back");
  assert.equal(back.kind, "wall"); near(back.gap, 5);
  assert.ok(!h.some((x) => x.id === "hidden"), "nor a near line through the wall");
});

test("labelSpots: midpoints, but a label that lands on another slides along its own line", () => {
  const id = (p) => ({ x: p.x, y: p.z });
  const a = { from: { x: 0, z: 0 }, to: { x: 100, z: 100 } }, b = { from: { x: 100, z: 0 }, to: { x: 0, z: 100 } };
  const [pa, pb] = labelSpots([a, b], id, 18);
  assert.deepEqual(pa, { x: 50, z: 50 });
  assert.ok(Math.hypot(pb.x - 50, pb.z - 50) >= 18, "moved off the crossing");
  near(pb.x + pb.z, 100, 1e-9); // still on its own line
  const apart = labelSpots([a, { from: { x: 300, z: 0 }, to: { x: 300, z: 100 } }], id, 18);
  assert.deepEqual(apart[1], { x: 300, z: 50 });
});

test("measureSides: rugs, lamps and the target filter stay out of the near lines", () => {
  room();
  const chair = { id: 1, type: "crate", x: 300, z: 200, w: 60, d: 60, h: 80, rot: 0 };
  const side = { id: 2, type: "crate", x: 380, z: 280, w: 30, d: 30, h: 50, rot: 0 };
  const coffee = { id: 3, type: "crate", x: 230, z: 290, w: 40, d: 40, h: 45, rot: 0 };
  S.items = [chair, side, coffee,
    { id: 4, type: "rug", x: 400, z: 300, w: 60, d: 60, h: 1, rot: 0 },
    { id: 5, type: "floorLamp", x: 220, z: 120, w: 30, d: 30, h: 160, rot: 0 }];
  const ids = (o) => measureSides(chair, o).filter((h) => h.kind === "near").map((h) => h.id).sort();
  assert.deepEqual(ids(), [2, 3]);
  assert.deepEqual(ids({ target: "wall" }), []);
  assert.deepEqual(ids({ nearCount: 1 }), [3]); // coffee 45 is nearer than side 49
});

test("verticalClearances: up to the ceiling, a pendant over it, not a shelf beside it; down for a piece in the air", () => {
  const poly = box(300, 200, 80, 80); // x 260..340
  const span = { lo: 0, hi: 90 };
  const up = (others, extra) => verticalClearances({ poly, span, others, ceiling: 260, ...extra });
  const nothing = up([]);
  assert.equal(nothing.length, 1);
  assert.equal(nothing[0].dir, "up"); assert.equal(nothing[0].kind, "ceiling"); near(nothing[0].gap, 170);
  near(nothing[0].from.y, 90); near(nothing[0].to.y, 260); near(nothing[0].from.x, 300); near(nothing[0].from.z, 200);
  const pendant = { id: "p", poly: box(310, 200, 30, 30), span: { lo: 180, hi: 230 } };
  const hood = { id: "h", poly: box(300, 200, 60, 40), span: { lo: 200, hi: 240 } };
  const pen = up([hood, pendant]);
  assert.deepEqual(pen.map((h) => [h.dir, h.kind, h.id]), [["up", "item", "p"]]);
  near(pen[0].gap, 90);
  const shelf = { id: "s", poly: box(400, 200, 40, 30), span: { lo: 150, hi: 155 } }; // beside, x 380..420
  assert.equal(up([shelf])[0].kind, "ceiling");
  const unmeasured = { id: "u", poly: box(300, 200, 30, 30), span: null };
  assert.equal(up([unmeasured])[0].kind, "ceiling");
  // a wall cabinet in the air over a counter, measured down
  const cab = { lo: 150, hi: 220 };
  const counter = { id: "c", poly: box(300, 200, 100, 60), span: { lo: 0, hi: 90 } };
  const d = verticalClearances({ poly, span: cab, others: [counter], ceiling: 260, down: true });
  assert.deepEqual(d.map((h) => [h.dir, h.kind]), [["up", "ceiling"], ["down", "item"]]);
  near(d[1].gap, 60); near(d[1].from.y, 150); near(d[1].to.y, 90);
  const free = verticalClearances({ poly, span: cab, others: [], ceiling: 260, down: true });
  assert.equal(free[1].kind, "floor"); near(free[1].gap, 150);
});

test("measureVertical: lamps count over a piece, its own riders do not, target wall keeps only the ceiling", () => {
  room();
  const table = { id: 1, type: "crate", x: 300, z: 200, w: 100, d: 60, h: 75, rot: 0 };
  const pendant = { id: 2, type: "pendant", x: 300, z: 200, w: 40, d: 40, h: 40, rot: 0 };
  const vase = { id: 3, type: "crate", x: 290, z: 200, w: 10, d: 10, h: 30, rot: 0, on: 1 };
  seedVSpan(vSpanKeyOf(table), { lo: 0, hi: 75 });
  seedVSpan(vSpanKeyOf(pendant), { lo: 180, hi: 220 });
  seedVSpan(vSpanKeyOf(vase), { lo: 75, hi: 105 });
  S.items = [table, pendant, vase];
  const up = measureVertical(table, { ceiling: 270 });
  assert.deepEqual(up.map((h) => [h.dir, h.kind, h.id]), [["up", "item", 2]]);
  near(up[0].gap, 105);
  const w = measureVertical(table, { ceiling: 270, target: "wall" });
  assert.deepEqual(w.map((h) => [h.dir, h.kind]), [["up", "ceiling"]]);
  near(w[0].gap, 195);
});

function room() {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  S.walls = [0, 1, 2, 3].map((i) => ({ id: i + 1, a: i, b: (i + 1) % 4, thickness: 10, height: 270 }));
}
const wallSides = (hits) => hits.filter((h) => h.kind === "wall").map((h) => h.dir).sort();

test("measureSides: a table on a rug in a room reports four walls", () => {
  room();
  const table = { id: 1, type: "crate", x: 300, z: 200, w: 100, d: 60, h: 75, rot: 0 };
  S.items = [table, { id: 2, type: "rug", x: 300, z: 200, w: 240, d: 170, h: 1, rot: 0 }];
  assert.deepEqual(wallSides(measureSides(table)), ["back", "front", "left", "right"]);
});

test("measureSides: art above a sofa and a pendant over it are not in the way", () => {
  room();
  const sofa = { id: 1, type: "crate", x: 300, z: 100, w: 200, d: 90, h: 85, rot: 0 };
  const art = { id: 2, type: "art", x: 300, z: 8, w: 100, d: 5, h: 60, rot: 0 };
  seedVSpan(vSpanKeyOf(art), { lo: 150, hi: 210 });
  S.items = [sofa, art, { id: 3, type: "pendant", x: 300, z: 100, w: 40, d: 40, h: 40, rot: 0 }];
  const hits = measureSides(sofa);
  assert.deepEqual(wallSides(hits), ["back", "front", "left", "right"]);
  near(hits.find((h) => h.dir === "back").gap, 100 - 45 - 5);
});

test("measureSides: a same-height piece it overlaps leaves the other sides reporting", () => {
  room();
  const a = { id: 1, type: "crate", x: 300, z: 200, w: 100, d: 60, h: 80, rot: 0 };
  S.items = [a, { id: 2, type: "crate", x: 360, z: 200, w: 60, d: 60, h: 80, rot: 0 }];
  const sides = wallSides(measureSides(a));
  ["back", "front", "left"].forEach((k) => assert.ok(sides.includes(k), k));
});

test("measureSides honours the plan's measure target (walls / objects / chosen walls)", () => {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 0, z: 400 }];
  S.walls = [{ id: 1, a: 0, b: 1, thickness: 10, height: 270 }, { id: 2, a: 0, b: 2, thickness: 10, height: 270 }];
  const it = { id: 1, type: "crate", x: 300, z: 100, w: 200, d: 90, h: 80, rot: 0 };
  const chair = { id: 2, type: "crate", x: 300, z: 250, w: 50, d: 50, h: 80, rot: 0 };
  S.items = [it, chair];
  const kinds = (o) => measureSides(it, o).map((h) => h.kind + ":" + h.id).sort();
  assert.ok(kinds().includes("item:2") && kinds().includes("wall:1") && kinds().includes("wall:2"));
  assert.deepEqual(kinds({ target: "wall" }), ["wall:1", "wall:2"]);
  assert.ok(kinds({ target: "object" }).every((k) => k.startsWith("item:")));
  assert.deepEqual(kinds({ target: "manual", wallIds: [2] }), ["wall:2"]);
});
