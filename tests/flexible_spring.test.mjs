import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSpringBinding,springMotionState,springPreviewMesh,springEndpoints,springSource,hasUnverifiedSprings,restoreSpringEndpoint} from '../js/core/flexible_spring.js';
import {helixPoint} from '../js/cad_helix.js';
import {ensureConfigurations,captureConfiguration,setActiveConfiguration} from '../js/cad_configurations.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
const source=modelerSource();
const protectedDef={parts:[{id:'spring-body',meshData:{positions:[1,2,3]},featureId:'sweep'}],sketches:[],referenceGeometry:[{id:'curve',featureId:'helix'}],features:[{id:'helix',type:'helix',params:{radius:.6,height:2.5,turns:4,definition:'height-turns',axis:{x:0,y:1,z:0}}},{id:'sweep',type:'sweep',params:{sketchSources:{kind:'circular-helix-sweep',helixFeatureId:'helix',helixId:'curve',diameter:.2}}}]};
ensureConfigurations(protectedDef)[0].name='Extended';const extended=protectedDef.activeConfiguration;protectedDef.features[0].params.height=1;captureConfiguration(protectedDef,{name:'Compressed'});setActiveConfiguration(protectedDef,extended);
function fixture(){const spring={id:'spring',def:structuredClone(protectedDef),transform:{x:0,y:0,z:0}},rod={id:'rod',transform:{x:0,y:0,z:0}},assembly={components:[spring,rod]};spring.flexibleSpring=createSpringBinding(spring,rod);return {spring,rod,assembly};}
test('SH06-compatible configurations define exact 10/25 mm endpoints with unchanged 2 mm wire',()=>{
  const f=fixture(),ends=springEndpoints(f.spring);assert.equal(ends.min.height,1);assert.equal(ends.max.height,2.5);assert.equal(ends.source.diameter,.2);
  f.rod.transform.y=-.75;assert.deepEqual(springMotionState(f.spring,f.assembly),{height:1.75,configurationId:null,exact:false});
  f.rod.transform.y=-1.5;assert.equal(springMotionState(f.spring,f.assembly).configurationId,ends.min.configurationId);
  f.rod.transform.y=-1.6;assert.throws(()=>springMotionState(f.spring,f.assembly),/exceeds/);
});
test('a flexible preview reconstructs circular normal sections without scaling or changing native source geometry',()=>{
  const f=fixture(),original=JSON.stringify(f.spring.def),height=1.75,mesh=springPreviewMesh(f.spring.def,height),spec=springSource(f.spring.def).spec;
  for(let i=0;i<=mesh.segments;i++){
    const center=helixPoint({...spec,height,pitch:height/spec.turns},i/mesh.segments);
    for(let j=0;j<mesh.sides;j++){const at=(i*mesh.sides+j)*3;assert.ok(Math.abs(Math.hypot(mesh.positions[at]-center.x,mesh.positions[at+1]-center.y,mesh.positions[at+2]-center.z)-.1)<1e-10);}
  }
  assert.equal(JSON.stringify(f.spring.def),original);assert.ok(mesh.indices.length>0);
});
test('common translation does not deform the spring and preview markers survive serialization and nested guards',()=>{
  const f=fixture();f.spring.transform.y=10;f.rod.transform.y=10;assert.equal(springMotionState(f.spring,f.assembly).height,2.5);
  f.spring.flexibleSpringState={height:1.75,exact:false};const saved=JSON.parse(JSON.stringify(f.assembly));
  assert.ok(hasUnverifiedSprings(saved));assert.ok(hasUnverifiedSprings({components:[{asm:saved}]}));
  restoreSpringEndpoint(f.spring,f.spring.flexibleSpring.min.configurationId);assert.equal(springSource(f.spring.def).spec.height,1);assert.equal(f.spring.flexibleSpringState.exact,false,'restoring parameters alone never certifies native geometry');
});
test('actual motion hook waits for native endpoint proof and leaves intermediates explicitly unverified',async()=>{
  const f=fixture(),E={assembly:f.assembly};let rebuilds=0;
  const sync=new Function('E','springMotionState','restoreSpringEndpoint','refreshConfiguredComponent','hasUnverifiedSprings','flash',sourceFunctionText(source,'syncFlexibleSpringsAtMotionState')+';return syncFlexibleSpringsAtMotionState;')(E,springMotionState,restoreSpringEndpoint,async()=>{rebuilds++;return true;},hasUnverifiedSprings,()=>{});
  f.rod.transform.y=-.75;await sync(f.assembly);assert.equal(rebuilds,0);assert.ok(hasUnverifiedSprings(f.assembly));
  f.rod.transform.y=-1.5;await sync(f.assembly);assert.equal(rebuilds,1);assert.equal(f.spring.flexibleSpringState.exact,true);
});
test('actual restore action removes preview binding only after exact configuration rebuild succeeds',async()=>{
  const f=fixture(),E={assembly:f.assembly};f.spring.flexibleSpringState={height:1.75,exact:false};let valid=false;
  const restore=new Function('E','pushUndo','restoreSpringEndpoint','refreshConfiguredComponent','refreshAll',sourceFunctionText(source,'restoreExactFlexibleSpring')+';return restoreExactFlexibleSpring;')(E,()=>{},restoreSpringEndpoint,async()=>valid,()=>{});
  await restore(f.spring);assert.ok(f.spring.flexibleSpring);assert.ok(hasUnverifiedSprings(f.assembly));valid=true;await restore(f.spring);
  assert.equal(f.spring.flexibleSpring,undefined);assert.equal(f.spring.flexibleSpringState,undefined);
});
test('save, STEP, drawing, bundle, publication and exact interference all gate unverified flexible preview',()=>{
  for(const name of ['saveAssemblyDocument','exportAssemblyStep','exportDrawingSvg','exportBundleDocument','publishAssemblyModel','runInterferenceCheck','exportModelGlb','printDrawingSheet'])assert.match(sourceFunctionText(source,name),/if\(rejectFlexibleSpringPreview\(\)\)return;/);
  const f=fixture();f.spring.flexibleSpringState={exact:false};let message='';
  const reject=new Function('E','hasUnverifiedSprings','flash',sourceFunctionText(source,'rejectFlexibleSpringPreview')+';return rejectFlexibleSpringPreview;')({docType:'assembly',assembly:f.assembly},hasUnverifiedSprings,text=>message=text);
  assert.equal(reject(),true);assert.match(message,/visual preview.*before saving/);
});

