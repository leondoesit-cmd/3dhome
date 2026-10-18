import test from 'node:test';
import assert from 'node:assert/strict';
import {pathFrames} from '../js/core/profile_curves.js';
import {parseSkippedPatternInstances} from '../js/core/pattern_geometry.js';
import {resolveExtrudeExtent,raySurfaceHit} from '../js/core/extrude_extent.js';
import {frameFromPlane} from '../js/core/frame.js';
import {subassemblyComponent,flattenAssembly,descriptorToParent} from '../js/core/assembly_structure.js';
import {setComponentPattern} from '../js/core/assembly_component_pattern.js';
import {execFileSync} from 'node:child_process';
import {normalizeImportedGeometry,createImportedDefinition} from '../js/core/import_normalization.js';
import {cylinderUVDomain} from '../js/core/surface_uv.js';
import {toolFeatureRecipe,translateToolRecord} from '../js/core/tool_recipe.js';
import {registerImportedDefinition} from '../js/core/project.js';
import {planModelItems} from '../js/core/model_items.js';
import {createTopologyIndex} from '../js/cad_sheet.js';
import {viewBasis} from '../js/core/hidden_line.js';
import {ensureSketchOriginPoint,sketchOriginPoint} from '../js/core/sketch_origin.js';
import {resolveOffsetPlanes} from '../js/core/offset_planes.js';
import {holeCallouts,holeTopologyAnchor} from '../js/core/hole_callout.js';
import {cutFootprint,cutFootprintsMayOverlap} from '../js/core/cut_scope.js';
import {rebindReplacedSketchProfiles} from '../js/core/sketch_profile_rebind.js';
import {edgesAreTangent,selectTangentChain} from '../js/core/topology_selection.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;

test('C01 sharp sweep paths retain orthonormal frames at every station',()=>{
  for(const frame of pathFrames([{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0}])){
    for(const axis of ['tangent','normal','binormal'])near(Math.hypot(...Object.values(frame[axis])),1);
    near(dot(frame.tangent,frame.normal),0);near(dot(frame.tangent,frame.binormal),0);near(dot(frame.normal,frame.binormal),0);
  }
});

test('C02 skipped-instance ranges accept whitespace around their hyphen',()=>{
  assert.deepEqual([...parseSkippedPatternInstances('1 - 3, 8 - 6')],[1,2,3,6,7,8]);
});

test('C03 Up To Face finds the farther cylinder root when the near root is outside the face',()=>{
  const endFace={descriptor:{surface:'cylinder',origin:{x:0,y:0,z:0},referenceOrigin:{x:0,y:0,z:0},axis:{x:0,y:0,z:1},radius:1,axisRange:[0,3]}};
  const result=resolveExtrudeExtent({endCondition:'up-to-face',from:0,frame:frameFromPlane({x:-2,y:0,z:-2},{x:1,y:0,z:1}),points:[{u:0,v:0}]},{endFace});
  near(result.to,3*Math.SQRT2);
  near(raySurfaceHit({x:-2,y:0,z:-2},{x:1,y:0,z:1},endFace),1);
  const cone={descriptor:{surface:'cone',referenceOrigin:{x:0,y:0,z:0},axis:{x:0,y:0,z:1},radius:2,angle:Math.atan(.5),axisRange:[1,10]}};
  near(resolveExtrudeExtent({endCondition:'up-to-face',from:0,frame:frameFromPlane({x:-4,y:0,z:-2},{x:1,y:0,z:1}),points:[{u:0,v:0}]},{endFace:cone}).to,10*Math.SQRT2);
});

