import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createHistorySnapshotCodec } from "../js/core/history_value_pool.js";
import { createNestedComponentEdit, nestedEditStillCurrent, nestedComponentOccurrence, commitNestedComponentEdit, restoreNestedComponentEdit } from "../js/core/nested_component_edit.js";
import { serializeModelerDraft, parseModelerDraft } from "../js/modeler_draft.js";
import { setComponentPattern } from "../js/core/assembly_component_pattern.js";
import { flattenAssembly } from "../js/core/assembly_structure.js";
import { buildDrawingScene } from "../js/cad_drawings.js";
import { createView } from "../js/cad_sheet.js";
import { subassemblyComponent } from "../js/core/assembly_structure.js";
import { trackLibraryOccurrence, createReferenceResolver } from "../js/core/library_occurrence.js";
import { putModelLibraryRecord, putAssemblyLibraryRecord, loadAssemblyLibrary, resolvedLibraryAssembly,
  readLibrarySource, deleteModelLibraryRecord, libraryOccurrenceUpdate } from "../js/core/model_library_store.js";

const panel = width => ({key:"panel",parts:[{kind:"box",id:"body",x0:0,x1:width,y0:0,y1:2,z0:0,z1:3}]});
function insert(record) {
  const component = record.components ? subassemblyComponent(record,{id:"door-1",transform:{x:12}})
    : {id:"panel-1",modelKey:record.key,def:structuredClone(record),transform:{x:5},grounded:true};
  trackLibraryOccurrence(component,record);
  return component;
}

test("a panel and a separately saved door update a keyed vanity drawing before the vanity is saved",async()=>{
  const original=panel(40), door={key:"door",components:[insert(original)],mates:[]};
  const vanity={key:"vanity",components:[insert(door)],mates:[],drawing:{notes:["owner annotation"]}};
  await putModelLibraryRecord(original);
  await putAssemblyLibraryRecord(door);
  await putAssemblyLibraryRecord(vanity);
  const sheet={parts:[],drawing:{views:[createView("front",{source:{kind:"assembly",key:"vanity"}})]}};
  function drawingWidth(){
    const bounds=buildDrawingScene(sheet,{holeCallouts:false}).views[0].projection.bounds;
    return bounds.u1-bounds.u0;
  }
  assert.equal(drawingWidth(),40);
  await putModelLibraryRecord(panel(60),{expected:original});
  assert.equal(drawingWidth(),60);
  const handle={id:"handle",def:panel(5),transform:{x:80}};
  await putAssemblyLibraryRecord({...door,components:[...door.components,handle]},{expected:door});
  assert.equal(drawingWidth(),80);
  const stored=(await loadAssemblyLibrary()).find(a=>a.key==="vanity");
  assert.deepEqual(stored,vanity,"opening a drawing must not write the owner's disk snapshot");
  const opened=resolvedLibraryAssembly(JSON.parse(JSON.stringify(stored)));
  assert.equal(opened.components[0].asm.components.length,2);
  assert.equal(opened.components[0].asm.components[0].def.parts[0].x1,60);
  assert.equal(opened.components[0].transform.x,12);
  opened.drawing.notes.push("my edit");
  assert.equal((await putAssemblyLibraryRecord(opened,{expected:stored})).ok,true);
  const reopened=(await loadAssemblyLibrary()).find(a=>a.key==="vanity");
  assert.deepEqual(reopened,opened);
  assert.equal(resolvedLibraryAssembly(reopened),reopened,"repeat opens do not rebuild the snapshot");
  assert.equal((await putAssemblyLibraryRecord(stored,{expected:stored})).conflict,true);
});

test("legacy, divergent and configured occurrences retain their copies while untouched siblings update",async()=>{
  const original=panel(10);
  const clean=insert(original), legacy=insert(original), local=insert(original), configured=insert(original);
  delete legacy.libraryLink;
  local.def.parts[0].x1=7;
  configured.configurationId="narrow";
  Object.assign(clean,{name:"user label",grounded:false,visible:false,transform:{rz:45}});
  const root={key:"assembly",name:"unsaved name",components:[clean,legacy,local,configured],
    topologyMates:[{id:"hinge",a:{componentId:clean.id}}],drawing:{notes:["new note"]}};
  const before=structuredClone(root);
  await putModelLibraryRecord(panel(20));
  const next=resolvedLibraryAssembly(root);
  assert.deepEqual(root,before);
  assert.equal(next.components[0].def.parts[0].x1,20);
  for(const field of ["id","name","transform","grounded","visible"])assert.deepEqual(next.components[0][field],clean[field]);
  assert.equal(next.topologyMates,root.topologyMates);
  assert.equal(next.drawing,root.drawing);
  for(const [index,reason] of [[1,"untracked"],[2,"diverged"],[3,"configured"]]){
    assert.equal(next.components[index],root.components[index]);
    assert.equal(libraryOccurrenceUpdate(next.components[index],root.key,true).issue,reason);
  }
  const nestedLegacy=subassemblyComponent({key:"door",components:[clean]});
  assert.equal(resolvedLibraryAssembly({components:[nestedLegacy]}).components[0],nestedLegacy);
  await deleteModelLibraryRecord("panel");
  assert.equal(libraryOccurrenceUpdate(clean,root.key).issue,"missing");
  assert.equal(readLibrarySource({kind:"part",key:"panel"}),null);
});

