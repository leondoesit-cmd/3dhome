import test from "node:test";
import assert from "node:assert/strict";
import {
  groupFramingQuantities,
  wallFraming,
  wallFramingTakeoff,
} from "../js/wall_framing.js";

const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is near ${expected}`);

function project(walls, openings = []) {
  return {
    nodes: [{ x: 0, z: 0 }, { x: 300, z: 0 }],
    walls,
    openings,
    wallTypes: [{
      id: "framed",
      name: "Framed wall",
      layers: [{
        id: "frame",
        role: "core",
        main: true,
        thickness: 10,
        material: "cavity",
        framing: { material: "timber", spacing: 60, studWidth: 5, plateHeight: 5 },
      }],
    }],
  };
}

test("straight wall framing follows authored on-centre spacing and layer depth", () => {
  const wall = { id: 1, a: 0, b: 1, wallTypeId: "framed", height: 270 };
  const result = wallFraming(project([wall]), wall);
  assert.equal(result.length, 300);
  assert.deepEqual(result.studs.map(member => member.s), [0, 60, 120, 180, 240, 300]);
  assert.equal(result.plates.length, 2);
  assert.ok(result.members.every(member => member.material === "timber"));
  assert.ok(result.members.every(member => member.depth === 10));
  assert.equal(result.quantities.find(group => group.kind === "stud").count, 6);
});

test("doors replace interrupted studs with king/jack studs and a header", () => {
  const wall = { id: 2, a: 0, b: 1, wallTypeId: "framed", height: 270 };
  const state = project([wall], [{ id: 8, wall: 2, type: "door", s: 150, width: 90, height: 210, sill: 0 }]);
  const result = wallFraming(state, wall);
  assert.equal(result.headers.length, 1);
  assert.equal(result.headers[0].length, 110);
  assert.equal(result.studs.filter(member => member.kind === "kingStud").length, 2);
  assert.equal(result.studs.filter(member => member.kind === "jackStud").length, 2);
  assert.ok(!result.studs.some(member => member.kind === "stud" && (member.s === 120 || member.s === 180)));
  assert.equal(result.plates.filter(member => member.kind === "bottomPlate").length, 2, "the door splits the bottom plate");
});

test("a second jack stud moves the king and lengthens the header", () => {
  const wall = { id: 2, a: 0, b: 1, wallTypeId: "framed", height: 270 };
  const state = project([wall], [{ id: 8, wall: 2, type: "door", s: 150, width: 90, height: 210, sill: 0 }]);
  state.wallTypes[0].layers[0].framing.jackStudCount = 2;
  const result = wallFraming(state, wall);
  assert.equal(result.studs.filter(member => member.kind === "jackStud").length, 4);
  assert.equal(result.headers[0].length, 120);
  const kings = result.studs.filter(member => member.kind === "kingStud").map(member => member.s).sort((a, b) => a - b);
  near(kings[0], 92.5);
  near(kings[1], 207.5);
});

test("windows receive a sill and cripple studs while retaining the bottom plate", () => {
  const wall = { id: 3, a: 0, b: 1, wallTypeId: "framed", height: 270 };
  const state = project([wall], [{ id: 9, wall: 3, type: "window", s: 150, width: 90, height: 100, sill: 90 }]);
  const result = wallFraming(state, wall);
  assert.equal(result.sills.length, 1);
  assert.equal(result.headers.length, 1);
  assert.equal(result.plates.filter(member => member.kind === "bottomPlate").length, 1);
  assert.ok(result.studs.some(member => member.kind === "crippleStud" && member.bottom < 90));
  assert.ok(result.studs.some(member => member.kind === "crippleStud" && member.bottom >= 190));
});

test("curved wall stud stations use arc length and expose local frames", () => {
  const wall = { id: 4, a: 0, b: 1, wallTypeId: "framed", height: 270, bulge: 1 };
  const state = project([wall]);
  state.nodes = [{ x: -100, z: 0 }, { x: 100, z: 0 }];
  const result = wallFraming(state, wall);
  near(result.length, Math.PI * 100);
  assert.equal(result.studs[1].s, 60);
  assert.ok(result.studs.at(-1).s > 300, "the last stud lands at the measured arc end");
  near(Math.hypot(result.studs[1].point.x, result.studs[1].point.z), 100);
  near(Math.hypot(result.studs[1].tangent.x, result.studs[1].tangent.z), 1);
});

test("take-off groups member count, length and volume by phase/material/kind", () => {
  const walls = [
    { id: 5, a: 0, b: 1, wallTypeId: "framed", height: 270, phase: "new" },
    { id: 6, a: 0, b: 1, wallTypeId: "framed", height: 270, phase: "existing" },
  ];
  const state = project(walls);
  const takeoff = wallFramingTakeoff(state);
  assert.equal(takeoff.walls.length, 2);
  assert.equal(takeoff.totals.count, takeoff.members.length);
  near(takeoff.totals.volume, takeoff.members.reduce((sum, member) => sum + member.volume, 0));
  assert.ok(takeoff.quantities.some(group => group.phase === "new" && group.kind === "stud"));
  assert.ok(takeoff.quantities.some(group => group.phase === "existing" && group.material === "timber"));

  const regrouped = groupFramingQuantities(takeoff.members);
  assert.deepEqual(regrouped, takeoff.quantities);
});

test("non-physical room dividers have no framing", () => {
  const wall = { id: 7, a: 0, b: 1, wallTypeId: "framed", height: 270, kind: "roomDivider" };
  const result = wallFraming(project([wall]), wall);
  assert.equal(result.members.length, 0);
  assert.equal(result.totals.volume, 0);
});