test('C04 inserted subassemblies retain authored patterns and property metadata',()=>{
  const record={key:'assembly',name:'Patterned plate',customProperties:{PartNo:'PLATE-SET'},components:[
    {id:'plate',def:{parts:[{}],features:[{id:'hole',type:'hole'},{id:'pattern',type:'pattern',params:{mode:'linear',scope:'feature',seedFeatureId:'hole',count:3,spacing:2,directionAxis:'x'}}]}},
    {id:'screw',def:{parts:[{}]}}
  ]};
  setComponentPattern(record,{id:'p',seedId:'screw',carrierId:'plate',featureId:'pattern'});
  const component=subassemblyComponent(record,{id:'nested'});
  assert.equal(flattenAssembly({components:[component]}).length,4);
  assert.deepEqual(component.asm.customProperties,{PartNo:'PLATE-SET'});
  component.asm.componentPatterns[0].id='changed';component.asm.customProperties.PartNo='changed';
  assert.equal(record.componentPatterns[0].id,'p');assert.equal(record.customProperties.PartNo,'PLATE-SET');
});

test('C06 nested topology bounds follow the same rigid placement as its face',()=>{
  const descriptor={surface:'plane',origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0},bounds:{min:{x:0,y:0,z:0},max:{x:1,y:2,z:3}}};
  const source=structuredClone(descriptor),result=descriptorToParent(descriptor,{transform:{x:10,y:20,z:30,rz:90}});
  near(result.bounds.min.x,8);near(result.bounds.max.x,10);
  near(result.bounds.min.y,20);near(result.bounds.max.y,21);near(result.bounds.min.z,30);near(result.bounds.max.z,33);
  assert.deepEqual(descriptor,source);
});

test('C07 huge finite sketch angles wrap promptly while preserving the dual gradient',()=>{
  const script=`import {wrapTurn,variable} from './js/core/dual.js';import {solveSketch} from './js/sketch_solver.js';import {wrapAngle} from './js/cad_mate_model.js';
    const result=wrapTurn(variable(1e20,2));
    const sketch={points:[{id:'a',x:0,y:0,fixed:true},{id:'b',x:1,y:0}],entities:[{id:'l',type:'line',a:'a',b:'b'}],constraints:[{id:'c',type:'angle',entity:'l',value:1e20}]};
    solveSketch(sketch);console.log(JSON.stringify({result,wrapped:wrapAngle(1e20),boundaries:[wrapTurn(3*Math.PI),wrapTurn(-3*Math.PI)]}));`;
  const out=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),timeout:10000,encoding:'utf8'}));
  let expected=1e20%(2*Math.PI);if(expected>Math.PI)expected-=2*Math.PI;
  near(out.result.v,expected);near(out.wrapped,expected);assert.deepEqual(out.result.g,[2,1]);
  assert.deepEqual(out.boundaries,[Math.PI,-Math.PI]);
});

test('C08 imported native topology transforms axial datums and dimensional metadata',()=>{
  const descriptor={surface:'cylinder',origin:{x:10,y:20,z:30},referenceOrigin:{x:10,y:20,z:30},axis:{x:0,y:1,z:0},radius:2,axisRange:[0,4]};
  const source={unitScale:.1,meshData:{positions:[9,20,29,11,20,31,10,24,30]},topology:[{kind:'face',descriptor}]};
  const normalized=normalizeImportedGeometry(source),d=normalized.topology[0].descriptor;
  assert.deepEqual(cylinderUVDomain(d).vRange,[0,.4]);
  assert.deepEqual(d.referenceOrigin,{x:0,y:0,z:0});near(d.radius,.2);
  assert.deepEqual(source.topology[0].descriptor,descriptor);
});

test('C09 tiny imported models preserve their actual library placement dimensions',()=>{
  const def=createImportedDefinition({name:'1mm spacer',meshData:{positions:[0,0,0,.1,0,0,0,.1,.1]}});
  near(def.w,.1);near(def.h,.1);near(def.d,.1);
  near(def.parameters.width.value,def.w);
});

