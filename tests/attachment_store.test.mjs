import test from "node:test";
import assert from "node:assert/strict";

import { encodeBinaryPayload, decodeBinaryPayload } from "../js/core/binary_payload.js";
import {
  clearMemoryAttachmentCache,
  collectAttachmentReferences,
  exportAttachmentRecords,
  externalizeAttachments,
  installAttachmentRecords,
  isAttachmentReference,
  resolveAttachmentPayload,
} from "../js/core/attachment_store.js";
import { createProjectBundle } from "../js/cad_project_bundle.js";

const exactPayload=()=>encodeBinaryPayload(new Uint8Array([1,3,3,7,9,42,255]),{format:"brep",mediaType:"model/vnd.opencascade.brep"});

test("exact payloads externalize to one content-addressed attachment",async()=>{
  const payload=exactPayload();
  const definition={
    features:[{id:"import",params:{sourcePayload:payload}}],
    parts:[{id:"body",sourcePayload:payload}],
  };
  const external=await externalizeAttachments(definition);
  const featureRef=external.features[0].params.sourcePayload, partRef=external.parts[0].sourcePayload;
  assert.equal(isAttachmentReference(featureRef),true);
  assert.equal(featureRef.attachmentId,partRef.attachmentId);
  assert.equal("data" in featureRef,false);
  assert.equal(collectAttachmentReferences(external).size,1);
  assert.deepEqual(Array.from(decodeBinaryPayload(await resolveAttachmentPayload(featureRef))),[1,3,3,7,9,42,255]);
});

test("portable attachment records restore a cleared content cache",async()=>{
  const external=await externalizeAttachments({sourcePayload:exactPayload()});
  const records=await exportAttachmentRecords(external);
  assert.equal(records.length,1);
  clearMemoryAttachmentCache();
  await assert.rejects(()=>resolveAttachmentPayload(external.sourcePayload),/missing/);
  assert.equal(await installAttachmentRecords(records),1);
  assert.deepEqual(Array.from(decodeBinaryPayload(await resolveAttachmentPayload(external.sourcePayload))),[1,3,3,7,9,42,255]);
  await assert.rejects(()=>installAttachmentRecords([{reference:records[0].reference,payload:encodeBinaryPayload(new Uint8Array([8]),{format:"brep"})}]),/hash mismatch/);
});

test("project bundles replace inline exact data with references and an attachment manifest",async()=>{
  const bundle=await createProjectBundle({key:"model",parts:[{id:"body",sourcePayload:exactPayload()}],features:[]},[],[]);
  assert.equal(bundle.version,3);
  assert.equal(bundle.metadata.attachmentStorage,"content-addressed");
  assert.equal(isAttachmentReference(bundle.mainModel.parts[0].sourcePayload),true);
  assert.equal(bundle.attachments.length,1);
  assert.equal(bundle.attachments[0].reference.attachmentId,bundle.mainModel.parts[0].sourcePayload.attachmentId);
});
