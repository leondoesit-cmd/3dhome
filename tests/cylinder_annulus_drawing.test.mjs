import test from 'node:test';
import assert from 'node:assert/strict';
import { polygonArea, triangulatePolygon, tessellateParts } from '../js/core/part_tessellate.js';
import { projectSolid } from '../js/core/hidden_line.js';

const ring = (radius, count, u=0, v=0) => Array.from({length:count},(_,i)=>({u:u+radius*Math.cos(i*2*Math.PI/count),v:v+radius*Math.sin(i*2*Math.PI/count)}));
const cylinder = () => ({id:'fresh-cylinder',kind:'ext',axis:'z',from:0,to:5.08,pts:ring(1.905,26),holes:[ring(.79375,17)]});
const sumArea = triangles => triangles.reduce((sum,triangle)=>sum+polygonArea(triangle),0);

test('unequal tessellation annulus has complete positive cap triangles without filling its bore',()=>{
  const part=cylinder(), triangles=triangulatePolygon(part.pts,part.holes);
  const expected=Math.abs(polygonArea(part.pts))-Math.abs(polygonArea(part.holes[0]));
  assert.ok(Math.abs(sumArea(triangles)-expected)<1e-10);
  assert.equal(triangles.length,43);
  assert.ok(triangles.every(triangle=>polygonArea(triangle)>0));
  // A dense radial sample inside the bore must never belong to a cap triangle.
  const cross=(a,b,p)=>(b.u-a.u)*(p.v-a.v)-(b.v-a.v)*(p.u-a.u);
  for(const point of ring(.7,40).concat({u:0,v:0})) {
    assert.ok(!triangles.some(([a,b,c])=>cross(a,b,point)>1e-10 && cross(b,c,point)>1e-10 && cross(c,a,point)>1e-10));
  }
});

test('nine separate circular holes retain full material cap area',()=>{
  const outer=[{u:-6,v:-1},{u:6,v:-1},{u:6,v:1},{u:-6,v:1}];
  const holes=Array.from({length:9},(_,i)=>ring(.24,17,i-4));
  assert.ok(Math.abs(sumArea(triangulatePolygon(outer,holes))-(24-holes.reduce((sum,hole)=>sum+polygonArea(hole),0)))<1e-9);
});

test('front annulus drawing contains only the two visible analytic rims, with no cap diagonals',()=>{
  const projection=projectSolid(tessellateParts([cylinder()]),'front',{shaded:true});
  assert.equal(projection.visible.length,0);
  assert.equal(projection.hidden.length,0);
  const circles=projection.circles.filter(circle=>circle.drawn==='visible');
  assert.equal(circles.length,2);
  assert.deepEqual(circles.map(circle=>Number(circle.radius.toFixed(5))).sort(),[.79375,1.905]);
  assert.equal(projection.circles.filter(circle=>circle.drawn==='hidden').length,0);
  assert.equal(projection.surfaces.length,43);
  const area=projection.surfaces.reduce((sum,surface)=>sum+Math.abs(polygonArea(surface.points)),0);
  assert.ok(Math.abs(area-sumArea(triangulatePolygon(cylinder().pts,cylinder().holes)))<1e-9);
});

test('coarse bore facets produce exactly two full-length hidden silhouettes at the fitted radius',()=>{
  const projection=projectSolid(tessellateParts([cylinder()]),'right');
  assert.equal(projection.visible.length,4);
  assert.equal(projection.hidden.length,2);
  for(const segment of projection.hidden) {
    assert.ok(Math.abs(segment.a.v-segment.b.v)<1e-10);
    assert.ok(Math.abs(Math.abs(segment.a.v)-.79375)<1e-10);
    assert.ok(Math.abs(Math.abs(segment.a.u-segment.b.u)-5.08)<1e-10);
  }
});

test('ordinary sharp rectangular edges are still projected',()=>{
  const projection=projectSolid(tessellateParts([{kind:'box',x0:0,x1:4,y0:0,y1:3,z0:0,z1:2}]),'iso');
  assert.equal(projection.visible.length,9);
  assert.equal(projection.hidden.length,3);
});
