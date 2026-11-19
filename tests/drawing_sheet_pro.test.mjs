import test from "node:test";
import assert from "node:assert/strict";
import { draftingStandard, dimensionFormatter } from "../js/drafting_standards.js";
import { sheetBounds } from "../js/drawing_sheet.js";
import { proPlanParts, isFixture } from "../js/drawing_sheet/pro_plan.js";
import { textSizes, PENS } from "../js/drawing_sheet/pens.js";
import { bandKind, hatchFor, wallsSVG } from "../js/drawing_sheet/hatches.js";
import { placeLabels, boxOf, boxesOverlap, pointInPoly } from "../js/drawing_sheet/placement.js";
import { exteriorDimGeometry, interiorDimGeometry } from "../js/drawing_sheet/dims.js";
import { sheetFrameSVG, titleFields, gridZones, scaleBarSpec, legendRows } from "../js/drawing_sheet/sheet_frame.js";
import { editSheetInfo } from "../js/drawing_sheet/sheet_frame.js";
import { wrapPlanSVG, sheetLayout } from "../js/sheet_print.js";

const std = (id) => draftingStandard(id);
const rect = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

/* Two rooms side by side (5 m + 4 m, 6 m deep) behind 25 cm exterior walls
   and a 10 cm block partition; a window and the front door on the top
   facade, a door in the partition; a WC, a basin, a bath and a kitchen run
   (fixtures) and a sofa (loose furniture). */
function plan() {
  const T = 25, P = 10, W = 950, D = 600;
  const ext = [rect(0, 0, W, T), rect(W - T, 0, W, D), rect(0, D - T, W, D), rect(0, 0, T, D)];
  const part = rect(520, T, 520 + P, D - T);
  const walls = ext.map((poly) => ({ outline: poly, exterior: true, bands: [
    { poly, material: "concrete-block", role: "core", structural: true },
  ] })).concat([{ outline: part, exterior: false, bands: [{ poly: part, material: "concrete-block", role: "core", structural: false }] }]);
  const items = [
    { id: "wc", type: "toilet", x: 600, z: 80, w: 40, d: 65, rot: 0 },
    { id: "sink", type: "sink", x: 700, z: 60, w: 60, d: 45, rot: 0 },
    { id: "bath", type: "bathtub", x: 850, z: 120, w: 70, d: 170, rot: 0 },
    { id: "k1", type: "base", x: 120, z: 545, w: 180, d: 60, rot: 0 },
    { id: "sofa", type: "sofa", x: 260, z: 300, w: 200, d: 90, rot: 0 },
  ];
  return {
    wallPolys: walls.map((w) => w.outline), walls,
    openings: [
      { id: "w1", type: "window", width: 120, height: 140, sill: 90, poly: [{ x: 200, z: 0 }, { x: 320, z: 0 }, { x: 320, z: T }, { x: 200, z: T }] },
      { id: "d1", type: "door", width: 90, height: 210, sill: 0, poly: [{ x: 400, z: 0 }, { x: 490, z: 0 }, { x: 490, z: T }, { x: 400, z: T }] },
      { id: "d2", type: "door", width: 80, height: 205, sill: 0, poly: [{ x: 520, z: 300 }, { x: 520, z: 380 }, { x: 530, z: 380 }, { x: 530, z: 300 }] },
    ],
    swings: [[{ x: 400, z: T }, { x: 490, z: T }, { x: 490, z: T + 90 }]],
    items,
    rooms: [
      { key: "r1", name: "Living", cx: 272, cz: 300, area: 29.5, points: rect(T, T, 520, D - T), clear: { x0: T, x1: 520, z0: T, z1: D - T } },
      { key: "r2", name: "Bathroom", cx: 737, cz: 300, area: 21.3, points: rect(530, T, W - T, D - T), clear: { x0: 530, x1: W - T, z0: T, z1: D - T } },
    ],
    area: { text: "Living area 50.8 m²" }, level: 0, floorNumber: 1,
  };
}
const parts = (id, extra) => {
  const snap = plan(), b = sheetBounds(snap, 5);
  return proPlanParts(snap, Object.assign({ cmPerMm: 5, bounds: b, standard: std(id), lang: "en" }, extra || {}));
};

