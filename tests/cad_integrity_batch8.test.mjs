import test from 'node:test';
import assert from 'node:assert/strict';
import {solveLinear} from '../js/core/least_squares.js';
import {createExplodedView,addExplodeStep,applyExplodedView} from '../js/cad_exploded_view.js';
import {evaluateDimensionRequest} from '../js/core/smart_dimension.js';
import {linearPatternOffsets,circularPatternPivot,patternPlacementTransform,applyRigidMatrix} from '../js/core/pattern_geometry.js';
import {hatchLoops,formatLength,dimensionText} from '../js/cad_sheet.js';
import {holeTolerance,evaluateFit,shaftTolerance} from '../js/cad_fits.js';
import {knurlBandMesh,knurlStarts,normalizeKnurlSpec} from '../js/cad_knurl.js';
import {modeledThreadSolid,threadProfilePoints} from '../js/cad_thread.js';
import {sketchRegions} from '../js/sketch_regions.js';
import {addCubicSpline} from '../js/sketch_spline.js';
import {trimEntity} from '../js/sketch_trim.js';
import {circleData,solveSketch} from '../js/sketch_solver.js';
import {currentMeasure,addSmartDimension} from '../js/sketch_dimensions.js';
import {buildDependencyGraph} from '../js/core/dependency_graph.js';
import {regenerateFeatures} from '../js/cad_feature_tree.js';
import {makeBrepPrimitive,makeBrepLoft,makeBrepRevolve,circularPatternBrep,exportStep,importStep,shapeMassProperties,disposeBrep,validateBrepForExport} from '../js/cad_kernel.js';
import {revolveRecipe,revolveBounds} from '../js/core/revolve_geometry.js';
import {stepUnitCorrection} from '../js/core/import_normalization.js';
import {generatedRackGear,validateGearPair} from '../js/cad_gear_geometry.js';
import {componentBounds,detectInterference} from '../js/cad_interference.js';
import {frameFromPlane} from '../js/core/frame.js';
import {createMotionStudy,addRotaryMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {topologyReference} from '../js/cad_mates.js';
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const blank=()=>({id:'s',points:[],entities:[],constraints:[]});
test('112 singular solves preserve later equations and never move unconstrained variables',()=>{
 assert.deepEqual(solveLinear([[0,0],[0,2]],[5,4]),[0,2]);assert.deepEqual(solveLinear([[0,3],[0,2]],[6,4]),[0,2]);assert.deepEqual(solveLinear([[1,2],[2,4]],[3,6]),[3,0]);assert.deepEqual(solveLinear([[0,0],[0,0]],[0,0]),[0,0]);
});
test('109 collapse clears offsets, unknown views leave the assembly alone',()=>{
 const a={components:[{id:'a'},{id:'b'}]},v=createExplodedView(a);addExplodeStep(v,['a'],{x:3,y:2,z:1});applyExplodedView(a,v.id);const old=structuredClone(a.components);applyExplodedView(a,'missing');assert.deepEqual(a.components,old);applyExplodedView(a,null);assert.ok(a.components.every(c=>c.explodedOffset===null));
});
test('110 linked dimension traversal covers branches, cycles and invalid target sizes',()=>{
 const d={parameters:Object.fromEntries(['width','height','depth'].map(k=>[k,{value:10,min:1,max:100}])),rules:{linkedDimensions:[{source:'width',target:'height',relation:'equal',prompt:false},{source:'width',target:'depth',relation:'equal',prompt:false},{source:'depth',target:'width',relation:'equal',prompt:false}]}};
 assert.deepEqual(evaluateDimensionRequest(d,{},'width',20).parameters,{width:20,height:20,depth:20});d.rules.linkedDimensions[1].source='height';assert.deepEqual(evaluateDimensionRequest(d,{},'width',20).parameters,{width:20,height:20,depth:20});d.parameters.depth.max=15;assert.equal(evaluateDimensionRequest(d,{},'width',20).status,'rejected');
});
test('114/115 pattern spacing is independent of direction length and custom pivots reach exact placement',()=>{
 for(const direction of [{x:1,y:1,z:0},{x:30,y:40,z:0}]){const p=linearPatternOffsets({direction,spacing:10,count:2})[0];near(Math.hypot(p.x,p.y,p.z),10);}
 const pivot={x:5,y:2,z:3},params={mode:'circular',axis:'z',pivot};assert.deepEqual(circularPatternPivot(params),pivot);const t=patternPlacementTransform(params,{circularIndex:1},Math.PI/2),q=applyRigidMatrix(t.matrix,{x:6,y:2,z:3});near(q.x+t.translation.x,5);near(q.y+t.translation.y,3);near(q.z+t.translation.z,3);
});
test('120 hatch parity counts vertex crossings once and excludes hole interiors',()=>{
 const diamond=[{x:0,y:0},{x:10,y:10},{x:0,y:20},{x:-10,y:10}],segs=hatchLoops([diamond],{angle:0,spacing:2});const middle=segs.find(s=>s.y1===10);assert.ok(middle);near(middle.x2-middle.x1,20);
 const hole=[{x:-1,y:9},{x:1,y:9},{x:1,y:11},{x:-1,y:11}];const row=hatchLoops([diamond,hole],{angle:0,spacing:2}).filter(s=>s.y1===10);assert.equal(row.length,2);near(row.reduce((sum,s)=>sum+s.x2-s.x1,0),18);
});
test('121 explicit drawing precision keeps zeros and ordinate signs; old drawings retain formatting',()=>{
 assert.equal(formatLength(-.15,{units:'mm',precision:3}),'-1.500');assert.equal(formatLength(20,{units:'mm'}),'200');assert.equal(formatLength(20,{units:'mm',precision:0,trailingZeros:false}),'200');assert.equal(dimensionText({type:'ordinate',measure:-.15},{units:'mm',precision:3}),'-1.500');assert.equal(formatLength(-1e-9,{units:'mm',precision:3}),'0.000');
});
test('103 corrected fit deviations agree with published NSK housing tables',()=>{
 assert.deepEqual(holeTolerance(20,'K',7),{EI:-15,ES:6,IT:21});assert.deepEqual(holeTolerance(20,'M',7),{EI:-21,ES:0,IT:21});assert.deepEqual(holeTolerance(20,'N',7),{EI:-28,ES:-7,IT:21});assert.deepEqual(holeTolerance(20,'P',7),{EI:-35,ES:-14,IT:21});assert.deepEqual(holeTolerance(50,'K',6),{EI:-13,ES:3,IT:16});assert.equal(holeTolerance(3,'K',7).ES,0);
});
test('104 precision grade 5 and verified large H/h fits work without extrapolating other deviations',()=>{
 assert.equal(shaftTolerance(20,'h',5).IT,9);assert.equal(evaluateFit(150,'H7/h6').hole.IT,40);assert.equal(evaluateFit(500,'H7/h6').shaft.IT,40);assert.equal(evaluateFit(150,'H7/g6').shaft.es,-14);assert.throws(()=>evaluateFit(3151,'H7/h6'),/outside/);assert.equal(evaluateFit(20,'H4/h3').hole.IT,6);
});
test('105/106 knurl forms remain distinct and normal pitch controls tooth count',()=>{
 const base={type:'diamond',diameterMm:20,lengthMm:10,pitchMm:1,helixAngle:30};assert.equal(knurlStarts(base),54);assert.equal(knurlStarts({...base,type:'straight'}),63);
 const a=knurlBandMesh({...base,form:'RGE'}),b=knurlBandMesh({...base,form:'RGV'});assert.equal(normalizeKnurlSpec(b.spec).form,'RGV');assert.equal(a.spec.raised,true);assert.equal(b.spec.raised,false);
 for(let i=0;i<a.positions.length;i+=3){const ra=Math.hypot(a.positions[i],a.positions[i+2]),rb=Math.hypot(b.positions[i],b.positions[i+2]);near(ra+rb,1.97,3e-7);assert.ok(ra<=1.000001&&rb<=1.000001);}assert.notDeepEqual(a.positions,b.positions);
});
test('107 internal cutter complements the nut tooth and produces a valid native solid',async()=>{
 const spec={diameterMm:10,pitchMm:1.5,lengthMm:1.5,side:'internal',mode:'modeled'},metal=threadProfilePoints(spec),tool=modeledThreadSolid(spec,{asCutter:true});
 assert.ok(Math.abs(tool.profile[0].y)>Math.abs(tool.profile[1].y));near(Math.abs(metal[1].y)+Math.abs(tool.profile[1].y),.075);
 const solid=await makeBrepLoft({sections:tool.sections,solid:true,ruled:true,matchProfiles:false});try{assert.equal((await validateBrepForExport(solid)).valid,true);}finally{disposeBrep(solid);}
});
test('119 a spline and closing line create a bounded region',()=>{
 const s=blank(),e=addCubicSpline(s,[{x:0,y:0},{x:0,y:3},{x:4,y:3},{x:4,y:0}]);s.entities.push({id:'close',type:'line',a:e.b,b:e.a});const r=sketchRegions(s);assert.equal(r.regions.length,1);assert.ok(r.regions[0].area>5);
});
test('116 actual trim command archives removed handle constraints without orphan points',()=>{
 const s=blank(),e=addCubicSpline(s,[{x:0,y:0},{x:1,y:2},{x:3,y:2},{x:4,y:0}]);s.constraints.push({id:'handle',type:'fixed',point:e.h1,x:1,y:2});s.points.push({id:'a',x:2,y:-1},{id:'b',x:2,y:3});s.entities.push({id:'cross',type:'line',a:'a',b:'b'});const old=e.h1;
 assert.equal(trimEntity(s,e.id,{x:3.5,y:.5}),true);assert.ok(!s.points.some(p=>p.id===old));assert.equal(s.repairs[0].constraint.id,'handle');
});
test('117 circle radius dimensions remain valid after conversion to an arc',()=>{
 const s={points:[{id:'c',x:0,y:0},{id:'a',x:-6,y:0},{id:'b',x:6,y:0}],entities:[{id:'circle',type:'circle',c:'c',r:5},{id:'line',type:'line',a:'a',b:'b'}],constraints:[{id:'r',type:'radius',entity:'circle',value:5}]};assert.equal(trimEntity(s,'circle',{x:0,y:5}),true);assert.equal(solveSketch(s).converged,true);near(circleData(s.entities[0],new Map(s.points.map(p=>[p.id,p]))).radius,5);assert.equal(s.constraints[0].id,'r');
});
test('118 signed angle measurement matches solver and does not flip a clockwise line',()=>{
 const s={points:[{id:'a',x:0,y:0},{id:'b',x:10,y:0},{id:'c',x:0,y:0},{id:'d',x:10,y:-10}],entities:[{id:'l1',type:'line',a:'a',b:'b'},{id:'l2',type:'line',a:'c',b:'d'}],constraints:[]},target={type:'angle',a:'l1',b:'l2'};near(currentMeasure(s,target),-45);const before=structuredClone(s.points);addSmartDimension(s,target,-45);assert.equal(solveSketch(s).converged,true);assert.deepEqual(s.points,before);
});
test('122/123 missing rollback rebuilds full history and only registered datums bypass solid dependencies',async()=>{
 const def={features:[{id:'box',type:'box',inputs:['plane:top'],params:{w:2,h:3,d:4}}]},run=await regenerateFeatures(def,{rollbackId:'deleted'});try{assert.equal(run.ok,true,JSON.stringify(run.issues));assert.ok(run.issues.some(i=>i.code==='missing-rollback-feature'));near((await shapeMassProperties(run.finalShape)).volume,24);assert.equal(def.features.length,1);}finally{for(const b of run.results.values())disposeBrep(b);}
 assert.ok(buildDependencyGraph({features:[{id:'x',inputs:['plane:typo']}]}).issues.some(i=>i.code==='missing-feature-reference'));
});
test('124 native millimeter STEP round-trip already converts to document centimeters',async()=>{
 const body=await makeBrepPrimitive({type:'box',w:2,h:3,d:4});let restored;try{const bytes=await exportStep(body,'batch8-mm.step',{outputUnit:'MM'});restored=await importStep(bytes,'batch8-mm.step');near((await shapeMassProperties(restored)).volume,24,1e-5);assert.equal(stepUnitCorrection('mm','auto'),1);}finally{disposeBrep(restored);disposeBrep(body);}
});
test('101/102 undercut remains refused and half-backlash allocation matches actual cutter thinning',()=>{
 assert.throws(()=>generatedRackGear({moduleMm:2,teeth:14}),/undercut/);const a={moduleMm:2,teeth:20,backlashMm:.1},b={moduleMm:2,teeth:40,backlashMm:.3};const pair=validateGearPair(a,b);near(pair.backlashMm,.2);const zero=generatedRackGear({...a,backlashMm:0}).spec,thin=generatedRackGear(a).spec;near(2*(thin.half-zero.half),.05);
});
test('125 fallback detects extrusions including frames and component rotations',async()=>{
 const p={kind:'ext',axis:'y',from:0,to:1,pts:[{u:0,v:0},{u:4,v:0},{u:4,v:2},{u:0,v:2}]},a={id:'a',parts:[p],transform:{rz:90}},b={id:'b',parts:[{kind:'box',x0:-.9,x1:-.1,y0:1,y1:2,z0:.5,z1:1.5}]};const bounds=componentBounds(a);near(bounds.x0,-1);near(bounds.y1,4);assert.equal((await detectInterference([a,b])).length,1);const framed=componentBounds({parts:[{...p,frame:frameFromPlane({x:10,y:0,z:0},{x:1,y:0,z:0})}]});near(framed.x0,10);near(framed.x1,11);
});
test('108 motion propagates mates while prescribed motors cannot be overwritten; failures are atomic',()=>{
 const face={surface:'plane',origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}},asm={components:[{id:'a',transform:{}},{id:'b',transform:{}}],topologyMates:[{id:'m',type:'coincident',a:topologyReference('a','face','a-face',face),b:topologyReference('b','face','b-face',face)}]};const study=createMotionStudy(asm);addRotaryMotor(study,'a',10,{x:0,y:0,z:1});const r=evaluateMotionStudy(asm,study.id,.5);assert.equal(r.ok,true,JSON.stringify(r));near(asm.components[0].transform.rz,30,1e-5);assert.ok(Math.abs(asm.components[1].transform.rz)>10);
 addRotaryMotor(study,'b',0,{x:0,y:0,z:1});const before=structuredClone(asm.components);assert.equal(evaluateMotionStudy(asm,study.id,1).ok,false);assert.deepEqual(asm.components,before);
});

test('115 native circular patterns rotate around the requested off-center pivot',async()=>{
 const body=await makeBrepPrimitive({type:'box',x:5,y:0,z:0,w:1,h:1,d:1});let pattern;try{pattern=await circularPatternBrep(body,{axis:'z',count:2,angle:180,pivot:{x:5,y:0,z:0}});const mass=await shapeMassProperties(pattern);near(mass.volume,2);near(mass.centerOfMass.x,5);near(mass.centerOfMass.y,0);}finally{disposeBrep(pattern);disposeBrep(body);}
});
test('113 legacy partial revolves retain the same quadrant in bounds and native geometry',async()=>{
 for(const axis of ['x','y','z']){const part={kind:'rev',axis,angle:90,pts:[{u:1,v:0},{u:2,v:0},{u:2,v:3},{u:1,v:3}]},bounds=revolveBounds(part),solid=await makeBrepRevolve(revolveRecipe(part));try{const mass=await shapeMassProperties(solid);near(mass.volume,Math.PI*9/4,1e-5);for(const k of ['x','y','z'])assert.ok(mass.centerOfMass[k]>=bounds[k+'0']&&mass.centerOfMass[k]<=bounds[k+'1']);}finally{disposeBrep(solid);}}
});
