import test from 'node:test';
import assert from 'node:assert/strict';
import { createHoleWizardSketchPair, solveHoleWizardSketch, resolveHoleWizardInputs } from '../js/core/hole_wizard_sketches.js';
import { holeCutRecords, syncHoleCutPlacement } from '../js/core/hole_geometry.js';
import { compileKernelFeatureTree } from '../js/core/kernel_feature_adapter.js';
import { ensureParametricDocument, recordSketchInHistory, createFeatureDefinition } from '../js/core/parametric_document.js';
import { regenerateFeatures, releaseRegeneration } from '../js/cad_feature_tree.js';
import { shapeMassProperties } from '../js/cad_kernel.js';

function fixture() {
  const document=ensureParametricDocument({id:'test',features:[{id:'base',name:'Cylinder',type:'extrude',references:{sketches:['base-sketch']},params:{sketchId:'base-sketch',profileEntityIds:['circle'],depth:3.175}}],
    sketches:[{id:'base-sketch',name:'Base',referenceId:'plane:top',plane:'top',points:[{id:'centre',x:0,y:0}],entities:[{id:'circle',type:'circle',c:'centre',r:1.905}],constraints:[]}],history:[]});
  const params={cylindricalSource:{featureId:'base',circleId:'circle',faceReference:{persistentId:'base:side',ownerFeatureId:'base',descriptor:{surface:'cylinder'}}},
    cylinderTopDistance:.635,cylinderPlacementMethod:'constraints',cylinderConstraintBranch:'positive-z',holeType:'counterbore',standard:'ANSI Inch',fastenerType:'socket-head-cap-screw',standardSize:'1/4-shcs',fit:'normal',endCondition:'through-all',cboreDepth:.889};
  const pair=createHoleWizardSketchPair(params,document,{positionId:'position',profileId:'profile'});
  document.sketches.push(pair.position,pair.profile);recordSketchInHistory(document,pair.position);recordSketchInHistory(document,pair.profile);
  const feature=createFeatureDefinition(document,'hole',{id:'hole',name:'Counterbore',inputs:['base'],references:{features:['base'],sketches:['position','profile']},params:pair.params});
  return {document,...pair,feature};
}
test('persisted position and profile contain functional geometry and solve after JSON cold serialization',()=>{
  const f=fixture();assert.equal(f.position.points.length,3);assert.equal(f.profile.entities.length,6);
  assert.equal(f.position.status,'fully-defined');assert.equal(f.profile.status,'fully-defined');
  const doc=JSON.parse(JSON.stringify(f.document)),resolved=resolveHoleWizardInputs(doc.features.find(x=>x.id==='hole'),doc);
  assert.ok(Math.abs(resolved.placement.frame.origin.y-2.54)<1e-9);assert.equal(resolved.placement.frame.origin.z,1.905);
  assert.equal(resolved.params.cboreDepth,.889);
  assert.equal(doc.sketches.find(s=>s.id==='profile').frame.xAxis.z,-1);
});
test('independent position and profile dimensions drive shared compatibility and native inputs',()=>{
  const f=fixture();f.position.topDistance=.8;f.profile.dimensions.find(d=>d.name==='diameter').value=.8;
  f.profile.dimensions.find(d=>d.name==='cboreDepth').value=.95;
  // Stale aliases in feature params cannot override the actual profile.
  f.feature.params.diameterMm=123;
  const records=holeCutRecords(f.feature.params,null,[],f.document);
  assert.ok(Math.abs(records[0].params.frame.origin.y-2.375)<1e-8);assert.equal(records[0].params.diameter,.8);assert.equal(records[1].params.depth,.95);
  const compiled=compileKernelFeatureTree(f.document),tools=compiled.features.filter(x=>x.type==='holeTool');
  assert.equal(compiled.issues.filter(x=>x.severity==='error').length,0);
  assert.equal(tools.length,2);assert.equal(tools[0].params.diameter,.8);assert.equal(tools[1].params.depth,.95);
  assert.deepEqual(tools[0].params.frame,records[0].params.frame);
});
test('removed relation exposes real freedom and preserves free coordinates rather than reconstructing constraints',()=>{
  const f=fixture(),alongY=f.position.constraints.find(c=>c.type==='AlongY');alongY.enabled=false;
  const p=f.position.points.find(point=>point.role==='P');p.x=.3;p.z=Math.sqrt(1.905**2-.3**2);
  const run=solveHoleWizardSketch(f.position,f.document);
  assert.equal(run.status,'under-defined');assert.ok(run.degreesOfFreedom>0);assert.equal(p.x,.3);assert.ok(run.maxResidual<1e-8);
  assert.throws(()=>resolveHoleWizardInputs(f.feature,f.document),/fully defined/);
  alongY.enabled=true;assert.equal(solveHoleWizardSketch(f.position,f.document).status,'fully-defined');assert.ok(Math.abs(p.x)<1e-8);
});
test('source cylinder changes and explicit branch edits relocate genuine saved XYZ and profile frames',()=>{
  const f=fixture();f.document.features.find(x=>x.id==='base').params.depth=4;
  f.document.sketches.find(s=>s.id==='base-sketch').entities[0].r=2.2;
  f.position.branch='negative-z';const resolved=resolveHoleWizardInputs(f.feature,f.document);
  assert.ok(Math.abs(resolved.placement.frame.origin.y-3.365)<1e-8);assert.ok(Math.abs(resolved.placement.frame.origin.z+2.2)<1e-8);
  assert.equal(f.profile.frame.xAxis.z,1);assert.ok(Math.abs(f.profile.derivedExtent-4.40001)<1e-12);
});
test('malformed versions, sources, constraints and profile dimensions fail without legacy fallback',()=>{
  for(const change of [f=>f.position.sketchSchemaVersion=2,f=>f.position.constraints.push({type:'Fix'}),f=>f.position.constraints[0].points=['missing'],
    f=>f.profile.positionSketchId='wrong',f=>f.profile.dimensions.find(d=>d.name==='cboreDepth').value=10,
    f=>f.document.features.find(x=>x.id==='base').params.draftAngle=5,f=>f.position.suppressed=true]){
    const f=fixture();change(f);assert.throws(()=>resolveHoleWizardInputs(f.feature,f.document));
  }
  const f=fixture();f.profile.dimensions[0].driving=false;assert.equal(solveHoleWizardSketch(f.profile,f.document).status,'under-defined');
  assert.throws(()=>resolveHoleWizardInputs(f.feature,f.document),/under-defined/);
});
test('compatibility cut refresh updates dimensions and placement together after independent sketch edit',()=>{
  const f=fixture(),part={cuts3d:holeCutRecords(f.feature.params,null,[],f.document).map(r=>({...r,featureId:'hole'}))};
  f.profile.dimensions.find(d=>d.name==='diameter').value=.82;
  assert.equal(syncHoleCutPlacement(part,f.feature,null,f.document),true);assert.equal(part.cuts3d[0].params.diameter,.82);
  assert.equal(syncHoleCutPlacement(part,f.feature,null,f.document),false);
});
test('factory is atomic and legacy cylindrical params continue without invented sketches',()=>{
  const f=fixture(),old=JSON.stringify(f.document),legacy={...f.params};delete legacy.positionSketchId;delete legacy.holeProfileSketchId;
  const out=resolveHoleWizardInputs(legacy,f.document);assert.equal(out.placement.frame.origin.z,1.905);
  assert.equal(JSON.stringify(f.document),old);
  assert.throws(()=>createHoleWizardSketchPair({...legacy,holeType:'simple'},f.document),/counterbores/);assert.equal(JSON.stringify(f.document),old);
});
test('native two-sketch cold rebuild and independent profile edit change the actual single solid',async()=>{
  const f=fixture();
  async function native(){const compiled=compileKernelFeatureTree(JSON.parse(JSON.stringify(f.document)));assert.ok(compiled.ok,JSON.stringify(compiled.issues));return regenerateFeatures({...compiled.document,features:compiled.features});}
  const first=await native();assert.ok(first.ok,JSON.stringify(first.issues));
  try{
    const before=await shapeMassProperties(first.finalShape);assert.ok(before.volume>0 && before.volume<Math.PI*1.905**2*3.175);
    f.profile.dimensions.find(d=>d.name==='diameter').value=.85;f.position.topDistance=.8;
    const edited=await native();try{
      assert.ok(edited.ok,JSON.stringify(edited.issues));const after=await shapeMassProperties(edited.finalShape);
      assert.ok(after.volume<before.volume-.01,'larger driving bore actually removes more native solid');
      const origin=edited.results.get('hole:tool:bore').topology.find(ref=>ref.descriptor.surface==='cylinder').descriptor.referenceOrigin;
      assert.ok(Math.abs(origin.y-2.375)<1e-8);assert.ok(Math.abs(origin.z-1.905)<1e-8);
    }finally{releaseRegeneration(edited);}
  }finally{releaseRegeneration(first);}
});
