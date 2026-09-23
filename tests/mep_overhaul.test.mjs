import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import * as THREE from "../vendor/three/three.module.js";
import { detectRooms } from "../js/geometry.js";
import { autoInfrastructure } from "../js/mep_auto.js";
import { loadMEP, deviceSurfacePosition, nodePos, getMEPState, addRun, buildMEP3D } from "../js/mep.js";
import { validateMEPModel } from "../js/mep_validate.js";
import { GENERIC_RESIDENTIAL_PROFILE, registerMEPProfile } from "../js/mep_profile.js";

test("under-floor X-ray renders pipes as visible inspection guides without changing their diameter", () => {
  S.nodes = []; S.walls = []; S.openings = []; S.items = []; S.mep = null;
  const run = addRun("water", "cold", [{ x: 0, z: 0 }, { x: 200, z: 0 }], null, null, "floor");
  const designDiameter = run.dia;
  S.mep.xray.floor = true;
  const group = new THREE.Group();
  buildMEP3D(group, THREE);
  const pipe = group.children.find(child => child.type === "Mesh");
  assert.ok(pipe);
  assert.equal(pipe.material.type, "MeshBasicMaterial");
  assert.equal(pipe.material.depthTest, false);
  assert.equal(pipe.renderOrder, 20);
  assert.equal(run.dia, designDiameter);
});

test("coincident ceiling fixtures retain separate switched connections and missing wires fail", () => {
  furnishedRoom();
  S.items.push({id:"pendant",type:"pendant",x:250,z:200,w:30,d:30});
  autoInfrastructure();
  for (const item of S.items.filter(i=>i.type!=="sink")) {
    const node = S.mep.nodes.find(n=>n.itemId===item.id);
    assert.ok(node?.switchId);
    assert.ok(S.mep.runs.some(r=>r.explicit && r.b===node.id && r.a===node.switchId));
  }
  assert.equal(validateMEPModel(S.mep,S.items).ok,true);
  S.mep.runs = [];
  assert.ok(validateMEPModel(S.mep,S.items).issues.some(i=>i.code==="BROKEN_CIRCUIT_PATH"));
  assert.ok(getMEPState().status.deviceIssues > 0);
});

test("wall plates clear the wall finish and explicit wiring survives load", () => {
  furnishedRoom(); autoInfrastructure();
  const socket=S.mep.nodes.find(n=>n.k==="outlet");
  const p=nodePos(socket), face=deviceSurfacePosition(socket);
  assert.ok(Math.hypot(face.x-p.x,face.z-p.z)>5);
  const saved=structuredClone(S.mep);
  loadMEP(saved);
  assert.deepEqual(S.mep.runs.filter(r=>r.explicit).map(r=>[r.a,r.b]),saved.runs.filter(r=>r.explicit).map(r=>[r.a,r.b]));
  assert.equal(validateMEPModel(S.mep,S.items).ok,true);
});

test("custom profiles drive circuit limits, loads, pipe sizes and slopes", () => {
  registerMEPProfile({id:"review-test",version:1,electrical:{maxSocketsPerCircuit:1,defaultOutletLoadW:400,defaultLightLoadW:50},plumbing:{coldDiameterCm:3,hotDiameterCm:2.5,wasteDiameterCm:9,wasteFall:0.03}});
  furnishedRoom(); autoInfrastructure({profileId:"review-test"});
  assert.ok(S.mep.circuits.filter(c=>c.kind==="general-outlets").every(c=>c.deviceIds.length<=1 && c.estimatedLoadW===400));
  assert.ok(S.mep.circuits.some(c=>c.kind==="lighting" && c.estimatedLoadW===50));
  assert.ok(S.mep.runs.filter(r=>r.k==="cold").every(r=>r.dia===3));
  for(const r of S.mep.runs.filter(r=>r.k==="waste")) {
    const length=r.pts.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-r.pts[i].x,p.z-r.pts[i].z),0);
    assert.equal(r.dia,9); assert.ok(Math.abs(r.fall-length*0.03)<1e-8);
  }
  assert.throws(()=>registerMEPProfile({id:"bad",version:1,electrical:{maxLightsPerCircuit:0}}));
});

function furnishedRoom() {
  S.nodes = [{x:0,z:0},{x:500,z:0},{x:500,z:400},{x:0,z:400}];
  S.walls = [
    {id:1,a:0,b:1,thickness:10,height:270},{id:2,a:1,b:2,thickness:10,height:270},
    {id:3,a:2,b:3,thickness:10,height:270},{id:4,a:3,b:0,thickness:10,height:270},
  ];
  S.openings = [{id:20,type:"door",wall:1,s:250,width:90,height:210,sill:0}];
  S.items = [
    {id:"lamp",type:"ceilingLight",x:250,z:200,w:30,d:30},
    {id:"sink",type:"sink",x:120,z:330,w:60,d:50},
  ];
  S.roomMeta = {};
  S.mep = null;
}

test("generated infrastructure binds fixtures and persists explicit topology", () => {
  furnishedRoom();
  const result = autoInfrastructure();
  assert.equal(result.ok, true);
  assert.deepEqual(S.mep.profile, {id:"generic-residential",version:1,certified:false});
  const light = S.mep.nodes.find(n => n.itemId === "lamp");
  assert.ok(light && light.circuitId && light.sourceId);
  assert.equal(S.items[0].mepNodeId, light.id);
  assert.ok(S.mep.circuits.some(c => c.id === light.circuitId && c.deviceIds.includes(light.id)));
  const fixture = S.mep.nodes.find(n => n.sys === "water" && n.itemId === "sink");
  assert.ok(fixture && fixture.branchId && fixture.sourceId);
  assert.ok(S.mep.runs.some(r => r.layer === "floor" && r.branchId));
  assert.equal(validateMEPModel(S.mep, S.items, GENERIC_RESIDENTIAL_PROFILE).issues.some(i => i.code === "UNBOUND_LIGHT_FIXTURE"), false);
});

test("append rough-in leaves the existing network byte-for-byte unchanged", () => {
  furnishedRoom();
  autoInfrastructure();
  const nodeCount = S.mep.nodes.length, runCount = S.mep.runs.length;
  const beforeNodes = JSON.stringify(S.mep.nodes);
  const beforeRuns = JSON.stringify(S.mep.runs);
  const result = autoInfrastructure({rooms:detectRooms(), replace:false});
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(S.mep.nodes.slice(0, nodeCount)), beforeNodes);
  assert.equal(JSON.stringify(S.mep.runs.slice(0, runCount)), beforeRuns);
});

test("legacy geometric networks migrate to inferred explicit circuits", () => {
  furnishedRoom();
  loadMEP({nodes:[
    {id:1,sys:"power",k:"panel",layer:"wall",x:0,z:0,elev:150},
    {id:2,sys:"power",k:"outlet",layer:"wall",x:100,z:0,elev:30},
  ],runs:[{id:3,sys:"power",k:"circuit",layer:"wall",pts:[{x:0,z:0},{x:100,z:0}]}]});
  assert.equal(S.mep.circuits.length, 1);
  assert.equal(S.mep.circuits[0].inferred, true);
  assert.equal(S.mep.nodes.find(n => n.id === 2).sourceId, 1);
});
