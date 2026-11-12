// DXF import (js/dxf_import.js): the parser's reading of what CAD packages
// write (blocks, arrays, mirrored entities, BYBLOCK / layer-0 inheritance,
// hatches, text, legacy code pages), units, layer picking, and end-to-end
// recognition of the bench's synthetic plans written as DXF — measured against
// the same ground truth as the PDF path — plus the underlay that lands in
// js/blueprint_trace.js in the walls' own frame.
import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeDxfBytes, parseDxf, flattenDxf, dxfUnits, layerKind, layerSummary, recognizeDxf, dxfUnderlay,
  toPlan, roomNameFromTexts, cleanDxfText, aciRgb, dxfImportMode, createDxfSession,
} from "../js/dxf_import.js";
import { normalizeBlueprintReference, drawBlueprintUnderlay, drawBlueprintLinework, pixelToWorld } from "../js/blueprint_trace.js";
import { S } from "../js/state.js";
import { synthDxf } from "../tools/plan_synth_pdf.mjs";
import { scorePlan, plannerToRecord } from "../tools/plan_metrics.mjs";

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// a DXF file from plain records; CRLF, as AutoCAD writes it on Windows
function dxf({ header = {}, layers = [], blocks = [], entities = [] }) {
  const out = [];
  const pair = (c, v) => out.push(String(c), String(v));
  const entity = ([type, pairs]) => { pair(0, type); for (const [c, v] of pairs) pair(c, v); };
  pair(0, "SECTION"); pair(2, "HEADER");
  for (const [name, pairs] of Object.entries(header)) { pair(9, name); for (const [c, v] of pairs) pair(c, v); }
  pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "TABLES"); pair(0, "TABLE"); pair(2, "LAYER");
  for (const l of layers) { pair(0, "LAYER"); for (const [c, v] of l) pair(c, v); }
  pair(0, "ENDTAB"); pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "BLOCKS");
  for (const b of blocks) {
    pair(0, "BLOCK"); pair(8, "0"); pair(2, b.name); pair(70, b.flags || 0); pair(10, b.base?.x || 0); pair(20, b.base?.y || 0);
    b.entities.forEach(entity);
    pair(0, "ENDBLK");
  }
  pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "ENTITIES");
  entities.forEach(entity);
  pair(0, "ENDSEC"); pair(0, "EOF");
  return out.join("\r\n") + "\r\n";
}
const line = (layer, x1, y1, x2, y2, extra = []) => ["LINE", [[8, layer], [10, x1], [20, y1], [30, 0], [11, x2], [21, y2], [31, 0], ...extra]];
const flat = (text) => flattenDxf(parseDxf(text));
const pts = (s) => s.points.map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]);

test("lines, polylines with bulges, arcs and circles keep their geometry and curved spans", () => {
  const f = flat(dxf({
    layers: [[[2, "A-WALL"], [70, 0], [62, 3], [6, "CONTINUOUS"], [370, 50]]],
    entities: [
      line("A-WALL", 0, 0, 400, 0),
      // a semicircle bulge: (0,0) → (200,0) counter-clockwise dips below the chord
      ["LWPOLYLINE", [[8, "A-WALL"], [90, 3], [70, 0], [10, 0], [20, 0], [42, 1], [10, 200], [20, 0], [10, 200], [20, 100]]],
      ["ARC", [[8, "A-WALL"], [10, 0], [20, 0], [30, 0], [40, 90], [50, 0], [51, 90]]],
      ["CIRCLE", [[8, "A-WALL"], [10, 500], [20, 500], [30, 0], [40, 60]]],
    ],
  }));
  assert.equal(f.strokes.length, 4);
  const [ln, poly, arc, circle] = f.strokes;
  assert.deepEqual(pts(ln), [[0, 0], [400, 0]]);
  assert.deepEqual(ln.rgb, [0, 255, 0], "BYLAYER takes the layer's colour");
  assert.equal(ln.lw, 0.5, "and its lineweight");
  const lowest = Math.min(...poly.points.map((p) => p.y));
  assert.ok(near(lowest, -100, 0.5), "bulge 1 is a half circle under the chord: " + lowest);
  assert.equal(poly.curved.filter(Boolean).length > 10, true);
  assert.equal(poly.curved.at(-1), false, "the straight last span stays straight");
  assert.deepEqual(pts(poly).at(-1), [200, 100]);
  for (const p of arc.points) assert.ok(near(Math.hypot(p.x, p.y), 90, 1e-9));
  assert.deepEqual(pts(arc)[0], [90, 0]);
  assert.deepEqual(pts(arc).at(-1), [0, 90]);
  assert.equal(circle.closed, true);
});

