import test from 'node:test';
import assert from 'node:assert/strict';
import {planCabinetJoinery,validateCabinetHardwareArticle} from '../js/cabinet_joinery.js';
const input=()=>({facePanel:{id:'side',length:700,width:550,thickness:18},edgePanel:{id:'shelf',length:550,width:500,thickness:18},positions:[40,300,500],faceOffsetMm:100,edgeOffsetMm:9,article:{manufacturer:'Shop',sku:'D8',revision:'1',sourceDrawing:'shop drawing 12',kind:'dowel',dimensions:{diameterMm:8,lengthMm:30},drilling:{faceDiameterMm:8,faceDepthMm:12,edgeDiameterMm:8,edgeDepthMm:20,minEdgeDistanceMm:20}}});
test('joinery produces one paired face and edge bore per authored station',()=>{
 const q=planCabinetJoinery(input());assert.equal(q.operations.length,6);assert.equal(q.hardware[0].quantity,3);assert.equal(q.operations[0].pairId,q.operations[1].pairId);assert.equal(q.operations[1].setup,'edge');assert.equal(q.machineReady,false);
});
test('invalid stock, fit, penetration, station count and overlap never produce partial operations',()=>{
 for(const change of [x=>x.facePanel.thickness=0,x=>x.positions=[],x=>x.positions=[40,40],x=>x.positions=[5],x=>x.edgeOffsetMm=2,x=>x.article.drilling.faceDepthMm=18,x=>x.article.drilling.edgeDepthMm=500,x=>x.article.dimensions.lengthMm=100,x=>x.article.dimensions.diameterMm=9]){const x=input();change(x);const r=planCabinetJoinery(x);assert.equal(r.operations.length,0);assert.ok(r.issues.length);}
});
test('confirmat uses explicit clearance and pilot geometry; unsupported and undocumented articles blocked',()=>{
 const x=input();x.article.kind='confirmat';x.article.drilling.faceThrough=true;x.article.drilling.faceDepthMm=18;x.article.drilling.edgeDiameterMm=5;
 assert.equal(planCabinetJoinery(x).operations.length,6);
 assert.ok(validateCabinetHardwareArticle({...x.article,kind:'cam'}).some(i=>i.code==='unsupported-connector'));
 assert.ok(validateCabinetHardwareArticle({...x.article,sourceDrawing:''}).length);
 assert.ok(validateCabinetHardwareArticle(null).length);
});

import {makeSpec} from '../js/cabinet.js';
import {cabinetProductionParts} from '../js/cabinet_production_parts.js';
import {createSavedCabinetJoinery,cabinetSavedJoineryReport,cabinetJoineryRequestForItems} from '../js/cabinet_joinery.js';
function fixture(){const items=[{id:'saved-cab',type:'cabsys',w:80,h:160,d:60,cab:makeSpec('w_classic',80,160,60)}],parts=cabinetProductionParts(items).parts.filter(p=>p.geometry==='rectangle'&&Math.abs(p.finished.thickness-18)<1e-6&&p.finished.width>100);const request=input();request.facePanel={id:parts[0].id,...parts[0].finished};request.edgePanel={id:parts[1].id,...parts[1].finished};request.positions=[40];return {items,request};}
test('saved joinery persists exact authored request and rejects dimensional or request changes',()=>{const {items,request}=fixture(),plan=createSavedCabinetJoinery(items,request,{id:'joint-1'});items[0].cab.joineryPlans=[plan];let report=cabinetSavedJoineryReport(items);assert.equal(report.operations.length,2);assert.equal(report.machineReady,false);plan.request.positions=[45];report=cabinetSavedJoineryReport(items);assert.equal(report.operations.length,0);assert.ok(report.issues.some(i=>i.code==='saved-joinery-stale'));});
test('saved joinery supports explicit current-dimension revalidation but never silently refreshes',()=>{const {items,request}=fixture();items[0].cab.joineryPlans=[createSavedCabinetJoinery(items,request,{id:'joint-1'})];items[0].h+=10;assert.equal(cabinetSavedJoineryReport(items).operations.length,0);const updated=cabinetJoineryRequestForItems(items,request);items[0].cab.joineryPlans=[createSavedCabinetJoinery(items,updated,{id:'joint-1'})];assert.equal(cabinetSavedJoineryReport(items).operations.length,2);});
test('duplicate saved IDs exclude every copy and malformed plans do not crash',()=>{const {items,request}=fixture(),plan=createSavedCabinetJoinery(items,request,{id:'joint-1'});items[0].cab.joineryPlans=[plan,plan,null];const report=cabinetSavedJoineryReport(items);assert.equal(report.operations.length,0);assert.ok(report.issues.length>=2);});
test('saved plan report and bindings are stable across selection order',()=>{const {items,request}=fixture(),other={...JSON.parse(JSON.stringify(items[0])),id:'other'};items[0].cab.joineryPlans=[createSavedCabinetJoinery(items,request,{id:'joint-1'})];assert.deepEqual(cabinetSavedJoineryReport([...items,other]),cabinetSavedJoineryReport([other,...items]));});

import {createCabinetProductionJob,transitionCabinetProductionJob} from '../js/cabinet_production_workflow.js';
test('stale saved joinery blocks checking a fresh production snapshot',()=>{const {items,request}=fixture();items[0].cab.joineryPlans=[createSavedCabinetJoinery(items,request,{id:'joint-1'})];items[0].cab.joineryPlans[0].request.positions=[44];const job=createCabinetProductionJob(items);assert.ok(job.manifest.issues.some(i=>i.code==='saved-joinery-stale'));assert.throws(()=>transitionCabinetProductionJob(job,'checked',{items,reviewer:'Reviewer',evidence:'Reviewed',acknowledgedIssues:job.manifest.issues.map(i=>i.code)}),/joinery/);});
