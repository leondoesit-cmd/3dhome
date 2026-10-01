import test from "node:test";
import assert from "node:assert/strict";
import { finishPreviewProofMatches } from "../js/core/finish_preview_proof.js";

test("an exact Shell preview verifies only its current body, inputs and history", () => {
  const document = {};
  const proof = {
    document, type:"shell", sourceId:42, token:7, historySignature:"features:7",
    params:{thickness:.254,direction:"inside",join:"round"},
    targets:[{kind:"face",persistentId:"base:face:start"}],
  };
  assert.equal(finishPreviewProofMatches(proof,{...proof}),true);
  for (const changed of [
    {document:{}}, {type:"draft"}, {sourceId:43}, {token:8},
    {historySignature:"features:8"}, {params:{...proof.params,thickness:.3}},
    {targets:[{kind:"face",persistentId:"base:face:end"}]},
  ]) assert.equal(finishPreviewProofMatches(proof,{...proof,...changed}),false);
  assert.equal(finishPreviewProofMatches(null,proof),false);
});
