import assert from "node:assert/strict";
import test from "node:test";
import { findChrome, openPage } from "../tools/browser_harness.mjs";

async function openAssemblyEditor(page,partKey) {
  await page.goto("/");
  await page.eval(async key=>{
    [...document.querySelectorAll("button")].find(b=>/Continue with/i.test(b.textContent))?.click();
    const {openModeler}=await import("/js/modeler.js");
    const {loadModelLibrary}=await import("/js/core/model_library_store.js");
    openModeler(key,(await loadModelLibrary()).find(part=>part.key===key));
    document.querySelector('[data-welcome-start="continue"]')?.click();
    document.querySelector('#mdDocModes [data-doc="assembly"]').click();
  },partKey);
}

test("saved door edits reach the reopened vanity through normal insertion and Save",{
  skip: !(await findChrome()) && "Chrome unavailable",
},async()=>{
  const page=await openPage({width:1360,height:900});
  try {
    await page.eval(async()=>{
      const store=await import("/js/core/model_library_store.js");
      await store.putModelLibraryRecord({key:"panel",name:"Panel",parts:[
        {id:"body",kind:"box",x0:0,x1:40,y0:0,y1:3,z0:0,z1:5}]});
      for(const [key,name] of [["door","Door"],["vanity","Vanity"]])
        await store.putAssemblyLibraryRecord({key,name,components:[],mates:[]});
    });
    await openAssemblyEditor(page,"panel");
    async function open(name){
      await page.eval(name=>{
        window.expectedAssembly=name;
        [...document.querySelectorAll("#mdLib .md-card")].find(card=>card.querySelector(".nm")?.textContent===name).click();
      },name);
      await page.waitUntil(()=>document.querySelector("#mdName").value===window.expectedAssembly,{what:"open assembly "+name});
    }
    async function insert(key){
      await page.eval(key=>{
        const picker=document.querySelector(".md-insert-component");
        picker.querySelector("select").value=key;
        if(!picker.querySelector("select").value)throw new Error("Missing component "+key);
        picker.querySelector("button").click();
      },key);
    }
    async function save(){
      await page.eval(()=>document.querySelector("#mdSave").click());
      await page.waitUntil(()=>!document.querySelector("#mdSave").hasAttribute("aria-busy"),{what:"assembly save"});
    }
    async function stored(key){
      return page.eval(async key=>(await (await import("/js/core/model_library_store.js")).loadAssemblyLibrary()).find(a=>a.key===key),key);
    }
    await open("Door");await insert("panel");await save();
    assert.equal((await stored("door")).components[0].libraryLink.kind,"part");
    await open("Vanity");await insert("asm:door");await save();
    assert.equal((await stored("vanity")).components[0].libraryLink.kind,"assembly");
    await open("Door");await insert("panel");await save();
    assert.equal((await stored("door")).components.length,2);
    assert.equal((await stored("vanity")).components[0].asm.components.length,1);
    await open("Vanity");
    assert.match(await page.eval(()=>document.querySelector("#mdParts").textContent),/2 (?:components|\u05e8\u05db\u05d9\u05d1\u05d9\u05dd)/);
    await save();
    assert.equal((await stored("vanity")).components[0].asm.components.length,2);
  } finally { await page.close(); }
});

test("Undo of a rename saved while Part was active marks the assembly dirty on return",{
  skip: !(await findChrome()) && "Chrome unavailable",
},async()=>{
  const page=await openPage({width:1360,height:900});
  try {
    await page.eval(async()=>{
      const store=await import("/js/core/model_library_store.js");
      await store.putModelLibraryRecord({key:"panel",name:"Panel",parts:[
        {id:"body",kind:"box",x0:0,x1:10,y0:0,y1:2,z0:0,z1:3}]});
      await store.putAssemblyLibraryRecord({key:"rename",name:"Before",components:[],mates:[]});
    });
    await openAssemblyEditor(page,"panel");
    await page.eval(()=>[...document.querySelectorAll("#mdLib .md-card")].find(c=>c.querySelector(".nm")?.textContent==="Before").click());
    await page.waitUntil(()=>document.querySelector("#mdName").value==="Before",{what:"open Before"});
    const pending=await page.eval(()=>{
      const name=document.querySelector("#mdName"),save=document.querySelector("#mdSave");
      name.value="After";name.dispatchEvent(new Event("change",{bubbles:true}));
      save.click();
      document.querySelector('#mdDocModes [data-doc="part"]').click();
      return [save.getAttribute("aria-busy"),document.querySelector('#mdDocModes [data-doc="part"]').classList.contains("on")];
    });
    assert.deepEqual(pending,["true",true],"the assembly write must still be pending with Part active");
    await page.waitUntil(()=>!document.querySelector("#mdSave").hasAttribute("aria-busy"),{what:"save to finish in Part"});
    const storedName=await page.eval(async()=>(await (await import("/js/core/model_library_store.js")).loadAssemblyLibrary()).find(a=>a.key==="rename").name);
    assert.equal(storedName,"After");
    const states=await page.eval(()=>{
      document.querySelector('#mdDocModes [data-doc="assembly"]').click();
      const state=()=>[document.querySelector("#mdName").value,document.querySelector("#mdSave").classList.contains("is-dirty")];
      const after=state();document.querySelector("#mdUndo").click();const before=state();
      document.querySelector("#mdRedo").click();return [after,before,state()];
    });
    assert.deepEqual(states,[["After",false],["Before",true],["After",false]]);

    // In the opposite direction a Part save must not mark the undone assembly clean.
    const savingPart=await page.eval(()=>{
      document.querySelector("#mdUndo").click();
      document.querySelector('#mdDocModes [data-doc="part"]').click();
      const name=document.querySelector("#mdName"),save=document.querySelector("#mdSave");
      name.value="Saved panel";name.dispatchEvent(new Event("change",{bubbles:true}));
      save.click();
      document.querySelector('#mdDocModes [data-doc="assembly"]').click();
      return [save.getAttribute("aria-busy"),name.value];
    });
    assert.deepEqual(savingPart,["true","Before"]);
    await page.waitUntil(()=>!document.querySelector("#mdSave").hasAttribute("aria-busy"),{what:"Part save to finish in assembly"});
    const storedPart=await page.eval(async()=>(await (await import("/js/core/model_library_store.js")).loadModelLibrary()).find(p=>p.key==="panel").name);
    assert.equal(storedPart,"Saved panel");
    assert.equal(await page.eval(()=>document.querySelector("#mdSave").classList.contains("is-dirty")),true);
  } finally { await page.close(); }
});
