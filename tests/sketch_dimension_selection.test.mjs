import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensionTargetFromSelection} from '../js/core/sketch_dimension_selection.js';
import {solveSketch} from '../js/sketch_solver.js';
import {addSmartDimension,currentMeasure} from '../js/sketch_dimensions.js';

const sketch={
 points:[
  {id:'o',x:0,y:0},{id:'a',x:-8.2,y:0},
  {id:'b',x:0,y:3},{id:'c',x:-8.2,y:3},{id:'d',x:2,y:2},
 ],
 entities:[
  {id:'axis',type:'line',a:'o',b:'a',construction:true},
  {id:'parallel',type:'line',a:'b',b:'c'},
  {id:'angled',type:'line',a:'o',b:'d'},
  {id:'circle',type:'circle',c:'o',r:2},
 ],
};

test('a list-selected construction line becomes its length dimension without a canvas re-pick',()=>{
 assert.deepEqual(dimensionTargetFromSelection(sketch,[sketch.entities[0]]),{type:'line',id:'axis'});
});

test('selection-first dimensioning covers exact point and line combinations',()=>{
 assert.deepEqual(dimensionTargetFromSelection(sketch,[sketch.points[1],sketch.points[4]]),{type:'points',a:'a',b:'d'});
 assert.deepEqual(dimensionTargetFromSelection(sketch,[sketch.points[4],sketch.entities[0]]),{type:'pointLine',point:'d',line:'axis'});
 assert.equal(dimensionTargetFromSelection(sketch,[sketch.points[0],sketch.entities[0]]),null,'a line endpoint is not a useful point-to-line dimension');
 assert.deepEqual(dimensionTargetFromSelection(sketch,[sketch.entities[0],sketch.entities[1]]),{type:'lines',a:'axis',b:'parallel'});
 assert.deepEqual(dimensionTargetFromSelection(sketch,[sketch.entities[0],sketch.entities[2]]),{type:'angle',a:'axis',b:'angled'});
 assert.deepEqual(dimensionTargetFromSelection(sketch,[sketch.entities[3]]),{type:'circle',id:'circle'});
});

test('the Right Plane construction line closes its last DOF through the selection-first request',()=>{
 const rightPlane={
  points:[{id:'origin',x:0,y:0},{id:'end',x:-8.2,y:0}],
  entities:[{id:31,type:'line',a:'origin',b:'end',construction:true}],
  constraints:[
   {id:'fixed',type:'fixed',point:'origin',x:0,y:0},
   {id:'horizontal',type:'horizontal',entity:31},
  ],
 };
 assert.equal(solveSketch(rightPlane).degreesOfFreedom,1);
 const target=dimensionTargetFromSelection(rightPlane,[rightPlane.entities[0]]);
 addSmartDimension(rightPlane,target,currentMeasure(rightPlane,target));
 const solved=solveSketch(rightPlane);
 assert.equal(solved.converged,true);
 assert.equal(solved.degreesOfFreedom,0);
 assert.equal(rightPlane.constraints.at(-1).value,8.2);
});
