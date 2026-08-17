import { isAttachmentReference, deleteAttachment, listAttachmentIds } from "./attachment_store.js";

function collect(value,reachable) {
  if (typeof value==="string" && /^[\[{]/.test(value.trim())) {
    try { collect(JSON.parse(value),reachable); } catch(error) {}
    return;
  }
  if (!value || typeof value!=="object") return;
  if (isAttachmentReference(value)) { reachable.set(value.attachmentId,value); return; }
  if (Array.isArray(value)) value.forEach((item)=>collect(item,reachable));
  else Object.values(value).forEach((item)=>collect(item,reachable));
}

function readStore(databaseName,storeName) {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(databaseName);
    request.onsuccess=()=>{
      const database=request.result;
      if (!database.objectStoreNames.contains(storeName)) { database.close(); resolve([]); return; }
      const transaction=database.transaction(storeName,"readonly"), query=transaction.objectStore(storeName).getAll();
      query.onsuccess=()=>resolve(query.result || []);
      query.onerror=()=>reject(query.error || new Error("Reachability scan failed"));
      transaction.oncomplete=()=>database.close();
      transaction.onerror=()=>{ database.close(); reject(transaction.error || new Error("Reachability scan failed")); };
    };
    request.onerror=()=>reject(request.error || new Error("Reachability database failed"));
  });
}

/** Delete only attachments unreachable from every known persistent root. */
export async function garbageCollectAttachments(liveRoots=[]) {
  const reachable=new Map();
  liveRoots.forEach((root)=>collect(root,reachable));
  if (typeof localStorage!=="undefined") {
    for (const key of ["home3d_auto","home3d_models","home3d_assemblies"]) collect(localStorage.getItem(key),reachable);
  }
  if (typeof indexedDB!=="undefined") {
    // A failed scan aborts the collection. Retaining an orphan is preferable
    // to deleting exact geometry still referenced by a recovery/version root.
    const roots=await Promise.all([
      readStore("home3d_model_library","models"),
      readStore("home3d_projects","projects"),
      readStore("home3d_recovery","snapshots"),
    ]);
    roots.flat().forEach((root)=>collect(root,reachable));
  }
  const all=await listAttachmentIds(), removed=[];
  for (const id of all) if (!reachable.has(id)) { await deleteAttachment(id); removed.push(id); }
  return {reachable:reachable.size,removed};
}