test("explicit relinking establishes a baseline and a locally edited nested assembly stays intact",()=>{
  const initial=panel(10), edited=panel(20), latest=panel(30);
  const leaf={id:"leaf",modelKey:"panel",def:structuredClone(edited)};
  trackLibraryOccurrence(leaf,edited);
  const door={key:"door",components:[leaf],mates:[]};
  const outer=insert(door), assembly={key:"vanity",components:[outer]};
  const resolver=createReferenceResolver((kind,key)=>key==="door"?door:latest);
  assert.equal(resolver.resolve(assembly).document.components[0].asm.components[0].def.parts[0].x1,30);
  outer.asm.components[0].transform={x:92};
  outer.asm.mates.push({id:"instance-mate"});
  const kept=resolver.resolve(assembly);
  assert.equal(kept.issue,"diverged");
  assert.equal(kept.document,assembly);
  assert.deepEqual(outer.asm.mates,[{id:"instance-mate"}]);
});

test("a keyed cycle terminates and keeps the old occurrence even with a warm resolver",()=>{
  const a={key:"a",components:[]}, b={key:"b",components:[]};
  const ar=insert(a), br=insert(b);
  const records={a:{...a,components:[br]},b:{...b,components:[ar]}};
  const owner={key:"owner",components:[insert(a)]};
  const resolver=createReferenceResolver((kind,key)=>records[key]);
  for(const document of [owner,records.b,records.a,owner]){
    const resolved=resolver.resolve(document);
    assert.equal(resolved.issue,"cycle");
    assert.equal(resolved.document,document);
  }
});

test("an explicit parent Save keeps later edits dirty while advancing only its stored baseline", async()=>{
  const { modelerSource } = await import("./helpers/modeler_source.mjs");
  const { sourceFunctionText, withSetters } = await import("./helpers/source_function.mjs");
  const document={key:"race-owner",name:"Original",components:[insert(panel(10))],mates:[]};
  await putModelLibraryRecord(panel(20));
  await putAssemblyLibraryRecord(document);
  const E={docType:"assembly",assembly:structuredClone(document)};
  let history=1, drafts=0, clean=0, discarded=0;
  const session={};
  const context={E,currentHistoryNode:()=>history,assemblyOpenBaseline:structuredClone(document),
    assemblySaveSession:()=>session,H:{generation:1,editRevision:()=>history},syncDirty:()=>{},
    resolvedLibraryAssembly,cloneData:structuredClone,applyAssemblyMates:()=>{},redrawTrackedUpdates:()=>{},
    rejectFlexibleSpringPreview:()=>false,root:{querySelector:()=>({value:"Edited name"})},
    setDocumentDescription:()=>{},refreshLib:()=>{},scheduleModelerDraft:()=>drafts++,
    markDocumentClean:()=>clean++,reconcileModelerDraft:()=>drafts++,
    saveAssemblies:async(record,options)=>{
      E.assembly.name="Newer unsaved name";history++;
      return (await putAssemblyLibraryRecord(record,options)).ok;
    }};
  const source=modelerSource();
  const save=new Function(...Object.keys(context),withSetters(sourceFunctionText(source,"applyTrackedUpdates")+
    sourceFunctionText(source,"saveAssemblyDocument")+";return async()=>{await saveAssemblyDocument();return assemblyOpenBaseline;}"))(...Object.values(context));
  const baseline=await save();
  const stored=(await loadAssemblyLibrary()).find(record=>record.key===document.key);
  assert.deepEqual(stored,baseline);
  assert.equal(stored.components[0].def.parts[0].x1,20);
  assert.equal(stored.name,"Edited name");
  assert.equal(E.assembly.name,"Newer unsaved name");
  assert.deepEqual({drafts,clean,discarded},{drafts:1,clean:0,discarded:0});
});