test("blocks: inserts, nesting, arrays, mirroring, layer 0 and BYBLOCK inherit from the insert", () => {
  const door = { name: "DOOR90", base: { x: 0, y: 0 }, entities: [
    line("0", 0, 0, 90, 0, [[62, 0]]), // layer 0 + BYBLOCK colour
    line("A-DOOR-IDEN", 0, 0, 0, 10, [[62, 1]]), // its own layer and colour
  ] };
  const pair = { name: "PAIR", base: { x: 0, y: 0 }, entities: [["INSERT", [[8, "0"], [2, "DOOR90"], [10, 0], [20, 0], [30, 0]]], ["INSERT", [[8, "0"], [2, "DOOR90"], [10, 0], [20, 100], [30, 0]]]] };
  const f = flat(dxf({
    layers: [[[2, "A-DOOR"], [70, 0], [62, 5]], [[2, "A-DOOR-IDEN"], [70, 0], [62, 7]]],
    blocks: [door, pair],
    entities: [
      // turned 90°, scaled 2: the leaf runs up from (1000, 500)
      ["INSERT", [[8, "A-DOOR"], [62, 4], [2, "DOOR90"], [10, 1000], [20, 500], [30, 0], [41, 2], [42, 2], [50, 90]]],
      // a 3 × 2 array (MINSERT) of a nested block
      ["INSERT", [[8, "A-DOOR"], [2, "PAIR"], [10, 0], [20, 0], [30, 0], [70, 3], [71, 2], [44, 500], [45, 1000]]],
      // mirrored in AutoCAD: extrusion (0, 0, -1) turns x around
      ["INSERT", [[8, "A-DOOR"], [2, "DOOR90"], [10, 300], [20, 0], [30, 0], [210, 0], [220, 0], [230, -1]]],
    ],
  }));
  const leaves = f.strokes.filter((s) => s.layer === "A-DOOR");
  const iden = f.strokes.filter((s) => s.layer === "A-DOOR-IDEN");
  assert.equal(leaves.length, 1 + 12 + 1, "one, an array of 3×2 pairs, and the mirrored one");
  assert.equal(iden.length, leaves.length, "entities on their own layer keep it");
  assert.deepEqual(pts(leaves[0]), [[1000, 500], [1000, 680]]);
  assert.deepEqual(leaves[0].rgb, aciRgb(4), "BYBLOCK takes the insert's colour");
  assert.deepEqual(iden[0].rgb, aciRgb(1));
  const arrayStarts = leaves.slice(1, 13).map((s) => pts(s)[0].join(",")).sort();
  assert.deepEqual(arrayStarts, ["0,0", "0,100", "0,1000", "0,1100", "1000,0", "1000,100", "1000,1000", "1000,1100", "500,0", "500,100", "500,1000", "500,1100"]);
  assert.deepEqual(leaves[0 + 13].rgb, aciRgb(5), "BYBLOCK under a BYLAYER insert is the insert's layer colour");
  assert.deepEqual(pts(leaves[13]), [[-300, 0], [-390, 0]], "mirrored about the y axis");
});

test("off, frozen, invisible and paper-space entities are left out; hatches become rings", () => {
  const f = flat(dxf({
    layers: [[[2, "OFF"], [70, 0], [62, -7]], [[2, "FROZEN"], [70, 1], [62, 7]], [[2, "A-WALL"], [70, 0], [62, 7]]],
    entities: [
      line("OFF", 0, 0, 1, 0), line("FROZEN", 0, 0, 1, 0), line("A-WALL", 0, 0, 1, 0, [[60, 1]]), line("A-WALL", 0, 0, 1, 0, [[67, 1]]),
      ["HATCH", [[8, "A-WALL"], [10, 0], [20, 0], [30, 0], [210, 0], [220, 0], [230, 1], [2, "SOLID"], [70, 1], [71, 0], [91, 2],
        [92, 2], [72, 0], [73, 1], [93, 4], [10, 0], [20, 0], [10, 300], [20, 0], [10, 300], [20, 20], [10, 0], [20, 20], [97, 0],
        [92, 1], [93, 3], [72, 1], [10, 0], [20, 100], [11, 50], [21, 100], [72, 1], [10, 50], [20, 100], [11, 50], [21, 150], [72, 1], [10, 50], [20, 150], [11, 0], [21, 100], [97, 0],
        [75, 0], [76, 1], [98, 0]]],
    ],
  }));
  assert.equal(f.strokes.length, 0);
  assert.equal(f.fills.length, 1);
  assert.equal(f.fills[0].solid, true);
  assert.equal(f.fills[0].rings.length, 2, "a polyline loop and an edge loop");
  assert.deepEqual(f.fills[0].rings[0].map((p) => [p.x, p.y]).slice(0, 4), [[0, 0], [300, 0], [300, 20], [0, 20]]);
  assert.deepEqual(f.fills[0].rings[1].map((p) => [p.x, p.y]), [[0, 100], [50, 100], [50, 150], [0, 100]]);
});

test("text: TEXT, MTEXT formatting, special characters and attributes", () => {
  assert.equal(cleanDxfText("{\\fArial|b1|i0;Living}\\Proom", true), "Living\nroom");
  assert.equal(cleanDxfText("%%c80 %%p0.5 45%%d", false), "Ø80 ±0.5 45°");
  assert.equal(cleanDxfText("\\U+05E1\\U+05DC\\U+05D5\\U+05DF", false), "סלון");
  assert.equal(cleanDxfText("\\A1;\\H2.5x;\\C1;1\\S1/2;\"", true), "11/2\"");
  const f = flat(dxf({
    blocks: [{ name: "TAG", entities: [] }],
    entities: [
      ["TEXT", [[8, "A-AREA-IDEN"], [10, 100], [20, 200], [30, 0], [40, 25], [1, "Kitchen"], [50, 90]]],
      ["MTEXT", [[8, "A-AREA-IDEN"], [10, 0], [20, 0], [30, 0], [40, 30], [71, 5], [3, "{\\LBed"], [1, "room}\\P12.4 m²"]]],
      ["INSERT", [[8, "A-ANNO"], [66, 1], [2, "TAG"], [10, 50], [20, 50], [30, 0]]],
      ["ATTRIB", [[8, "A-ANNO"], [10, 55], [20, 60], [30, 0], [40, 10], [1, "D1"], [2, "MARK"], [70, 0]]],
      ["SEQEND", [[8, "A-ANNO"]]],
    ],
  }));
  const [kitchen, bed, mark] = f.texts;
  assert.equal(kitchen.str, "Kitchen");
  assert.ok(near(kitchen.angle, Math.PI / 2));
  assert.equal(kitchen.size, 25);
  assert.equal(bed.str, "Bedroom", "first line of the MTEXT, formatting gone");
  assert.equal(bed.align, "center");
  assert.equal(bed.baseline, "middle");
  assert.equal(mark.str, "D1");
});

