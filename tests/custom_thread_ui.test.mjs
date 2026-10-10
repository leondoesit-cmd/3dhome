import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeThreadSpec, validateThreadFeature, cosmeticThread, modeledThreadSolid } from '../js/cad_thread.js';
import { threadPlacementFromFace } from '../js/core/thread_placement.js';
import { createFeatureDefinition } from '../js/core/parametric_document.js';
import {canonicalFeatureTopologyReferences} from '../js/core/feature_input_stage.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {topologyReferenceFromEntry} from '../js/modeler_pick_geometry.js';
import {applyDocumentTopologyRebindings,createTopologyRegistry,resolveFeatureTopologyReferences} from '../js/core/topology.js';

const source = fs.readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');
function fn(name, next) {
  const start = source.indexOf('function ' + name + '(');
  return source.slice(start, source.indexOf('\nfunction ' + next + '(', start));
}
const custom = {threadPreset:'custom', side:'internal', mode:'cosmetic', diameterMm:8, pitchMm:4, length:1.2,
  origin:{x:-.6,y:0,z:0}, axis:{x:1,y:0,z:0}};

test('custom designer thread retains four millimetre lead and X bore placement through save without standards claims', () => {
  const spec = normalizeThreadSpec({...custom, standard:'ISO 262:2023', toleranceClass:'6H'});
  assert.equal(spec.standard,null);
  assert.equal(spec.toleranceClass,'');
  assert.equal(spec.flankAngleDeg,null);
  assert.equal(spec.family,'custom-thread');
  assert.equal(spec.turns,3);
  const restored = JSON.parse(JSON.stringify(spec));
  assert.equal(validateThreadFeature(restored).ok,true);
  assert.equal(validateThreadFeature(restored).computed.fitStatus,'designer-specification');
  const annotation = cosmeticThread(restored);
  const record = createFeatureDefinition({},'thread',{params:restored});
  assert.equal(record.params.threadPreset,'custom');
  assert.equal(record.params.series,'custom');
  assert.match(annotation.callout,/Custom thread \(designer specification\).*pitch 4 mm/);
  assert.doesNotMatch(annotation.callout,/ISO|UNC|UNF|6H|M8/);
  assert.equal(annotation.threadGeometry.profile,'custom-cosmetic-helix');
  assert.equal(annotation.threadGeometry.flankAngleDeg,null);
  assert.ok(Math.abs(Math.min(...annotation.overlay.map(p=>p.x))+.6)<1e-10);
  assert.ok(Math.abs(Math.max(...annotation.overlay.map(p=>p.x))-.6)<1e-10);
});

test('custom cosmetics validate dimensions, axis, runout and reject modeled or standard fit claims', () => {
  for (const update of [{diameterMm:0},{pitchMm:-1},{length:0},{axis:{x:0,y:0,z:0}},
    {runoutStartMm:12},{mode:'modeled'},{fitLimits:{}}]) {
    assert.equal(validateThreadFeature({...custom,...update}).ok,false,JSON.stringify(update));
  }
  assert.throws(()=>modeledThreadSolid({...custom,mode:'modeled'}),/cosmetic display only/);
  assert.equal(validateThreadFeature({...custom,threadPreset:'iso-metric'}).ok,false);
  assert.equal(validateThreadFeature({...custom,threadPreset:'iso-metric',pitchMm:1.25}).ok,true);
});

function command(selectedFace, document=null, sourceId='body-feature') {
  const body = {id:'body',kind:'brep'}, records=[], messages=[];
  const E = {def:document || {}};
  const bindings={E, featureDefaults:()=>({}), selectedThreadStart:()=>selectedFace?{face:selectedFace,placement:threadPlacementFromFace(selectedFace.descriptor)}:null,
    selectedSolid:()=>body, flash:s=>messages.push(s), t:s=>s,canonicalFeatureTopologyReferences,
    threadPlacementFromFace, cutTargetFeatureId:()=> sourceId, normalizeThreadSpec,
    validateThreadFeature, modeledThreadSolid, pushUndo:()=>{}, isCanonicalAuthoring:()=>true,
    createFeatureDefinition:(doc,type,record)=>{if(document)createFeatureDefinition(doc,type,record);records.push({type,...record});}, cloneData:structuredClone,
    H:{discard(){}}, cosmeticThread, refreshAll:()=>{}, threadCallout:spec=>cosmeticThread(spec).callout};
  const create = new Function(...Object.keys(bindings),fn('createThreadFeature','createKnurlFeature')+'; return createThreadFeature;')(...Object.values(bindings));
  return {create, records, messages, body};
}

