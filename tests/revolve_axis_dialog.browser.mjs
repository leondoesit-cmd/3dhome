import test from "node:test";
import assert from "node:assert/strict";
import { findChrome, openPage } from "../tools/browser_harness.mjs";

import {createPartDocument,createFeatureDefinition,recordSketchInHistory} from "../js/core/parametric_document.js";
import {resolveSketchAxis,axisMeridian,sketchAxisReference} from "../js/core/revolve_geometry.js";
import {movePart,mirrorProjectionPart,placePatternCopy} from "../js/modeler_part_geometry.js";
import {resolveSketchProfile} from "../js/cad_feature_tree.js";
import {makeBrepRevolve,shapeMassProperties,disposeBrep} from "../js/cad_kernel.js";

const opts=await findChrome()?{timeout:180000}:{skip:"Chrome unavailable"};
const axisField='#mdQuickSettings [data-parameter="$axisReference"] select';
const applyForm=page=>page.eval(()=>document.querySelector("#mdQuickSettings .md-feature-actions .ph-check").closest("button").click());

test("Boss preselects a profile edge, Edit accepts a centerline, and Cut retains its own sketch axis",opts,async()=>{
  const page=await openPage({width:1400,height:950,lang:"en",mobile:false,touch:false});
  try{
    await page.waitForBoot();
    await page.eval(async()=>{
      const {createPartDocument,recordSketchInHistory}=await import("/js/core/parametric_document.js");
      const {openModeler}=await import("/js/modeler.js");
      const doc=createPartDocument({name:"Handle",metadata:{authoringSystem:"parametric-v1"}});
      const points=[[-12,10],[12,10],[12,14],[-12,14],[-8,8],[8,8],[-8,12],[8,12]].map(([x,y],i)=>({id:i+1,x,y,fixed:true}));
      const entities=[1,2,3,4].map((a,i)=>({id:i+11,type:"line",a,b:i===3?1:a+1}));
      entities.push({id:15,type:"line",a:5,b:6,construction:true},{id:16,type:"line",a:7,b:8,construction:true});
      recordSketchInHistory(doc,{id:"handle",name:"Handle profile",plane:"front",points,entities,constraints:[]});
      doc.activeSketch="handle";openModeler(null,doc,null,true);
      document.querySelector("#modeler .md-tree-sketch").click();
      document.querySelector('#mdModes [data-mode="2d"]').click();
    });
    await page.waitUntil(()=>window.cadSketchSnapshot().phase==="sketch");
    const picked=await page.eval(()=>{
      const canvas=document.getElementById("mdCanvas"),rect=canvas.getBoundingClientRect();
      const [a,b]=window.cadSketchSnapshot().screenPoints;
      for(const type of ["pointermove","pointerdown","pointerup"])canvas.dispatchEvent(new PointerEvent(type,{
        bubbles:true,cancelable:true,pointerId:1,pointerType:"mouse",isPrimary:true,button:0,buttons:type==="pointerdown"?1:0,
        clientX:rect.left+(a.x+b.x)/2,clientY:rect.top+(a.y+b.y)/2
      }));
      return window.cadSelectionSnapshot().sketchSel;
    });
    assert.equal(picked,1);
    await page.eval(()=>{window.__modelerRunCommand("finishsketch");window.__modelerRunCommand("revolvefeature");});
    const field=axisField;
    const options=await page.eval(selector=>{
      const input=document.querySelector(selector);
      return {value:input.value,options:[...input.options].map(o=>o.value)};
    },field);
    assert.equal(options.value,"axis:line:11");
    for(const value of ["axis:x","axis:y","axis:z","axis:line:15"])assert.ok(options.options.includes(value));
    const apply=()=>applyForm(page);
    await apply();
    await page.waitUntil(()=>window.cadFeatureTreeSnapshot().some(f=>f.type==="revolve"));
    const feature=await page.eval(()=>window.cadFeatureTreeSnapshot().find(f=>f.type==="revolve"));
    assert.equal(feature.params.axis,"axis:line:11");
    const bounds=await page.eval(()=>window.cadLiveEditSnapshot().bodies[0].bounds);
    assert.ok(Math.abs(bounds.y0-6)<.02 && Math.abs(bounds.y1-14)<.02,JSON.stringify(bounds));
    await page.eval(id=>window.cadEditFeatureParams(id,{}),feature.id);
    assert.equal(await page.eval(s=>document.querySelector(s).value,field),"axis:line:11");
    const invalid=await page.eval(s=>{
      const input=document.querySelector(s);input.value="axis:line:16";
      input.dispatchEvent(new Event("change",{bubbles:true}));
      return window.cadFinishPreviewSnapshot().badge.text;
    },field);
    assert.match(invalid,/crosses the axis/);
    assert.equal(await page.eval(()=>window.cadFeatureTreeSnapshot().find(f=>f.type==="revolve").params.axis),"axis:line:11");
    await page.eval(s=>{
      const input=document.querySelector(s);input.value="axis:line:15";
      input.dispatchEvent(new Event("change",{bubbles:true}));
    },field);
    await apply();
    assert.equal(await page.eval(()=>window.cadFeatureTreeSnapshot().find(f=>f.type==="revolve").params.axis),"axis:line:15");
    const edited=await page.eval(()=>window.cadLiveEditSnapshot().bodies[0].bounds);
    assert.ok(Math.abs(edited.y0-2)<.02 && Math.abs(edited.y1-14)<.02,JSON.stringify(edited));
    await page.eval(()=>window.__modelerRunCommand("revolvecutfeature"));
    const preview=await page.eval(s=>{
      const input=document.querySelector(s);input.value="axis:line:11";
      input.dispatchEvent(new Event("change",{bubbles:true}));
      window.cadSetFeatureFormParams({});
      return window.cadFinishPreviewSnapshot();
    },field);
    assert.equal(preview.parts[0]?.color,"#d75a4a",JSON.stringify(preview.badge));
    await apply();
    await page.waitUntil(()=>window.cadFeatureTreeSnapshot().some(f=>f.type==="revolveCut"));
    const cut=await page.eval(()=>window.cadFeatureTreeSnapshot().find(f=>f.type==="revolveCut"));
    assert.equal(cut.params.axis,"axis:line:11");
    assert.deepEqual(cut.inputs,[feature.id]);
    await page.waitUntil(async()=>{
      const {loadModelerDraftRecord}=await import("/js/core/model_library_store.js");
      const draft=await loadModelerDraftRecord(sessionStorage.getItem("home3d_modeler_tab_id"));
      return draft?.def?.features?.some(f=>f.type==="revolveCut" && f.params.axis==="axis:line:11");
    },{ms:60000,what:"saved revolve cut"});
    const reopened=await page.eval(async selector=>{
      const {loadModelerDraftRecord}=await import("/js/core/model_library_store.js");
      const {openModeler}=await import("/js/modeler.js");
      const {def}=await loadModelerDraftRecord(sessionStorage.getItem("home3d_modeler_tab_id"));
      const cut=def.features.find(f=>f.type==="revolveCut");
      openModeler(null,def,null,true);window.cadEditFeatureParams(cut.id,{});
      return document.querySelector(selector).value;
    },field);
    assert.equal(reopened,"axis:line:11");
  }finally{await page.close();}
});

