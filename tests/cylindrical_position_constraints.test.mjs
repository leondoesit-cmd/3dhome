import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {solveCylindricalPositionConstraints} from '../js/core/cylindrical_position_constraints.js';
import {cylindricalHolePlacement} from '../js/core/cylindrical_hole_placement.js';
import {featureDefaults,featureEditorGroups} from '../js/core/feature_catalog.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

const graphInput={centre:{x:0,z:0},radius:1.905,top:3.175,bottom:0,topDistance:.635};
function sourceFixture(){
  const doc=JSON.parse(readFileSync(new URL('../artifacts/planchard/EXERCISE-5.17-radial-counterbore-browser-2026-10-01.mforge',import.meta.url),'utf8')).mainModel;
  const boss=doc.features[0],hole=doc.features[1],sketch=doc.sketches[0];
  boss.params.depth=3.175;boss.params.to=3.175;sketch.entities.find(e=>e.type==='circle').r=1.905;
  Object.assign(hole.params,{cylinderPlacementMethod:'constraints',cylinderConstraintBranch:'positive-z',cylinderOnSurface:true,cylinderAlongZ:true,cylinderAlongY:true,cylinderAngle:90});
  return doc;
}
test('source dimension graph solves actual XYZ points and construction line with rank-nine zero-DOF residuals',()=>{
  const graph=solveCylindricalPositionConstraints(graphInput);
  assert.equal(graph.status,'fully-defined');assert.equal(graph.degreesOfFreedom,0);assert.ok(graph.maxResidual<1e-12);
  assert.deepEqual(graph.points,{A:{x:0,y:3.175,z:0},B:{x:0,y:3.175,z:1.905},P:{x:0,y:2.54,z:1.905}});
  assert.equal(graph.construction.construction,true);assert.equal(graph.relations.find(r=>r.type==='OnSurface').residuals[0],0);
});
test('editable relation removal produces genuine remaining degrees of freedom',()=>{
  for(const [key,expected] of [['onSurface',1],['alongZ',1],['alongY',2]]){
    const graph=solveCylindricalPositionConstraints({...graphInput,[key]:false});assert.equal(graph.status,'under-defined');assert.equal(graph.degreesOfFreedom,expected);
  }
});
test('construction source edits and explicit branch preserve axis/surface relations instead of a frozen point',()=>{
  const graph=solveCylindricalPositionConstraints({...graphInput,centre:{x:2,z:-3},radius:2.5,top:5,bottom:1,branch:'negative-z'});
  assert.deepEqual(graph.points.P,{x:2,y:4.365,z:-5.5});assert.equal(graph.status,'fully-defined');assert.equal(graph.branch,'negative-z');
  assert.ok(graph.relations.flatMap(r=>r.residuals).every(value=>Math.abs(value)<1e-12));
});
test('invalid dimensions, invalid relations and ambiguous side reject without source writes',()=>{
  const before=JSON.stringify(graphInput);
  for(const input of [{topDistance:0},{topDistance:3.175},{radius:0},{top:NaN},{branch:'unknown'},{alongZ:'yes'}])assert.throws(()=>solveCylindricalPositionConstraints({...graphInput,...input}),/must lie|valid cylindrical|explicitly/);
  assert.equal(JSON.stringify(graphInput),before);
});
test('feature placement consumes solved graph, ignores inactive angular control and rejects underdefined native lowering',()=>{
  const doc=sourceFixture(),hole=doc.features[1],before=JSON.stringify(doc),placement=cylindricalHolePlacement(hole.params,doc);
  assert.deepEqual(placement.frame.origin,{x:0,y:2.54,z:1.905});assert.deepEqual(placement.axis,{x:0,y:0,z:1});
  const compiled=compileKernelFeatureTree(doc);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const tool=compiled.features.find(f=>f.id===hole.id+':tool:bore');assert.deepEqual(tool.params.frame.origin,placement.positionGraph.points.P);
  assert.equal(tool.params.positionGraph.status,'fully-defined');assert.equal(JSON.stringify(doc),before);
  hole.params.cylinderAngle=NaN;assert.deepEqual(cylindricalHolePlacement(hole.params,doc).frame.origin,placement.frame.origin,'inactive angular field cannot invalidate constraint-driven geometry');
  hole.params.cylinderAlongY=false;const invalidBefore=JSON.stringify(doc);const failed=compileKernelFeatureTree(doc);
  assert.equal(failed.ok,false);assert.ok(failed.issues.some(i=>/under-defined.*2 DOF/.test(i.message)));assert.equal(JSON.stringify(doc),invalidBefore);
});
test('native graph-driven counterbore has the intended source position and same solid as angular zero equivalent through cold source edits',async()=>{
  const doc=sourceFixture(),hole=doc.features[1],boss=doc.features[0];
  async function rebuild(){const compiled=compileKernelFeatureTree(JSON.parse(JSON.stringify(doc)));assert.ok(compiled.ok,JSON.stringify(compiled.issues));return regenerateFeatures({...compiled.document,features:compiled.features});}
  const constrained=await rebuild();assert.ok(constrained.ok,JSON.stringify(constrained.issues));
  try{
    const graphProps=await shapeMassProperties(constrained.finalShape),tool=constrained.results.get(hole.id+':tool:bore');
    const axis=tool.topology.find(ref=>ref.descriptor.surface==='cylinder').descriptor.referenceOrigin;
    assert.ok(Math.abs(axis.x)<1e-9);assert.ok(Math.abs(axis.y-2.54)<1e-9);assert.ok(Math.abs(axis.z-1.905)<1e-9);
    hole.params.cylinderPlacementMethod='angular';hole.params.cylinderAngle=0;const equivalent=await rebuild();
    try{assert.ok(equivalent.ok);const props=await shapeMassProperties(equivalent.finalShape);assert.ok(Math.abs(props.volume-graphProps.volume)<1e-8);}finally{releaseRegeneration(equivalent);}
    hole.params.cylinderPlacementMethod='constraints';hole.params.cylinderConstraintBranch='negative-z';boss.params.depth=4;boss.params.to=4;
    const changed=await rebuild();try{assert.ok(changed.ok);const point=changed.results.get(hole.id+':tool:bore').topology.find(ref=>ref.descriptor.surface==='cylinder').descriptor.referenceOrigin;assert.ok(Math.abs(point.y-3.365)<1e-9);assert.ok(Math.abs(point.z+1.905)<1e-9);}finally{releaseRegeneration(changed);}
  }finally{releaseRegeneration(constrained);}
});
test('actual Hole Wizard catalog exposes relation edits and keeps the legacy angular default',()=>{
  const defaults=featureDefaults('hole');assert.equal(defaults.cylinderPlacementMethod,'angular');assert.equal(defaults.cylinderOnSurface,true);
  const fields=featureEditorGroups('hole').find(g=>g.id==='cylindricalPosition').fields;
  assert.ok(fields.find(f=>f.key==='cylinderPlacementMethod').choices.some(choice=>choice.value==='constraints'));
  for(const key of ['cylinderOnSurface','cylinderAlongZ','cylinderAlongY'])assert.equal(fields.find(f=>f.key===key).type,'boolean');
});
test('actual create handler rejects a removed placement relation before geometry, history or Undo mutation',async()=>{
  const doc=sourceFixture(),params={...doc.features[1].params,cylinderOnSurface:false},source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),before=JSON.stringify(doc),messages=[];
  const context={E:{def:doc,topologySelection:[]},featureDefaults,modelLengthUnit:()=> 'in',selectedSolid:()=>doc.parts[0],cylindricalHolePlacement,flash:value=>messages.push(value)};
  const create=new Function(...Object.keys(context),sourceFunctionText(source,'createHoleFeature')+';return createHoleFeature;')(...Object.values(context));
  assert.equal(await create(params),false);assert.match(messages[0],/under-defined.*1 DOF/);assert.equal(JSON.stringify(doc),before);
});
test('shared creation/edit UI readout displays solved XYZ/DOF and updates actual relation status without writing geometry',()=>{
  const doc=sourceFixture(),state={id:'existing-hole',params:doc.features[1].params},source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),nodes=[];let live;
  const context={E:{def:doc},renderFeatureParameterFormCore:(host,type,state,callback)=>{live=callback;return [];},modelLengthUnit:()=> 'mm',modelLengthText:(v)=>String(v*10),cylindricalHolePlacement,FEATURE_PATTERN_SEED_TYPES:[],featureReferenceOptions(){},t:key=>key,
    el:()=>({textContent:'',setAttribute(){}})};
  const render=new Function(...Object.keys(context),sourceFunctionText(source,'renderFeatureParameterForm')+';return renderFeatureParameterForm;')(...Object.values(context));
  const before=JSON.stringify(doc);render({appendChild:node=>nodes.push(node)},'hole',state);
  assert.match(nodes[0].textContent,/fully-defined · 0 DOF/);assert.match(nodes[0].textContent,/P \(0, 25.4, 19.05\)/);
  live({params:{...state.params,cylinderAlongY:false}});assert.match(nodes[0].textContent,/under-defined · 2 DOF/);
  assert.equal(JSON.stringify(doc),before);
});
