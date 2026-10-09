import test from 'node:test';
import assert from 'node:assert/strict';
import {drawingOnlyContentSummary} from '../js/core/model_save_policy.js';
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
 assert.equal(drawingOnlyContentSummary({sketches:[{id:'s1',entities:[]}],history:[{kind:'sketch',targetId:'s1'}],drawing}),null);
 assert.deepEqual(drawingOnlyContentSummary({sketches:[{id:'implicit',entities:[]}],history:[],drawing}),{annotations:1,notes:1});
});
