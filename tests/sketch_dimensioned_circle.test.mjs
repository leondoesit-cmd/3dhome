import test from 'node:test';
import assert from 'node:assert/strict';
import {addDimensionedCircle} from '../js/sketch_dimensioned_circle.js';
import {solveSketch} from '../js/sketch_solver.js';
import {analyzeSketchProfiles} from '../js/sketch_profiles.js';
import {featureAreas,sketchRegions} from '../js/sketch_regions.js';

test('dimensioned circle is fully defined on its existing datum and resizes after JSON reopen',()=>{
 let serial=0;
 const sketch={id:'right-hole',plane:'right',offset:1.6,points:[],entities:[],constraints:[]};
 const [circle]=addDimensionedCircle(sketch,{diameter:2.02,x:0,y:3.4},()=>++serial);
 assert.equal(solveSketch(sketch).status,'fully-constrained');
 assert.equal(analyzeSketchProfiles(sketch).profiles.length,1);
 const restored=JSON.parse(JSON.stringify(sketch));
 restored.constraints.find(constraint=>constraint.type==='diameter').value=.66;
 const result=solveSketch(restored);
 assert.equal(result.degreesOfFreedom,0);
 assert.ok(Math.abs(restored.entities.find(entity=>entity.id===circle.id).r-.33)<1e-7);
 assert.deepEqual(restored.points[0],sketch.points[0]);
 assert.equal(restored.plane,'right');
 assert.equal(restored.offset,1.6);
});

test('unfixed dimensioned center retains exactly two translation freedoms without changing diameter',()=>{
 let serial=0;
 const sketch={points:[],entities:[],constraints:[]};
 addDimensionedCircle(sketch,{diameter:.6,x:3,y:-2,fixCenter:false},()=>++serial);
 assert.equal(solveSketch(sketch).degreesOfFreedom,2);
 const center=sketch.points[0];center.x=8;center.y=4;center.fixed=true;
 assert.ok(solveSketch(sketch).converged);
 center.fixed=false;
 assert.ok(Math.abs(sketch.entities[0].r-.3)<1e-7);
 assert.ok(Math.abs(center.x-8)<1e-7&&Math.abs(center.y-4)<1e-7);
});

test('two independently dimensioned concentric circles remain an annular profile',()=>{
 let serial=0;
 const sketch={points:[],entities:[],constraints:[]};
 addDimensionedCircle(sketch,{diameter:4.5,x:0,y:1},()=>++serial);
 addDimensionedCircle(sketch,{diameter:4.2,x:0,y:1},()=>++serial);
 assert.equal(solveSketch(sketch).degreesOfFreedom,0);
 const areas=featureAreas(analyzeSketchProfiles(sketch),sketchRegions(sketch));
 const annulus=areas.find(area=>area.holes.length===1);
 assert.ok(annulus,'native contour choices include the annulus');
 assert.deepEqual(annulus.entityIds,[sketch.entities[0].id]);
 assert.deepEqual(annulus.holeEntityIds,[[sketch.entities[1].id]]);
});

test('invalid circle input is rejected before allocating IDs or changing sketch history',()=>{
 const sketch={points:[],entities:[],constraints:[]};
 for(const values of [{diameter:0},{diameter:-1},{diameter:NaN},{diameter:Infinity},{diameter:1,x:NaN},{diameter:1,y:Infinity}]){
  assert.throws(()=>addDimensionedCircle(sketch,values,()=>{throw Error('ID allocation must not occur');}),/diameter|center/);
  assert.deepEqual(sketch,{points:[],entities:[],constraints:[]});
 }
});
