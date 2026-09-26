import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSEMBLY_ORIGIN_ID, componentTopology, composePlacement, containsAssembly, flattenAssembly,
  resolveComponentPath, subassemblyComponent,
} from "../js/core/assembly_structure.js";
import { solveAssemblyMates } from "../js/cad_mate_solver.js";
import { topologyReference, worldFrame } from "../js/cad_mate_model.js";

/* A part whose rebuilt topology has one planar face: its front face at z = 1,
   facing +z. Enough to mate against. */
function part(id, fields = {}) {
  return {
    id, name: id, transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }, ...fields,
    topology: [{ persistentId: "face:front", kind: "face", descriptor: { surface: "plane", origin: { x: 0, y: 0, z: 1 }, normal: { x: 0, y: 0, z: 1 } } }],
  };
}

const coincident = (id, a, b) => ({ id, type: "coincident", a, b });
// reference planes mate Aligned, the SOLIDWORKS default for planes
const alignedPlanes = (id, a, b) => ({ id, type: "coincident", aligned: true, a, b });
const plane = (componentId, id, normal) => topologyReference(componentId, "face", id, { surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal });

/* LENSANDBULB-like: LENS at the origin, BULB turned 90° about y and moved. */
function lensAndBulb() {
  return {
    key: "asm_lab", name: "LENSANDBULB",
    components: [
      part("lens", { grounded: true }),
      part("bulb", { transform: { x: 5, y: 0, z: 0, rx: 0, ry: 90, rz: 0 } }),
    ],
    mates: [],
  };
}

test("a sub-assembly presents its children's faces in its own space, namespaced by path, and its own planes", () => {
  const sub = subassemblyComponent(lensAndBulb(), { id: "lab" });
  const topology = componentTopology(sub, (component) => component.topology);
  const ids = topology.map((entry) => entry.persistentId);
  for (const id of ["plane:front", "plane:top", "plane:right", "lens/face:front", "bulb/face:front", "bulb/plane:right"]) assert.ok(ids.includes(id), id);
  const bulbFace = topology.find((entry) => entry.persistentId === "bulb/face:front").descriptor;
  // turned 90° about y: +z becomes +x, and the face at z = 1 lands at x = 5 + 1
  assert.ok(Math.abs(bulbFace.normal.x - 1) < 1e-9 && Math.abs(bulbFace.normal.z) < 1e-9, JSON.stringify(bulbFace.normal));
  assert.ok(Math.abs(bulbFace.origin.x - 6) < 1e-9, JSON.stringify(bulbFace.origin));
  assert.deepEqual(resolveComponentPath(sub, "bulb/face:front").chain.map((c) => c.id), ["lab", "bulb"]);
});

test("the parent's mates move a sub-assembly as one rigid body, onto a face inside it (book step 158)", () => {
  const sub = subassemblyComponent(lensAndBulb(), { id: "lab", transform: { x: 30, y: 7, z: -4, rx: 0, ry: 0, rz: 0 } });
  const cap = part("cap", { grounded: true });
  const top = { components: [cap, sub], topologyMates: [
    // cap front face against the BULB's front face, which lives inside LENSANDBULB
    coincident("m1", topologyReference("cap", "face", "face:front", cap.topology[0].descriptor), topologyReference("lab", "face", "bulb/face:front", {})),
    alignedPlanes("m2", plane("cap", "plane:top", { x: 0, y: 1, z: 0 }), plane("lab", "plane:top", { x: 0, y: 1, z: 0 })),
  ] };
  const before = structuredClone(sub.asm.components.map((c) => c.transform));
  const result = solveAssemblyMates(top);
  assert.equal(result.ok, true, JSON.stringify(result));
  // the children never moved inside the sub-assembly
  assert.deepEqual(sub.asm.components.map((c) => ({ x: c.transform.x, y: c.transform.y, z: c.transform.z })), before.map((t) => ({ x: t.x, y: t.y, z: t.z })));
  // and the BULB's face now sits on the cap's face plane, facing it
  const bulbFace = componentTopology(sub, (c) => c.topology).find((e) => e.persistentId === "bulb/face:front").descriptor;
  const world = worldFrame(bulbFace, sub, "component");
  assert.ok(Math.abs(world.origin.z - 1) < 1e-6, "on the cap face plane: " + JSON.stringify(world.origin));
  assert.ok(Math.abs(Math.abs(world.normal.z) - 1) < 1e-6, JSON.stringify(world.normal));
});

test("a sub-assembly's planes mate to the assembly's own planes (book steps 162–166)", () => {
  const sub = subassemblyComponent(lensAndBulb(), { id: "lab", transform: { x: 3, y: -2, z: 9, rx: 20, ry: 0, rz: 0 } });
  const top = { components: [sub], topologyMates: [
    alignedPlanes("f", plane(ASSEMBLY_ORIGIN_ID, "plane:front", { x: 0, y: 0, z: 1 }), plane("lab", "plane:front", { x: 0, y: 0, z: 1 })),
    alignedPlanes("t", plane(ASSEMBLY_ORIGIN_ID, "plane:top", { x: 0, y: 1, z: 0 }), plane("lab", "plane:top", { x: 0, y: 1, z: 0 })),
    alignedPlanes("r", plane(ASSEMBLY_ORIGIN_ID, "plane:right", { x: 1, y: 0, z: 0 }), plane("lab", "plane:right", { x: 1, y: 0, z: 0 })),
  ] };
  const result = solveAssemblyMates(top);
  assert.equal(result.ok, true, JSON.stringify(result));
  const t = sub.transform;
  for (const key of ["x", "y", "z"]) assert.ok(Math.abs(t[key]) < 1e-6, key + " " + t[key]);
  assert.equal(top.components.length, 1, "the origin is virtual — never added to the document");
});

test("flattening lists every part occurrence with its composed placement; nesting cannot recurse", () => {
  const lab = subassemblyComponent(lensAndBulb(), { id: "lab", transform: { x: 10, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } });
  const capAndLens = { key: "asm_cal", name: "CAPANDLENS", components: [part("cap"), lab], mates: [] };
  const flat = flattenAssembly(capAndLens);
  assert.deepEqual(flat.map((row) => row.path.join(">")), ["cap", "lab>lens", "lab>bulb"]);
  const bulb = flat.find((row) => row.component.id === "bulb");
  assert.ok(Math.abs(bulb.placement.origin.x - 15) < 1e-9, JSON.stringify(bulb.placement.origin));
  assert.ok(Math.abs(bulb.placement.z.x - 1) < 1e-9, "the bulb's z axis points along x");
  assert.equal(containsAssembly(capAndLens, "asm_lab"), true);
  assert.equal(containsAssembly(capAndLens, "asm_other"), false);
  lab.visible = false;
  assert.deepEqual(flattenAssembly(capAndLens, { visibleOnly: true }).map((row) => row.component.id), ["cap"]);
  assert.equal(composePlacement([]).origin.x, 0);
});
