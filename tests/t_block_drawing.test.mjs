import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBrepExtrusion,shapeToMeshData,disposeBrep} from '../js/cad_kernel.js';
import {projectSolid} from '../js/core/hidden_line.js';
test('T-section retains both flange shoulders in top projection',async()=>{
 const points=[[-.635,1.27],[-3.81,1.27],[-3.81,3.175],[3.81,3.175],[3.81,1.27],[.635,1.27],[.635,-3.175],[-.635,-3.175]].map(([u,v])=>({u,v}));
 const body=await makeBrepExtrusion({axis:'y',from:-2.2225,to:2.2225,points});
 try {
  const mesh=await shapeToMeshData(body);mesh.positions=new Float32Array(mesh.positions);
  const p=projectSolid([mesh],'top');
  for(const u of [-2,2]) assert.ok(p.visible.some(s=>Math.abs(s.a.v+1.27)<1e-4&&Math.abs(s.b.v+1.27)<1e-4&&Math.min(s.a.u,s.b.u)<=u&&Math.max(s.a.u,s.b.u)>=u),'shoulder at '+u);
 }finally{disposeBrep(body);}
});
