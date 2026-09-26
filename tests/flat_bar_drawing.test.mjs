import test from "node:test";
import assert from "node:assert/strict";
import { booleanBrep, disposeBrep, makeBrepExtrusion, shapeToMeshData } from "../js/cad_kernel.js";
import { projectSolid, projectionBounds } from "../js/core/hidden_line.js";

test("orthographic extents use kernel bounds rather than tessellation extrema", () => {
  const body={positions:[-5.713,-.635,0,5.713,-.635,0,5.713,.635,0],exactBounds:{min:{x:-5.715,y:-.635,z:0},max:{x:5.715,y:.635,z:.1524}}};
  const bounds=projectionBounds(projectSolid([body],"front"));
  assert.ok(Math.abs((bounds.u1-bounds.u0)/2.54-4.5)<1e-12);
  assert.equal(projectSolid([body],"iso").exactBounds,null);
});

test("dense circular rims survive line simplification at the scale of a long part", () => {
  const positions=[];
  for(let hole=0;hole<9;hole++) for(let i=0;i<128;i++) {
    const a=i*Math.PI/64,b=(i+1)*Math.PI/64,x=-5.08+hole*1.27,r=.2413;
    const p=[x+r*Math.cos(a),r*Math.sin(a),0],q=[x+r*Math.cos(b),r*Math.sin(b),0];
    const t=[p[0],p[1],.1524],s=[q[0],q[1],.1524];
    positions.push(...p,...q,...s,...p,...s,...t);
  }
  const projection=projectSolid([{positions}],"front");
  const centres=new Set(projection.circles.filter(c=>c.drawn==="visible").map(c=>c.u.toFixed(3)));
  assert.equal(centres.size,9);
});

test("small drilled holes remain inked in a long flat-bar drawing", async () => {
  const owned = [];
  try {
    let body = await makeBrepExtrusion({axis:"z",from:0,to:.1524,points:[{u:-5.715,v:-.635},{u:5.715,v:-.635},{u:5.715,v:.635},{u:-5.715,v:.635}]});
    owned.push(body);
    for(let i=0;i<9;i++) {
      const points = Array.from({length:64},(_,j)=>({u:-5.08+i*1.27+.2413*Math.cos(j*Math.PI/32),v:.2413*Math.sin(j*Math.PI/32)}));
      const tool = await makeBrepExtrusion({axis:"z",from:-.1,to:.3,points}); owned.push(tool);
      body = await booleanBrep("subtract",body,tool); owned.push(body);
    }
    const mesh = await shapeToMeshData(body, {angle:.08});
    mesh.positions = new Float32Array(mesh.positions);
    const projection = projectSolid([mesh],"front");
    const rims = projection.circles.filter(c=>c.kind==="round" && Math.abs(c.radius-.2413)<1e-4 && c.drawn==="visible");
    const centres = new Set(rims.map(c=>c.u.toFixed(3)));
    assert.equal(centres.size,9,"all nine holes must have visible circular outlines, not only centre marks");
  } finally { owned.reverse().forEach(disposeBrep); }
});