test("bytes: code pages before AutoCAD 2007, UTF-8 after, DWG and binary DXF refused", () => {
  const body = (ver, page, name) => `0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\n${ver}\r\n9\r\n$DWGCODEPAGE\r\n3\r\n${page}\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nENTITIES\r\n0\r\nTEXT\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0\r\n40\r\n10\r\n1\r\n${name}\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n`;
  // windows-1255 bytes for "סלון": ס=0xF1 ל=0xEC ו=0xE5 ן=0xEF
  const ascii = Buffer.from(body("AC1015", "ANSI_1255", "@@@@"), "latin1");
  const at = ascii.indexOf("@@@@");
  ascii.set([0xf1, 0xec, 0xe5, 0xef], at);
  assert.equal(flat(decodeDxfBytes(ascii)).texts[0].str, "סלון");
  const utf8 = Buffer.from(body("AC1027", "ANSI_1252", "סלון"), "utf8");
  assert.equal(flat(decodeDxfBytes(utf8)).texts[0].str, "סלון");
  assert.throws(() => decodeDxfBytes(Buffer.from("AC1032\0\0\0junk", "latin1")), { code: "DXF_IS_DWG" });
  assert.throws(() => decodeDxfBytes(Buffer.from("AutoCAD Binary DXF\r\n\x1a\0", "latin1")), { code: "DXF_BINARY" });
  assert.throws(() => parseDxf("hello\nworld\n"), { code: "DXF_MALFORMED" });
});

test("units: $INSUNITS when written, else the drawing's size decides", () => {
  const rect = (w) => [line("A", 0, 0, w, 0), line("A", w, 0, w, w * 0.7)];
  const units = (opts) => { const doc = parseDxf(dxf(opts)); return dxfUnits(doc, flattenDxf(doc)); };
  assert.deepEqual(units({ header: { $INSUNITS: [[70, 4]] }, entities: rect(12) }), { cmPerUnit: 0.1, unit: "mm", source: "header" });
  assert.equal(units({ entities: rect(12000) }).unit, "mm");
  assert.equal(units({ entities: rect(1200) }).unit, "cm");
  assert.equal(units({ entities: rect(12) }).unit, "m");
  assert.equal(units({ header: { $MEASUREMENT: [[70, 0]] }, entities: rect(480) }).unit, "in");
  assert.equal(units({ header: { $MEASUREMENT: [[70, 0]] }, entities: rect(40) }).unit, "ft");
});

test("layers: walls, doors and windows are picked by name in English, Hebrew and AIA codes", () => {
  const kinds = { "A-WALL": "walls", "A-WALL-PATT": "walls", "WALLS": "walls", "קירות": "walls", "Beton": "walls", "A-DOOR": "doors", "דלתות": "doors",
    "A-GLAZ": "windows", "חלונות": "windows", "A-ANNO-DIMS": "annotation", "DEFPOINTS": "annotation", "מידות": "annotation",
    "A-FURN": "furniture", "FURNITURE": "furniture", "0": "other", "Layer1": "other" };
  for (const [name, kind] of Object.entries(kinds)) assert.equal(layerKind(name), kind, name);
  const pick = (names) => {
    const doc = parseDxf(dxf({ entities: names.map((n) => line(n, 0, 0, 100, 0)) }));
    return layerSummary(doc, flattenDxf(doc)).filter((r) => r.use).map((r) => r.name);
  };
  assert.deepEqual(pick(["A-WALL", "A-DOOR", "A-GLAZ", "A-FURN", "A-ANNO-DIMS"]), ["A-WALL", "A-DOOR", "A-GLAZ"]);
  // nothing named like a wall: everything except notes and furniture
  assert.deepEqual(pick(["0", "Layer1", "FURNITURE", "DIMS"]), ["0", "Layer1"]);
});

// Doors keep their hinge side and swing (as in plan_recog_pdf.test.mjs).
function swingMatches(graph, truth, shift) {
  const byId = new Map(graph.walls.map((w) => [w.id, w]));
  let checked = 0, right = 0;
  for (const op of graph.openings) {
    if (op.type !== "door" || !op.swingDir) continue;
    const w = byId.get(op.wall), a = graph.nodes[w.a], b = graph.nodes[w.b];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const c = { x: a.x + ((b.x - a.x) * op.s) / L + shift.x, z: a.z + ((b.z - a.z) * op.s) / L + shift.z };
    const t = truth.openings.filter((o) => o.type === "door")
      .sort((p, q) => Math.hypot(p.center.x - c.x, p.center.z - c.z) - Math.hypot(q.center.x - c.x, q.center.z - c.z))[0];
    const tw = truth.walls[t.wall];
    const same = (tw.b.x - tw.a.x) * (b.x - a.x) + (tw.b.z - tw.a.z) * (b.z - a.z) >= 0;
    const want = ((t.hingeAtStart === same) ? "L" : "R") + "_" + ((t.swing > 0) === same ? "OUT" : "IN");
    checked++;
    if (want === op.swingDir) right++;
  }
  return { checked, right };
}

/* Import a synthetic DXF the way the dialog does (suggested layers unless
   told otherwise) and score it in the ground truth's frame: the page centre,
   carried through the import's own toPlan — no alignment fitting, so the
   frame the underlay uses is checked too. */
function importAndScore(seed, options, { allLayers = false } = {}) {
  const s = synthDxf(seed, { dimensions: true, furniture: true, border: true, labels: true, ...options });
  const doc = parseDxf(s.dxf), f = flattenDxf(doc), units = dxfUnits(doc, f);
  const layers = allLayers ? null : new Set(layerSummary(doc, f).filter((r) => r.use).map((r) => r.name));
  const { graph, frame } = recognizeDxf(f, { layers, cmPerUnit: units.cmPerUnit, firstId: 1 });
  const c = toPlan(frame, s.sheetToWorld({ x: s.meta.width / 2, y: s.meta.height / 2 }));
  const sh = (p) => ({ x: p.x - c.x, z: p.z - c.z });
  const rec = plannerToRecord(graph);
  const score = scorePlan(s.truth, { ...rec, walls: rec.walls.map((w) => ({ ...w, a: sh(w.a), b: sh(w.b) })), openings: rec.openings.map((o) => ({ ...o, center: sh(o.center) })) });
  return { s, f, graph, frame, units, score, swings: swingMatches(graph, s.truth, { x: -c.x, z: -c.z }) };
}