test("library notifications defer a dirty assembly and update a clean assembly in place", async()=>{
  const { modelerSource }=await import("./helpers/modeler_source.mjs");
  const { sourceFunctionText, withSetters }=await import("./helpers/source_function.mjs");
  const original=panel(40), component=insert(original);
  await putModelLibraryRecord(panel(60));
  const E={open:true,docType:"assembly",assembly:{key:"open-parent",components:[component]},sel:component};
  let dirty=true, staged=false, redraws=0;
  const context={E,modelLibraryCache:[],assemblyLibraryCache:[],loadModelLibrary:async()=>[],
    loadAssemblyLibrary:async()=>[],writeLibraryIndex(){},writeAssemblyIndex(){},root:{querySelector:()=>null},
    refreshCatalogSelect(){},refreshLib(){},refreshComponents(){},documentDirty:()=>dirty,
    document:{activeElement:{matches:()=>staged}},motionPlaybackCancel:null,documentSaveTasks:new WeakMap(),assemblySaveSession:doc=>doc,
    resolvedLibraryAssembly,redrawTrackedUpdates:()=>redraws++};
  const source=modelerSource();
  const refresh=new Function(...Object.keys(context),withSetters(sourceFunctionText(source,"applyTrackedUpdates")+
    sourceFunctionText(source,"refreshLibraryFromOtherTab")+";return refreshLibraryFromOtherTab;"))(...Object.values(context));
  await refresh();dirty=false;staged=true;await refresh();
  assert.equal(component.def.parts[0].x1,40);
  staged=false;await refresh();await refresh();
  assert.equal(E.sel,component);
  assert.equal(E.assembly.components[0],component);
  assert.equal(component.def.parts[0].x1,60);
  assert.equal(redraws,1);
});

function patternedDoor(){
  const seed=insert(panel(10));
  const plate={id:"plate",def:{parts:[{id:"body"}],features:[
    {id:"hole",type:"hole"},{id:"holes",type:"pattern",params:{mode:"linear",scope:"feature",
      seedFeatureId:"hole",count:2,spacing:5,directionAxis:"x"}}]}};
  const door={key:"pattern-door",components:[seed,plate],mates:[]};
  assert.deepEqual(setComponentPattern(door,{id:"P",seedId:seed.id,carrierId:plate.id,featureId:"holes"}),[]);
  return door;
}
test("traversing a refreshed nested pattern does not detach the next seed revision",()=>{
  const door=patternedDoor();
  const owner={key:"owner",components:[insert(door)]};
  function resolve(document,width){
    return createReferenceResolver((kind,key)=>key===door.key?door:panel(width)).resolve(document);
  }
  const first=resolve(owner,20).document;
  flattenAssembly(first);
  const next=resolve(JSON.parse(JSON.stringify(first)),30);
  const patterned=next.document.components[0].asm;
  flattenAssembly(next.document);
  assert.equal(patterned.components.find(c=>c.componentPattern).def.parts[0].x1,30);
  assert.equal(patterned.components[0].def.parts[0].x1,30);
  assert.equal(next.issue,undefined);
  patterned.components.find(c=>c.componentPattern).explodedOffset={x:12};
  assert.equal(resolve(next.document,40).issue,"diverged","per-copy presentation is authored");
});

test("a previously replayed v1 copy can migrate only with proof of its embedded baseline",()=>{
  const digest=document=>createHash("sha256").update(JSON.stringify(document)).digest("hex");
  const door=patternedDoor();
  for(const row of door.components)if(row.libraryLink)row.libraryLink.version=1;
  const outer=insert(door), seed=outer.asm.components[0];
  seed.def=panel(20);
  seed.libraryLink={...seed.libraryLink,source:digest(seed.def),embedded:digest(seed.def)};
  // Old Save: the seed is at 20 and the generated row still holds 10.
  const fingerprint=digest(outer.asm);
  Object.assign(outer.libraryLink,{version:1,source:fingerprint,embedded:fingerprint});
  const owner={key:"owner",components:[outer]};
  flattenAssembly(owner);
  const resolver=createReferenceResolver((kind,key)=>key===door.key?door:panel(30));
  const updated=resolver.resolve(owner);
  assert.equal(updated.issue,undefined);
  assert.equal(updated.document.components[0].libraryLink.version,3);
  assert.equal(updated.document.components[0].asm.components.find(c=>c.componentPattern).def.parts[0].x1,30);
  outer.asm.components.find(c=>c.componentPattern).explodedOffset={x:9};
  assert.equal(resolver.resolve(owner).issue,"diverged");
});