function hollowXPrism() {
  const loops=[[[-2,-2],[2,-2],[2,2],[-2,2]],[[-1,-1],[1,-1],[1,1],[-1,1]]],positions=[],normals=[],topology=[];
  const point=(x,p)=>({x,y:p[0],z:p[1]}),quad=(a,b,c,d)=>{
    for(const tri of [[a,b,c],[a,c,d]]){
      const ab={x:tri[1].x-a.x,y:tri[1].y-a.y,z:tri[1].z-a.z},ac={x:tri[2].x-a.x,y:tri[2].y-a.y,z:tri[2].z-a.z};
      const n={x:ab.y*ac.z-ab.z*ac.y,y:ab.z*ac.x-ab.x*ac.z,z:ab.x*ac.y-ab.y*ac.x},l=Math.hypot(n.x,n.y,n.z);
      for(const p of tri){positions.push(p.x,p.y,p.z);normals.push(n.x/l,n.y/l,n.z/l);}
    }
  };
  for(const x of [0,4]){
    topology.push({kind:'face',descriptor:{surface:'plane',origin:{x,y:0,z:0},normal:{x:x?1:-1,y:0,z:0}}});
    for(let i=0;i<4;i++){
      const j=(i+1)%4;
      quad(point(x,loops[0][i]),point(x,loops[0][j]),point(x,loops[1][j]),point(x,loops[1][i]));
      for(const loop of loops)topology.push({kind:'edge',descriptor:{curve:'line',endpoints:[point(x,loop[i]),point(x,loop[j])]}});
    }
  }
  for(const loop of loops)for(let i=0;i<4;i++){
    const j=(i+1)%4,a=loop[i],b=loop[j];quad(point(0,a),point(4,a),point(4,b),point(0,b));
    topology.push({kind:'face',descriptor:{surface:'plane',origin:point(2,a),normal:{x:0,y:b[1]-a[1],z:a[0]-b[0]}}});
  }
  return {name:'Hollow X prism',meshData:{positions,normals},topology};
}

test('C10 direct fallback keeps rotated mesh normals aligned with its triangles',()=>{
  const def=createImportedDefinition(hollowXPrism());assert.equal(def.parts[0].kind,'direct');
  const {positions:p,normals:n}=def.parts[0].meshData;
  const ab=[p[3]-p[0],p[4]-p[1],p[5]-p[2]],ac=[p[6]-p[0],p[7]-p[1],p[8]-p[2]];
  const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],l=Math.hypot(...cross);
  near(cross.reduce((sum,v,i)=>sum+v*n[i]/l,0),1);
});

test('C11 moving recorded tools translates inner loops and typed loft sections exactly once',()=>{
  const shared={u:1,v:2},hole={points:[shared],segments:[{type:'line',from:shared,to:{u:3,v:4}}]},tool={axis:'y',loop:[shared],holes:[hole],from:0,to:2};
  translateToolRecord(tool,10,20,30);
  assert.deepEqual(hole.points[0],{u:11,v:32});assert.deepEqual(hole.segments[0].to,{u:13,v:34});
  const p={x:1,y:2,z:3},loft={kind:'loft',sections:[[p]],sectionSegments:[[{type:'line',from:p,to:{x:2,y:3,z:4}}]]};
  translateToolRecord(loft,10,20,30);
  assert.deepEqual(p,{x:11,y:22,z:33});assert.deepEqual(loft.sectionSegments[0][0].to,{x:12,y:23,z:34});
});

test('C12 radial revolve tools travel with repeated host translations in exact export',async()=>{
  const {makeBrepRevolve,shapeMassProperties,disposeBrep}=await import('../js/cad_kernel.js');
  const tool={kind:'revolve',radialProfile:true,axis:'y',angle:360,loop:[{u:2,v:0},{u:3,v:0},{u:3,v:2},{u:2,v:2}]};
  translateToolRecord(tool,4,5,6);translateToolRecord(tool,1,2,3);
  const recipe=toolFeatureRecipe(tool),solid=await makeBrepRevolve(recipe.params);
  try{const p=await shapeMassProperties(solid);near(p.centerOfMass.x,5);near(p.centerOfMass.y,8);near(p.centerOfMass.z,9);}finally{disposeBrep(solid);}
});

