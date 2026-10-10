import test from 'node:test';
import assert from 'node:assert/strict';
import {createHoleWizardSketchPair,resolveHoleWizardInputs} from '../js/core/hole_wizard_sketches.js';
import {editedHoleWizardSketch,holeWizardSketchPolylines} from '../js/core/hole_wizard_sketch_edit.js';
import {ensureParametricDocument,recordSketchInHistory,createFeatureDefinition,dependentTargetIds,historyDependents,removeHistoryNode,suppressHistoryNode,reorderHistoryNode,activeHistoryTargetIds,setHistoryRollback,analyzeParametricHistory} from '../js/core/parametric_document.js';
import {buildDependencyGraph} from '../js/core/dependency_graph.js';
import {sketchDiagnostics} from '../js/core/rebuild.js';
import {validateDefinition} from '../js/core/schema.js';
import {readFileSync} from 'node:fs';
import {syncHoleCutPlacement,holeCutRecords} from '../js/core/hole_geometry.js';
import {holeCallout} from '../js/cad_hole_wizard.js';
function fixture(){
  const doc=ensureParametricDocument({id:'test',features:[{id:'base',name:'Cylinder',type:'extrude',references:{sketches:['base-sketch']},params:{sketchId:'base-sketch',profileEntityIds:['circle'],depth:3.175}}],sketches:[{id:'base-sketch',name:'Base',referenceId:'plane:top',plane:'top',points:[{id:'centre',x:0,y:0}],entities:[{id:'circle',type:'circle',c:'centre',r:1.905}],constraints:[]}],history:[]});
  const pair=createHoleWizardSketchPair({cylindricalSource:{featureId:'base',circleId:'circle'},cylinderTopDistance:.635,cylinderPlacementMethod:'constraints',holeType:'counterbore',standard:'ANSI Inch',fastenerType:'socket-head-cap-screw',standardSize:'1/4-shcs',fit:'normal',endCondition:'through-all',cboreDepth:.889},doc,{positionId:'position',profileId:'profile'});
  doc.sketches.push(pair.position,pair.profile);recordSketchInHistory(doc,pair.position);recordSketchInHistory(doc,pair.profile);
  createFeatureDefinition(doc,'hole',{id:'hole',inputs:['base'],references:{features:['base'],sketches:['position','profile']},params:pair.params});
  return doc;
}
const positionValues={topDistance:.8,branch:'negative-z',OnSurface:true,AlongZ:true,AlongY:true};
test('dedicated editor solves a nonmutating draft and position/profile inputs drive the same resolved cutters',()=>{
  const doc=fixture(),before=JSON.stringify(doc),position=editedHoleWizardSketch(doc,'position',positionValues);
  assert.equal(JSON.stringify(doc),before);assert.equal(position.result.status,'fully-defined');
  const resolved=resolveHoleWizardInputs(position.document.features.at(-1),position.document);assert.ok(Math.abs(resolved.placement.frame.origin.y-2.375)<1e-8);assert.equal(resolved.placement.frame.origin.z,-1.905);
  const profile=editedHoleWizardSketch(position.document,'profile',{diameter:.8,cboreDiameter:1.2,cboreDepth:.95});
  assert.equal(profile.result.status,'fully-defined');assert.equal(profile.sketch.params.standardSize,'custom');
  assert.equal(resolveHoleWizardInputs(profile.document.features.at(-1),profile.document).params.diameterMm,8);
  const lines=holeWizardSketchPolylines(profile.sketch);assert.equal(lines.length,6);assert.deepEqual(lines[0][0],{x:0,y:2.375,z:-1.905});assert.ok(Math.abs(lines[2][0].z+.955)<1e-8);
});
test('relation removal is an actual underdefined draft; invalid dimensions and foreign editing do not mutate source',()=>{
  const doc=fixture(),before=JSON.stringify(doc),edited=editedHoleWizardSketch(doc,'position',{...positionValues,AlongY:false});
  assert.equal(edited.result.status,'under-defined');assert.equal(edited.result.degreesOfFreedom,2);
  assert.throws(()=>resolveHoleWizardInputs(edited.document.features.at(-1),edited.document),/fully defined|under-defined/);
  const invalid=editedHoleWizardSketch(doc,'profile',{diameter:.8,cboreDiameter:.5,cboreDepth:.9});assert.equal(invalid.result.status,'inconsistent');
  assert.throws(()=>editedHoleWizardSketch(doc,'base-sketch',{}),/supported/);assert.equal(JSON.stringify(doc),before);
});
test('source-to-position-to-profile-to-hole dependencies control deletion and history ordering',()=>{
  const doc=fixture();assert.deepEqual([...dependentTargetIds(doc,['base'])].sort(),['hole','position','profile']);
  assert.deepEqual(historyDependents(doc,'history:sketch:position').map(e=>e.targetId),['profile','hole']);
  assert.equal(removeHistoryNode(doc,'history:sketch:position').ok,false);assert.equal(removeHistoryNode(doc,'history:feature:base').ok,false);
  const history=JSON.stringify(doc.history);assert.equal(reorderHistoryNode(doc,'history:sketch:profile',1).ok,false);assert.equal(JSON.stringify(doc.history),history);
  assert.equal(buildDependencyGraph(doc).issues.length,0);
  assert.equal(removeHistoryNode(doc,'history:feature:hole').ok,true);assert.equal(removeHistoryNode(doc,'history:sketch:profile').ok,true);assert.equal(removeHistoryNode(doc,'history:sketch:position').ok,true);
});
test('suppression cascades through both sketches, respects explicit child suppression and rollback excludes cutters',()=>{
  const doc=fixture();suppressHistoryNode(doc,'history:sketch:profile',true);suppressHistoryNode(doc,'history:feature:base',true);
  assert.equal(activeHistoryTargetIds(doc).has('hole'),false);suppressHistoryNode(doc,'history:feature:base',false);
  assert.equal(doc.sketches.find(s=>s.id==='position').suppressed,false);assert.equal(doc.sketches.find(s=>s.id==='profile').suppressed,true);
  const restored=fixture();setHistoryRollback(restored,3);assert.deepEqual([...activeHistoryTargetIds(restored)],['base-sketch','base','position']);
  restored.sketches.find(s=>s.id==='position').suppressed=true;restored.history.find(e=>e.targetId==='position').suppressed=true;setHistoryRollback(restored,null);assert.equal(activeHistoryTargetIds(restored).has('hole'),false);
});
test('cold history and solve dispatch diagnose malformed and unconstrained sketches without planar false badges',()=>{
  const doc=ensureParametricDocument(JSON.parse(JSON.stringify(fixture())));assert.equal(analyzeParametricHistory(doc).ok,true);
  const position=doc.sketches.find(s=>s.id==='position');position.constraints.find(c=>c.type==='AlongY').enabled=false;
  const diagnostics=sketchDiagnostics(doc,{});assert.equal(diagnostics.issues.find(i=>i.sketchId==='position' && i.code==='under-constrained-sketch').dof,2);
  assert.ok(diagnostics.issues.some(i=>i.sketchId==='profile' && i.severity==='error'));
  position.sketchSchemaVersion=99;assert.ok(validateDefinition(doc).some(i=>i.code==='unsupported-sketch-subtype'));
  position.positionSketchId='profile';assert.ok(buildDependencyGraph(doc).issues.some(i=>i.code==='sketch-cycle'));
});

