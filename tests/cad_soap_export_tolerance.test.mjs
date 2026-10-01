import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileKernelFeatureTree } from '../js/core/kernel_feature_adapter.js';
import { regenerateFeatures, releaseRegeneration } from '../js/cad_feature_tree.js';
import { shapeMassProperties, validateBrepForExport } from '../js/cad_kernel.js';

// Canonical sketch/features captured from the user's actual fresh Chrome 7.6
// bundle. Meshes, cached topology and unrelated bundled library assets omitted.
const recipe=JSON.parse(readFileSync(new URL('./fixtures/planchard_soap_7_6_browser_recipe.json',import.meta.url),'utf8'));
async function replay(tolerance){
  const def=structuredClone(recipe);def.features.at(-1).params.tolerance=tolerance;
  const compiled=compileKernelFeatureTree(def);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  assert.equal(run.ok,true,JSON.stringify(run.issues));return run;
}

test('fresh Chrome SOAP shell at the nominal .001 cm gate exports despite OCCT vertex rounding',async()=>{
  const run=await replay(.001);
  try{
    const body=run.finalShape,oc=body.oc,tolerance=new oc.ShapeAnalysis_ShapeTolerance();let raw;
    try{raw=tolerance.Tolerance(body.shape,1,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);}finally{tolerance.delete();}
    assert.ok(raw>.001,'the regression reproduces OCCT promotion beyond the double representing .001');
    assert.ok(raw-.001<=4*2**-62,'only a few double ULPs, not a geometric gap');
    const validation=await validateBrepForExport(body);
    assert.equal(validation.valid,true);assert.equal(validation.solidCount,1);assert.equal(validation.maxToleranceCm,raw,'report actual tolerance without rounding it down');
    const mass=await shapeMassProperties(body);assert.ok(Math.abs(mass.volume-36.34956)<.00001,'original exact soap-shell volume is unchanged');
  }finally{releaseRegeneration(run);}
});

test('a real native .001001 cm vertex tolerance still fails the unchanged nominal export gate',async()=>{
  const run=await replay(.001);
  try{
    const oc=run.finalShape.oc,setter=new oc.ShapeFix_ShapeTolerance();
    try{setter.SetTolerance(run.finalShape.shape,.001001,oc.TopAbs_ShapeEnum.TopAbs_VERTEX);}finally{setter.delete();}
    await assert.rejects(validateBrepForExport(run.finalShape),/body tolerance exceeds 0\.001 cm/);
  }
  finally{releaseRegeneration(run);}
});

test('accumulated round-off of a few thousand ULPs at the .001 cm gate exports; a 1e-9 cm excess does not',async()=>{
  const run=await replay(.001);
  try{
    const oc=run.finalShape.oc,setter=new oc.ShapeFix_ShapeTolerance();
    try{setter.SetTolerance(run.finalShape.shape,.001+1.2e-12,oc.TopAbs_ShapeEnum.TopAbs_VERTEX);}finally{setter.delete();}
    assert.equal((await validateBrepForExport(run.finalShape)).valid,true,'the LENS cover body carries .001 + 1.2e-12 cm');
    const strict=new oc.ShapeFix_ShapeTolerance();
    try{strict.SetTolerance(run.finalShape.shape,.001+1e-9,oc.TopAbs_ShapeEnum.TopAbs_VERTEX);}finally{strict.delete();}
    await assert.rejects(validateBrepForExport(run.finalShape),/body tolerance exceeds 0\.001 cm/);
  }finally{releaseRegeneration(run);}
});
