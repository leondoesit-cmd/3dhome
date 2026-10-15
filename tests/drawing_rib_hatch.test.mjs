import test from 'node:test';
import assert from 'node:assert/strict';
import {excludeRibHatch,sectionRibMasks} from '../js/core/section_rib_hatch.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeToMeshData,validateBrepForExport} from '../js/cad_kernel.js';
import {viewBasis} from '../js/core/hidden_line.js';
import {createProjector,createSheetDoc,addViewToSheet,buildSheetScene} from '../js/cad_sheet.js';
import {SECTION_HATCH_PATTERNS} from '../js/core/section_hatch.js';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';
import {cadWorkerMeshResult} from '../js/core/cad_worker_client.js';
const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
test('rib exclusion subtracts overlapping masks as a union and preserves holes',()=>{
  const line={x1:0,y1:2,x2:10,y2:2};
  assert.deepEqual(excludeRibHatch(line,[[rect(2,0,6,4)],[rect(4,0,8,4)]]),[{x1:0,y1:2,x2:2,y2:2},{x1:8,y1:2,x2:10,y2:2}]);
  assert.deepEqual(excludeRibHatch(line,[[rect(2,0,8,4),rect(4,1,6,3)]]),[{x1:0,y1:2,x2:2,y2:2},{x1:4,y1:2,x2:6,y2:2},{x1:8,y1:2,x2:10,y2:2}]);
});
test('native parallel rib delta excludes only longitudinal added material and survives mesh JSON',async()=>{
  const features=[
    {id:'base',type:'box',params:{x:0,y:0,z:0,w:10,h:2,d:10},inputs:[]},
    {id:'wall',type:'box',params:{x:8,y:2,z:0,w:2,h:6,d:10},inputs:[]},
    {id:'stock',type:'union',params:{},inputs:['base','wall']},
    {id:'rib',type:'rib',params:{orientation:'parallel',growthDirection:'negative-v',axis:'z',from:5,thickness:1,side:'both',extent:'up-to-body',points:[{u:1,v:2},{u:8,v:8}]},inputs:['stock']},
  ];
  let run=await regenerateFeatures({features});
  try {
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const solid=run.results.get('rib');assert.equal((await validateBrepForExport(solid)).valid,true);
    const mesh=JSON.parse(JSON.stringify(await shapeToMeshData(solid)));
    assert.equal(mesh.sectionRibs.length,1);assert.equal(mesh.sectionRibs[0].featureId,'rib');
    const plane={normal:{x:0,y:0,z:1},origin:{x:0,y:0,z:5}};
    const masks=sectionRibMasks([mesh],plane,viewBasis('front'));
    assert.deepEqual(masks.issues,[]);assert.equal(masks.groups.length,1);
    const loops=masks.groups.map(g=>g.loops.map(l=>l.map(p=>({x:p.u,y:p.v}))));
    assert.deepEqual(excludeRibHatch({x1:0,y1:1,x2:10,y2:1},loops),[{x1:0,y1:1,x2:10,y2:1}],'host base stays hatched');
    const cut=excludeRibHatch({x1:0,y1:3,x2:10,y2:3},loops);
    assert.equal(cut.length,2);assert.ok(Math.abs(cut[0].x2-13/6)<1e-5);assert.ok(Math.abs(cut[1].x1-8)<1e-5);
    assert.equal(sectionRibMasks([mesh],{normal:{x:1,y:0,z:0},origin:{x:4,y:0,z:0}},viewBasis('right')).groups.length,0,'transverse rib remains hatched');
    assert.equal(sectionRibMasks([mesh],{...plane,origin:{x:0,y:0,z:7}},viewBasis('front')).groups.length,0,'outside thickness');
    const doc=createSheetDoc({views:['top']}),parent=doc.views[0];
    const view=addViewToSheet(doc,'front',{parent:parent.id,section:{axis:'horizontal',at:-5,from:parent.id,flip:false,tag:'A'}});
    const project=createProjector(doc,[mesh]);
    const yes=project(view),no=project({...view,section:{...view.section,excludeLongitudinalRibs:false}});
    assert.equal(yes.ribHatchMasks.length,1);
    assert.deepEqual(yes.visible,no.visible,'solid silhouette unchanged');
    assert.deepEqual(yes.cuts,no.cuts,'actual material section unchanged');
    for(const pattern of SECTION_HATCH_PATTERNS) {
      view.hatchPattern=pattern.value;
      const scene=buildSheetScene(doc,{projection:createProjector(doc,[mesh])});
      const withMask=scene.items.filter(item=>item.style==='hatch'&&item.viewId===view.id);
      assert.ok(withMask.length>0,pattern.value+' leaves host hatching');
      view.section.excludeLongitudinalRibs=false;
      const full=buildSheetScene(doc,{projection:createProjector(doc,[mesh])}).items.filter(item=>item.style==='hatch'&&item.viewId===view.id);
      const length=items=>items.reduce((sum,l)=>sum+Math.hypot(l.x2-l.x1,l.y2-l.y1),0);
      assert.ok(length(withMask)<length(full),pattern.value+' removes rib ink');
      delete view.section.excludeLongitudinalRibs;
    }
  } finally {releaseRegeneration(run);}
  const execute=createCadWorkerExecutor();
  const transported=await execute({kind:'rebuild',document:{features},head:'rib',meshOnly:true});
  assert.equal(transported.ok,true);
  const restored=cadWorkerMeshResult(JSON.parse(JSON.stringify(transported.results.find(([id])=>id==='rib')[1])));
  assert.equal(restored.workerMeshData.sectionRibs[0].featureId,'rib','worker mesh/save payload retains exact delta');
  assert.equal(restored.sectionRibs[0].featureId,'rib','worker metadata survives restore');
  features.push({id:'later',type:'box',params:{x:0,y:0,z:0,w:1,h:1,d:1},inputs:[]},{id:'merged',type:'union',params:{},inputs:['rib','later']});
  run=await regenerateFeatures({features});
  try {assert.equal(run.ok,true,JSON.stringify(run.issues));assert.match(run.results.get('merged').sectionRibIssue,/downstream/);assert.equal(run.results.get('merged').sectionRibs,undefined);}finally{releaseRegeneration(run);}
});
