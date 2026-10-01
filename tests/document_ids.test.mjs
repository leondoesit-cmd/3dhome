import test from 'node:test';
import assert from 'node:assert/strict';
import {nextDocumentNumericId} from '../js/core/document_ids.js';
import {pickSnap,sketchSnapTargets,inferLineRelations} from '../js/modeler_inference.js';
import {solveSketch} from '../js/sketch_solver.js';

test('reopening a document reserves point, entity and constraint IDs beyond the scene counter',()=>{
 const sketch={points:[{id:120,x:0,y:0}],entities:[{id:131,type:'circle',c:120,r:.635}],constraints:[{id:155,type:'radius',entity:131,value:.635}]};
 const doc={id:'battery',sketches:[sketch],parts:[{id:99,meshData:{positions:new Float32Array([9999])}}]};
 doc.sketch=sketch;
 assert.equal(nextDocumentNumericId(doc,3),156);
 const restored=JSON.parse(JSON.stringify(doc));
 assert.equal(nextDocumentNumericId({def:restored},3),156);
 assert.equal(nextDocumentNumericId(doc,200),200);
 assert.equal(nextDocumentNumericId(null,200),200);
});
test('inserting a subassembly after reopening reserves parent and nested occurrence IDs',()=>{
 const capAndLens={components:[
  {id:295,name:'LENSCAP'},
  {id:296,name:'O-RING'},
  {id:301,kind:'assembly',asm:{components:[{id:302,name:'LENS'},{id:303,name:'BULB'}]}},
 ]};
 assert.equal(nextDocumentNumericId(capAndLens,1),304);
 assert.equal(nextDocumentNumericId(capAndLens,400),400);
});
test('a line sharing a circle center does not add a redundant self-coincident constraint',()=>{
 const inferred=inferLineRelations({id:'line',a:'origin',b:'center'},{u:0,v:0},{u:-1.8,v:1.8},{k:'c',pointId:'center'});
 assert.equal(inferred.some(c=>c.type==='coincident'),false);
 const sketch={points:[{id:'origin',x:0,y:0},{id:'center',x:-1.8,y:1.8}],entities:[
  {id:'circle',type:'circle',c:'center',r:.635},{id:'line',type:'line',a:'origin',b:'center',construction:true}
 ],constraints:[...inferred,{id:'fixed',type:'fixed',point:'origin',x:0,y:0},{id:'r',type:'radius',entity:'circle',value:.635},{id:'d',type:'distance',entity:'line',value:2.54},{id:'a',type:'angle',entity:'line',value:135}]};
 assert.equal(solveSketch(sketch).status,'fully-constrained');
});
test('a circle center at the origin wins a coincident coordinate-only snap and remains cycleable',()=>{
 const sketch={points:[{id:1,x:0,y:0}],entities:[{id:2,type:'circle',c:1,r:.635}]};
 const targets=sketchSnapTargets(sketch);
 const first=pickSnap({u:0,v:0},targets,{scale:40});
 assert.equal(first.snap.pointId,1);
 assert.equal(pickSnap({u:0,v:0},targets,{scale:40,cycleIndex:1}).snap.k,'o');
});
