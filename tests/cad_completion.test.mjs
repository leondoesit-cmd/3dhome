import test from 'node:test';
import assert from 'node:assert/strict';
import {addCubicSpline,splineControls,bezierPoint,bezierLineHits} from '../js/sketch_spline.js';
import {sampleSketchPath,sketchPathSegments} from '../js/core/swept_sources.js';
import {makeBrepSweep,shapeMassProperties,disposeBrep} from '../js/cad_kernel.js';
import {trimEntity} from '../js/sketch_trim.js';
import {restoreSketchConstraint} from '../js/sketch_edit_repair.js';
import {generatedRackGear,validateGearPair} from '../js/cad_gear_geometry.js';
const blank=()=>({id:'s',plane:'front',points:[],entities:[],constraints:[]});
test('cubic spline survives JSON and reaches the kernel as the same curve',async()=>{
 const s=blank(),e=addCubicSpline(s,[{x:0,y:0},{x:0,y:3},{x:2,y:7},{x:2,y:10}]);
 const saved=JSON.parse(JSON.stringify(s)),path=sampleSketchPath(saved),segments=sketchPathSegments(saved);
 assert.equal(segments[0].type,'bezier');assert.equal(segments[0].controls.length,4);assert.ok(path.length>4);
 const body=await makeBrepSweep({profile:[{x:-.1,y:0,z:-.1},{x:.1,y:0,z:-.1},{x:.1,y:0,z:.1},{x:-.1,y:0,z:.1}],path,pathSegments:segments});
 try{const volume=(await shapeMassProperties(body)).volume;assert.ok(volume>0);
  const {exportStep,importStep}=await import('../js/cad_kernel.js');const bytes=await exportStep(body,'cubic-sweep.step'),restored=await importStep(bytes,'cubic-sweep.step');
  try{assert.ok(Math.abs((await shapeMassProperties(restored)).volume-volume)<1e-6);}finally{disposeBrep(restored);}
 }finally{disposeBrep(body);}
 assert.deepEqual(splineControls(e,new Map(s.points.map(p=>[p.id,p]))).map(p=>({x:p.x,y:p.y})),[{x:0,y:0},{x:0,y:3},{x:2,y:7},{x:2,y:10}]);
});
test('spline trim keeps an exact Bezier subcurve',()=>{
 const s=blank(),e=addCubicSpline(s,[{x:0,y:0},{x:2,y:3},{x:4,y:3},{x:6,y:0}]),controls=splineControls(e,new Map(s.points.map(p=>[p.id,p])));
 s.points.push({id:'l1',x:3,y:-1},{id:'l2',x:3,y:5});s.entities.push({id:'line',type:'line',a:'l1',b:'l2'});
 assert.ok(Math.abs(bezierLineHits(controls,s.points.at(-2),s.points.at(-1))[0].t-.5)<1e-10);
 assert.equal(trimEntity(s,e.id,{x:1,y:1}),true);
 const retained=splineControls(s.entities.find(q=>q.type==='spline'),new Map(s.points.map(p=>[p.id,p])));
 for(let i=0;i<=10;i++){const a=bezierPoint(retained,i/10),b=bezierPoint(controls,.5+i/20);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-9);}
});
test('trim archives dimensions and repair refuses conflicting restoration atomically',()=>{
 const s={points:[{id:'a',x:0,y:0,fixed:true},{id:'b',x:10,y:0},{id:'c',x:4,y:-2},{id:'d',x:4,y:2}],entities:[{id:'l',type:'line',a:'a',b:'b'},{id:'cut',type:'line',a:'c',b:'d'}],constraints:[{id:'dim',type:'distance',entity:'l',value:10}]};
 trimEntity(s,'l',{x:8,y:0});assert.equal(s.repairs.length,1);assert.equal(s.constraints.length,0);
 const saved=JSON.parse(JSON.stringify(s));assert.equal(saved.repairs[0].constraint.value,10);
 restoreSketchConstraint(s,s.repairs[0].id,{},4);assert.equal(s.constraints[0].value,4);assert.equal(s.repairs[0].status,'restored');
});
test('rack generation preserves pitch thickness, rejects undercut and checks mating clearance',()=>{
 const spec={moduleMm:2,teeth:20},gear=generatedRackGear(spec);
 const dense=generatedRackGear({...spec,outlineSimplificationMm:0});
 assert.ok(gear.points.length<dense.points.length,'bounded simplification reduces kernel edge count');
 for(const point of dense.points) {
  let distance=Infinity;
  gear.points.forEach((a,i)=>{
   const b=gear.points[(i+1)%gear.points.length],du=b.u-a.u,dv=b.v-a.v,length=du*du+dv*dv;
   const t=length?Math.max(0,Math.min(1,((point.u-a.u)*du+(point.v-a.v)*dv)/length)):0;
   distance=Math.min(distance,Math.hypot(point.u-a.u-t*du,point.v-a.v-t*dv));
  });
  assert.ok(distance<=gear.outlineSimplificationMm/10+1e-9,'simplified tooth preserves every dense contour point within the declared tolerance');
 }
 assert.ok(Math.abs(Math.min(...gear.points.map(p=>Math.hypot(p.u,p.v)))-1.75)<1e-9);
 assert.ok(Math.abs(Math.max(...gear.points.map(p=>Math.hypot(p.u,p.v)))-2.2)<1e-9);
 assert.throws(()=>generatedRackGear({...spec,teeth:10}),/undercut/);
 const pair=validateGearPair(spec,spec);assert.equal(pair.ok,true);assert.ok(Math.abs(pair.contactRatio-1.5568383)<1e-6);assert.equal(pair.tipClearanceMm,.5);
 assert.equal(validateGearPair(spec,{moduleMm:3,teeth:20}).ok,false);
 assert.notDeepEqual(generatedRackGear({...spec,cutter:{tipRadiusCoefficient:.3}}).points,gear.points);
});