test("a suppressed upstream pattern drops its generated rows and recovers after cold traversal",()=>{
  const door=patternedDoor(), carrier=door.components[1];
  const other={...structuredClone(carrier),id:"other-plate"};
  door.components.push(other);
  assert.deepEqual(setComponentPattern(door,{id:"Q",seedId:door.components[0].id,carrierId:other.id,featureId:"holes"}),[]);
  carrier.modelKey=carrier.def.key="carrier";
  trackLibraryOccurrence(carrier,carrier.def);
  const owner={key:"owner",components:[insert(door)]};
  function resolve(assembly,suppressed){
    const part=structuredClone(carrier.def);
    part.features.find(f=>f.id==="holes").suppressed=suppressed;
    return createReferenceResolver((kind,key)=>key===door.key?door:key==="carrier"?part:panel(10)).resolve(assembly);
  }
  const invalid=resolve(owner,true).document;
  const embedded=invalid.components[0].asm;
  assert.deepEqual(embedded.components.filter(c=>c.componentPattern).map(c=>c.componentPattern.patternId),["Q"]);
  const before=structuredClone(embedded);
  flattenAssembly(invalid);
  assert.deepEqual(embedded,before);
  const restored=resolve(JSON.parse(JSON.stringify(invalid)),false);
  assert.equal(restored.issue,undefined);
  const components=restored.document.components[0].asm.components;
  assert.equal(components.find(c=>c.id===carrier.id).def.features[1].suppressed,false);
  assert.deepEqual(components.filter(c=>c.componentPattern).map(c=>c.componentPattern.patternId),["P","Q"]);
  embedded.components.find(c=>c.componentPattern).explodedOffset={x:2};
  assert.equal(resolve(invalid,false).issue,"diverged","local presentation on the surviving copy stays protected");
});

test("an older invalid-pattern snapshot recovers only when the saved fingerprint can be proved",()=>{
  const door=patternedDoor(), carrier=door.components[1];
  carrier.modelKey=carrier.def.key="carrier";
  trackLibraryOccurrence(carrier,carrier.def);
  const outer=insert(door), innerCarrier=outer.asm.components[1];
  const digest=doc=>createHash("sha256").update(JSON.stringify(doc)).digest("hex");
  innerCarrier.def.features[1].suppressed=true;
  innerCarrier.libraryLink={...innerCarrier.libraryLink,version:2,source:digest(innerCarrier.def),embedded:digest(innerCarrier.def)};
  // Version 2 stored the suppressed carrier alongside the stale generated row.
  const oldDigest=digest(outer.asm);
  outer.libraryLink={...outer.libraryLink,version:2,source:oldDigest,embedded:oldDigest};
  const owner={key:"owner",components:[outer]};
  function resolve(){
    return createReferenceResolver((kind,key)=>key===door.key?door:key==="carrier"?carrier.def:panel(10)).resolve(owner);
  }
  assert.equal(resolve().issue,undefined,"literal snapshot still matches");
  flattenAssembly(owner);
  assert.equal(outer.asm.components.length,2);
  const updated=resolve();
  assert.equal(updated.issue,undefined);
  assert.equal(updated.document.components[0].libraryLink.version,3);
  assert.equal(updated.document.components[0].asm.components.length,3);
  innerCarrier.name="Local override";
  assert.equal(resolve().issue,"diverged");
  delete innerCarrier.name;
  door.components.find(c=>c.componentPattern).explodedOffset={x:5};
  assert.equal(resolve().issue,"diverged","the earlier generated row is unavailable");
});

