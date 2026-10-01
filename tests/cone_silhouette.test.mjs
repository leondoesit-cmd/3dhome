import test from 'node:test';
import assert from 'node:assert/strict';
import {coneSilhouette,detachDrivenSketchDimension,detachLinkedSketchEntity,updateSilhouetteSketch,retargetConvertedCircle,retargetSilhouetteLine} from '../js/core/cone_silhouette.js';
import {makeBrepExtrusion,extractBrepTopology,disposeBrep} from '../js/cad_kernel.js';

test('replacing a consumed manual BackCut line preserves ids and follows the trimmed draft silhouette',()=>{
 const face={ownerFeatureId:'base',persistentId:'base-cone',kind:'face',descriptor:{surface:'cone',referenceOrigin:{x:0,y:0,z:0},axis:{x:0,y:0,z:-1},axisRange:[0,4.3815],radius:6.223,angle:Math.PI/36}};
 const sketch={plane:'right',points:[{id:'a',x:-3.773,y:6.599},{id:'b',x:-4.408,y:6.606}],entities:[{id:200,type:'line',a:'a',b:'b'}],constraints:[{id:'length',type:'distance',entity:200,value:.635}]};
 let next=0;retargetSilhouetteLine(sketch,200,face,{side:'normal',fromEnd:'upper',length:.635},()=>`fix-${++next}`);
 assert.deepEqual(sketch.entities,[{id:200,type:'line',a:'a',b:'b'}]);
 assert.equal(sketch.constraints.find(c=>c.id==='length').driven,true);
 assert.equal(sketch.silhouetteCopies[0].entityId,200);
 const [a,b]=sketch.points;assert.ok(Math.abs(a.x+4.3815)<1e-10);assert.ok(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-.635)<1e-10);
 assert.ok(Math.abs((b.y-a.y)/(b.x-a.x)+Math.tan(Math.PI/36))<1e-10);
 const changed=structuredClone(face);changed.descriptor.radius+=.1;changed.descriptor.angle=Math.PI/30;
 const updated=updateSilhouetteSketch(sketch,()=>changed);
 assert.equal(updated.entities[0].id,200);assert.ok(Math.abs(Math.hypot(updated.points[1].x-updated.points[0].x,updated.points[1].y-updated.points[0].y)-.635)<1e-10);
 assert.ok(Math.abs((updated.points[1].y-updated.points[0].y)/(updated.points[1].x-updated.points[0].x)+Math.tan(Math.PI/30))<1e-10);
 for(const constraint of updated.constraints.filter(c=>c.type==='fixed'))assert.equal(constraint.y,updated.points.find(p=>p.id===constraint.point).y);
 const before=structuredClone(sketch);assert.throws(()=>retargetSilhouetteLine(sketch,200,face,{length:99}),/exceeds/);assert.deepEqual(sketch,before);
});

test('explicit circle-source repair preserves consumed entity ids and linked offsets',()=>{
 const edge=(id,r,z)=>({kind:'edge',persistentId:id,descriptor:{curve:'circle',radius:r,measure:2*Math.PI*r,origin:{x:0,y:0,z},axis:{x:0,y:0,z:1}}});
 const old=edge('old-circle',5.30225,0),fresh=edge('front-inner',5.30225,3.302);
 const sketch={plane:'front',offset:0,points:[{id:'p',x:0,y:0},{id:'q',x:0,y:0}],entities:[{id:'inner',type:'circle',c:'p',r:5.30225},{id:'offset',type:'circle',c:'q',r:5.40225}],constraints:[{type:'fixed',point:'p',x:0,y:0},{type:'diameter',entity:'inner',value:10.6045},{type:'diameter',entity:'offset',value:10.8045},{type:'offset',a:'inner',b:'offset',value:.1}],circleCopies:[{source:old,entityId:'inner'},{source:old,entityId:'offset',offsetFrom:'inner',offset:.1}]};
 const consumedHoleIds=['inner'];
 retargetConvertedCircle(sketch,'inner',fresh);
 assert.deepEqual(sketch.entities.map(e=>e.id),['inner','offset']);assert.equal(consumedHoleIds[0],sketch.entities[0].id);
 assert.ok(sketch.circleCopies.every(copy=>copy.source.persistentId==='front-inner'));
 const thicker=edge('front-inner',5.1,3.302),updated=updateSilhouetteSketch(sketch,ref=>ref.persistentId===thicker.persistentId?thicker:null);
 assert.equal(updated.entities[0].r,5.1);assert.ok(Math.abs(updated.entities[1].r-5.2)<1e-9);
 const before=structuredClone(sketch);
 assert.throws(()=>retargetConvertedCircle(sketch,'inner',{descriptor:{curve:'line'}}),/complete circular edge/);
 assert.deepEqual(sketch,before,'an invalid source cannot partially change the saved association');
});
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

