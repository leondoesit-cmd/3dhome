import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveEquations} from '../js/sketch_equations.js';
import {solveSketch} from '../js/sketch_solver.js';
import {healSketchEndpoints} from '../js/sketch_profiles.js';
import {sectionBodies} from '../js/core/hidden_line.js';
import {chainLoops,createSheetDoc,createProjector,buildSheetScene} from '../js/cad_sheet.js';
import {tessellatePart,tessellateParts} from '../js/core/part_tessellate.js';
import {computeMassProperties,generateBOM} from '../js/cad_interference.js';
import {evaluateMassProperties} from '../js/cad_mass_properties.js';
import {knurlGrooveHelices,knurlGroovePolylines,knurlDisplacement,knurlStarts} from '../js/cad_knurl.js';
import {normalizeHoleWizard,holeWizardSolids,holeWizardThread} from '../js/cad_hole_wizard.js';
import {surfacePoint,surfaceNormal} from '../js/core/surface_uv.js';
import {convertCadToWalls} from '../js/cad_to_walls.js';
import {evaluateDimensionRequest} from '../js/core/smart_dimension.js';
import {buildDependencyGraph} from '../js/core/dependency_graph.js';
import {rebuildDefinition} from '../js/core/rebuild.js';
import {createDefinition} from '../js/core/schema.js';
import {createFrameResolver,mateResidual} from '../js/cad_mate_model.js';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';
import {topologyForFeature} from '../js/core/topology.js';
import {makeBrepPrimitive,chamferBrep,draftBrep,disposeBrep,shapeMassProperties,moveBodyBrep,extractBrepTopology} from '../js/cad_kernel.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const box={kind:'box',x0:0,x1:4,y0:0,y1:6,z0:0,z1:8};
test('51 named dimensions resolve before their first numeric value exists',()=>{
 const def={sketches:[{constraints:[{id:'a',name:'Length',expr:'25+5'},{id:'b',expr:'Length*2'}]}]};
 assert.deepEqual(resolveEquations(def).errors,[]);assert.equal(def.sketches[0].constraints[1].value,60);
});
test('52 section through an existing vertex retains its nonzero cut chord',()=>{
 const result=sectionBodies([{positions:[0,0,0,5,5,0,5,-5,0]}],{normal:{x:0,y:1,z:0},origin:{x:0,y:0,z:0}});
 assert.equal(result.cuts.length,1);const cut=result.cuts[0];near(Math.hypot(cut.a.x-cut.b.x,cut.a.y-cut.b.y,cut.a.z-cut.b.z),5);
});
test('53 open section polylines never become hatch boundaries',()=>{
 const p=[{u:0,v:0},{u:10,v:0},{u:10,v:10},{u:0,v:10}],segments=p.slice(1).map((q,i)=>({a:p[i],b:q}));
 assert.deepEqual(chainLoops(segments),[]);segments.push({a:p[3],b:p[0]});assert.equal(chainLoops(segments.reverse()).length,1);
});
test('54 plane-cylinder tangent mates solve in either reference order without locking in-plane motion',()=>{
 const plane={surface:'plane',origin:{x:0,y:0,z:0},normal:{x:0,y:1,z:0}},cyl={surface:'cylinder',origin:{x:0,y:0,z:0},axis:{x:0,y:0,z:1},radius:2};
 for(const reverse of [false,true]){
  const a={id:'a',grounded:true,transform:{x:0,y:0,z:0}},b={id:'b',transform:{x:7,y:8,z:3}};
  const assembly={components:[a,b],topologyMates:[{id:'t',type:'tangent',a:{componentId:'a',frameSpace:'component',frame:reverse?cyl:plane},b:{componentId:'b',frameSpace:'component',frame:reverse?plane:cyl}}]};
  const run=solveAssemblyMates(assembly);assert.equal(run.ok,true,JSON.stringify(run));const m=assembly.topologyMates[0],resolve=createFrameResolver({issues:[],rebindings:[]}),r=mateResidual(m,resolve(m.a,a,m.id,false),resolve(m.b,b,m.id,false),b);near(r.linear,0,1e-4);near(r.angular,0,1e-4);if(!reverse){near(b.transform.x,7,1e-4);near(b.transform.z,3,1e-4);}
 }
});
test('55 healing remaps rotation centres and paired points before deleting them',()=>{
 const sketch={points:[{id:'p1',x:0,y:0},{id:'p2',x:.001,y:0},{id:'p3',x:10,y:0}],entities:[{id:'e1',type:'line',a:'p1',b:'p3'},{id:'e2',type:'line',a:'p2',b:'p3'}],constraints:[{type:'rotation',center:'p2',pairs:[['p2','p3']]}]};
 healSketchEndpoints(sketch,['e1','e2'],.05);const ids=new Set(sketch.points.map(p=>p.id));assert.ok(ids.has(sketch.constraints[0].center));assert.ok(ids.has(sketch.constraints[0].pairs[0][0]));
});
test('56 suppressed bodies and components are excluded from every mass/BOM entry point',async()=>{
 assert.equal(generateBOM({components:[{id:'a',name:'Bolt'},{id:'b',name:'Bolt',suppressed:true}]}).rows?.[0]?.quantity ?? generateBOM({components:[{id:'a',name:'Bolt'},{id:'b',name:'Bolt',suppressed:true}]})[0].quantity,1);
 near(computeMassProperties({parts:[box,{...box,suppressed:true}]}).volumeCm3,192);
 near((await evaluateMassProperties({parts:[box,{...box,suppressed:true}]})).volumeCm3,192);
});
test('57 equal-radius tangent circles cannot solve as concentric duplicates',()=>{
 const sketch={points:[{id:'a',x:0,y:0,fixed:true},{id:'b',x:1,y:0}],entities:[{id:'a1',type:'circle',c:'a',r:2},{id:'b1',type:'circle',c:'b',r:2}],constraints:[{type:'radius',entity:'a1',value:2},{type:'radius',entity:'b1',value:2},{type:'tangent',a:'a1',b:'b1'}]};
 const run=solveSketch(sketch);assert.equal(run.converged,true,JSON.stringify(run));near(Math.hypot(sketch.points[1].x,sketch.points[1].y),4,1e-3);
});
test('58 negative-height cylinder and frustum triangle winding stays outward',()=>{
 for(const axis of ['x','y','z'])for(const r2 of [1,2]){
  const data=tessellatePart({kind:'cyl',axis,r:2,r2,h:-5,x:0,y:0,z:0});let signed=0;
  for(let i=0;i<data.positions.length;i+=9){const [ax,ay,az,bx,by,bz,cx,cy,cz]=data.positions.slice(i,i+9);signed+=(ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx))/6;}
  assert.ok(signed>0);
 }
});
test('61 asymmetric chamfers work without a pre-populated subshape cache; 62 zero draft returns an independent identity',async()=>{
 const body=await makeBrepPrimitive({type:'box',w:10,h:10,d:10});let chamfer,identity;
 try{chamfer=await chamferBrep(body,.2,{mode:'two-distance',secondDistance:.3});assert.ok((await shapeMassProperties(chamfer)).volume<1000);identity=await draftBrep(body,0);near((await shapeMassProperties(identity)).volume,1000);assert.notEqual(identity.shape,body.shape);disposeBrep(identity);identity=null;near((await shapeMassProperties(body)).volume,1000);}finally{disposeBrep(body);if(chamfer)disposeBrep(chamfer);if(identity)disposeBrep(identity);}
});
test('65/66 groove lead, handedness and displacement agree; straight grooves are straight',()=>{
 const spec={diameterMm:20,lengthMm:30,pitchMm:1,helixAngle:30,type:'right'};
 const groove=knurlGrooveHelices(spec)[0];near(groove.pitch,2*Math.PI/Math.tan(Math.PI/6));
 const h=.43,angle=Math.tan(Math.PI/6)*h,phase=2*Math.PI/knurlStarts(spec);
 near(knurlDisplacement(spec,angle,h),.03);near(knurlDisplacement({...spec,type:'left'},-angle,h),.03);
 assert.notEqual(knurlDisplacement(spec,angle+.17*phase,h),knurlDisplacement({...spec,type:'left'},angle+.17*phase,h));
 const path=knurlGroovePolylines({...spec,type:'straight'})[0];near(path[0].x,path.at(-1).x);near(path[0].z,path.at(-1).z);
});
test('67 normal clearance uses ISO 273 medium series; 68 thread engagement starts beyond the major-diameter entrance',()=>{
 near(normalizeHoleWizard({standardSize:'M6',fit:'normal'}).diameterMm,6.6);near(normalizeHoleWizard({standardSize:'M10',fit:'normal'}).diameterMm,11);
 const params={holeType:'tap-countersink',standardSize:'M6',depthMm:30,endCondition:'blind',csinkDiameterMm:12,csinkAngle:90};
 const solids=holeWizardSolids(params),thread=holeWizardThread(params);const cone=solids.solids.find(s=>s.kind==='cone');near(cone.diameter2,.5);near(thread.spec.origin.y,.3);
});
test('69 failed independent sketches and parameters do not erase healthy bodies',()=>{
 const def=createDefinition({parameters:{broken:{value:1,expression:'unknown+1'}},sketches:[{id:'bad',points:[],entities:[],constraints:[{id:'c',name:'badDimension',expr:'noSuchVariable'}]}],features:[{id:'good',type:'box',params:{x:0,y:0,z:0,w:4,h:6,d:8}},{id:'badFeature',type:'box',params:{w:'$broken',h:2,d:2}}]});
 const run=rebuildDefinition(def);assert.equal(run.ok,false);assert.ok(run.results.has('good'));assert.equal(run.results.has('badFeature'),false);
});
test('70 sketch input references are valid graph dependencies while missing inputs remain errors',()=>{
 const def={sketches:[{id:'s'}],features:[{id:'e',type:'extrude',inputs:['s']}]};assert.deepEqual(buildDependencyGraph(def).issues,[]);def.features[0].inputs=['missing'];assert.equal(buildDependencyGraph(def).issues[0].code,'missing-feature-reference');
});
test('71 over-width openings are rejected with a diagnostic',()=>{
 const result=convertCadToWalls({lines:[{x1:0,z1:0,x2:60,z2:0},{x1:0,z1:10,x2:60,z2:10}],doors:[{x:30,z:5,width:90}]});
 assert.equal(result.openings.length,0);assert.equal(result.diagnostics.rejectedOpenings.length,1);
});
test('72 native rotation carries its actual centroid transform into face descriptors',async()=>{
 const body=await makeBrepPrimitive({type:'box',x:10,y:0,z:0,w:4,h:6,d:8});let moved;
 try{const topo=extractBrepTopology(body,{ownerFeatureId:'box'});moved=await moveBodyBrep(body,{axis:'z',angle:90,dx:2});const inherited=body.topology;const result=topologyForFeature({id:'move',type:'moveBody'},{axis:'z',angle:90,dx:2,placement:moved.placement},[{type:'box',topology:inherited}]);
 const source=inherited.find(i=>i.descriptor?.normal?.x===1),target=result.find(i=>i.persistentId===source.persistentId);near(target.descriptor.normal.y,1);near(target.descriptor.normal.x,0);assert.notDeepEqual(target.descriptor.origin,source.descriptor.origin);
 }finally{disposeBrep(body);if(moved)disposeBrep(moved);}
});
test('73 cone normals are perpendicular to both surface derivatives',()=>{
 const face={surface:'cone',origin:{x:1,y:2,z:3},axis:{x:0,y:1,z:0},radius:2,angle:Math.PI/6};const u=.7,v=1,h=1e-5,n=surfaceNormal(face,u,v);
 for(const [du,dv] of [[h,0],[0,h]]){const a=surfacePoint(face,u-du,v-dv),b=surfacePoint(face,u+du,v+dv);near(n.x*(b.x-a.x)+n.y*(b.y-a.y)+n.z*(b.z-a.z),0,1e-8);}
 near(n.y,-.5);
});
test('74 impossible module spans produce no misleading alternatives',()=>{
 const def={parameters:{width:{value:60}},rules:{module:{dimension:'width',parameter:'bays',minCount:1,maxCount:5,minSpan:40,maxSpan:90,noun:'bays'}}};
 const result=evaluateDimensionRequest(def,{},'width',25);assert.equal(result.status,'rejected');assert.deepEqual(result.alternatives,[]);
});