test('C13 equal-name equal-count imports keep different geometry definitions',()=>{
  const state={items:[]},source={name:'Spacer',size:120,meshData:{positions:[0,0,0,1,0,0,0,1,1]}},changed=structuredClone(source);changed.meshData.positions[3]=2;
  const a=registerImportedDefinition(state,source),b=registerImportedDefinition(state,changed);
  assert.notEqual(a.id,b.id);assert.equal(Object.keys(state.parametric.definitions).length,2);
  assert.equal(createImportedDefinition(source).id,a.id);
  assert.equal(createImportedDefinition({...source,importId:'explicit'}).features[0].id,'explicit');
});

test('C14 Model Items preserves distinct equal-sized feature dimensions',()=>{
  const features=['a','b'].map(id=>({id,type:'extrude',params:{depth:2}})),entries=features.flatMap((f,i)=>['start','end'].map((end,j)=>({kind:'face',persistentId:f.id+':face:'+end,descriptor:{origin:{x:i*10,y:j*2,z:0}}})));
  const scene={topologyIndex:createTopologyIndex(entries),views:[{id:'front',view:{dir:'front'},projection:{basis:viewBasis('front')}}]};
  const planned=planModelItems({features},{dims:[]},scene);
  assert.deepEqual(planned.map(dim=>dim.modelItem),['feature:a:depth','feature:b:depth']);
  assert.equal(planModelItems({features},{dims:planned},scene).length,0);
});

test('C15 origin acquisition refuses moved datums and suppressed fixed relations',()=>{
  let id=10;const sketch={points:[{id:1,x:5,y:6,origin:true},{id:2,x:0,y:0}],constraints:[{type:'fixed',point:1,x:5,y:6,origin:true},{type:'fixed',point:2,x:0,y:0,suppressed:true}]};
  assert.equal(sketchOriginPoint(sketch),null);
  const result=ensureSketchOriginPoint(sketch,()=>id++);assert.equal(result.created,true);assert.equal(result.point.x,0);assert.equal(result.point.y,0);
  assert.equal(ensureSketchOriginPoint(sketch,()=>id++).created,false);
});

test('C16 rejected reference plane graphs do not publish twin offset recovery',()=>{
  const doc={references:[{id:'top',type:'plane',normal:{x:0,y:1,z:0}},{id:'offset',type:'plane',baseReferenceId:'top'},{id:'cycle',type:'plane',baseReferenceId:'cycle'}],referenceGeometry:[{id:'offset',offset:2}]};
  const before=structuredClone(doc);assert.equal(resolveOffsetPlanes(doc).ok,false);assert.deepEqual(doc,before);
});

test('C17 hole callout quantities include circular and curve pattern copies',()=>{
  const hole={id:'hole',type:'hole',params:{layout:'linear',countX:1,countY:1,diameter:1,depth:1}},pattern={id:'pattern',type:'pattern',params:{scope:'feature',seedFeatureId:'hole',mode:'circular',count:4,angle:360,equalSpacing:true}};
  let row=holeCallouts({features:[hole,pattern]})[0];assert.equal(row.quantity,4);assert.equal(row.equalSpacing,true);
  pattern.params.skipInstances='2';row=holeCallouts({features:[hole,pattern]})[0];assert.equal(row.quantity,3);assert.equal(row.equalSpacing,false);
  pattern.params={scope:'feature',seedFeatureId:'hole',mode:'curve',curveCount:4,path:[{x:0,y:0,z:0},{x:10,y:0,z:0}]};
  row=holeCallouts({features:[hole,pattern]})[0];assert.equal(row.quantity,4);assert.equal(row.equalSpacing,false);
});

test('C18 a projected hole cannot bind to an unrelated inherited bore wall',()=>{
  const index=createTopologyIndex([{kind:'face',persistentId:'hole:inherited:bore',descriptor:{surface:'cylinder',origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0},radius:1}}]),basis=viewBasis('top');
  assert.equal(holeTopologyAnchor(index,basis,'hole',{u:10,v:10}),null);
  assert.equal(holeTopologyAnchor(index,basis,'hole',null).pid,'hole:inherited:bore');
});

