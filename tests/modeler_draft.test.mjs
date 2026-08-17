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
