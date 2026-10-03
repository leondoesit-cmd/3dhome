import test from 'node:test';
import assert from 'node:assert/strict';
import { solveTopologyMates, topologyReference } from '../js/cad_mates.js';
import { worldFrame } from '../js/cad_mate_model.js';
import { createMotionStudy, addScrewMotor, evaluateMotionStudy } from '../js/cad_motion_study.js';

const T = (x = 0, y = 0, z = 0) => ({ x, y, z, rx: 0, ry: 0, rz: 0 });
const p = (x, y, z = 0) => ({ x, y, z });
const ax = p(0, 0, 1);
const ref = (part, id, origin, axis) => topologyReference(part, 'face', id,
  { surface: 'cylinder', origin, axis, radius: 0.25 });
const face = (part, id, origin, normal) => topologyReference(part, 'face', id,
  { surface: 'plane', origin, normal });
const hinge = (id, a, b, point, axis) => [
  { id: `${id}-axis`, type: 'concentric', a: ref(a, `${id}-a`, point, axis), b: ref(b, `${id}-b`, point, axis) },
  { id: `${id}-axial`, type: 'coincident', aligned: true,
    a: face(a, `${id}-face-a`, point, axis), b: face(b, `${id}-face-b`, point, axis) },
];

test('opt-in coupled screw has one freedom, drives signed travel, and survives JSON reopen', () => {
  const nut = { id: 'nut', grounded: true, transform: T() };
  const shaft = { id: 'shaft', transform: T() };
  const mate = { id: 'helix', type: 'screw', pitch: 0.4, coupledMotion: true,
    a: ref('nut', 'bore', p(0, 0), ax), b: ref('shaft', 'thread', p(0, 0), ax) };
  const assembly = { components: [nut, shaft], topologyMates: [mate] };
  let result = solveTopologyMates(assembly);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.degreesOfFreedom, 1);
  assert.equal(mate.coupledAxial0, 0);
  assert.ok(Number.isFinite(mate.coupledPhase0));

  for (const turns of [0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25, 0, -0.25, -0.5, -0.75, -1, -1.25, -1.5, -1.75, -2]) {
    mate.driveTurns = turns;
    result = solveTopologyMates(assembly);
    assert.equal(result.ok, true, `${turns}: ${JSON.stringify(result)}`);
    assert.equal(result.degreesOfFreedom, 0);
    const frame = worldFrame(mate.b.frame, shaft, 'component');
    assert.ok(Math.abs(frame.origin.z - 0.4 * turns) < 1e-5, `${turns}: ${frame.origin.z}`);
  }

  const reopened = structuredClone(JSON.parse(JSON.stringify(assembly)));
  reopened.topologyMates[0].driveTurns = -1;
  result = solveTopologyMates(reopened);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(Math.abs(reopened.components[1].transform.z + 0.4) < 1e-5);
  delete reopened.topologyMates[0].driveTurns;
  result = solveTopologyMates(reopened);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.degreesOfFreedom, 1);
});

test('legacy prescribed screw still uses its saved turns', () => {
  const assembly = { components: [{ id: 'nut', grounded: true, transform: T() }, { id: 'shaft', transform: T() }],
    topologyMates: [{ id: 'old', type: 'screw', pitch: 0.4, turns: 2,
      a: ref('nut', 'bore', p(0, 0), ax), b: ref('shaft', 'thread', p(0, 0), ax) }] };
  const result = solveTopologyMates(assembly);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.degreesOfFreedom, 0);
  assert.ok(Math.abs(assembly.components[1].transform.z - 0.8) < 1e-6);
});

