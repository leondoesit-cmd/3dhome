import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSpec} from '../js/cabinet.js';
import {createCabinetProductionJob} from '../js/cabinet_production_workflow.js';
import {cabinetDrillingRecipeDraft} from '../js/cabinet_manufacturing.js';
import {createCabinetReviewPackage,validateCabinetReviewPackage,importCabinetReviewPackage} from '../js/cabinet_review_package.js';
import {createCabinetInspectionPlan,recordCabinetInspection} from '../js/cabinet_inspection.js';
const items=()=>[{id:'package-cab',type:'cabsys',w:80,h:160,d:60,cab:makeSpec('w_classic',80,160,60)}];
const clone=value=>JSON.parse(JSON.stringify(value));
test('inspection records are revision-bound optional package evidence and retain failing measurements',()=>{
 const live=items(),job=createCabinetProductionJob(live),part=job.manifest.parts[0];
 let inspectionPlan=createCabinetInspectionPlan(job,{planId:'QA-1',characteristics:[{id:'length',partId:part.id,basis:'finished',dimension:'length',minusMm:0.5,plusMm:0.5}]});
 inspectionPlan=recordCabinetInspection(inspectionPlan,job,live,{characteristicId:'length',measuredMm:part.finished.length+1,instrumentId:'Caliper-1',calibrationReference:'Calibration record A',operator:'QA reviewer',timestamp:'2026-09-22T10:00:00Z',note:'Requires rework'});
 const pack=createCabinetReviewPackage(job,live,{inspectionPlan});
 assert.equal(pack.files.length,15);assert.equal(pack.inspection.status,'fail');assert.equal(pack.machineReady,false);assert.ok(pack.files.some(file=>file.name==='inspection.csv'));assert.deepEqual(importCabinetReviewPackage(JSON.stringify(pack)),pack);
 const altered=clone(pack);altered.supplemental.inspectionPlan.records[0].measuredMm=part.finished.length;assert.equal(validateCabinetReviewPackage(altered).valid,false);
 live[0].w+=1;const next=createCabinetProductionJob(live);assert.throws(()=>createCabinetReviewPackage(next,live,{inspectionPlan}),/revision|stale/i);
 const plain=createCabinetReviewPackage(next,live);assert.equal(plain.files.length,11);assert.equal(plain.supplemental.inspectionPlan,undefined);
});
test('review package is deterministic, immutable and survives JSON roundtrip',()=>{
 const live=items(),job=createCabinetProductionJob(live),a=createCabinetReviewPackage(job,live),b=createCabinetReviewPackage(job,live);
 assert.deepEqual(a,b);assert.equal(a.machineReady,false);assert.equal(a.productionRelease,false);assert.equal(a.files.length,a.manifest.length);assert.ok(a.files.some(file=>file.name==='README.txt'));
 assert.throws(()=>a.supplemental.recipes.push({}),TypeError);assert.deepEqual(importCabinetReviewPackage(JSON.stringify(a)),a);assert.equal(validateCabinetReviewPackage(a).valid,true);
});
test('modified supplemental evidence, files, manifest and reports are detected',()=>{
 const live=items(),p=createCabinetReviewPackage(createCabinetProductionJob(live),live,{standardsContext:{market:'US',facts:{},evidence:[]}});
 for(const mutate of [v=>v.supplemental.standardsContext.market='EU',v=>v.files[0].content+='changed',v=>v.manifest[0].name='../escape',v=>v.coverage.status='qualified',v=>v.job.productionRelease=true]){
  const changed=clone(p);mutate(changed);assert.equal(validateCabinetReviewPackage(changed).valid,false);assert.throws(()=>importCabinetReviewPackage(changed));
 }
});
test('stale source jobs and malformed supplemental recipes cannot form handoff packages',()=>{
 const live=items(),job=createCabinetProductionJob(live);live[0].h+=10;assert.throws(()=>createCabinetReviewPackage(job,live),/revision/);
 const fresh=createCabinetProductionJob(live);
 for(const recipes of [null,{},[null],[{itemId:'package-cab'}]])assert.throws(()=>createCabinetReviewPackage(fresh,live,{recipes}),/recipe/i);
 assert.throws(()=>createCabinetReviewPackage(fresh,live,{standardsContext:[]}),/context/);
});
test('exact complete recipes remain supplemental review evidence and stale recipes are rejected',()=>{
 const live=items(),recipe=cabinetDrillingRecipeDraft(live)[0];recipe.partNumber='Shop exact part';recipe.sourceDrawing='Drawing A';recipe.panels.forEach(p=>{p.holes=[];p.noDrillReason='No drilling required per reviewed drawing';});
 const p=createCabinetReviewPackage(createCabinetProductionJob(live),live,{recipes:[recipe]});assert.deepEqual(p.supplemental.recipes,[recipe]);assert.equal(validateCabinetReviewPackage(p).valid,true);
 recipe.sourceSignature+='stale';assert.throws(()=>createCabinetReviewPackage(createCabinetProductionJob(live),live,{recipes:[recipe]}),/match|stale/i);
});
test('fixed filenames and rendered HTML never interpolate unsafe user identifiers',()=>{
 const live=items();live[0].id='<script>alert(1)</script>';const p=createCabinetReviewPackage(createCabinetProductionJob(live,{jobId:'../../<img src=x>'}),live);
 assert.ok(p.files.every(file=>!/[/\\]/.test(file.name)));for(const file of p.files.filter(file=>file.mime==='text/html')){assert.ok(!file.content.includes('<script>'));assert.ok(!file.content.includes('<img src=x>'));assert.ok(file.content.includes('&lt;img'));}
});

