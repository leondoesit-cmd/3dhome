import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {trimEntity} from '../js/sketch_trim.js';
import {solveSketch,circleData} from '../js/sketch_solver.js';

test('BULB converted flange circle retains its radius and constraints after trimming',()=>{
 const sketch=JSON.parse(readFileSync(new URL('./fixtures/bulb-seed-sketch.json',import.meta.url),'utf8'));
 assert.equal(solveSketch(sketch).degreesOfFreedom,0);
 const outer=sketch.entities.find(e=>e.type==='circle'&&!e.construction),radius=outer.r;
 assert.equal(trimEntity(sketch,outer.id,{x:radius,y:0}),true);
 assert.equal(outer.type,'arc');
 assert.equal(sketch.repairs?.filter(r=>r.status==='pending').length||0,0);
 const result=solveSketch(sketch);
 assert.equal(result.converged,true);assert.equal(result.degreesOfFreedom,0);
 assert.ok(Math.abs(circleData(outer,new Map(sketch.points.map(p=>[p.id,p]))).radius-radius)<1e-8);
 // A perturbed trim endpoint must return to the converted circle, not resize it.
 sketch.points.find(p=>p.id===outer.a).x+=.01;
 const rebuilt=solveSketch(sketch);assert.equal(rebuilt.converged,true);assert.equal(rebuilt.degreesOfFreedom,0);
 assert.ok(Math.abs(circleData(outer,new Map(sketch.points.map(p=>[p.id,p]))).radius-radius)<1e-7);
});

test('trimmed converted circles follow a changed concentric source face',async()=>{
 const {updateCircularBoundarySketch}=await import('../js/cad_associative_boundary.js');
 const {compileKernelFeatureTree}=await import('../js/core/kernel_feature_adapter.js');
 const {regenerateFeatures,releaseRegeneration}=await import('../js/cad_feature_tree.js');
 const document=JSON.parse(readFileSync(new URL('./fixtures/bulb-bezier-history.json',import.meta.url),'utf8'));
 document.sketches[0].constraints.find(c=>c.name==='ShoulderDrop').value=.2;
 const compiled=compileKernelFeatureTree(document);
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});
 try{
  assert.equal(run.ok,true,JSON.stringify(run.issues));
  const sketch=JSON.parse(readFileSync(new URL('./fixtures/bulb-seed-sketch.json',import.meta.url),'utf8'));
  const outer=sketch.entities.find(e=>e.type==='circle'&&!e.construction);
  trimEntity(sketch,outer.id,{x:outer.r,y:0});
  const updated=updateCircularBoundarySketch(sketch,run.results);
  assert.ok(updated);
  assert.ok(Math.abs(updated.entities.find(e=>e.type==='circle').r-.5493)<1e-7);
  assert.ok(Math.abs(updated.entities.find(e=>e.id===outer.id).fixedRadius-.7493)<1e-7);
  const solved=solveSketch(updated);assert.equal(solved.converged,true);assert.equal(solved.degreesOfFreedom,0);
  const midpoint=updated.points.find(p=>p.id===426);
  assert.ok(Math.abs(midpoint.y-(.5493+.7493)/2)<1e-7);
  assert.deepEqual(updated.entities.map(e=>e.id),sketch.entities.map(e=>e.id));
 }finally{releaseRegeneration(run);}
});
