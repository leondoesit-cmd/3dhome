// js/measure_cache.js: the live distances both painters draw are measured
// once per pose and scene; a repaint with nothing changed is a lookup.
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { measureSides } from "../js/measure.js";
import { liveClearances, liveClearanceStats } from "../js/measure_cache.js";

function room() {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = []; S.markers = []; S.wallCons = [];
  S.measureTarget = null; S.measureWalls = [];
}

test("repeated paints of an unchanged scene measure once; any change measures again", () => {
  room();
  const sofa = { id: "s", type: "box", x: 200, z: 100, w: 120, d: 60, h: 80, rot: 0 };
  const chair = { id: "c", type: "box", x: 400, z: 100, w: 50, d: 50, h: 80, rot: 0 };
  S.items = [sofa, chair];
  const counts = () => ({ ...liveClearanceStats });
  const c0 = counts();
  const first = liveClearances(sofa);
  for (let i = 0; i < 20; i++) assert.equal(liveClearances(sofa), first); // 2D paint, 3D frame, warning glow...
  let c = counts();
  assert.equal(c.computes - c0.computes, 1);
  assert.equal(c.hits - c0.hits, 20);
  // the same numbers measureSides gives
  assert.deepEqual(first.hits, measureSides(sofa, { target: "nearest", wallIds: [] }));

  const changes = [
    () => { sofa.x += 5; },                         // the piece moved
    () => { chair.x -= 30; },                       // a neighbour moved
    () => { S.nodes[1] = { x: 560, z: 0 }; },       // a wall moved
    () => { S.openings = [{ id: "d", type: "door", wall: 1, s: 350, width: 90, sill: 0, height: 205 }]; },
    () => { S.measureTarget = "wall"; },            // what the plan measures to
    () => { sofa.rot = 90; },
  ];
  changes.forEach((change, i) => {
    const before = counts().computes;
    change();
    const got = liveClearances(sofa);
    assert.equal(counts().computes - before, 1, "change " + i + " measures again");
    assert.equal(liveClearances(sofa), got, "and is cached after it");
  });
  // the selected and the hovered piece alternate in one paint: both stay cached
  const before = counts().computes;
  for (let i = 0; i < 5; i++) { liveClearances(sofa); liveClearances(chair); }
  assert.equal(counts().computes - before, 1);
});

test("verticalReach names what an up / down distance reached", async () => {
  const { verticalReach } = await import("../js/measure_cache.js"); // Node: getLang() is "en"
  S.items = [{ id: "sh", type: "box", name: "Shelf", x: 0, z: 0, w: 10, d: 10, h: 10 }];
  assert.equal(verticalReach({ dir: "up", kind: "ceiling" }), "to ceiling");
  assert.equal(verticalReach({ dir: "down", kind: "floor" }), "off floor");
  assert.equal(verticalReach({ dir: "up", kind: "item", id: "sh" }), "to Shelf");
  assert.equal(verticalReach({ dir: "up", kind: "opening", what: "window" }), "window");
  assert.equal(verticalReach({ dir: "up", kind: "item", id: "gone" }), "");
});

test("a side blocked by a piece still reports the wall past it (nearest mode only)", () => {
  room();
  // a bed against the west wall, a chair 11 cm north of it; the north wall's face is at z 5
  const bed = { id: "b", type: "box", x: 105, z: 200, w: 200, d: 100, h: 50, rot: 0 };
  const chair = { id: "c", type: "box", x: 150, z: 114, w: 50, d: 50, h: 80, rot: 0 };
  S.items = [bed, chair];
  const hits = measureSides(bed, { target: "nearest", wallIds: [] });
  const north = hits.filter((h) => h.dir === hits.find((x) => x.id === "c" && x.kind === "item").dir);
  assert.deepEqual(north.map((h) => h.kind), ["item", "wall"], "the chair first, then the wall behind it");
  assert.equal(Math.round(north[0].gap), 11);
  assert.equal(north[1].behind, true);
  assert.equal(Math.round(north[1].gap), 145); // bed edge z 150 -> wall face z 5
  // walls-only mode: one wall hit per side, never marked `behind`
  assert.ok(measureSides(bed, { target: "wall", wallIds: [] }).every((h) => !h.behind));
});

test("a wall texture (a data: URL) is not part of the clearance scene signature", async () => {
  const { clearanceSceneSig, sceneSigStats } = await import("../js/measure_cache.js");
  room();
  const sofa = { id: "s", type: "box", x: 200, z: 100, w: 120, d: 60, h: 80, rot: 0 };
  S.items = [sofa];
  const plain = liveClearances(sofa);
  const tex = "data:image/jpeg;base64," + "A".repeat(1 << 20); // a 1 MB picture on a wall
  S.walls[0].tex = tex;
  const c0 = { ...liveClearanceStats };
  const chars0 = sceneSigStats.chars;
  const textured = liveClearances(sofa);
  const charsRead = sceneSigStats.chars - chars0;
  console.log("# scene signature read " + charsRead + " characters with a 1 MB wall texture");
  assert.ok(charsRead < 1000, "the texture's characters are not hashed (" + charsRead + ")");
  assert.equal(liveClearanceStats.hits - c0.hits, 1, "a texture-only change still hits the cache");
  assert.equal(textured, plain);
  S.walls[0].tex = "data:image/jpeg;base64," + "B".repeat(1 << 20);
  assert.equal(liveClearances(sofa), plain, "another texture: still the same entry");
  // the same numbers as measuring afresh
  assert.deepEqual(textured.hits, measureSides(sofa, { target: "nearest", wallIds: [] }));
  // but geometry on a textured wall still counts
  const sig = clearanceSceneSig();
  S.walls[0].thickness = 20;
  assert.notEqual(clearanceSceneSig(), sig, "a wall's thickness");
  const before = liveClearanceStats.computes;
  liveClearances(sofa);
  assert.equal(liveClearanceStats.computes - before, 1, "a wall change measures again");
  const sig2 = clearanceSceneSig();
  S.openings = [{ id: "w", type: "window", wall: 1, s: 300, width: 100, sill: 90, height: 120 }];
  assert.notEqual(clearanceSceneSig(), sig2, "an opening");
  const sig3 = clearanceSceneSig();
  S.openings[0].sill = 80;
  assert.notEqual(clearanceSceneSig(), sig3, "an opening's sill");
  S.walls[0].name = "North";
  const sig4 = clearanceSceneSig();
  S.walls[0].name = "South";
  assert.notEqual(clearanceSceneSig(), sig4, "ordinary strings still count");
});
