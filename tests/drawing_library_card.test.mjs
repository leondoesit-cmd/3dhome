import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {drawingOnlyContentSummary} from '../js/core/model_save_policy.js';
import {ensureParametricDocument} from '../js/core/parametric_document.js';
import {ensureSketchDoc} from '../js/sketch_solver.js';
const line={id:'p1',type:'line',points:[{x:20,y:20},{x:40,y:20}]};
test('saved annotation-only worksheet is Drawing with honest primitive/note counts',()=>{
 const doc={parts:[],features:[],sketches:[],drawing:{views:[],primitives:Array.from({length:8},(_,i)=>({...line,id:'p'+i})),notes:[{text:'Front\nTop'},{text:'First angle'},{text:'Centerlines'},{text:' '}]}};
 assert.deepEqual(drawingOnlyContentSummary(doc),{annotations:8,notes:3});
 assert.deepEqual(drawingOnlyContentSummary(JSON.parse(JSON.stringify(doc))),{annotations:8,notes:3});
});
test('blank and malformed sheets never get Drawing-only card classification',()=>{
 assert.equal(drawingOnlyContentSummary({parts:[],drawing:{notes:[],primitives:[]}}),null);
 assert.equal(drawingOnlyContentSummary({drawing:{primitives:[{type:'line',points:[{x:1,y:1}]}]}}),null);
 assert.equal(drawingOnlyContentSummary(null),null);
 assert.equal(drawingOnlyContentSummary({sketches:[null],history:{},drawing:{notes:{},primitives:{}}}),null);
});
test('authored sketches and solids retain their existing card classification',()=>{
 const drawing={notes:[{text:'Caption'}],primitives:[line]};
 assert.equal(drawingOnlyContentSummary({parts:[{}],drawing}),null);
 assert.equal(drawingOnlyContentSummary({features:[{}],drawing}),null);
 assert.equal(drawingOnlyContentSummary({sketches:[{id:'s1',entities:[{}]}],drawing}),null);
 assert.deepEqual(drawingOnlyContentSummary({sketches:[{id:'s1',entities:[]}],history:[{kind:'sketch',targetId:'s1'}],drawing}),{annotations:1,notes:1});
 assert.equal(drawingOnlyContentSummary({sketches:[{id:'points-only',points:[{id:'p1',u:0,v:0}]}],drawing}),null);
 assert.deepEqual(drawingOnlyContentSummary({sketches:[{id:'implicit',entities:[]}],history:[],drawing}),{annotations:1,notes:1});
});
test('actual qualified worksheet classifies Drawing despite its normalized empty working-sketch history',()=>{
 const doc=JSON.parse(readFileSync(new URL('../artifacts/planchard/DRAFTING-1.1-1.3-qualified-browser-2026-10-09.mforge',import.meta.url),'utf8')).mainModel;
 assert.equal(doc.parts.length,0);assert.equal(doc.features.length,0);assert.equal(doc.sketches.length,1);assert.equal(doc.history.length,1);
 assert.deepEqual(doc.sketches[0].points,[]);assert.deepEqual(doc.sketches[0].entities,[]);assert.deepEqual(doc.sketches[0].constraints,[]);
 const before=JSON.stringify(doc);assert.deepEqual(drawingOnlyContentSummary(doc),{annotations:8,notes:3});assert.equal(JSON.stringify(doc),before);
});
test('canonical working-sketch normalization preserves history without masking paper content or real empty-sketch saveability',()=>{
 const doc={id:'drawing-save',key:'cm_drawing_save',parts:[],features:[],sketches:[],history:[],metadata:{authoringSystem:'parametric-v1'},drawing:{primitives:[line],notes:[{text:'Answer'}]}};
 ensureSketchDoc(doc);assert.equal(doc.sketches.length,1);assert.equal(doc.history.length,0);
 const normalized=ensureParametricDocument(doc);assert.equal(normalized.history.length,1);
 const before=JSON.stringify(normalized);assert.deepEqual(drawingOnlyContentSummary(normalized),{annotations:1,notes:1});assert.equal(JSON.stringify(normalized),before);
 delete normalized.drawing;assert.equal(drawingOnlyContentSummary(normalized),null);assert.equal(normalized.history.length,1);
});