test('exact cut scope rejects bounding-box overlap, contact and existing voids',async()=>{
 const {exactCutIntersection}=await import('../js/modeler_part_geometry.js');
 const cylinder={id:'c',kind:'cyl',axis:'z',x:0,y:0,z:0,r:1,h:2};
 const box=(x,y,w)=>[{u:x,v:y},{u:x+w,v:y},{u:x+w,v:y+w},{u:x,v:y+w}];
 const cut={axis:'z',from:-1,to:3,loop:box(.9,.9,.2)},before=structuredClone(cylinder);
 assert.equal((await exactCutIntersection(cylinder,cut)).intersects,false);
 assert.equal((await exactCutIntersection(cylinder,{...cut,loop:box(-.2,-.2,.4)})).intersects,true);
 assert.equal((await exactCutIntersection(cylinder,{...cut,from:2,to:3,loop:box(-.2,-.2,.4)})).intersects,false);
 assert.deepEqual(cylinder,before);
});
test('generated gear is a valid native solid and its root has no radial jump',async()=>{
 const {makeBrepExtrusion}=await import('../js/cad_kernel.js'),g=generatedRackGear({moduleMm:2,teeth:20});
 const body=await makeBrepExtrusion({axis:'y',from:0,to:.8,points:g.points});
 try{const mass=await shapeMassProperties(body);assert.ok(mass.volume>5&&mass.volume<13);}finally{disposeBrep(body);}
 const jump=Math.max(...g.points.map((p,i)=>Math.hypot(p.u-g.points[(i+1)%g.points.length].u,p.v-g.points[(i+1)%g.points.length].v)));assert.ok(jump<.1);
});
test('failed constraint repair leaves both sketch and pending repair unchanged',()=>{
 const s={points:[{id:'a',x:0,y:0,fixed:true},{id:'b',x:4,y:0,fixed:true}],entities:[{id:'l',type:'line',a:'a',b:'b'}],constraints:[],repairs:[{id:'r',status:'pending',constraint:{id:'d',type:'distance',entity:'l',value:10},points:[],entities:[]}]},before=structuredClone(s);
 assert.throws(()=>restoreSketchConstraint(s,'r',{},10),/conflicts/);assert.deepEqual(s,before);
});
test('spline handles participate in solver constraints and pattern copies',async()=>{
 const {solveSketch}=await import('../js/sketch_solver.js'),{linearPatternEntities}=await import('../js/sketch_pattern.js');
 const s=blank(),e=addCubicSpline(s,[{x:0,y:0},{x:2,y:3},{x:4,y:3},{x:6,y:0}]);s.points.forEach(p=>p.fixed=true);
 const result=linearPatternEntities(s,[e.id],{count:2,spacing:10});result.dimensions[0].value=12;
 assert.equal(solveSketch(s).converged,true);const copy=result.copies[0].entities[0],map=new Map(s.points.map(p=>[p.id,p]));
 for(const key of ['a','h1','h2','b'])assert.ok(Math.abs(map.get(copy[key]).x-map.get(e[key]).x-12)<1e-5);
});

