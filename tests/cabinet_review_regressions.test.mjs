import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSpec, layoutCab, normalizeSpec, checkCab, drillPlan, bandLen, leafWeight} from '../js/cabinet.js';
import {cabinetDefinitionFromItem, materializeCabinetDefinition} from '../js/core/cabinet_definition.js';
import {requestCabinetDimension, syncCabinetDefinition} from '../js/parametric_cabinet.js';
function item(preset='w_classic',w=120,h=240,d=60) {return {id:'review',type:'cabsys',x:0,y:0,rot:0,w,h,d,cab:makeSpec(preset,w,h,d)};}
test('partial technical edits preserve the envelope and finite geometry',()=>{
 const source=item(), definition=cabinetDefinitionFromItem(source);
 const rebuilt=materializeCabinetDefinition(definition,{panelThickness:2.2,width:undefined});
 assert.deepEqual([rebuilt.w,rebuilt.h,rebuilt.d],[120,240,60]);
 assert.equal(rebuilt.metadata.cabSpec.panel,2.2);
 assert.equal(rebuilt.metadata.generatedParameters.width,120);
 for(const part of rebuilt.parts) for(const value of Object.values(part)) if(typeof value==='number') assert.ok(Number.isFinite(value));
});
test('custom presets stay custom through resize proposals',()=>{
 const source=item('k_base',90,90,60);source.cab.preset='blank';source.cab.auto=true;
 const response=requestCabinetDimension(source,'width',180,280);
 for(const choice of response.status==='applied'?[response]:response.alternatives) {
  assert.equal(choice.spec.fam,source.cab.fam);assert.equal(choice.spec.preset,'blank');
 }
});
test('linked cabinets retain composition at different widths',()=>{
 const a=item(), b=item();b.id='linked';b.w=160;
 const state={items:[a,b]};syncCabinetDefinition(state,a);b.definitionId=a.definitionId;
 a.cab.cols[0].secs[0].t='open';syncCabinetDefinition(state,a,{propagate:true});
 const before=structuredClone(b.cab);layoutCab(b);
 assert.deepEqual(b.cab,before);assert.equal(b.cab.dim.w,160);
 assert.equal(b.cab.cols[0].secs[0].t,'open');
});
test('infeasible compartment counts never create negative dimensions and are rejected',()=>{
 const source=item();source.cab.auto=false;
 source.cab.cols=[{w:100,door:{t:'none'},secs:Array.from({length:20},()=>({t:'shelves',h:30}))}];source.h=30;
 normalizeSpec(source.cab,source.w,source.h,source.d);
 assert.ok(source.cab.cols[0].secs.every(s=>s.h>0));
 assert.ok(checkCab(source).some(i=>i.level==='err'));
});
test('sliding wardrobes contain exactly one pair of tracks',()=>{
 const source=item();source.cab.cols.forEach(c=>c.door={t:'sliding'});
 assert.equal(layoutCab(source).parts.filter(p=>p.role==='track').length,2);
});
test('drilling separates paired leaves and split covered runs with local coordinates',()=>{
 const source=item();source.cab.auto=false;source.cab.cols=[{w:116.4,door:{t:'hinged',leaves:2},secs:[{t:'shelves',h:70},{t:'open',h:60},{t:'shelves',h:80}]}];
 normalizeSpec(source.cab,source.w,source.h,source.d);
 const L=layoutCab(source),doors=drillPlan(source,L).filter(p=>p.role==='door');
 assert.equal(doors.length,4);
 for(const p of doors){const front=L.fronts.find(f=>f.unit===p.unit);assert.equal(p.l,Math.round((front.y1-front.y0)*10));assert.equal(p.w,Math.round((front.x1-front.x0)*10));assert.ok(p.holes.some(h=>h.kind==='cup'));for(const h of p.holes){assert.ok(h.x>=h.d/2&&h.x<=p.l-h.d/2);assert.ok(h.y>=h.d/2&&h.y<=p.w-h.d/2);}}
});
test('wide lift leaves retain their handle drilling',()=>{
 const source=item('k_base',100,50,60);source.cab.auto=false;source.cab.cols=[{w:96.4,door:{t:'lift',leaves:1},secs:[{t:'shelves',h:30}]}];normalizeSpec(source.cab,100,50,60);
 const doors=drillPlan(source).filter(p=>p.role==='door');assert.equal(doors.length,1);assert.ok(doors[0].w>doors[0].l);assert.equal(doors[0].holes.filter(h=>h.kind==='handle').length,2);
});
test('corner drilling follows physical side sizes and diagonal fronts',()=>{
 const source=item('k_corner',100,90,90),L=layoutCab(source),plan=drillPlan(source,L);
 assert.equal(plan.filter(p=>p.role==='divider').length,0);
 const sides=plan.filter(p=>p.role==='side');assert.equal(sides.length,2);
 const physical=L.parts.filter(p=>p.role==='side');
 sides.forEach((p,i)=>assert.equal(p.w,Math.round(Math.max(physical[i].x1-physical[i].x0,physical[i].z1-physical[i].z0)*10)));
 assert.equal(plan.find(p=>p.role==='door').w,Math.round(L.cornerFront*10));
 const other={...L,sp:{...L.sp,corner:null}};assert.ok(leafWeight(L,L.cols[0])<leafWeight(other,L.cols[0]));
 assert.ok(!checkCab(source).some(i=>i.msg.includes('it will sag')));
});
test('corner edge handles span the diagonal and remain centered on the leaf',()=>{
 const source=item('k_corner',90,90,90);source.cab.hw.handle='edge';const L=layoutCab(source),front=L.fronts[0],handle=L.parts.find(p=>p.role==='handle');
 assert.ok(Math.abs(handle.x1-handle.x0-(L.cornerFront-2))<1e-8);assert.equal((handle.x0+handle.x1)/2,(front.x0+front.x1)/2);
});
test('edge tape excludes hidden slab joints and plinth short ends',()=>{
 const board={k:'box',role:'worktop',x0:0,x1:200,y0:0,y1:3,z0:0,z1:60};
 assert.equal(bandLen({...board,exposedReturns:0}),2);assert.equal(bandLen({...board,exposedReturns:1}),2.6);
 assert.equal(bandLen({...board,role:'plinth',x1:60,y1:10,z1:1.8}),0.6);
});
