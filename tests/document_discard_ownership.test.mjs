import test from "node:test";
import assert from "node:assert/strict";
import { registerQuickForm } from "../js/modeler_quick_form.js";
import { modelerSource } from "./helpers/modeler_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";

const source = modelerSource();
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const original = { name: "Current part", parts: [] };
  const E = { open: true, docType: "part", def: original, assembly: null, contextEdit: null };
  const H = { generation: 1, editRevision: () => 0, clear: () => ({ seed() {} }) };
  const history = {}, decisions = [], saving = deferred();
  const calls = { saves: 0, closes: 0, abandons: 0, switches: [] };
  const deps = {
    E, H, root: {}, currentHistoryNode: () => history, hasResidentEdits: () => false,
    t: key => key, cloneData: structuredClone,
    askModelerDecision(host, options) {
      const decision = deferred();
      decisions.push({ ...decision, options });
      return decision.promise;
    },
    saveAssemblies() { calls.saves++; return saving.promise; },
    activeProjectDocument: bundle => bundle.metadata?.activeDocument?.type === "assembly"
      ? { type: "assembly", assembly: bundle.assemblies[0] } : { type: "part" },
    migrateDefinition: structuredClone, resolvedLibraryAssembly: value => value,
    compactAssemblyTopologySnapshots: value => value,
    setDocumentType(type) { E.quickFormInstance?.dismiss(true); E.docType = type; calls.switches.push(type); },
    abandonDocumentExactWork() { calls.abandons++; },
    closeModeler() { E.quickFormInstance?.dismiss(true); E.open = false; calls.closes++; },
  };
  for (const name of ["closeEvalCard", "markDocumentClean", "reconcileModelerDraft", "syncHead", "refreshAll",
    "refreshLib", "setMode", "fitPreview", "flash", "discardModelerDraft"]) deps[name] = () => {};
  const names = ["documentOwnership", "documentStillOwned", "confirmDiscardDocument", "openImportedBundle",
    "requestCloseModeler", "leavingQuickForm"];
  const api = new Function(...Object.keys(deps),
    "let assemblyOpenBaseline, partHistoryMarker, libraryOpenBaseline;\n" +
    names.map(name => sourceFunctionText(source, name)).join("\n") +
    ";return {" + names.join(",") + "};")(...Object.values(deps));
  function form(readDraft) {
    const field = { type: "text", value: "Initial" }, fields = [field];
    const panel = { hidden: false, innerHTML: "", querySelectorAll: () => fields, contains: field => fields.includes(field) };
    const instance = registerQuickForm(E, panel, "test");
    instance.rememberInputs(readDraft);
    return { instance, field, fields, panel };
  }
  const bundle = { mainModel: { name: "Imported part", parts: [] }, assemblies: [{ key: "imported-assembly", components: [] }] };
  // Advance the actual confirmation/import continuations without a timer or storage race.
  async function answer(index, accepted) {
    await settle();
    assert.ok(decisions[index], `discard decision ${index} is open`);
    decisions[index].resolve(accepted);
    await settle();
  }
  return { E, H, original, decisions, saving, calls, api, form, bundle, answer };
}

test("async bundle import asks again for another edit to the already dirty form", async () => {
  for (const type of ["part", "assembly"]) {
    const f = fixture(), form = f.form();
    if (type === "assembly") f.bundle.metadata = { activeDocument: { type } };
    form.field.value = "Approved edit";
    const opening = f.api.openImportedBundle(f.bundle);
    await f.answer(0, true);
    assert.equal(f.calls.saves, 1);
    assert.equal(form.instance.hasPendingEdits(), true);
    const generation = f.H.generation;
    form.field.value = "Later unsaved edit";
    assert.equal(form.instance.hasPendingEdits(), true, "the boolean dirty state has not changed");
    assert.equal(f.H.generation, generation, "typing has not made a history entry");
    f.saving.resolve(true);
    await f.answer(1, false);
    await opening;
    assert.equal(f.E.def, f.original, type);
    assert.equal(f.E.quickFormInstance, form.instance, type);
    assert.equal(form.field.value, "Later unsaved edit", type);
    assert.equal(form.panel.hidden, false, type);
    assert.equal(f.calls.abandons, 0, type);
    assert.deepEqual(f.calls.switches, [], type);
  }
});

test("reapproving a later edit lets the bundle import finish", async () => {
  const f = fixture(), form = f.form();
  form.field.value = "Approved edit";
  const opening = f.api.openImportedBundle(f.bundle);
  await f.answer(0, true);
  form.field.value = "Reapproved edit";
  f.saving.resolve(true);
  await f.answer(1, true);
  await opening;
  assert.equal(f.decisions.length, 2);
  assert.equal(f.E.def.name, "Imported part");
  assert.equal(f.E.quickFormInstance, null);
  assert.equal(form.panel.hidden, true);
  assert.deepEqual(f.calls.switches, ["part"]);
});

