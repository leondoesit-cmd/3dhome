import { decodeBinaryPayload } from "./binary_payload.js";

const DB_NAME="home3d_cad";
const STORE="attachments";
const memoryStore=new Map();

const clone=(value)=>value==null ? value : typeof structuredClone==="function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

export function isAttachmentReference(value) {
  return !!(value && value.version===1 && value.storage==="indexeddb" && /^sha256:[0-9a-f]{64}$/.test(value.attachmentId || ""));
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 is unavailable");
  const digest=await globalThis.crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest),(value)=>value.toString(16).padStart(2,"0")).join("");
}

function openDatabase() {
  return new Promise((resolve,reject)=>{
    if (typeof indexedDB==="undefined") return reject(new Error("IndexedDB unavailable"));
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE,{keyPath:"id"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error || new Error("Attachment database failed"));
  });
}

async function databaseRequest(mode,operation) {
  const database=await openDatabase();
  try {
    return await new Promise((resolve,reject)=>{
      const transaction=database.transaction(STORE,mode), request=operation(transaction.objectStore(STORE));
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error || new Error("Attachment request failed"));
      transaction.onerror=()=>reject(transaction.error || new Error("Attachment transaction failed"));
      transaction.onabort=()=>reject(transaction.error || new Error("Attachment transaction aborted"));
    });
  } finally { database.close(); }
}

async function putRecord(record) {
  memoryStore.set(record.id,clone(record));
  if (typeof indexedDB==="undefined") return;
  await databaseRequest("readwrite",(store)=>store.put(record));
}

async function getRecord(id) {
  if (memoryStore.has(id)) return clone(memoryStore.get(id));
  if (typeof indexedDB==="undefined") return null;
  const record=await databaseRequest("readonly",(store)=>store.get(id));
  if (record) memoryStore.set(id,clone(record));
  return record || null;
}

export async function putAttachment(payload) {
  if (isAttachmentReference(payload)) return clone(payload);
  const bytes=decodeBinaryPayload(payload), id="sha256:"+await sha256(bytes);
  const reference={
    version:1,storage:"indexeddb",attachmentId:id,
    format:payload.format,mediaType:payload.mediaType,byteLength:payload.byteLength,checksum:payload.checksum,
  };
  await putRecord({id,payload:clone(payload),createdAt:Date.now()});
  return reference;
}

export async function resolveAttachmentPayload(value) {
  if (!isAttachmentReference(value)) {
    decodeBinaryPayload(value);
    return clone(value);
  }
  const record=await getRecord(value.attachmentId);
  if (!record?.payload) throw new Error("Exact CAD attachment is missing: "+value.attachmentId);
  const bytes=decodeBinaryPayload(record.payload), actual="sha256:"+await sha256(bytes);
  if (actual!==value.attachmentId) throw new Error("Exact CAD attachment hash mismatch");
  return clone(record.payload);
}

async function externalizeNode(value,seen) {
  if (!value || typeof value!=="object") return value;
  if (isAttachmentReference(value)) return clone(value);
  if (value.version===1 && value.encoding==="base64" && typeof value.data==="string") {
    const key=value.checksum+":"+value.byteLength+":"+value.format;
    if (!seen.has(key)) seen.set(key,putAttachment(value));
    return clone(await seen.get(key));
  }
  if (Array.isArray(value)) return Promise.all(value.map((item)=>externalizeNode(item,seen)));
  const output={};
  for (const [key,item] of Object.entries(value)) output[key]=await externalizeNode(item,seen);
  return output;
}

export async function externalizeAttachments(value) {
  return externalizeNode(value,new Map());
}

export function collectAttachmentReferences(value,output=new Map()) {
  if (!value || typeof value!=="object") return output;
  if (isAttachmentReference(value)) { output.set(value.attachmentId,clone(value)); return output; }
  if (Array.isArray(value)) value.forEach((item)=>collectAttachmentReferences(item,output));
  else Object.values(value).forEach((item)=>collectAttachmentReferences(item,output));
  return output;
}

export async function exportAttachmentRecords(value) {
  const refs=Array.from(collectAttachmentReferences(value).values()), records=[];
  for (const reference of refs) records.push({reference,payload:await resolveAttachmentPayload(reference)});
  return records;
}

export async function installAttachmentRecords(records=[]) {
  for (const record of records) {
    if (!isAttachmentReference(record?.reference)) throw new Error("Project bundle has an invalid attachment reference");
    const reference=await putAttachment(record.payload);
    if (reference.attachmentId!==record.reference.attachmentId) throw new Error("Project bundle attachment hash mismatch");
  }
  return records.length;
}

export async function listAttachmentIds() {
  if (typeof indexedDB==="undefined") return Array.from(memoryStore.keys());
  return (await databaseRequest("readonly",(store)=>store.getAllKeys())).map(String);
}

export async function deleteAttachment(id) {
  memoryStore.delete(id);
  if (typeof indexedDB!=="undefined") await databaseRequest("readwrite",(store)=>store.delete(id));
}

export function clearMemoryAttachmentCache() {
  memoryStore.clear();
}