for (const style of ["poche", "outline", "hatch"]) {
  test(`DXF (${style}): walls, openings and swings match ground truth`, () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { score, graph, units, swings } = importAndScore(seed, { style });
      assert.equal(units.source, "header");
      assert.ok(score.walls.precision > 0.98 && score.walls.recall > 0.98, `seed ${seed}: walls P ${score.walls.precision} R ${score.walls.recall}`);
      assert.ok(score.walls.thicknessMAE < 0.5, `seed ${seed}: thickness off by ${score.walls.thicknessMAE} cm`);
      assert.ok(score.openings.typed.f1 > 0.96, `seed ${seed}: openings F1 ${score.openings.typed.f1}`);
      assert.ok(score.openings.widthMAE < 1, `seed ${seed}: opening widths off by ${score.openings.widthMAE} cm`);
      assert.ok(swings.checked > 0 && swings.right === swings.checked, `seed ${seed}: ${swings.right}/${swings.checked} door swings right`);
      assert.ok(graph.walls.every((w) => w.height === 270 && w.phase === "existing"));
    }
  });
}

test("DXF in metres, inches, without $INSUNITS, in survey coordinates, and with every layer read", () => {
  const cases = [
    [{ dxfUnit: "m" }, {}],
    [{ dxfUnit: "in" }, {}],
    [{ writeUnits: false }, {}],
    [{ writeUnits: false, dxfUnit: "m" }, {}],
    // Israeli ITM coordinates: the plan sits 180 km east, 650 km north
    [{ dxfUnit: "m", offset: { x: 180000.123, y: 650000.456 } }, {}],
    [{ dxfUnit: "mm", offset: { x: 180000123, y: 650000456 } }, {}],
    // furniture, dimensions, labels and the sheet frame read as well
    [{}, { allLayers: true }],
  ];
  for (const [opts, how] of cases) for (const style of ["poche", "outline", "hatch"]) for (const seed of [1, 3, 5]) {
    const { score, units } = importAndScore(seed, { style, ...opts }, how);
    const label = JSON.stringify(opts) + JSON.stringify(how) + ` ${style} seed ${seed}`;
    assert.equal(units.unit, opts.dxfUnit || "mm", label);
    assert.ok(score.walls.f1 > 0.97, `${label}: walls F1 ${score.walls.f1}`);
    assert.ok(score.openings.typed.f1 > 0.9, `${label}: openings F1 ${score.openings.typed.f1}`);
  }
});

test("underlay: the whole drawing in the walls' frame, its line ends as snap points", () => {
  const { s, f, frame, graph } = importAndScore(2, { style: "outline" });
  const { ref, dropped } = dxfUnderlay(f, frame, { name: "synth.dxf" });
  assert.equal(dropped, 0);
  assert.equal(ref.sourceType, "dxf");
  assert.ok(ref.vector.segs.length > 100 && ref.vector.texts.length > 0);
  // a wall corner of the recognized plan is a snap point of the underlay face
  // corner within half a wall thickness — the two share one frame
  const corner = graph.nodes[graph.walls[0].a];
  const closest = Math.min(...ref.guidePoints.map((p) => Math.hypot(p.x - corner.x, p.z - corner.z)));
  assert.ok(closest <= graph.walls[0].thickness, `nearest underlay point ${closest} cm from a wall corner`);
  // and every segment lands where toPlan puts the drawing
  const stroke = f.strokes.find((st) => st.layer === "A-WALL" && st.points.length === 2);
  const want = toPlan(frame, stroke.points[0]);
  const world = (i) => pixelToWorld(ref, { x: ref.vector.segs[i], y: ref.vector.segs[i + 1] });
  let best = Infinity;
  for (let i = 0; i < ref.vector.segs.length; i += 2) best = Math.min(best, Math.hypot(world(i).x - want.x, world(i).z - want.z));
  assert.ok(best < 0.2, `segment ends ${best} cm from where the drawing is`);
  // the project keeps it: normalized as a vector reference, not refused for lacking a picture
  const kept = normalizeBlueprintReference(JSON.parse(JSON.stringify(ref)));
  assert.equal(kept.vector.segs.length, ref.vector.segs.length);
  assert.equal(kept.guidePoints.length, ref.guidePoints.length);
  assert.equal(kept.dataUrl, undefined);
  assert.equal(normalizeBlueprintReference({ ...ref, vector: { segs: ["x"] } }), null);
  assert.ok(s.truth.walls.length > 0);
});

test("underlay: the longest lines are kept when a drawing is larger than a project carries", () => {
  const entities = [];
  for (let i = 0; i < 300; i++) entities.push(line("A", 0, i * 10, 5 + i, i * 10));
  const f = flat(dxf({ entities }));
  const frame = { cmPerUnit: 1, shiftX: 0, shiftY: 0, ox: 0, oz: 0 };
  const { ref, dropped } = dxfUnderlay(f, frame, { maxSegments: 100, maxGuides: 50 });
  assert.equal(dropped, 200);
  assert.equal(ref.vector.segs.length, 400);
  const lengths = [];
  for (let i = 0; i < ref.vector.segs.length; i += 4) lengths.push(Math.round(ref.vector.segs[i + 2] - ref.vector.segs[i]));
  assert.ok(Math.min(...lengths) >= 204, "only the 100 longest");
  assert.equal(ref.guidePoints.length, 50);
});