test('screw motor advances and reverses a free helical joint without moving ground', () => {
  const assembly = { components: [{ id: 'nut', grounded: true, transform: T() }, { id: 'shaft', transform: T() }],
    topologyMates: [{ id: 'helical', type: 'screw', pitch: 0.4, coupledMotion: true,
      a: ref('nut', 'bore', p(0, 0), ax), b: ref('shaft', 'thread', p(0, 0), ax) }] };
  assert.equal(solveTopologyMates(assembly).ok, true);
  const study = createMotionStudy(assembly);
  addScrewMotor(study, 'helical', 60);
  for (const time of [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25, 0, -0.25, -0.5]) {
    const result = evaluateMotionStudy(assembly, study.id, time);
    assert.equal(result.ok, true, `${time}: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(assembly.components[1].transform.z - 0.4*time) < 1e-5, `${time}: shaft travel`);
    assert.equal(assembly.components[0].transform.z, 0, 'nut remains grounded');
  }
});

test('book-like grounded trunnion, swivel eye, and hinged arm form a driven closed loop', () => {
  const A = p(-3.5, 8), D = p(0, 4), C = p(2.5, 4+5*Math.sin(Math.PI/3));
  const distance = Math.hypot(C.x-A.x, C.y-A.y);
  const along = p((C.x-A.x)/distance, (C.y-A.y)/distance);
  const assembly = { components: [
    { id: 'base', grounded: true, transform: T() },
    { id: 'nut', transform: T() },
    { id: 'shaft', transform: T() },
    { id: 'eye', transform: T() },
    { id: 'arm', transform: T() },
  ], topologyMates: [
    ...hinge('A', 'base', 'nut', A, ax),
    { id: 'thread', type: 'screw', pitch: 0.4, coupledMotion: true,
      a: ref('nut', 'threaded-bore', A, along), b: ref('shaft', 'shaft', A, along) },
    ...hinge('swivel', 'shaft', 'eye', C, along),
    ...hinge('C', 'eye', 'arm', C, ax),
    ...hinge('D', 'base', 'arm', D, ax),
  ] };
  let result = solveTopologyMates(assembly);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.degreesOfFreedom, 1, JSON.stringify(result));
  assert.equal(result.clusters.length, 1);
  const motorAssembly=structuredClone(assembly);
  const thread=assembly.topologyMates.find(m => m.id === 'thread');
  for(let step=1;step<=40;step++){
    thread.driveTurns=-step/4;
    result=solveTopologyMates(assembly);
    assert.equal(result.ok,true,`step ${step}: ${JSON.stringify(result)}`);
    assert.equal(result.degreesOfFreedom,0);
    assert.equal(result.unsatisfied.length,0);
  }
  assert.equal(assembly.components[0].transform.x, 0);
  const arm=assembly.components.find(c=>c.id==='arm');
  const eyeJoint=assembly.topologyMates.find(m=>m.id==='C-axis');
  const movedC=worldFrame(eyeJoint.b.frame,arm,'component').origin;
  const openedAngle=Math.atan2(movedC.y-D.y,movedC.x-D.x)*180/Math.PI;
  assert.ok(openedAngle>100&&openedAngle<112,`shaft travel swings the paired arm open: ${openedAngle}°`);
  assert.ok(Math.abs(Math.hypot(movedC.x-A.x,movedC.y-A.y)-(distance-4))<1e-4,
    'ten turns at 4 mm lead shorten the A–C span by 40 mm');
  const study=createMotionStudy(motorAssembly);
  addScrewMotor(study,'thread',-60);
  const seek=evaluateMotionStudy(motorAssembly,study.id,10);
  assert.equal(seek.ok,true,`one direct motion-study seek follows ten quarter-turn steps: ${JSON.stringify(seek)}`);
  const motorC=worldFrame(eyeJoint.b.frame,motorAssembly.components.find(c=>c.id==='arm'),'component').origin;
  assert.ok(Math.hypot(motorC.x-movedC.x,motorC.y-movedC.y)<1e-4);
  delete thread.driveTurns;
  const freeAgain=solveTopologyMates(assembly);
  assert.equal(freeAgain.ok,true,JSON.stringify(freeAgain));
  assert.equal(freeAgain.degreesOfFreedom,1);
});
