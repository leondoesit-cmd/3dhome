const DB_NAME="home3d_model_library";
const STORE="models";
let memory=[];

const clone=(value)=>value==null ? value : typeof structuredClone==="function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

function openDatabase() {
  return new Promise((resolve,reject)=>{
    if (typeof indexedDB==="undefined") return reject(new Error("IndexedDB unavailable"));
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE,{keyPath:"key"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error || new Error("Model library database failed"));
  });
}

async function run(mode,operation) {
  const database=await openDatabase();
  try {
    return await new Promise((resolve,reject)=>{
      const transaction=database.transaction(STORE,mode), store=transaction.objectStore(STORE);
      let result;
      try { result=operation(store,transaction); } catch(error) { reject(error); return; }
      transaction.oncomplete=()=>resolve(result);
      transaction.onerror=()=>reject(transaction.error || new Error("Model library transaction failed"));
      transaction.onabort=()=>reject(transaction.error || new Error("Model library transaction aborted"));
    });
  } finally { database.close(); }
}

export async function loadModelLibrary(legacy=[]) {
  if (typeof indexedDB==="undefined") {
    if (!memory.length && legacy.length) memory=clone(legacy);
    return clone(memory);
  }
  const records=await run("readonly",(store)=>new Promise((resolve,reject)=>{
    const request=store.getAll(); request.onsuccess=()=>resolve(request.result || []); request.onerror=()=>reject(request.error);
  }));
  if (!records.length && legacy.length) {
    await saveModelLibrary(legacy);
    return clone(legacy);
  }
  memory=clone(records);
  return clone(records);
}

export async function saveModelLibrary(models=[]) {
  const next=clone(models);
  if (typeof indexedDB!=="undefined") await run("readwrite",(store)=>{
    store.clear();
    next.forEach((model)=>store.put(model));
  });
  memory=next;
  return clone(next);
}

export function clearMemoryModelLibrary() { memory=[]; }
