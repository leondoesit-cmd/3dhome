import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {filletBrep,shapeMassProperties,disposeBrep} from '../js/cad_kernel.js';

test('fresh book BATTERYPLATE accepts distinct holder and pocket fillet radii',async()=>{
  const path=fileURLToPath(new URL('../artifacts/planchard/fresh-library-batteryplate-full-round-2026-09-27.json',import.meta.url));
  const library=JSON.parse(readFileSync(path,'utf8'));
  const plate=library.models.find(model=>model.name.includes('BATTERYPLATE'));
  assert.ok(plate,'a fresh BATTERYPLATE is present');
  const compiled=compileKernelFeatureTree(plate);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  let mixed,uniform;
  try{
    assert.deepEqual(run.issues,[],'the browser-built plate rebuilds through the full round');
    const body=run.results.get(plate.features.at(-1).id);
    assert.ok(body?.shape);
    const edges=body.topology.filter(entry=>entry.kind==='edge');
    const holder=edges.find(entry=>entry.descriptor.curve==='circle'&&Math.abs(entry.descriptor.radius-1.651)<1e-5&&Math.abs(entry.descriptor.origin.y-.508)<1e-5);
    const pocket=edges.find(entry=>entry.descriptor.curve==='line'&&Math.abs(Math.abs(entry.descriptor.origin.z)-2.9947536962484307)<1e-5&&Math.abs(entry.descriptor.origin.y-.508)<1e-5);
    assert.ok(holder&&pocket,'both book edges survive the full round');
    const ids=[holder.persistentId,pocket.persistentId];
    mixed=await filletBrep(body,.127,{edgePersistentIds:ids,edgeRadii:[
      {id:ids[0],radius:.1524}, // 0.060 in on the holder
      {id:ids[1],radius:.1016}, // 0.040 in on the cut
    ],propagation:'tangent'});
    uniform=await filletBrep(body,.127,{edgePersistentIds:ids,propagation:'tangent'});
    const baseline=await shapeMassProperties(body),result=await shapeMassProperties(mixed),same=await shapeMassProperties(uniform);
    assert.ok(Math.abs(result.volume-baseline.volume)>1e-5,'the concave and convex finishes changed the body');
    assert.ok(Math.abs(result.volume-same.volume)>1e-5,'per-edge overrides reached the kernel');
  }finally{[mixed,uniform].filter(Boolean).forEach(disposeBrep);releaseRegeneration(run);}
});

test('browser-corrected BATTERYPLATE saves inch radii in centimeters and rebuilds exactly',async()=>{
  const path=fileURLToPath(new URL('../artifacts/planchard/fresh-library-battery-and-plate-2026-09-27.json',import.meta.url));
  const library=JSON.parse(readFileSync(path,'utf8'));
  const plate=library.models.find(model=>model.name.includes('BATTERYPLATE'));
  assert.ok(plate);
  assert.equal(plate.context.units.length,'in');
  const finish=plate.features.at(-1);
  assert.equal(finish.name,'HolderFillet');
  assert.equal(finish.params.multipleRadius,true);
  const radii=finish.params.edgeRadii.map(entry=>entry.radius).sort((a,b)=>a-b);
  assert.equal(radii.length,5);
  radii.slice(0,4).forEach(radius=>assert.ok(Math.abs(radius-.1016)<1e-10,'0.040 in pocket radius'));
  assert.ok(Math.abs(radii[4]-.1524)<1e-10,'0.060 in holder radius');
  assert.equal(plate.lastRebuild.ok,true);
  const compiled=compileKernelFeatureTree(plate);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{
    assert.deepEqual(run.issues,[],'the edited full history rebuilds');
    assert.ok(run.results.get(finish.id)?.shape);
  }finally{releaseRegeneration(run);}
});
