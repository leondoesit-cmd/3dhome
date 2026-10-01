/* A finished exact preview may stand in for the commit-time feasibility check
   only while it still describes the same history, body, targets and inputs. */
export function finishPreviewProofMatches(proof, request) {
  if (!proof || !request || proof.document !== request.document) return false;
  for (const key of ["type", "sourceId", "token", "historySignature"])
    if (proof[key] !== request[key]) return false;
  return JSON.stringify(proof.params) === JSON.stringify(request.params)
    && JSON.stringify(proof.targets) === JSON.stringify(request.targets);
}