test("labels are placed clear of each other, walls, swings and fixtures", () => {
  for (const id of ["il", "us", "de"]) {
    const p = parts(id);
    assert.ok(p.labels.length >= 4, id);
    p.placed.forEach((a, i) => {
      assert.ok(a.clear, `${id}: ${p.labels[i].id} found a clear spot`);
      p.placed.forEach((b, j) => { if (j > i) assert.ok(!boxesOverlap(boxOf(a.x, a.y, a.w, a.h), boxOf(b.x, b.y, b.w, b.h)), `${id}: ${p.labels[i].id} / ${p.labels[j].id}`); });
    });
    // room labels stay inside their room
    p.labels.forEach((l, i) => {
      if (l.kind !== "room") return;
      const q = p.placed[i], box = boxOf(q.x, q.y, q.w, q.h);
      assert.ok([[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]].every(([x, y]) => pointInPoly({ x, y }, l.within)), `${id}: ${l.id} inside its room`);
    });
  }
});

test("the placer moves a label off an obstacle and draws a leader when it went far", () => {
  const obstacles = [{ x0: -10, y0: -10, x1: 10, y1: 10 }];
  const [a, b] = placeLabels([{ id: "a", x: 0, y: 0, w: 8, h: 4, maxShift: 40 }, { id: "b", x: 0, y: 0, w: 8, h: 4, maxShift: 40 }], obstacles);
  for (const p of [a, b]) assert.ok(!boxesOverlap(boxOf(p.x, p.y, p.w, p.h), obstacles[0]) && p.moved && p.leader && p.clear);
  assert.ok(!boxesOverlap(boxOf(a.x, a.y, a.w, a.h), boxOf(b.x, b.y, b.w, b.h)));
  const free = placeLabels([{ id: "c", x: 50, y: 50, w: 8, h: 4 }], obstacles)[0];
  assert.ok(!free.moved && !free.leader);
});

test("lettering sizes in paper mm per scale, black ink and three pens", () => {
  assert.deepEqual([textSizes(50).room, textSizes(50).area, textSizes(50).dim, textSizes(50).tag], [3.5, 2.5, 2.5, 2.0]);
  assert.deepEqual(textSizes(100), textSizes(50));
  assert.ok(textSizes(200).room < 3.5 && textSizes(200).dim >= 1.8);
  assert.ok(PENS.cutOuter > PENS.cutInner && PENS.cutInner > PENS.medium && PENS.medium > PENS.fine);
  const svg = parts("il").svg;
  // at 1:50 (5 cm per paper mm) a 3.5 mm room name is 17.5 model units, a 2.5 mm figure 12.5
  assert.match(svg, /font-size="17\.5" font-weight="700"[^>]*>LIVING</);
  assert.match(svg, /<g class="dim-text"[^>]*>(?:<text[^>]*font-size="12\.5")/);
  assert.ok(!/fill="#(?:[5-9a-f][0-9a-f]{5})"[^>]*>[^<]+<\/text>/.test(svg.replace(/fill="#fff"/g, "")), "no grey text");
  assert.ok(new Set([...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => m[1])).size >= 3);
});

test("hatch per wall layer and standard", () => {
  assert.equal(bandKind({ material: "reinforced-concrete", structural: true }, { exterior: true }), "concrete");
  assert.equal(bandKind({ material: "concrete-block", structural: true }, { exterior: true }), "masonry");
  assert.equal(bandKind({ material: "concrete-block", structural: false }, { exterior: false }), "partition");
  assert.equal(bandKind({ material: "rigid-insulation", role: "insulation" }, {}), "insulation");
  assert.equal(bandKind({ material: "plaster", role: "finish-interior" }, {}), "finish");
  assert.equal(bandKind({ material: "steel-stud-air-cavity", role: "core" }, {}), "finish");
  assert.equal(hatchFor("concrete", std("il")), "solid");
  assert.equal(hatchFor("concrete", std("de")), "cross");
  assert.equal(hatchFor("masonry", std("uk")), "diag");
  assert.equal(hatchFor("partition", std("il")), "grey");
  assert.equal(hatchFor("partition", std("us")), "none");
  assert.equal(hatchFor("insulation", std("iso")), "batt");
  const mm = (v) => v * 5, pts = (poly) => poly.map((p) => p.x + "," + p.z).join(" ");
  const w = wallsSVG(plan().walls, std("il"), { mm, pts });
  assert.ok(w.kinds.has("masonry") && w.kinds.has("partition"));
  assert.match(w.defs, /id="h-diag"/);
  assert.match(w.svg, /fill="url\(#h-diag\)"/);
  assert.match(w.svg, /fill="#c8c8c8"/);
  // the exterior outline on the heavy pen, the partition one lighter
  assert.match(w.svg, new RegExp(`stroke-width="${PENS.cutOuter * 5}"`));
  assert.match(w.svg, new RegExp(`stroke-width="${PENS.cutInner * 5}"`));
});