test("DXF line work paints over the room fills as hairlines and readable text, in the reference transform", () => {
  const calls = [];
  globalThis.Path2D = class { constructor() { this.ops = []; } moveTo(x, y) { this.ops.push(["M", x, y]); } lineTo(x, y) { this.ops.push(["L", x, y]); } };
  const ctx = new Proxy({}, {
    get: (target, key) => (key in target ? target[key] : (...args) => calls.push([key, ...args])),
    set: (target, key, value) => { target[key] = value; calls.push(["set " + String(key), value]); return true; },
  });
  const prev = { ref: S.blueprintTrace, SC: S.SC };
  try {
    S.SC = 2;
    S.blueprintTrace = normalizeBlueprintReference({ version: 1, name: "t", sourceType: "dxf", width: 100, height: 50, cmPerPx: 1, originX: 0, originZ: 0,
      vector: { segs: [0, 0, 100, 0], dsegs: [0, 50, 100, 50], texts: [[10, 10, 20, 0, "Living", "left", "alphabetic"], [10, 30, 1, 0, "tiny", "left", "alphabetic"]] } });
    // the underlay pass (under the room fills) leaves DXF line work alone…
    drawBlueprintUnderlay(ctx, (x) => x * 2, (z) => z * 2);
    assert.equal(calls.filter((c) => c[0] === "stroke").length, 0);
    // …which plan2d paints after the rooms
    drawBlueprintLinework(ctx, (x) => x * 2, (z) => z * 2);
  } finally {
    S.blueprintTrace = prev.ref;
    S.SC = prev.SC;
    delete globalThis.Path2D;
  }
  const strokes = calls.filter((c) => c[0] === "stroke");
  assert.equal(strokes.length, 2, "solid and dashed runs");
  assert.deepEqual(strokes[0][1].ops, [["M", 0, 0], ["L", 100, 0]]);
  assert.ok(calls.some((c) => c[0] === "set lineWidth" && near(c[1], 0.5)), "one screen pixel at 2 px/cm");
  assert.ok(calls.some((c) => c[0] === "scale" && c[1] === 2 && c[2] === 2));
  assert.ok(calls.some((c) => c[0] === "translate" && c[1] === -50 && c[2] === -25), "drawn from the reference's top-left");
  const texts = calls.filter((c) => c[0] === "fillText").map((c) => c[1]);
  assert.deepEqual(texts, ["Living"], "1 cm text is too small to read at this zoom");
});

// A 2D context that keeps a real transform stack, for checking where labels land.
function matrixContext(width, height) {
  const mul = (m, n) => ({ a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f });
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack = [], drawn = [], sets = { font: 0 };
  const ctx = {
    canvas: { width, height }, drawn, sets,
    save() { stack.push(m); }, restore() { m = stack.pop(); },
    translate(x, y) { m = mul(m, { a: 1, b: 0, c: 0, d: 1, e: x, f: y }); },
    scale(x, y) { m = mul(m, { a: x, b: 0, c: 0, d: y, e: 0, f: 0 }); },
    rotate(r) { m = mul(m, { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 }); },
    setTransform(a, b, c, d, e, f) { m = { a, b, c, d, e, f }; },
    getTransform() { return { ...m }; },
    setLineDash() {}, stroke(path) { drawn.push(["stroke", path]); },
    fillText(str, x, y, maxWidth) { drawn.push(["text", str, m.e + m.a * x + m.c * y, m.f + m.b * x + m.d * y, Math.atan2(m.b, m.a), maxWidth]); },
  };
  let font = "";
  Object.defineProperty(ctx, "font", { get: () => font, set: (v) => { font = v; sets.font++; } });
  return ctx;
}

test("vector underlay labels: only those on screen are drawn, placed as before, one font per size", () => {
  globalThis.Path2D = class { constructor() { this.ops = []; } moveTo(x, y) { this.ops.push(["M", x, y]); } lineTo(x, y) { this.ops.push(["L", x, y]); } };
  const prev = { ref: S.blueprintTrace, SC: S.SC };
  try {
    // a 100 m × 100 m drawing with a label every 2 m, all 30 cm high
    const texts = [];
    for (let x = 0; x < 10000; x += 200) for (let z = 0; z < 10000; z += 200) texts.push([x, z, 30, 0, "R" + x + "_" + z, "left", "alphabetic"]);
    texts.push([5000, 5000, 30, Math.PI / 2, "Aligned", "left", "alphabetic", 120]);
    S.blueprintTrace = normalizeBlueprintReference({ version: 1, name: "t", sourceType: "dxf", width: 10000, height: 10000, cmPerPx: 1, originX: 0, originZ: 0,
      vector: { segs: [0, 0, 10000, 0], dsegs: [], texts: texts.slice(0, 3000) } });
    // zoomed in on the drawing's centre: 1 px/cm, an 800 × 600 canvas at dpr 2
    S.SC = 1;
    const sx = (x) => 400 + x, sz = (z) => 300 + z;
    const ctx = matrixContext(1600, 1200);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    drawBlueprintLinework(ctx, sx, sz);
    const labels = ctx.drawn.filter((d) => d[0] === "text");
    // on screen: x within ±400 cm and z within ±300 cm of the centre, plus each label's reach
    assert.ok(labels.length > 0 && labels.length < 60, labels.length + " labels drawn of " + texts.length);
    for (const [, str, X, Y] of labels) assert.ok(X > -1000 && X < 2600 && Y > -1000 && Y < 2200, str + " drawn off screen at " + X + "," + Y);
    // every label a plain loop would draw on screen is still drawn, where it was
    const want = texts.filter((t) => Math.abs(t[0] - 5000) <= 400 && Math.abs(t[1] - 5000) <= 300);
    for (const t of want) {
      const hit = labels.find((d) => d[1] === t[4]);
      assert.ok(hit, t[4] + " is on screen but was culled");
      assert.ok(near(hit[2], 2 * (400 + t[0] - 5000), 1e-6) && near(hit[3], 2 * (300 + t[1] - 5000), 1e-6), t[4] + " moved");
    }
    const aligned = labels.find((d) => d[1] === "Aligned");
    assert.ok(near(aligned[4], Math.PI / 2, 1e-9), "turned with its angle");
    assert.equal(aligned[5], 120, "fitted to its width");
    assert.equal(ctx.sets.font, 1, "one size, one font assignment");
    // the next paint reuses the paths, and so does the reference coming back from undo
    const first = ctx.drawn.find((d) => d[0] === "stroke")[1];
    S.blueprintTrace = normalizeBlueprintReference({ ...S.blueprintTrace, opacity: 0.4 });
    const again = matrixContext(1600, 1200);
    drawBlueprintLinework(again, sx, sz);
    assert.equal(again.drawn.find((d) => d[0] === "stroke")[1], first);
  } finally {
    S.blueprintTrace = prev.ref;
    S.SC = prev.SC;
    delete globalThis.Path2D;
  }
});

