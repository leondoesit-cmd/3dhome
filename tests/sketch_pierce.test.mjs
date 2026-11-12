import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {pierceSketchToHelix} from '../js/core/sketch_pierce.js';
import {buildDependencyGraph} from '../js/core/dependency_graph.js';
import {readFileSync} from 'node:fs';
import {bindPierceTargets} from '../js/sketch_intersection.js';
import {sketchWorldPoint} from '../js/core/swept_sources.js';
test('Pierce picker exposes crossing circles and their target follows a driving radius edit',()=>{
 const sketch={id:'profile',plane:'top',points:[],entities:[],constraints:[]};
 const circle={id:7,type:'circle',c:8,r:5};
 const path={id:'path',name:'Front path',plane:'front',points:[{id:8,x:0,y:0}],entities:[circle,{id:9,type:'circle',c:8,r:1,construction:true}]};
 const text=modelerSource();
 const begin=text.indexOf('var sketchCurves=[];'),end=text.indexOf('if(!anchor ||',begin);
 const candidates=Function('E','sketch','bindPierceTargets','sketchWorldPoint',text.slice(begin,end)+'return sketchCurves;')({def:{sketches:[sketch,path]}},sketch,bindPierceTargets,sketchWorldPoint);
 assert.deepEqual(candidates.map(c=>c.entityId),[7]);
 sketch.constraints=[{type:'pierce',point:1,sketchId:'path',entityId:7}];
 bindPierceTargets(sketch,[path],sketchWorldPoint);
 assert.ok(Math.abs(sketch.constraints[0].x-5)<1e-9);assert.ok(Math.abs(sketch.constraints[0].y)<1e-9);
 circle.r=5.1;bindPierceTargets(sketch,[path],sketchWorldPoint);
 assert.ok(Math.abs(sketch.constraints[0].x-5.1)<1e-9);
});
test('a pierced profile translates with the path while preserving dimensions and fixed constraints',()=>{
 const sketch={id:'profile',plane:'top',points:[{id:'anchor',x:10,y:20},{id:'b',x:11,y:20}],entities:[],constraints:[{type:'fixed',point:'anchor',x:10,y:20},{type:'distance',value:1}]};
 const helix={origin:{x:0,y:0,z:-3.2385},axis:{x:0,y:0,z:1},radius:6.223876,pitch:.635,turns:2.5,height:1.5875};
 const next=pierceSketchToHelix(sketch,'anchor',helix);assert.ok(Math.abs(next.points[0].x+6.223876)<1e-9);assert.ok(Math.abs(next.points[0].y+3.2385)<1e-9);assert.equal(next.points[1].x-next.points[0].x,1);assert.equal(next.constraints[0].x,next.points[0].x);assert.equal(next.constraints[1].value,1);assert.equal(sketch.points[0].x,10);
 assert.throws(()=>pierceSketchToHelix({...sketch,offset:1},'anchor',helix),/does not cross/);
 const graph=buildDependencyGraph({features:[{id:'sweep',params:{sketchId:'profile'}},{id:'helix'}],sketches:[{...sketch,pierce:{featureId:'helix'}}]});assert.deepEqual(graph.order.map(f=>f.id),['helix','sweep']);
});
