/* drawMEP()'s per-paint shortcuts (docs/perf_review_fixes.md 5.2): the
   visibility checks read the one ensureMEP() of the paint, and device
   positions are computed once per paint. Neither may change what is drawn. */
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { addRun, addNode, ensureMEP, nodePos } from "../js/mep.js";
import { withNodePosMemo } from "../js/mep/topology.js";
import { drawMEP } from "../js/mep/clashes.js";
import { recorder } from "./helpers/canvas_recorder.mjs";

function scene() {
  S.nodes = [{ x: 0, z: 0 }, { x: 800, z: 0 }, { x: 800, z: 600 }, { x: 0, z: 600 }];
  S.walls = [0, 1, 2, 3].map((i) => ({ id: i + 1, a: i, b: (i + 1) % 4, thickness: 10, height: 270 }));
  S.openings = []; S.items = []; S.mep = null; S.sel = null;
  addNode("power", "panel", 0, 100, 4, 100, "wall");
  addNode("power", "outlet", 300, 0, 1, 300, "wall");
  addNode("water", "sink", 400, 300, null, null, "floor");
  addRun("power", "circuit", [{ x: 0, z: 100 }, { x: 0, z: 0 }, { x: 300, z: 0 }], null, null, "wall");
  addRun("water", "cold", [{ x: 50, z: 50 }, { x: 400, z: 50 }, { x: 400, z: 300 }], null, null, "floor");
  addRun("drain", "waste", [{ x: 100, z: 20 }, { x: 100, z: 400 }], null, null, "ceiling");
  return ensureMEP();
}
const sx = (x) => x * 0.5 + 10, sz = (z) => z * 0.5 + 20;
const paint = () => { const r = recorder(); drawMEP(r.ctx, sx, sz, null, 7, 0); return r.log; };

test("a device's position from the memo is the one computed without it, and stays unshared", () => {
  const m = scene();
  const plain = m.nodes.map((n) => nodePos(n));
  withNodePosMemo(() => {
    const a = m.nodes.map((n) => nodePos(n)), b = m.nodes.map((n) => nodePos(n));
    assert.deepEqual(a, plain);
    assert.deepEqual(b, plain);
    a[0].x = 1e9; // a caller changing its copy
    assert.deepEqual(nodePos(m.nodes[0]), plain[0]);
  });
  S.walls[0].a = 1; // the memo ended with the call: a moved wall is seen again
  assert.notDeepEqual(nodePos(m.nodes[1]), plain[1]);
});

test("a hidden system or plane is drawn exactly as if it were absent", () => {
  let m = scene();
  m.vis.water = false;
  const hidden = paint();
  m = scene();
  m.runs = m.runs.filter((r) => r.sys !== "water");
  m.nodes = m.nodes.filter((n) => n.sys !== "water");
  assert.deepEqual(hidden, paint());
  // a hidden plane: its runs and devices go, as if absent
  m = scene();
  const lay = m.runs.find((r) => r.sys === "drain").layer;
  m.layerVis[lay] = false;
  const noPlane = paint();
  m = scene();
  m.runs = m.runs.filter((r) => r.layer !== lay);
  m.nodes = m.nodes.filter((n) => n.layer !== lay);
  assert.deepEqual(noPlane, paint());
});
