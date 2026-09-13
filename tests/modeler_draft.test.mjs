import test from "node:test";
import assert from "node:assert/strict";
import {
  MODELER_DRAFT_KEY,
  clearModelerDraft,
  parseModelerDraft,
  readModelerDraft,
  serializeModelerDraft,
  writeModelerDraft,
} from "../js/modeler_draft.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

test("modeler drafts round-trip a part definition", () => {
  const storage = memoryStorage();
  const def = { id: "part:1", name: "Block", parts: [{ id: "p1", kind: "box" }] };
  assert.equal(writeModelerDraft(storage, { docType: "part", def }, 1000), true);
  assert.ok(storage.getItem(MODELER_DRAFT_KEY));
  const draft = readModelerDraft(storage);
  assert.equal(draft.docType, "part");
  assert.equal(draft.def.name, "Block");
  assert.equal(draft.def.parts[0].id, "p1");
  assert.notEqual(draft.def, def);
  clearModelerDraft(storage);
  assert.equal(readModelerDraft(storage), null);
});

test("modeler drafts reject stale or incomplete payloads", () => {
  assert.equal(parseModelerDraft(""), null);
  assert.equal(parseModelerDraft("{not json"), null);
  assert.equal(parseModelerDraft(JSON.stringify({ v: 99, docType: "part", def: {} })), null);
  assert.equal(parseModelerDraft(JSON.stringify({ v: 1, docType: "part" })), null);
  assert.equal(parseModelerDraft(JSON.stringify({ v: 1, docType: "assembly" })), null);
  const raw = serializeModelerDraft({ docType: "assembly", assembly: { key: "a1", components: [] } }, 5);
  const parsed = parseModelerDraft(raw);
  assert.equal(parsed.docType, "assembly");
  assert.equal(parsed.assembly.key, "a1");
});

test('draft backup omits regenerable topology cache without losing authored references or mesh imports',()=>{
  const def={id:'part',features:[{id:'round',references:{topology:[{kind:'face',persistentId:'wall:top'}]}}],parts:[{id:'import',kind:'mesh',meshData:{positions:[0,0,0,1,0,0,0,1,0]}}],exactTopologyCache:{wall:{signature:'x'.repeat(1000000),topology:[]}}};
  const raw=serializeModelerDraft({docType:'part',def});
  assert.ok(raw.length<1000);
  const restored=parseModelerDraft(raw).def;
  assert.deepEqual(restored.features,def.features);assert.deepEqual(restored.parts,def.parts);
  assert.equal(restored.exactTopologyCache,undefined);assert.ok(def.exactTopologyCache);
});
