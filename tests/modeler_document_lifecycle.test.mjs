/* The model editor holds one open document at a time in a module-level `E`,
   and several of its operations are asynchronous. That combination produced a
   family of bugs that unit tests could not see, because js/modeler.js cannot be
   imported under Node (bare `three` specifiers): the editor announced saves
   that never happened, applied one document's save to another, exported a
   solid belonging to a model the user had closed, and replaced unsaved work
   without asking. These assertions pin the invariants that fix them, in the
   same source-reading style the other modeler suites use. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
/* The editor's [he, en] table lives in js/modeler_strings.js. */
const strings = await readFile(new URL("../js/modeler_strings.js", import.meta.url), "utf8");
const draftSource = await readFile(new URL("../js/modeler_draft.js", import.meta.url), "utf8");

/* Everything between a named function's `function` keyword and the start of the
   next top-level declaration. Enough to assert what a single handler does
   without pinning the whole file's line numbering. */
function body(name, text = source) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const end = text.indexOf("\nfunction ", start + 1);
  const braced = text.indexOf("\n}", start);
  return text.slice(start, end > 0 ? Math.min(end, braced + 2) : braced + 2);
}

/* Where a statement actually is, as opposed to where the prose above it
   happens to name the same function. */
function callAt(text, name) {
  const at = text.search(new RegExp(`\\n\\s*${name}\\(`));
  assert.ok(at >= 0, `${name}() is not called here`);
  return at;
}

test("a cached exact solid is exported only for the document and revision it came from", () => {
  // The run carries a stamp, and the stamp is taken from the open document.
  assert.match(source, /function exactRunStamp/);
  assert.match(body("exactRunStamp"), /E\.def && \(E\.def\.definitionId \|\| E\.def\.key\)/);
  assert.match(body("exactRunStamp"), /node: currentHistoryNode\(\)/);

  // Both exports consult the stamp rather than the mere existence of a shape.
  const step = body("exportStepDocument"), iges = body("exportIgesDocument");
  for (const [name, text] of [["STEP", step], ["IGES", iges]]) {
    assert.match(text, /exactRunIsCurrent\(\)\s*\?\s*E\.brepRun\s*:\s*await regenerateExactModel\(\)/, `${name} export must check the stamp`);
    assert.doesNotMatch(text, /E\.brepRun && E\.brepRun\.finalShape \? E\.brepRun/, `${name} export must not reuse any finished run`);
  }

  // Both halves of the stamp are compared: same document AND same revision.
  const current = body("exactRunIsCurrent");
  assert.match(current, /E\.brepStamp\.doc === now\.doc/);
  assert.match(current, /E\.brepStamp\.node === now\.node/);

  // A failed regeneration leaves no stamp behind for the next export to trust.
  assert.match(body("regenerateExactModelNow"), /E\.brepStamp = null/);
});

test("a current display mesh cannot be reused as a native export solid", () => {
  const E={brepRun:{finalShape:{verifiedSerializedExact:true}},brepStamp:{doc:'housing',node:11}};
  let stamp={doc:'housing',node:11};
  const context={E,exactRunStamp:()=>stamp};
  vm.runInNewContext(body('exactRunIsCurrent')+'\nthis.current=exactRunIsCurrent;',context);
  assert.equal(context.current(false),true,'current display proof is usable for drawing');
  assert.equal(context.current(),false,'default callers require native BREP');
  E.brepRun.finalShape.shape={};
  assert.equal(context.current(),true);
  stamp={doc:'housing',node:12};
  assert.equal(context.current(false),false,'mesh proof also expires after an edit');
  assert.equal(context.current(),false);
});

