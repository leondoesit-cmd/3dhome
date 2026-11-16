/* The working-drawing sheet inks walls by the ink rule (WALL_JUNCTIONS_PLAN.md
   Step C): no diagonal in the cut line of a same-type room, the square seam
   where concrete meets block — and the dimension chains read the same numbers
   whatever the corners are built as (Invariant M). */
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { sheetSnapshot } from "../js/drawing_snapshot.js";
import { wallsSVG } from "../js/drawing_sheet/hatches.js";
import { draftingStandard } from "../js/drafting_standards.js";
import { outlineSegments } from "../js/drawing_sheet.js";
import { planDimensionChains } from "../js/planner_drawing.js";
import { wallOutline } from "../js/geometry.js";
import { dimChain } from "../js/dim_chain.js";

const CONCRETE = [{ thickness: 20, material: "reinforced-concrete", role: "core", main: true, structural: true }];
const BLOCK = [{ thickness: 10, material: "concrete-block", role: "core", main: true, structural: true }];

function room(layersOf) {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.slabOpenings = [];
  S.surveyFeatures = [];
  S.nodes = [{ x: 0, z: 0 }, { x: 500, z: 0 }, { x: 500, z: 400 }, { x: 0, z: 400 }];
  S.walls = [[0, 1], [1, 2], [2, 3], [3, 0]].map(([a, b], i) => {
    const layers = layersOf(i);
    return { id: i + 1, a, b, height: 270, layers, thickness: layers.reduce((s, l) => s + l.thickness, 0) };
  });
}
const mm = (v) => v * 5, pts = (poly) => poly.map((p) => p.x + "," + p.z).join(" ");
// the straight pieces drawn in a <g class="..."> group: [[x1,z1,x2,z2], ...]
function strokes(svg, cls) {
  const g = new RegExp(`<g class="${cls}"[^>]*>([\\s\\S]*?)</g>`).exec(svg);
  if (!g) return [];
  const out = [];
  for (const m of g[1].matchAll(/d="([^"]+)"/g)) {
    let pen = null;
    for (const c of m[1].matchAll(/([MLZ])([-\d.e]+)?,?([-\d.e]+)?/g)) {
      if (c[1] === "Z") continue;
      const p = [+c[2], +c[3]];
      if (c[1] === "L" && pen) out.push([...pen, ...p]);
      pen = p;
    }
  }
  for (const m of g[1].matchAll(/points="([^"]+)"/g)) {
    const p = m[1].split(" ").map((s) => s.split(",").map(Number));
    p.forEach((a, i) => out.push([...a, ...p[(i + 1) % p.length]]));
  }
  return out;
}
const diagonal = ([x1, z1, x2, z2]) => Math.abs(x1 - x2) > 0.01 && Math.abs(z1 - z2) > 0.01;

test("a same-type square room has no diagonal in the sheet's cut line", () => {
  room(() => CONCRETE);
  const snap = sheetSnapshot(), svg = wallsSVG(snap.walls, draftingStandard("il"), { mm, pts }).svg;
  const cut = strokes(svg, "wall-cut");
  assert.ok(cut.length >= 8, "the room is inked");
  assert.equal(cut.filter(diagonal).length, 0, "no mitre diagonal");
});

test("concrete + block: the cut line has the square seam on the concrete face", () => {
  // concrete top and bottom, block sides
  room((i) => (i % 2 ? BLOCK : CONCRETE));
  const snap = sheetSnapshot(), svg = wallsSVG(snap.walls, draftingStandard("il"), { mm, pts }).svg;
  const cut = strokes(svg, "wall-cut");
  assert.equal(cut.filter(diagonal).length, 0, "no diagonal");
  // the block's end on the top concrete's inner face z=10, across x 495..505
  const seam = cut.some(([x1, z1, x2, z2]) => Math.abs(z1 - 10) < 0.01 && Math.abs(z2 - 10) < 0.01 &&
    Math.min(x1, x2) <= 495.01 && Math.max(x1, x2) >= 504.99);
  assert.ok(seam, "the seam is the concrete's face, square across the block");
});

test("sheet and plan dimension chains read the same for a mixed room as for a mitred one", () => {
  const chainsOf = () => {
    const snap = sheetSnapshot();
    return planDimensionChains(outlineSegments(snap.wallPolys)).map((c) => ({ side: c.side, at: c.stations.map((s) => Math.round(s.at * 100) / 100) }));
  };
  const planChains = () => ["x", "z"].map((axis) => dimChain(S.walls.map((w) => ({
    id: w.id, ang: Math.atan2(S.nodes[w.b].z - S.nodes[w.a].z, S.nodes[w.b].x - S.nodes[w.a].x), pts: wallOutline(w),
  })), axis).segs.map((s) => [s.kind, Math.round((s.b - s.a) * 100) / 100]));
  room((i) => (i % 2 ? BLOCK : CONCRETE));
  const mixed = chainsOf(), mixedPlan = planChains();
  room((i) => (i % 2 ? BLOCK : CONCRETE));
  S.walls.forEach((w) => (w.join = { a: "miter", b: "miter" }));
  assert.deepEqual(mixed, chainsOf(), "sheet chains");
  assert.deepEqual(mixedPlan, planChains(), "plan chains");
});