test("an ordinary axis sharing a contour endpoint enables solid Boss and Cut and is excluded from both profiles",opts,async()=>{
  const page=await openPage({width:1400,height:950,lang:"en",mobile:false,touch:false});
  try{
    for(const type of ["revolve","revolveCut"]){
      await page.eval(async type=>{
        const {createPartDocument,createFeatureDefinition,recordSketchInHistory}=await import("/js/core/parametric_document.js");
        const {openModeler}=await import("/js/modeler.js");
        const doc=createPartDocument({name:"Connected axis",metadata:{authoringSystem:"parametric-v1"}});
        if(type==="revolveCut"){
          const host=createFeatureDefinition(doc,"box",{params:{x:-14,y:3,z:-7,w:28,h:14,d:14}});
          doc.parts=[{id:"stock",featureId:host.id,kind:"box",x0:-14,x1:14,y0:3,y1:17,z0:-7,z1:7}];
        }
        const points=[[-12,10],[12,10],[12,14],[-12,14],[-28,10]].map(([x,y],i)=>({id:i+1,x,y,fixed:true}));
        const entities=[1,2,3,4].map((a,i)=>({id:11+i,type:"line",a,b:i===3?1:a+1}));
        entities.push({id:15,type:"line",a:1,b:5});
        recordSketchInHistory(doc,{id:"handle",name:"Handle profile",plane:"front",points,entities,constraints:[]});
        doc.activeSketch="handle";openModeler(null,doc,null,true);
        document.querySelector("#modeler .md-tree-sketch").click();
        document.querySelector('#mdModes [data-mode="2d"]').click();
      },type);
      await page.waitUntil(()=>window.cadSketchSnapshot().phase==="sketch");
      const command=type==="revolve"?"revolvefeature":"revolvecutfeature";
      const ready=await page.eval(command=>{
        const canvas=document.getElementById("mdCanvas"),rect=canvas.getBoundingClientRect();
        const points=window.cadSketchSnapshot().screenPoints;
        for(const type of ["pointermove","pointerdown","pointerup"])canvas.dispatchEvent(new PointerEvent(type,{
          bubbles:true,cancelable:true,pointerId:1,pointerType:"mouse",isPrimary:true,button:0,buttons:type==="pointerdown"?1:0,
          clientX:rect.left+(points[0].x+points[4].x)/2,clientY:rect.top+(points[0].y+points[4].y)/2
        }));
        window.__modelerRunCommand("finishsketch");
        window.__modelerRunCommand(command);
        return document.querySelector('#mdQuickSettings [data-parameter="$axisReference"] select')?.value;
      },command);
      assert.equal(ready,"axis:line:15");
      assert.equal(await page.eval(()=>window.cadFinishPreviewSnapshot().params.thinFeature),false);
      await applyForm(page);
      await page.waitUntil(()=>window.cadFeatureTreeSnapshot().some(f=>["revolve","revolveCut"].includes(f.type)));
      const result=await page.eval(t=>window.cadFeatureTreeSnapshot().find(f=>f.type===t),type);
      assert.equal(result.params.axis,"axis:line:15");
      assert.deepEqual([...result.params.profileEntityIds].sort((a,b)=>a-b),[11,12,13,14]);
    }
  }finally{await page.close();}
});

