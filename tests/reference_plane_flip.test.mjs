import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveOffsetPlanes,referencePlaneOffset } from "../js/core/offset_planes.js";

const modeler = modelerSource();
const strings = readFileSync(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

/* SOLIDWORKS' Plane PropertyManager states an offset as a positive distance and
   a Flip offset box. HOUSING's ThreadPlane (steps 398–401) is .125 in from the
   front rim, flipped into the part. The document keeps one signed offset along
   the parent normal, so the form shows the size and Flip carries the sign. */
test("the reference plane form has Flip offset and stores the sign on the offset", () => {
  assert.match(modeler, /\{key:"offset",label:"Offset distance",type:"number",unit:"length",value:Math\.abs\(existing\?\.offset \?\? 1\.27\)/, "the distance field shows a size");
  assert.match(modeler, /\{key:"flip",label:t\("refPlaneFlipOffset"\),type:"boolean",value:Number\(existing\?\.offset\)<0\}/, "an existing flipped plane opens with Flip checked");
  assert.match(modeler, /plane\.offset=referencePlaneOffset\(values\.offset,flipped\);plane\.refType="offset";/, "typed signed offsets retain direction and Flip reverses it");
  const pair = strings.match(/\n  refPlaneFlipOffset: \["([^"]+)", "([^"]+)"\]/);
  assert.ok(pair && pair[1] && pair[2] === "Flip offset", "Flip offset has Hebrew and English");
});

test("a flipped offset plane from the front rim lands inside the part", () => {
  // The rim of HOUSING faces +Z at z = 3.302 cm; .125 in flipped is 0.3175 cm back along -Z.
  const rim = { type: "topology-reference", kind: "face", persistentId: "rim", descriptor: { surface: "plane", origin: { x: 0, y: 0, z: 3.302 }, normal: { x: 0, y: 0, z: 1 } } };
  const document = { references: [{ id: "plane_thread", type: "plane", refType: "offset", name: "ThreadPlane", support: rim, offset: -0.3175 }], referenceGeometry: [], sketches: [] };
  const run = resolveOffsetPlanes(document, (ref) => (ref?.persistentId === "rim" ? { ...rim } : null));
  assert.ok(run.ok, JSON.stringify(run.issues));
  const plane = document.references[0];
  assert.ok(Math.abs(plane.origin.z - (3.302 - 0.3175)) < 1e-9, "ThreadPlane at z = " + plane.origin.z);
  assert.ok(Math.abs(plane.normal.z - 1) < 1e-9, "the plane keeps the rim's orientation");
});

test('signed datum input preserves direction and Flip reverses explicit direction',()=>{
 assert.equal(referencePlaneOffset(-25),-25);assert.equal(referencePlaneOffset(25,true),-25);assert.equal(referencePlaneOffset(-25,true),25);
 const document={references:[{id:'right',type:'plane',origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}},{id:'middle',type:'plane',baseReferenceId:'right',offset:referencePlaneOffset(-25)}],sketches:[]};
 assert.equal(resolveOffsetPlanes(document).ok,true);assert.equal(document.references[1].origin.x,-25);
 assert.throws(()=>referencePlaneOffset('bad'),/Invalid/);
});
