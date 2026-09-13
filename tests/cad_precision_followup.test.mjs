import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMassProperties } from '../js/cad_mass_properties.js';
import { exactBrepForPart } from '../js/modeler_part_geometry.js';
import { makeBrepRevolve,shapeMassProperties,disposeBrep } from '../js/cad_kernel.js';
import { holeCutRecords,holePreviewParts } from '../js/core/hole_geometry.js';
import { toolFeatureRecipe,translateToolRecord } from '../js/core/tool_recipe.js';
import { holeWizardThread } from '../js/cad_hole_wizard.js';
import { compileKernelFeatureTree } from '../js/core/kernel_feature_adapter.js';
import { regenerateFeatures,releaseRegeneration } from '../js/cad_feature_tree.js';
import { convertLegacyDocument,evaluateMigration,migrationGeometrySummary } from '../js/core/migration_check.js';
import { rebuildDefinition } from '../js/core/rebuild.js';
import { rebuildParametricDocument } from '../js/core/parametric_rebuild.js';
import { revolveRecipe } from '../js/core/revolve_geometry.js';
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const stock={id:'stock',kind:'box',x0:0,x1:4,y0:0,y1:10,z0:0,z1:4};
const sketch={id:'s',plane:'top',points:[{id:'c',x:2,y:2}],entities:[{id:'circle',type:'circle',c:'c',r:1}],constraints:[]};
test('mass report measures the modified exact solid and reports centroidal inertia in kg m2',async()=>{
 const body={...stock,cuts3d:holeCutRecords({holeType:'simple',diameter:1,depth:2,endCondition:'blind'},sketch)};
 const mass=await evaluateMassProperties({parts:[body]},{density:1});
 assert.equal(mass.accuracy,'exact',JSON.stringify(mass));near(mass.volumeCm3,160-Math.PI/2);assert.ok(mass.centerOfMass.y>5);assert.ok(mass.inertiaKgM2[0][0]>0);
 const box=await evaluateMassProperties({parts:[stock]},{density:1});
 near(box.inertiaKgM2[0][0],160*(100+16)/12*1e-7);
 const translated={...stock,id:'other',x0:10,x1:14};
 const combined=await evaluateMassProperties({parts:[stock,translated]},{density:1});
 near(combined.centerOfMass.x,7);near(combined.inertiaKgM2[1][1],2*(160*32/12+160*25)*1e-7);
});
test('failed modified geometry never reports its uncut primitive and bounds alone are unmeasured',async()=>{
 const fail=()=>{throw new Error('fixture failure');};
 const result=await evaluateMassProperties({parts:[{...stock,exactOperations:[{type:'fillet',amount:1}]}]},{buildSolid:fail});
 assert.equal(result.accuracy,'incomplete');assert.equal(result.volumeCm3,0);assert.equal(result.inertiaKgM2,null);
 const boundsOnly=await evaluateMassProperties({parts:[{kind:'direct',bounds:{x0:0,x1:9,y0:0,y1:9,z0:0,z1:9}}]},{buildSolid:fail});
 assert.equal(boundsOnly.volumeCm3,0);
});
test('legacy countersink cutters match native feature reconstruction after save and translation',async()=>{
 const records=holeCutRecords({holeType:'countersink',diameter:1,depth:2,endCondition:'blind',csinkDiameter:2,csinkAngle:90},sketch);
 const preview=holePreviewParts(records,{min:{x:0,y:0,z:0},max:{x:4,y:10,z:4}});
 assert.equal(preview[1].r,1);assert.equal(preview[1].r2,.5);near(preview[1].h,.5);
 const part=JSON.parse(JSON.stringify({...stock,cuts3d:records}));
 const brep=await exactBrepForPart(part);
 try{
  const expected=await shapeMassProperties(brep);
  const features=[{id:'base',type:'box',params:{w:4,h:10,d:4},inputs:[]}];let last='base';
  records.forEach((record,i)=>{const recipe=toolFeatureRecipe(record);features.push({id:'tool'+i,...recipe,inputs:[last]});features.push({id:'cut'+i,type:'subtract',params:{},inputs:[last,'tool'+i]});last='cut'+i;});
  const run=await regenerateFeatures({features});try{assert.equal(run.ok,true,JSON.stringify(run.issues));near((await shapeMassProperties(run.finalShape)).volume,expected.volume);}finally{releaseRegeneration(run);}
  records.forEach(record=>translateToolRecord(record,10,0,0));
  const moved=await exactBrepForPart({...stock,x0:10,x1:14,cuts3d:records});try{near((await shapeMassProperties(moved)).volume,expected.volume);}finally{disposeBrep(moved);}
 }finally{disposeBrep(brep);}
});
test('off-body holes fail without changing the source and canonical hole tools pass the core rebuild',async()=>{
 const part={...stock,cuts3d:holeCutRecords({holeType:'simple',diameter:1,endCondition:'through-all'}, {...sketch,points:[{id:'c',x:20,y:20}]})};
 const before=JSON.stringify(part);await assert.rejects(exactBrepForPart(part),/misses|empty|solid/i);assert.equal(JSON.stringify(part),before);
 const source={kind:'part',features:[{id:'base',type:'box',params:{w:4,h:10,d:4},inputs:[]},{id:'hole',type:'hole',references:{features:['base']},params:{holeType:'simple',diameter:1,layout:'linear',countX:1,countY:1,origin:{u:2,v:2},endCondition:'through-all'},inputs:['base']}],history:[{id:'h1',kind:'feature',targetId:'base'},{id:'h2',kind:'feature',targetId:'hole'}]};
 const run=rebuildParametricDocument(source);assert.equal(run.ok,true,JSON.stringify(run.issues));
});
test('requested thread engagement is separate from drilling depth and starts after a head recess',()=>{
 const params={holeType:'tap-counterbore',standardSize:'M6',depthMm:30,cboreDepthMm:5,threadDepthMm:12,endCondition:'blind'};
 const thread=holeWizardThread(params);assert.equal(thread.drillDepthMm,30);assert.equal(thread.spec.lengthMm,12);near(thread.spec.origin.y,.5);assert.equal(thread.engagementEstimated,false);
 assert.throws(()=>holeWizardThread({...params,threadDepthMm:26}),/exceeds/);
});
test('migration preserves every revolution placement and rejects a changed angle or origin',async()=>{
 for(const axis of ['x','y','z'])for(const mode of [{angle:90},{angle:120,symmetric:true},{angle:180,direction:'reverse'}]){
  const part={id:'rev',kind:'rev',axis,x:5,y:7,z:11,...mode,pts:[{u:2,v:0},{u:4,v:0},{u:4,v:2},{u:2,v:2}]};
  const source={id:'document',references:[{id:'origin'}],features:[],parameters:{},kind:'part',metadata:{authoringSystem:'legacy-adapter'},parts:[part]};
  const conversion=convertLegacyDocument(source);assert.equal(conversion.ok,true,JSON.stringify(conversion.analysis));
  const canonical=rebuildParametricDocument(conversion.document);assert.equal(canonical.ok,true,JSON.stringify(canonical.issues));
  const verdict=evaluateMigration({analysis:conversion.analysis,legacyDocument:source,legacyRun:rebuildDefinition(source),canonicalRun:canonical});assert.equal(verdict.ok,true,JSON.stringify(verdict.reasons));
  const native=await makeBrepRevolve(revolveRecipe(part));const compiled=compileKernelFeatureTree(conversion.document);const run=await regenerateFeatures({...conversion.document,features:compiled.features});
  try{assert.equal(run.ok,true,JSON.stringify(run.issues));const a=await shapeMassProperties(native),b=await shapeMassProperties(run.finalShape);near(a.volume,b.volume);assert.deepEqual(a.centerOfMass,b.centerOfMass);}finally{disposeBrep(native);releaseRegeneration(run);}
  const summary=migrationGeometrySummary(canonical,'canonical');canonical.core.resultList.find(r=>r.type==='revolve').params.x+=1;
  assert.notEqual(migrationGeometrySummary(canonical,'canonical').fingerprint,summary.fingerprint);
 }
});

test('overall dimensions include a merged boss and combine separate measured bodies',async()=>{
 const body={...stock,merges3d:[{axis:'y',from:10,to:12,loop:[{u:1,v:1},{u:3,v:1},{u:3,v:3},{u:1,v:3}]}]};
 const mass=await evaluateMassProperties({parts:[body]});
 near(mass.bounds.max.y-mass.bounds.min.y,12,1e-5);
 const combined=await evaluateMassProperties({parts:[body,{...stock,id:'other',x0:10,x1:14}]});
 near(combined.bounds.max.x-combined.bounds.min.x,14,1e-5);
 const {basePartBounds}=await import('../js/modeler_part_geometry.js');
 assert.equal(basePartBounds({...body,meshData:{positions:new Float32Array([0,0,0,4,12,4])}}).y1,12);
 const failed=await evaluateMassProperties({parts:[body]},{buildSolid:()=>{throw new Error('failed');}});
 assert.equal(failed.bounds,null);
});
