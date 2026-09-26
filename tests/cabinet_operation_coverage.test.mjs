import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSpec,normalizeSpec} from '../js/cabinet.js';
import {cabinetDrillingRecipeDraft,cabinetManufacturingReport} from '../js/cabinet_manufacturing.js';
import {cabinetOperationCoverage} from '../js/cabinet_operation_coverage.js';
import {cabinetCNCBundle} from '../js/cabinet_postprocessor.js';
import {newCabinetShopProfile} from '../js/cabinet_shop_profiles.js';
function item(id){const it={id,type:'cabsys',w:60,h:100,d:60,x:id==='b'?200:0,y:0,rot:0,cab:makeSpec('w_classic',60,100,60)};it.cab.auto=false;it.cab.cols=[{w:56.4,door:{t:'hinged',leaves:1,hinge:'L'},secs:[{t:'shelves',h:80,n:2}]}];normalizeSpec(it.cab,it.w,it.h,it.d);return it;}
function recipes(items){return cabinetDrillingRecipeDraft(items).map(r=>{r.partNumber='hardware';r.sourceDrawing='drawing';r.panels.forEach(p=>{p.noDrillReason='No fixing required';});r.panels[0].holes=[{x:50,y:50,d:5,depth:6,through:false,face:'A'}];return r;});}
test('coverage distinguishes complete drilling and explicit no-drill from generic or missing evidence',()=>{
 const a=item('a'),generic=cabinetOperationCoverage([a]);assert.ok(generic.totals.genericPartial>0);assert.ok(generic.totals.missing>0);
 const result=cabinetOperationCoverage([a],recipes([a]));assert.equal(result.totals.completeDrilling,1);assert.ok(result.totals.explicitNoDrill>0);assert.equal(result.totals.missing,0);assert.equal(result.machineReady,false);
});
test('stable item IDs keep complete recipes valid after reorder and visual opening',()=>{
 const a=item('a'),b=item('b'),r=recipes([a,b]);const before=cabinetOperationCoverage([a,b],r);
 a.cab.open=1;a.runtimeState={cabinetOpen:0.8};a.cab.joineryPlans=[];
 const after=cabinetOperationCoverage([b,a],r);assert.deepEqual(after,before);
 const p={...newCabinetShopProfile(),name:'Reorder test',travel:{x:2500,y:1300,z:150},safeZ:15,breakthrough:1,completeRecipes:r,tools:[{number:1,diameter:5,feed:200,rpm:3000,maxDepth:40,holderDiameter:40,spinupSeconds:2}]};
 const bundle=cabinetCNCBundle([b,a],p);assert.deepEqual(bundle.issues,[]);assert.equal(bundle.status,'simulation-ready');
});
test('geometry and hardware edits stale the recipe instead of silently retaining full coverage',()=>{
 for(const change of [a=>a.w+=1,a=>a.cab.cols[0].door.hinge='R']){const a=item('a'),r=recipes([a]);change(a);const result=cabinetOperationCoverage([a],r);assert.ok(result.issues.some(i=>i.code==='recipe-stale'));assert.equal(result.totals.completeDrilling,0);}
});
test('metadata changes do not stale recipe while invalid stock settings still block',()=>{
 const a=item('a'),r=recipes([a]);a.cab.productionOverrides={unknown:{}};
 const report=cabinetManufacturingReport([a],r);assert.ok(!report.issues.some(i=>i.code==='recipe-stale'));assert.ok(report.issues.some(i=>i.code==='unknown-production-part'));
});
test('saved joinery reviews count separately and never complete generic machining coverage',async()=>{
 const {cabinetProductionParts}=await import('../js/cabinet_production_parts.js');
 const {createSavedCabinetJoinery,cabinetJoineryRequestForItems}=await import('../js/cabinet_joinery.js');
 const a=item('a'),parts=cabinetProductionParts([a]).parts,side=parts.find(p=>p.role==='side'),shelf=parts.find(p=>p.role==='shelf');
 const before=cabinetOperationCoverage([a]);
 const request={facePanel:{id:side.id},edgePanel:{id:shelf.id},positions:[40],faceOffsetMm:50,edgeOffsetMm:9,article:{manufacturer:'Shop',sku:'D8',revision:'1',sourceDrawing:'drawing',kind:'dowel',dimensions:{diameterMm:8,lengthMm:30},drilling:{faceDiameterMm:8,faceDepthMm:12,edgeDiameterMm:8,edgeDepthMm:20,minEdgeDistanceMm:20}}};
 a.cab.joineryPlans=[createSavedCabinetJoinery([a],cabinetJoineryRequestForItems([a],request),{id:'j1',reviewedAt:'2026-01-01T00:00:00Z'})];
 const after=cabinetOperationCoverage([a]);assert.equal(after.totals.joineryReview,2);assert.equal(after.totals.completeDrilling,0);assert.equal(after.totals.genericPartial,before.totals.genericPartial);
});
