import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {holeCallouts,calloutTextById} from '../js/core/hole_callout.js';
import {normalizeHoleWizard,holeWizardSolids,holeCallout,holeWizardThread} from '../js/cad_hole_wizard.js';
import {createPartDocument,createSketchDefinition,createFeatureDefinition} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
const nominal={holeType:'countersink',standardSize:'custom',diameterMm:10,csinkDiameterMm:20,csinkAngle:82,depthMm:38.1,endCondition:'blind'};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);
test('sheet callouts preserve selected decimals and distinct countersink/counterbore symbols',()=>{
 const params={...nominal,diameterMm:10.08,depthMm:38.1,csinkDiameterMm:19.64,layout:'circular',count:1,headClearanceEnabled:true,headClearanceMm:2.54};
 const def={features:[{id:'h',type:'hole',params}],drawing:{units:'mm',precision:2,trailingZeros:true}};
 const text=holeCallouts(def)[0].callout;
 assert.equal(text,'Ø10.08 ↓38.10 ⌵ Ø24.06 82°');assert.equal(calloutTextById(def).get('h'),text);
 assert.equal(holeCallouts(def,{units:'mm',precision:2})[0].callout,text,'integer sheet precision defaults trailing zeros on like linear dimensions');
 assert.equal(holeCallouts(def,{units:'mm',precision:2,trailingZeros:false})[0].callout,'Ø10.08 ↓38.1 ⌵ Ø24.06 82°');
 assert.match(holeCallout({...params,headClearanceMode:'added-counterbore'},def.drawing),/⌴ Ø19\.64↓2\.54 ⌵ Ø19\.64/);
 assert.match(holeCallout({...params,holeType:'counterbore'},def.drawing),/⌴/);
 assert.match(holeCallouts(def,{units:'in',precision:3,trailingZeros:true})[0].callout,/Ø0\.397 in/);
 assert.equal(holeCallouts(def,{units:'cm',precision:3,trailingZeros:true})[0].callout,'Ø1.008 ↓3.810 ⌵ Ø2.406 82°');
 assert.equal(holeCallouts(def,{units:'m',precision:5,trailingZeros:true})[0].callout,'Ø0.01008 ↓0.03810 ⌵ Ø0.02406 82°');
});
test('legacy native form supplies usable clearance defaults without overwriting saved values',()=>{
  const source=readFileSync(new URL('../js/modeler_feature_form.js',import.meta.url),'utf8');
  const fallback=source.split('\n').find(line=>line.includes("['headClearanceEnabled','headClearance','headClearanceMode']"));
  assert.ok(fallback);
  for(const [key,expected] of [['headClearanceEnabled',false],['headClearance',0],['headClearanceMode','increased-countersink']]){
    const context={type:'hole',field:{key},value:undefined};vm.runInNewContext(fallback,context);assert.equal(context.value,expected);
    context.value=key==='headClearance'?0.254:true;const saved=context.value;vm.runInNewContext(fallback,context);assert.equal(context.value,saved);
  }
});
test('increased countersink uses axial clearance and preserves its angle, units and nominal diameter across cold normalization',()=>{
  const params={...nominal,headClearanceEnabled:true,headClearance:.254};
  const hole=normalizeHoleWizard(params),expected=20+2*2.54*Math.tan(41*Math.PI/180);
  near(hole.csinkDiameterMm,expected);near(hole.headClearanceMm,2.54);
  const cold=normalizeHoleWizard(JSON.parse(JSON.stringify(hole)));near(cold.csinkDiameterMm,expected);
  const cone=holeWizardSolids(params).solids.find(s=>s.role==='countersink');
  near(cone.depth,(expected-10)/20/Math.tan(41*Math.PI/180));assert.equal(cone.angle,82);
  assert.match(holeCallout(params),new RegExp('Ø'+Number(expected.toFixed(1)).toString().replace('.','\\.')));
});
test('added counterbore keeps the original countersink and moves its cone below a cylindrical clearance',()=>{
  const params={...nominal,headClearanceEnabled:true,headClearanceMm:2.54,headClearanceMode:'added-counterbore'};
  const solids=holeWizardSolids(params).solids,head=solids.find(s=>s.role==='head-clearance'),cone=solids.find(s=>s.role==='countersink');
  near(head.diameter,2);near(head.depth,.254);near(cone.startDepth,.254);near(cone.diameter1,2);
  assert.match(holeCallout(params),/Ø20↓2\.5.*Ø20 82°/);
});
test('counterbore clearance increases total recess once; disabled legacy holes retain their exact cutters',()=>{
  const p={holeType:'counterbore',standardSize:'custom',diameterMm:10,cboreDiameterMm:20,cboreDepthMm:6,endCondition:'through-all'};
  const n=normalizeHoleWizard({...p,headClearanceEnabled:true,headClearanceMm:2});near(n.cboreDepthMm,8);near(normalizeHoleWizard(n).cboreDepthMm,8);
  assert.deepEqual(holeWizardSolids(nominal).solids,holeWizardSolids({...nominal,headClearanceEnabled:false,headClearanceMm:2.54}).solids);
  assert.throws(()=>normalizeHoleWizard({...nominal,headClearanceEnabled:true,headClearanceMm:-1}),/nonnegative/);
  assert.throws(()=>normalizeHoleWizard({...nominal,headClearanceEnabled:true,headClearanceMm:50}),/exceeds/);
});
test('thread engagement starts beyond an added head-clearance recess and rejects excess engagement',()=>{
  const params={holeType:'tap-countersink',standardSize:'M6',csinkDiameterMm:12,csinkAngle:90,depthMm:30,endCondition:'blind',headClearanceEnabled:true,headClearanceMm:2,headClearanceMode:'added-counterbore'};
  const thread=holeWizardThread(params,{origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0}});
  near(thread.spec.origin.y,.5);near(thread.threadDepthMm,25);
  assert.throws(()=>normalizeHoleWizard({...params,threadDepthMm:26}),/engagement exceeds/);
});
function document(params){
  const doc=createPartDocument({id:'head-clearance'});
  const pad=createSketchDefinition(doc,{id:'pad',referenceId:'plane:top',points:[{id:'a',x:0,y:0},{id:'b',x:4,y:0},{id:'c',x:4,y:4},{id:'d',x:0,y:4}],entities:[['a','b'],['b','c'],['c','d'],['d','a']].map(([a,b],i)=>({id:'e'+i,type:'line',a,b}))});
  createFeatureDefinition(doc,'extrude',{id:'base',references:{sketches:[pad.id]},params:{depth:4,profileEntityIds:['e0','e1','e2','e3']}});
  const sketch=createSketchDefinition(doc,{id:'hole-sketch',referenceId:'plane:top',points:[{id:'center',x:2,y:2}],entities:[{id:'circle',type:'circle',c:'center',r:.5}]});
  createFeatureDefinition(doc,'hole',{id:'hole',inputs:['base'],references:{sketches:[sketch.id],features:['base']},params:{...params,profileEntityIds:['circle']}});
  return doc;
}
test('both clearance modes remove their mathematically expected volume from a cold native single solid',async()=>{
  for(const mode of ['increased-countersink','added-counterbore']){
    const params={...nominal,endCondition:'through-all',csinkAngle:90,headClearanceEnabled:true,headClearanceMm:1,headClearanceMode:mode};
    const compiled=compileKernelFeatureTree(JSON.parse(JSON.stringify(document(params))));assert.ok(compiled.ok,JSON.stringify(compiled.issues));
    const run=await regenerateFeatures({...compiled.document,features:compiled.features});
    try{
      assert.ok(run.ok,JSON.stringify(run.issues));assert.ok(run.finalShape);
      const mass=await shapeMassProperties(run.finalShape);
      const r=mode==='increased-countersink'?1.1:1,h=mode==='increased-countersink'?.6:.5;
      const removed=Math.PI*.5**2*4+Math.PI*h*(r*r+r*.5+.5**2)/3-Math.PI*.5**2*h+(mode==='added-counterbore'?Math.PI*(1-.5**2)*.1:0);
      near(mass.volume,64-removed);
    }finally{releaseRegeneration(run);}
  }
});
