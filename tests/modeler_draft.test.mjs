import test from "node:test";
import assert from "node:assert/strict";
import {
  MODELER_DRAFT_KEY,
  MODELER_TAB_KEY,
  claimLegacyModelerDraft,
  clearModelerDraft,
  modelerDraftKey,
  modelerDraftOwner,
  freshModelerDraftOwner,
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

test('starting fresh keeps the old recovery record and writes into a reload-stable namespace', () => {
  const shared = memoryStorage(), session = memoryStorage();
  const original = modelerDraftOwner(session, () => 'original');
  writeModelerDraft(shared, {docType:'part', def:{name:'Unfinished recovery', parts:[{id:'old'}]}}, 1, original);
  const snapshot = shared.getItem(modelerDraftKey(original));
  const fresh = freshModelerDraftOwner(session, () => 'fresh');
  assert.notEqual(fresh, original);
  assert.equal(modelerDraftOwner(session), fresh);
  assert.equal(readModelerDraft(shared, fresh), null);
  writeModelerDraft(shared, {docType:'part', def:{name:'Blank test', parts:[]}}, 2, fresh);
  assert.equal(shared.getItem(modelerDraftKey(original)), snapshot);
  assert.equal(readModelerDraft(shared, fresh).def.parts.length, 0);
});

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

test("re-serializing a recovery record preserves its optimistic baselines and parked Part", () => {
  const payload={docType:"part",def:{name:"Working component"},previousDef:{name:"Parked Part"},assembly:{key:"parent"},
    dirty:{part:true,assembly:false},libraryBaseline:{key:"part",name:"Stored"},assemblyBaseline:{key:"parent",components:[]}};
  const first=parseModelerDraft(serializeModelerDraft(payload));
  const second=parseModelerDraft(serializeModelerDraft(first));
  assert.equal(second.libraryBaselineJson,first.libraryBaselineJson);
  assert.equal(second.assemblyBaselineJson,first.assemblyBaselineJson);
  assert.deepEqual(second.previousDef,payload.previousDef);assert.deepEqual(second.dirty,payload.dirty);
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

test('two browser tabs keep independent local fallback drafts through reload, save, and discard',()=>{
  const shared=memoryStorage(), firstSession=memoryStorage(), secondSession=memoryStorage();
  const first=modelerDraftOwner(firstSession,()=>"first-tab");
  const second=modelerDraftOwner(secondSession,()=>"second-tab");
  assert.equal(firstSession.getItem(MODELER_TAB_KEY),first);
  assert.equal(modelerDraftOwner(firstSession,()=>"wrong-id"),first);
  assert.notEqual(first,second);
  writeModelerDraft(shared,{docType:"part",def:{name:"BATTERY"}},1,first);
  writeModelerDraft(shared,{docType:"part",def:{name:"LENS"}},2,second);
  assert.equal(readModelerDraft(shared,first).def.name,"BATTERY");
  assert.equal(readModelerDraft(shared,second).def.name,"LENS");
  // A reload retains the tab identity and recovers its own draft only.
  assert.equal(readModelerDraft(shared,modelerDraftOwner(firstSession)).def.name,"BATTERY");
  clearModelerDraft(shared,first);
  assert.equal(readModelerDraft(shared,first),null);
  assert.equal(readModelerDraft(shared,second).def.name,"LENS");
  assert.ok(shared.getItem(modelerDraftKey(second)));
});

test('a legacy shared draft stays untouched until explicit migration',()=>{
  const shared=memoryStorage();
  writeModelerDraft(shared,{docType:"part",def:{name:"Earlier BULB"}},10);
  const fresh=modelerDraftOwner(memoryStorage(),()=>"new-tab");
  assert.equal(readModelerDraft(shared,fresh),null);
  assert.equal(readModelerDraft(shared).def.name,"Earlier BULB");
  const claimed=claimLegacyModelerDraft(shared,fresh);
  assert.equal(claimed.def.name,"Earlier BULB");
  assert.equal(readModelerDraft(shared),null);
  assert.equal(readModelerDraft(shared,fresh).def.name,"Earlier BULB");
});

test('recovered edits carry the exact saved revision they started from',()=>{
  const baseline={key:'cm_lenscap',name:'LENSCAP',exactTopologyCache:{signature:'saved-shape'}};
  const edited={key:'cm_lenscap',name:'LENSCAP',exactTopologyCache:{signature:'edited-shape'}};
  const draft=parseModelerDraft(serializeModelerDraft({docType:'part',def:edited,libraryBaseline:baseline}));
  assert.equal(draft.def.exactTopologyCache,undefined);
  assert.deepEqual(JSON.parse(draft.libraryBaselineJson),baseline);
  assert.notDeepEqual(JSON.parse(draft.libraryBaselineJson),edited);
});