test("circle crossing an oblique axis between samples blocks both creation and editing",opts,async()=>{
  const page=await openPage({width:1400,height:950,lang:"en",mobile:false,touch:false});
  try{
    await page.eval(async()=>{
      const {createPartDocument,recordSketchInHistory}=await import("/js/core/parametric_document.js");
      const {openModeler}=await import("/js/modeler.js");
      const doc=createPartDocument({name:"Circle crossing",metadata:{authoringSystem:"parametric-v1"}});
      const dx=Math.cos(.071),dy=Math.sin(.071);
      const points=[[0,0],[dx,dy],[-.99*dy,.99*dx],[0,-2],[dx,dy-2]].map(([x,y],i)=>({id:i+1,x,y,fixed:true}));
      recordSketchInHistory(doc,{id:"circle",plane:"front",points,constraints:[],entities:[
        {id:"ring",type:"circle",c:3,r:1},{id:"bad",type:"line",a:1,b:2,construction:true},
        {id:"good",type:"line",a:4,b:5,construction:true}
      ]});
      openModeler(null,doc,null,true);window.__modelerRunCommand("revolvefeature");
    });
    const choose=async id=>page.eval((selector,id)=>{
      const input=document.querySelector(selector);input.value="axis:line:"+id;
      input.dispatchEvent(new Event("change",{bubbles:true}));
    },axisField,id);
    await choose("bad");
    await page.eval(()=>window.cadSetFeatureFormParams({}));
    assert.match((await page.eval(()=>window.cadFinishPreviewSnapshot())).badge.text,/crosses the axis/);
    await applyForm(page);
    assert.equal(await page.eval(()=>window.cadFeatureTreeSnapshot().some(f=>f.type==="revolve")),false);
    await choose("good");await applyForm(page);
    await page.waitUntil(()=>window.cadFeatureTreeSnapshot().some(f=>f.type==="revolve"));
    await page.eval(()=>window.cadEditFeatureParams(window.cadFeatureTreeSnapshot().find(f=>f.type==="revolve").id,{}));
    await choose("bad");
    assert.match((await page.eval(()=>window.cadFinishPreviewSnapshot())).badge.text,/crosses the axis/);
    await applyForm(page);
    assert.equal(await page.eval(()=>window.cadFeatureTreeSnapshot().find(f=>f.type==="revolve").params.axis),"axis:line:good");
  }finally{await page.close();}
});

