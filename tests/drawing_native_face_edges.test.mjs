import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectSolid} from '../js/core/hidden_line.js';
import {springPreviewMesh} from '../js/core/flexible_spring.js';
import {tessellatePart} from '../js/core/part_tessellate.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
const positions=[0,0,0,1,0,0,0,1,0,1,0,0,1,1,1,0,1,0];
const same=[{persistentId:'smooth-wall',triangleStart:0,triangleCount:2}];
const count=(faceRanges,p=positions)=>projectSolid([{positions:p,faceRanges}],'front',{circles:false}).visible.length;
test('native smooth face facets omit internal creases but preserve open boundaries and real face edges',()=>{
  assert.equal(count(undefined),5);
  assert.equal(count(same),4);
  assert.equal(count([{persistentId:'a',triangleStart:0,triangleCount:1},{persistentId:'b',triangleStart:1,triangleCount:1}]),5);
  assert.equal(count([{persistentId:'bad',triangleStart:0,triangleCount:3}]),5,'invalid native ranges cannot hide geometry');
});
test('a same-native-face front/back fold still produces its silhouette edge',()=>{
  const folded=[...positions.slice(0,9),...positions.slice(9,12),...positions.slice(15,18),...positions.slice(12,15)];
  assert.equal(count(same,folded),count(undefined,folded));
});
test('verified native face identity survives part tessellation and assembly drawing bake',()=>{
  const meshData={positions,faceRanges:same},part={id:'spring',meshData};
  const body=tessellatePart(part);assert.equal(body.faceRanges,same);assert.equal(count(body.faceRanges,body.positions),4);
  const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  assert.match(sourceFunctionText(source,'assemblyDrawingDocument'),/faceRanges: cloneData(part.meshData.faceRanges || [])/);
  assert.deepEqual(meshData,{positions,faceRanges:same},'projection does not alter native mesh or face identities');
});

test('curved spring outlines keep their shared endpoints in a widely exploded assembly',()=>{
  const document={parts:[{id:'wire'}],features:[{id:'helix',type:'helix',params:{radius:.6,height:2.5,turns:4,definition:'height-turns',axis:{x:0,y:1,z:0}}},{id:'sweep',type:'sweep',params:{sketchSources:{helixFeatureId:'helix',diameter:.2}}}]};
  const mesh=springPreviewMesh(document,2.5),positions=mesh.indices.flatMap(index=>mesh.positions.slice(index*3,index*3+3));
  const spring={positions,faceRanges:[{persistentId:'wire-wall',triangleStart:0,triangleCount:positions.length/9}]};
  const remote={positions:[42,0,0,42.1,0,0,42,.1,0]};
  const projection=projectSolid([spring,remote],'iso',{hidden:false,circles:false});
  const ends=new Map(),key=p=>Math.round(p.u/1e-5)+':'+Math.round(p.v/1e-5);
  for(const segment of projection.visible)for(const point of [segment.a,segment.b])ends.set(key(point),(ends.get(key(point))||0)+1);
  const dangling=[...ends.values()].filter(n=>n===1).length;
  assert.ok(dangling<=100,'continuous outline chords must not be relocated by pen-scale line grouping: '+dangling+' dangling endpoints');
  assert.ok(projection.visible.length>200,'the curved coil outlines remain present');
});