test('driving a converted circle detaches only that entity from source refresh',()=>{
 const sketch={
  plane:'front',offset:0,
  points:[{id:'centre',x:0,y:0},{id:'other-centre',x:0,y:0}],entities:[{id:'thread-circle',type:'circle',c:'centre',r:6.1239},{id:'other-circle',type:'circle',c:'other-centre',r:1}],constraints:[{id:'diameter',type:'diameter',entity:'thread-circle',value:12.2478}],
  circleCopies:[{entityId:'thread-circle',source:{persistentId:'rear-rim'}},{entityId:'other-circle',source:{persistentId:'front-rim'}}],
  silhouetteCopies:[{entityId:'side-line',source:{persistentId:'cone-face'}}],
 };
 assert.equal(detachLinkedSketchEntity(sketch,'thread-circle'),true);
 assert.deepEqual(sketch.circleCopies.map(copy=>copy.entityId),['other-circle']);
 assert.deepEqual(sketch.silhouetteCopies.map(copy=>copy.entityId),['side-line']);
 const rebuilt=updateSilhouetteSketch({...sketch,silhouetteCopies:[]},()=>({descriptor:{curve:'circle',radius:6.223876,measure:2*Math.PI*6.223876,origin:{x:0,y:0,z:0},axis:{x:0,y:0,z:1}}}));
 assert.equal(rebuilt.entities[0].r,6.1239,'exact rebuild must not restore the converted edge radius');
 assert.equal(rebuilt.constraints[0].value,12.2478,'the edited diameter remains authoritative');
 assert.equal(detachLinkedSketchEntity(sketch,'thread-circle'),false);
});

test('only an active driving radial dimension breaks a converted-edge link',()=>{
 const make=()=>({circleCopies:[{entityId:'circle'}],silhouetteCopies:[]});
 for(const constraint of [
  {type:'diameter',entity:'circle',driven:true},
  {type:'radius',entity:'circle',suppressed:true},
  {type:'distance',entity:'circle'},
 ]){
  const sketch=make();
  assert.equal(detachDrivenSketchDimension(sketch,constraint),false);
  assert.equal(sketch.circleCopies.length,1);
 }
 const sketch=make();
 assert.equal(detachDrivenSketchDimension(sketch,{type:'diameter',entity:'circle'}),true);
 assert.deepEqual(sketch.circleCopies,[]);
});

test('a converted circle whose source edge id moved follows the one matching complete circle, never a guess',async()=>{
 const {linkedEdgeLookup}=await import('../js/core/cone_silhouette.js');
 const circle=(id,radius,z,extra={})=>({persistentId:id,kind:'edge',semantic:id.split(':').pop(),descriptor:{curve:'circle',radius,measure:2*Math.PI*radius,origin:{x:0,y:0,z},axis:{x:0,y:0,z:1},...extra}});
 const ref={ownerFeatureId:'shell',kind:'edge',persistentId:'shell:edge:generated:circle:11',semantic:'generated-11',descriptor:circle('x',5.30225,3.302).descriptor};
 const inner=circle('shell:edge:generated:circle:4',5.30225,3.302),outer=circle('shell:edge:generated:circle:11',5.55625,3.302);
 assert.equal(linkedEdgeLookup([inner,{...outer,persistentId:'shell:edge:generated:circle:7'}],ref),inner);
 assert.equal(linkedEdgeLookup([inner,outer],ref),outer,'an id that still names a complete circle is followed, whatever its radius');
 const reused={...outer,descriptor:{...outer.descriptor,curve:'line',radius:undefined}};
 assert.equal(linkedEdgeLookup([inner,reused],ref),inner,'an id now naming another kind of edge falls back to the matching circle');
 assert.equal(linkedEdgeLookup([circle('a',5.30225,3.302,{axis:{x:0,y:0,z:-1}}),circle('b',5.30225,3.302)],ref),undefined,'two matching circles are ambiguous');
 const half={...inner,descriptor:{...inner.descriptor,measure:Math.PI*5.30225}};
 assert.equal(linkedEdgeLookup([half],ref),undefined,'a split half circle is not the complete edge');
 assert.equal(linkedEdgeLookup([circle('c',5.30225,3.2)],ref),undefined,'a circle on another plane is not the source');
 assert.equal(linkedEdgeLookup([{...inner,kind:'face'}],{...ref,kind:'face'}),undefined,'faces keep the exact lookup');
});
