import test from "node:test";
import assert from "node:assert/strict";

import { projectMeshEdges } from "../js/core/mesh_projection.js";
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
