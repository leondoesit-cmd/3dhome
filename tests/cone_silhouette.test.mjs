import test from 'node:test';
import assert from 'node:assert/strict';
import {coneSilhouette,updateSilhouetteSketch} from '../js/core/cone_silhouette.js';
import {makeBrepExtrusion,extractBrepTopology,disposeBrep} from '../js/cad_kernel.js';
test('converted draft silhouette keeps its exact slope and follows a changed source',async()=>{
 const body=await makeBrepExtrusion({points:[{u:6.223,v:0},{u:0,v:6.223},{u:-6.223,v:0},{u:0,v:-6.223}],segments:[{type:'circle',center:{u:0,v:0},radius:6.223}],from:0,to:-4.3815,axis:'z',draftAngle:5,draftOutward:true});
 try{
 const face=extractBrepTopology(body,{ownerFeatureId:'base'}).topology.find(f=>f.kind==='face'&&f.descriptor.surface==='cone');
 const sketch={plane:'right',points:[{id:'a'},{id:'b'}],entities:[{id:'line',type:'line',a:'a',b:'b'}],constraints:[{type:'fixed',point:'a'},{type:'fixed',point:'b'}],silhouetteCopies:[{source:face,entityId:'line',length:.635}]};
 const line=coneSilhouette(sketch,face,{length:.635});
 assert.ok(Math.abs(Math.hypot(line.b.x-line.a.x,line.b.y-line.a.y)-.635)<1e-8);
 for(const p of [line.a,line.b])assert.ok(Math.abs(p.y-(6.223-p.x*Math.tan(Math.PI/36)))<1e-7,JSON.stringify(p));
 const changed=structuredClone(face);changed.descriptor.radius+=1;
 const updated=updateSilhouetteSketch(sketch,()=>changed);
 assert.ok(Math.abs(updated.points[0].y-line.a.y-1)<1e-8);
 assert.equal(updated.constraints[0].y,updated.points[0].y);
 assert.equal(sketch.points[0].y,undefined);
 assert.throws(()=>coneSilhouette({plane:'front'},face),/plane/);
 assert.throws(()=>coneSilhouette(sketch,face,{length:100}),/exceeds/);
 }finally{disposeBrep(body);}
});

test('a converted rear circle projects onto an offset plane and follows its radius',async()=>{
 const {projectCircularEdge}=await import('../js/core/cone_silhouette.js');
 const edge={descriptor:{curve:'circle',radius:6.2,measure:2*Math.PI*6.2,origin:{x:0,y:0,z:-4.3815},axis:{x:0,y:0,z:1}}};
 const sketch={plane:'front',offset:-3.2385,points:[{id:'p',x:0,y:0}],entities:[{id:'circle',type:'circle',c:'p',r:1}],constraints:[{type:'diameter',entity:'circle',value:2}],circleCopies:[{source:{},entityId:'circle'}]};
 assert.deepEqual(projectCircularEdge(sketch,edge),{x:0,y:0,radius:6.2});
 const updated=updateSilhouetteSketch(sketch,()=>edge);assert.equal(updated.entities[0].r,6.2);assert.equal(updated.constraints[0].value,12.4);
 assert.throws(()=>projectCircularEdge({plane:'right'},edge),/parallel/);
 assert.throws(()=>projectCircularEdge(sketch,{descriptor:{...edge.descriptor,measure:1}}),/complete/);
});
