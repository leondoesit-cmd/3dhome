import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { wallPointAt, wallTangentAt } from "../js/geometry.js";
import { auditApartment, doorClearZones, frontZone, itemBox } from "../js/apartment_rules.js";
import { generationPlan } from "../js/generation_layout.js";
import { apartmentGenerateCommand } from "../js/generator.js";
import { executeCommand } from "../js/commands/executor.js";

test("append puts the new home beyond existing free-standing furniture", () => {
  const state = {nodes: [], items: [{x: 2500, z: 100, w: 100, d: 40, rot: 15}]};
  const layout = generationPlan("small", false, state, 1);
  assert.ok(Math.min(...layout.rooms.map(r => r.x0)) > 2550);
});

test("an oblique desk's bounds and approach are projected in its local frame", () => {
  const desk = {x: 0, z: 0, w: 120, d: 40, rot: 45};
  const c = Math.SQRT1_2;
  const near = (value, want) => assert.ok(Math.abs(value - want) < 1e-5, value + " vs " + want);
  near(itemBox(desk).x1, 80*c);
  const zone = frontZone(desk, 60);
  near(zone.x0, -140*c);
  near(zone.z0, -40*c);
  near(zone.z1, 140*c);
});

test("auditing oblique furniture distinguishes overlapping boxes from touching physical pieces", () => {
  const room = {key: "test", pts:[{x:0,z:0},{x:400,z:0},{x:400,z:400},{x:0,z:400}]};
  const first = {id:1,type:"bench",w:120,d:20,h:45,rot:45,x:100,z:100};
  const other = {...first,id:2,x:80,z:120};
  const state = {items:[first,other],walls:[],openings:[],roomMeta:{}};
  const clashes = () => auditApartment(state,{rooms:[room]}).violations.filter(v => v.rule === "overlap");
  assert.equal(clashes().length, 0);
  other.z -= 20;
  assert.equal(clashes().length, 1);
});

test("both door approaches enclose all four corners on the actual wall curve", () => {
  S.nodes = [{x: 10, z: 10}, {x: 410, z: 240}];
  for (const bulge of [0, 0.28]) {
    const w = {id: 5, a: 0, b: 1, thickness: 22, bulge};
    const op = {wall: 5, width: 90, s: 135};
    const mid = wallPointAt(w, op.s), t = wallTangentAt(w, op.s);
    const zones = doorClearZones(op, [w], 85);
    for (const [i, side] of [1, -1].entries()) for (const u of [-50, 50]) for (const v of [11, 96]) {
      const x = mid.x+t.x*u-t.z*v*side, z = mid.z+t.z*u+t.x*v*side;
      const b = zones[i];
      assert.ok(x >= b.x0-1e-6 && x <= b.x1+1e-6 && z >= b.z0-1e-6 && z <= b.z1+1e-6);
    }
  }
});

test("generated service rooms have fixtures for their intended use", () => {
  for (const [type, fixture] of [["wc","toilet"], ["laundry","washer"], ["closet","wardrobe"], ["storage","bookshelf"]]) {
    const result = executeCommand(apartmentGenerateCommand,
      { size:"small", seed:7, replace:true, infrastructure:false, openings:false,
        requirements:[{ type, width:280, depth:260 }] }, { domain:"planner", state:S }, { history:false });
    assert.ok(result.ok, result.reason);
    assert.ok(S.items.some(it => it.type === fixture), type + " needs " + fixture);
    if (type === "wc") assert.ok(S.items.every(it => it.type !== "shower"));
  }
});

test("a compact kitchen puts preparation space between sink and hob, with the fridge on another wall", () => {
  const result = executeCommand(apartmentGenerateCommand, { size:"small", seed:8, replace:true,
    infrastructure:false, openings:false, requirements:[{ type:"kitchen", width:250, depth:250 }] },
    { domain:"planner", state:S }, { history:false });
  assert.ok(result.ok, result.reason);
  const units = S.items.filter(it => ["fridge","sink","base","cooktop"].includes(it.type));
  const prep = units.find(it => it.type === "base");
  assert.ok(prep, "a 200 cm worktop fits");
  const axis = prep.rot % 180 === 0 ? "x" : "z";
  for (const unit of units.filter(it => it.type === "cooktop" || it.type === "sink")) {
    assert.equal(unit.rot, prep.rot);
    assert.ok(Math.abs(Math.abs(unit[axis] - prep[axis]) - (unit.w + prep.w)/2) < 0.01);
  }
  assert.notEqual(units.find(it => it.type === "fridge").rot, prep.rot);
});
