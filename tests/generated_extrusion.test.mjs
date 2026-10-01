import test from "node:test";
import assert from "node:assert/strict";
import {generatedRackGear} from "../js/cad_gear_geometry.js";
import {createPartDocument, createFeatureDefinition, createSketchDefinition, analyzeParametricHistory} from "../js/core/parametric_document.js";
import {registerGeneratedExtrusion} from "../js/core/generated_extrusion.js";
import {compileKernelFeatureTree} from "../js/core/kernel_feature_adapter.js";
import {solveSketch,resolveProfilePoints,ensureSketchDoc} from "../js/sketch_solver.js";

test("a fresh Toolbox gear is an exact base that a subsequent bore can consume",()=>{
  const document=createPartDocument({name:"Gear"}), outline=generatedRackGear({moduleMm:2,teeth:20,backlashMm:.2});
  const part={id:1,kind:"ext",name:"20 tooth gear",axis:"y",from:0,to:.8,pts:outline.points,holes:[],standardCompliance:outline.spec};
  ensureSketchDoc(document);
  const base=registerGeneratedExtrusion(document,part);document.parts.push(part);
  assert.equal(document.sketches.length,1,"the untouched startup sketch cannot become an extra history item on reopen");
  assert.equal(solveSketch(document.sketches[0]).degreesOfFreedom,0,"generated curve has no free coordinates or dense Fix matrix");
  const resolved=resolveProfilePoints(document.sketches[0],part.profileEntityIds);
  assert.ok(resolved,"dense outline remains a closed profile rather than collapsing under manual healing distance");
  assert.equal(resolved.length,part.pts.length);
  const bore=createSketchDefinition(document,{referenceId:"plane:top",points:[{id:"c",x:0,y:0}],entities:[{id:"bore",type:"circle",c:"c",r:.45}]});
  bore.plane="top";
  createFeatureDefinition(document,"extrudeCut",{inputs:[base.id],references:{sketches:[bore.id],features:[base.id]},params:{axis:"y",depth:1,profileEntityIds:["bore"],sketchId:bore.id}});
  const result=compileKernelFeatureTree(document);
  assert.equal(result.ok,true,JSON.stringify(result.issues));
  assert.equal(analyzeParametricHistory(document).ok,true);
  assert.equal(part.featureId,base.id);
  assert.equal(document.history.length,4);
  assert.equal(result.features.at(-1).inputs[0],base.id);
  assert.ok(result.features.find(feature=>feature.id===base.id).params.points.length>100,"exact geometry retains the generated tooth outline");
  outline.points[0].u+=10;assert.notEqual(base.params.points[0].u,outline.points[0].u,"history owns its outline copy");
});

test("invalid Toolbox extrusion cannot leave a partial history entry",()=>{
  const document=createPartDocument();
  assert.throws(()=>registerGeneratedExtrusion(document,{kind:"ext",pts:[{},{}],from:0,to:1}),/closed outline/);
  assert.throws(()=>registerGeneratedExtrusion(document,{kind:"ext",pts:[{},{},{}],from:0,to:0}),/positive depth/);
  assert.equal(document.features.length,0);assert.equal(document.history.length,0);
});

test("rack outline compaction bounds error and preserves root, junction and tip",()=>{
  for(const teeth of [10,20,40]){
    const spec={moduleMm:2,teeth,backlashMm:.2,allowUndercut:true};
    const dense=generatedRackGear({...spec,outlineSimplificationMm:0}),compact=generatedRackGear(spec);
    assert.ok(compact.points.length<dense.points.length/2);
    const distance=(p,a,b)=>{const dx=b.u-a.u,dy=b.v-a.v,s=dx*dx+dy*dy,t=s?Math.max(0,Math.min(1,((p.u-a.u)*dx+(p.v-a.v)*dy)/s)):0;return Math.hypot(p.u-a.u-t*dx,p.v-a.v-t*dy);};
    for(const point of dense.points){
      let nearest=Infinity;
      for(let i=0;i<compact.points.length;i++)nearest=Math.min(nearest,distance(point,compact.points[i],compact.points[(i+1)%compact.points.length]));
      assert.ok(nearest*10<=compact.outlineSimplificationMm+1e-9,"no dense reference sample exceeds the stated 2µm additional error");
    }
    for(const radius of [dense.spec.rf,dense.rootJoinRadiusMm,dense.spec.ra]){
      const landmarks=dense.points.filter(p=>Math.abs(Math.hypot(p.u,p.v)*10-radius)<1e-9);
      for(const landmark of landmarks)assert.ok(compact.points.some(p=>Math.hypot(p.u-landmark.u,p.v-landmark.v)<1e-10),"tooth landmark retained");
    }
    assert.equal(compact.estimatedChordErrorMm,dense.estimatedChordErrorMm+compact.outlineSimplificationMm);
  }
});
