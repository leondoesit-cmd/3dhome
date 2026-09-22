import test from 'node:test';
import assert from 'node:assert/strict';
import {threePointArc, radialArcEndpoint} from '../js/sketch_three_point_arc.js';
import {healSketchEndpoints} from '../js/sketch_profiles.js';
import {solveSketch} from '../js/sketch_solver.js';

test('centre-point arc keeps a coincident snapped endpoint without adopting an off-circle vertex',()=>{
  const centre={u:0,v:0},start={u:1.5,v:0};
  const snapped={u:-1.5,v:0,pointId:'existing-end'};
  assert.equal(radialArcEndpoint(centre,start,snapped),snapped);
  const offCircle=radialArcEndpoint(centre,start,{u:-3,v:0,pointId:'off-circle'});
  assert.equal(offCircle.pointId,undefined);
  assert.ok(Math.abs(Math.hypot(offCircle.u,offCircle.v)-1.5)<1e-12);
});

test('three-point arc preserves snapped endpoints and selects the requested side',()=>{
  const start={u:-1,v:0,pointId:'left'},end={u:1,v:0,pointId:'right'};
  const upper=threePointArc(start,end,{u:0,v:1});
  assert.deepEqual(upper.centre,{u:0,v:0});
  assert.equal(upper.radius,1);
  assert.equal(upper.start,end);
  assert.equal(upper.end,start);
  const lower=threePointArc(start,end,{u:0,v:-1});
  assert.equal(lower.start,start);
  assert.equal(lower.end,end);
});
test('three-point arc handles translated dimensions and refuses degenerate input',()=>{
  const arc=threePointArc({u:100,v:210},{u:110,v:200},{u:106,v:208});
  assert.ok(Math.abs(arc.radius-10)<1e-9);
  assert.ok(Math.abs(arc.centre.u-100)<1e-9);
  assert.ok(Math.abs(arc.centre.v-200)<1e-9);
  assert.equal(threePointArc({u:0,v:0},{u:1,v:1},{u:2,v:2}),null);
  assert.equal(threePointArc({u:0,v:0},{u:0,v:0},{u:2,v:2}),null);
});
test('healing coincident anchored endpoints keeps a fully defined sketch',()=>{
  const sketch={points:[{id:'a',x:0,y:0},{id:'b',x:5,y:0},{id:'c',x:0,y:0},{id:'d',x:0,y:5}],
    entities:[{id:'h',type:'line',a:'a',b:'b'},{id:'v',type:'line',a:'c',b:'d'}],
    constraints:[{id:'f1',type:'fixed',point:'a',x:0,y:0},{id:'f2',type:'fixed',point:'c',x:0,y:0},
      {id:'h1',type:'horizontal',entity:'h'},{id:'v1',type:'vertical',entity:'v'},
      {id:'l1',type:'distance',a:'a',b:'b',value:5},{id:'l2',type:'distance',a:'c',b:'d',value:5}]};
  assert.equal(healSketchEndpoints(sketch,['h','v']),1);
  assert.equal(sketch.constraints.filter(c=>c.type==='fixed').length,1);
  assert.equal(solveSketch(sketch).status,'fully-constrained');
});
