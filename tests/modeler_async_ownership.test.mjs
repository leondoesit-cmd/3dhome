import test from "node:test";
import assert from "node:assert/strict";
import { modelerSource } from "./helpers/modeler_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";

const source = modelerSource();

// Runs the named modeler functions against the given stand-ins and returns them.
function load(names, deps, prelude = "") {
  const body = prelude + names.map(name => sourceFunctionText(source, name)).join("\n") +
    ";return {" + names.join(",") + "};";
  return new Function(...Object.keys(deps), body)(...Object.values(deps));
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function documentTypeFixture() {
  const E = { open: true, docType: "part", contextEdit: { id: "edit" } };
  const finishes = [];
  const deps = {
    E,
    finishContextPart() { const finish = deferred(); finishes.push(finish); return finish.promise; },
    // the real setDocumentType starts finishContextPart and returns before it lands
    setDocumentType(type) {
      if (type === "assembly" && E.contextEdit) { deps.finishContextPart(); return; }
      E.docType = type;
    },
    leavingQuickForm: async leave => leave(),
  };
  const api = load(["requestDocumentType"], deps, "let documentTypeRequest=0, contextFinish=null;");
  const land = (index, ok) => {
    if (ok) { E.docType = "assembly"; E.contextEdit = null; }
    finishes[index].resolve(ok);
  };
  return { E, finishes, land, request: api.requestDocumentType };
}

test("an assembly command queued behind Finish component runs once the finish lands", async () => {
  const f = documentTypeFixture();
  const ran = [];
  const result = f.request("assembly", () => ran.push(f.E.docType));
  assert.equal(f.finishes.length, 1);
  await tick();
  assert.deepEqual(ran, [], "the command waits for the part to finish");
  f.land(0, true);
  assert.equal(await result, true);
  assert.deepEqual(ran, ["assembly"]);
});

test("a repeated request joins the finish under way and only the newest command runs", async () => {
  const f = documentTypeFixture();
  const ran = [];
  const first = f.request("assembly", () => ran.push("gear"));
  const second = f.request("assembly", () => ran.push("belt"));
  assert.equal(f.finishes.length, 1, "one finish, not a second one refused as busy");
  f.land(0, true);
  assert.deepEqual([await first, await second], [false, true]);
  assert.deepEqual(ran, ["belt"]);
});

test("a failed finish or a closed editor drops the queued command", async () => {
  const failed = documentTypeFixture();
  let ran = 0;
  const refused = failed.request("assembly", () => ran++);
  failed.land(0, false);
  assert.equal(await refused, false);
  assert.equal(failed.E.docType, "part");

  const closed = documentTypeFixture();
  const pending = closed.request("assembly", () => ran++);
  closed.E.open = false;
  closed.land(0, true);
  assert.equal(await pending, false);
  assert.equal(ran, 0);

  const again = documentTypeFixture();
  again.request("assembly", () => ran++);
  again.land(0, false);
  await tick();
  again.E.contextEdit = { id: "edit" };
  const retry = again.request("assembly", () => ran++);
  assert.equal(again.finishes.length, 2, "a finished attempt is not reused by the next one");
  again.land(1, true);
  assert.equal(await retry, true);
  assert.equal(ran, 1);
});

test("a plain switch still runs its command at once", () => {
  const f = documentTypeFixture();
  f.E.contextEdit = null;
  let ran = 0;
  assert.equal(f.request("part", () => ran++), true);
  assert.equal(ran, 1);
});

function bundleFixture({ confirms }) {
  const node = {};
  const E = { open: true, docType: "part", def: { name: "current" }, assembly: null, contextEdit: null, quickFormInstance: null };
  const H = { generation: 1, editRevision: () => 0, clear: () => ({ seed() {} }) };
  const save = deferred();
  const calls = { confirm: 0, setDocumentType: [] };
  const deps = {
    E, H, currentHistoryNode: () => node, cloneData: structuredClone, t: key => key,
    confirmDiscardDocument: async () => confirms[calls.confirm++],
    saveAssemblies: () => save.promise,
    activeProjectDocument: () => ({ type: "part" }),
    migrateDefinition: model => ({ ...model, migrated: true }),
    setDocumentType: type => { calls.setDocumentType.push(type); E.quickFormInstance?.dismiss(true); E.docType = type; },
    resolvedLibraryAssembly: value => value, compactAssemblyTopologySnapshots: value => value,
  };
  for (const name of ["closeEvalCard", "abandonDocumentExactWork", "markDocumentClean", "reconcileModelerDraft",
    "syncHead", "refreshAll", "refreshLib", "setMode", "fitPreview", "flash"]) deps[name] = () => {};
  const api = load(["documentOwnership", "documentStillOwned", "openImportedBundle"], deps,
    "let assemblyOpenBaseline, partHistoryMarker, libraryOpenBaseline;");
  const bundle = { mainModel: { name: "imported", parts: [] }, assemblies: [{ key: "asm" }] };
  return { E, H, calls, save, open: () => api.openImportedBundle(bundle) };
}

function typedForm(E) {
  const form = { dismissed: false, hasPendingEdits: () => true, editSnapshot: () => "typed", dismiss() { form.dismissed = true; if (E.quickFormInstance === form) E.quickFormInstance = null; } };
  return form;
}

test("a form typed into while the bundle's assemblies save is not discarded unasked", async () => {
  const f = bundleFixture({ confirms: [true, false] });
  const opening = f.open();
  await tick();
  const form = typedForm(f.E);
  f.E.quickFormInstance = form;
  f.save.resolve(true);
  await opening;
  assert.equal(f.calls.confirm, 2, "the new input gets its own question");
  assert.equal(form.dismissed, false);
  assert.equal(f.E.quickFormInstance, form);
  assert.equal(f.E.def.name, "current");
  assert.deepEqual(f.calls.setDocumentType, []);
});

test("an edit made during the save asks again, and an approved retry imports", async () => {
  const f = bundleFixture({ confirms: [true, true] });
  const opening = f.open();
  await tick();
  f.H.generation = 2;
  f.save.resolve(true);
  await opening;
  assert.equal(f.calls.confirm, 2);
  assert.equal(f.E.def.name, "imported");
});

test("an untouched document imports after the one approval", async () => {
  const f = bundleFixture({ confirms: [true] });
  const opening = f.open();
  f.save.resolve(true);
  await opening;
  assert.equal(f.calls.confirm, 1);
  assert.equal(f.E.def.name, "imported");
  assert.deepEqual(f.calls.setDocumentType, ["part"]);

  const closed = bundleFixture({ confirms: [true, true] });
  const closing = closed.open();
  await tick();
  closed.E.open = false;
  closed.save.resolve(true);
  await closing;
  assert.equal(closed.E.def.name, "current", "a closed editor is not repopulated");
});

function faceBoundaryFixture() {
  const sketch = { support: { kind: "face", persistentId: "cap", descriptor: { surface: "plane" } }, frame: { origin: {} } };
  const doc = { parts: [{ id: "body" }] };
  const E = { def: doc, authoring: { phase: "sketch" }, topologySelection: [], quickAction: null };
  let history = {};
  const specs = [], bodies = [], appended = [], flashes = [];
  let closed = 0, released = 0;
  const deps = {
    E, cloneData: structuredClone, t: key => key, flash: message => flashes.push(message), uid: () => "id",
    ensureSketch: () => sketch, activeSketch: () => sketch, selectedSketchableFace: () => null,
    selectedModelEdges: () => [], selectedSolid: () => doc.parts[0], topologyEntriesForPart: () => [],
    chooseSketchReference() {}, openCircularConversion() {}, convertModelEdgesToSketch() {}, openSilhouetteConversion() {},
    openQuickForm: spec => { specs.push(spec); E.quickAction = spec.action; },
    exactDisplayBody: () => { const body = deferred(); bodies.push(body); return body.promise; },
    offsetFaceBoundary: () => [["loop"]],
    appendToSketch: (label, run) => { const made = [{ id: "line" }]; appended.push(made); return made; },
    appendBoundarySketch() {}, cutTargetFeatureId: () => null,
    markDrawnSelection: made => { E.ssel = made; },
    closeFeaturePanel: () => { closed++; E.quickAction = null; }, refreshAll() {},
    currentHistoryNode: () => history,
  };
  const api = load(["openFaceBoundary"], deps);
  const land = index => bodies[index].resolve({ brep: {}, release: () => { released++; } });
  return {
    E, sketch, specs, appended, flashes, land, open: api.openFaceBoundary,
    edit() { history = {}; },
    counts: () => ({ closed, released }),
  };
}

test("an old face-boundary result cannot write into a reopened same-action form", async () => {
  const f = faceBoundaryFixture();
  f.open();
  let firstCurrent = true;
  assert.equal(f.specs[0].onApply({ distance: 0 }, () => firstCurrent), false);
  // the user cancels and opens Face Boundary again before the body arrives
  firstCurrent = false;
  f.open();
  assert.equal(f.E.quickAction, "faceboundary");
  f.land(0);
  await tick();
  assert.deepEqual(f.appended, []);
  assert.equal(f.sketch.boundaryCopies, undefined);
  assert.deepEqual(f.counts(), { closed: 0, released: 1 });
  assert.equal(f.E.quickAction, "faceboundary", "the new form stays open");
});

test("a face-boundary result is refused after the sketch moved, and applied when nothing did", async () => {
  const stale = faceBoundaryFixture();
  stale.open();
  stale.specs[0].onApply({ distance: 0 }, () => true);
  stale.edit();
  stale.land(0);
  await tick();
  assert.deepEqual(stale.appended, []);
  assert.deepEqual(stale.flashes.slice(-1), ["faceBoundaryStale"]);
  assert.equal(stale.counts().closed, 0, "the form stays open to apply again");

  const fresh = faceBoundaryFixture();
  fresh.open();
  fresh.specs[0].onApply({ distance: 0 }, () => true);
  fresh.land(0);
  await tick();
  assert.equal(fresh.appended.length, 1);
  assert.equal(fresh.sketch.boundaryCopies.length, 1);
  assert.deepEqual(fresh.counts(), { closed: 1, released: 1 });
});

function libraryUpdateFixture() {
  const record = { key: "bracket", name: "Bracket", parts: [{ id: "saved" }] };
  const component = { id: "c1", modelKey: "bracket", def: { parts: [{ id: "local" }] } };
  const E = { open: true, docType: "assembly", contextEdit: null, assembly: { key: "asm", components: [component] } };
  const H = { generation: 1, editRevision: () => 0 };
  let history = {}, library = [record];
  const decisions = [], undo = [], flashes = [];
  const deps = {
    E, H, root: {}, t: key => key, cloneData: structuredClone, flash: message => flashes.push(message),
    currentHistoryNode: () => history,
    askModelerDecision: (host, options) => { const decision = deferred(); decisions.push({ options, ...decision }); return decision.promise; },
    isSubassembly: component => !!component.asm, loadLib: () => library, loadAssemblies: () => [],
    resolvedLibraryAssembly: value => value, containsAssembly: () => false,
    compactDocumentTopologySnapshots: value => value, compactAssemblyTopologySnapshots: value => value,
    pushUndo: label => undo.push(label),
    refreshSubassemblyFromRecord() {}, solveTopologyMates() {}, setComponentConfiguration() {},
    trackLibraryOccurrence(component, latest) { component.tracked = latest.key; },
    invalidateInterference() {}, solveAssembly() {}, refreshAll() {}, fitPreview() {}, refreshConfiguredComponent() {},
  };
  const api = load(["libraryUpdateSource", "assemblyHoldsComponent", "updateComponentFromLibrary"], deps);
  return {
    E, H, component, decisions, undo, flashes,
    update: () => api.updateComponentFromLibrary(component),
    edit() { history = {}; },
    resave() { library = [{ ...record, parts: [{ id: "newer" }] }]; },
  };
}

test("Update from library asks through the editor dialog and writes after acceptance", async () => {
  const f = libraryUpdateFixture();
  const updating = f.update();
  assert.equal(f.decisions.length, 1, "a nonblocking decision, not window.confirm");
  assert.equal(f.decisions[0].options.message, "updateFromLibraryAsk");
  await tick();
  assert.deepEqual(f.undo, [], "nothing is written while the question is open");
  f.decisions[0].resolve(true);
  assert.equal(await updating, true);
  assert.deepEqual(f.component.def.parts, [{ id: "saved" }]);
  assert.deepEqual(f.undo, ["updateFromLibrary"]);

  const declined = libraryUpdateFixture();
  const declining = declined.update();
  declined.decisions[0].resolve(null);
  assert.equal(await declining, false);
  assert.deepEqual(declined.component.def.parts, [{ id: "local" }]);
});

test("Update from library writes nothing when the approval went stale", async () => {
  const cases = {
    edited: f => f.edit(),
    resaved: f => f.resave(),
    removed: f => { f.E.assembly.components = []; },
    replaced: f => { f.E.assembly = { key: "asm", components: [f.component] }; },
    closed: f => { f.E.open = false; },
  };
  for (const [name, change] of Object.entries(cases)) {
    const f = libraryUpdateFixture();
    const updating = f.update();
    change(f);
    f.decisions[0].resolve(true);
    assert.equal(await updating, false, name);
    assert.deepEqual(f.component.def.parts, [{ id: "local" }], name);
    assert.deepEqual(f.undo, [], name);
    assert.deepEqual(f.flashes, ["updateFromLibraryStale"], name);
  }
});

test("Update from library still refuses a missing record before asking", async () => {
  const f = libraryUpdateFixture();
  f.component.modelKey = "gone";
  assert.equal(await f.update(), false);
  assert.equal(f.decisions.length, 0);
  assert.deepEqual(f.flashes, ["modelNotInLibrary"]);
});
