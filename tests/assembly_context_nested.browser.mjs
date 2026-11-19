import assert from "node:assert/strict";
import test from "node:test";
import {findChrome,openPage} from "../tools/browser_harness.mjs";

test("Vanity creates a sleeve on one of two identically named nested faucet stems", {
  skip: !(await findChrome()) && "Chrome unavailable", timeout:150000,
},async()=>{
  const page=await openPage({width:1440,height:900,lang:"en"});
  try {
    await page.eval(async()=>{
      const {putAssemblyLibraryRecord}=await import("/js/core/model_library_store.js");
      const stem=id=>({id,name:"New model",grounded:true,visible:true,transform:{x:3},
        def:{name:"Stem",parts:[{id:"shaft",kind:"cyl",x:0,y:0,z:0,r:1,h:8}]}});
      const faucet=id=>{
        const shaft=stem("stem"),seat=stem("seat");
        shaft.grounded=false;
        seat.transform={x:0};
        seat.topology=[{persistentId:"end",kind:"face",descriptor:{surface:"plane",origin:{x:3,y:0,z:0},normal:{x:1,y:0,z:0}}}];
        return {id,name:"Faucet",kind:"assembly",visible:true,grounded:true,transform:{x:id==="hot"?10:50,rz:90},
          asm:{key:"faucet",components:[shaft,seat],mates:[],topologyMates:[{id:"seat-stem",type:"coincident",aligned:true,
            a:{componentId:"seat",kind:"face",persistentId:"end"},b:{componentId:"stem",kind:"face",persistentId:"plane:right"}}]}};
      };
      await putAssemblyLibraryRecord({key:"vanity",name:"Vanity",components:[stem("direct1"),stem("direct2"),faucet("hot"),faucet("cold")],mates:[]});
    });
    async function openVanity() {
      await page.goto("/");
      await page.eval(async()=>{
        [...document.querySelectorAll("button")].find(b=>/Continue with/i.test(b.textContent))?.click();
        const {openModeler}=await import("/js/modeler.js");
        openModeler(null,{key:"test",name:"Test",parts:[]});
        document.querySelector('[data-welcome-start="continue"]')?.click();
        document.querySelector('#mdDocModes [data-doc="assembly"]').click();
        [...document.querySelectorAll("#mdLib .md-card")].find(card=>card.querySelector(".nm")?.textContent==="Vanity").click();
      });
      await page.waitUntil(()=>document.querySelector("#mdName").value==="Vanity",{what:"open Vanity"});
    }
    await openVanity();
    const labels=await page.eval(()=>{
      [...document.querySelectorAll("button")].find(b=>b.textContent==="New part in context").click();
      return [...document.querySelector("#mdQuickSettings select").options].map(o=>o.textContent);
    });
    assert.equal(new Set(labels).size,labels.length,JSON.stringify(labels));
    const target=labels.find(label=>label.includes("[cold]") && label.includes("[stem]") && label.includes("top") && !label.includes("plane:"));
    assert.ok(target,JSON.stringify(labels));
    await page.eval(target=>{
      const form=document.querySelector("#mdQuickSettings"), select=form.querySelector("select");
      select.value=[...select.options].find(o=>o.textContent===target).value;
      form.querySelector('input').value="Supply pipe sleeve";
      form.querySelector(".md-feature-actions .ph-check").closest("button").click();
    },target);
    await page.waitUntil(()=>document.querySelector("#mdAssemblyContextBar")?.textContent.includes("Supply pipe sleeve"),{what:"sleeve edit"});
    await page.eval(()=>document.querySelector("#mdAssemblyContextBar button").click());
    await page.waitUntil(()=>!document.querySelector("#mdAssemblyContextBar"),{what:"finish sleeve"});
    await page.eval(()=>document.querySelector("#mdSave").click());
    await page.waitUntil(()=>!document.querySelector("#mdSave").hasAttribute("aria-busy"),{what:"save Vanity"});
    const sleeve=await page.eval(async()=>{
      const {loadAssemblyLibrary}=await import("/js/core/model_library_store.js");
      return (await loadAssemblyLibrary()).find(a=>a.key==="vanity").components.find(c=>c.name==="Supply pipe sleeve");
    });
    assert.deepEqual(sleeve.inContext.occurrencePath,["cold","stem"]);
    assert.ok(Math.abs(sleeve.transform.x-42)<1e-7 && Math.abs(sleeve.transform.y-3)<1e-7,JSON.stringify(sleeve.transform));

    async function changeStoredSource(remove) {
      await page.eval(async remove=>{
        const store=await import("/js/core/model_library_store.js");
        const vanity=(await store.loadAssemblyLibrary()).find(a=>a.key==="vanity");
        const faucet=vanity.components.find(c=>c.id==="cold");
        if(remove) {faucet.asm.components=[];faucet.asm.topologyMates=[];}
        else {
          faucet.asm.components[0].def.parts[0].h=12;
          faucet.asm.components.find(c=>c.id==="seat").topology[0].descriptor.origin.x=5;
          faucet.transform.x=60;
          const sleeve=vanity.components.find(c=>c.name==="Supply pipe sleeve");
          vanity.components.push({id:"pipe",name:"Pipe",def:{parts:[]},transform:{x:sleeve.transform.x}});
          vanity.mates=["alignX","alignY"].map(type=>({id:type,type,a:sleeve.id,b:"pipe"}));
          vanity.components.reverse();
        }
        await store.putAssemblyLibraryRecord(vanity);
      },remove);
      await openVanity();
      return page.eval(async()=>{
        const {E}=await import("/js/modeler.js");
        return E.assembly.components.find(c=>c.name==="Supply pipe sleeve");
      });
    }
    const moved=await changeStoredSource(false);
    assert.ok(!moved.contextIssue && Math.abs(moved.transform.x-48)<1e-7,JSON.stringify(moved.transform));
    assert.ok(Math.abs(moved.transform.y-5)<1e-7,JSON.stringify(moved.transform));
    const pipe=await page.eval(async()=>(await import("/js/modeler.js")).E.assembly.components.find(c=>c.id==="pipe").transform);
    assert.ok(Math.abs(pipe.x-48)<1e-7 && Math.abs(pipe.y-5)<1e-7);
    await page.eval(()=>document.querySelector("#mdSave").click());
    await page.waitUntil(()=>!document.querySelector("#mdSave").hasAttribute("aria-busy"),{what:"save updated placement"});
    const saved=await page.eval(async()=>{
      const store=await import("/js/core/model_library_store.js");
      const vanity=(await store.loadAssemblyLibrary()).find(a=>a.key==="vanity");
      return [vanity.components.find(c=>c.id==="cold").asm.components.find(c=>c.id==="stem").transform.x,
        vanity.components.find(c=>c.name==="Supply pipe sleeve").transform.y];
    });
    assert.ok(saved.every(v=>Math.abs(v-5)<1e-7),JSON.stringify(saved));
    await openVanity();
    const reopened=await page.eval(async()=>{
      const {E}=await import("/js/modeler.js");
      return E.assembly.components.find(c=>c.name==="Supply pipe sleeve");
    });
    assert.deepEqual(reopened.inContext,moved.inContext);
    assert.deepEqual(reopened.transform,moved.transform);
    const broken=await changeStoredSource(true);
    assert.match(broken.contextIssue,/context occurrence/);
    assert.deepEqual(broken.transform,moved.transform);
    await page.eval(async()=>{
      const store=await import("/js/core/model_library_store.js");
      const vanity=(await store.loadAssemblyLibrary()).find(a=>a.key==="vanity");
      const sleeve=vanity.components.find(c=>c.name==="Supply pipe sleeve");
      vanity.components=vanity.components.filter(c=>c.kind==="assembly");
      vanity.mates=[];
      for(const faucet of vanity.components){
        const child=structuredClone(sleeve);
        child.id="sleeve";
        child.inContext.occurrencePath=["lost-stem"];
        child.inContext.parentId="lost-stem";
        faucet.asm.components.push(child);
      }
      await store.putAssemblyLibraryRecord(vanity);
    });
    await openVanity();
    await page.waitUntil(()=>/2 assembly issues/.test(document.querySelector("#mdStatus").textContent),{what:"two independent broken context paths"});
    for(const parent of ["cold","hot"]) {
      const row=await page.eval(id=>{
        const node=document.querySelector('[data-node-id="comp:'+id+'"]');
        if(node.getAttribute("aria-expanded")==="false") node.querySelector(".md-tree-caret").click();
        return node.title;
      },parent);
      assert.ok(row.includes(parent+" / sleeve"),row);
      const warning=await page.eval(id=>document.querySelector('[data-node-id="sub:'+id+'/sleeve"] .md-tree-warn')?.title,parent);
      assert.ok(warning?.includes(parent+" / sleeve") && warning.includes("context occurrence"),warning);
    }
  } finally {await page.close();}
});
