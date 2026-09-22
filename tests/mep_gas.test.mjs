import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { addNode, addRun, computeMEPClashes, computeMEPFlow, getMEPState, nodePos } from "../js/mep.js";
import { distSeg, detectRooms } from "../js/geometry.js";
import { autoInfrastructure } from "../js/mep_auto.js";

function box() {
  S.nodes = [
    { x: 0, z: 0 },
    { x: 400, z: 0 },
    { x: 400, z: 300 },
    { x: 0, z: 300 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = [{ id: 20, type: "door", wall: 1, s: 200, width: 90, height: 210, sill: 0 }];
  S.items = [];
  S.roomMeta = {};
  S.mep = null;
}

test("gas leaves the meter, does not fall, and refuses a ceiling or a bedroom", () => {
  box();
  const meter = addNode("gas", "meter", 0, 0, 1, 40, "wall");
  addNode("gas", "valve", 300, 0, 1, 300, "wall");
  const pipe = addRun("gas", "pipe", [{ x: 40, z: 0 }, { x: 300, z: 0 }], meter.id, null, "ceiling");
  assert.equal(pipe.layer, "floor", "a ceiling is not a legal gas plane");
  const flow = computeMEPFlow()[pipe.id];
  assert.equal(flow.flow, "supply");
  assert.equal(flow.dir, 1, "gas leaves the meter");
  assert.equal(flow.uphill, false, "gas is pressurized and does not need a fall");
  assert.equal(flow.bedroom, false);

  addRun("power", "circuit", [{ x: 40, z: 0 }, { x: 300, z: 0 }], null, null, "floor");
  assert.equal(computeMEPClashes().some((c) => c.sysA === "gas" || c.sysB === "gas"), true);

  S.items = [{ id: "bed", type: "bed", x: 200, z: 150 }];
  const across = addRun("gas", "pipe", [{ x: 40, z: 150 }, { x: 360, z: 150 }], null, null, "floor");
  const along = addRun("gas", "pipe", [{ x: 40, z: 0 }, { x: 360, z: 0 }], null, null, "floor");
  const again = computeMEPFlow();
  assert.equal(again[across.id].bedroom, true, "a pipe across the bedroom is refused");
  assert.equal(again[along.id].bedroom, false, "a pipe on the wall line is not inside the room");

  S.items = [];
  S.roomMeta = {};
  const clip = addRun("gas", "pipe", [{ x: 200, z: -40 }, { x: 200, z: 40 }], null, null, "floor");
  assert.equal(getMEPState().flow[clip.id].bedroom, false);
  S.roomMeta[detectRooms()[0].key] = { roomType: "kidsRoom", name: "North" };
  assert.equal(getMEPState().flow[clip.id].bedroom, true, "a child's room counts, and the cache sees the type");
});

function nearest(run, others) {
  let best = Infinity;
  for (const p of run.pts) {
    for (const o of others) {
      for (let i = 1; i < o.pts.length; i++) {
        best = Math.min(best, distSeg(p.x, p.z, o.pts[i - 1].x, o.pts[i - 1].z, o.pts[i].x, o.pts[i].z));
      }
    }
  }
  return best;
}

test("a cooktop gets a meter, a shutoff, and a supply pipe", () => {
  box();
  S.items = [
    { id: "hob", type: "cooktop", x: 80, z: 40 },
    { id: "sink", type: "sink", x: 200, z: 40 },
  ];
  const res = autoInfrastructure();
  assert.equal(res.ok, true);
  const meter = S.mep.nodes.find((n) => n.sys === "gas" && n.k === "meter");
  const valve = S.mep.nodes.find((n) => n.sys === "gas" && n.k === "valve");
  const pipes = S.mep.runs.filter((r) => r.sys === "gas" && r.k === "pipe");
  const cold = S.mep.runs.filter((r) => r.k === "cold");
  assert.ok(meter);
  assert.ok(valve);
  assert.ok(pipes.length >= 1);
  assert.ok(cold.length >= 1);
  const at = nodePos(valve);
  assert.ok(Math.hypot(at.x - 80, at.z - 40) < 90, "shutoff stays by the cooktop, at " + at.x + "," + at.z);
  assert.ok(pipes.every((r) => r.layer !== "ceiling"));
  assert.ok(nearest(pipes[0], cold) > 4, "gas does not sit on the cold pipe");
  const flow = computeMEPFlow()[pipes[0].id];
  assert.equal(flow.flow, "supply");
  assert.equal(flow.alive, true);
  assert.equal(flow.uphill, false);
});
