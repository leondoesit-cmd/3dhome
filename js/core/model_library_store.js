const DB_NAME="home3d_model_library";
const DB_VERSION=2;
const MODEL_STORE="models";
const ASSEMBLY_STORE="assemblies";
const DRAFT_STORE="drafts";
const DRAFT_ID="latest";

let modelMemory=[];
let assemblyMemory=[];
let draftMemory=new Map();
const draftWrites=new Map();

const clone=(value)=>value==null ? value : typeof structuredClone==="function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

const STORES=[[MODEL_STORE,"key"],[ASSEMBLY_STORE,"key"],[DRAFT_STORE,"id"]];

function openAt(version) {
  return new Promise((resolve,reject)=>{
    const request=version==null ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME,version);
    request.onupgradeneeded=()=>{
      const db=request.result;
      for (const [name,keyPath] of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name,{keyPath});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error || new Error("Model library database failed"));
  });
}

/* The stores are created only in an upgrade, so a database that already sits
   at DB_VERSION without them never gets them: every read then fails with
   "object store not found" and the library cannot load or save. That state is
   one stray indexedDB.open(DB_NAME, 2) away — a DevTools probe, a script, a
   cleared-and-recreated profile. Heal it by upgrading one version past the
   current one, which adds only the missing stores and keeps everything else.
   A database already above DB_VERSION (healed earlier) opens at its own
   version instead of failing with a VersionError. */
export async function openModelLibraryDatabase() {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB unavailable");
  let db;
  try { db=await openAt(DB_VERSION); }
  catch (error) {
    if (!error || error.name!=="VersionError") throw error;
    db=await openAt(null);
  }
  if (STORES.every(([name])=>db.objectStoreNames.contains(name))) return db;
  const next=db.version+1;
  db.close();
  return openAt(next);
}
const openDatabase=openModelLibraryDatabase;

async function run(storeName, mode, operation) {
  const database=await openDatabase();
  try {
    return await new Promise((resolve,reject)=>{
      const transaction=database.transaction(storeName,mode), store=transaction.objectStore(storeName);
      let result;
      try { result=operation(store,transaction); } catch(error) { reject(error); return; }
      transaction.oncomplete=()=>resolve(result);
      transaction.onerror=()=>reject(transaction.error || new Error("Model library transaction failed"));
      transaction.onabort=()=>reject(transaction.error || new Error("Model library transaction aborted"));
    });
  } finally { database.close(); }
}

async function loadKeyedStore(storeName, memoryRef, legacy=[]) {
  if (typeof indexedDB==="undefined") {
    if (!memoryRef.list.length && legacy.length) memoryRef.list=clone(legacy);
    return clone(memoryRef.list);
  }
  const records=await run(storeName,"readonly",(store)=>new Promise((resolve,reject)=>{
    const request=store.getAll(); request.onsuccess=()=>resolve(request.result || []); request.onerror=()=>reject(request.error);
  }));
  const usable=records.filter((item)=>item && item.key);
  if (!usable.length && legacy.length) {
    await saveKeyedStore(storeName, memoryRef, legacy);
    return clone(legacy);
  }
  memoryRef.list=clone(usable);
  return clone(usable);
}

async function saveKeyedStore(storeName, memoryRef, items=[]) {
  const next=clone(items);
  if (typeof indexedDB!=="undefined") await run(storeName,"readwrite",(store)=>{
    store.clear();
    next.forEach((item)=>store.put(item));
  });
  memoryRef.list=next;
  return clone(next);
}

const modelRef={get list(){return modelMemory;}, set list(value){modelMemory=value;}};
const assemblyRef={get list(){return assemblyMemory;}, set list(value){assemblyMemory=value;}};

export async function loadModelLibrary(legacy=[]) {
  return loadKeyedStore(MODEL_STORE, modelRef, legacy);
}

export async function saveModelLibrary(models=[]) {
  return saveKeyedStore(MODEL_STORE, modelRef, models);
}

/* A tab's library array is only a snapshot. A normal save must never clear the
   object store and write that snapshot back: doing so deletes models saved in
   other tabs since this one opened. All of these changes happen in one IDB
   readwrite transaction, so the expected-record check and write are atomic. */
async function changeKeyedStore(storeName, memoryRef, change) {
  const apply=(records)=>{
    const current=clone(records.filter((item)=>item && item.key));
    const decision=change(current);
    return { ...decision, records:decision.records || current };
  };
  let outcome;
  if (typeof indexedDB==="undefined") outcome=apply(memoryRef.list);
  else outcome=await run(storeName,"readwrite",(store)=>new Promise((resolve,reject)=>{
    const request=store.getAll();
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      try {
        const decision=apply(request.result || []);
        for (const key of decision.deletes || []) store.delete(key);
        for (const record of decision.puts || []) store.put(record);
        resolve(decision);
      } catch(error) { reject(error); }
    };
  }));
  memoryRef.list=clone(outcome.records);
  // apply() owns a detached transaction snapshot; the internal cache above
  // owns another copy. Returning this result cannot mutate either the caller's
  // input or the cache, so avoid a third copy of the entire saved library.
  return outcome;
}