test('cancelling a pending native binding restores exact source and invalidates its pending result',async()=>{
  const f=fixture();delete f.spring.flexibleSpring;const original=f.spring.def,E={assembly:f.assembly};let form,finish;
  const builds=new WeakMap();
  const open=new Function('E','springSource','flash','openQuickForm','createSpringBinding','pushUndo','cloneData','refreshConfiguredComponent','configuredComponentBuilds',sourceFunctionText(source,'openFlexibleSpringForm')+';return openFlexibleSpringForm;')(E,springSource,()=>{},spec=>form=spec,createSpringBinding,()=>{},structuredClone,()=>new Promise(resolve=>finish=resolve),builds);
  open(f.spring);form.onCancel();assert.equal(f.spring.def,original);assert.equal(f.spring.flexibleSpring,undefined);
  open(f.spring);const pending=form.onApply({driver:'rod',response:1});assert.notEqual(f.spring.def,original);assert.equal(f.spring.flexibleSpringState.exact,false);
  form.onCancel();assert.equal(f.spring.def,original);assert.equal(f.spring.flexibleSpring,undefined);assert.equal(f.spring.flexibleSpringState,undefined);assert.equal(builds.get(f.spring),1);
  finish(true);assert.equal(await pending,false);assert.equal(f.spring.def,original);assert.equal(f.spring.flexibleSpringState,undefined);
});
