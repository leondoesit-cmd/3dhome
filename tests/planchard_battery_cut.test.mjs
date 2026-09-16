import test from 'node:test';
import assert from 'node:assert/strict';
import {disposeBrep, extractBrepTopology, makeBrepExtrusion} from '../js/cad_kernel.js';
import {exactBrepForPart, orderedProjectionSteps} from '../js/modeler_part_geometry.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {captureExactTopology} from '../js/core/exact_topology_cache.js';

function roundedSquareSegments(extent,radius){
  const tangent=extent-radius, diagonal=radius/Math.sqrt(2);
  return [
    {type:'line',from:{u:-tangent,v:-extent},to:{u:tangent,v:-extent}},
    {type:'arc',from:{u:tangent,v:-extent},to:{u:extent,v:-tangent},mid:{u:tangent+diagonal,v:-tangent-diagonal},center:{u:tangent,v:-tangent},radius},
    {type:'line',from:{u:extent,v:-tangent},to:{u:extent,v:tangent}},
    {type:'arc',from:{u:extent,v:tangent},to:{u:tangent,v:extent},mid:{u:tangent+diagonal,v:tangent+diagonal},center:{u:tangent,v:tangent},radius},
    {type:'line',from:{u:tangent,v:extent},to:{u:-tangent,v:extent}},
    {type:'arc',from:{u:-tangent,v:extent},to:{u:-extent,v:tangent},mid:{u:-tangent-diagonal,v:tangent+diagonal},center:{u:-tangent,v:tangent},radius},
    {type:'line',from:{u:-extent,v:tangent},to:{u:-extent,v:-tangent}},
    {type:'arc',from:{u:-extent,v:-tangent},to:{u:-tangent,v:-extent},mid:{u:-tangent-diagonal,v:-tangent-diagonal},center:{u:-tangent,v:-tangent},radius},
  ];
}

function splitArcSegments(segments){
  const between=(a,b,center,radius)=>{const x=(a.u-center.u)+(b.u-center.u),y=(a.v-center.v)+(b.v-center.v),size=Math.hypot(x,y);return{u:center.u+x/size*radius,v:center.v+y/size*radius};};
  return segments.flatMap(segment=>segment.type!=='arc'?[segment]:[
    {...segment,to:segment.mid,mid:between(segment.from,segment.mid,segment.center,segment.radius)},
    {...segment,from:segment.mid,mid:between(segment.mid,segment.to,segment.center,segment.radius)},
  ]);
}

test('BATTERY projection replays side fillet before its linked rounded top cut',async()=>{
  const baseId='feature_mzzzzzzz_1',filletId='feature_mzzzzzzz_2',cutId='feature_mzzzzzzz_3';
  assert.deepEqual(
    orderedProjectionSteps([{featureId:cutId}],[],[{id:filletId}]).map(step=>step.kind),
    ['operation','cut'],
    'separate compatibility arrays must not reorder Fillet -> Cut history',
  );
  const half=3.429,height=10.414,outerRadius=1.27,inset=.381,pocketRadius=outerRadius-inset,pocketExtent=half-inset;
  const points=[{u:-half,v:-half},{u:half,v:-half},{u:half,v:half},{u:-half,v:half}];
  let source,result;
  try{
    source=await makeBrepExtrusion({points,axis:'y',from:0,to:height});
    extractBrepTopology(source,{ownerFeatureId:baseId});
    const vertical=source.topology.filter(edge=>edge.kind==='edge'&&Math.abs(edge.descriptor.axis?.y)>.99);
    assert.equal(vertical.length,4);
    const segments=roundedSquareSegments(pocketExtent,pocketRadius);
    const part={
      id:'battery',featureId:baseId,kind:'ext',axis:'y',from:0,to:height,pts:points,holes:[],
      exactOperations:[{id:filletId,type:'fillet',amount:outerRadius,targets:structuredClone(vertical)}],
      cuts3d:[{featureId:cutId,axis:'y',from:height-.508,to:height,loop:segments.map(segment=>segment.from),segments}],
    };
    result=await exactBrepForPart(part);
    extractBrepTopology(result);
    const cylinders=result.topology.filter(face=>face.kind==='face'&&face.descriptor.surface==='cylinder');
    assert.ok(cylinders.filter(face=>Math.abs(face.descriptor.radius-outerRadius)<1e-6).length>=2,'the rounded outside walls survive');
    assert.equal(cylinders.filter(face=>Math.abs(face.descriptor.radius-pocketRadius)<1e-6).length,4,'the pocket has four true radius-8.89 mm walls');
    const floor=result.topology.find(face=>face.kind==='face'&&face.descriptor.surface==='plane'&&face.descriptor.normal?.y>.99&&Math.abs(face.descriptor.origin.y-(height-.508))<1e-6);
    assert.ok(floor,'the pocket floor is exactly 5.08 mm below the top face');
  }finally{disposeBrep(result);disposeBrep(source);}
});

