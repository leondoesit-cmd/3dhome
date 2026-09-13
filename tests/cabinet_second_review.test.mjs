import test from 'node:test';
import assert from 'node:assert/strict';
import {S} from '../js/state.js';
import * as cab from '../js/cabinet.js';
import {cabinetManufacturingReport} from '../js/cabinet_manufacturing.js';
import {sheetById} from '../js/stock.js';
import {captureCabinetSession,restoreCabinetSession} from '../js/cabinet_session.js';
import {syncCabinetDefinition} from '../js/parametric_cabinet.js';
function item(preset='w_classic',w=60,h=120,d=60){const it={id:'batch2',type:'cabsys',x:0,z:0,rot:0,w,h,d,cab:cab.makeSpec(preset,w,h,d)};S.items=[it];S.walls=[];S.nodes=[];return it;}
function custom(type='shelves',door='none',w=60,h=120){const it=item('w_classic',w,h);it.cab.auto=false;it.cab.cols=[{w:w-3.6,door:{t:door,hinge:'L',leaves:1},secs:[{t:type,h:h-12,n:2}]}];cab.normalizeSpec(it.cab,w,h,60);return it;}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function transform(u,x,z){const dx=x-u.px,dz=z-u.pz;return{x:u.px+(u.tx||0)+dx*Math.cos(u.ang||0)+dz*Math.sin(u.ang||0),z:u.pz+(u.tz||0)-dx*Math.sin(u.ang||0)+dz*Math.cos(u.ang||0)};}

