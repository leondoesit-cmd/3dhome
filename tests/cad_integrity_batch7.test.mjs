import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheetMetalPart,addEdgeFlange} from '../js/cad_sheet_metal.js';
import {toolboxFastener} from '../js/cad_toolbox.js';
import {generateBOM} from '../js/cad_interference.js';
import {createSheetDoc,buildSheetScene,createView} from '../js/cad_sheet.js';
import {evaluateDraftAngle} from '../js/cad_evaluate.js';
import {holeCallouts,holeLeaderForViews} from '../js/core/hole_callout.js';
import {trimEntity,extendEntity,offsetEntity} from '../js/sketch_trim.js';
import {solveSketch,circleData} from '../js/sketch_solver.js';
import {linearPatternEntities} from '../js/sketch_pattern.js';
import {makeBrepPrimitive,shapeMassProperties,disposeBrep} from '../js/cad_kernel.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {ribLoop} from '../js/core/rib_profile.js';
import {mirrorProjectionPart} from '../js/modeler_part_geometry.js';
import {cylinderAxis,cylinderBounds} from '../js/core/cylinder_axis.js';
import {applyConfiguration} from '../js/cad_configurations.js';
import {insertBody} from '../js/cad_appearances.js';
import {sketchWorldPoint,sampleSketchPath} from '../js/core/swept_sources.js';
import {normalizeHelixSpec,helixLength,helixFrameAt} from '../js/cad_helix.js';
import {validateMetricThread,involuteGearOutline,auditStandardParts} from '../js/cad_standards.js';
import {fastenerAxisPorts} from '../js/toolbox/schema.js';
import {holeCutRecords} from '../js/core/hole_geometry.js';
import {cutFootprint} from '../js/core/cut_scope.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const lineDoc=()=>({points:[{id:'a',x:0,y:0,fixed:true},{id:'b',x:10,y:0,fixed:true}],entities:[{id:'line',type:'line',a:'a',b:'b'}],constraints:[]});
test('76 adjacent flanges require an explicit relief and refusal preserves the original sheet',()=>{
 const sheet=createSheetMetalPart({thickness:.2,insideRadius:.2});addEdgeFlange(sheet,'left',3,90);const before=structuredClone(sheet);
 assert.throws(()=>addEdgeFlange(sheet,'bottom',3,90),/relief/);assert.deepEqual(sheet,before);
 sheet.cornerRelief={type:'rectangular',width:.2};addEdgeFlange(sheet,'bottom',3,90);assert.equal(sheet.flanges.length,2);
});
test('77 native revolution topology exists and retains IDs across rebuilds',async()=>{
 const def={features:[{id:'rev',type:'revolve',inputs:[],params:{axis:'y',angle:180,points:[{u:1,v:0},{u:2,v:0},{u:2,v:3},{u:1,v:3}]}}]};
 const a=await regenerateFeatures(def),b=await regenerateFeatures(def);
 try{assert.equal(a.ok,true,JSON.stringify(a.issues));assert.ok(a.topology.some(t=>t.kind==='face'));assert.ok(a.topology.some(t=>t.kind==='edge'));assert.deepEqual(a.topology.map(t=>t.persistentId),b.topology.map(t=>t.persistentId));}finally{releaseRegeneration(a);releaseRegeneration(b);}
});
test('78 countersunk screws use nominal overall length including the head',()=>{
 for(const kind of ['csink-socket','csink-machine','wood-screw']){
  const item=toolboxFastener({kind,size:kind==='wood-screw'?'4.0':'M6',lengthMm:25});assert.ok(item.parts.length);
  const max=Math.max(...item.parts.filter(p=>p.kind==='cyl').map(p=>(p.y||0)+(p.h||0)));near(max,2.5);
 }
});
test('79 drawing BOM renders generated quantities',()=>{
 const bom=generateBOM({components:Array.from({length:8},(_,i)=>({id:String(i),definitionId:'bolt',name:'Bolt'}))});
 const scene=buildSheetScene(createSheetDoc(),{bom});assert.ok(scene.items.some(i=>i.type==='text'&&i.text==='8'));
});
test('80 negative draft is an undercut in the chosen pull direction',()=>{
 const result=evaluateDraftAngle({x:Math.cos(.04),y:-Math.sin(.04),z:0});assert.ok(result.draftDeg<0);assert.equal(result.isSufficient,false);assert.equal(result.classification,'undercut');assert.equal(evaluateDraftAngle({x:Math.cos(.04),y:Math.sin(.04),z:0}).isSufficient,true);
});
const holes=()=>({features:[{id:'hole',type:'hole',params:{layout:'sketch',sketchId:'s',holeType:'simple',diameterMm:6,depthMm:10}}],sketches:[{id:'s',plane:'top',points:[{id:'a',x:2,y:3},{id:'b',x:7,y:8}],entities:[{id:'c1',type:'circle',c:'a',r:.3},{id:'c2',type:'circle',c:'b',r:.3}]}]});
test('81 callout count follows selected live sketch circles',()=>{
 const def=holes();near(holeCallouts(def)[0].quantity,2);def.features[0].params.profileEntityIds=['c2'];near(holeCallouts(def)[0].quantity,1);assert.deepEqual(holeCallouts(def)[0].points,[{u:7,v:8}]);
});
test('82 unknown spline records are refused rather than interpreted as an arbitrary curve',()=>{
 assert.equal(sampleSketchPath({points:[],entities:[{id:'s',type:'spline',points:[{u:0,v:0},{u:1,v:2}]}]}),null);
});
test('83 trimming a circle against a line retains the unpicked semicircle',()=>{
 const s={points:[{id:'c',x:0,y:0},{id:'a',x:-6,y:0},{id:'b',x:6,y:0}],entities:[{id:'round',type:'circle',c:'c',r:5},{id:'line',type:'line',a:'a',b:'b'}],constraints:[]};
 assert.equal(trimEntity(s,'round',{x:0,y:5}),true);const arc=circleData(s.entities[0],new Map(s.points.map(p=>[p.id,p])));assert.equal(s.entities[0].type,'arc');near(arc.radius,5);near(arc.start,Math.PI);near(arc.end,0);
});
test('83 arc extension stops at the first boundary and closed circles are not extended',()=>{
 const s={points:[{id:'c',x:0,y:0},{id:'a',x:5,y:0},{id:'b',x:0,y:5},{id:'l1',x:-3,y:-6},{id:'l2',x:-3,y:6}],entities:[{id:'arc',type:'arc',c:'c',a:'a',b:'b'},{id:'line',type:'line',a:'l1',b:'l2'}],constraints:[]};
 assert.equal(extendEntity(s,'arc',{x:0,y:5}),true);const end=s.points.find(p=>p.id===s.entities[0].b);near(end.x,-3);near(end.y,4);
 s.entities.push({id:'circle',type:'circle',c:'c',r:2});const before=structuredClone(s);assert.equal(extendEntity(s,'circle',{x:2,y:0}),false);assert.deepEqual(s,before);
});
test('84 line and circle offsets maintain their signed distance during solving',()=>{
 const s=lineDoc(),line=offsetEntity(s,'line',-2);s.points.find(p=>p.id===line.a).y=-5;s.points.find(p=>p.id===line.b).y=-5;assert.equal(solveSketch(s).converged,true);near(s.points.find(p=>p.id===line.a).y,-2,1e-4);
 const circles={points:[{id:'c',x:0,y:0,fixed:true}],entities:[{id:'c1',type:'circle',c:'c',r:4}],constraints:[{type:'radius',entity:'c1',value:4}]};const copy=offsetEntity(circles,'c1',2);copy.r=8;assert.equal(solveSketch(circles).converged,true);near(copy.r,6,1e-4);
});
test('85 a rectangle pattern has one editable spacing per copy and follows source edits',()=>{
 const s={points:[{id:'a',x:0,y:0,fixed:true},{id:'b',x:4,y:0,fixed:true},{id:'c',x:4,y:3,fixed:true},{id:'d',x:0,y:3,fixed:true}],entities:[['a','b'],['b','c'],['c','d'],['d','a']].map(([a,b],i)=>({id:'e'+i,type:'line',a,b})),constraints:[]};
 const result=linearPatternEntities(s,['e0','e1','e2','e3'],{count:2,spacing:10});assert.equal(result.dimensions.length,1);result.dimensions[0].value=-20;assert.equal(solveSketch(s).converged,true);for(const pair of result.dimensions[0].pairs){const a=s.points.find(p=>p.id===pair[0]),b=s.points.find(p=>p.id===pair[1]);near(b.x-a.x,-20,1e-4);near(b.y,a.y,1e-4);}
});
test('86 native inertia is centroidal and invariant under translation',async()=>{
 const a=await makeBrepPrimitive({type:'box',w:2,h:4,d:6}),b=await makeBrepPrimitive({type:'box',x:50,y:-30,z:20,w:2,h:4,d:6});
 try{const pa=await shapeMassProperties(a),pb=await shapeMassProperties(b);for(let i=0;i<3;i++)for(let j=0;j<3;j++)near(pa.inertia[i][j],pb.inertia[i][j]);near(pa.inertia[0][0],48*(16+36)/12);}finally{disposeBrep(a);disposeBrep(b);}
});
test('87 oversized rib corners are refused without altering the requested thickness',()=>{
 assert.throws(()=>ribLoop([{u:0,v:0},{u:2,v:0},{u:2,v:10}],5),/overlapping corner/);assert.ok(ribLoop([{u:0,v:0},{u:20,v:0},{u:20,v:20}],2).length>=6);
});
test('88/89 cylinder and frustum reflections preserve both directed endpoints on every axis',()=>{
 for(const axis of ['x','y','z'])for(const plane of ['top','front','right']){
  const key=plane==='top'?'y':plane==='front'?'z':'x',p={kind:'cyl',axis,x:10,y:20,z:30,r:2,r2:1,h:50},q=mirrorProjectionPart(structuredClone(p),'plane:'+plane),pa=cylinderAxis(axis),qa=cylinderAxis(q.axis);
  for(const k of ['x','y','z']){near(q[k],p[k]*(k===key?-1:1));near(q[k]+qa[k]*q.h,(p[k]+pa[k]*p.h)*(k===key?-1:1));}
 }
});
test('90 a collapsed configuration clears an exploded assembly view',()=>{
 const doc={assembly:{activeExplodedView:'exploded'}};applyConfiguration(doc,{explodedViewId:null});assert.equal(doc.assembly.activeExplodedView,null);
});
test('91 insert projection and native bore share an arbitrary directed axis',async()=>{
 const params={axis:{x:1,y:1,z:0},origin:{x:10,y:20,z:30},innerMm:6,outerMm:10,lengthMm:15};const projection=insertBody(params),axis=cylinderAxis(params.axis);near(projection.frame.normal.x,axis.x);
 const run=await regenerateFeatures({features:[{id:'i',type:'insert',inputs:[],params}]});try{assert.equal(run.ok,true,JSON.stringify(run.issues));const mass=await shapeMassProperties(run.finalShape);near(mass.centerOfMass.x,10+axis.x*.75);near(mass.centerOfMass.y,20+axis.y*.75);}finally{releaseRegeneration(run);}
});
test('92 hole leaders select a face-on view and project top-plane coordinates',()=>{
 const row=holeCallouts(holes())[0],leader=holeLeaderForViews(row,[{id:'f',dir:'front'},{id:'t',dir:'top'}]);assert.equal(leader.viewId,'t');near(leader.u,2);near(leader.v,-3);assert.equal(holeLeaderForViews(row,[{id:'f',dir:'front'}]),null);
});
test('94 side sketch coordinates retain their established extrusion convention',()=>{assert.deepEqual(sketchWorldPoint({plane:'side',offset:2},3,4),{x:2,y:4,z:3});});
test('95/96 height-turn helix derives pitch and has a finite apex frame',()=>{
 near(normalizeHelixSpec({radius:10,height:100,turns:5}).pitch,20);near(helixLength({radius:10,height:100,turns:5}),Math.hypot(100,100*Math.PI));
 const frame=helixFrameAt({radiusStart:0,radiusEnd:10,height:50,turns:3},0);near(Math.hypot(frame.radial.x,frame.radial.y,frame.radial.z),1);near(frame.radial.x*frame.axis.x+frame.radial.y*frame.axis.y+frame.radial.z*frame.axis.z,0);
});
test('97 the installed coarse pitch series includes M3.5 and M7',()=>{for(const [diameterMm,pitchMm]of [[3.5,.6],[7,1]])assert.equal(validateMetricThread({diameterMm,pitchMm}).ok,true);});
test('98 reference gear roots do not pass a manufacturing geometry audit',()=>{
 const spec={family:'involute-gear',standard:'ISO 21771-1:2024',profile:'involute',moduleMm:2,teeth:20};const part={kind:'ext',axis:'y',pts:involuteGearOutline(spec),standardCompliance:spec};assert.equal(auditStandardParts({parts:[part]}).ok,false);
});
test('99 a head bearing-seat port points toward the screw tip',()=>{assert.deepEqual(fastenerAxisPorts(6,20,1).find(p=>p.id==='head-seat').axis,{x:0,y:-1,z:0});});
test('100 cylinder cut footprints use projected circular caps rather than a rotated world box',()=>{
 const c=Math.SQRT1_2,frame={origin:{x:0,y:0,z:0},normal:{x:0,y:0,z:1},xAxis:{x:c,y:c,z:0},yAxis:{x:-c,y:c,z:0}},p={kind:'cyl',axis:'z',x:0,y:0,z:0,r:1,h:2};
 const f=cutFootprint(p,cylinderBounds(p),frame,'z');assert.equal(f.type,'poly');const max=Math.max(...f.pts.map(p=>p.u));assert.ok(max>=1-1e-8&&max<1.001);
});
test('93 section tags already sit outside the projected body beside the arrow tails',()=>{
 for(const axis of ['vertical','horizontal']){
  const doc=createSheetDoc({views:['front']}),parent=doc.views[0];doc.views.push(createView('right',{parent:parent.id,section:{from:parent.id,axis,at:2,tag:'Q'}}));
  const scene=buildSheetScene(doc,{projection:()=>({visible:[],hidden:[],cuts:[],bounds:{u0:0,u1:4,v0:0,v1:4}})}),box=scene.views.find(v=>v.id===parent.id).box,tags=scene.items.filter(i=>i.type==='text'&&i.text==='Q');
  assert.equal(tags.length,2);assert.ok(tags.every(t=>t.x<box.x||t.x>box.x+box.w||t.y<box.y||t.y>box.y+box.h));
 }
});
test('84/85 offset and pattern dimensions remain visible and selectable',async()=>{
 const {distanceDimensionLayout,hitSketchDimension}=await import('../js/sketch_dimensions.js');const s=lineDoc();offsetEntity(s,'line',2);linearPatternEntities(s,['line'],{count:2,spacing:5});
 for(const dimension of s.constraints.filter(c=>c.type==='offset'||c.patternTranslation)){
  const layout=distanceDimensionLayout(s,dimension,(x,y)=>({x:x*20,y:y*20}));assert.ok(layout);assert.ok(hitSketchDimension(s,layout.label.x,layout.label.y,(x,y)=>({x:x*20,y:y*20})));
 }
});

test('81 construction circles are excluded from both cutters and callouts',()=>{
 const def=holes();def.sketches[0].entities[1].construction=true;
 const records=holeCutRecords(def.features[0].params,def.sketches[0]);
 assert.equal(holeCallouts(def)[0].quantity,1);assert.equal(records[0].params.centres.length,1);
});
