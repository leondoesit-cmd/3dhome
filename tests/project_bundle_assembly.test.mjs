import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {sourceFunctionText, withSetters} from "./helpers/source_function.mjs";
import { activeProjectDocument, createProjectBundle, importProjectBundleText } from "../js/cad_project_bundle.js";

const inactivePart = { key: "part-new", name: "New model", parts: [], history: [], sketches: [] };
const savedAssembly = { key: "asm-batteryplate", name: "BATTERYANDPLATE", components: [{ id: "battery" }], topologyMates: [] };

test("editor exports only its active document, preserving nested assembly definitions", async () => {
  const source = modelerSource();
  const handler = source.slice(source.indexOf("async function exportBundleDocument()"), source.indexOf("function importBundleDocument()"));
  assert.match(handler, /createProjectBundle\(E\.def, \[\], \[\]/);
  assert.doesNotMatch(handler, /loadAssemblies\(/);
  const part = {...inactivePart, parts:[{id:'local',kind:'box'}]};
  const partBundle = await createProjectBundle(part);
  assert.deepEqual(partBundle.assemblies, []);
  assert.deepEqual(partBundle.mainModel.parts, part.parts);
  const active = {...savedAssembly, components:[{id:'nested',definition:{name:'Nested part',parts:[{id:'leaf'}]}}]};
  const assemblyBundle = await createProjectBundle(inactivePart, [], [], {activeAssembly:active});
  assert.equal(assemblyBundle.assemblies.length, 1);
  assert.deepEqual(assemblyBundle.assemblies[0].components, active.components);
});

test("pasted project JSON restores authored history and rejects invalid content", async()=>{
  const model={...inactivePart,features:[{id:"fresh-boss",type:"extrude",params:{depth:2.54}}],sketches:[{id:"fresh-profile",entities:[{type:"circle",r:.5}]}]};
  const imported=await importProjectBundleText(JSON.stringify({version:3,mainModel:model,assemblies:[],attachments:[]}));
  assert.deepEqual(imported.mainModel,model);
  await assert.rejects(importProjectBundleText("not json"),SyntaxError);
  await assert.rejects(importProjectBundleText("null"),/no main model/);
  await assert.rejects(importProjectBundleText('{"mainModel":{"parts":{}}}'),/no main model/);
});

test("assembly project export includes the active revision and identifies it as the document", async () => {
  const active = { ...savedAssembly, components: [{ id: "battery" }, { id: "plate" }] };
  const bundle = await createProjectBundle(inactivePart, [savedAssembly], [], { activeAssembly: active });
  assert.equal(bundle.assemblies.length, 1, "the active assembly replaces its saved revision");
  assert.equal(bundle.assemblies[0].components.length, 2);
  assert.deepEqual(bundle.metadata.activeDocument, { type: "assembly", key: active.key });
  assert.equal(activeProjectDocument(bundle).assembly.name, "BATTERYANDPLATE");
});

test("an older export with an empty inactive part recovers its sole assembly", () => {
  // newDef() keeps a placeholder sketch, which is still an empty inactive part.
  const bundle = { mainModel: { ...inactivePart, sketches: [{ entities: [] }] }, assemblies: [savedAssembly] };
  assert.deepEqual(activeProjectDocument(bundle), { type: "assembly", assembly: savedAssembly });
  const authoredSketch = { ...inactivePart, sketches: [{ entities: [{ type: "line" }] }] };
  assert.equal(activeProjectDocument({ mainModel: authoredSketch, assemblies: [savedAssembly] }).type, "part");
});

test("bundle import UI opens an assembly and clears its stale part document state", async () => {
  const bundle = await createProjectBundle(inactivePart,[],[],{activeAssembly:savedAssembly});
  const E={srcItem:{},sel:{},ssel:[1],topologySelection:[1],componentSel:[1]};
  let discard=false;
  const fresh={...savedAssembly,components:[{id:"updated"}]};
  const deps={E,activeProjectDocument,cloneData:structuredClone,confirmDiscardDocument:async()=>discard,
    resolvedLibraryAssembly:()=>fresh,compactAssemblyTopologySnapshots:a=>a,saveAssemblies:async()=>true,
    setDocumentType:type=>{E.docType=type;},H:{generation:1,editRevision:()=>0,clear:()=>({seed(){}})},currentHistoryNode:()=>0,t:key=>key};
  for(const name of ["closeEvalCard","abandonDocumentExactWork","markDocumentClean","reconcileModelerDraft",
    "syncHead","refreshAll","refreshLib","setMode","fitPreview","flash"])deps[name]=()=>{};
  const open=new Function(...Object.keys(deps),"let assemblyOpenBaseline;"+
    withSetters(["documentOwnership","documentStillOwned","openImportedBundle"].map(name=>sourceFunctionText(modelerSource(),name)).join("\n"))+";return async b=>{await openImportedBundle(b);return assemblyOpenBaseline;};")(...Object.values(deps));
  assert.equal(await open(bundle),undefined);
  assert.deepEqual(E.sel,{});
  discard=true;
  const baseline=await open(bundle);
  assert.deepEqual(baseline,bundle.assemblies[0]);
  assert.deepEqual(E.assembly,fresh);
  assert.notEqual(E.assembly,fresh);
  assert.equal(E.docType,"assembly");
  assert.equal(E.sel,null);
  assert.deepEqual(E.componentSel,[]);
});
