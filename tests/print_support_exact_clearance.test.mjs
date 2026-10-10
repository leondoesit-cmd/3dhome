import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clipSupportPaths,supportClearsContours} from '../js/core/print_raster.js';
import {toolpathsFromLayers} from '../js/core/print_toolpaths.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeToMeshData,brepContainsPoint} from '../js/cad_kernel.js';
import {stlMeshOptions} from '../js/cad_stl.js';
import {prepareNativePrintPositions} from '../js/core/print_setup.js';
import {printMeshFromPositions} from '../js/cad_3mf.js';
import {analyzePrintLayers} from '../js/core/print_layer_analysis.js';

const rectangle=(x0,y0,x1,y1)=>({points:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]});
const object=(...contours)=>({contours});
const total=paths=>paths.reduce((sum,p)=>sum+Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]),0);

test('a sub-grid material island splits support and retains both genuinely clear intervals',()=>{
  const objects=[object(rectangle(.03,-1,.04,1))],original=JSON.stringify(objects),result=clipSupportPaths([[-5,0],[5,0]],objects,.4);
  assert.equal(result.paths.length,2);assert.ok(total(result.paths)>9.18&&total(result.paths)<9.20);
  assert.ok(result.paths.every(p=>supportClearsContours(p,objects,.4)));
  assert.ok(result.paths[0][1][0]<-.37&&result.paths[1][0][0]>.44);
  assert.equal(JSON.stringify(objects),original);
});

test('finite edge capsules include nearby endpoints, parallel grazing and zero-length contour edges',()=>{
  const objects=[object({points:[[0,.3],[.1,.3],[.1,1],[0,1],[0,1]]})];
  const result=clipSupportPaths([[-2,0],[2,0]],objects,.4);
  assert.equal(result.paths.length,2);assert.ok(result.removedLengthMm>.62);
  assert.ok(result.paths.every(p=>supportClearsContours(p,objects,.4)));
  assert.deepEqual(clipSupportPaths([[-2,-1],[2,-1]],objects,.4).paths,[[[-2,-1],[2,-1]]]);
});

test('holes retain void supports, wholly interior paths vanish, and separate objects union material',()=>{
  const ring=object(rectangle(-5,-5,5,5),rectangle(-2,-2,2,2));
  assert.deepEqual(clipSupportPaths([[-1,0],[1,0]],[ring],.4).paths,[[[-1,0],[1,0]]]);
  assert.equal(clipSupportPaths([[3,0],[4,0]],[ring],.4).paths.length,0);
  const overlapping=[object(rectangle(-3,-3,3,3)),object(rectangle(-2,-2,2,2))];
  assert.equal(clipSupportPaths([[-1,0],[1,0]],overlapping,.4).paths.length,0);
  assert.throws(()=>clipSupportPaths([[0,0],[Infinity,0]],[ring],.4),/Finite/);
  assert.throws(()=>clipSupportPaths([[0,0,0],[1,0,0]],[ring],.4),/Finite/);
});

