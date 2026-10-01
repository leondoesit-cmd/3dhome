import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { historyEntryRolled } from '../js/core/parametric_document.js';
import { publishRebuildStatus, withKernelFailures } from '../js/core/parametric_rebuild.js';
import { leavesInputStanding } from '../js/core/rebuild.js';

/* Opening the saved HOUSING model while Extrude / Boss 3 failed in the kernel
   showed the part's saved meshData — a stale 13.0175 cm ring from an old broken
   union — under "fully parametric · Rebuild succeeded". Bodies come only from
   steps that built, and a kernel failure is a failed rebuild. */

const src = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');
const fnSource = (name) => {
  const start = src.indexOf(name + '(');
  assert.ok(start >= 0, name + ' exists in modeler.js');
  let parameters = 0, bodyStart = src.indexOf('(', start);
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '(') parameters++;
    else if (src[i] === ')' && --parameters === 0) { bodyStart = src.indexOf('{', i); break; }
  }
  let depth = 0, end = bodyStart;
  for (let i = end; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  return src.slice(src.lastIndexOf('\n', start) + 1, end);
};
const context = { historyEntryRolled, leavesInputStanding, Set };
vm.runInNewContext(fnSource('function cutTargetFeatureId').replace('document = E.def', 'document') + '\n' + fnSource('async function publishExactBodies') + '\nthis.publishExactBodies = publishExactBodies;', context);

const record = () => JSON.parse(readFileSync(new URL('./fixtures/planchard_housing_record.json', import.meta.url), 'utf8'));
const idOf = (doc, name) => doc.features.find((feature) => feature.name === name).id;
const staleRing = () => ({ positions: [13.0175, 0, 0, 13.0175, 0, 3.302], topology: [], stale: true });
const shape = (id) => ({ shape: { id }, topology: [] });
const meshOf = async (body) => ({ positions: [], topology: [], from: body.shape.id });

function failedBoss3Run(doc, built) {
  const boss3 = idOf(doc, 'Extrude / Boss 3');
  const results = new Map(built.map((name) => [idOf(doc, name), shape(idOf(doc, name))]));
  return { ok: false, results, finalShape: results.size ? [...results.values()].at(-1) : null, issues: [{ feature: boss3, code: 'regeneration-failed', message: 'Boss 3 union failed' }] };
}

test('a failed last step shows the last step that built, not the saved mesh', async () => {
  const doc = record();
  const part = doc.parts[0];
  part.meshData = staleRing();
  const run = failedBoss3Run(doc, ['Base Extrude', 'Boss-Loft1', 'Boss-Battery', 'Shell1']);
  const changed = await context.publishExactBodies(doc.parts, run, doc, meshOf);
  assert.equal(changed.length, 1); // the array comes from the vm realm
  assert.equal(changed[0], part);
  assert.notEqual(part.meshData.stale, true, 'the stale saved ring must not stay up');
  assert.equal(part.meshData.from, idOf(doc, 'Shell1'));
  assert.equal(part.exactError, 'Boss 3 union failed');
  assert.equal(part.exactPending, false);
});

test('a failed step in the middle stops the chain before it', async () => {
  const doc = record();
  const part = doc.parts[0];
  part.meshData = staleRing();
  const run = failedBoss3Run(doc, ['Base Extrude', 'Boss-Loft1', 'Extrude / Boss 3']);
  run.issues[0].feature = idOf(doc, 'Boss-Battery');
  await context.publishExactBodies(doc.parts, run, doc, meshOf);
  assert.equal(part.meshData.from, idOf(doc, 'Boss-Loft1'), 'a step past the failure is not the head');
});

test('when no step of the chain built, the saved mesh is dropped and the error reported', async () => {
  const doc = record();
  const part = doc.parts[0];
  part.meshData = staleRing();
  await context.publishExactBodies(doc.parts, failedBoss3Run(doc, []), doc, meshOf);
  assert.equal(part.meshData, undefined);
  assert.equal(part.exactError, 'Boss 3 union failed');
});

