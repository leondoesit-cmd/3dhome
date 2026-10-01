import test from "node:test";
import assert from "node:assert/strict";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";
import { regenerateFeatures, releaseRegeneration, resolveSketchExtrusion } from "../js/cad_feature_tree.js";
import { brepContainsPoint, shapeMassProperties } from "../js/cad_kernel.js";

const circle = (id, x, radius = 3) => ({ id, type:"circle", c:id+":centre", r:radius });

function document() {
  const sketch = {
    id:"holes", name:"Two hole centres", plane:"top", offset:20,
    points:[{id:"left:centre",x:-8,y:0},{id:"right:centre",x:8,y:0}],
    entities:[circle("left",-8),circle("right",8)], constraints:[],
  };
  return {
    id:"two-hole-cut", kind:"part", sketches:[sketch],
    features:[
      {id:"base",name:"Base",type:"box",inputs:[],references:{topology:[]},params:{x:-20,y:0,z:-20,w:40,h:20,d:40}},
      {id:"cut",name:"Two holes",type:"extrudeCut",inputs:["base"],
        references:{sketches:["holes"],features:["base"],topology:[],profileEntityIds:["left"]},
        params:{sketchId:"holes",profileEntityIds:["left"],regionProfileEntityIds:[["right"]],
          axis:"y",from:20,to:0,depth:20,direction:"reverse",endCondition:"through-all",operation:"subtract"}},
    ],
  };
}

async function exactRun(def) {
  const compiled = compileKernelFeatureTree(def);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run = await regenerateFeatures({...compiled.document,features:compiled.features});
  return run;
}

test("one associative cut feature removes two disjoint circles and follows both sketch edits", async () => {
  const def = document();
  assert.equal(def.features.filter(feature=>feature.type==="extrudeCut").length,1);
  const resolved = resolveSketchExtrusion(def,def.features[1].params);
  assert.equal(resolved.regions.length,1);
  assert.equal(resolved.regions[0].segments[0].type,"circle");
  let run = await exactRun(def);
  try {
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const body = run.finalShape;
    assert.equal(brepContainsPoint(body,{x:-8,y:10,z:0}),false);
    assert.equal(brepContainsPoint(body,{x:8,y:10,z:0}),false);
    assert.equal(brepContainsPoint(body,{x:0,y:10,z:0}),true);
    const mass = await shapeMassProperties(body);
    assert.ok(Math.abs(mass.volume-(40*20*40-2*Math.PI*3*3*20))<2,mass.volume);
  } finally { releaseRegeneration(run); }

  def.sketches[0].entities[1].r=4;
  run = await exactRun(def);
  try {
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    assert.equal(brepContainsPoint(run.finalShape,{x:11.5,y:10,z:0}),false,
      "the second hole follows its edited circle instead of a frozen profile");
    assert.equal(brepContainsPoint(run.finalShape,{x:-11.5,y:10,z:0}),true,
      "the first hole keeps its original radius");
  } finally { releaseRegeneration(run); }
});
