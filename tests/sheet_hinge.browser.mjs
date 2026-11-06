import assert from "node:assert/strict";
import test from "node:test";
import { findChrome, openPage } from "../tools/browser_harness.mjs";
import { startDatumSketch } from "./helpers/browser_sketch_workflow.mjs";

const available = await findChrome();
test("All commands converts a selected sketch extrusion and applies rolled hinge tabs", available ? {timeout:180000} : {skip:"Chrome unavailable"}, async () => {
  const page = await openPage({width:1440,height:1000,lang:"en"});
  try {
    await page.eval(async () => {
      const {openModeler} = await import("/js/modeler.js");
      openModeler(null,{name:"Sheet hinge",key:"test-sheet-hinge",parts:[]},null);
      document.querySelector('[data-welcome-start="continue"]')?.click();
    });
    await startDatumSketch(page);
    await page.eval(() => document.querySelector('#modeler [data-command="srect"]').click());
    await page.waitUntil(() => window.cadSketchSnapshot?.().tool==="srect");
    await page.eval(() => {
      const canvas = document.querySelector("#mdCanvas"), bounds = canvas.getBoundingClientRect();
      const pointer = (type,x,y) => canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:71,
        pointerType:"mouse",button:0,buttons:1,clientX:bounds.left+bounds.width/2+x,clientY:bounds.top+bounds.height/2+y}));
      pointer("pointerdown",-80,-60);
      pointer("pointermove",40,30);
      for (const key of ["6","5","0","Tab","3","0","Enter"]) window.dispatchEvent(new KeyboardEvent("keydown",{key,bubbles:true}));
    });
    await page.eval(() => document.querySelector("#mdAcceptCommand").click());
    await page.waitUntil(() => !!document.querySelector("#mdProfileOffer:not([hidden]) button"));
    await page.eval(() => document.querySelector("#mdProfileOffer button").click());
    await page.waitUntil(() => window.cadLoopSnapshot?.().authoring==="extrude");
    await page.eval(() => {
      const input = document.querySelector('#mdQuickSettings input[data-parameter="depth"]');
      input.value = "1.5mm";
      for (const event of ["input","change"]) input.dispatchEvent(new Event(event,{bubbles:true}));
      document.querySelector("#mdAcceptCommand").click();
    });
    await page.waitUntil(async () => (await import("/js/modeler.js")).E.sel?.kind==="ext",{what:"newly extruded leaf selected"});
    await page.waitUntil(() => !!document.querySelector("#modeler .ps-allcmds")?.getClientRects().length);
    await page.eval(() => {
      document.querySelector("#modeler .ps-allcmds").click();
      const option = [...document.querySelectorAll(".pe-body button")].find(el => el.querySelector("span")?.textContent==="Sheet metal");
      option.click();
    });
    await page.waitUntil(() => !!document.querySelector('#mdQuickSettings [data-parameter="thickness"]')?.getClientRects().length);
    await page.eval(() => document.querySelector("#mdQuickSettings .md-quick-apply").click());
    await page.waitUntil(() => [...document.querySelectorAll("#mdOps button")].some(el => el.textContent.trim()==="Rolled hinge tabs" && el.getClientRects().length));
    await page.eval(() => [...document.querySelectorAll("#mdOps button")].find(el => el.textContent.trim()==="Rolled hinge tabs").click());
    await page.eval(() => document.querySelector("#mdQuickSettings .md-quick-apply").click());
    await page.waitUntil(async () => (await import("/js/modeler.js")).E.def.sheetMetal?.hinge?.count===13);
    const result = await page.eval(async () => {
      const {E} = await import("/js/modeler.js");
      const {flatPattern} = await import("/js/cad_sheet_metal.js");
      return {thickness:E.def.sheetMetal.thickness, ownsPlate:E.def.sheetMetal.sourcePartId===E.sel.id,
        merges:E.sel.merges3d.length,bends:flatPattern(E.def.sheetMetal).bends.length};
    });
    assert.ok(Math.abs(result.thickness-.15)<1e-8);
    assert.ok(result.ownsPlate);
    assert.equal(result.merges,13);
    assert.equal(result.bends,13);
    await page.waitUntil(async () => {
      const {E} = await import("/js/modeler.js");
      if (!E.sel.exactPending && E.sel.exactError) throw new Error(E.sel.exactError);
      const cylinders = E.sel.meshData?.topology?.filter(ref => ref.kind==="face" && ref.descriptor.surface==="cylinder") || [];
      return cylinders.length>=26;
    },{what:"inside and outside cylindrical faces on all thirteen rendered tabs",ms:150000});
    const downloads = await page.eval(async()=>{
      const {E} = await import("/js/modeler.js");
      const {suppressHistoryNode} = await import("/js/core/parametric_document.js");
      const entry = E.def.history.find(e=>e.targetId===E.def.sheetMetal.hingeFeatureIds.at(-1));
      const buttons = ["Flat pattern","Bend report"].map(label=>[...document.querySelectorAll("#mdOps button")].find(b=>b.textContent.trim()===label));
      const names = [], hints = [], click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { names.push(this.download); };
      try {
        buttons.forEach(b=>b.click());
        suppressHistoryNode(E.def,entry.id,true);
        for (const b of buttons) { b.click(); hints.push(document.querySelector("#mdHint").textContent); }
      } finally {
        suppressHistoryNode(E.def,entry.id,false);
        HTMLAnchorElement.prototype.click = click;
      }
      return {names,hints};
    });
    assert.equal(downloads.names.length,2,JSON.stringify(downloads));
    assert.ok(downloads.names.some(name=>name.endsWith(".svg")));
    assert.ok(downloads.names.some(name=>name.endsWith(".json")));
    assert.ok(downloads.hints.every(hint=>hint.includes("Restore")),JSON.stringify(downloads));
    await page.eval(() => document.querySelector("#mdUndo").click());
    await page.waitUntil(async () => {
      const {E} = await import("/js/modeler.js");
      return E.def.sheetMetal && !E.def.sheetMetal.hinge && !E.def.parts[0].merges3d?.length;
    },{what:"undo restores the converted leaf"});
  } finally { await page.close(); }
});