import {S} from '../js/state.js';
test('package uses closed canonical snapshot independent of live cabinet order and animation',()=>{
 const a=items()[0],b=items()[0];b.id='another-cab';b.x=200;const live=[a,b],job=createCabinetProductionJob(live),first=createCabinetReviewPackage(job,live);
 a.cab.open=70;b.cab.open=40;a.runtimeState={temporary:true};
 const reordered=createCabinetReviewPackage(job,[b,a]);assert.deepEqual(reordered,first);assert.deepEqual(first.sourceItems.map(item=>item.id),['another-cab','package-cab']);assert.equal(first.sourceItems[1].cab.open,undefined);
});
test('recipe item indices are canonical presentation metadata while coordinates remain exact',()=>{
 const a=items()[0],b=items()[0];b.id='another-cab';b.x=200;const live=[a,b],job=createCabinetProductionJob(live);
 const recipes=cabinetDrillingRecipeDraft(live).map(recipe=>({...recipe,partNumber:'Exact SKU',sourceDrawing:'Drawing',panels:recipe.panels.map(panel=>({...panel,holes:[],noDrillReason:'Documented no-drill'}))}));
 const first=createCabinetReviewPackage(job,live,{recipes});const reversed=clone(recipes).reverse();reversed.forEach((r,i)=>r.itemIndex=i+1);
 assert.deepEqual(createCabinetReviewPackage(job,[b,a],{recipes:reversed}),first);
});
test('external advanced CAD geometry is rejected without mutating application state',()=>{
 const live=items();live[0].definitionId='package-external';const prior=S.parametric;
 try{
  S.parametric={definitions:{'package-external':{metadata:{}}}};const job=createCabinetProductionJob(live),clean=createCabinetReviewPackage(job,live);
  for(const metadata of [{advancedEdits:{parts:[]}},{manufacturingReviewRequired:true}]){
   S.parametric.definitions['package-external'].metadata=metadata;const before=JSON.stringify(S.parametric);
   assert.throws(()=>createCabinetReviewPackage(job,live),/advanced CAD|revision/);assert.equal(validateCabinetReviewPackage(clean).valid,false);assert.equal(JSON.stringify(S.parametric),before);
  }
 }finally{S.parametric=prior;}
});
