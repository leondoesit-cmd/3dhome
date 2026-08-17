import test from "node:test";
import assert from "node:assert/strict";

import { encodeBinaryPayload } from "../js/core/binary_payload.js";
import { externalizeAttachments, resolveAttachmentPayload, clearMemoryAttachmentCache } from "../js/core/attachment_store.js";
import { garbageCollectAttachments } from "../js/core/attachment_gc.js";
import { clearMemoryModelLibrary, loadModelLibrary, saveModelLibrary } from "../js/core/model_library_store.js";

test("model definitions persist outside the localStorage compatibility index", async () => {
  clearMemoryModelLibrary();
  const model={key:"cm_heavy",name:"Heavy",parts:[{kind:"direct",meshData:{positions:[1,2,3]},tex:"data:image/png;base64,AAAA"}]};
  await saveModelLibrary([model]);
  model.parts[0].meshData.positions[0]=99;
  const restored=await loadModelLibrary();
  assert.equal(restored[0].parts[0].meshData.positions[0],1);
  assert.match(restored[0].parts[0].tex,/data:image/);
});

test("attachment collection retains shared reachable hashes and removes only orphans", async () => {
  clearMemoryAttachmentCache();
  const keep=await externalizeAttachments({sourcePayload:encodeBinaryPayload(new Uint8Array([1,2,3]),{format:"brep"})});
  const orphan=await externalizeAttachments({sourcePayload:encodeBinaryPayload(new Uint8Array([4,5,6]),{format:"brep"})});
  const result=await garbageCollectAttachments([{version:{json:JSON.stringify(keep)}}]);
  assert.deepEqual(result.removed,[orphan.sourcePayload.attachmentId]);
  assert.equal((await resolveAttachmentPayload(keep.sourcePayload)).format,"brep");
  await assert.rejects(()=>resolveAttachmentPayload(orphan.sourcePayload),/missing/);
});
