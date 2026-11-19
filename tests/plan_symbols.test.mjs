import test from "node:test";
import assert from "node:assert/strict";
import { clusterItems, drawingItems, shapeSignature, hashDistance, roomKind, nameSymbol, distinctive } from "../tools/plan_symbols_lib.mjs";

const rect = (x0, y0, x1, y1) => ({ pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true, box: { x0, y0, x1, y1 } });
// A toilet-like block: tank + bowl outline, 40 x 70 cm.
const toilet = (dx, dy) => [rect(dx, dy, dx + 40, dy + 18), rect(dx + 5, dy + 20, dx + 35, dy + 70)];

test("clusters: touching parts join, separate items stay apart", () => {
  const items = [...toilet(0, 0), ...toilet(200, 0)];
  const groups = clusterItems(items, 3);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.length), [2, 2]);
});

test("shape signature: the same block rotated or mirrored hashes alike; size is reported long side first", () => {
  const a = shapeSignature(toilet(0, 0));
  assert.equal(a.w, 70);
  assert.equal(a.h, 40);
  const rotated = toilet(0, 0).map((it) => ({ ...it, pts: it.pts.map((p) => ({ x: p.y, y: p.x })) }));
  const mirrored = toilet(0, 0).map((it) => ({ ...it, pts: it.pts.map((p) => ({ x: -p.x, y: p.y })) }));
  assert.equal(shapeSignature(rotated).hash, a.hash);
  assert.equal(shapeSignature(mirrored).hash, a.hash);
  const bed = [rect(0, 0, 160, 200), rect(10, 5, 75, 40), rect(85, 5, 150, 40)];
  assert.ok(hashDistance(shapeSignature(bed).hash, a.hash) > 14, "a bed does not look like a toilet");
});

test("drawing items: long lines and wall-face lines are dropped", () => {
  const prims = {
    paths: [
      { stroke: [0, 0, 0], subpaths: [{ points: [{ x: 0, y: 0 }, { x: 500, y: 0 }] }] }, // 5 m line: a wall face or dimension
      { stroke: [0, 0, 0], subpaths: [{ points: [{ x: 100, y: 100 }, { x: 140, y: 100 }, { x: 140, y: 170 }], closed: false }] },
      { stroke: [0, 0, 0], subpaths: [{ points: [{ x: 0, y: 300 }, { x: 50, y: 300 }] }] }, // on a wall
    ],
  };
  const items = drawingItems(prims, 1, { onWall: (x, y) => y === 300 });
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].box, { x0: 100, y0: 100, x1: 140, y1: 170 });
});

test("distinctive: lone boxes, lone circles and open line ends are not symbols", () => {
  assert.equal(distinctive(toilet(0, 0)), true, "two closed parts");
  assert.equal(distinctive([rect(0, 0, 60, 60)]), false, "a lone box");
  const circle = { pts: Array.from({ length: 33 }, (_, i) => ({ x: Math.cos(i / 5), y: Math.sin(i / 5) })), closed: true, curved: true };
  assert.equal(distinctive([circle]), false, "a lone circle");
  const ends = [{ pts: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 40 }], closed: false }, { pts: [{ x: 0, y: 50 }, { x: 0, y: 90 }], closed: false }];
  assert.equal(distinctive(ends), false, "wall leftovers");
});

test("naming from size and room", () => {
  assert.equal(roomKind("ח. רחצה"), "bathroom");
  assert.equal(roomKind('ממ"ד'), "bedroom");
  assert.equal(nameSymbol(70, 40, { bathroom: 9 }), "toilet");
  assert.equal(nameSymbol(170, 75, { bathroom: 3, bedroom: 1 }), "bathtub");
  assert.equal(nameSymbol(200, 160, { bedroom: 5 }), "double bed");
  assert.equal(nameSymbol(200, 160, {}), null, "no room, no guess");
});

test("labels from labels.json carry onto the library and every instance", async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { applyLabels, SYMBOL_LABELS } = await import("../tools/plan_symbol_labels.mjs");
  assert.ok(SYMBOL_LABELS.includes("shaft") && SYMBOL_LABELS.includes("unknown"));
  const dir = mkdtempSync(join(tmpdir(), "symlabels-"));
  try {
    writeFileSync(join(dir, "library.json"), JSON.stringify([{ id: "s1", w: 70, h: 40 }, { id: "s2", w: 90, h: 90 }]));
    writeFileSync(join(dir, "labels.json"), JSON.stringify({ s1: { label: "toilet", confidence: 0.9 } }));
    writeFileSync(join(dir, "instances.jsonl"), [{ entry: "s1" }, { entry: "s2" }, { entry: "s9" }].map((r) => JSON.stringify(r)).join("\n") + "\n");
    assert.deepEqual(applyLabels(dir), { entries: 1, instances: 3 });
    const rows = readFileSync(join(dir, "instances_labelled.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(rows.map((r) => r.label), ["toilet", null, null]);
    assert.equal(JSON.parse(readFileSync(join(dir, "library.json"), "utf8"))[0].label, "toilet");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