test('a canonical sweep rebuild reads edited spline controls after saving',async()=>{
 const {regenerateFeatures,releaseRegeneration}=await import('../js/cad_feature_tree.js');
 const path=blank();path.id='path';const spline=addCubicSpline(path,[{x:0,y:0},{x:0,y:3},{x:2,y:7},{x:2,y:10}]);path.points.forEach(p=>p.fixed=true);
 const profile={id:'profile',plane:'top',points:[{id:'p0',x:-.1,y:-.1,fixed:true},{id:'p1',x:.1,y:-.1,fixed:true},{id:'p2',x:.1,y:.1,fixed:true},{id:'p3',x:-.1,y:.1,fixed:true}],entities:[0,1,2,3].map(i=>({id:'e'+i,type:'line',a:'p'+i,b:'p'+((i+1)%4)})),constraints:[]};
 const def={sketches:[profile,path],features:[{id:'sweep',type:'sweep',inputs:[],params:{sketchSources:{kind:'sweep',profile:{sketchId:'profile',entityIds:profile.entities.map(e=>e.id)},path:{sketchId:'path',entityIds:[spline.id]}}}}]};
 const first=await regenerateFeatures(def);let volume;
 try{assert.equal(first.ok,true,JSON.stringify(first.issues));volume=(await shapeMassProperties(first.finalShape)).volume;}finally{releaseRegeneration(first);}
 const saved=JSON.parse(JSON.stringify(def));saved.sketches[1].points.find(p=>p.id===spline.b).y=15;
 const second=await regenerateFeatures(saved);try{assert.equal(second.ok,true,JSON.stringify(second.issues));assert.ok((await shapeMassProperties(second.finalShape)).volume>volume);}finally{releaseRegeneration(second);}
});
test('rounded rack does not remove generated gear material during rolling',()=>{
 const g=generatedRackGear({moduleMm:2,teeth:20}),s=g.spec;
 // Independent inverse rolling transform, tested over a generating pass.
 let penetration=0;
 for(let j=0;j<=80;j++){const t=-.4+j*.01,co=Math.cos(t),si=Math.sin(t);
  for(const p of g.points){const x=-p.v*10,y=p.u*10; // tooth-space zero -> rack's +Y
   const X=x*co+y*si-s.rp*t,Y=-x*si+y*co-s.rp;
   if(Y<=-s.depth+1e-7||Y>=s.m*2)continue;
   const width=Y<s.joinY?s.xc+Math.sqrt(Math.max(0,s.rho*s.rho-(Y-s.yc)**2)):s.half+Y*Math.tan(s.alpha);
   penetration=Math.max(penetration,width-Math.abs(X));
  }
 }
 assert.ok(penetration<1e-6,`Rack removes generated material by ${penetration} mm`);
});

test('endpoint tangent constrains the spline handle and joins the selected line end',async()=>{
 const {solveSketch}=await import('../js/sketch_solver.js');const s=blank(),e=addCubicSpline(s,[{x:0,y:0},{x:2,y:1},{x:4,y:3},{x:6,y:0}]);
 s.points.push({id:'la',x:-3,y:0,fixed:true},{id:'lb',x:0,y:0,fixed:true});s.entities.push({id:'line',type:'line',a:'la',b:'lb'});
 s.constraints.push({id:'tan',type:'tangent',a:e.id,b:'line',splineEnd:'a',lineEnd:'b'});assert.equal(solveSketch(s).converged,true);
 assert.ok(Math.abs(s.points.find(p=>p.id===e.h1).y)<1e-5);
});
test('spline/circle intersections preserve polynomial geometry rather than chord hits',async()=>{
 const {bezierCircleHits}=await import('../js/sketch_spline.js');const p=[{x:-2,y:0},{x:-2/3,y:0},{x:2/3,y:0},{x:2,y:0}];
 const hits=bezierCircleHits(p,{x:0,y:0},1).sort((a,b)=>a.t-b.t);assert.equal(hits.length,2);assert.ok(Math.abs(hits[0].t-.25)<1e-9);assert.ok(Math.abs(hits[1].t-.75)<1e-9);
});

test('cut broad phase includes crossing strips whose vertices are all outside',async()=>{
 const {cutFootprintsMayOverlap}=await import('../js/core/cut_scope.js');
 const strip=[{u:-5,v:-.2},{u:5,v:-.2},{u:5,v:.2},{u:-5,v:.2}];
 assert.equal(cutFootprintsMayOverlap(strip,{u0:-.2,u1:.2,v0:-5,v1:5}),true);
});
