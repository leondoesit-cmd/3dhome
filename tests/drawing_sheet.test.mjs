import test from "node:test";
import assert from "node:assert/strict";
import { constructionSheetSVG, sheetBounds, outlineSegments } from "../js/drawing_sheet.js";
import { symbolPrims, localToWorld, SYMBOL_TYPES } from "../js/plan_symbols.js";
import { planDimensionChains } from "../js/planner_drawing.js";
import { formatLength } from "../js/planning_units.js";

const FT = 30.48, T = 15;
const ft = (cm) => formatLength(cm, "ft", {});

/* The reference builder plan: 55'-0" wide, with a porch recess in the front
   wall between 32' and 40' — the bottom string must read 32'-0" | 8'-0" |
   15'-0" over an overall 55'-0". Walls are T thick, inward of the outline. */
function house() {
  const P = [[0, 0], [55, 0], [55, 34], [40, 34], [40, 28], [32, 28], [32, 34], [0, 34]].map(([x, z]) => ({ x: x * FT, z: z * FT }));
  // mitred like real wall outlines: each inner corner is the vertex moved T
  // along both adjacent edges' inward normals (the outline turns clockwise
  // on screen, so the inward normal of edge a→b is (-uz, ux))
  const inward = (a, b) => { const L = Math.hypot(b.x - a.x, b.z - a.z); return { x: -(b.z - a.z) / L, z: (b.x - a.x) / L }; };
  const Q = P.map((v, i) => {
    const n1 = inward(P[(i - 1 + P.length) % P.length], v), n2 = inward(v, P[(i + 1) % P.length]);
    // right-angle corners: the inner corner is v + T*(n1 + n2)
    return { x: v.x + T * (n1.x + n2.x), z: v.z + T * (n1.z + n2.z) };
  });
  const walls = P.map((a, i) => [a, P[(i + 1) % P.length], Q[(i + 1) % P.length], Q[i]]);
  return {
    wallPolys: walls,
    openings: [{ type: "window", poly: [{ x: 300, z: 0 }, { x: 420, z: 0 }, { x: 420, z: T }, { x: 300, z: T }] }],
    swings: [[{ x: 600, z: T }, { x: 690, z: T }, { x: 600, z: T + 90 }]],
    items: [{ type: "stairs", x: 800, z: 600, w: 100, d: 260, rot: 0, steps: 12 }, { type: "toilet", x: 200, z: 300, w: 40, d: 65, rot: 90 }],
    rooms: [{ name: "Living <main>", cx: 400, cz: 400, width: (21 * 12 + 4) * 2.54, depth: (14 * 12 + 5) * 2.54 }],
    area: { text: "Living Area - First Floor: 1415 sq ft" },
  };
}

test("exterior chain dimensions read like the builder's sheet", () => {
  const snap = house();
  const svg = constructionSheetSVG(snap, { cmPerMm: 5, fmt: ft, t: (k) => (k === "plan_stairs_up" ? "UP" : k) });
  for (const s of [`32'-0"`, `8'-0"`, `15'-0"`, `55'-0"`, `34'-0"`]) assert.ok(svg.includes(esc(s)), s);
  // the bottom chain adds up to its overall
  const bottom = planDimensionChains(outlineSegments(snap.wallPolys)).find((c) => c.side === "bottom");
  const at = bottom.stations.map((s) => Math.round(s.at / FT));
  assert.deepEqual(at, [0, 32, 40, 55]);
});

test("the sheet carries rooms, openings, fixtures and the area line", () => {
  const svg = constructionSheetSVG(house(), { cmPerMm: 5, fmt: ft, t: (k) => (k === "plan_stairs_up" ? "UP" : k) });
  assert.ok(svg.includes("LIVING &lt;MAIN&gt;"), "name upper-cased and escaped");
  assert.ok(svg.includes(esc(`21'-4" x 14'-5"`)), "room size");
  assert.match(svg, /<path d="M[^"]+Z" fill="none"/, "door swing");
  assert.ok(/>UP</.test(svg), "stairs are labelled UP");
  assert.ok(svg.includes("Living Area - First Floor: 1415 sq ft"));
  assert.ok(svg.includes('id="north"'));
  assert.ok(svg.includes('mask="url(#sheet-openings)"'));
});

