import assert from "node:assert/strict";
import test from "node:test";
import {findChrome,openPage} from "../tools/browser_harness.mjs";

test("merged countertop loft accepts its upper opening in the Shell panel", await findChrome()
  ? {timeout:240000} : {skip:"Chrome unavailable"}, async () => {
  const page = await openPage({width:1440,height:900});
  try {
    await page.waitForBoot();
    await page.eval(async () => {
      const {createPartDocument,createFeatureDefinition,recordSketchInHistory} = await import("/js/core/parametric_document.js");
      const {compileKernelFeatureTree} = await import("/js/core/kernel_feature_adapter.js");
      const {regenerateFeatures,releaseRegeneration} = await import("/js/cad_feature_tree.js");
      const {appendConvertedEdges} = await import("/js/core/convert_entities.js");
      const {openModeler} = await import("/js/modeler.js");
      const doc = createPartDocument({name:"Countertop",metadata:{authoringSystem:"parametric-v1"}});
      const outline = [[-30,-29],[30,-29],[30,29],[-30,29]];
      const profile = {id:"slab-profile",plane:"top",offset:0,constraints:[],
        points:outline.map(([x,y],i)=>({id:i+1,x,y,fixed:true})),
        entities:outline.map((_,i)=>({id:i+10,type:"line",a:i+1,b:(i+1)%4+1}))};
      recordSketchInHistory(doc,profile);
      const pts = outline.map(([u,v])=>({u,v}));
      const base = createFeatureDefinition(doc,"extrude",{id:"slab",references:{sketches:[profile.id]},
        params:{axis:"y",points:pts,sketchId:profile.id,from:0,to:3.4,depth:3.4}});
      const oval = {id:"opening",name:"Through cut profile",plane:"top",offset:3.4,points:[{id:1,x:0,y:0}],
        entities:[{id:2,type:"ellipse",c:1,rx:12,ry:8,rot:0}],constraints:[]};
      recordSketchInHistory(doc,oval);
      const cut = createFeatureDefinition(doc,"extrudeCut",{id:"cut",inputs:[base.id],
        references:{sketches:[oval.id],features:[base.id]},params:{
          sketchId:oval.id,profileEntityIds:[2],axis:"y",depth:3.4,from:3.4,to:0,direction:"reverse",
        }});
      const compiled = compileKernelFeatureTree(doc);
      const run = await regenerateFeatures({...compiled.document,features:compiled.features});
      const section = {id:"rim",name:"Converted underside",plane:"top",offset:0,points:[],entities:[],constraints:[]};
      try {
        const edge = run.results.get(cut.id)?.topology.find(e =>
          e.descriptor.curve==="ellipse" && Math.abs(e.descriptor.origin.y-3.4)<1e-5);
        if (!edge) throw new Error("Missing elliptical cut edge: "+JSON.stringify(run.issues));
        let id = 30;
        const converted = appendConvertedEdges(section,[edge],{makeId:() => ++id});
        if (converted.entities[0]?.type!=="ellipse") throw new Error(JSON.stringify(converted.skipped));
      } finally { releaseRegeneration(run); }
      recordSketchInHistory(doc,section);
      recordSketchInHistory(doc,{id:"lower",name:"Lower circle",plane:"top",offset:-10,points:[{id:3,x:0,y:0}],
        entities:[{id:4,type:"circle",c:3,r:2}],constraints:[]});
      doc.activeSketch="lower";
      doc.parts=[{id:"counter",featureId:base.id,kind:"ext",name:"Countertop",pts,axis:"y",from:0,to:3.4}];
      openModeler(null,doc,null);
    });
    await page.eval(() => {
      document.querySelector('#modeler [data-command="loftfeature"]').click();
      for (const id of ["lower","rim","lower"]) document.querySelector('#mdQuickSettings fieldset input[value="'+id+'"]').click();
      document.getElementById("mdAcceptCommand").click();
    });
    await page.waitUntil(() => /Native solids: 2/.test(document.getElementById("mdStatus").textContent),{ms:60000,what:"two native solids after Loft"});
    const loft = await page.eval(() => window.cadFeatureTreeSnapshot().find(f => f.type==="loft"));
    assert.deepEqual(loft.inputs,["cut"]);
    await page.eval(() => document.querySelector('#modeler [data-command="shellfeature"]').click());
    await page.waitUntil(() => document.querySelector("#mdQuickSettings .md-edge-browser-choices button"),{what:"Shell opening faces"});
    const label = await page.eval(() => {
      const panel = document.querySelector("#mdQuickSettings");
      panel.querySelector(".md-edge-browser summary").click();
      const faces = [...panel.querySelectorAll(".md-edge-browser-choices button")];
      // Only the bowl cap faces up on the underside plane (the slab underside faces down).
      const cap = faces.find(b => b.textContent.includes("plane") &&
        /normal \(-?0\.000, 1\.000, -?0\.000\)/.test(b.textContent) &&
        Math.abs(Number(b.textContent.match(/center \([^,]+, ([^,]+),/)?.[1]))<1e-5);
      if (!cap) throw new Error(faces.map(b=>b.innerText).join("\n"));
      cap.click();
      const field = panel.querySelector('input[data-parameter="thickness"]');
      field.value="2.5 mm";field.dispatchEvent(new Event("input",{bubbles:true}));
      return cap.textContent;
    });
    assert.match(label,/plane/);
    await page.waitUntil(() => !document.getElementById("mdAcceptCommand").disabled ||
      document.querySelector(".md-feature-live")?.dataset.previewState==="error",{ms:60000,what:"exact Shell preview"});
    assert.equal(await page.eval(() => document.getElementById("mdAcceptCommand").disabled),false,
      await page.eval(() => window.cadFinishPreviewSnapshot().badge.text));
    await page.eval(() => document.getElementById("mdAcceptCommand").click());
    await page.waitUntil(() => window.cadFeatureTreeSnapshot().some(f=>f.type==="shell"),{what:"Shell commit"});
    const shell = await page.eval(() => window.cadFeatureTreeSnapshot().find(f=>f.type==="shell"));
    assert.deepEqual(shell.inputs,[loft.id]);
    assert.equal(shell.params.thickness,.25);
    const rebuilt = await page.evalWithTimeout(90000, async () => {
      const {E} = await import("/js/modeler.js");
      const {compileKernelFeatureTree} = await import("/js/core/kernel_feature_adapter.js");
      const {regenerateFeatures,releaseRegeneration} = await import("/js/cad_feature_tree.js");
      const {brepContainsPoint,validateBrepForExport} = await import("/js/cad_kernel.js");
      const model = compileKernelFeatureTree(JSON.parse(JSON.stringify(E.def)));
      const run = await regenerateFeatures({...model.document,features:model.features});
      try {
        if (!run.ok) throw new Error(JSON.stringify(run.issues));
        const body = run.finalShape;
        return {count:(await validateBrepForExport(body)).solidCount,
          bowlCentre:brepContainsPoint(body,{x:0,y:-4,z:0}),
          floor:brepContainsPoint(body,{x:0,y:-9.9,z:0}),
          counter:brepContainsPoint(body,{x:16,y:1,z:0})};
      } finally {releaseRegeneration(run);}
    });
    assert.deepEqual(rebuilt,{count:2,bowlCentre:false,floor:true,counter:true});
  } finally {await page.close();}
});
