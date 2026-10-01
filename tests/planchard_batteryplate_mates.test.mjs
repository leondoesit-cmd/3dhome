import test from "node:test";
import assert from "node:assert/strict";
import { solveTopologyMates, topologyReference } from "../js/cad_mates.js";
import { apply, rotationOf } from "../js/cad_mate_model.js";

const origin = { x: 0, y: 0, z: 0 };
const X = { x: 1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const minusY = { x: 0, y: -1, z: 0 };
const plane = (point, normal) => ({ surface: "plane", origin: point, normal });
const cylinder = (point, axis) => ({ surface: "cylinder", origin: point, axis, radius: 2 });
const ref = (component, id, frame) => topologyReference(component, "face", id, frame);

function batteryAndPlate() {
  return {
    components: [
      { id: "battery", grounded: true, transform: { x: 0, y: 0, z: 0 } },
      { id: "plate", transform: { x: 0, y: 10, z: 0 } },
    ],
    topologyMates: [
      // Chapter 8, steps 88–98: outside bottom to battery top, Right planes,
      // then terminal cylinder to the holder cylinder.
      { id: "bottom-to-top", type: "coincident",
        a: ref("battery", "top-face", plane({ x: 0, y: 5, z: 0 }, Y)),
        b: ref("plate", "bottom-face", plane(origin, minusY)) },
      { id: "right-planes", type: "coincident", aligned: true,
        a: ref("battery", "plane:right", plane(origin, X)),
        b: ref("plate", "plane:right", plane(origin, X)) },
      { id: "terminal-holder", type: "concentric",
        a: ref("battery", "terminal", cylinder({ x: 0, y: 5, z: 0 }, Y)),
        b: ref("plate", "holder", cylinder(origin, minusY)) },
    ],
  };
}

test("Chapter 8 battery and plate mates accept oppositely directed cylinder axes", () => {
  const assembly = batteryAndPlate();
  const first = solveTopologyMates(assembly);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.unsatisfied.length, 0);
  assert.equal(first.degreesOfFreedom, 0, "the Right Plane face mate locks the final roll");
  assert.ok(Math.abs(assembly.components[1].transform.y - 5) < 1e-5);
  assert.ok(Math.abs(assembly.components[1].transform.rx) < 1e-5);
  assert.ok(Math.abs(assembly.components[1].transform.ry) < 1e-5);
  assert.ok(Math.abs(assembly.components[1].transform.rz) < 1e-5);

  const settled = JSON.stringify(assembly.components[1].transform);
  assert.equal(solveTopologyMates(assembly).ok, true);
  assert.equal(JSON.stringify(assembly.components[1].transform), settled,
    "rebuilding a solved assembly must not flip the plate");
});

test("Align X leaves the batteryplate free to roll; Right Plane Coincident locks it", () => {
  const assembly = batteryAndPlate();
  const rightPlane = assembly.topologyMates.splice(1, 1)[0];
  assembly.mates = [{ id: "align-centres-x", type: "alignX", a: "battery", b: "plate" }];
  const aligned = solveTopologyMates(assembly);
  assert.equal(aligned.ok, true, JSON.stringify(aligned));
  assert.equal(aligned.degreesOfFreedom, 1,
    "Align X aligns origins along one axis but does not orient reference planes");
  assembly.mates = [];
  assembly.topologyMates.splice(1, 0, rightPlane);
  const planed = solveTopologyMates(assembly);
  assert.equal(planed.ok, true, JSON.stringify(planed));
  assert.equal(planed.degreesOfFreedom, 0);
});

test("a directed screw mate still aligns axes for its signed advance", () => {
  const assembly = batteryAndPlate();
  assembly.topologyMates = [
    { ...assembly.topologyMates[2], type: "screw", pitch: 1, turns: 0 },
  ];
  const result = solveTopologyMates(assembly);
  assert.equal(result.ok, true, JSON.stringify(result));
  const holderAxis = apply(rotationOf(assembly.components[1].transform), minusY);
  assert.ok(Math.abs(holderAxis.y - 1) < 1e-5);
});