async function pendingAssemblySave(original,options={}){
  const { modelerSource }=await import("./helpers/modeler_source.mjs");
  const { sourceFunctionText, withSetters, documentHistoryText }=await import("./helpers/source_function.mjs");
  const { createHistory }=await import("../js/edit_history.js");
  await putAssemblyLibraryRecord(original);
  const E={open:true,docType:"assembly",assembly:structuredClone(original),def:{name:"Part"}};
  let drafts=0,discards=0,writes=0,finishWrite,prompts=0,reports=0;
  let draft;
  const noop=()=>{};
  const button={dataset:{},busy:false,removeAttribute(key){if(key==="aria-busy")this.busy=false;}};
  const context={E,createHistory,assemblyOpenBaseline:structuredClone(original),cloneData:structuredClone,
    askModelerDecision:async()=>{prompts++;return options.decide ? options.decide() : false;},closeModeler:()=>{E.open=false;},report:()=>reports++,lastAssemblySaveConflict:true,
    root:{classList:{remove:noop},querySelector:selector=>selector==="#mdSave"?button:{value:selector==="#mdName"?(E.docType==="part"?E.def:E.assembly).name:""}},setDocumentDescription:noop,applyTrackedUpdates:()=>false,
    applyAssemblyMates:noop,rejectFlexibleSpringPreview:()=>false,refreshLib:noop,syncDirty:noop,
    discardModelerDraft:()=>{discards++;draft=null;},flash:noop,t:k=>k,
    saveModelerDraftRecord:async record=>{drafts++;draft=structuredClone(record);},serializeModelerDraft,parseModelerDraft,
    S:{idc:0},newDef:()=>({key:"new-part",parts:[]}),newAssembly:()=>({key:"new-assembly",components:[]}),nextDocumentNumericId:()=>1,ensureParametricDocument:doc=>doc,restoreNestedComponentEdit,
    ensureSketchDoc:noop,migrateDefinitionProfileCuts:noop,restoreKernelBodies:noop,ensureSketch:()=>({id:"s"}),solveSketch:noop,scheduleExactRestore:noop,
    updateTourProgress:noop,syncDraftStatus:noop,syncAssemblyWorkflow:noop,closeEvalCard:noop,
    syncHead:noop,invalidateDrawing:noop,invalidateInterference:noop,refreshAll:noop,scanDoc:()=>[],docSubtree:()=>[],
    syncUndoButtons:noop,historySnapshots:createHistorySnapshotCodec(["meshData","exactTopologyCache"]),documentSaveTasks:new WeakMap(),
    motionPlaybackCancel:null,saveProgress:()=>{button.busy=true;},
    createNestedComponentEdit,nestedEditStillCurrent,nestedComponentOccurrence,commitNestedComponentEdit,
    isSubassembly:()=>false,setDocumentType:type=>{E.docType=type;},setTab:noop,fitPreview:noop,
    clearContextPartInteraction:noop,isCanonicalAuthoring:()=>false,solveAssembly:noop,
    hasSaveableModelContent:()=>true,standardsGate:()=>true,rebuildFeatureTreeFromDocument:noop,pruneAbandonedSketches:noop,
    pruneSketchTargetedBodyAppearances:noop,pruneSketchMaterialFields:noop,normalizeDef:noop,inferAuthoringMode:()=>"legacy",
    modelParameterOverrides:()=>({}),rebuildDefinition:()=>({ok:true}),applyTopologyRebindings:()=>[],externalizeAttachments:async d=>d,
    registerCustomModel:noop,commitDefinition:()=>({affected:[]}),refreshCatalogSelect:noop,document:{getElementById:()=>null},render2D:noop,
    publishRebuildStatus:noop,refreshModelHistoryPane:noop,refreshParts:noop,syncCoach:noop,tf:k=>k,
    saveLib:async(record,options)=>{
      const writable=await new Promise(resolve=>{finishWrite=resolve;});
      return writable && (await putModelLibraryRecord(record,options)).ok;
    },
    saveAssemblies:async(record,options)=>{
      writes++;
      const writable=await new Promise(resolve=>{finishWrite=resolve;});
      if (!writable) return false;
      const result=await putAssemblyLibraryRecord(record,options);
      return result.ok;
    }};
  const source=modelerSource(),historyCode=documentHistoryText(source);
  const api=new Function(...Object.keys(context),withSetters(sourceFunctionText(source,"snapDoc")+historyCode+
    "var libraryOpenBaseline=null,draftRevision=0,draftSaveTimer=0,modelerDraftCache,modelerDraftOwnerId='tab',draftFailureReported=false;"+
    "function pushUndo(label,tag,scope){H.push(label,tag,scope);scheduleModelerDraft();}function scheduleModelerDraft(){flushModelerDraft();}"+
    ["saveAssemblyDocument","saveModel","saveCurrentDocument","currentHistoryNode","markDocumentClean","documentDirty","confirmDiscardDocument","requestCloseModeler","newModel","openModeler","beginContextPart","finishContextPart",
      "flushModelerDraft","restoreModelerDraft","reconcileModelerDraft"].map(name=>{
        const fn=sourceFunctionText(source,name);
        // The planner properties pane needs a GPU. Exercise the actual Part write with a headless repaint.
        return name==="saveModel" ? fn.replace('import("../ui_props.js")','Promise.resolve({fillProps(){}})') : fn;
      }).join("\n")+
    ";return {history:H,saveCurrentDocument,markDocumentClean,documentDirty,confirmDiscardDocument,requestCloseModeler,newModel,openModeler,beginContextPart,finishContextPart,flushModelerDraft,restoreModelerDraft,reconcileModelerDraft,residentDirtyState,baseline:()=>assemblyOpenBaseline,partBaseline:()=>libraryOpenBaseline};"))(...Object.values(context));
  api.history.seed();api.markDocumentClean();
  return {api,E,button,finishWrite:(writable=true)=>finishWrite(writable),counts:()=>({drafts,discards,writes}),draft:()=>draft,
    prompts:()=>prompts,reports:()=>reports};
}
test("Undo during Save keeps the restored assembly dirty and its next Save uses the committed baseline",async()=>{
  const original={key:"undo-during-save",name:"Before",components:[],mates:[]};
  const {api,E,finishWrite,counts}=await pendingAssemblySave(original);
  const history=api.history;
  history.push("rename");E.assembly.name="After";
  const pending=api.saveCurrentDocument();
  history.undo();
  assert.equal(api.saveCurrentDocument(),pending,"Undo must not start a parallel write to the same document");
  finishWrite();await pending;
  assert.equal(api.baseline().name,"After");
  assert.equal(E.assembly.name,"Before");
  assert.equal(api.documentDirty(),true);
  assert.deepEqual(counts(),{drafts:1,discards:0,writes:1});
  const retry=api.saveCurrentDocument();finishWrite();await retry;
  assert.equal(api.documentDirty(),false);
  assert.equal((await loadAssemblyLibrary()).find(a=>a.key===original.key).name,"Before");
  // Reopening the same library key creates a separate document session.
  history.push("rename");E.assembly.name="Third";
  const previousSession=api.saveCurrentDocument();
  E.assembly=structuredClone(original);
  finishWrite();await previousSession;
  assert.equal(api.baseline().name,"Before");
  assert.equal((await loadAssemblyLibrary()).find(a=>a.key===original.key).name,"Third");
  assert.equal(counts().writes,3);
});