test("unchanged dirty form imports with its original approval", async () => {
  const f = fixture(), form = f.form();
  form.field.value = "Approved edit";
  const opening = f.api.openImportedBundle(f.bundle);
  await f.answer(0, true);
  f.saving.resolve(true);
  await opening;
  assert.equal(f.decisions.length, 1);
  assert.equal(f.E.def.name, "Imported part");
});

test("ownership snapshots distinguish raw field values, checkbox state and mutable feature drafts", () => {
  const f = fixture(), draft = { references: { edges: ["edge-a"] } }, form = f.form(() => draft);
  form.field.value = "First dirty value";
  const owner = f.api.documentOwnership();
  assert.equal(f.api.documentStillOwned(owner), true, "repeated reads are stable");
  form.field.value = "Second dirty value";
  assert.equal(f.api.documentStillOwned(owner), false, "pending stays true but raw input changed");
  form.field.value = "First dirty value";
  const checkbox = { type: "checkbox", checked: false, value: "on" };
  form.fields.push(checkbox);
  const checkOwner = f.api.documentOwnership();
  checkbox.checked = true;
  assert.equal(f.api.documentStillOwned(checkOwner), false);
  const draftOwner = f.api.documentOwnership();
  draft.references.edges.push("edge-b");
  assert.equal(f.api.documentStillOwned(draftOwner), false, "in-place picker changes are captured by value");
  assert.equal(f.api.documentStillOwned(f.api.documentOwnership()), true);
});

test("an edit to a feature draft during the import save also requires reapproval", async () => {
  const f = fixture(), draft = { depth: 1, references: ["edge-a"] }, form = f.form(() => draft);
  draft.depth = 2;
  const opening = f.api.openImportedBundle(f.bundle);
  await f.answer(0, true);
  draft.references.push("edge-b");
  f.saving.resolve(true);
  await f.answer(1, false);
  await opening;
  assert.equal(f.E.def, f.original);
  assert.equal(f.E.quickFormInstance, form.instance);
  assert.deepEqual(draft.references, ["edge-a", "edge-b"]);
});

test("close and document-switch discard approvals expire when the same dirty form changes", async () => {
  for (const action of ["close", "switch"]) {
    const f = fixture(), form = f.form();
    form.field.value = "Before question";
    const leaving = action === "close" ? f.api.requestCloseModeler()
      : f.api.leavingQuickForm(() => { f.E.docType = "assembly"; return true; });
    form.field.value = "Edited during question";
    await f.answer(0, true);
    assert.equal(await leaving, false, action);
    assert.equal(f.E.open, true, action);
    assert.equal(f.E.docType, "part", action);
    assert.equal(f.E.quickFormInstance, form.instance, action);
    assert.equal(f.calls.closes, 0, action);
  }
});

test("editing again during import reapproval preserves the current form", async () => {
  const f = fixture(), form = f.form();
  form.field.value = "First edit";
  const opening = f.api.openImportedBundle(f.bundle);
  await f.answer(0, true);
  form.field.value = "Second edit";
  f.saving.resolve(true);
  await settle();
  assert.equal(f.decisions.length, 2);
  form.field.value = "Third edit";
  await f.answer(1, true);
  await opening;
  assert.equal(f.E.def, f.original);
  assert.equal(f.E.quickFormInstance, form.instance);
  assert.equal(form.field.value, "Third edit");
  assert.equal(f.calls.abandons, 0);
});

test("import waits for an Apply started during the library save before asking again", async () => {
  const f = fixture(), form = f.form();
  form.field.value = "Approved edit";
  const opening = f.api.openImportedBundle(f.bundle);
  await f.answer(0, true);
  const applying = deferred();
  form.instance.applying = applying.promise;
  f.saving.resolve(true);
  await settle();
  assert.equal(f.E.def, f.original, "no replacement while Apply is working");
  assert.equal(f.decisions.length, 1, "confirmation waits for Apply to settle");
  form.instance.applying = null;
  applying.resolve();
  await f.answer(1, false);
  await opening;
  assert.equal(f.E.quickFormInstance, form.instance);
  assert.equal(f.calls.abandons, 0);
});

test("a discard approval cannot interrupt an Apply started during its question", async () => {
  const f = fixture(), form = f.form();
  form.field.value = "Unsaved edit";
  const closing = f.api.requestCloseModeler();
  const applying = deferred();
  form.instance.applying = applying.promise;
  await f.answer(0, true);
  assert.equal(await closing, false);
  assert.equal(f.E.open, true);
  assert.equal(f.E.quickFormInstance, form.instance);
  applying.resolve();
});