test("the sheet is the right way up: larger z is lower on the page", () => {
  const snap = house(), b = sheetBounds(snap, 5);
  const svg = constructionSheetSVG(snap, { cmPerMm: 5, fmt: ft, bounds: b });
  const first = /<g id="walls"[^>]*><polygon points="([^"]+)"/.exec(svg)[1].split(" ").map((p) => p.split(",").map(Number));
  // the first wall runs along z = 0 (top of the house), so it sits near the top of the drawing
  assert.ok(first[0][1] < (b.maxz - b.minz) / 2);
  assert.equal(first[0][1], Math.round((0 - b.minz) * 100) / 100);
});

test("fixture symbols are placed and turned in the item's frame", () => {
  assert.ok(SYMBOL_TYPES.includes("toilet") && SYMBOL_TYPES.includes("stairs"));
  const p = localToWorld({ x: 100, z: 50, rot: 90 }, 10, 0);
  assert.ok(Math.abs(p.x - 100) < 1e-9 && Math.abs(p.z - 60) < 1e-9);
  const stairs = symbolPrims("stairs", 100, 260, { steps: 12 });
  assert.equal(stairs.filter((q) => q.k === "line" && q.x1 === -50 && q.x2 === 50).length, 11);
  assert.ok(stairs.some((q) => q.upLabel));
  assert.equal(symbolPrims("mysteryPiece", 50, 50)[0].k, "rect");
});

function esc(s) { return s.replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }

test("stair symbols follow the flight's plan: straight, L with a landing, curved fan", async () => {
  const { symbolPrims, stairShape } = await import("../js/plan_symbols.js");
  assert.equal(stairShape({}), "straight");
  assert.equal(stairShape({ configuration: { shape: "L" } }), "L");
  assert.equal(stairShape({ shape: "curved", configuration: { shape: "L" } }), "curved");
  const L = symbolPrims("stairs", 200, 300, { steps: 14, shape: "L" });
  assert.ok(L.some((p) => p.k === "rect" && p.w === 90 && p.d === 90), "quarter landing");
  const C = symbolPrims("stairs", 250, 250, { steps: 12, shape: "curved" });
  assert.equal(C.filter((p) => p.k === "line" && p.weight !== "heavy").length, 13, "13 radial tread lines");
  for (const set of [L, C, symbolPrims("stairs", 100, 250, { steps: 10 })]) assert.ok(set.some((p) => p.upLabel));
});

/* ---- the sheet drawn to a regional drafting standard ---- */
import { draftingStandard, draftingStandardIds } from "../js/drafting_standards.js";
import { scheduleRows, openingScheduleSVG } from "../js/drawing_sheet/schedule.js";
import { wrapPlanSVG } from "../js/sheet_print.js";

