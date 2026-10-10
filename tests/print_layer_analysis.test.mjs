import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePrintLayers,printLayerSvg,printLayerSourceStamp} from '../js/core/print_layer_analysis.js';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';
import {createPartDocument,createFeatureDefinition} from '../js/core/parametric_document.js';

function box(x=0,y=0,z=0,w=10,d=20,h=2){
  return {vertices:[[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z],[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]],triangles:[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]};
}
function tube(n=32,outer=3,inner=1,height=2,counterboreRadius=inner){
  const vertices=[],triangles=[];
  const rings=[[outer,0],[outer,height],[inner,0],[inner,height/2],[counterboreRadius,height/2],[counterboreRadius,height]];
  rings.forEach(([r,z])=>{for(let i=0;i<n;i++)vertices.push([r*Math.cos(i*2*Math.PI/n),r*Math.sin(i*2*Math.PI/n),z]);});
  function bridge(a,b,reverse=false){for(let i=0;i<n;i++){
    const j=(i+1)%n,quads=[[a*n+i,a*n+j,b*n+j],[a*n+i,b*n+j,b*n+i]];
    for(const t of quads)triangles.push(reverse?t.reverse():t);
  }}
  bridge(0,1);bridge(0,2,true);bridge(1,5);bridge(2,3,true);
  if(counterboreRadius!==inner){bridge(3,4,true);bridge(4,5,true);}
  else { // Avoid a zero-width ring: replace its two coincident vertex rings.
    bridge(3,5,true);
  }
  return {vertices,triangles};
}
test('actual box layers have analytic area, closed simplified contours, mid-slab heights and no source mutation',async()=>{
  const mesh=box(),before=JSON.stringify(mesh),result=await analyzePrintLayers([mesh],{layerHeightMm:.3});
  assert.equal(result.layerCount,7);assert.equal(result.layers[0].sectionZMm,.15);
  assert.equal(result.layers[6].topZMm,2);assert.ok(Math.abs(result.layers[6].sectionZMm-1.9)<1e-12);
  for(const layer of result.layers){assert.equal(layer.areaMm2,200);assert.equal(layer.objects[0].contours[0].points.length,4);assert.equal(layer.objects[0].contours[0].hole,false);}
  assert.equal(JSON.stringify(mesh),before);assert.match(printLayerSvg(result,3),/Geometric print layer 3 contours/);assert.match(printLayerSvg(result,3),/ Z/);
});
test('closed annular section identifies true holes and polygonal-cylinder area',async()=>{
  const n=32,result=await analyzePrintLayers([tube(n)],{layerHeightMm:.2});
  const expected=n*Math.sin(2*Math.PI/n)*(9-1)/2;
  for(const layer of result.layers){assert.equal(layer.objects[0].contours.length,2);assert.equal(layer.objects[0].contours.filter(c=>c.hole).length,1);assert.ok(Math.abs(layer.areaMm2-expected)<1e-9);}
});
test('counterbore shoulder changes the hole radius and material area at the real height',async()=>{
  const result=await analyzePrintLayers([tube(48,3,1,2,2)],{layerHeightMm:.4});
  const polygonFactor=48*Math.sin(2*Math.PI/48)/2;
  assert.ok(Math.abs(result.layers[1].areaMm2-polygonFactor*8)<1e-9);
  assert.ok(Math.abs(result.layers[3].areaMm2-polygonFactor*5)<1e-9);
  assert.equal(result.layers[2].sectionZMm,1,'exact shoulder plane exercises half-open/coplanar handling');
  assert.equal(result.layers[2].objects[0].contours.length,2);
});
test('separate placed bodies retain identity and disconnected layer contours',async()=>{
  const left={...box(-15,0,0,5,5,1),name:'Left',occurrenceId:'A'},right={...box(10,0,0,5,5,2),name:'Right',occurrenceId:'B'};
  const result=await analyzePrintLayers([left,right],{layerHeightMm:.5});
  assert.deepEqual(result.layers[0].objects.map(o=>o.occurrenceId),['A','B']);assert.equal(result.layers[0].areaMm2,50);
  assert.equal(result.layers[3].objects[0].contours.length,0);assert.equal(result.layers[3].areaMm2,25);
});
test('open or invalid mesh, unplaced bed, resource excess and invalid layer inputs reject',async()=>{
  const open=box();open.triangles.pop();await assert.rejects(analyzePrintLayers([open]),/open/);
  const invalid=box();invalid.vertices[0][0]=NaN;await assert.rejects(analyzePrintLayers([invalid]),/nonfinite/);
  await assert.rejects(analyzePrintLayers([box(0,0,1)]),/Z=0/);
  await assert.rejects(analyzePrintLayers([box()],{layerHeightMm:.01,maxLayers:2}),/budget/);
  await assert.rejects(analyzePrintLayers([box()],{maxTriangleSections:1}),/budget/);
  for(const height of [0,-1,NaN,Infinity,.001])await assert.rejects(analyzePrintLayers([box()],{layerHeightMm:height}),/Layer height/);
});
test('document/source switch during cooperative calculation rejects before publication',async()=>{
  let current=true;
  await assert.rejects(analyzePrintLayers([box()],{assertCurrent(){if(!current)throw Error('source changed');},yieldControl:async()=>{current=false;}}),/source changed/);
  const first=await analyzePrintLayers([box()]),changed=await analyzePrintLayers([box(1)]);assert.notEqual(first.sourceMeshFingerprint,changed.sourceMeshFingerprint);
});
test('source guard ignores derived rebuild caches but detects feature, sketch and orientation changes',()=>{
  const doc={features:[{params:{depth:1},state:'rebuilt',diagnostics:[]}],sketches:[{geometry:[{x:1,y:2}]}],lastRebuild:{time:1},parts:[{meshData:'old'}]},setup={basePlane:'top'};
  const stamp=printLayerSourceStamp(doc,setup);doc.lastRebuild.time=2;doc.parts[0].meshData='new';doc.features[0].state='pending';
  assert.equal(printLayerSourceStamp(doc,setup),stamp);
  doc.features[0].params.depth=2;assert.notEqual(printLayerSourceStamp(doc,setup),stamp);doc.features[0].params.depth=1;
  doc.sketches[0].geometry[0].x=3;assert.notEqual(printLayerSourceStamp(doc,setup),stamp);doc.sketches[0].geometry[0].x=1;
  assert.notEqual(printLayerSourceStamp(doc,{basePlane:'front'}),stamp);
  const direct={parts:[{kind:'box',w:1,meshData:'old'}]},directStamp=printLayerSourceStamp(direct,setup);
  direct.parts[0].meshData='new';assert.equal(printLayerSourceStamp(direct,setup),directStamp);
  direct.parts[0].w=2;assert.notEqual(printLayerSourceStamp(direct,setup),directStamp);
});
test('native assembly worker supplies real oriented/centered mm meshes without export or CAD mutation',async()=>{
  const doc=createPartDocument({metadata:{authoringSystem:'parametric-v1'}});createFeatureDefinition(doc,'box',{id:'box',params:{x:0,y:0,z:0,w:1,h:2,d:3}});
  const components=[{id:'part',document:doc,label:'Native box',placement:{matrix:[1,0,0,0,1,0,0,0,1],translation:{x:4,y:0,z:0}}}],before=JSON.stringify(components),execute=createCadWorkerExecutor();
  const result=await execute({kind:'assembly-print',components,settings:{quality:'custom',deviationMm:.01,angleDegrees:5,layerAnalysisOnly:true,printSetup:{basePlane:'front',bedWidthMm:100,bedDepthMm:100,bedHeightMm:100}}});
  assert.equal(result.bytes,undefined);assert.equal(result.meshes.length,1);
  const analysis=await analyzePrintLayers(result.meshes,{layerHeightMm:1});
  assert.equal(analysis.layerCount,30);assert.deepEqual(analysis.bounds,{min:[-5,-10,0],max:[5,10,30]});assert.equal(analysis.layers[0].areaMm2,200);
  assert.equal(JSON.stringify(components),before);
});