test('#26–27 grid uses millimetres and runner anchors follow depth at one height',()=>{
 const it=custom('drawers'),L=cab.layoutCab(it),patterns=cab.drillPlan(it,L);
 assert.equal(patterns.filter(p=>p.holes.some(h=>h.kind==='runner')).length,2);
 for(const p of patterns.filter(p=>p.holes.some(h=>h.kind==='runner'))){const holes=p.holes.filter(h=>h.kind==='runner');assert.equal(holes.length,4);for(let i=0;i<holes.length;i+=2){near(holes[i].x,holes[i+1].x);near(holes[i].x%32,0);assert.ok(holes[i+1].y-holes[i].y>200);near((holes[i+1].y-holes[i].y)%32,0);}}
 const shelf=custom('shelves');const pins=cab.drillPlan(shelf).flatMap(p=>p.holes.filter(h=>h.kind==='pin'));assert.ok(pins.some(p=>p.x%320!==0));assert.ok(pins.every(p=>p.x%32===0));
});
test('#28 drawer fronts have horizontal handle drilling assigned to physical boards',()=>{
 const it=custom('drawers');it.cab.hw.handle='bar';const L=cab.layoutCab(it),panels=cab.drillPlan(it,L).filter(p=>p.role==='drawerFront');assert.equal(panels.length,2);
 for(const p of panels){assert.equal(p.holes.length,2);near(p.holes[0].x,p.holes[1].x);near(Math.abs(p.holes[0].y-p.holes[1].y),96);assert.ok(p.holes.every(h=>h.through&&h.depth===0));}
 const report=cabinetManufacturingReport([it]);assert.equal(report.items[0].panels.filter(p=>p.role==='drawerFront'&&p.holes.length===2).length,2);assert.ok(report.issues.some(i=>i.code==='drawer-front-template'));
});
test('#29 structural shelves require an explicit joinery recipe',()=>{
 const it=custom();it.cab.cols[0].secs=[{t:'shelves',h:45,n:0},{t:'shelves',h:45,n:0}];cab.normalizeSpec(it.cab,it.w,it.h,it.d);
 assert.ok(cabinetManufacturingReport([it]).issues.some(i=>i.code==='joinery-template'));
});
test('#30 single-bolt handles and bar holes agree with rendered mounting points',()=>{
 for(const handle of ['leather','knob','bar']){const it=custom('shelves','hinged');it.cab.hw.handle=handle;const L=cab.layoutCab(it),p=cab.drillPlan(it,L).find(p=>p.role==='door'),holes=p.holes.filter(h=>h.kind==='handle');assert.equal(holes.length,handle==='bar'?2:1);assert.equal(L.handleMounts.length,holes.length);if(handle==='bar')near(Math.abs(holes[1].x-holes[0].x),96);}
});
test('#31–33,35 corner swings share the actual hinge and diagonal reach; lift doors have no plan arc',()=>{
 const it=item('k_corner',100,90,80);for(const hinge of ['L','R']){it.cab.cols[0].door.hinge=hinge;const L=cab.layoutCab(it),P=cab.planCab(it),sw=P.swings[0],world=cab.doorSweeps(it,L)[0];assert.deepEqual(sw.pivot,P.poly[hinge==='L'?3:2]);near(sw.reach,L.cornerFront);assert.ok(world.tip.x>world.pivot.x&&world.tip.z>world.pivot.z);near(Math.hypot(world.tip.x-world.pivot.x,world.tip.z-world.pivot.z),L.cornerFront);}
 it.cab.cols[0].door.t='none';assert.equal(cab.planCab(it).swings.length,0);
 const lift=custom('shelves','lift',60,80);assert.equal(cab.planCab(lift).swings.length,0);
});
test('#34 collision warnings respect both door elevation and furniture vertical extent',()=>{
 const it=custom('shelves','hinged',60,80);it.cab.elev=150;const sw=cab.doorSweeps(it)[0];
 const other={id:'obstacle',type:'table',w:20,d:20,h:85,x:sw.tip.x,z:sw.tip.z};S.items=[it,other];
 const collides=()=>cab.checkCab(it).some(i=>i.msg.includes('opens into another piece'));
 assert.equal(collides(),false);other.elev=160;assert.equal(collides(),true);other.elev=240;assert.equal(collides(),false);
});
test('#36 corner doors finish opening in phase one',()=>{
 const it=item('k_corner',90,90,90);it.cab.open=.4;const a=cab.layoutCab(it).units.find(u=>u.type==='door').ang;it.cab.open=1;near(cab.layoutCab(it).units.find(u=>u.type==='door').ang,a);
});
test('#37 bi-fold counter-rotation keeps the moving hinge connected and the leaves outside',()=>{
 for(const hinge of ['L','R'])for(const open of [0,.1,.2,.3,.4]){const it=custom('shelves','folding',80,100);it.cab.cols[0].door.hinge=hinge;it.cab.open=open;const L=cab.layoutCab(it),[a,b]=L.units.filter(u=>u.type==='fold'),fa=L.fronts.find(f=>f.unit===L.units.indexOf(a)),fb=L.fronts.find(f=>f.unit===L.units.indexOf(b));
 const joint=transform(a,hinge==='L'?fa.x1:fa.x0,a.pz);near(joint.x,b.px+(b.tx||0));near(joint.z,b.pz+(b.tz||0));
 for(const [u,f]of [[a,fa],[b,fb]])for(const x of [f.x0,f.x1])assert.ok(transform(u,x,u.pz).z>=L.zc-.01);
 }
});
test('#38 trouser rails lie side by side in depth at one height',()=>{
 const L=cab.layoutCab(custom('trouser')),rails=L.parts.filter(p=>p.role==='rail');assert.equal(rails.length,5);assert.equal(new Set(rails.map(r=>r.y)).size,1);assert.equal(new Set(rails.map(r=>r.z)).size,5);assert.ok(rails.every(r=>r.z>=L.zb&&r.z<=L.zc));
});
test('#39 impossible shallow drawer boxes are omitted and explicitly rejected',()=>{
 const it=custom('drawers','none',60,35);it.cab.cols[0].secs[0].n=20;const L=cab.layoutCab(it);assert.ok(L.cols[0].secs[0].invalidDrawers);assert.ok(cab.checkCab(it).some(i=>i.level==='err'&&i.msg.includes('drawer box')));for(const p of L.parts.filter(p=>p.k==='box'))assert.ok(p.x1>p.x0&&p.y1>p.y0&&p.z1>p.z0);
});
test('#40 narrow television niches never emit a screen outside the bay',()=>{
 for(const w of [12,20,28,60]){const L=cab.layoutCab(custom('tv','none',w,90)),col=L.cols[0];for(const p of L.parts.filter(p=>['tvBody','tvScreen','tvBracket'].includes(p.role)))assert.ok(p.x0>=col.x0&&p.x1<=col.x1);}
});
test('#41–42 leg hardware matches modeled supports at dividers and intermediate spans',()=>{
 for(const preset of ['w_classic','k_corner']){const it=item(preset,preset==='k_corner'?100:300,120,preset==='k_corner'?100:60);it.cab.plinthType='legs';it.cab.plinth=10;const L=cab.layoutCab(it),legs=L.parts.filter(p=>p.role==='leg');assert.ok(legs.length>4);assert.equal(L.hw.legs,legs.length);const priced=cab.hardwareList(it,L).find(r=>r.label==='Adjustable cabinet leg');assert.equal(priced.qty,legs.length);assert.ok(priced.total>0);if(preset==='w_classic')for(const divider of L.parts.filter(p=>p.role==='divider'))assert.ok(legs.some(p=>Math.abs(p.x-(divider.x0+divider.x1)/2)<.1));}
});
test('#43 flush plinth aligns with the closed overlay door face',()=>{
 const it=custom('shelves','hinged');it.cab.plinthType='flush';const L=cab.layoutCab(it),front=L.fronts[0];near(L.parts.find(p=>p.role==='plinth').z1,front.z1);
});
test('#44 corner profile costs the actual exposed diagonal',()=>{
 const it=item('k_corner',90,90,90);it.cab.top=2;const L=cab.layoutCab(it),top=L.parts.find(p=>p.role==='worktop');near(cab.profileMeters(it,L),Math.hypot(top.pts[3].x-top.pts[2].x,top.pts[3].z-top.pts[2].z)/100);assert.ok(cab.profileMeters(it,L)<1);
});
test('#45 drawer boxes use the modeled carcass thickness in their cutting stock',()=>{
 const it=custom('drawers');it.cab.panel=2.5;it.cab.stock.carcass='mel_white_25';cab.normalizeSpec(it.cab,it.w,it.h,it.d);const L=cab.layoutCab(it);for(const p of L.parts.filter(p=>p.role==='drawerBox'))near(cab.partDims(p).t,2.5);for(const row of cab.cutList(it,L).filter(r=>r.role==='drawerBox'))near(sheetById(row.sheet).t,2.5);
});
test('#46 a 60 cm sliding wardrobe admits compact hanging with a clearance warning',()=>{
 const it=item('w_sliding',180,220,60),L=cab.layoutCab(it);assert.ok(cab.secFit('hang',60,200,L.zc-L.zb).ok);assert.equal(cab.secFit('hang',60,200,48).ok,false);assert.ok(cab.checkCab(it).some(i=>i.level==='warn'&&i.msg.includes('hanger')));
});
test('#47 lift fit uses the covered run even when the current door is none',()=>{
 const it=custom('shelves','none',60,240);it.cab.cols[0].secs=[{t:'open',h:190},{t:'shelves',h:35}];cab.normalizeSpec(it.cab,it.w,it.h,it.d);let L=cab.layoutCab(it);assert.ok(cab.doorFit('lift',cab.fitCtx(L,L.cols[0])).ok);it.cab.cols[0].secs[0].t='shelves';L=cab.layoutCab(it);assert.equal(cab.doorFit('lift',cab.fitCtx(L,L.cols[0])).ok,false);
});
test('#48 resizing through 205 cm does not consume 50 cm of the main compartment',()=>{
 for(const mode of ['hang','shelf','mix','draw']){const a=cab.columnFill(mode,205,1.8),b=cab.columnFill(mode,206,1.8);assert.equal(a.length,b.length);assert.ok(Math.abs(a[0].h-b[0].h)<=1.01);}
 for(const H of [205,206,219,240,280]){const secs=cab.columnFill('hang',H,2.5);near(secs.reduce((sum,s)=>sum+s.h,0)+(secs.length-1)*2.5,H);if(secs.length>1)assert.ok(secs[1].h>=cab.STD.minSec);}
});
test('#49 base door plus shelf keeps the top drawer external',()=>{
 const L=cab.layoutCab(item('k_base_door',60,90,60));for(const col of L.cols){const drawer=col.secs.find(s=>s.ref.t==='drawers');assert.equal(drawer.covered,false);const face=L.fronts.find(f=>f.role==='drawerFront');assert.ok(face);for(const door of L.fronts.filter(f=>f.role==='door'))assert.ok(door.y1<=face.y0);}
});
test('#50 revert rebuilds the active definition and derived geometry without a caller resync',()=>{
 const it=custom('shelves','hinged'),state={items:[it]};syncCabinetDefinition(state,it);const snapshot=captureCabinetSession(state,it),before=structuredClone(state.parametric.definitions[it.definitionId].metadata.cabSpec);it.w=90;it.cab.cols[0].secs[0].t='drawers';syncCabinetDefinition(state,it);restoreCabinetSession(state,it,snapshot);
 assert.equal(state.parametric.derived[it.id].parameters.width,60);assert.equal(state.parametric.definitions[it.definitionId].metadata.cabSpec.cols[0].secs[0].t,before.cols[0].secs[0].t);assert.equal(it.w,60);
});
