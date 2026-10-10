import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ensureSketchDoc,removeSketch} from '../js/sketch_solver.js';
import {analyzeParametricHistory,ensureParametricDocument,normalizeHistory,removeHistoryNode} from '../js/core/parametric_document.js';
import {buildTreeModel,findTreeNode} from '../js/core/tree_model.js';

const fixture=JSON.parse(readFileSync(new URL('../artifacts/planchard/EXERCISE-2.2B-qualified-browser-2026-10-10.mforge',import.meta.url),'utf8')).mainModel;
const doc=()=>structuredClone(fixture);
const orphan='sk_32q0d';
const bore='sk_1229q';

test('actual saved 2.2B cold normalization removes only the absent sketch row',()=>{
 const original=doc(),d=ensureParametricDocument(original);
 assert.equal(original.history.length,7,'readonly saved witness retains its original orphan');
 assert.equal(d.history.length,6);
 assert.deepEqual(d.history.map(row=>row.targetId),original.history.filter(row=>row.targetId!==orphan).map(row=>row.targetId));
 assert.deepEqual(d.sketches,original.sketches);
 assert.deepEqual(d.features,original.features);
 assert.deepEqual(d.parts,original.parts);
 assert.equal(analyzeParametricHistory(d,{normalize:false}).ok,true);
 const cold=ensureParametricDocument(JSON.parse(JSON.stringify(d)));
 assert.deepEqual(cold.history,d.history,'repair is idempotent');
});

test('nested consumed sketch uses its real history ID and rejects delete until its cut is removed',()=>{
 const d=ensureParametricDocument(doc());ensureSketchDoc(d);
 const child=findTreeNode(buildTreeModel(d,{authoringSystem:'parametric-v1'}).nodes,'sketch:'+bore);
 assert.equal(child.historyId,'history:sketch:'+bore);
 const before=structuredClone(d);
 const rejected=removeHistoryNode(d,child.historyId);
 assert.equal(rejected.ok,false);
 assert.equal(rejected.issues[0].code,'history-node-has-dependants');
 assert.deepEqual(d,before);
 assert.equal(removeSketch(d,bore),false,'low-level callers cannot bypass dependencies');
 assert.deepEqual(d,before);
 const cut=d.features.find(feature=>feature.params.sketchId===bore);
 assert.equal(removeHistoryNode(d,'history:feature:'+cut.id).ok,true);
 d.activeSketch=bore;d.rollbackIndex=d.history.length;
 assert.equal(removeSketch(d,bore),true);
 assert.equal(d.history.some(row=>row.targetId===bore),false);
 assert.equal(d.sketches.some(sketch=>sketch.id===bore),false);
 assert.equal(d.rollbackIndex,4);
 assert.ok(d.sketches.some(sketch=>sketch.id===d.activeSketch));
 assert.equal(analyzeParametricHistory(d,{normalize:false}).ok,true);
});

test('orphan cleanup preserves the rollback boundary and missing live-input errors',()=>{
 const d=doc();d.rollbackIndex=5;
 normalizeHistory(d);
 assert.equal(d.rollbackIndex,4,'front circle and cut remain rolled back');
 assert.equal(d.history[d.rollbackIndex].targetId,bore);
 normalizeHistory(d);assert.equal(d.rollbackIndex,4);
 const missing=doc();missing.sketches=missing.sketches.filter(sketch=>sketch.id!==bore);
 const cut=missing.features.find(feature=>feature.params.sketchId===bore);
 normalizeHistory(missing);
 assert.ok(missing.features.includes(cut));
 assert.deepEqual(cut.references.sketches,[bore]);
 assert.ok(analyzeParametricHistory(missing,{normalize:false}).issues.some(issue=>issue.code==='missing-sketch-dependency'&&issue.sketchId===bore));
});

test('legacy sketch deletion protects unrecorded consumers and deletes an unused sketch',()=>{
 const d=ensureParametricDocument(doc());ensureSketchDoc(d);
 d.history=d.history.filter(row=>row.targetId!==bore);
 const before=structuredClone(d);
 assert.equal(removeSketch(d,bore),false);assert.deepEqual(d,before);
 d.features=d.features.filter(feature=>feature.params.sketchId!==bore);
 assert.equal(removeSketch(d,bore),true);
 assert.equal(d.sketches.length,2);
});
