const DB_NAME="home3d_model_library";
const DB_VERSION=2;
const MODEL_STORE="models";
const ASSEMBLY_STORE="assemblies";
const DRAFT_STORE="drafts";
const DRAFT_ID="latest";

let modelMemory=[];
let assemblyMemory=[];
let draftMemory=null;

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

export async function loadAssemblyLibrary(legacy=[]) {
  return loadKeyedStore(ASSEMBLY_STORE, assemblyRef, legacy);
}

export async function saveAssemblyLibrary(assemblies=[]) {
  return saveKeyedStore(ASSEMBLY_STORE, assemblyRef, assemblies);
}

export async function loadModelerDraftRecord() {
  if (typeof indexedDB==="undefined") return clone(draftMemory);
  const record=await run(DRAFT_STORE,"readonly",(store)=>new Promise((resolve,reject)=>{
    const request=store.get(DRAFT_ID); request.onsuccess=()=>resolve(request.result || null); request.onerror=()=>reject(request.error);
  }));
  if (!record) { draftMemory=null; return null; }
  const {id, ...draft} = record;
  draftMemory=clone(draft);
  return clone(draft);
}

export async function saveModelerDraftRecord(draft) {
  const next=clone(draft);
  if (typeof indexedDB!=="undefined") await run(DRAFT_STORE,"readwrite",(store)=>{
    store.put({...next, id:DRAFT_ID});
  });
  draftMemory=next;
  return clone(next);
}

export async function clearModelerDraftRecord() {
  if (typeof indexedDB!=="undefined") await run(DRAFT_STORE,"readwrite",(store)=>store.delete(DRAFT_ID));
  draftMemory=null;
}

export function clearMemoryModelLibrary() { modelMemory=[]; assemblyMemory=[]; draftMemory=null; }

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
