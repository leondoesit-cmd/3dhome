import test from 'node:test';
import assert from 'node:assert/strict';
import {sketchDiagnostics} from '../js/core/rebuild.js';

test('a converted loft end face belongs to the canonical loft tool',()=>{
 const sketch={id:'battery',name:'Battery profile',plane:'front',frameSpace:'local',frame:{origin:{x:0,y:0,z:-3.302},normal:{x:0,y:0,z:-1},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:-1,z:0}},support:{type:'topology-reference',ownerFeatureId:'loft:tool',persistentId:'loft:tool:face:generated:plane:1'},points:[{id:1,x:0,y:0,fixed:true}],entities:[{id:2,type:'circle',c:1,r:1}],constraints:[]};
 const definition={features:[{id:'loft',type:'loft'}],sketches:[sketch],references:[],parameters:{}};
 assert.equal(sketchDiagnostics(definition,{}).issues.some(issue=>issue.code==='missing-sketch-support-feature'),false);
 sketch.support.ownerFeatureId='missing:tool';
 assert.equal(sketchDiagnostics(definition,{}).issues.some(issue=>issue.code==='missing-sketch-support-feature'),true);
});