test('Thread command refuses a selected body with no cylindrical face instead of silently using world Y', () => {
  const fixture=command(null);
  assert.equal(fixture.create(custom),false);
  assert.deepEqual(fixture.records,[]);
  assert.equal(fixture.body.cosmeticThread,undefined);
  assert.deepEqual(fixture.messages,['threadNeed']);
});

test('browser-authored trunnion cut-bore thread compiles and rebuilds without treating internal cutter as an authoring dependency', async () => {
  const document=JSON.parse(fs.readFileSync(new URL('./fixtures/clamp-trunnion-browser-recipe.json',import.meta.url),'utf8'));
  const previousFeatures=structuredClone(document.features),head=document.features.at(-1).id;
  const compiled=compileKernelFeatureTree(document);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  let original,threaded;
  try {
    original=await regenerateFeatures({...compiled.document,features:compiled.features});
    assert.equal(original.ok,true,JSON.stringify(original.issues));
    const cut=document.features.find(feature=>feature.type==='extrudeCut');
    const bore=original.results.get(head).topology.find(entry=>entry.kind==='face' && entry.descriptor.surface==='cylinder'
      && Math.abs(entry.descriptor.radius-.41)<1e-6 && Math.abs(entry.descriptor.axis.x)>.99);
    assert.ok(bore,'pick the actual native cylindrical wall of the authored Ø8.2 X bore');
    const picked=topologyReferenceFromEntry(bore),pickedSnapshot=structuredClone(picked);
    assert.equal(picked.ownerFeatureId,cut.id+':tool');
    const fixture=command(picked,document,head);
    assert.equal(fixture.create(custom),true);
    const annotation=fixture.body.cosmeticThread;
    assert.ok(Math.abs(annotation.spec.origin.x-.6)<1e-6,'native bore thread starts at X+6mm, not the face centroid');
    assert.equal(annotation.spec.axis.x,-1);
    assert.ok(Math.abs(Math.min(...annotation.overlay.map(point=>point.x))+.6)<1e-6);
    assert.ok(Math.abs(Math.max(...annotation.overlay.map(point=>point.x))-.6)<1e-6);
    assert.deepEqual(picked,pickedSnapshot,'creation must not mutate native selection or topology cache');
    assert.deepEqual(document.features.slice(0,-1),previousFeatures,'upstream cut and bosses remain unchanged');
    const reference=document.features.at(-1).references.topology[0];
    assert.equal(reference.ownerFeatureId,cut.id);
    assert.equal(reference.persistentId,picked.persistentId);
    reference.persistentId='old-browser-bore-name';
    const resolution=resolveFeatureTopologyReferences(document.features.at(-1),createTopologyRegistry(original.results.get(head).topology));
    assert.equal(resolution.resolutions[0].status,'rebound');
    assert.equal(resolution.resolutions[0].topology.ownerFeatureId,cut.id+':tool');
    assert.equal(applyDocumentTopologyRebindings(document,resolution.resolutions).length,1);
    assert.equal(reference.ownerFeatureId,cut.id,'saving a rebind must not persist the internal cutter owner as a dependency');
    assert.equal(reference.persistentId,picked.persistentId);
    assert.deepEqual(document.features.slice(0,-1),previousFeatures,'saving repairs leaves the earlier cut history unchanged');
    const reopened=JSON.parse(JSON.stringify(document));
    const next=compileKernelFeatureTree(reopened);
    assert.equal(next.ok,true,JSON.stringify(next.issues));
    threaded=await regenerateFeatures({...next.document,features:next.features});
    assert.equal(threaded.ok,true,JSON.stringify(threaded.issues));
    assert.ok(threaded.finalShape.shape);
    assert.equal(threaded.results.get(reopened.features.at(-1).id).spec.pitchMm,4);
    assert.ok(Math.abs(threaded.results.get(reopened.features.at(-1).id).spec.axis.x)>.99);
  } finally {releaseRegeneration(original);releaseRegeneration(threaded);}
});