test("finishing an in-context edit during Save keeps the newer geometry dirty and recoverable",async()=>{
  const original={key:"context-save",name:"Assembly",components:[insert(panel(10))]};
  const {api,E,finishWrite,draft,counts}=await pendingAssemblySave(original);
  api.history.push("rename");E.assembly.name="Renamed";
  const before=api.history.tree().find(n=>n.current).i;
  const pending=api.saveCurrentDocument();
  api.beginContextPart(E.assembly.components[0],false);
  E.def.parts[0].x1=20;
  assert.equal(await api.finishContextPart(),true);
  assert.equal(api.history.tree().find(n=>n.current).i,before,"new history reused the saved node number");
  finishWrite();await pending;
  const stored=(await loadAssemblyLibrary()).find(a=>a.key===original.key);
  assert.deepEqual(api.baseline(),stored);
  assert.equal(stored.components[0].def.parts[0].x1,10);
  assert.equal(E.assembly.components[0].def.parts[0].x1,20);
  assert.equal(api.documentDirty(),true);
  assert.equal(counts().discards,0);
  assert.equal(draft().assembly.components[0].def.parts[0].x1,20);
  const retry=api.saveCurrentDocument();finishWrite();await retry;
  assert.equal(api.baseline().components[0].def.parts[0].x1,20);
  assert.equal(api.documentDirty(),false);
});

test("a completed assembly write advances its baseline while Part remains active",async()=>{
  const original={key:"switch-save",name:"Before",components:[]};
  const {api,E,finishWrite,counts,button}=await pendingAssemblySave(original);
  api.history.push("rename");E.assembly.name="First save";
  const pending=api.saveCurrentDocument();
  E.docType="part";api.history.push("edit part");E.def.name="Unsaved part";
  finishWrite();await pending;
  assert.equal(button.busy,false);
  assert.equal(api.baseline().name,"First save");
  assert.equal(E.def.name,"Unsaved part");
  assert.equal(api.documentDirty(),true);
  assert.equal(counts().discards,0);
  E.docType="assembly";api.history.push("rename");E.assembly.name="Second save";
  const retry=api.saveCurrentDocument();finishWrite();await retry;
  assert.equal((await loadAssemblyLibrary()).find(a=>a.key===original.key).name,"Second save");
});

test("Undo after saving an assembly while Part is active requires a discard decision",async()=>{
  const original={key:"switch-undo",name:"Before",components:[]};
  const {api,E,finishWrite,prompts}=await pendingAssemblySave(original);
  api.history.push("Rename");E.assembly.name="After";
  const pending=api.saveCurrentDocument();
  E.docType="part";
  finishWrite();await pending;
  assert.equal((await loadAssemblyLibrary()).find(a=>a.key===original.key).name,"After");
  assert.equal(api.baseline().name,"After");
  E.docType="assembly";api.history.undo();
  assert.equal(E.assembly.name,"Before");
  assert.equal(api.documentDirty(),true);
  assert.equal(await api.confirmDiscardDocument("unsavedClose"),false);
  assert.equal(prompts(),1);
  api.history.redo();
  assert.equal(E.assembly.name,"After");
  assert.equal(api.documentDirty(),false);
});

test("an assembly save conflict keeps its previous clean node independently of Part",async()=>{
  const original={key:"switch-conflict",name:"Before",components:[]};
  const {api,E,finishWrite,reports}=await pendingAssemblySave(original);
  api.history.push("Rename");E.assembly.name="After";
  const pending=api.saveCurrentDocument();
  E.docType="part";api.markDocumentClean();
  await putAssemblyLibraryRecord({...original,name:"Other writer"},{expected:original});
  finishWrite();await pending;
  assert.equal(reports(),1);
  assert.equal(api.documentDirty(),false,"the Part clean marker survives the failed write");
  E.docType="assembly";
  assert.deepEqual(api.baseline(),original);
  assert.equal(api.documentDirty(),true);
  api.history.undo();assert.equal(E.assembly.name,"Before");
  assert.equal(api.documentDirty(),false);
  assert.equal((await loadAssemblyLibrary()).find(a=>a.key===original.key).name,"Other writer");
});

