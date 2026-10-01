import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectInterference } from "../js/cad_interference.js";
import { disposeBrep, makeBrepPrimitive } from "../js/cad_kernel.js";

test("overlapping envelopes are not reported as solid interference when exact bodies are available", async () => {
  const a=await makeBrepPrimitive({type:"cylinder",axis:"z",x:0,y:0,z:0,r:1,h:2});
  const b=await makeBrepPrimitive({type:"cylinder",axis:"z",x:1.5,y:1.5,z:0,r:1,h:2});
  const boundsA={x0:-1,x1:1,y0:-1,y1:1,z0:0,z1:2};
  const boundsB={x0:.5,x1:2.5,y0:.5,y1:2.5,z0:0,z1:2};
  try {
    const candidates=await detectInterference([{id:"a",bounds:boundsA},{id:"b",bounds:boundsB}]);
    assert.equal(candidates.length,1);
    assert.equal(candidates[0].exact,false);
    assert.equal((await detectInterference([{id:"a",bounds:boundsA,brep:a},{id:"b",bounds:boundsB,brep:b}])).length,0);
  } finally {disposeBrep(a);disposeBrep(b);}
});

test("exact interference reports measured material volume", async () => {
  const a=await makeBrepPrimitive({type:"box",w:2,h:2,d:2});
  const b=await makeBrepPrimitive({type:"box",x:1,w:2,h:2,d:2});
  try {
    const hits=await detectInterference([{id:"a",brep:a},{id:"b",brep:b}]);
    assert.equal(hits.length,1);
    assert.equal(hits[0].exact,true);
    assert.ok(Math.abs(hits[0].volume-4)<1e-6);
  } finally {disposeBrep(a);disposeBrep(b);}
});

test("Evaluate rebuilds and places exact component bodies before checking", async () => {
  const source=await readFile(new URL("../js/modeler.js",import.meta.url),"utf8");
  const start=source.indexOf("async function exactInterferenceBrep(");
  const end=source.indexOf("\n/* A general-arrangement sheet",start);
  const check=source.slice(start,end);
  assert.match(check,/compileKernelFeatureTree\(def\)/);
  assert.match(check,/regenerateFeatures\(/);
  assert.match(check,/placeBrep\(run\.finalShape/);
  assert.match(check,/detectInterference\(measured,\{signal:job\.controller\.signal,onProgress:/);
  assert.match(check,/interferenceInCadWorker\(requests,\{signal:job\.controller\.signal,onProgress:/);
  assert.match(check,/placed\.forEach\(disposeBrep\)/);
});
