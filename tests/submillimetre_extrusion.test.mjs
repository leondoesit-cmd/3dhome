import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readFeatureParameterForm} from '../js/modeler_feature_form.js';
import {featureDefaults} from '../js/core/feature_catalog.js';
import {createFeatureDefinition,createPartDocument} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
import {extrusionPreviewDirection} from '../js/core/extrusion_projection.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function fn(start,next){const at=source.indexOf(start);return source.slice(at,source.indexOf('\nfunction '+next+'(',at));}
function fixture() {
  const document=createPartDocument({id:'thin-boss'}),sketch={id:'thin-profile',plane:'top',offset:0,points:[],entities:[],constraints:[]};
  document.sketches=[sketch];
  document.history=[{id:'sketch-history',kind:'sketch',targetId:sketch.id}];
  const area={points:[{u:0,v:0},{u:2,v:0},{u:2,v:2},{u:0,v:2}],holes:[]};
  const E={def:document,depth:60,baseOff:0,authoring:{}};
  const noop=()=>{},bindings={E,featureDefaults,sketchProfileAnalysis:()=>({branchPoints:[],openEnds:[],tolerance:1e-6}),
    extrusionSketchAreas:()=>[area],ensureSketch:()=>sketch,selectedSolid:()=>null,activeParts:()=>document.parts,
    isUpToFace:()=>false,planeAxis:()=> 'y',resolveExtrudeExtent:params=>params,
    flash:noop,t:key=>key,pushUndo:noop,healSketchEndpoints:()=>0,recordSketchInHistory:noop,
    isCanonicalAuthoring:()=>true,createFeatureDefinition,cloneData:structuredClone,uid:()=> 'thin-body',
    partBounds:()=>({}),mergeTargetBody:()=>null,H:{discard:noop},addPart:part=>document.parts.push(part),
    scheduleExactMesh:noop,refreshAll:noop,featureTypeLabel:key=>key};
  const create=new Function(...Object.keys(bindings),fn('async function extrudeClosedSketch(','sketchLinePoints')+';return extrudeClosedSketch;')(...Object.values(bindings));
  const preview=new Function(...Object.keys(bindings),fn('function extrudePreviewParts(','finishCommandActive')+';return extrudePreviewParts;')(...Object.values(bindings));
  return {document,create,preview};
}

for(const [raw,expected] of [['0.8',.08],['0.4 + 0.4',.08],['0.032 in',.08128]]) {
  test('Apply reads submillimetre extrusion directly without depending on blur: '+raw,async()=>{
    const input={value:raw,closest:()=>null};
    const field={key:'depth',type:'number',unit:'length',inputUnit:'mm',min:1e-6};
    const values=readFeatureParameterForm([{input,field}],{depth:.1});
    assert.equal(values.valid,true);
    assert.ok(Math.abs(values.params.depth-expected)<1e-12);
    const f=fixture();
    const preview=f.preview('extrude',values.params)[0];
    assert.ok(Math.abs(preview.to-preview.from-expected)<1e-12);
    assert.equal(await f.create({type:'extrude',...values.params}),true);
    assert.ok(Math.abs(f.document.features[0].params.depth-expected)<1e-12);
    assert.ok(Math.abs(f.document.parts[0].to-f.document.parts[0].from-expected)<1e-12);
  });
}

test('new 0.8mm boss retains its thickness through saved recipe and exact native rebuild',async()=>{
  const f=fixture();assert.equal(await f.create({type:'extrude',depth:.08}),true);
  f.document.features[0].params.to=.1; // Older features keep the original compiled span snapshot after a depth edit.
  const reopened=JSON.parse(JSON.stringify(f.document)),compiled=compileKernelFeatureTree(reopened);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  assert.ok(Math.abs(compiled.features.at(-1).params.to-.08)<1e-12,'typed blind depth overrides the old from/to snapshot');
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const mass=await shapeMassProperties(run.finalShape);
    assert.ok(Math.abs(mass.volume-.32)<1e-7,'20mm × 20mm × 0.8mm is 0.32 cm³, never silently1mm');
  } finally {releaseRegeneration(run);}
});

for(const merged of [false,true])test('submillimetre feature edit keeps '+(merged?'merged boss':'body')+' projection at the typed thickness',()=>{
  const f=fixture(),feature={id:'boss',type:'extrude',params:{depth:.08,from:0,to:.1},references:{sketches:['thin-profile']}};
  const part={id:'thin',kind:'ext',axis:'y',from:0,to:.1,...(!merged?{featureId:'boss'}:{})};
  const merge={axis:'y',from:0,to:.1};
  f.document.parts=[part];
  const noop=()=>{},bindings={E:{def:f.document},transitionExtrudeProjection:()=>[],
    extrusionPreviewDirection,mergeRecordFor:()=>merged?{part,merge}:null,
    markLiveDirtyPart:noop,scheduleExactMesh:noop,invalidatePartMeshAfterEdit:noop,FINISH_AMOUNT_KEY:{},cloneData:structuredClone};
  const sync=new Function(...Object.keys(bindings),sourceFunctionText(source,'syncProjectionFromFeature')+';return syncProjectionFromFeature;')(...Object.values(bindings));
  sync(feature);
  const projection=merged?merge:part;
  assert.ok(Math.abs(projection.to-projection.from-.08)<1e-12);
  assert.equal(feature.params.to,.1,'the typed depth remains authoritative over the historical snapshot');
});