test('a successful run still publishes the head and clears the error', async () => {
  const doc = record();
  const part = doc.parts[0];
  part.exactError = 'old';
  const run = failedBoss3Run(doc, ['Base Extrude', 'Boss-Loft1', 'Boss-Battery', 'Shell1', 'Extrude / Boss 3']);
  run.ok = true; run.issues = [];
  await context.publishExactBodies(doc.parts, run, doc, meshOf);
  assert.equal(part.meshData.from, idOf(doc, 'Extrude / Boss 3'));
  assert.equal(part.exactError, null);
});

test('a document change during mesh transfer cannot publish obsolete geometry', async () => {
  const doc = record(), part = doc.parts[0], before = staleRing();
  part.meshData = before;
  const run = failedBoss3Run(doc, ['Base Extrude', 'Boss-Loft1', 'Boss-Battery', 'Shell1', 'Extrude / Boss 3']);
  run.ok = true;
  let current = true;
  const changed = await context.publishExactBodies(doc.parts, run, doc, async body => {
    current = false;
    return meshOf(body);
  }, () => current);
  assert.equal(changed.length, 0);
  assert.equal(part.meshData, before);
});

test('save publishes verified worker meshes without native BREP handles',async()=>{
 const doc=record(),part=doc.parts[0],head=idOf(doc,'Extrude / Boss 3');
 const mesh={positions:[0,0,0,1,0,0,0,1,0],topology:[]};
 const body={verifiedSerializedExact:true,workerMeshData:mesh};
 const run={ok:true,issues:[],results:new Map([[head,body]])};
 const changed=await context.publishExactBodies(doc.parts,run,doc,async result=>{
   assert.equal(result.shape,undefined);return result.workerMeshData;
 });
 assert.equal(changed.length,1);assert.equal(part.meshData,mesh);assert.equal(part.exactError,null);
});

test('an obsolete worker mesh cannot replace the current document display',async()=>{
 const doc=record(),part=doc.parts[0],head=idOf(doc,'Extrude / Boss 3'),before=staleRing();
 part.meshData=before;
 const run={ok:true,issues:[],results:new Map([[head,{verifiedSerializedExact:true,workerMeshData:{positions:[0,0,0]}}]])};
 let current=true;
 const changed=await context.publishExactBodies(doc.parts,run,doc,async result=>{current=false;return result.workerMeshData;},()=>current);
 assert.equal(changed.length,0);assert.equal(part.meshData,before);
});

test('a kernel regeneration failure fails the rebuild status, the tree row and the status bar count', () => {
  const doc = record();
  const boss3 = idOf(doc, 'Extrude / Boss 3');
  /* The core run as it stands after the kernel run filled exactTopologyCache:
     clean. (Without that cache the record's core run reports missing topology,
     which the editor hides while restoring.) */
  const core = { ok: true, issues: [], status: doc.history.map((entry) => ({ historyId: entry.id, targetId: entry.targetId, kind: entry.kind, state: 'rebuilt' })) };
  const run = withKernelFailures(core, failedBoss3Run(doc, ['Shell1']));
  publishRebuildStatus(doc, run);
  assert.equal(run.ok, false);
  assert.equal(doc.lastRebuild.ok, false);
  assert.equal(doc.features.find((feature) => feature.id === boss3).state, 'failed');
  assert.equal(run.status.find((entry) => entry.targetId === boss3).state, 'failed');
  assert.equal(run.issues.filter((issue) => issue.severity === 'error').length, 1);
  assert.equal(withKernelFailures(core, { ok: true, issues: [] }), core, 'a clean kernel run leaves the core run alone');
});

test('regenerateExactModelNow publishes bodies and kernel failures before it throws', () => {
  const body = fnSource('async function regenerateExactModelNow');
  const publish = body.indexOf('publishExactBodies(');
  assert.ok(publish > 0 && publish < body.indexOf('if (!E.brepRun.ok'), 'bodies are published before a failed run throws');
  assert.match(body, /withKernelFailures\(rebuildParametricDocument\(/);
});
