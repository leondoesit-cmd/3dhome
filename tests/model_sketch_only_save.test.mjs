import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hasSaveableModelContent } from "../js/core/model_save_policy.js";
import { createPartDocument, createSketchDefinition, ensureParametricDocument } from "../js/core/parametric_document.js";
import { rebuildParametricDocument } from "../js/core/parametric_rebuild.js";
import { clearMemoryModelLibrary, libraryBundle, loadModelLibrary, parseLibraryBundle, putModelLibraryRecord } from "../js/core/model_library_store.js";

test("a real sketch history row saves without a solid, while a fresh editor sketch does not", () => {
  const document = createPartDocument({id:"sketch-only",key:"cm_sketch_only",name:"Sketch only",parts:[],metadata:{authoringSystem:"parametric-v1"}});
  assert.equal(hasSaveableModelContent(document), false);
  // The editor's implicit working sketch is empty and has no authored row.
  document.sketches.push({id:"implicit",referenceId:"plane:top",points:[],entities:[],constraints:[]});
  assert.equal(hasSaveableModelContent(document), false);
  document.sketches.length = 0;
  const sketch = createSketchDefinition(document,{id:"authored",referenceId:"plane:top",name:"X·Z sketch"});
  assert.equal(sketch.entities.length, 0);
  assert.equal(document.parts.length, 0);
  assert.equal(hasSaveableModelContent(document), true);
  const rebuilt = rebuildParametricDocument(document);
  assert.equal(rebuilt.ok, true, JSON.stringify(rebuilt.issues));
  assert.equal(rebuilt.bodies.length, 0);
});

test("a sketch-only library record survives storage, export, import and document reopen", async () => {
  clearMemoryModelLibrary();
  const document = createPartDocument({id:"sketch-roundtrip",key:"cm_sketch_roundtrip",name:"Authored sketch",parts:[],metadata:{authoringSystem:"parametric-v1"}});
  createSketchDefinition(document,{id:"book-sketch",referenceId:"plane:top",name:"X·Z sketch"});
  const saved = await putModelLibraryRecord(document,{expected:null});
  assert.equal(saved.ok, true);
  const bundle = libraryBundle(await loadModelLibrary(), []);
  const [reopened] = parseLibraryBundle(JSON.stringify(bundle)).models;
  const loaded = ensureParametricDocument(reopened);
  assert.equal(loaded.parts.length, 0);
  assert.equal(loaded.history.length, 1);
  assert.equal(loaded.history[0].targetId, loaded.sketches[0].id);
  assert.equal(hasSaveableModelContent(loaded), true);
  assert.equal(rebuildParametricDocument(loaded).ok, true);
  clearMemoryModelLibrary();
});

test("the editor guard and library card use the sketch-only policy", async () => {
  const source = await readFile(new URL("../js/modeler.js", import.meta.url),"utf8");
  const strings = await readFile(new URL("../js/modeler_strings.js", import.meta.url),"utf8");
  assert.match(source,/if \(!hasSaveableModelContent\(E\.def\)\)/);
  assert.match(source,/hasSaveableModelContent\(def\)[\s\S]{0,60}?delete FURN\[def\.key\]/);
  assert.match(source,/t\("sketchOnly"\)/);
  assert.match(strings,/sketchOnly: \["[^"]+", "Sketch only"\]/);
});
