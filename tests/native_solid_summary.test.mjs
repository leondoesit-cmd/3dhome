import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeSolidSummary} from '../js/core/native_solid_summary.js';
import {makeBrepPrimitive,compoundBrep,shapeSolidCount,shapeMassProperties,disposeBrep} from '../js/cad_kernel.js';
import {evaluateAssemblyMassProperties} from '../js/cad_assembly_mass_properties.js';

test('saved exact native counts distinguish disconnected solids from one display projection',()=>{
  const parts=[{meshData:{nativeSolidCount:5}}];
  assert.deepEqual(nativeSolidSummary(JSON.parse(JSON.stringify(parts))),{known:true,count:5,disconnected:true,projections:1});
  assert.equal(nativeSolidSummary([{meshData:{positions:[0,0,0]}}]).known,false,'old meshes do not establish connectivity');
  assert.equal(nativeSolidSummary([{exactPending:true,meshData:{nativeSolidCount:1}}]).known,false,'pending changes cannot bless an old count');
  assert.equal(nativeSolidSummary([{meshData:{nativeSolidCount:1}},{meshData:{nativeSolidCount:1}},{previewOnly:true}]).count,2,'real separate bodies remain separate');
  assert.equal(nativeSolidSummary([{meshData:{nativeSolidCount:1}},{meshData:{nativeSolidCount:1}}],{singleRecipe:true}).count,1,'fused native Toolbox projections do not multiply solids');
});

test('native compound enumeration and exact assembly mass retain actual connected-solid counts',async()=>{
  const a=await makeBrepPrimitive({type:'box',w:1,h:1,d:1}),b=await makeBrepPrimitive({type:'box',x:3,w:1,h:1,d:1});
  let compound;
  try{
    compound=await compoundBrep([a,b]);
    assert.equal(await shapeSolidCount(a),1);assert.equal(await shapeSolidCount(compound),2);
    const props=await shapeMassProperties(compound);assert.equal(props.solidCount,2);
    const assembly={components:[{id:'a',name:'Disconnected part',def:{key:'native'},transform:{}}]};
    const result=await evaluateAssemblyMassProperties(assembly,{evaluateDefinition:async()=>({bodies:[{...props,accuracy:'exact',density:1,massKg:props.volume/1000}]})});
    assert.equal(result.bodies[0].solidCount,2);assert.equal(result.bodies[0].componentName,'Disconnected part');
  }finally{if(compound)disposeBrep(compound);disposeBrep(a);disposeBrep(b);}
});
