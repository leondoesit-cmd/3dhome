import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {createPartDocument,createFeatureDefinition,updateFeatureDefinition} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties,validateBrepForExport} from '../js/cad_kernel.js';

const source=modelerSource();
function fixture(){
  const E={def:createPartDocument({units:{length:'mm'}})},undos=[],messages=[];
  let spec,serial=0,refreshes=0;
  const context={E,openQuickForm:value=>{spec=value;},pushUndo:()=>undos.push(structuredClone(E.def)),
    createFeatureDefinition,uid:()=>++serial,addPart:part=>{E.def.parts.push(part);return part;},
    refreshAll:()=>refreshes++,H:{discard:()=>undos.pop()},flash:value=>messages.push(value)};
  new Function(...Object.keys(context),sourceFunctionText(source,'openSphereForm')+';openSphereForm();')(...Object.values(context));
  return {E,spec,undos,messages,get refreshes(){return refreshes;}};
}

test('Sphere command routes canonical parts to precise form and preserves legacy direct drawing',()=>{
  for(const canonical of [true,false]){
    const calls=[];
    const context={E:{},commandUnavailableReason:()=>'',isCanonicalAuthoring:()=>canonical,
      openSphereForm:()=>calls.push('form'),DIRECT_COMMAND_TOOLS:{directsph:'sph'},
      setTool:value=>calls.push(value),closeCommandSearch:()=>{},syncCommandManager:()=>{}};
    new Function(...Object.keys(context),sourceFunctionText(source,'runCommand')+';runCommand("directsph");')(...Object.values(context));
    assert.deepEqual(calls,[canonical?'form':'sph']);
  }
});

test('precise Sphere form validates before history edits and creates a normal editable feature with undo',()=>{
  const f=fixture();
  assert.deepEqual(f.spec.fields.map(field=>[field.key,field.unit]),[['x','length'],['y','length'],['z','length'],['diameter','length']]);
  assert.match(f.spec.failureMessage(),/positive diameter/);
  for(const values of [{x:0,y:0,z:0,diameter:0},{x:0,y:0,z:0,diameter:-1},{x:NaN,y:0,z:0,diameter:1.2}]){
    assert.equal(f.spec.onApply(values),false);
  }
  assert.equal(f.undos.length,0);assert.equal(f.E.def.features.length,0);
  assert.equal(f.spec.onApply({x:0,y:0,z:0,diameter:1.2}),true);
  const feature=f.E.def.features[0];
  assert.equal(feature.type,'sphere');assert.deepEqual(feature.params,{x:0,y:0,z:0,r:.6});
  assert.equal(f.E.def.history.length,1);assert.equal(f.E.def.history[0].targetId,feature.id);
  assert.equal(f.E.sel.featureId,feature.id);assert.equal(f.E.sel.kind,'sph');
  assert.equal(f.undos.length,1);assert.equal(f.refreshes,1);
  f.E.def=f.undos.pop();assert.equal(f.E.def.features.length,0);assert.equal(f.E.def.history.length,0);
});

test('a fresh 12mm native Sphere survives reopen and a driving radius edit in the same feature',async()=>{
  const f=fixture();f.spec.onApply({x:.4,y:-.2,z:.1,diameter:1.2});
  const reopened=JSON.parse(JSON.stringify(f.E.def)),id=reopened.features[0].id;
  for(const radius of [.6,.8]){
    if(radius!==.6)updateFeatureDefinition(reopened,id,{params:{r:radius}});
    const compiled=compileKernelFeatureTree(reopened),run=await regenerateFeatures({...compiled.document,features:compiled.features});
    try{
      assert.equal(run.ok,true,JSON.stringify(run.issues));
      const mass=await shapeMassProperties(run.finalShape),validation=await validateBrepForExport(run.finalShape);
      assert.equal(validation.valid,true,JSON.stringify(validation));assert.equal(validation.solidCount,1);
      assert.ok(Math.abs(mass.volume-4*Math.PI*radius**3/3)<1e-8);
      for(const [axis,value] of Object.entries({x:.4,y:-.2,z:.1}))assert.ok(Math.abs(mass.centerOfMass[axis]-value)<1e-8);
    }finally{releaseRegeneration(run);}
    assert.equal(reopened.features.length,1);assert.equal(reopened.features[0].id,id);assert.equal(reopened.history.length,1);
  }
});
