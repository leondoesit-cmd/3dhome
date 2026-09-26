import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { distSeg } from "../js/geometry.js";
import { autoInfrastructure } from "../js/mep_auto.js";
import { computeMEPFlow, getMEPState, nodePos, runCrossesOpening, runPointY, unconnectedNodes } from "../js/mep.js";

function polyDistance(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    best = Math.min(best, distSeg(p.x, p.z, pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z));
  }
  return best;
}

test("a furnished room roughs in without crossing the door", () => {
  S.nodes = [
    { x: 0, z: 0 },
    { x: 500, z: 0 },
    { x: 500, z: 400 },
    { x: 0, z: 400 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = [{ id: 20, type: "door", wall: 1, s: 250, width: 90, height: 210, sill: 0 }];
  S.items = [{ id: "sink", type: "sink", x: 120, z: 300, w: 60, d: 50 }];
  S.roomMeta = {};
  S.mep = null;

  const res = autoInfrastructure();
  assert.equal(res.ok, true);
  assert.ok(res.nodes > 5);
  assert.ok(res.runs > 3);

  const wallRuns = S.mep.runs.filter((r) => r.layer === "wall");
  assert.ok(wallRuns.length > 0, "the rough-in still uses wall chases");
  for (const run of wallRuns) {
    assert.equal(runCrossesOpening(run), false, run.sys + " " + run.k + " crosses the door");
  }

  assert.equal(unconnectedNodes().length, 0);
  assert.equal(getMEPState().status.deviceIssues, 0);

  const stack = S.mep.nodes.find((n) => n.sys === "drain" && n.k === "stack");
  const wastes = S.mep.runs.filter((r) => r.k === "waste");
  assert.ok(stack);
  assert.ok(wastes.length >= 1);
  const stackP = nodePos(stack);
  for (const run of wastes) {
    assert.ok(run.fall > 0);
    const ys = runPointY(run);
    assert.ok(ys[0] > ys[ys.length - 1], "waste falls along its polyline");
    const start = Math.hypot(run.pts[0].x - stackP.x, run.pts[0].z - stackP.z);
    const end = Math.hypot(run.pts[run.pts.length - 1].x - stackP.x, run.pts[run.pts.length - 1].z - stackP.z);
    assert.ok(end < start, "the low end is the end nearer the stack");
  }

  const cold = S.mep.runs.filter((r) => r.k === "cold");
  const hot = S.mep.runs.filter((r) => r.k === "hot");
  assert.ok(cold.length >= 1);
  assert.ok(hot.length >= 1);
  for (const run of hot) {
    const gaps = run.pts.map((p) => Math.min(...cold.map((c) => polyDistance(p, c.pts))));
    assert.ok(Math.min(...gaps) > 2, "hot water does not sit on the cold pipe");
    assert.ok(gaps.some((g) => g > 3 && g < 8), "hot stays about 5cm beside cold, nearest " + Math.min(...gaps));
  }

  const condensate = S.mep.runs.filter((r) => r.k === "condensate");
  assert.ok(condensate.length >= 1);
  const flow = computeMEPFlow();
  for (const run of condensate) {
    assert.equal(flow[run.id].uphill, false, "condensate falls toward a drain");
  }
});