export async function putModelLibraryRecord(model, options={}) {
  if (!model || !model.key) throw new Error("A keyed model record is required");
  return changeKeyedStore(MODEL_STORE,modelRef,(records)=>{
    const index=records.findIndex((item)=>item.key===model.key);
    const stored=index<0 ? null : records[index];
    // `expected:null` means a new key. Undefined means an intentional replace,
    // as when importing a library with the user's overwrite choice.
    if (options.expected!==undefined && JSON.stringify(stored)!==JSON.stringify(options.expected))
      return {ok:false,conflict:true,records};
    const next=clone(model);
    if (index<0) records.push(next); else records[index]=next;
    return {ok:true,records,puts:[next]};
  });
}

export async function deleteModelLibraryRecord(key) {
  return changeKeyedStore(MODEL_STORE,modelRef,(records)=>({
    ok:true, records:records.filter((item)=>item.key!==key), deletes:[key],
  }));
}

export async function mergeStoredModelLibrary(incoming=[],options={}) {
  return changeKeyedStore(MODEL_STORE,modelRef,(records)=>{
    const merged=mergeLibraryRecords(records,incoming,options);
    const before=new Map(records.map((item)=>[item.key,JSON.stringify(item)]));
    const puts=merged.filter((item)=>before.get(item.key)!==JSON.stringify(item));
    return {ok:true,records:merged,puts};
  });
}

export async function loadAssemblyLibrary(legacy=[]) {
  return loadKeyedStore(ASSEMBLY_STORE, assemblyRef, legacy);
}

export async function saveAssemblyLibrary(assemblies=[]) {
  return saveKeyedStore(ASSEMBLY_STORE, assemblyRef, assemblies);
}

export async function putAssemblyLibraryRecord(assembly,options={}) {
  if (!assembly || !assembly.key) throw new Error("A keyed assembly record is required");
  return changeKeyedStore(ASSEMBLY_STORE,assemblyRef,(records)=>{
    const index=records.findIndex((item)=>item.key===assembly.key);
    const stored=index<0 ? null : records[index];
    if (options.expected!==undefined && JSON.stringify(stored)!==JSON.stringify(options.expected))
      return {ok:false,conflict:true,records};
    const next=clone(assembly);
    if (index<0) records.push(next); else records[index]=next;
    return {ok:true,records,puts:[next]};
  });
}

export async function deleteAssemblyLibraryRecord(key) {
  return changeKeyedStore(ASSEMBLY_STORE,assemblyRef,(records)=>({
    ok:true,records:records.filter((item)=>item.key!==key),deletes:[key],
  }));
}

export async function mergeStoredAssemblyLibrary(incoming=[],options={}) {
  return changeKeyedStore(ASSEMBLY_STORE,assemblyRef,(records)=>{
    const merged=mergeLibraryRecords(records,incoming,options);
    const before=new Map(records.map((item)=>[item.key,JSON.stringify(item)]));
    return {ok:true,records:merged,puts:merged.filter((item)=>before.get(item.key)!==JSON.stringify(item))};
  });
}

function draftId(owner) { return owner ? "tab:"+owner : DRAFT_ID; }
function queueDraftWrite(owner, work) {
  const id=draftId(owner), previous=draftWrites.get(id) || Promise.resolve();
  const next=previous.catch(()=>{}).then(work);
  draftWrites.set(id,next);
  next.finally(()=>{ if (draftWrites.get(id)===next) draftWrites.delete(id); }).catch(()=>{});
  return next;
}

export async function loadModelerDraftRecord(owner) {
  const id=draftId(owner);
  if (draftWrites.has(id)) await draftWrites.get(id);
  if (typeof indexedDB==="undefined") return clone(draftMemory.get(id) || null);
  const record=await run(DRAFT_STORE,"readonly",(store)=>new Promise((resolve,reject)=>{
    const request=store.get(id); request.onsuccess=()=>resolve(request.result || null); request.onerror=()=>reject(request.error);
  }));
  if (!record) { draftMemory.delete(id); return null; }
  const {id:storedId, ...draft} = record;
  draftMemory.set(draftId(owner),clone(draft));
  return clone(draft);
}

