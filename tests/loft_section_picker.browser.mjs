import test from "node:test";
import assert from "node:assert/strict";
import {findChrome, openPage} from "../tools/browser_harness.mjs";

test("Loft collects ordered section sketches by click and keyboard and preserves tree preselection",
  await findChrome() ? {timeout:180000} : {skip:"Chrome unavailable"}, async () => {
    const page = await openPage({width:1440, height:900});
    try {
      await page.waitForBoot();
      await page.eval(async () => {
        const {createPartDocument, recordSketchInHistory} = await import("/js/core/parametric_document.js");
        const {openModeler} = await import("/js/modeler.js");
        const doc = createPartDocument({name:"Sink", metadata:{authoringSystem:"parametric-v1"}});
        for (const [id, name, offset, entity] of [
          ["rim", "Underside ellipse", 0, {type:"ellipse", rx:6, ry:4, rot:0}],
          ["drain", "Offset circle", -8, {type:"circle", r:2}],
        ]) {
          recordSketchInHistory(doc, {id, name, plane:"top", offset, points:[{id:1,x:0,y:0,fixed:true}],
            entities:[{...entity,id:2,c:1}], constraints:[]});
        }
        doc.activeSketch = "drain";
        openModeler(null, doc, null);
      });
      const start = () => page.eval(() => document.querySelector('#modeler [data-command="loftfeature"]').click());
      const sections = () => page.eval(() => [...document.querySelectorAll("#mdQuickSettings fieldset label")].map(row =>
        [row.innerText, row.querySelector("input").checked]));
      const clickRow = async id => {
        const point = await page.eval(id => {
          const row = document.querySelector('#mdQuickSettings fieldset input[value="'+id+'"]').closest("label");
          row.scrollIntoView({block:"nearest"});
          const box = row.getBoundingClientRect();
          return {x:box.left+box.width/2,y:box.top+box.height/2};
        }, id);
        for (const type of ["mousePressed","mouseReleased"]) {
          await page.send("Input.dispatchMouseEvent", {...point,type,button:"left",clickCount:1});
        }
      };
      await start();
      const group=await page.eval(()=>{
        const picker=document.querySelector("#mdQuickSettings fieldset");
        const hint=document.getElementById(picker.getAttribute("aria-describedby"));
        return {name:picker.querySelector("legend").textContent,description:picker.contains(hint) && hint.textContent};
      });
      assert.match(group.description,/loft order/);
      const ax=await page.send("Accessibility.getFullAXTree");
      assert.ok(ax.nodes.some(node=>node.role?.value==="group" && node.name?.value===group.name &&
        node.description?.value===group.description),"the picker exposes its ordering hint as the group description");
      assert.deepEqual(await sections(), [["Underside ellipse",false],["1. Offset circle",true]]);
      assert.equal(await page.eval(() => document.querySelector("#mdAcceptCommand").disabled), true);
      await clickRow("rim");
      assert.deepEqual(await sections(), [["2. Underside ellipse",true],["1. Offset circle",true]]);
      await page.eval(() => document.querySelector("#mdCancelCommand").click());
      await page.eval(() => [...document.querySelectorAll(".md-tree-sketch")].find(row =>
        row.offsetWidth && row.textContent.includes("Underside ellipse")).dispatchEvent(new MouseEvent("click",{bubbles:true,ctrlKey:true})));
      await start();
      assert.deepEqual(await sections(), [["2. Underside ellipse",true],["1. Offset circle",true]]);
      await clickRow("drain");
      await clickRow("rim");
      assert.equal(await page.eval(() => document.querySelector('[data-live-selection="loft"]').textContent), "0 sketch(es) selected");
      await clickRow("rim");
      for (const [key,code,virtualKey] of [["Tab","Tab",9],[" ","Space",32]]) {
        for (const type of ["keyDown","keyUp"]) await page.send("Input.dispatchKeyEvent",
          {type,key,code,windowsVirtualKeyCode:virtualKey,nativeVirtualKeyCode:virtualKey});
      }
      assert.deepEqual(await sections(), [["1. Underside ellipse",true],["2. Offset circle",true]]);
      assert.equal(await page.eval(() => document.querySelector('[data-live-selection="loft"]').textContent), "2 sketch(es) selected");
      await page.eval(() => document.querySelector("#mdAcceptCommand").click());
      await page.waitUntil(() => window.cadFeatureTreeSnapshot().some(f => f.type==="loft"), {what:"committed sink loft"});
      const params = await page.eval(() => window.cadFeatureTreeSnapshot().find(f => f.type==="loft").params);
      assert.deepEqual(params.sketchSources.sections.map(s => s.sketchId), ["rim","drain"]);
      assert.equal(params.sectionSegments[0][0].type, "ellipse");
    } finally { await page.close(); }
  });