test("the exact run is released by every path that stops using it", () => {
  // Native OpenCascade handles: dropping the reference is not freeing it.
  const release = body("releaseExactRun");
  assert.match(release, /releaseRegeneration\(E\.brepRun\)/);
  assert.match(release, /E\.brepRun = null/);
  assert.match(release, /E\.brepStamp = null/);

  // Opening and closing a document are the two paths that used to do neither.
  assert.match(source, /export function openModeler[\s\S]{0,4000}?releaseExactRun\(\)/);
  assert.match(source, /export function closeModeler[\s\S]{0,600}?releaseExactRun\(\)/);
  // Nothing releases the run by hand any more; there is one way to do it.
  assert.doesNotMatch(source, /if \(E\.brepRun\) \{ releaseRegeneration/);
});

test("a save reports failure instead of announcing one that did not happen", () => {
  // The assembly store answers whether the write landed, exactly as saveLib does.
  assert.match(body("saveAssemblies"), /return !!result\.ok/);
  assert.match(body("saveAssemblies"), /catch \(e\) \{ lastAssemblySaveConflict=false; return false; \}/);

  // And the save path acts on that answer before it claims success.
  const save = body("saveAssemblyDocument");
  assert.match(save, /if \(!await saveAssemblies\(saved,\{expected:assemblyOpenBaseline\}\)\) \{[\s\S]*?return;/);
  // The success tail must come after the guard, never before it.
  assert.ok(save.indexOf("if (!await saveAssemblies(saved,{expected:assemblyOpenBaseline}))") < callAt(save, "markDocumentClean"));
  assert.ok(save.indexOf("if (!await saveAssemblies(saved,{expected:assemblyOpenBaseline}))") < callAt(save, "discardModelerDraft"));

  // The crash-recovery draft is just as silent when storage refuses it.
  assert.match(draftSource, /export function writeModelerDraft[\s\S]*?return false;/);
  assert.match(body("flushModelerDraft"), /if \(writeModelerDraft\([\s\S]*?draftFailureReported/);
});

test("an asynchronous save commits editor state only to the document it started on", () => {
  const save = body("saveModel");
  // The document, its placed item and its revision are captured up front...
  assert.match(save, /var savingDoc = E\.def, savingItem = E\.srcItem, savingNode = currentHistoryNode\(\)/);
  // ...and re-checked after the awaits, before anything is marked saved.
  assert.match(save, /E\.def !== savingDoc \|\| E\.srcItem !== savingItem \|\| currentHistoryNode\(\) !== savingNode/);
  const guard = save.indexOf("if (E.def !== savingDoc");
  assert.ok(guard >= 0, "the guard must exist");
  assert.ok(guard < callAt(save, "markDocumentClean"), "the guard must precede markDocumentClean");
  assert.ok(guard < callAt(save, "discardModelerDraft"), "the guard must precede discardModelerDraft");
  // The source item rebinding belongs to the saved document, not the open one.
  assert.match(save, /savingItem\.definitionId = def\.id/);
  assert.doesNotMatch(save, /E\.srcItem\.definitionId = def\.id/);
});

test("every path that replaces the open document asks about unsaved work first", () => {
  // One choke point, so there is a single place to answer the question.
  assert.match(body("confirmDiscardDocument"), /if \(!documentDirty\(\)\) return true/);
  assert.match(body("confirmDiscardDocument"), /await askModelerDecision\(root/);

  // New, Close and both library panes all route through it.
  assert.match(body("newModel"), /confirmDiscardDocument\("unsavedNew"\)/);
  // A confirmed discard takes the draft with it, wherever it was confirmed.
  assert.match(body("newModel"), /confirmDiscardDocument\("unsavedNew"\)[\s\S]{0,400}?discardModelerDraft\(\)/);
  assert.match(body("requestCloseModeler"), /confirmDiscardDocument\("unsavedClose"\)/);
  const lib = body("refreshLib");
  assert.equal((lib.match(/confirmDiscardDocument\("unsavedOpen"\)/g) || []).length, 3,
    "assembly open, part open, and save-copy-and-open each need the guard");
  // The prompt exists in both languages.
  assert.match(strings, /unsavedOpen: \["[^"]+", "[^"]+"\]/);

  // Opening an assembly is a document open: it reseeds history and its baseline
  // rather than inheriting the previous document's undo stack.
  assert.match(lib, /confirmDiscardDocument\("unsavedOpen"\)[\s\S]{0,900}?H\.clear\(\)\.seed\(\);[\s\S]{0,200}?markDocumentClean\(\)/);

  // The superseded draft goes, but only when a document was really replaced —
  // a draft from a previous session is what the no-argument open exists for.
  assert.match(body("openModeler", source.slice(source.indexOf("export function openModeler"))),
    /replacingOpenDocument && \(editKey \|\| def \|\| srcItem\)/);
});

test("renaming or repricing a model makes it dirty like any other edit", () => {
  // documentDirty() is defined by the undo tree, so an edit that creates no
  // history node cannot be seen by it at all.
  assert.match(source, /bindDocumentTextField\("#mdName",[\s\S]{0,400}?t\("renameDocument"\)\)/);
  const textField=body("bindDocumentTextField");
  assert.match(textField,/if\(readValue\(\)===next\)return;/);
  assert.match(textField,/pushUndo\(undoLabel,commitOnInput \? selector\+":"\+gesture : undefined\);writeValue\(next\);syncUndoButtons\(\);/);
  assert.match(textField,/input\.addEventListener\("change",commit\)/);
  assert.match(source, /#mdPrice"\)\.addEventListener\("change"[\s\S]{0,400}?pushUndo\(t\("setPrice"\)\)/);
  // Assigning straight into the document is what put them outside the flag.
  assert.doesNotMatch(source, /addEventListener\("change", function \(\) \{\s*if \(E\.docType === "assembly" && E\.assembly\) E\.assembly\.name = this\.value;/);
  // Re-entering the same value is not an edit and must not stack undo steps.
  assert.match(source, /if \(E\.def\.price === price\) return/);
  for (const key of ["renameDocument", "setPrice"]) assert.match(strings, new RegExp(`${key}: \\["[^"]+", "[^"]+"\\]`));
});

test("warnings that did not fail the rebuild are shown as refinement, not alarm", () => {
  const render = body("renderCoreDiagnostics");
  // Warnings-only collapses to its summary; a failed rebuild stays an open section.
  assert.match(render, /var advisory = !errors/);
  assert.match(render, /el\(advisory \? "details" : "section"/);
  assert.match(render, /el\(advisory \? "summary" : "h5"/);
  // And no row is promoted with "start here" and an accent button.
  assert.match(render, /var primary = index === 0 && !advisory/);
});