test('C19 radial hole callout leaders follow their live cylinder placement',()=>{
  const doc={features:[{id:'base',type:'extrude',params:{sketchId:'s',profileEntityIds:[2],depth:3.81}},{id:'hole',type:'hole',params:{layout:'sketch',cylindricalSource:{featureId:'base',circleId:2},cylinderTopDistance:.635,cylinderAngle:0,diameter:.5,depth:1}}],sketches:[{id:'s',plane:'top',points:[{id:1,x:0,y:0}],entities:[{id:2,type:'circle',c:1,r:1.27}]}]};
  let row=holeCallouts(doc)[0];near(row.worldPoints[0].y,3.175);near(row.worldPoints[0].z,1.27);near(row.axis.z,1);
  doc.features[0].params.depth=5;row=holeCallouts(doc)[0];near(row.worldPoints[0].y,4.365);
});

test('C20 cuts reach rotated pattern bodies using their actual world footprint',()=>{
  const rotation={axis:'z',angle:Math.PI/2},bounds={x0:-1.2,x1:.2,y0:4.8,y1:5.2,z0:-.2,z1:.2},loop=[{u:-.6,v:4.9},{u:-.4,v:4.9},{u:-.4,v:5.1},{u:-.6,v:5.1}];
  for(const props of [{patternRotations:[rotation]},{patternRotation:rotation}]){
    const part={kind:'cyl',axis:'y',x:5,y:0,z:0,r:.2,h:1,...props},before=structuredClone(part);
    assert.equal(cutFootprintsMayOverlap(loop,cutFootprint(part,bounds,null,'z')),true);
    assert.deepEqual(part,before);
  }
});

test('C21 replaced merged-boss profiles refresh their recorded analytic geometry',()=>{
  const merge={featureId:'boss',axis:'z',loop:[{u:5,v:5},{u:6,v:5},{u:6,v:6}],segments:[{type:'circle',center:{u:5,v:5},radius:1}]};
  const doc={sketches:[{id:'s',plane:'front',points:[{id:'c',x:0,y:0}],entities:[{id:'new',type:'circle',c:'c',r:2}],constraints:[]}],features:[{id:'boss',type:'extrude',params:{sketchId:'s',profileEntityIds:['old']}}],parts:[{id:'host',merges3d:[merge],meshData:{positions:[1,2,3]}}]};
  assert.equal(rebindReplacedSketchProfiles(doc,'s').length,1);
  assert.equal(merge.segments[0].radius,2);assert.equal(merge.segments[0].center.u,0);
  assert.ok(merge.loop.length>3);assert.equal(doc.parts[0].meshData,undefined);
  assert.deepEqual(rebindReplacedSketchProfiles(doc,'s'),[]);
});

test('C22 tangent edge chains use the actual circular tangent rather than its chord',()=>{
  const edge=(id,descriptor)=>({persistentId:id,kind:'edge',descriptor});
  const line=edge('line',{curve:'line',endpoints:[{x:-1,y:1,z:0},{x:0,y:1,z:0}],measure:1});
  const arc=edge('arc',{curve:'circle',origin:{x:0,y:0,z:0},axis:{x:0,y:0,z:1},radius:1,endpoints:[{x:0,y:1,z:0},{x:1,y:0,z:0}],measure:Math.PI/2});
  const diagonal=edge('diagonal',{curve:'line',endpoints:[{x:-1,y:2,z:0},{x:0,y:1,z:0}],measure:Math.SQRT2});
  assert.equal(edgesAreTangent(line,arc),true);assert.equal(edgesAreTangent(diagonal,arc),false);
  assert.deepEqual(selectTangentChain(line,[line,arc,diagonal]).map(e=>e.persistentId),['line','arc']);
});
