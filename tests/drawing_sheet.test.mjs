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