test("deleting a converted plate frees the other plate for conversion", available ? {timeout:120000} : {skip:"Chrome unavailable"}, async () => {
  const page = await openPage({width:1440,height:1000,lang:"en"});
  try {
    await page.eval(async () => {
      const {openModeler} = await import("/js/modeler.js");
      const box = (id,x) => ({id,name:id,kind:"box",x0:x,x1:x+10,y0:0,y1:.1,z0:0,z1:3});
      openModeler(null,{key:"hinge-owner",name:"Two leaves",parts:[box("First leaf",0),box("Second leaf",20)]},null);
      document.querySelector('[data-welcome-start="continue"]')?.click();
    });
    const convert = async id => {
      await page.eval(id=>{
        [...document.querySelectorAll("#mdParts [data-node-id]")].find(row=>row.textContent.includes(id)).click();
        document.querySelector('#modeler [data-tab="ops"]').click();
        document.querySelector("#mdSheetConvert").click();
        document.querySelector("#mdQuickSettings .md-quick-apply").click();
      },id);
      await page.waitUntil(async () => !!(await import("/js/modeler.js")).E.def.sheetMetal,{what:"converted leaf"});
      assert.equal(await page.eval(async ()=>(await import("/js/modeler.js")).E.def.sheetMetal.sourcePartId),id);
    };
    await convert("First leaf");
    await page.eval(()=>document.querySelector("#mdOps .btn-danger").click());
    await page.waitUntil(async () => !(await import("/js/modeler.js")).E.def.sheetMetal,{what:"owner released"});
    await convert("Second leaf");
  } finally { await page.close(); }
});