test("a failed background write retains the last successful assembly revision",async()=>{
  const original={key:"failed-after-save",name:"Before",components:[]};
  const {api,E,finishWrite,reports}=await pendingAssemblySave(original);
  api.history.push("Rename");E.assembly.name="Saved";
  const first=api.saveCurrentDocument();finishWrite();await first;
  api.history.push("Later rename");E.assembly.name="Unsaved";
  const pending=api.saveCurrentDocument();
  E.docType="part";api.markDocumentClean();
  finishWrite(false);await pending;
  assert.equal(reports(),1);
  E.docType="assembly";
  assert.equal(api.documentDirty(),true);
  assert.equal(api.baseline().name,"Saved");
  assert.equal((await loadAssemblyLibrary()).find(a=>a.key===original.key).name,"Saved");
  api.history.undo();assert.equal(E.assembly.name,"Saved");assert.equal(api.documentDirty(),false);
  api.history.undo();assert.equal(E.assembly.name,"Before");assert.equal(api.documentDirty(),true);
});

test("a background save marks only its captured assembly node across concurrent edits and Part saves",async()=>{
  const original={key:"switch-concurrent",name:"Before",components:[]};
  const {api,E,finishWrite}=await pendingAssemblySave(original);
  api.history.push("Rename");E.assembly.name="After";
  const pending=api.saveCurrentDocument();
  api.history.push("Later rename");E.assembly.name="Still editing";
  E.docType="part";api.markDocumentClean();
  finishWrite();await pending;
  assert.equal(api.documentDirty(),false,"assembly completion cannot move the Part marker");
  E.docType="assembly";
  assert.equal(api.documentDirty(),true);
  assert.equal(E.assembly.name,"Still editing");
  api.history.undo();assert.equal(E.assembly.name,"After");assert.equal(api.documentDirty(),false);
  E.docType="part";assert.equal(api.documentDirty(),false,"undoing Assembly edits leaves the identical saved Part clean");
  E.docType="assembly";api.history.undo();assert.equal(api.documentDirty(),true);
});

test("an old write completing during Part cannot move a reopened same-key assembly's clean node",async()=>{
  const original={key:"reopen-clean",name:"Before",components:[]};
  const {api,E,finishWrite}=await pendingAssemblySave(original);
  api.history.push("Old rename");E.assembly.name="Old write";
  const pending=api.saveCurrentDocument();
  E.assembly=structuredClone(original);api.history.clear().seed();api.markDocumentClean();
  api.history.push("Reopened rename");E.assembly.name="New session edit";
  E.docType="part";api.markDocumentClean();
  finishWrite();await pending;
  E.docType="assembly";
  assert.deepEqual(api.baseline(),original);
  assert.equal(api.documentDirty(),true);
  api.history.undo();assert.equal(E.assembly.name,"Before");assert.equal(api.documentDirty(),false);
  assert.equal((await loadAssemblyLibrary()).find(a=>a.key===original.key).name,"Old write");
});

test("saving Assembly retains a dirty Part and Close and replacement require a decision",async()=>{
  const original={key:"resident-part",name:"Assembly",components:[]};
  const {api,E,finishWrite,prompts,draft}=await pendingAssemblySave(original);
  E.docType="part";api.markDocumentClean();
  api.history.push("edit part");E.def.name="Part edit";
  E.docType="assembly";
  const pending=api.saveCurrentDocument();finishWrite();await pending;
  assert.equal(api.documentDirty(),false);
  assert.equal(await api.requestCloseModeler(),false);
  await api.openModeler("other-part");
  assert.equal(E.open,true);
  assert.equal(E.def.name,"Part edit");
  assert.equal(prompts(),2);
  assert.equal(draft().def.name,"Part edit");
  assert.deepEqual(draft().dirty,{part:true,assembly:false});
  api.restoreModelerDraft(draft());
  assert.deepEqual(api.residentDirtyState(),{part:true,assembly:false});
  assert.equal(E.def.name,"Part edit");
  assert.deepEqual(api.baseline(),original);
});

test("a Part-active draft restores its inactive edited Assembly and clears once both are saved",async()=>{
  const original={key:"resident-assembly",name:"Before",components:[]};
  const {api,E,draft,finishWrite}=await pendingAssemblySave(original);
  api.history.push("rename");E.assembly.name="After";
  E.docType="part";api.markDocumentClean();api.reconcileModelerDraft();
  assert.deepEqual(draft().dirty,{part:false,assembly:true});
  const saved=draft();E.assembly=null;api.restoreModelerDraft(saved);
  assert.equal(E.assembly.name,"After");assert.deepEqual(api.baseline(),original);
  assert.equal(await api.confirmDiscardDocument("unsavedClose"),false);
  E.docType="assembly";const pending=api.saveCurrentDocument();finishWrite();await pending;
  assert.equal(draft(),null);
  assert.equal(await api.confirmDiscardDocument("unsavedClose"),true);
});