test("fixtures always, loose furniture only on request", () => {
  assert.ok(isFixture({ type: "toilet" }) && isFixture({ type: "base" }) && !isFixture({ type: "sofa" }));
  const count = (svg) => (/<g id="fixtures"[^>]*>([\s\S]*?)<\/g>/.exec(svg)[1].match(/<(?:polygon|line|circle|polyline)/g) || []).length;
  assert.ok(count(parts("il", { furniture: true }).svg) > count(parts("il").svg));
});

test("dimensions: an openings tier on the facade, room sizes inside, openings located", () => {
  const p = plan(), fmt = dimensionFormatter(std("il"));
  const ext = exteriorDimGeometry(p.wallPolys, p.openings, { off: [35, 65, 95], gap: 7, over: 6, textOff: 8, textH: 12.5, textW: (len) => fmt(len).length * 7 });
  const top = ext.texts.filter((t) => t.along === "x" && t.dir < 0).map((t) => Math.round(t.len));
  // window 200–320 and door 400–490 on the top facade: 200 · 120 · 80 · 90 · 460
  assert.deepEqual(top.slice(0, 5), [200, 120, 80, 90, 460]);
  assert.ok(top.includes(950));
  const inner = interiorDimGeometry(p.rooms, p.openings, { inset: 30, openInset: 17, over: 4, textOff: 8, minRoom: 120, minLocate: 20, textH: 12.5, textW: () => 20 });
  const lens = inner.texts.map((t) => Math.round(t.len));
  assert.ok(lens.includes(495) && lens.includes(550) && lens.includes(395), lens.join(","));
  // the partition door 300–380 located off the nearer corner (275 from the top, 170 from the bottom)
  assert.ok(lens.includes(195) || lens.includes(275), lens.join(","));
  // a room string whose figure would sit on a fixture moves
  const blocked = (x0, z0, x1, z1) => z0 < 100;
  const moved = interiorDimGeometry([p.rooms[1]], [], { inset: 30, over: 4, textOff: 8, minRoom: 120, textH: 12.5, textW: () => 20, blocked });
  assert.ok(moved.lines[0].a.z > 100);
});

