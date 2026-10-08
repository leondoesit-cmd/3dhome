import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';
import {evaluateMotionStudy} from '../js/cad_motion_study.js';
import {rotationOf} from '../js/cad_mate_model.js';

const saved = JSON.parse(readFileSync(new URL('./fixtures/kant-twist-browser-native-mates.json', import.meta.url), 'utf8'));
function fixture(name) {
  const assembly = structuredClone({components:saved.components, topologyMates:saved.topologyMates});
  const example = structuredClone(saved.cases[name]);
  for (const pose of example.transforms) assembly.components.find(c => c.id === pose.id).transform = pose.transform;
  Object.assign(assembly.topologyMates.find(m => m.type === 'screw'), example.screw);
  if (!Object.hasOwn(example.screw, 'driveTurns')) delete assembly.topologyMates.find(m => m.type === 'screw').driveTurns;
  if (example.motionStudies) assembly.motionStudies = example.motionStudies;
  return assembly;
}
function unchangedPoses(assembly, before) {
  for (let i=0; i<assembly.components.length; i++) {
    const now=assembly.components[i].transform, original=before[i];
    for (const axis of ['x','y','z']) assert.ok(Math.abs(now[axis]-original[axis]) < 1e-8);
    const a=rotationOf(now).flat(), b=rotationOf(original).flat();
    assert.ok(a.every((v,j)=>Math.abs(v-b[j]) < 1e-8));
  }
}

test('actual saved Kant Twist closed endpoint retains every mate and zero driven freedoms', () => {
  let assembly=fixture('KT-assembly-drive-closed-endpoint');
  for (let reopen=0; reopen<3; reopen++) {
    const before=assembly.components.map(c=>structuredClone(c.transform));
    const result=solveAssemblyMates(assembly);
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.settled,true);
    assert.deepEqual(result.unsatisfied,[]);
    assert.equal(result.degreesOfFreedom,0);
    assert.equal(result.clusters[0].rank,144);
    unchangedPoses(assembly,before);
    assembly=JSON.parse(JSON.stringify(assembly));
  }
});

test('actual saved quarter pose remains physically accepted with all driven constraints', () => {
  const assembly=fixture('KT-assembly-drive-negative-quarter');
  const before=assembly.components.map(c=>structuredClone(c.transform));
  const result=solveAssemblyMates(assembly);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual(result.unsatisfied,[]);
  assert.equal(result.degreesOfFreedom,0);
  unchangedPoses(assembly,before);
});

test('actual Motion Study endpoint re-solves as the original free one-DOF mechanism', () => {
  const assembly=fixture('KT-motion-study-endpoint-unresolved');
  const before=assembly.components.map(c=>structuredClone(c.transform));
  const result=solveAssemblyMates(assembly);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.settled,true);
  assert.deepEqual(result.unsatisfied,[]);
  assert.equal(result.degreesOfFreedom,1);
  unchangedPoses(assembly,before);
});

test('actual screw Motion Study applies its endpoint and survives free-mate refresh', () => {
  const assembly=fixture('KT-assembly-parallel-free-home');
  assembly.motionStudies=structuredClone(saved.cases['KT-motion-study-endpoint-unresolved'].motionStudies);
  const study=assembly.motionStudies[0];
  const result=evaluateMotionStudy(assembly,study.id,10);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.degreesOfFreedom,0);
  const refreshed=solveAssemblyMates(assembly);
  assert.equal(refreshed.ok,true,JSON.stringify(refreshed));
  assert.equal(refreshed.degreesOfFreedom,1);
  const jaw=assembly.components.find(c=>c.name.includes('KT10'));
  assert.ok(Math.abs(178-(jaw.transform.y*10+7)-10) < 1e-5);
});

test('per-row convergence still rejects a genuine request beyond the closed travel stop', () => {
  const assembly=fixture('KT-assembly-drive-closed-endpoint');
  assembly.topologyMates.find(m=>m.type==='screw').driveTurns=-10.5;
  const result=solveAssemblyMates(assembly);
  assert.equal(result.ok,false);
  assert.ok(result.unsatisfied.length > 0);
  assert.ok(result.unsatisfied.some(issue=>issue.linear > 1e-3 || issue.angular > 1e-4),JSON.stringify(result));
});
