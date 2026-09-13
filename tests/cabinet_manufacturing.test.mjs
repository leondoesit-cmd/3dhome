import test from 'node:test';
import assert from 'node:assert/strict';
import {S} from '../js/state.js';
import {makeSpec, normalizeSpec, layoutCab, drillPlan} from '../js/cabinet.js';
import {cabinetManufacturingReport, cabinetManufacturingJSON, validateDrillingPanel} from '../js/cabinet_manufacturing.js';
import {drillCSV, nestDXF, quote} from '../js/nest.js';
function cabinet(front='flat',w=120){
 const item={id:'manufacturing',type:'cabsys',x:0,y:0,rot:0,w,h:160,d:60,cab:makeSpec('w_classic',w,160,60)};
 item.cab.auto=false;item.cab.front=front;item.cab.cols=[{w:w-3.6,door:{t:'hinged',leaves:2,hinge:'L'},secs:[{t:'shelves',h:140,n:3}]}];
 normalizeSpec(item.cab,item.w,item.h,item.d);return item;
}
const hole=(id,face='A',depth=13)=>({id,x:50,y:50,d:5,depth,through:false,face});
const panel=(holes)=>({id:'p',l:100,w:100,thickness:18,holes});
test('panel validator detects opposite-face breakthrough without conflating nonintersecting blind volumes',()=>{
 assert.ok(validateDrillingPanel(panel([hole('a'),hole('b','B')])).some(i=>i.code==='hole-intersection'));
 assert.equal(validateDrillingPanel(panel([hole('a','A',5),hole('b','B',5)])).length,0);
 assert.ok(validateDrillingPanel(panel([hole('a','A',5),hole('b','A',5)])).some(i=>i.code==='hole-intersection'));
});
test('panel validator rejects invalid dimensions, missing faces, unsafe depths and off-board holes',()=>{
 for(const bad of [{x:NaN},{d:0},{depth:18},{depth:-1},{face:null},{x:1},{y:100}]) assert.ok(validateDrillingPanel(panel([{...hole('bad'),...bad}])).length,JSON.stringify(bad));
 assert.equal(validateDrillingPanel(panel([{...hole('through'),depth:0,through:true}])).length,0);
 assert.ok(validateDrillingPanel(panel([{...hole('bad'),depth:0,through:false}])).length);
 assert.ok(validateDrillingPanel({...panel([]),thickness:NaN}).length);
});
test('physical carcass sizes and distinct divider faces survive drill generation',()=>{
 const item=cabinet();item.cab.cols=[0,1].map(()=>({w:50,door:{t:'none'},secs:[{t:'shelves',h:140,n:3}]}));normalizeSpec(item.cab,item.w,item.h,item.d);
 const L=layoutCab(item),patterns=drillPlan(item,L),divider=patterns.find(p=>p.role==='divider');
 assert.deepEqual([...new Set(divider.holes.map(h=>h.face))].sort(),['A','B']);
 for(const p of patterns){const actual=L.parts[p.partIndex];assert.equal(p.l,Math.round((actual.y1-actual.y0)*10));assert.equal(p.w,Math.round((actual.z1-actual.z0)*10));}
 const report=cabinetManufacturingReport([item]);assert.ok(report.issues.some(i=>i.code==='hole-intersection'));
});
test('shaker cups are assigned to physical stiles rather than a fictional full-width board',()=>{
 const item=cabinet('shaker'),report=cabinetManufacturingReport([item]);
 assert.equal(report.items.length,1);assert.ok(!report.issues.some(i=>i.code==='front-hole-unmapped'));
 const doors=report.items[0].panels.filter(p=>p.assemblyId);
 assert.ok(doors.length>2);
 const cups=doors.flatMap(p=>p.holes.filter(h=>h.kind==='cup').map(h=>({p,h})));
 assert.ok(cups.length>=4);assert.ok(cups.every(({p})=>p.w<=70.01));
 for(const {p,h} of cups){assert.ok(h.y-h.d/2>=0);assert.ok(h.y+h.d/2<=p.w+0.01);assert.ok(p.partId);}
});
test('review is stable, has unique operation IDs, preserves source state and never claims machine qualification',()=>{
 const item=cabinet(),before=JSON.stringify(item),a=cabinetManufacturingReport([item]),b=cabinetManufacturingReport([item]);
 assert.equal(JSON.stringify(item),before);assert.deepEqual(a,b);assert.equal(a.machineReady,false);
 assert.ok(a.issues.some(i=>i.code==='machine-profile-missing'));assert.ok(a.templates.every(t=>t.qualification==='generic-unverified'));
 const ops=a.items.flatMap(i=>i.panels.flatMap(p=>p.holes.map(h=>h.id)));assert.equal(new Set(ops).size,ops.length);
 assert.deepEqual(JSON.parse(cabinetManufacturingJSON([item])),a);
});
test('small fronts report rejected holes instead of silently omitting them',()=>{
 const item=cabinet('flat',30);item.cab.cols[0].door.leaves=8;
 const report=cabinetManufacturingReport([item]);assert.ok(report.issues.some(i=>['rejected-hole','front-hole-unmapped'].includes(i.code)));
});
test('unsupported mechanisms, relief and advanced edits remain review blockers',()=>{
 const item=cabinet('slat');item.definitionId='review-edited';
 const before=S.parametric;S.parametric={definitions:{'review-edited':{metadata:{manufacturingReviewRequired:true}}}};
 try{const report=cabinetManufacturingReport([item]);assert.ok(report.issues.some(i=>i.code==='front-relief'));assert.ok(report.issues.some(i=>i.code==='advanced-edits'));}
 finally{S.parametric=before;}
 item.cab.front='flat';item.cab.cols[0].door.t='lift';assert.ok(cabinetManufacturingReport([item]).issues.some(i=>i.code==='mechanism-template'));
});
test('review CSV and DXF identify faces, through drilling and unqualified output',()=>{
 const item=cabinet(),csv=drillCSV([item],true);
 assert.ok(csv.includes('REVIEW REQUIRED'));assert.ok(csv.includes('"Face"'));assert.ok(csv.includes('"THROUGH"'));assert.ok(csv.includes('generic-hinge-cup-v1'));
 const dxf=nestDXF(quote([item]));assert.ok(dxf.includes('NOT MACHINE CODE'));assert.ok(dxf.includes('DRILL_A'));assert.ok(dxf.includes('DRILL_B'));assert.ok(dxf.includes('fixed datum, not mirrored'));
});
test('malformed jobs yield explicit generation findings rather than a successful empty report',()=>{
 const malformed={id:'bad',type:'cabsys',cab:{corner:'diag',cols:null}};
 assert.ok(cabinetManufacturingReport([malformed]).issues.some(i=>i.code==='generation-failed'));
 assert.ok(cabinetManufacturingReport([]).issues.some(i=>i.code==='empty-job'));
});
