import test from 'node:test';
import assert from 'node:assert/strict';
import {lowerToolboxFeature} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {exportStep,shapeMassProperties,validateBrepForExport} from '../js/cad_kernel.js';

test('ISO 4032 M6 nut uses a true circular native bore with cosmetic thread', {timeout:120000}, async()=>{
  const feature={id:'nut',type:'toolbox',name:'M6 ISO 4032',params:{kind:'hex-nut',sizeKey:'M6',lengthMm:20,threadMode:'cosmetic',lod:2}};
  const lowered=lowerToolboxFeature(feature);
  assert.deepEqual(lowered.map(item=>item.type),['extrude','cylinder','subtract']);
  assert.deepEqual(lowered[0].params.holes,[]);
  assert.equal(lowered[1].params.r,.3);
  assert.equal(lowered[2].id,'nut');
  const run=await regenerateFeatures({features:lowered});
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const valid=await validateBrepForExport(run.finalShape);
    assert.equal(valid.solidCount,1);
    const mass=await shapeMassProperties(run.finalShape);
    const hexAreaMm2=100*Math.sqrt(3)/2;
    const expectedCm3=(hexAreaMm2-Math.PI*3**2)*5.2/1000;
    assert.ok(Math.abs(mass.volume-expectedCm3)<1e-6,`${mass.volume} versus ${expectedCm3}`);
    const step=new TextDecoder().decode(await exportStep(run.finalShape,'iso-4032-m6.step'));
    assert.equal((step.match(/MANIFOLD_SOLID_BREP\(/g)||[]).length,1);
    assert.equal((step.match(/CYLINDRICAL_SURFACE\(/g)||[]).length,1);
    assert.equal((step.match(/PLANE\(/g)||[]).length,8);
    assert.doesNotMatch(step,/B_SPLINE_SURFACE\(/);
  }finally{releaseRegeneration(run);}
});