// Recovery is a read-only snapshot. Keep the source tab's record available.
function recoverableDraft(record) {
  if (!record || typeof record !== "object") return false;
  const document=record.docType === "assembly" ? record.assembly : record.def;
  return !!document && typeof document === "object" && !Array.isArray(document);
}
export async function listModelerDraftRecords() {
  await Promise.allSettled([...draftWrites.values()]);
  if (typeof indexedDB === "undefined") {
    return [...draftMemory.entries()].filter(([,draft])=>recoverableDraft(draft)).map(([id,draft])=>({id,...clone(draft)})).sort((a,b)=>(b.at || 0)-(a.at || 0));
  }
  const records = await run(DRAFT_STORE,"readonly",store=>new Promise((resolve,reject)=>{
    const request=store.getAll();
    request.onsuccess=()=>resolve(request.result || []);
    request.onerror=()=>reject(request.error);
  }));
  return records.filter(recoverableDraft).map(clone).sort((a,b)=>(b.at || 0)-(a.at || 0));
}

export async function saveModelerDraftRecord(draft, owner) {
  const id=draftId(owner);
  const next=clone(draft);
  return queueDraftWrite(owner,async()=>{
    if (typeof indexedDB!=="undefined") await run(DRAFT_STORE,"readwrite",(store)=>{
      store.put({...next, id});
    });
    draftMemory.set(id,next);
    return clone(next);
  });
}

export async function clearModelerDraftRecord(owner) {
  const id=draftId(owner);
  return queueDraftWrite(owner,async()=>{
    if (typeof indexedDB!=="undefined") await run(DRAFT_STORE,"readwrite",(store)=>store.delete(id));
    draftMemory.delete(id);
  });
}

/* Claim the pre-tab "latest" record atomically. A second tab cannot observe
   that legacy record once the first claimant moves it to its own key. */
export async function claimLegacyModelerDraftRecord(owner) {
  if (!owner) return null;
  const target=draftId(owner);
  if (typeof indexedDB==="undefined") {
    const current=draftMemory.get(target);
    if (current) return clone(current);
    const legacy=draftMemory.get(DRAFT_ID);
    if (legacy) { draftMemory.set(target,clone(legacy)); draftMemory.delete(DRAFT_ID); }
    return clone(legacy || null);
  }
  return run(DRAFT_STORE,"readwrite",(store)=>new Promise((resolve,reject)=>{
    const request=store.get(target);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      if (request.result) { const {id,...draft}=request.result; resolve(draft); return; }
      const legacyRequest=store.get(DRAFT_ID);
      legacyRequest.onerror=()=>reject(legacyRequest.error);
      legacyRequest.onsuccess=()=>{
        const legacy=legacyRequest.result;
        if (!legacy) { resolve(null); return; }
        const {id,...draft}=legacy;
        store.put({...draft,id:target});
        store.delete(DRAFT_ID);
        resolve(draft);
      };
    };
  }));
}

export function clearMemoryModelLibrary() { modelMemory=[]; assemblyMemory=[]; draftMemory=new Map(); draftWrites.clear(); }

export const LIBRARY_BUNDLE_FORMAT = "modelforge-library";

export function libraryBundle(models = [], assemblies = []) {
  return { format: LIBRARY_BUNDLE_FORMAT, v: 1, models: clone(models) || [], assemblies: clone(assemblies) || [] };
}

export function parseLibraryBundle(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || data.format !== LIBRARY_BUNDLE_FORMAT) throw new Error("Not a ModelForge library file");
  return {
    models: Array.isArray(data.models) ? data.models.filter((item) => item && item.key) : [],
    assemblies: Array.isArray(data.assemblies) ? data.assemblies.filter((item) => item && item.key) : [],
  };
}

export function collidingLibraryKeys(current = [], incoming = []) {
  const have = new Set((current || []).filter((item) => item && item.key).map((item) => item.key));
  return [...new Set((incoming || []).filter((item) => item && have.has(item.key)).map((item) => item.key))];
}

export function uniqueLibraryKey(base, taken) {
  const root = String(base || "model");
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(root + "-" + n)) n++;
  return root + "-" + n;
}

export function mergeLibraryRecords(current = [], incoming = [], options = {}) {
  const conflict = options.conflict === "keep-both" || options.conflict === "skip" ? options.conflict : "replace";
  const byKey = new Map((current || []).filter((item) => item && item.key).map((item) => [item.key, clone(item)]));
  const taken = new Set(byKey.keys());
  for (const item of incoming || []) {
    if (!item || !item.key) continue;
    if (byKey.has(item.key) && conflict !== "replace") {
      if (conflict === "skip") continue;
      const copy = clone(item);
      copy.key = uniqueLibraryKey(item.key, taken);
      if (!copy.name || copy.name === item.key) copy.name = copy.key;
      byKey.set(copy.key, copy);
      taken.add(copy.key);
      continue;
    }
    byKey.set(item.key, clone(item));
    taken.add(item.key);
  }
  return Array.from(byKey.values());
}
