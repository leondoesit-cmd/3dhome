import test from "node:test";
import assert from "node:assert/strict";

import { meshFeatureEdges, meshSmoothFaces, projectMeshEdges } from "../js/core/mesh_projection.js";
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
  // the plate's four edges, inked as outlines — not the envelope rectangle a
  // view it could not project used to fall back to
  assert.equal((svg.match(/<line [^>]*stroke-width="0.5"/g) || []).length >= 4, true);
  assert.match(svg,/>TOP<\/text>/);
  assert.match(svg,/Imported part/);
  assert.doesNotMatch(svg,/Untitled part/);
});

test("a tessellated cylinder wall is one smooth face, not a stave per facet", () => {
  const grouped = meshSmoothFaces({ positions: cylinderPositions(8, 12, 24) });
  const cylinders = grouped.faces.filter((face) => face.descriptor.surface === "cylinder");
  const planes = grouped.faces.filter((face) => face.descriptor.surface === "plane");
  assert.equal(cylinders.length, 1);
  assert.ok(cylinders[0].triangles.length >= 24);
  assert.equal(planes.length, 2);
  assert.ok(Math.abs(cylinders[0].descriptor.radius - 8) < 0.35);
  const sideTriangle = 0;
  const sameWall = grouped.faceOfTriangle[sideTriangle];
  assert.equal(grouped.faces[sameWall].descriptor.surface, "cylinder");
  // each stave is two wall triangles, then a bottom cap and a top cap
  assert.equal(grouped.faceOfTriangle[1], sameWall);
  assert.equal(grouped.faceOfTriangle[4], sameWall);
});

test("a 16-point extruded circle is still one wall at a small radius", () => {
  const grouped = meshSmoothFaces({ positions: cylinderPositions(3, 10, 16) });
  const cylinders = grouped.faces.filter((face) => face.descriptor.surface === "cylinder");
  assert.equal(cylinders.length, 1);
  assert.equal(grouped.faceOfTriangle[0], grouped.faceOfTriangle[4]);
  assert.ok(cylinders[0].triangles.length >= 32);
});

test("a tessellated sphere is one pickable face", () => {
  const radius = 6, slices = 16, stacks = 10, positions = [];
  const vert = (s, t) => {
    const lat = (t / stacks - 0.5) * Math.PI;
    const lon = (s / slices) * Math.PI * 2;
    return [
      Math.cos(lat) * Math.cos(lon) * radius,
      Math.sin(lat) * radius,
      Math.cos(lat) * Math.sin(lon) * radius,
    ];
  };
  for (let t = 0; t < stacks; t++) for (let s = 0; s < slices; s++) {
    const a = vert(s, t), b = vert(s + 1, t), c = vert(s + 1, t + 1), d = vert(s, t + 1);
    if (t !== 0) positions.push(...a, ...b, ...c);
    if (t !== stacks - 1) positions.push(...a, ...c, ...d);
  }
  const grouped = meshSmoothFaces({ positions });
  const spheres = grouped.faces.filter((face) => face.descriptor.surface === "sphere");
  assert.equal(spheres.length, 1);
  assert.equal(grouped.faces.length, 1);
  assert.ok(Math.abs(spheres[0].descriptor.radius - radius) < 0.25);
  assert.equal(grouped.faceOfTriangle[0], grouped.faceOfTriangle[grouped.faceOfTriangle.length - 1]);
});

test("a box still splits into six planar faces", () => {
  const grouped = meshSmoothFaces({ positions: boxPositions(-10, 10, 0, 20, -5, 5) });
  const planes = grouped.faces.filter((face) => face.descriptor.surface === "plane");
  assert.equal(planes.length, 6);
  assert.equal(grouped.faces.some((face) => face.descriptor.surface === "cylinder" || face.descriptor.surface === "sphere"), false);
});