test("a checked vector reference keeps its vector object and cannot be changed", () => {
  const raw = { version: 1, name: "t", sourceType: "dxf", width: 100, height: 50, cmPerPx: 1,
    vector: { segs: [0, 0, 100, 0], dsegs: [], texts: [[1, 2, 10, 0, "Fit", "left", "alphabetic", 80], [1, 2, 10, 0, "Odd", "left", "alphabetic", -3]] } };
  const a = normalizeBlueprintReference(raw);
  assert.notEqual(a.vector, raw.vector, "an unchecked vector is copied");
  assert.deepEqual(a.vector.texts.map((t) => t.length), [8, 7], "a fit width is kept, a bad one dropped");
  const b = normalizeBlueprintReference({ ...a, opacity: 0.3 });
  assert.notEqual(b, a);
  assert.equal(b.vector, a.vector, "the same checked vector comes back");
  assert.ok(Object.isFrozen(a.vector) && Object.isFrozen(a.vector.segs) && Object.isFrozen(a.vector.texts[0]));
  assert.throws(() => { a.vector.segs.push(1); }, TypeError);
  // a copy (a saved project, an old undo entry) is checked again
  const c = normalizeBlueprintReference(JSON.parse(JSON.stringify(a)));
  assert.notEqual(c.vector, a.vector);
  assert.deepEqual(c.vector, a.vector);
});

test("rooms take the name written inside them, not their area or a dimension", () => {
  const room = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }];
  const texts = [
    { str: "12.4 m²", x: 200, z: 160, size: 30 }, { str: "345", x: 200, z: 20, size: 40 }, { str: "+3.20", x: 100, z: 100, size: 40 },
    { str: "Living room", x: 200, z: 140, size: 25 }, { str: "WC", x: 50, z: 50, size: 12 }, { str: "Kitchen", x: 600, z: 140, size: 50 },
  ];
  assert.equal(roomNameFromTexts(room, texts), "Living room");
  assert.equal(roomNameFromTexts(room, [{ str: "סלון", x: 100, z: 100, size: 20 }]), "סלון");
  assert.equal(roomNameFromTexts(room, texts.slice(0, 3)), null);
});

const arrayInsert = (name, cols = 100, rows = 100, extra = []) => ["INSERT", [[2, name], [70, cols], [71, rows], [44, 10], [45, 10], ...extra]];
function nestedArrays(entities) {
  return dxf({
    blocks: [{ name: "B0", entities }, ...[1, 2, 3].map((n) => ({ name: "B" + n, entities: [arrayInsert("B" + (n - 1))] }))],
    entities: [arrayInsert("B3", 1, 1)],
  });
}

test("nested INSERT arrays stop the whole traversal at either budget", { timeout: 10000 }, () => {
  const doc = parseDxf(nestedArrays([line("0", 0, 0, 1, 0)]));
  const start = Date.now();
  for (const limits of [{ maxPoints: 30 }, { maxVisits: 60 }, { maxPoints: 0 }, { maxVisits: 0 }]) {
    const f = flattenDxf(doc, limits);
    assert.equal(f.warnings["too-large"], 1);
    assert.ok(f.strokes.length <= 30);
    assert.ok(f.strokes.reduce((n, s) => n + s.points.length, 0) <= (limits.maxPoints ?? 60));
  }
  assert.ok(Date.now() - start < 3000, "the tiny nested-array file must not walk 10^12 leaves");
});

test("empty nested arrays and branching recursive blocks stop at the default visit budget", { timeout: 20000 }, () => {
  const start = Date.now();
  const docs = [parseDxf(nestedArrays([])), parseDxf(dxf({
    blocks: [{ name: "SELF", entities: Array.from({ length: 4 }, () => arrayInsert("SELF", 1, 1)) }],
    entities: [arrayInsert("SELF", 1, 1)],
  }))];
  for (const doc of docs) {
    const f = flattenDxf(doc);
    assert.equal(f.warnings["too-large"], 1);
    assert.equal(f.strokes.length + f.fills.length + f.texts.length, 0);
  }
  assert.ok(Date.now() - start < 15000, "empty blocks need a work budget independent of output");
});

test("arrayed texts spend the point budget and do not leave room for later attributes or entities", () => {
  const label = ["TEXT", [[10, 1], [20, 2], [40, 5], [1, "Room"]]];
  const doc = parseDxf(dxf({
    blocks: [{ name: "TAG", entities: [label] }],
    entities: [arrayInsert("TAG", 100, 100, [[66, 1]]),
      ["ATTRIB", [[10, 3], [20, 4], [40, 5], [1, "Attribute"]]], ["SEQEND", []], line("0", 0, 0, 10, 0)],
  }));
  const f = flattenDxf(doc, { maxPoints: 9 });
  assert.equal(f.texts.length, 2);
  assert.ok(f.texts.every((t) => t.str === "Room"));
  assert.equal(f.strokes.length, 0);
  assert.equal(f.warnings["too-large"], 1);
});