test('59 insert releases both temporary cylinders, including partial allocation failure',async()=>{
 const {regenerateFeatures}=await import('../js/cad_feature_tree.js');
 const seed=await makeBrepPrimitive({type:'box',w:1,h:1,d:1}),oc=seed.oc,Original=oc.BRepPrimAPI_MakeCylinder_3;
 try{for(const failSecond of [false,true]){
  const shapes=[];let calls=0,run;
  oc.BRepPrimAPI_MakeCylinder_3=function(...args){if(failSecond&&++calls===2)throw new Error('injected cylinder failure');const maker=new Original(...args),shape=maker.Shape.bind(maker);maker.Shape=()=>{const result=shape();shapes.push(result);return result;};return maker;};
  try{run=await regenerateFeatures({features:[{id:'insert',type:'insert',inputs:[],params:{}}]});assert.equal(run.ok,!failSecond);assert.equal(shapes.length,failSecond?1:2);assert.ok(shapes.every(s=>s.isDeleted()));}
  finally{for(const body of run?.results?.values()||[])disposeBrep(body);oc.BRepPrimAPI_MakeCylinder_3=Original;}
 }}finally{oc.BRepPrimAPI_MakeCylinder_3=Original;disposeBrep(seed);}
});
test('60 failed pattern compounding releases all copies and retains the seed',async()=>{
 const {linearPatternBrep,circularPatternBrep}=await import('../js/cad_kernel.js');
 const seed=await makeBrepPrimitive({type:'box',w:1,h:1,d:1}),oc=seed.oc;
 try{for(const pattern of [linearPatternBrep,circularPatternBrep]){
  const shapes=[],proxy=Object.create(oc);proxy.TopoDS_Builder=function(){throw new Error('injected compound failure');};
  proxy.BRepBuilderAPI_Transform_2=function(...args){const maker=new oc.BRepBuilderAPI_Transform_2(...args),shape=maker.Shape.bind(maker);maker.Shape=()=>{const result=shape();shapes.push(result);return result;};return maker;};
  await assert.rejects(pattern({...seed,oc:proxy},{count:3,vector:{x:2,y:0,z:0},axis:'y'}),/injected compound failure/);
  assert.equal(shapes.length,2);assert.ok(shapes.every(s=>s.isDeleted()));assert.equal(seed.shape.isDeleted(),false);
 }}finally{disposeBrep(seed);}
});
test('63 detail.from draws the callout marker on its parent view',()=>{
 const doc=createSheetDoc({views:['front']});const parent=doc.views[0];
 doc.views.push({id:'detail',dir:'front',detail:{from:parent.id,u:0,v:0,radius:1,tag:'A'},x:150,y:100,scale:2});
 const scene=buildSheetScene(doc,{projection:createProjector(doc,tessellateParts([box]))});
 assert.ok(scene.items.some(i=>i.type==='circle'&&i.style==='detail'&&i.viewId===parent.id));
});
test('64 maximum clearance of zero remains an interference fit',async()=>{
 const {evaluateFit}=await import('../js/cad_fits.js');
 const result=evaluateFit(6,'H7/p6');near(result.maxClearanceMm,0);assert.ok(result.minClearanceMm<0);assert.equal(result.kind,'interference');
});
test('69 out-of-range parameters invalidate their dependents, not independent bodies',()=>{
 const def=createDefinition({parameters:{bad:{value:1,min:2},dependent:{value:2,expression:'bad*2'}},features:[{id:'good',type:'box',params:{w:3,h:3,d:3}},{id:'bad',type:'box',params:{w:'$dependent',h:3,d:3}}]});
 const run=rebuildDefinition(def);assert.ok(run.results.has('good'));assert.equal(run.results.has('bad'),false);
});
test('75 OCCT contour endpoints are invariant when the selected edge wrapper is reversed',async()=>{
 const body=await makeBrepPrimitive({type:'box',w:4,h:6,d:8}),oc=body.oc;
 const exp=new oc.TopExp_Explorer_2(body.shape,oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE),raw=exp.Current(),edge=oc.TopoDS.Edge_1(raw),rev=edge.Reversed(),reversed=oc.TopoDS.Edge_1(rev);
 try{const ends=[];for(const e of [edge,reversed]){
  const maker=new oc.BRepFilletAPI_MakeFillet(body.shape,oc.ChFi3d_FilletShape.ChFi3d_Rational);
  try{maker.Add_3(.2,.5,e);const c=maker.Contour(e);ends.push([maker.FirstVertex(c),maker.LastVertex(c)].map(v=>{const p=oc.BRep_Tool.Pnt(v);try{return [p.X(),p.Y(),p.Z()];}finally{p.delete();v.delete();}}));}finally{maker.delete();}
 }assert.deepEqual(ends[0],ends[1]);assert.notEqual(edge.Orientation_1().value,reversed.Orientation_1().value);
 }finally{for(const obj of [reversed,rev,edge,raw,exp])obj.delete();disposeBrep(body);}
});
test('52 an existing mesh edge on the section plane is emitted once from the retained side',()=>{
 const result=sectionBodies([{positions:[0,0,0,5,0,0,0,-5,0, 0,0,0,5,0,0,0,5,0]}],{normal:{x:0,y:1,z:0},origin:{x:0,y:0,z:0}});
 assert.equal(result.cuts.length,1);near(Math.hypot(result.cuts[0].a.x-result.cuts[0].b.x,result.cuts[0].a.y-result.cuts[0].b.y),5);
});
test('70 a supported sketch orders its owner first and cannot outlive a failed owner',()=>{
 const def=createDefinition({sketches:[{id:'s',points:[],entities:[],constraints:[],support:{type:'topology-reference',ownerFeatureId:'owner',persistentId:'face'}}],features:[{id:'consumer',type:'extrude',inputs:['s'],params:{depth:2}},{id:'owner',type:'box',params:{w:'$missing',h:2,d:2}},{id:'independent',type:'box',params:{w:3,h:3,d:3}}]});
 const graph=buildDependencyGraph(def);assert.deepEqual(graph.issues,[]);assert.ok(graph.order.findIndex(f=>f.id==='owner')<graph.order.findIndex(f=>f.id==='consumer'));
 const run=rebuildDefinition(def);assert.equal(run.results.has('consumer'),false);assert.ok(run.results.has('independent'));
});
test('57 unequal circles retain their internal tangency across repeated solves',()=>{
 const sketch={points:[{id:'a',x:0,y:0,fixed:true},{id:'b',x:2.1,y:0}],entities:[{id:'a1',type:'circle',c:'a',r:4},{id:'b1',type:'circle',c:'b',r:2}],constraints:[{type:'radius',entity:'a1',value:4},{type:'radius',entity:'b1',value:2},{type:'tangent',a:'a1',b:'b1'}]};
 for(let i=0;i<3;i++){assert.equal(solveSketch(sketch).converged,true);near(Math.hypot(sketch.points[1].x,sketch.points[1].y),2,1e-3);}
});
test('72 a pending copied complex body preserves the source descriptors',()=>{
 const topology=[{persistentId:'face',kind:'face',descriptor:{surface:'plane',origin:{x:1,y:2,z:3},normal:{x:1,y:0,z:0}}}];
 const result=topologyForFeature({id:'move',type:'moveBody'},{angle:45,copy:true},[{type:'loft',topology}]);
 assert.equal(result.length,2);assert.deepEqual(result[0].descriptor,topology[0].descriptor);assert.equal(result[1].descriptor.pendingTransform,true);assert.notEqual(result[0].persistentId,result[1].persistentId);
});
test('72 copy-move releases its transformed shape when compounding fails',async()=>{
 const seed=await makeBrepPrimitive({type:'box',w:1,h:1,d:1}),oc=seed.oc,proxy=Object.create(oc),shapes=[];
 proxy.TopoDS_Builder=function(){throw new Error('injected compound failure');};
 proxy.BRepBuilderAPI_Transform_2=function(...args){const maker=new oc.BRepBuilderAPI_Transform_2(...args),shape=maker.Shape.bind(maker);maker.Shape=()=>{const result=shape();shapes.push(result);return result;};return maker;};
 try{await assert.rejects(moveBodyBrep({...seed,oc:proxy},{dx:1,copy:true}),/injected compound failure/);assert.equal(shapes.length,1);assert.ok(shapes[0].isDeleted());assert.equal(seed.shape.isDeleted(),false);}
 finally{disposeBrep(seed);}
});