test('circular planar caps are not accepted as cylindrical thread support faces', () => {
  const E={topologySelection:[{kind:'face',descriptor:{surface:'plane',radius:.4,normal:{x:0,y:1,z:0}}}]};
  const selected=new Function('E',fn('selectedCylindricalFace','createHelixFeature')+';return selectedCylindricalFace;')(E);
  assert.equal(selected(),null);
  const bore={kind:'face',descriptor:{surface:'cylinder',radius:.41,axis:{x:1,y:0,z:0}}};
  E.topologySelection.push(bore);
  assert.equal(selected(),bore);
});

test('Thread command records picked native X bore topology and starts at its near boundary', () => {
  const face={kind:'face',topologyId:'bore',descriptor:{surface:'cylinder',radius:.41,
    origin:{x:0,y:0,z:0},axis:{x:1,y:0,z:0},along:{min:-.6000001,max:.6000001}}};
  const fixture=command(face);
  assert.equal(fixture.create(custom),true);
  assert.deepEqual(fixture.records[0].references.topology,[face]);
  assert.deepEqual(fixture.records[0].params.origin,{x:-.6,y:0,z:0});
  assert.deepEqual(fixture.records[0].params.axis,{x:1,y:0,z:0});
  assert.equal(fixture.body.cosmeticThread.spec.pitchMm,4);
});

test('Thread preview and live selection show the cylindrical face requirement rather than generic preview readiness', () => {
  const badge={classList:{toggle(){}},textContent:''};
  const E={authoring:{}};
  const preview = new Function('E','FINISH_FEATURES','selectedThreadStart','t',
    fn('syncNewFeaturePreview','syncPatternOverlapBadge')+';return syncNewFeaturePreview;')(
      E,[],()=>null,key=>key);
  preview('thread',{params:{}},badge);
  assert.equal(badge.textContent,'threadNeed');
  assert.deepEqual(E.authoring.previewParts,[]);
});

test('custom Thread property manager preserves editable diameter and pitch while removing modeled and standards claims', () => {
  const state={params:{threadPreset:'custom',mode:'modeled',toleranceClass:'6H',useFitLimits:true}};
  const controls=['threadPreset','mode','diameterMm','pitchMm','series','toleranceClass','useFitLimits'].map(key=>{
    const classes=new Set(), listeners={};
    const wrap={classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}}};
    const input={value:state.params[key]??'',type:key==='useFitLimits'?'checkbox':'select',checked:true,
      closest:()=>wrap,addEventListener:(event,callback)=>listeners[event]=callback};
    return {field:{key},input,classes,listeners};
  });
  const bindings={E:{def:{features:[]}},renderFeatureParameterFormCore:()=>controls,el:()=>{},
    modelLengthUnit:()=> 'mm',featureReferenceOptions:()=>[],FEATURE_PATTERN_SEED_TYPES:[],t:key=>key};
  const render=new Function(...Object.keys(bindings),fn('renderFeatureParameterForm','featureField')+';return renderFeatureParameterForm;')(...Object.values(bindings));
  render({},'thread',state,()=>{});
  const byKey=key=>controls.find(control=>control.field.key===key);
  assert.equal(byKey('mode').input.value,'cosmetic');
  assert.equal(byKey('mode').input.disabled,true);
  assert.equal(byKey('diameterMm').input.disabled,false);
  assert.equal(byKey('pitchMm').input.disabled,false);
  assert.equal(byKey('toleranceClass').input.value,'');
  assert.equal(byKey('useFitLimits').input.checked,false);
  for(const key of ['series','toleranceClass','useFitLimits'])assert.ok(byKey(key).classes.has('parameter-hidden'));
  byKey('threadPreset').input.value='iso-metric';
  byKey('threadPreset').listeners.change();
  assert.equal(byKey('mode').input.disabled,false);
  assert.equal(byKey('toleranceClass').input.disabled,false);
  for(const key of ['series','toleranceClass','useFitLimits'])assert.equal(byKey(key).classes.has('parameter-hidden'),false);
});
