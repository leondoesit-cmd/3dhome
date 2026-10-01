import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartDocument} from '../js/core/parametric_document.js';
import {rebuildParametricDocument,publishRebuildStatus} from '../js/core/parametric_rebuild.js';
import {solveSketch} from '../js/sketch_solver.js';

function documentWithCircle(radius=2) {
  const document=createPartDocument({id:'status-check'});
  document.sketches=[{id:'circle-sketch',name:'Circle',plane:'top',referenceId:'plane:top',points:[{id:1,x:0,y:0,fixed:true}],entities:[{id:2,type:'circle',c:1,r:1}],constraints:[{id:'radius',type:'radius',entity:2,value:1},{id:'diameter',type:'diameter',entity:2,value:radius}]}];
  return document;
}
test('a solved redundant sketch stays buildable and publishes Overdefined rather than Fullydefined',()=>{
  const document=documentWithCircle();
  assert.equal(solveSketch(document.sketches[0]).status,'over-constrained');
  const run=rebuildParametricDocument(document);
  assert.equal(run.ok,true,JSON.stringify(run.issues));
  assert.ok(run.issues.some(issue=>issue.sketchId==='circle-sketch' && issue.severity==='warning' && issue.code==='over-constrained-sketch'));
  publishRebuildStatus(document,run);
  assert.equal(document.sketches[0].status,'over-defined');
});
test('a genuinely conflicting sketch is reported as a rebuild error and never stamped Fullydefined',()=>{
  const document=documentWithCircle(3);
  assert.equal(solveSketch(document.sketches[0]).status,'conflicting');
  const run=rebuildParametricDocument(document);
  assert.equal(run.ok,false);
  assert.ok(run.issues.some(issue=>issue.sketchId==='circle-sketch' && issue.severity==='error'));
  publishRebuildStatus(document,run);
  assert.equal(document.sketches[0].status,'conflicting');
});
