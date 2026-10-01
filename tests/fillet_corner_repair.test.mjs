import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties,exportStep} from '../js/cad_kernel.js';
import {repairFilletCornerPatches} from '../js/core/fillet_corner_repair.js';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';

// Compact geometry-only regression from the browser-authored Q4 model. It
// contains neither saved models nor tessellation/BREP caches.
const fixture=JSON.parse(readFileSync(new URL('./fixtures/fillet-three-sided-corner.json',import.meta.url)));
test('three-sided blend repair produces accurate closed geometry without mutating its support body',async()=>{
  const run=await regenerateFeatures(fixture);
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const feature=fixture.features.at(-1),result=run.results.get(feature.id),support=run.results.get(feature.inputs[0]);
    const oc=result.oc,analysis=new oc.ShapeAnalysis_ShapeTolerance();
    try{
      assert.ok(analysis.Tolerance(result.shape,1,oc.TopAbs_ShapeEnum.TopAbs_SHAPE)<.001,'true boundary tolerance must meet STEP gate');
      const props=await shapeMassProperties(result);
      assert.ok(props.volume>1227 && props.volume<1228,'repair preserves the designed solid');
      assert.ok(Math.abs(props.centerOfMass.z)<.001,'paired corner geometry remains symmetric');
      const unchanged=await shapeMassProperties(support);
      assert.ok(Math.abs(unchanged.volume-1229.3686899233232)<1e-6,'the source body stays unchanged');
      assert.ok(analysis.Tolerance(support.shape,1,oc.TopAbs_ShapeEnum.TopAbs_SHAPE)<.00001);
      assert.equal(repairFilletCornerPatches(oc,support.shape),null,'accurate bodies are not refitted');
    }finally{analysis.delete();}
  }finally{releaseRegeneration(run);}
});

test('restored Boolean prefixes retain accurate three- and four-sided fillet corners',async()=>{
  const execute=createCadWorkerExecutor({bodyStore:{get:async()=>null,put:async()=>{},remove:async()=>{}}});
  const head=fixture.features.at(-1).id;
  const query=()=>execute({kind:'regenerate',document:structuredClone(fixture),head,massProperties:true});
  const cold=await query(),warm=await query();
  const coldBody=cold.results.find(([id])=>id===head)[1],warmBody=warm.results.find(([id])=>id===head)[1];
  const result=await import('../js/cad_kernel.js');
  const body=await result.deserializeBrep(warmBody.bytes);
  try{
    const oc=body.oc,analysis=new oc.ShapeAnalysis_ShapeTolerance();
    try{assert.ok(analysis.Tolerance(body.shape,1,oc.TopAbs_ShapeEnum.TopAbs_SHAPE)<.001,'restored prefix must meet the same accuracy gate');}finally{analysis.delete();}
    assert.ok(Math.abs(warmBody.massProperties.volume-coldBody.massProperties.volume)<.1,'restoration preserves designed volume within corner accuracy');
    assert.ok(Math.abs(warmBody.massProperties.centerOfMass.z)<.001);
    assert.ok(Math.abs(warmBody.massProperties.bounds.min.x)<1e-6,'the front support stays exactly at X=0');
    assert.ok((await exportStep(body,'warm-filleted.step')).byteLength>1000);
  }finally{result.disposeBrep(body);}
});

test('unsupported changed-radius corner is still rejected by the STEP accuracy gate',async()=>{
  const changed=structuredClone(fixture);
  changed.features.at(-1).params.radius=.5;
  const run=await regenerateFeatures(changed);
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const result=run.results.get(changed.features.at(-1).id),oc=result.oc;
    const analysis=new oc.ShapeAnalysis_ShapeTolerance();
    try{assert.ok(analysis.Tolerance(result.shape,1,oc.TopAbs_ShapeEnum.TopAbs_SHAPE)>.001);}finally{analysis.delete();}
    await assert.rejects(exportStep(result,'unrepaired.step'),/tolerance|accuracy/i);
    const properties=await shapeMassProperties(result);
    assert.ok(properties.volume>1227.7,'the smaller convex rounds retain additional material');
  }finally{releaseRegeneration(run);}
});