test("title block fields, revisions, the Israeli stamp box and grid references", () => {
  const P = { W: 594, H: 420, m: 10, std: std("il"), L: { project: "PROJECT", client: "CLIENT", designer: "DESIGNER", title: "DRAWING", scale: "SCALE", date: "DATE", sheet: "SHEET", rev: "REV", rev_desc: "DESCRIPTION", approval: "APPROVALS", legend: "LEGEND", legend_masonry: "Masonry" },
    info: { project: "Villa", address: "1 Main St", client: "A. Client", designer: "B. Architect", title: "Ground floor plan", revisions: [{ rev: "1", date: "2026-11-01", note: "Permit set" }] },
    kinds: new Set(["masonry"]), scaleLabel: "1:50", paper: "A2", denom: 50, date: "2026-11-14", sheet: "1", rtl: false, northDeg: 0, bandMm: 50, stripMm: 0, grid: true };
  const svg = sheetFrameSVG(P);
  for (const s of ["Villa", "1 Main St", "A. Client", "B. Architect", "Ground floor plan", "1:50", "2026-11-14", "Permit set", "APPROVALS", "LEGEND", "Masonry"])
    assert.ok(svg.includes(">" + s + "<"), s);
  assert.match(svg, /class="stamp-box"/);
  assert.ok(!sheetFrameSVG(Object.assign({}, P, { std: std("uk") })).includes("stamp-box"));
  assert.deepEqual(titleFields(P.info, P).map((f) => f.key), ["project", "address", "client", "designer", "title", "scale", "date", "sheet"]);
  const z = gridZones(594, 420, 10);
  assert.equal(z.cols.length, 11);
  assert.ok(!z.rows.includes("I") && !z.rows.includes("O"));
  assert.ok(svg.includes(">A<") && svg.includes(">11<"));
  // the US strip down the right edge carries the same fields
  const us = sheetFrameSVG(Object.assign({}, P, { std: std("us"), bandMm: 0, stripMm: 80 }));
  assert.match(us, /class="title-strip"/);
  assert.ok(us.includes(">Villa<") && us.includes(">Permit set<"));
  assert.ok(legendRows(new Set(["masonry"]), std("us"), {}).some((r) => r.sym === "door-tag"));
  // the whole sheet: the frame over the plan, scale and paper recorded
  const page = wrapPlanSVG("<line/>", { w: 1800, d: 1200 }, { standard: std("il"), name: "Villa", info: P.info, kinds: P.kinds });
  assert.match(page, /data-scale="50" data-paper="A\d"/);
  assert.match(page, /class="sheet-frame"/);
});

test("scale bar lengths and the title block's saved fields", () => {
  const m = scaleBarSpec(50, false);
  assert.equal(m.unit, "m");
  assert.ok(m.segMm * m.segs >= 36 && m.segMm * m.segs <= 120);
  const f = scaleBarSpec(48, true);
  assert.equal(f.unit, "ft");
  assert.ok(f.segMm * f.segs >= 36);
  let info = editSheetInfo({}, { field: "client", value: "  Dana  " });
  assert.deepEqual(info, { client: "Dana" });
  info = editSheetInfo(info, { field: "client", value: "" });
  assert.deepEqual(info, {});
  info = editSheetInfo(info, { revision: { note: "Permit set", date: "2026-11-01" } });
  info = editSheetInfo(info, { revision: { note: "Client comments", date: "2026-11-10" } });
  assert.deepEqual(info.revisions.map((r) => r.rev), ["1", "2"]);
  assert.deepEqual(editSheetInfo({}, { field: "nope", value: "x" }), {});
});

test("a room too small for its label shrinks, drops the level, then goes outside with a leader", () => {
  const snap = plan();
  // a 1.4 m x 1.6 m WC whose floor is all fixtures but a sliver
  snap.rooms.push({ key: "wc", name: "Toilet room", cx: 600, cz: 500, area: 2.2, points: rect(530, 420, 670, 575), clear: { x0: 530, x1: 670, z0: 420, z1: 575 } });
  snap.items.push({ id: "wc2", type: "toilet", x: 575, z: 500, w: 40, d: 65, rot: 0 }, { id: "b2", type: "vanity", x: 640, z: 500, w: 55, d: 140, rot: 0 });
  const b = sheetBounds(snap, 5), p = proPlanParts(snap, { cmPerMm: 5, bounds: b, standard: std("il"), lang: "en" });
  const i = p.labels.findIndex((l) => l.id === "room-2");
  const q = p.placed[i];
  assert.ok(q.variant > 0 || q.outside, JSON.stringify(q));
  assert.ok(q.clear, "it found a spot that crosses no fixture");
  if (q.outside) assert.ok(q.leader);
  // the outline of every fixture stays clear of every label
  const boxes = p.placed.map((r) => boxOf(r.x, r.y, r.w, r.h));
  const X = (x) => x - b.minx, Y = (z) => z - b.minz;
  snap.items.filter(isFixture).forEach((it) => {
    const f = { x0: X(it.x - it.w / 2), x1: X(it.x + it.w / 2), y0: Y(it.z - it.d / 2), y1: Y(it.z + it.d / 2) };
    boxes.forEach((bx, k) => assert.ok(!boxesOverlap(bx, f), `${p.labels[k].id} on ${it.id}`));
    // and a room leader ends on free floor, not on a fixture
    if (q.leader) assert.ok(!(q.anchor.x > f.x0 && q.anchor.x < f.x1 && q.anchor.y > f.y0 && q.anchor.y < f.y1), `leader ends on ${it.id}`);
  });
});

