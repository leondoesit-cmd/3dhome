import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties,makeBrepPrimitive,disposeBrep} from '../js/cad_kernel.js';

test('native Q4 trimmed spline support excludes untrimmed control-surface overhang',async()=>{
  const document=JSON.parse(readFileSync(new URL('../artifacts/planchard/CSWA-Q4-final-R6-fresh-browser-2026-09-30.mforge',import.meta.url),'utf8')).mainModel;
  const compiled=compileKernelFeatureTree(document),run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    const mass=await shapeMassProperties(run.results.get(compiled.features.at(-1).id));
    assert.ok(Math.abs((mass.bounds.max.x-mass.bounds.min.x)*10-127)<.03,'report actual trimmed support, not the 130 mm parameter-rectangle bound');
    assert.ok(Math.abs((mass.bounds.max.y-mass.bounds.min.y)*10-139)<.001);
    assert.ok(Math.abs((mass.bounds.max.z-mass.bounds.min.z)*10-254)<.001);
    assert.ok(Math.abs(mass.volume-1227.6093488556)<.001,'bounds correction cannot alter the body');
  } finally {releaseRegeneration(run);}
});

test('analytic sphere bounds preserve interior surface extrema',async()=>{
  const body=await makeBrepPrimitive({type:'sphere',r:2});
  try {const mass=await shapeMassProperties(body);for(const axis of ['x','y','z'])assert.ok(Math.abs(mass.bounds.max[axis]-mass.bounds.min[axis]-4)<1e-5);}
  finally {disposeBrep(body);}
});
