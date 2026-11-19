import test from "node:test";
import assert from "node:assert/strict";
import {findChrome, openPage} from "../tools/browser_harness.mjs";
import {designTablePart} from "./helpers/design_table_part.mjs";
import {updateConfiguration} from "../js/cad_configurations.js";

test("Configurations edits a native matrix, rebuilds, undoes and restores a saved row", await findChrome()
  ? {timeout:180000} : {skip:"Chrome unavailable"}, async () => {
  const page = await openPage({width:1400,height:950,lang:"en"});
  try {
    await page.waitForBoot();
    const pin = designTablePart();
    pin.sketches[0].constraints.push({id:4,type:"radius",entity:2,value:2,expr:"PinDiameter / 2"});
    for (const row of pin.configurations) updateConfiguration(pin,row.id,{capture:true});
    await page.eval(async doc => {
      const {openModeler} = await import("/js/modeler.js");
      openModeler(null, doc, null);
    }, pin);
    const openTable = () => page.eval(() => {
      window.__modelerRunCommand("config");
      [...document.querySelectorAll("#mdPickList button")].find(b=>b.textContent.includes("Edit design table")).click();
    });
    await openTable();
    assert.deepEqual(await page.eval(()=>[...document.querySelectorAll("#mdDesignTable tbody th")].map(th=>th.textContent)),["Default (active)","Long"]);
    const invalid = await page.eval(()=>{
      const dialog = document.querySelector("#mdDesignTable");
      dialog.querySelector('[aria-label="Default · Depth@Boss"]').value = "45";
      dialog.querySelector('[aria-label="Long · Depth@Boss"]').value = "4 deg";
      dialog.querySelector("form").requestSubmit();
      return dialog.querySelector('[role="status"]').textContent;
    });
    assert.match(invalid,/Long.*positive length/);
    const depth = () => page.eval(()=>window.cadFeatureTreeSnapshot().find(f=>f.id==="boss").params.depth);
    assert.equal(await depth(),3);
    await page.eval(()=>{
      const dialog = document.querySelector("#mdDesignTable");
      dialog.querySelector('[aria-label="Long · Depth@Boss"]').value = "1 in";
      dialog.querySelector('[aria-label="Long · Suppress@Boss"]').value = "Suppress";
      dialog.querySelector('[aria-label="Default · PinDiameter@Profile"]').value = "60 mm";
      dialog.querySelector("form").requestSubmit();
    });
    await page.waitUntil(()=>{
      const b = window.cadLiveEditSnapshot().bodies[0];
      return b.triangles > 0 && Math.abs(b.bounds.x1-3)<.02 && Math.abs(b.bounds.y1-4.5)<.02;
    }, {ms:60000,what:"edited diameter and depth on the rebuilt solid"});
    await page.eval(()=>document.querySelector("#mdUndo").click());
    assert.equal(await depth(),3);
    await openTable();
    assert.equal(await page.eval(()=>document.querySelector('[aria-label="Long · Depth@Boss"]').value),"30");
    await page.eval(()=>{
      document.querySelector('#mdDesignTable [type="button"]').click();
      document.querySelector("#mdRedo").click();
    });
    assert.equal(await depth(),4.5);
    await page.waitUntil(async()=>{
      const {loadModelerDraftRecord} = await import("/js/core/model_library_store.js");
      const draft = await loadModelerDraftRecord(sessionStorage.getItem("home3d_modeler_tab_id"));
      return draft?.def?.configurations?.[1]?.suppressedFeatureIds?.includes("boss");
    },{ms:60000,what:"edited rows in saved modeler draft"});
    await page.eval(async()=>{
      const {loadModelerDraftRecord} = await import("/js/core/model_library_store.js");
      const {openModeler} = await import("/js/modeler.js");
      const draft = await loadModelerDraftRecord(sessionStorage.getItem("home3d_modeler_tab_id"));
      openModeler(null,draft.def,null);
      window.__modelerRunCommand("config");
      [...document.querySelectorAll("#mdPickList button")].find(b=>b.querySelector("b").textContent==="Long").click();
    });
    assert.equal(await depth(),2.54);
    await openTable();
    assert.equal(await page.eval(()=>document.querySelector('[aria-label="Long · Suppress@Boss"]').value),"Suppress");
  } finally { await page.close(); }
});