test('both support modes clip a raster-invisible material wall, diagnose trimming and preserve safe support',async()=>{
  const source={sourceMeshFingerprint:'support-sub-grid',bounds:{min:[-5,-5,0],max:[5,5,.8]},layers:[{number:1,bottomZMm:0,topZMm:.4,objects:[{occurrenceId:'A',contours:[rectangle(.03,-4,.04,4)]}]},{number:2,bottomZMm:.4,topZMm:.8,objects:[{occurrenceId:'A',contours:[rectangle(-5,-5,5,5)]}]}]};
  const original=JSON.stringify(source);
  for(const support of ['buildplate','everywhere']) {
    const slice=await toolpathsFromLayers(source,{support,supportGapMm:0,supportXYGapMm:0,layerHeightMm:.4,gridMm:.2,lineWidthMm:.8,skinLayers:0,infillPercent:0});
    const supports=slice.layers[0].paths.filter(p=>p.kind==='support');
    assert.ok(supports.length>0);assert.ok(slice.diagnostics.some(d=>d.kind==='support-clipped'&&d.retainedPieces===2));
    assert.ok(supports.every(p=>supportClearsContours(p.points.map(q=>q.slice(0,2)),source.layers[0].objects,.4)));
    assert.ok(slice.estimates.supportVolumeMm3>0);
    const margin=await toolpathsFromLayers(source,{support,supportGapMm:0,supportXYGapMm:0,layerHeightMm:.4,gridMm:.2,lineWidthMm:.8,skinLayers:0,infillPercent:0},{contourMarginMm:.01});
    assert.equal(margin.supportContourAllowanceMm,.01);
    assert.ok(margin.estimates.supportVolumeMm3<slice.estimates.supportVolumeMm3);
    assert.deepEqual(margin.layers.map(l=>l.paths.filter(p=>p.kind!=='support')),slice.layers.map(l=>l.paths.filter(p=>p.kind!=='support')));
    assert.ok(margin.diagnostics.filter(d=>d.kind==='support-clipped').every(d=>d.contourMarginMm===.01));
  }
  assert.equal(JSON.stringify(source),original);
});

test('actual Q4 native sections clip both exported failing support beads while preserving clear pieces',async()=>{
  const path='tests/fixtures/q4_actual_support_clearance.json',bytes=fs.readFileSync(path),fixture=JSON.parse(bytes),source=fixture.document,compiled=compileKernelFeatureTree(structuredClone(source)),run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    const mesh=await shapeToMeshData(run.finalShape,stlMeshOptions({quality:'custom',deviationMm:.01,angleDegrees:5})),analysis=await analyzePrintLayers([printMeshFromPositions(prepareNativePrintPositions(mesh.positions,source.printSetup))],{layerHeightMm:.4});
    for(const {layer,points} of fixture.failingPaths) {
      const objects=analysis.layers[layer-1].objects;
      assert.equal(supportClearsContours(points,objects,.4),false);
      const clipped=clipSupportPaths(points,objects,.4);
      assert.ok(clipped.paths.length>=1);assert.ok(clipped.removedLengthMm>0);
      assert.ok(total(clipped.paths)>total([points])/2);
      assert.ok(clipped.paths.every(p=>supportClearsContours(p,objects,.4)));
    }
    const residual=fixture.postfixResidualPath,objects=analysis.layers[residual.layer-1].objects;
    assert.equal(supportClearsContours(residual.points,objects,.4),false);
    assert.equal(brepContainsPoint(run.finalShape,residual.nativeCapDirectionProbeOut,1e-9),false);
    assert.equal(brepContainsPoint(run.finalShape,residual.nativeCapDirectionProbeInAt0401,1e-9),true);
    // The actual native tessellation allowance is .01 mm = .001 kernel cm.
    assert.equal(stlMeshOptions({quality:'custom',deviationMm:.01,angleDegrees:5}).deflection,.001);
    const conservative=clipSupportPaths(residual.points,objects,.4+.01);
    assert.ok(conservative.removedLengthMm>0&&conservative.paths.length===1);
    assert.ok(conservative.paths.every(p=>supportClearsContours(p,objects,.4)));
    assert.ok(bytes.equals(fs.readFileSync(path)));
  }finally{releaseRegeneration(run);}
});

test('approximation allowance only trims or omits unsafe short support pieces and rejects invalid options',async()=>{
  const objects=[object(rectangle(-2,-2,-.4025,2)),object(rectangle(.4025,-2,2,2))],line=[[0,-.01],[0,.01]];
  assert.equal(clipSupportPaths(line,objects,.4).paths.length,1);
  assert.equal(clipSupportPaths(line,objects,.41).paths.length,0);
  const analysis={bounds:{min:[0,0,0],max:[1,1,1]},layers:[]};
  for(const contourMarginMm of [-.01,Infinity,NaN,2])await assert.rejects(toolpathsFromLayers(analysis,{}, {contourMarginMm}),/approximation allowance/);
});
