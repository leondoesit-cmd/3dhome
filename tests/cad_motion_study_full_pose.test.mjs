import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMotionStudy, addRotaryMotor, evaluateMotionStudy } from '../js/cad_motion_study.js';
import { axisAngleMatrix, mul, rotationOf, setRotation } from '../js/cad_mate_model.js';
import { solveAssemblyMates } from '../js/cad_mate_solver.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/welder_arm_23_mate_motion.json', import.meta.url)));
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-5, `${label}: ${actual} != ${expected}`);
function assertHome(assembly, home) {
  for (const component of assembly.components) {
    const before = home.get(component.id), after = component.transform;
    for (const axis of ['x', 'y', 'z']) near(after[axis] || 0, before[axis] || 0, `${component.id}.${axis}`);
    const a = rotationOf(after), b = rotationOf(before);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++)
      near(a[row][col], b[row][col], `${component.id}.rotation[${row},${col}]`);
  }
}

test('fresh 23-mate welder arm studies restore every free joint at time zero across jaw, yaw, pitch and wrist seeks', () => {
  let assembly = structuredClone(fixture);
  // The browser-authored fixture contains exact saved joint frames and poses,
  // without model geometry. The two jaws must mirror in world coordinates.
  assembly.topologyMates.find(m => m.type === 'gear').reverse = false;
  const solved = solveAssemblyMates(assembly);
  assert.equal(solved.ok, true, JSON.stringify(solved));
  assert.equal(solved.degreesOfFreedom, 4);
  const home = new Map(assembly.components.map(c => [c.id, structuredClone(c.transform)]));
  const sequence = [
    { name: 'jaw', id: 3395, axis: { x: 1, y: 0, z: 0 }, pivot: { x: 0, y: 11.7, z: 1.8 }, rpm: 10 / 3 },
    { name: 'yaw', id: 3389, axis: { x: 0, y: 1, z: 0 }, pivot: { x: 0, y: 0, z: 0 }, rpm: 5 },
    { name: 'pitch', id: 3390, axis: { x: 1, y: 0, z: 0 }, pivot: { x: 0, y: 0, z: 0 }, rpm: 5 },
    { name: 'wrist', id: 3391, axis: { x: 0, y: 1, z: 0 }, pivot: { x: 0, y: 4, z: 0 }, rpm: 5 },
  ];
  for (const drive of sequence) {
    const study = createMotionStudy(assembly, drive.name);
    addRotaryMotor(study, drive.id, drive.rpm, drive.axis, drive.pivot);
    for (const time of [1, 0, 1, 0]) {
      const result = evaluateMotionStudy(assembly, study.id, time);
      assert.equal(result.ok, true, `${drive.name} t=${time}: ${JSON.stringify(result)}`);
      if (time === 0) assertHome(assembly, home);
      if (drive.name === 'pitch' && time === 1) {
        // Reproduce the free-roll perturbation seen in the browser sequence.
        // The pitch motor does not drive this fourth joint; its own study zero
        // must restore it before the wrist study captures a fresh baseline.
        const wrist = assembly.components.find(c => c.id === 3391);
        setRotation(wrist.transform, mul(axisAngleMatrix({ x: 0, y: 1, z: 0 }, -6.5984749265 * Math.PI / 180), rotationOf(wrist.transform)));
      }
      assembly = JSON.parse(JSON.stringify(assembly));
    }
  }
});

test('full pose baseline is captured on a legacy study and reset zero takes the current pose', () => {
  const assembly = structuredClone(fixture);
  const study = createMotionStudy(assembly, 'legacy');
  addRotaryMotor(study, 3391, 5, { x: 0, y: 1, z: 0 }, { x: 0, y: 4, z: 0 });
  delete study.baseRotations;
  const result = evaluateMotionStudy(assembly, study.id, 0);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(study.baseRotations.__assemblyPoses.length, 18);
  assert.equal(study.baseRotations.__assemblyPoses.find(c => c.id === 3391).transform.ry, 0);
});
