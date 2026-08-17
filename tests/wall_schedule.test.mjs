import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { wallSchedule, wallScheduleCSV } from "../js/wall_schedule.js";

test("wall schedule subtracts openings and groups by phase and type", () => {
  S.nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }];
  S.walls = [{ id: 1, a: 0, b: 1, thickness: 20, height: 300, wallTypeId: "block", phase: "existing", kind: "normal" }];
  S.openings = [{ id: 2, wall: 1, width: 100, height: 200, s: 200 }];
  S.wallTypes = [{ id: "block", name: "Block wall", layers: [{ thickness: 20 }] }];
  const out = wallSchedule(S);
  assert.equal(out.rows[0].grossAreaM2, 12);
  assert.equal(out.rows[0].netAreaM2, 10);
  assert.equal(out.groups[0].phase, "existing");
  assert.match(wallScheduleCSV(out), /Block wall/);
});