test("US tags slide along their wall; a leader is short, square to the wall and crosses no dimension", () => {
  const p = parts("us");
  p.labels.forEach((l, i) => {
    if (l.kind !== "opening") return;
    const q = p.placed[i];
    assert.ok(q.clear, l.id);
    if (!q.leader) return;
    const from = { x: Math.max(q.x - q.w / 2, Math.min(q.anchor.x, q.x + q.w / 2)), y: Math.max(q.y - q.h / 2, Math.min(q.anchor.y, q.y + q.h / 2)) };
    const dx = q.anchor.x - from.x, dy = q.anchor.y - from.y;
    assert.ok(Math.abs(dx) < 0.5 || Math.abs(dy) < 0.5, `${l.id} leader is orthogonal`);
    assert.ok(Math.hypot(dx, dy) <= 5 * 14, `${l.id} leader is short`);
  });
});

test("paper and scale: the reason is recorded, and a sparse sheet takes the standard's finer scale", () => {
  const big = sheetLayout({ w: 1270, d: 1225 }, { standard: std("il") });
  assert.equal(big.denom, 50);
  assert.equal(big.why.code, "smallest-fit");
  assert.equal(big.why.smaller.name, "A3");
  assert.ok(big.why.need.h > big.why.smaller.field.h);
  const page = wrapPlanSVG("<line/>", { w: 1270, d: 1225 }, { standard: std("il"), name: "x" });
  assert.match(page, /data-why="smallest-fit" data-fill="0\.\d\d" data-need="\d+x\d+" data-smaller="A3:\d+x\d+"/);
  // a standard listing its coarse scale first: a small plan at 1:100 fills under 40 %, so 1:50
  const coarseFirst = Object.assign({}, std("iso"), { scales: [100, 50] });
  const small = sheetLayout({ w: 600, d: 400 }, { standard: coarseFirst });
  assert.equal(small.denom, 50);
  assert.equal(small.why.code, "finer");
  assert.equal(sheetLayout({ w: 600, d: 400 }, { standard: coarseFirst, scale: 100 }).why.code, "pinned");
});

test("a Hebrew sheet mirrors its title block, revisions and legend, mixed names isolated", () => {
  const P = { W: 594, H: 420, m: 10, std: std("il"), L: { project: "פרויקט", client: "מזמין", designer: "מתכנן", title: "שם השרטוט", scale: "קנה מידה", date: "תאריך", sheet: "גיליון", rev: "מהד׳", rev_desc: "תיאור", approval: "אישורים", legend: "מקרא", legend_masonry: "בנייה" },
    info: { project: "וילה Rosen", client: "דנה Levi", revisions: [{ rev: "1", date: "2026-11-01", note: "הגשה (Permit)" }] },
    kinds: new Set(["masonry"]), scaleLabel: "1:50", paper: "A2", denom: 50, date: "2026-11-14", sheet: "1", rtl: true, northDeg: 0, bandMm: 50, stripMm: 0, grid: false };
  const svg = sheetFrameSVG(P);
  for (const s of ["וילה Rosen", "דנה Levi", "הגשה (Permit)"]) assert.match(svg, new RegExp(`direction="rtl"[^>]*>\u2068${s.replace(/[()]/g, (c) => "\\" + c)}\u2069<`), s);
  assert.match(svg, /direction="rtl"[^>]*>מקרא</);
  assert.match(svg, /direction="rtl"[^>]*>בנייה</);
  // the REV column sits at the right edge of the revision table in Hebrew
  const revX = Number(/<text[^>]*\sx="([\d.]+)"[^>]*direction="rtl"[^>]*>⁨?מהד׳⁩?</.exec(svg)[1]);
  const descX = Number(/<text[^>]*\sx="([\d.]+)"[^>]*direction="rtl"[^>]*>⁨?תיאור⁩?</.exec(svg)[1]);
  assert.ok(revX > descX);
});
