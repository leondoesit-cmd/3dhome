import test from 'node:test';
import assert from 'node:assert/strict';
import {pierceSketchToHelix} from '../js/core/sketch_pierce.js';
import {buildDependencyGraph} from '../js/core/dependency_graph.js';
test('a pierced profile translates with the path while preserving dimensions and fixed constraints',()=>{
 const sketch={id:'profile',plane:'top',points:[{id:'anchor',x:10,y:20},{id:'b',x:11,y:20}],entities:[],constraints:[{type:'fixed',point:'anchor',x:10,y:20},{type:'distance',value:1}]};
 const helix={origin:{x:0,y:0,z:-3.2385},axis:{x:0,y:0,z:1},radius:6.223876,pitch:.635,turns:2.5,height:1.5875};
 const next=pierceSketchToHelix(sketch,'anchor',helix);assert.ok(Math.abs(next.points[0].x+6.223876)<1e-9);assert.ok(Math.abs(next.points[0].y+3.2385)<1e-9);assert.equal(next.points[1].x-next.points[0].x,1);assert.equal(next.constraints[0].x,next.points[0].x);assert.equal(next.constraints[1].value,1);assert.equal(sketch.points[0].x,10);
 assert.throws(()=>pierceSketchToHelix({...sketch,offset:1},'anchor',helix),/does not cross/);
 const graph=buildDependencyGraph({features:[{id:'sweep',params:{sketchId:'profile'}},{id:'helix'}],sketches:[{...sketch,pierce:{featureId:'helix'}}]});assert.deepEqual(graph.order.map(f=>f.id),['helix','sweep']);
});
