import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBrepSweep,extractBrepTopology,disposeBrep} from '../js/cad_kernel.js';
import {solveTopologyMates,topologyReference} from '../js/cad_mates.js';
import {exactMateReferenceChoices} from '../js/cad_mate_reference_choices.js';
import {worldFrame} from '../js/cad_mate_model.js';
import {torusBoreSectionContact} from '../js/core/torus_bore_contact.js';

const p=(x,y,z=0)=>({x,y,z}),r=.1905,R=.6626904958857236;
const join=p(.29712355723889794,1.4513402643019049),center=p(-.21052681464212053,1.8773095041142764);
const on=(degrees)=>p(center.x+R*Math.cos(degrees*Math.PI/180),center.y+R*Math.sin(degrees*Math.PI/180));
test('a true tangent circular hook sweep exposes the upper loop as exact toroidal mating geometry',async()=>{
 const tip=on(230),body=await makeBrepSweep({profile:[p(r,0),p(0,0,-r),p(-r,0),p(0,0,r)],
  profileSegments:[{type:'arc',from:p(r,0),mid:p(0,0,-r),to:p(-r,0)},{type:'arc',from:p(-r,0),mid:p(0,0,r),to:p(r,0)}],
  path:[p(0,0),p(0,.635),join,on(95),tip],pathSegments:[{type:'line',from:p(0,0),to:p(0,.635)},
   {type:'arc',from:p(0,.635),mid:p(.07659037160189652,1.0693655820235994),to:join},
   {type:'arc',from:join,mid:on(95),to:tip}],orientation:'follow-path',solid:true});
 try{extractBrepTopology(body,{ownerFeatureId:'hook'});const upper=body.topology.filter(e=>e.descriptor.surface==='torus' && Math.abs(e.descriptor.majorRadius-R)<1e-6);
  assert.equal(upper.length,2);for(const e of upper){assert.ok(Math.abs(e.descriptor.minorRadius-r)<1e-9);assert.ok(Math.abs(e.descriptor.origin.y-center.y)<1e-8);}
  assert.equal(exactMateReferenceChoices(upper,[{id:'hook',name:'Sweep'}]).length,2);
 }finally{disposeBrep(body);}
});

test('the book internal bore-to-hook tangent and Front plane keep two physical motion freedoms after save',()=>{
 const hole={surface:'cylinder',origin:p(0,-10.16,.0762),axis:p(0,0,1),radius:.2413};
 const torus={surface:'torus',origin:center,axis:p(0,0,-1),radius:R,majorRadius:R,minorRadius:r};
 const plane={surface:'plane',origin:p(0,0),normal:p(0,0,1)};
 const ref=(id,name,frame)=>topologyReference(id,'face',name,frame);
 const assembly={components:[{id:'bar',grounded:true,transform:p(0,0)},
  {id:'weight-hook',transform:p(.2,-13.6)}],topologyMates:[
  {id:'contact',type:'tangent',aligned:true,a:ref('bar','bottom-bore',hole),b:ref('weight-hook','upper-loop',torus)},
  {id:'front',type:'coincident',aligned:true,a:ref('bar','plane:front',plane),b:ref('weight-hook','plane:front',plane)}]};
 for(let pass=0;pass<2;pass++){
  const result=solveTopologyMates(assembly);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,2);assert.equal(result.unsatisfied.length,0);
  const t=assembly.components[1].transform,world=worldFrame(torus,assembly.components[1],'component'),distance=Math.hypot(world.origin.x,world.origin.y+10.16);
  assert.ok(Math.abs(distance-(R+hole.radius-r))<1e-5);assert.ok(Math.abs(t.z)<1e-6);
  if(!pass)Object.assign(assembly,JSON.parse(JSON.stringify(assembly)));
 }
});

test('a hook loop crossing the sheet bore keeps its perpendicular axis and two motion freedoms',()=>{
 const hole={surface:'cylinder',origin:p(0,-10.16,.0762),axis:p(0,0,1),radius:.2413};
 const torus={surface:'torus',origin:p(0,center.y,center.x),axis:p(1,0,0),radius:R,majorRadius:R,minorRadius:r};
 const plane={surface:'plane',origin:p(0,0),normal:p(0,0,1)};
 const ref=(id,name,frame)=>topologyReference(id,'face',name,frame);
 const assembly={components:[{id:'bar',grounded:true,transform:p(0,0)},
  {id:'weight-hook',transform:p(0,-13)}],topologyMates:[
   {id:'contact',type:'tangent',aligned:true,a:ref('bar','bottom-bore',hole),b:ref('weight-hook','loop',torus)},
   {id:'front',type:'coincident',aligned:true,a:ref('bar','plane:front',plane),b:ref('weight-hook','plane:front',plane)}]};
 for(let pass=0;pass<2;pass++){
  const result=solveTopologyMates(assembly);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,2);
  const loop=worldFrame(torus,assembly.components[1],'component');
  assert.ok(Math.abs(loop.axis.z)<1e-8,'contact must not rotate the hook into the sheet');
  assert.ok(Math.abs(Math.abs(loop.origin.y+10.16)-(R+hole.radius-r))<1e-5);
  if(!pass)Object.assign(assembly,JSON.parse(JSON.stringify(assembly)));
 }
});

test('finite bore/rim contact seats the exact tube section through the sheet without changing printed geometry',()=>{
 const R=.5419344;
 const hole={surface:'cylinder',origin:p(0,-10.16,.0762),referenceOrigin:p(0,-10.16,0),axisRange:[0,.1524],axis:p(0,0,1),radius:.2413};
 const torus={surface:'torus',origin:p(0,2.54-R,.0762),axis:p(1,0,0),radius:R,majorRadius:R,minorRadius:r};
 const plane={surface:'plane',origin:p(0,0),normal:p(0,0,1)},ref=(id,name,frame)=>topologyReference(id,'face',name,frame);
 const assembly={components:[{id:'bar',grounded:true,transform:p(0,0)},{id:'hook',transform:p(0,-12.76)}],topologyMates:[
  {id:'contact',type:'tangent',aligned:true,contactMode:'finite-bore',a:ref('bar','bore',hole),b:ref('hook','loop',torus)},
  {id:'front',type:'coincident',aligned:true,a:ref('bar','plane:front',plane),b:ref('hook','plane:front',plane)}]};
 const result=solveTopologyMates(assembly);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.degreesOfFreedom,2);
 const contact=torusBoreSectionContact(worldFrame(torus,assembly.components[1],'component'),hole);
 assert.ok(Math.abs(contact.distance-hole.radius)<1e-7);
 // This independent dense sample checks every exact upper torus section at
 // 21 axial positions and 721 tube angles against the finite bore radius.
 const world=worldFrame(torus,assembly.components[1],'component');
 for(let zi=0;zi<=20;zi++)for(let ai=0;ai<=720;ai++){
  const z=.1524*zi/20-world.origin.z,angle=2*Math.PI*ai/720;
  const x=r*Math.cos(angle),radial=R+r*Math.sin(angle);
  const y=world.origin.y+Math.sqrt(radial*radial-z*z);
  assert.ok(Math.hypot(x,y+10.16)<=hole.radius+1e-7);
 }
});
