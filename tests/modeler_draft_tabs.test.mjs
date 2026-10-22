import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  claimLegacyModelerDraftRecord,
  clearMemoryModelLibrary,
  clearModelerDraftRecord,
  loadModelerDraftRecord,
  listModelerDraftRecords,
  saveModelerDraftRecord,
} from "../js/core/model_library_store.js";
import { readFile } from "node:fs/promises";

const part = name => ({v:1,at:Date.now(),docType:"part",def:{name}});

test("recovery omits malformed records without deleting their stored data",async()=>{
  clearMemoryModelLibrary();
  const invalid=[null,{docType:'part',def:null},{docType:'assembly',def:{name:'wrong type'}},{docType:'part',def:[]},{docType:'part',def:'bad'}];
  for(let i=0;i<invalid.length;i++)await saveModelerDraftRecord(invalid[i],'invalid-'+i);
  await saveModelerDraftRecord(part('fresh valid'),'valid');
  assert.deepEqual((await listModelerDraftRecords()).map(r=>r.def.name),['fresh valid']);
  for(let i=0;i<invalid.length;i++)assert.deepEqual(await loadModelerDraftRecord('invalid-'+i),invalid[i]);
});

test("recovery lists every tab without mutating or claiming its draft",async()=>{
  clearMemoryModelLibrary();
  await saveModelerDraftRecord({...part("older"),at:10},"tab-a");
  const pending=saveModelerDraftRecord({...part("latest"),at:20},"tab-b");
  const records=await listModelerDraftRecords();
  await pending;
  assert.deepEqual(records.map(r=>[r.id,r.def.name]),[["tab:tab-b","latest"],["tab:tab-a","older"]]);
  records[0].def.name="changed recovered copy";
  assert.equal((await loadModelerDraftRecord("tab-b")).def.name,"latest");
  await clearModelerDraftRecord("recovery-tab");
  assert.equal((await loadModelerDraftRecord("tab-a")).def.name,"older");
});

test("concurrent tabs save and clear only their own indexed draft records",async()=>{
  clearMemoryModelLibrary();
  await Promise.all([
    saveModelerDraftRecord(part("BATTERY"),"tab-a"),
    saveModelerDraftRecord(part("LENS"),"tab-b"),
  ]);
  assert.equal((await loadModelerDraftRecord("tab-a")).def.name,"BATTERY");
  assert.equal((await loadModelerDraftRecord("tab-b")).def.name,"LENS");
  await clearModelerDraftRecord("tab-a");
  assert.equal(await loadModelerDraftRecord("tab-a"),null);
  assert.equal((await loadModelerDraftRecord("tab-b")).def.name,"LENS");
});

test("a crash reload sees the last write, while a queued discard cannot be undone by an older write",async()=>{
  clearMemoryModelLibrary();
  const pending=saveModelerDraftRecord(part("before save"),"tab-a");
  const cleared=clearModelerDraftRecord("tab-a");
  await Promise.all([pending,cleared]);
  assert.equal(await loadModelerDraftRecord("tab-a"),null);
  await saveModelerDraftRecord(part("after crash"),"tab-a");
  assert.equal((await loadModelerDraftRecord("tab-a")).def.name,"after crash");
});

test("legacy indexed draft remains until a deliberate claim and moves to one tab",async()=>{
  clearMemoryModelLibrary();
  await saveModelerDraftRecord(part("legacy"));
  assert.equal(await loadModelerDraftRecord("fresh-tab"),null);
  assert.equal((await loadModelerDraftRecord()).def.name,"legacy");
  assert.equal((await claimLegacyModelerDraftRecord("first-tab")).def.name,"legacy");
  assert.equal(await loadModelerDraftRecord(),null);
  assert.equal(await claimLegacyModelerDraftRecord("second-tab"),null);
  assert.equal((await loadModelerDraftRecord("first-tab")).def.name,"legacy");
});

test("editor initialization never auto-claims an unattributed legacy draft",async()=>{
  const source=modelerSource();
  const init=source.slice(source.indexOf("async function initializeModelLibrary("),source.indexOf("function writeLibraryIndex("));
  assert.match(init,/loadModelerDraftRecord\(modelerDraftOwnerId\)/);
  assert.doesNotMatch(init,/claimLegacyModelerDraftRecord|claimLegacyModelerDraft\(/);
  assert.match(source,/function appendLegacyDraftRecovery\(/);
  assert.match(source,/async function recoverLegacyModelerDraft\(/);
});