test("active Loft shares ordered picks and deselections between checkboxes and the tree",
  await findChrome() ? {timeout:180000} : {skip:"Chrome unavailable"},async()=>{
    const page=await openPage({width:1440,height:900});
    try{
      await page.eval(async()=>{
        const {createPartDocument,recordSketchInHistory}=await import("/js/core/parametric_document.js");
        const {openModeler}=await import("/js/modeler.js");
        const doc=createPartDocument({name:"Three stations",metadata:{authoringSystem:"parametric-v1"}});
        for(const [i,id] of ["base","middle","top"].entries()){
          recordSketchInHistory(doc,{id,name:id,plane:"top",offset:4*i,points:[{id:1,x:0,y:0,fixed:true}],
            entities:[{id:2,type:"circle",c:1,r:3-i/2}],constraints:[]});
        }
        doc.activeSketch="top";openModeler(null,doc,null);
        for(const id of ["top","middle"]){
          document.querySelector('#mdParts .md-tree-sketch[data-history-target="'+id+'"]')
            .dispatchEvent(new MouseEvent("click",{bubbles:true,ctrlKey:true}));
        }
        document.querySelector('#modeler [data-command="loftfeature"]').click();
      });
      const treePick=(id,modifier="ctrlKey",pane="#mdParts")=>page.eval((id,modifier,pane)=>{
        const row=document.querySelector(pane+' .md-tree-sketch[data-history-target="'+id+'"]');
        row.dispatchEvent(new MouseEvent("click",{bubbles:true,[modifier]:true}));
      },id,modifier,pane);
      const checkbox=id=>page.eval(id=>document.querySelector('#mdQuickSettings fieldset input[value="'+id+'"]').click(),id);
      async function expectSelection(ids){
        const actual=await page.eval(()=>{
          const picker=document.querySelector("#mdQuickSettings fieldset");
          const rows=[...picker.querySelectorAll("label")].filter(row=>row.querySelector("input").checked);
          return {ordered:rows.map(row=>row.textContent).sort(),
            trees:["#mdParts","#mdHistDesign"].map(pane=>[...document.querySelectorAll(pane+" .md-tree-sketch.on")].map(r=>r.dataset.historyTarget).sort()),
            note:document.querySelector('[data-live-selection="loft"]').textContent,
            ready:!document.getElementById("mdAcceptCommand").disabled};
        });
        assert.deepEqual(actual,{ordered:ids.map((id,i)=>(i+1)+". "+id),trees:[[...ids].sort(),[...ids].sort()],
          note:ids.length+" sketch(es) selected",ready:ids.length>=2});
      }
      await expectSelection(["middle"]);
      await treePick("middle"); await expectSelection([]);
      await checkbox("top"); await expectSelection(["top"]);
      await checkbox("middle"); await expectSelection(["top","middle"]);
      await treePick("top"); await expectSelection(["middle"]);
      await treePick("middle"); await expectSelection([]);
      await treePick("middle"); await expectSelection(["middle"]);
      await checkbox("top"); await expectSelection(["middle","top"]);
      await treePick("base","metaKey","#mdHistDesign"); await expectSelection(["middle","top","base"]);
      await treePick("middle"); await expectSelection(["top","base"]);
      await page.eval(()=>document.querySelector("#mdAcceptCommand").click());
      await page.waitUntil(()=>window.cadFeatureTreeSnapshot().some(f=>f.type==="loft"),{what:"ordered loft"});
      const sections=await page.eval(()=>window.cadFeatureTreeSnapshot().find(f=>f.type==="loft").params.sketchSources.sections);
      assert.deepEqual(sections.map(s=>s.sketchId),["top","base"]);
    }finally{await page.close();}
  });

test("editing a Box replaces Loft creation and returns sketch clicks to the tree",
  await findChrome() ? {timeout:180000} : {skip:"Chrome unavailable"},async()=>{
    const page=await openPage({width:1440,height:900});
    try{
      await page.eval(async()=>{
        const {createPartDocument,createFeatureDefinition,recordSketchInHistory}=await import("/js/core/parametric_document.js");
        const {openModeler}=await import("/js/modeler.js");
        const doc=createPartDocument({name:"Switch forms",metadata:{authoringSystem:"parametric-v1"}});
        createFeatureDefinition(doc,"box",{id:"stock",params:{w:4,h:4,d:4}});
        doc.parts=[{id:"body",featureId:"stock",kind:"box",x0:0,x1:4,y0:0,y1:4,z0:0,z1:4}];
        for(const [i,id] of ["base","top"].entries()){
          recordSketchInHistory(doc,{id,name:id,plane:"top",offset:4*i,points:[{id:1,x:0,y:0,fixed:true}],
            entities:[{id:2,type:"circle",c:1,r:2}],constraints:[]});
        }
        doc.activeSketch="top";openModeler(null,doc,null);
        document.querySelector('#modeler [data-command="loftfeature"]').click();
        for(const id of ["base","top"])document.querySelector('#mdQuickSettings fieldset input[value="'+id+'"]').click();
      });
      const selection=()=>page.eval(()=>[...document.querySelectorAll("#mdParts .md-tree-sketch.on")].map(row=>row.dataset.historyTarget));
      assert.deepEqual(await selection(),["base"]);
      await page.eval(()=>document.querySelector('#mdParts .md-tree-feature[data-history-target="stock"]')
        .dispatchEvent(new MouseEvent("dblclick",{bubbles:true})));
      const editor=await page.eval(()=>window.cadFinishPreviewSnapshot());
      assert.equal(editor.type,"box");
      assert.equal(editor.formOpen,true);
      assert.equal(editor.params,null,"the Box editor released the Loft creation preview");
      assert.deepEqual(await selection(),["top"]);
      await page.eval(()=>document.querySelector('#mdParts .md-tree-sketch[data-history-target="base"]').click());
      assert.equal(await page.eval(()=>window.cadSketchSnapshot().phase),"sketch");
      assert.equal(await page.eval(()=>window.__modelerHeadState().sketch),"base");
      assert.deepEqual(await selection(),["base"]);
    }finally{await page.close();}
  });