test("a save finishing during component editing recovers the working component, parent, and parked Part",async()=>{
  const original={key:"resident-context",name:"Assembly",components:[insert(panel(10))]};
  const {api,E,draft,finishWrite}=await pendingAssemblySave(original);
  E.docType="part";api.markDocumentClean();api.history.push("part edit");E.def.name="Parked edit";
  E.docType="assembly";api.history.push("rename assembly");E.assembly.name="Saved parent";
  const pending=api.saveCurrentDocument();api.beginContextPart(E.assembly.components[0],false);
  api.history.push("change width");E.def.parts[0].x1=20;
  finishWrite();await pending;
  const saved=draft();assert.equal(saved.previousDef.name,"Parked edit");
  assert.equal(saved.def.parts[0].x1,20);assert.deepEqual(saved.dirty,{part:true,assembly:false});
  assert.equal(api.restoreModelerDraft(saved),true);assert.equal(await api.finishContextPart(),true);
  assert.equal(E.def.name,"Parked edit");assert.equal(E.assembly.components[0].def.parts[0].x1,20);
  assert.deepEqual(api.residentDirtyState(),{part:true,assembly:true});
});

test("Save from a component waits for the earlier parent write and uses its committed baseline",async()=>{
  const original={key:"context-queue",name:"Before",components:[insert(panel(10))]};
  const {api,E,finishWrite,counts,reports}=await pendingAssemblySave(original);
  api.history.push("rename");E.assembly.name="After";const first=api.saveCurrentDocument();
  api.beginContextPart(E.assembly.components[0]);api.history.push("width");E.def.parts[0].x1=20;
  const second=api.saveCurrentDocument();await new Promise(setImmediate);
  assert.equal(E.docType,"assembly");assert.equal(counts().writes,1);
  finishWrite();await first;await new Promise(setImmediate);
  assert.equal(counts().writes,2);assert.equal(api.baseline().components[0].def.parts[0].x1,10);
  finishWrite();await second;
  assert.equal(reports(),0);assert.equal(api.baseline().components[0].def.parts[0].x1,20);
  assert.equal(api.documentDirty(),false);
});

test("confirmed single-document replacement keeps the dirty inactive Part recoverable",async()=>{
  const {api,E,draft}=await pendingAssemblySave({key:"replaced-assembly",components:[]},{decide:()=>true});
  E.docType="part";api.markDocumentClean();api.history.push("Part edit");E.def.name="Keep Part";
  E.docType="assembly";await api.newModel();
  assert.equal(E.assembly.key,"new-assembly");assert.equal(draft().def.name,"Keep Part");
  assert.deepEqual(draft().dirty,{part:true,assembly:false});
  assert.equal(await api.requestCloseModeler(),true);assert.equal(draft(),null);assert.equal(E.open,false);
});

test("a discard decision cannot authorize a later coalesced edit in the same history node",async()=>{
  let decide;const {api,E}=await pendingAssemblySave({key:"discard-race",components:[]},{decide:()=>new Promise(r=>decide=r)});
  api.history.push("name","typing");E.assembly.name="Before prompt";const prompt=api.confirmDiscardDocument("unsavedOpen");
  api.history.push("name","typing");E.assembly.name="After prompt";decide(true);
  assert.equal(await prompt,false);assert.equal(E.assembly.name,"After prompt");
});

test("legacy recovery protects both residents until their individual saves",async()=>{
  const original={key:"legacy-residents",name:"Assembly",components:[]};
  const {api,E,finishWrite,draft}=await pendingAssemblySave(original);
  api.restoreModelerDraft({docType:"assembly",assembly:structuredClone(original),def:{name:"Old Part"},assemblyBaselineJson:JSON.stringify(original)});
  assert.deepEqual(api.residentDirtyState(),{part:true,assembly:true});
  const pending=api.saveCurrentDocument();finishWrite();await pending;
  assert.deepEqual(draft().dirty,{part:true,assembly:false});assert.equal(E.def.name,"Old Part");
  E.docType="part";assert.equal(await api.confirmDiscardDocument("unsavedClose"),false);
});

test("Undo of a pending Part write while Assembly is active retains the restored Part and its correct baseline",async()=>{
  const {api,E,finishWrite,draft}=await pendingAssemblySave({key:"parent-part-race",components:[]});
  E.docType="part";Object.assign(E.def,{key:"resident-part-write",name:"Before",parts:[]});api.markDocumentClean();
  api.history.push("rename");E.def.name="After";const write=api.saveCurrentDocument();
  await new Promise(setImmediate);
  E.docType="assembly";api.history.undo();finishWrite();await write;
  assert.equal(api.partBaseline().name,"After");assert.equal(draft().def.name,"Before");
  assert.deepEqual(draft().dirty,{part:true,assembly:false});
  assert.equal(await api.requestCloseModeler(),false);
  E.docType="part";const retry=api.saveCurrentDocument();await new Promise(setImmediate);finishWrite();await retry;
  assert.equal(api.partBaseline().name,"Before");assert.equal(draft(),null);
  E.docType="assembly";assert.equal(await api.confirmDiscardDocument("unsavedClose"),true);
});
