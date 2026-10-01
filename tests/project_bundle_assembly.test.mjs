import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { activeProjectDocument, createProjectBundle, importProjectBundleText } from "../js/cad_project_bundle.js";

const inactivePart = { key: "part-new", name: "New model", parts: [], history: [], sketches: [] };
const savedAssembly = { key: "asm-batteryplate", name: "BATTERYANDPLATE", components: [{ id: "battery" }], topologyMates: [] };

test("editor exports only its active document, preserving nested assembly definitions", async () => {
  const source = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
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
  const source = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
  const start = source.indexOf("function importBundleDocument()");
  const end = source.indexOf("\nfunction createDefaultExplodedView", start);
  const handler = source.slice(start, end);
  assert.match(handler, /activeProjectDocument\(bundle\)/);
  assert.match(handler, /E\.assembly=cloneData\(active\.assembly\)/);
  assert.match(handler, /assemblyOpenBaseline=cloneData\(active\.assembly\)/);
  assert.match(handler, /setDocumentType\("assembly"\)/);
  assert.match(handler, /confirmDiscardDocument\("unsavedOpen"\)/);
});
