import test from 'node:test';
import assert from 'node:assert/strict';
import {addDimensionedPolygon} from '../js/sketch_dimensioned_polygon.js';
import {solveSketch} from '../js/sketch_solver.js';
import {analyzeSketchProfiles} from '../js/sketch_profiles.js';

test('AF10 hexagon is fully defined with one native closed profile on its current datum',()=>{
  const sketch={id:'hex',plane:'right',offset:1.6,points:[],entities:[],constraints:[]};let serial=0;
  addDimensionedPolygon(sketch,{sides:6,diameter:1 / Math.cos(Math.PI / 6),rotation:0},()=>++serial);
  const result=solveSketch(sketch);
  assert.equal(result.status,'fully-constrained');assert.equal(result.redundant,false);
  const rim=sketch.points.slice(1);
  assert.ok(Math.abs(Math.max(...rim.map(p=>p.y))-Math.min(...rim.map(p=>p.y))-1)<1e-10);
  assert.equal(analyzeSketchProfiles(sketch).profiles.length,1);
  assert.equal(sketch.plane,'right');assert.equal(sketch.offset,1.6);
});

test('JSON reopen, driving diameter and undo restore a regular polygon without moving its fixed center',()=>{
  const original={plane:'top',offset:3.2,points:[],entities:[],constraints:[]};let serial=0;
  addDimensionedPolygon(original,{sides:6,diameter:2,x:4,y:-3,rotation:30},()=>++serial);
  const sketch=JSON.parse(JSON.stringify(original));sketch.constraints[0].value=3;
  assert.equal(solveSketch(sketch).degreesOfFreedom,0);
  for(const point of sketch.points.slice(1))assert.ok(Math.abs(Math.hypot(point.x-4,point.y+3)-1.5)<1e-7);
  assert.deepEqual(sketch.points[0],original.points[0]);
  const first=sketch.points[1];assert.ok(Math.abs(Math.atan2(first.y+3,first.x-4)-Math.PI/6)<1e-7);
  sketch.constraints[0].value=2;assert.ok(solveSketch(sketch).converged);
  for(let i=0;i<original.points.length;i++){
    assert.ok(Math.abs(sketch.points[i].x-original.points[i].x)<1e-7);
    assert.ok(Math.abs(sketch.points[i].y-original.points[i].y)<1e-7);
  }
});

test('center and rotation checkboxes release only their intended freedoms',()=>{
  for(const [fixCenter,fixRotation,dof] of [[true,false,1],[false,true,2],[false,false,3]]){
    const sketch={points:[],entities:[],constraints:[]};let serial=0;
    addDimensionedPolygon(sketch,{sides:5,diameter:2,fixCenter,fixRotation},()=>++serial);
    assert.equal(solveSketch(sketch).degreesOfFreedom,dof);
  }
});

test('all supported regular polygons retain driving size and orientation without redundant constraints',()=>{
  for(let sides=3;sides<=24;sides++){
    const sketch={points:[],entities:[],constraints:[]};let serial=0;
    addDimensionedPolygon(sketch,{sides,diameter:3,rotation:-47,x:2,y:5},()=>++serial);
    assert.equal(solveSketch(sketch).status,'fully-constrained',String(sides));
    sketch.constraints[0].value=3.2;assert.ok(solveSketch(sketch).converged,String(sides));
    for(const point of sketch.points.slice(1))assert.ok(Math.abs(Math.hypot(point.x-2,point.y-5)-1.6)<1e-7);
  }
});

test('large finite rotations normalize before constructing solver geometry',()=>{
  const sketch={points:[],entities:[],constraints:[]};let serial=0;
  addDimensionedPolygon(sketch,{diameter:2,rotation:1e308},()=>++serial);
  assert.equal(solveSketch(sketch).status,'fully-constrained');
});

test('invalid polygon input never allocates IDs or modifies the sketch',()=>{
  for(const values of [{diameter:0},{diameter:-1},{diameter:NaN},{diameter:Infinity},{diameter:1,sides:2},{diameter:1,sides:25},{diameter:1,sides:5.5},{diameter:1,x:NaN},{diameter:1,y:Infinity},{diameter:1,rotation:NaN},{diameter:1.7e308,x:1.7e308}]){
    const sketch={points:[],entities:[],constraints:[]};
    assert.throws(()=>addDimensionedPolygon(sketch,values,()=>{throw Error('ID allocation must not occur');}),/Polygon/);
    assert.deepEqual(sketch,{points:[],entities:[],constraints:[]});
  }
});
