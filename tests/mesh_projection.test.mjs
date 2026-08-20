import test from "node:test";
import assert from "node:assert/strict";

import { meshFeatureEdges, projectMeshEdges } from "../js/core/mesh_projection.js";
import { createDrawingSvg } from "../js/cad_drawings.js";

test("direct mesh projection keeps the outline and removes triangulation diagonals",()=>{
  const mesh={positions:[
    -1,0,-1, -1,0,1, 1,0,1,
    -1,0,-1, 1,0,1, 1,0,-1,
  ]};
  const projection=projectMeshEdges(mesh,"top");
  assert.equal(projection.type,"segments");
  assert.equal(projection.segments.length,4);
  assert.deepEqual(projection.bounds,{u0:-1,u1:1,v0:-1,v1:1});
  assert.equal(projection.segments.some(({a,b})=>a.u!==b.u&&a.v!==b.v),false);
});

test("direct mesh projection preserves inner and outer boundaries",()=>{
  const positions=[],steps=8;
  for(let index=0;index<steps;index++){
    const a=index*Math.PI*2/steps,b=(index+1)*Math.PI*2/steps;
    const oa=[Math.cos(a)*2,0,Math.sin(a)*2],ob=[Math.cos(b)*2,0,Math.sin(b)*2];
    const ia=[Math.cos(a),0,Math.sin(a)],ib=[Math.cos(b),0,Math.sin(b)];
    positions.push(...ia,...ob,...oa,...ia,...ib,...ob);
  }
  const projection=projectMeshEdges({positions},"top");
  assert.equal(projection.segments.length,steps*2);
  assert.equal(projection.segments.some(({a,b})=>Math.hypot(a.u,a.v)<.5||Math.hypot(b.u,b.v)<.5),false);
});

function boxPositions(x0,x1,y0,y1,z0,z1){
  const quad=(a,b,c,d)=>[...a,...b,...c,...a,...c,...d];
  return [
    ...quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]),
    ...quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]),
    ...quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]),
    ...quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]),
    ...quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]),
    ...quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]),
  ];
}

function cylinderPositions(radius, height, steps){
  const positions=[];
  for(let i=0;i<steps;i++){
    const a0=i*Math.PI*2/steps,a1=(i+1)*Math.PI*2/steps;
    const x0=Math.cos(a0)*radius,z0=Math.sin(a0)*radius,x1=Math.cos(a1)*radius,z1=Math.sin(a1)*radius;
    positions.push(x0,0,z0, x1,0,z1, x1,height,z1, x0,0,z0, x1,height,z1, x0,height,z0);
    positions.push(0,0,0, x1,0,z1, x0,0,z0);
    positions.push(0,height,0, x0,height,z0, x1,height,z1);
  }
  return positions;
}

test("mesh feature edges keep a box's twelve ribs and no interior diagonals",()=>{
  const edges=meshFeatureEdges({positions:boxPositions(-10,10,0,20,-5,5)});
  assert.equal(edges.circles.length,0);
  assert.equal(edges.polylines.length,12);
  assert.equal(edges.polylines.every((edge)=>edge.points.length===2),true);
});

test("a tessellated cylinder rim is one circular edge, not a chord per facet",()=>{
  const edges=meshFeatureEdges({positions:cylinderPositions(8,12,24)});
  assert.equal(edges.circles.length,2);
  assert.equal(edges.circles.every((circle)=>circle.closed),true);
  assert.ok(edges.circles.every((circle)=>Math.abs(circle.radius-8)<0.25));
  assert.equal(edges.polylines.length,0);
});

test("cylinder walls still expose two circular rims and no axis through empty space",()=>{
  const positions=[],radius=4,steps=20,height=6;
  for(let i=0;i<steps;i++){
    const a0=i*Math.PI*2/steps,a1=(i+1)*Math.PI*2/steps;
    const x0=Math.cos(a0)*radius,z0=Math.sin(a0)*radius,x1=Math.cos(a1)*radius,z1=Math.sin(a1)*radius;
    positions.push(x0,0,z0, x1,0,z1, x1,height,z1, x0,0,z0, x1,height,z1, x0,height,z0);
  }
  const edges=meshFeatureEdges({positions});
  assert.equal(edges.circles.length,2);
  assert.equal(edges.circles.every((circle)=>circle.closed),true);
  assert.ok(edges.circles.every((circle)=>Math.abs(circle.radius-radius)<0.3));
  assert.equal(edges.polylines.some((edge)=>{
    const a=edge.points[0],b=edge.points[edge.points.length-1];
    const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2};
    return Math.hypot(mid.x,mid.z)<1 && Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>height*0.8;
  }), false);
});

test("drawing SVG uses direct mesh contours instead of generic view rectangles",()=>{
  const meshData={positions:[
    -1,0,-1, -1,0,1, 1,0,1,
    -1,0,-1, 1,0,1, 1,0,-1,
  ]};
  const svg=createDrawingSvg({name:"Imported part",parts:[{kind:"direct",meshData}]});
  assert.match(svg,/<path class="shape" d="M/);
  assert.match(svg,/>TOP<\/text>/);
  assert.doesNotMatch(svg,/<text class="title"[^>]*>Untitled part<\/text>/);
});