// a 10 m x 6 m box with one window (120/140, sill 90) and one door (90/210)
function box() {
  const W = 1000, D = 600, T2 = 25;
  const P = [[0, 0], [W, 0], [W, D], [0, D]].map(([x, z]) => ({ x, z }));
  const Q = [[T2, T2], [W - T2, T2], [W - T2, D - T2], [T2, D - T2]].map(([x, z]) => ({ x, z }));
  return {
    wallPolys: P.map((a, i) => [a, P[(i + 1) % 4], Q[(i + 1) % 4], Q[i]]),
    openings: [
      { type: "window", width: 120, height: 140, sill: 90, poly: [{ x: 300, z: 0 }, { x: 420, z: 0 }, { x: 420, z: T2 }, { x: 300, z: T2 }] },
      { type: "door", width: 90, height: 210, sill: 0, poly: [{ x: 600, z: 0 }, { x: 690, z: 0 }, { x: 690, z: T2 }, { x: 600, z: T2 }] },
    ],
    swings: [], items: [],
    rooms: [{ name: "Living", cx: 500, cz: 300, width: 950, depth: 550, area: 52.25 }],
    area: { text: "area" }, level: 0, floorNumber: 1,
  };
}
const texts = (svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
const sheet = (id, lang) => constructionSheetSVG(box(), { cmPerMm: 5, standard: draftingStandard(id), lang: lang || "en" });

test("each standard writes its own dimension strings, opening labels and room label", () => {
  const want = {
    il: { dims: ["1000", "600"], labels: ["120/140  sill 90", "90/210"], room: ["52.25 m²", "±0.00"] },
    uk: { dims: ["10000", "6000"], labels: ["1200 × 1400", "900 × 2100"], room: ["52.25 m²", "FFL 0.000"] },
    de: { dims: ["10,00", "6,00"], labels: ["1,20", "1,40", "BRH 90", "90", "2,10"], room: ["52,25 m²", "±0,00 OKFF"] },
    iso: { dims: ["1000", "600"], labels: ["120 × 140", "90 × 210"], room: ["52.25 m²", "±0.000"] },
    us: { dims: ["32&apos;-9 1/2&quot;", "19&apos;-8&quot;"], labels: ["A", "1"], room: ["101", "FIN. FLR. 0&apos;-0&quot;"] },
  };
  for (const id of draftingStandardIds()) {
    const svg = sheet(id), all = texts(svg);
    for (const s of want[id].dims.concat(want[id].labels, want[id].room)) assert.ok(all.includes(s), `${id}: ${s} in ${all.join(" | ")}`);
    assert.ok(svg.includes('id="opening-labels"'), id);
    assert.ok(!all.some((s) => / x /.test(s)), `${id} drops the width x depth line`);
  }
  // US tags: a circle for the door, a hexagon for the window
  const us = sheet("us");
  assert.equal((us.match(/class="opening-tag"><circle/g) || []).length, 1);
  assert.equal((us.match(/class="opening-tag"><polygon/g) || []).length, 1);
  // Hebrew sheet: the sill word and the area unit in Hebrew, isolated
  const il = texts(sheet("il", "he"));
  assert.ok(il.includes("120/140  ⁧אדן 90⁩"), il.join(" | "));
  assert.ok(il.includes("⁧52.25 מ״ר⁩"));
});

test("without a standard the sheet is the universal one", () => {
  const svg = constructionSheetSVG(box(), { cmPerMm: 5 });
  assert.ok(!svg.includes("opening-labels") && !svg.includes("level-mark") && !svg.includes('id="level"'));
  assert.ok(texts(svg).includes("950 x 550"));
  assert.equal(svg, constructionSheetSVG(box(), { cmPerMm: 5, standard: null }));
});

test("the US schedule lists doors by number and windows by letter", () => {
  const us = draftingStandard("us");
  const rows = scheduleRows(box().openings, us);
  assert.deepEqual(rows.map((r) => [r.tag, r.width, r.height, r.sill]), [["1", `2'-11 1/2"`, `6'-10 1/2"`, ""], ["A", `3'-11"`, `4'-7"`, `2'-11 1/2"`]]);
  const table = openingScheduleSVG(box().openings, us, { door: "DOOR SCHEDULE" });
  assert.ok(table.w > 0 && table.h > 0 && table.svg.includes("DOOR SCHEDULE") && table.svg.includes("WINDOW SCHEDULE"));
  assert.equal(openingScheduleSVG([], us), null);
  // set beside the plan on the sheet, in paper millimetres scaled to the drawing
  const page = wrapPlanSVG("<line/>", { w: 1100, d: 700 }, { standard: us, aside: table, name: "Villa" });
  assert.match(page, /<g class="sheet-aside" transform="translate\([\d.]+ [\d.]+\) scale\([\d.]+\)"><g class="opening-schedule">/);
  assert.match(page, /class="title-strip"/);
  // the Israeli and German pages keep the bottom block
  for (const id of ["il", "de", "uk", "iso"]) assert.doesNotMatch(wrapPlanSVG("<line/>", { w: 1100, d: 700 }, { standard: draftingStandard(id) }), /title-strip/, id);
});