test("huge ARC and ELLIPSE angles stay within one turn, including equal endpoints", { timeout: 3000 }, () => {
  const entities = [];
  for (const [start, end] of [[1e30, 0], [0, 1e9], [90, 90]]) {
    entities.push(["ARC", [[40, 10], [50, start], [51, end]]]);
    entities.push(["ELLIPSE", [[11, 10], [21, 0], [40, 0.5], [41, start], [42, end]]]);
  }
  const f = flat(dxf({ entities }));
  assert.equal(f.strokes.length, 6);
  for (const s of f.strokes) {
    assert.ok(s.points.length >= 3 && s.points.length <= 74);
    assert.ok(s.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
  for (const s of f.strokes.slice(-2)) {
    assert.ok(near(s.points[0].x, s.points.at(-1).x));
    assert.ok(near(s.points[0].y, s.points.at(-1).y));
  }
});

test("HATCH declared counts stop at the next unexpected group code", { timeout: 3000 }, () => {
  const huge = 200000000;
  const paths = [
    [[92, 2], [72, 0], [73, 1], [93, huge], [10, 0], [20, 0], [10, 10], [20, 0], [10, 0], [20, 10]],
    [[92, 1], [93, huge], [72, 1], [10, 0], [20, 0], [11, 10], [21, 0],
      [72, 1], [10, 10], [20, 0], [11, 0], [21, 10], [72, 1], [10, 0], [20, 10], [11, 0], [21, 0]],
    // Each spline count used to keep reading defaults without advancing.
    [[92, 1], [93, 1], [72, 4], [94, 1], [73, 0], [74, 0], [95, huge], [96, 2], [40, 0], [40, 0], [40, 1], [40, 1],
      [10, 0], [20, 0], [10, 10], [20, 0], [97, 0]],
    [[92, 1], [93, 1], [72, 4], [94, 1], [73, 0], [74, 0], [95, 4], [96, huge], [40, 0], [40, 0], [40, 1], [40, 1],
      [10, 0], [20, 0], [10, 10], [20, 0], [97, 0]],
    [[92, 1], [93, 1], [72, 4], [94, 1], [73, 0], [74, 0], [95, 0], [96, 0], [97, huge], [11, 0], [21, 0], [11, 10], [21, 0], [11, 0], [21, 10]],
  ];
  for (const path of paths) {
    const f = flat(dxf({ entities: [["HATCH", [[70, 1], [91, 1], ...path, [97, 0], [75, 0], [76, 1], [98, 0]]]] }));
    assert.equal(Object.keys(f.warnings).length, 0);
    assert.equal(f.fills.length, 1);
    assert.ok(f.fills[0].rings[0].length <= 15);
  }
});

test("HATCH arc and ellipse edges normalize huge sweeps in both directions", { timeout: 3000 }, () => {
  for (const type of [2, 3]) for (const ccw of [0, 1]) {
    const edge = type === 2 ? [[40, 10]] : [[11, 10], [21, 0], [40, 0.5]];
    const f = flat(dxf({ entities: [["HATCH", [[70, 1], [91, 1], [92, 1], [93, 1], [72, type], [10, 0], [20, 0],
      ...edge, [50, 1e30], [51, 1e9], [73, ccw], [97, 0]]]] }));
    assert.equal(f.fills.length, 1);
    assert.ok(f.fills[0].rings[0].length <= 74);
  }
  // Ordinary clockwise angles are stored with the opposite sign by DXF.
  const f = flat(dxf({ entities: [["HATCH", [[70, 1], [91, 1], [92, 1], [93, 1], [72, 2], [10, 0], [20, 0],
    [40, 10], [50, 0], [51, 90], [73, 0], [97, 0]]]] }));
  const ring = f.fills[0].rings[0];
  assert.ok(near(ring[0].x, 10) && near(ring[0].y, 0));
  assert.ok(near(ring.at(-1).x, 0) && near(ring.at(-1).y, -10));
  assert.ok(ring[1].y < 0);
});

const justifiedText = (h, extra = []) => ["TEXT", [[10, 10], [20, 20], [11, 40], [21, 60], [40, 10], [50, 15], [72, h], [1, "Living room"], ...extra]];

test("Aligned and Fit TEXT keep the start anchor, direction and transformed fit width", () => {
  const f = flat(dxf({
    blocks: [{ name: "LABEL", entities: [justifiedText(3), justifiedText(5)] }],
    entities: [justifiedText(3), justifiedText(5), ["INSERT", [[2, "LABEL"], [10, 100], [20, 200], [41, 2], [42, 3], [50, 90]]]],
  }));
  assert.equal(f.texts.length, 4);
  for (const t of f.texts.slice(0, 2)) {
    assert.deepEqual([t.x, t.y, t.align], [10, 20, "left"]);
    assert.ok(near(t.angle, Math.atan2(40, 30)));
    assert.ok(near(t.width, 50));
  }
  for (const t of f.texts.slice(2)) {
    assert.ok(near(t.x, 40) && near(t.y, 220));
    assert.equal(t.align, "left");
    assert.ok(near(t.angle, Math.atan2(60, -120)));
    assert.ok(near(t.width, Math.hypot(60, 120)));
  }
  const mirrored = flat(dxf({ entities: [justifiedText(3, [[230, -1]])] })).texts[0];
  assert.equal(mirrored.x, -10);
  assert.ok(near(mirrored.angle, Math.atan2(40, -30)));
  assert.equal(mirrored.width, 50);
});

test("TEXT justification preserves other anchors and ignores missing or coincident fit endpoints", () => {
  const f = flat(dxf({ entities: [1, 2, 4].map((h) => justifiedText(h)) }));
  assert.deepEqual(f.texts.map((t) => [t.x, t.y, t.align]), [[40, 60, "center"], [40, 60, "right"], [40, 60, "center"]]);
  for (const h of [3, 5]) for (const end of [[], [[11, 10], [21, 20]]]) {
    const t = flat(dxf({ entities: [["TEXT", [[10, 10], [20, 20], ...end, [40, 10], [50, 15], [72, h], [1, "Room"]]]] })).texts[0];
    assert.deepEqual([t.x, t.y, t.align], [10, 20, "left"]);
    assert.ok(near(t.angle, 15 * Math.PI / 180));
    assert.equal(Object.hasOwn(t, "width"), false);
  }
});

test("ATTRIB vertical justification comes from 74, independently of field length 73", () => {
  for (const [v, baseline] of [[0, "alphabetic"], [1, "bottom"], [2, "middle"], [3, "top"]]) {
    const f = flat(dxf({ blocks: [{ name: "TAG", entities: [] }], entities: [
      ["INSERT", [[2, "TAG"], [66, 1]]],
      ["ATTRIB", [[10, 10], [20, 20], [11, 40], [21, 60], [40, 10], [73, 25], [74, v], [1, "Room"]]], ["SEQEND", []],
    ] }));
    const t = f.texts[0];
    assert.deepEqual([t.x, t.y], v ? [40, 60] : [10, 20]);
    assert.equal(t.baseline, baseline);
  }
});

test("aligned room labels name the room containing their start rather than their end", () => {
  const f = flat(dxf({ entities: [["TEXT", [[10, 100], [20, -100], [11, 401], [21, -100], [40, 25], [72, 3], [1, "Living room"]]]] }));
  const frame = { cmPerUnit: 1, shiftX: 0, shiftY: 0, ox: 0, oz: 0 };
  const texts = f.texts.map((t) => ({ ...t, ...toPlan(frame, t) }));
  const room = (x) => [{ x, z: 0 }, { x: x + 400, z: 0 }, { x: x + 400, z: 300 }, { x, z: 300 }];
  assert.equal(roomNameFromTexts(room(0), texts), "Living room");
  assert.equal(roomNameFromTexts(room(400), texts), null);
});

test("underlay fit widths occupy an eighth column only for Aligned and Fit text", () => {
  const f = flat(dxf({ entities: [0, 1, 2, 3, 4, 5].map((h) => justifiedText(h)) }));
  const frame = { cmPerUnit: 2.54, shiftX: 0, shiftY: 0, ox: 0, oz: 0 };
  const rows = dxfUnderlay(f, frame).ref.vector.texts;
  assert.deepEqual(rows.map((r) => r.length), [7, 7, 7, 8, 7, 8]);
  assert.equal(rows[3][7], 127);
  assert.equal(rows[5][7], 127);
});

const emptyFloor = () => ({ nodes: [], walls: [], items: [], markers: [], annotations: [], slabOpenings: [], wallCons: [], roomCons: [], mep: { nodes: [], runs: [] } });

test("DXF import mode distinguishes occupied floors and effective replacement", () => {
  assert.deepEqual(dxfImportMode(emptyFloor(), { replace: true, walls: 4 }), { ok: true, replace: false, reason: null, occupied: false });
  const state = { ...emptyFloor(), walls: [{ id: 1 }] };
  assert.deepEqual(dxfImportMode(state, { replace: true, walls: 4 }), { ok: true, replace: true, reason: null, occupied: true });
  assert.equal(dxfImportMode(state, { replace: true, walls: 0 }).replace, false);
  for (const key of ["walls", "items", "markers", "annotations", "slabOpenings"]) {
    assert.equal(dxfImportMode({ ...emptyFloor(), [key]: [{}] }, { walls: 4 }).occupied, true, key);
  }
});

test("DXF replacement refuses protected and linked geometry but allows adding", () => {
  const patches = [
    { walls: [{ locked: true }] }, { items: [{ locked: true }] }, { wallCons: [{}] }, { roomCons: [{}] },
    { slabOpenings: [{}] }, { markers: [{}] }, { mep: { nodes: [{}], runs: [] } }, { mep: { nodes: [], runs: [{}] } },
  ];
  for (const patch of patches) {
    const state = { ...emptyFloor(), walls: [{}], ...patch };
    const before = structuredClone(state);
    const mode = dxfImportMode(state, { replace: true, walls: 4 });
    assert.equal(mode.ok, false);
    assert.equal(mode.reason, "protected");
    assert.equal(dxfImportMode(state, { replace: false, walls: 4 }).ok, true);
    assert.equal(dxfImportMode(state, { replace: true, walls: 0 }).ok, true);
    assert.equal(dxfImportMode(state, { replace: true, walls: 0 }).replace, false);
    assert.deepEqual(state, before, "the guard never mutates the floor");
  }
  const markers = { ...emptyFloor(), markers: [{}] };
  assert.equal(dxfImportMode(markers, { replace: true, walls: 1 }).reason, "protected");
});

test("a locked structure refuses either wall import mode while allowing only an underlay", () => {
  for (const patch of [{ structLocked: true }, { layers: { structure: { locked: true } } }]) for (const replace of [false, true]) {
    const state = { ...emptyFloor(), ...patch };
    const mode = dxfImportMode(state, { replace, walls: 4 });
    assert.equal(mode.ok, false);
    assert.equal(mode.reason, "locked");
    assert.equal(dxfImportMode(state, { replace, walls: 0 }).ok, true);
  }
});

test("DXF session keeps full drawing private and produces the direct recognizer's graph and underlay", () => {
  const source = synthDxf(2, { style: "outline", labels: true, dimensions: true });
  const doc = parseDxf(source.dxf), f = flattenDxf(doc), session = createDxfSession({ maxPreviewSegments: 20 });
  const summary = session.open(new TextEncoder().encode(source.dxf), { name: "session.dxf" });
  assert.deepEqual(Object.keys(summary).sort(), ["bounds", "count", "layers", "name", "preview", "units", "warnings"]);
  assert.equal(summary.count, f.strokes.length + f.fills.length + f.texts.length);
  assert.deepEqual(summary.layers, layerSummary(doc, f));
  assert.deepEqual(summary.units, dxfUnits(doc, f));
  assert.ok(summary.preview.length > 0);
  assert.ok(summary.preview.every((r) => r.segs instanceof Float32Array && r.segs.length % 4 === 0));
  assert.ok(summary.preview.reduce((n, r) => n + r.segs.length / 4, 0) <= 20);
  const options = { layers: summary.layers.filter((r) => r.use).map((r) => r.name), cmPerUnit: summary.units.cmPerUnit, firstId: 123, height: 310 };
  const { graph, frame } = recognizeDxf(f, { ...options, layers: new Set(options.layers) });
  const result = session.plan(options);
  assert.deepEqual(result.graph, graph);
  assert.deepEqual(result.frame, frame);
  assert.deepEqual(result.underlay, dxfUnderlay(f, frame, { name: "session.dxf" }));
  assert.deepEqual(result.texts, f.texts.map((t) => ({ ...toPlan(frame, t), str: t.str, size: t.size })));
  const only = session.plan({ ...options, layers: [] });
  assert.equal(only.graph.walls.length, 0);
  assert.equal(only.graph.nextId, 123);
  assert.ok(only.underlay.ref);
  assert.equal(session.plan({ ...options, underlay: false }).underlay.ref, null);
});

test("DXF session preserves decoding and parse error codes and nothing-drawn detection", () => {
  const session = createDxfSession();
  for (const [text, code] of [["AC1032", "DXF_IS_DWG"], ["AutoCAD Binary DXF", "DXF_BINARY"], ["", "DXF_EMPTY"], ["bad\ninput\n", "DXF_MALFORMED"], [dxf({}), "DXF_NOTHING"]]) {
    assert.throws(() => session.open(new TextEncoder().encode(text)), { code });
  }
});