function actualEditor(exact){
  const document=fixture(),records=holeCutRecords(document.features.at(-1).params,null,[],document);records.forEach(record=>record.featureId='hole');document.parts=[{id:'part',cuts3d:records}];
  const E={def:document,mode:'3d',massEditRevision:1},state={undo:0,node:'initial',spec:null,releases:0};
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),body=source.slice(source.indexOf('function editHoleWizardSketch('),source.indexOf('\nfunction editSketchFromHistory('));
  const env={E,root:{querySelector:()=>({appendChild(){}})},setMode(){},cloneData:structuredClone,updatePreview(){},modelLengthText:v=>String(v),editedHoleWizardSketch,
    openQuickForm:spec=>{state.spec=spec;return {};},el:()=>({setAttribute(){},textContent:''}),resolveHoleWizardInputs,holeCallout,syncHoleCutPlacement,
    exactDisplayBody:async part=>{await exact?.(part,state);return {release(){state.releases++;}};},currentHistoryNode:()=>state.node,pushUndo(){state.undo++;E.massEditRevision++;},
    invalidatePartMeshAfterEdit(){},syncSketchDrivenParts(){},scheduleModelerDraft(){}};
  new Function(...Object.keys(env),body+'; return editHoleWizardSketch;')(...Object.values(env))(document.sketches.find(s=>s.id==='position'));
  return {E,state,document};
}
test('actual dedicated editor validates before one Undo, commits driving sketch geometry, and Cancel preserves document',async()=>{
  const f=actualEditor(),before=JSON.stringify(f.document);f.state.spec.onLive({...positionValues,topDistance:.75});assert.equal(JSON.stringify(f.document),before);
  f.state.spec.onCancel();assert.equal(JSON.stringify(f.document),before);assert.equal(f.state.undo,0);
  assert.equal(await f.state.spec.onApply(positionValues),true);assert.equal(f.state.undo,1);assert.equal(f.state.releases,1);
  assert.equal(f.E.def.sketches.find(s=>s.id==='position').topDistance,.8);assert.equal(f.E.def.parts[0].cuts3d[0].params.frame.origin.z,-1.905);
});
test('actual dedicated editor rejects native failure and stale Undo/Redo without publishing a draft or Undo',async()=>{
  const failed=actualEditor(()=>{throw new Error('Native counterbore rejected');}),before=JSON.stringify(failed.document);
  assert.equal(await failed.state.spec.onApply(positionValues),false);assert.equal(JSON.stringify(failed.document),before);assert.equal(failed.state.undo,0);
  const stale=actualEditor((part,state)=>{state.node='undone';}),initial=JSON.stringify(stale.document);
  assert.equal(await stale.state.spec.onApply(positionValues),false);assert.equal(JSON.stringify(stale.document),initial);assert.equal(stale.state.undo,0);assert.equal(stale.state.releases,1);
});