test('BATTERYPLATE base depth and draft edit preserves the saved rim selections',async()=>{
  const baseId='feature_mu493zrj_1',fillet1Id='feature_mu494nhz_3',pocketId='feature_mu495t59_4';
  const base={id:baseId,name:'Extrude / Boss 1',type:'extrude',inputs:[],references:{topology:[]},params:{
    points:[{u:-3.429,v:-3.429},{u:3.429,v:-3.429},{u:3.429,v:3.429},{u:-3.429,v:3.429}],
    axis:'y',from:0,to:10.414,depth:10.414,draftAngle:0,
  }};
  let document={sketches:[],features:[base]},run=await regenerateFeatures(document);
  const reference=entry=>({
    type:'topology-reference',ownerFeatureId:entry.ownerFeatureId,kind:entry.kind,
    persistentId:entry.persistentId,semantic:entry.semantic,
    descriptor:structuredClone(entry.descriptor),signature:entry.signature,
  });
  const vertical=run.finalShape.topology.filter(entry=>entry.kind==='edge'&&Math.abs(entry.descriptor.axis?.y)>.99).map(reference);
  releaseRegeneration(run);
  assert.equal(vertical.length,4);

  const fillet1={id:fillet1Id,name:'Fillet 1',type:'fillet',inputs:[baseId],references:{topology:vertical},params:{radius:1.27}};
  const pocketSegments=roundedSquareSegments(3.048,.889);
  const pocketTool={id:pocketId+':tool',name:'Pocket tool',type:'extrude',inputs:[fillet1Id],references:{topology:[]},params:{
    points:pocketSegments.map(segment=>segment.from),segments:pocketSegments,axis:'y',from:10.414,to:9.906,depth:.508,
  }};
  const pocket={id:pocketId,name:'Extrude Cut 1',type:'subtract',inputs:[fillet1Id,pocketId+':tool'],references:{topology:[]},params:{}};
  document={sketches:[],features:[base,fillet1,pocketTool,pocket]};
  run=await regenerateFeatures(document);
  assert.equal(run.ok,true,JSON.stringify(run.issues));
  const topEdges=run.finalShape.topology.filter(entry=>entry.kind==='edge'
    && Math.abs((entry.descriptor.bounds?.min?.y??-99)-10.414)<1e-5
    && Math.abs((entry.descriptor.bounds?.max?.y??-99)-10.414)<1e-5);
  const cutToolCircle=run.results.get(pocketId+':tool').topology.find(entry=>entry.persistentId===pocketId+':tool:edge:generated:circle:5');
  releaseRegeneration(run);
  assert.equal(topEdges.length,16);
  assert.ok(cutToolCircle,'the recovered browser model cut-tool edge must be present');

  const fillet2={id:'fillet2',name:'Fillet 2',type:'fillet',inputs:[pocketId],references:{topology:topEdges.concat(cutToolCircle).map(reference)},params:{radius:.127}};
  document={sketches:[],features:[base,fillet1,pocketTool,pocket,fillet2]};
  run=await regenerateFeatures(document);
  let terminalSupport;
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    terminalSupport=run.finalShape.topology.filter(entry=>entry.kind==='face'&&entry.descriptor.surface==='plane'
      && entry.descriptor.normal?.y>.99&&Math.abs(entry.descriptor.origin.y-9.906)<1e-5)
      .sort((a,b)=>(b.descriptor.measure||0)-(a.descriptor.measure||0))[0];
    assert.ok(terminalSupport,'the terminal sketch support floor must exist');
  }finally{releaseRegeneration(run);}

  const support=reference(terminalSupport),frame={origin:{x:0,y:9.906,z:0},normal:{x:0,y:1,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:0,z:-1}};
  const terminal=(id,input,center)=>{
    const points=Array.from({length:16},(_,index)=>{const angle=index*Math.PI/8;return{u:center.u+Math.cos(angle)*.635,v:center.v+Math.sin(angle)*.635};});
    const tool={id:id+':tool',name:id+' tool',type:'extrude',inputs:[input],references:{topology:[support]},params:{
      axis:'frame',frame:structuredClone(frame),support,baseOffset:0,depth:1,endCondition:'through-all',direction:'reverse',
      from:0,to:-12,points,segments:[{type:'circle',center,radius:.635}],targetFeatureId:input,
    }};
    const cut={id,name:id,type:'subtract',inputs:[input,id+':tool'],references:{topology:[]},params:{}};
    return [tool,cut];
  };
  const [terminalTool1,terminalCut1]=terminal('feature_mu4b8bji_2','fillet2',{u:0,v:0});
  const [terminalTool2,terminalCut2]=terminal('feature_mu4bz5zm_1','feature_mu4b8bji_2',{u:-1.796051,v:1.796051});
  document.features.push(terminalTool1,terminalCut1,terminalTool2,terminalCut2);
  run=await regenerateFeatures(document);
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    document.exactTopologyCache=captureExactTopology(document,document.features,run);
  }finally{releaseRegeneration(run);}

  const edited=structuredClone(document);
  Object.assign(edited.features.find(feature=>feature.id===baseId).params,{to:1.016,depth:1.016,draftAngle:3});
  Object.assign(edited.features.find(feature=>feature.id===pocketId+':tool').params,{from:1.016,to:.508,segments:splitArcSegments(pocketSegments)});
  run=await regenerateFeatures(edited);
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    assert.ok(run.results.get('fillet2')?.shape,'the downstream rim fillet did not rebuild');
    assert.equal(run.issues.filter(issue=>issue.code==='missing-topology-reference').length,0);
    for(const id of ['feature_mu4b8bji_2:tool','feature_mu4bz5zm_1:tool']){
      const params=run.resolvedExtrusions.get(id);
      assert.ok(params,'the terminal Through All tool did not rebuild');
      assert.ok(Math.abs(params.frame.normal.y-1)<1e-8,'terminal tool changed away from the vertical axis');
      assert.ok(Math.abs(params.frame.origin.y-.508)<1e-5,'terminal sketch did not follow the pocket floor');
    }
    const holes=run.finalShape.topology.filter(entry=>entry.kind==='face'&&entry.descriptor.surface==='cylinder'&&Math.abs(entry.descriptor.radius-.635)<1e-5);
    assert.equal(holes.length,2,'the shallow plate must retain both Ø12.7 mm terminal holes');
    const centres=holes.map(entry=>entry.descriptor.origin).sort((a,b)=>a.x-b.x);
    assert.ok(centres.some(point=>Math.hypot(point.x,point.z)<1e-4),'the origin terminal hole moved');
    assert.ok(centres.some(point=>Math.hypot(point.x+1.796051,point.z+1.796051)<1e-4),'the 25.4 mm / 45° terminal hole moved');
  }finally{releaseRegeneration(run);}
});