function legacyTurn(copyKind){
  const doc=createPartDocument({key:"legacy-turn-"+copyKind,name:"Legacy turn "+copyKind,metadata:{authoringSystem:"legacy-adapter"}});
  const points=[[0,10],[6,10],[6,12],[0,12]].map(([x,y],i)=>({id:i+1,x,y,fixed:true}));
  const entities=points.map((p,i)=>({id:i+11,type:"line",a:p.id,b:points[(i+1)%4].id}));
  const sketch={id:"section",plane:"front",offset:4,points,entities,constraints:[]};
  const axis=sketchAxisReference(11),axisBasis=resolveSketchAxis(sketch,axis);
  const ids=entities.map(e=>e.id);
  const part={id:"body",featureId:"turn",kind:"rev",axis,axisBasis,angle:90,x:0,y:0,z:0,sketchDriven:true,
    sketchId:sketch.id,profileEntityIds:ids,pts:points.map(p=>axisMeridian(axisBasis,{u:p.x,v:p.y}))};
  if(copyKind==="moved"){
    recordSketchInHistory(doc,sketch);
    createFeatureDefinition(doc,"revolve",{id:"turn",references:{sketches:[sketch.id],references:[axis]},
      params:{axis,angle:90,sketchId:sketch.id,profileEntityIds:ids,useSketchPlane:true}});
    movePart(part,7,3,-2);
  }else if(copyKind==="mirror")mirrorProjectionPart(part,"plane:right");
  else placePatternCopy(part,{mode:"linear"},{x:7,y:3,z:-2});
  doc.parts=[part];
  return doc;
}

async function saveAndReopen(page,doc){
  await page.eval(async doc=>{
    const {openModeler}=await import("/js/modeler.js");
    openModeler(null,doc,null,true);document.getElementById("mdSave").click();
  },doc);
  await page.waitUntil(async()=>{
    const {loadModelLibrary}=await import("/js/core/model_library_store.js");
    const name=document.getElementById("mdName").value;
    return (await loadModelLibrary()).some(d=>d.name===name);
  },{ms:30000,what:"legacy part saved to library"});
  return page.eval(async key=>{
    const {loadModelLibrary}=await import("/js/core/model_library_store.js");
    const {openModeler}=await import("/js/modeler.js");
    const saved=(await loadModelLibrary()).find(d=>d.key===key);
    openModeler(key,saved,null);
    return {saved,bounds:window.cadLiveEditSnapshot().bodies[0].bounds};
  },doc.key);
}

test("legacy save, normalization and reopen keep the moved 90-degree revolve aligned with the exact solid",opts,async()=>{
  const page=await openPage({width:1400,height:950,lang:"en"});
  try{
    const {saved,bounds}=await saveAndReopen(page,legacyTurn("moved"));
    const params=saved.features.find(f=>f.id==="turn").params;
    assert.deepEqual([params.x,params.y,params.z],[7,3,-2]);
    assert.equal(params.sketchId,"section");
    assert.deepEqual(params.profileEntityIds,[11,12,13,14]);
    const brep=await makeBrepRevolve(resolveSketchProfile(saved,params));
    try{
      const mass=await shapeMassProperties(brep);
      for(const k of ["x","y","z"]){
        assert.ok(Math.abs(bounds[k+"0"]-mass.bounds.min[k])<1e-5,JSON.stringify(bounds));
        assert.ok(Math.abs(bounds[k+"1"]-mass.bounds.max[k])<1e-5,JSON.stringify(bounds));
      }
    }finally{disposeBrep(brep);}
  }finally{await page.close();}
});

test("saved standalone mirror and linear-pattern revolve copies accept an angle edit without a sketch",opts,async()=>{
  const page=await openPage({width:1400,height:950,lang:"en"});
  try{
    for(const kind of ["mirror","pattern"]){
      const {saved}=await saveAndReopen(page,legacyTurn(kind));
      const original=saved.features.find(f=>f.id==="turn").params;
      assert.ok(original.axisBasis && !original.sketchId);
      await page.eval(()=>{
        window.cadEditFeatureParams("turn",{});
        const angle=document.querySelector('#mdQuickSettings input[data-parameter="angle"]');
        angle.value="45";angle.dispatchEvent(new Event("input",{bubbles:true}));
      });
      const thin=await page.eval(()=>{
        const form=document.getElementById("mdQuickSettings");
        const input=key=>form.querySelector('[data-parameter="'+key+'"] input,[data-parameter="'+key+'"] select');
        input("thinFeature").click();
        return {disabled:["thinFeature","thickness","thinMode"].map(k=>input(k).disabled),checked:input("thinFeature").checked};
      });
      assert.deepEqual(thin,{disabled:[true,true,true],checked:false});
      assert.equal(await page.eval(s=>document.querySelector(s).selectedOptions[0].textContent,axisField),"Stored revolve axis");
      await applyForm(page);
      assert.equal(await page.eval(()=>window.cadFinishPreviewSnapshot().formOpen),false);
      const edited=await page.eval(()=>window.cadFeatureTreeSnapshot().find(f=>f.id==="turn").params);
      assert.equal(edited.angle,45);
      assert.deepEqual(edited.axisBasis,original.axisBasis);
      assert.deepEqual(edited.points,original.points);
    }
  }finally{await page.close();}
});
