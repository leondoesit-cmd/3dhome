// Pure recovery decision, separated so crash/multi-tab edge cases can be tested
// without a browser DOM.
export function pruneCleanSessions(clean, retainedSessions = [], limit = 40) {
  const protectedIds = new Set(retainedSessions.filter(id => typeof id === "string" && id));
  const ids = Object.keys(clean);
  if (ids.length <= limit) return clean;
  const retained = ids.filter(id => protectedIds.has(id));
  const recent = ids.filter(id => !protectedIds.has(id)).sort((a,b) => clean[b] - clean[a]);
  const keep = new Set(retained.concat(recent.slice(0, Math.max(0, limit - retained.length))));
  return Object.fromEntries(ids.filter(id => keep.has(id)).map(id => [id, clean[id]]));
}

export function needsRecovery(snap, state) {
  if (!snap || !snap.json) return false;
  const now = state.now;
  if (!snap.session)
    return Number.isFinite(state.legacyLeaseAt) && now - state.legacyLeaseAt > state.staleMs;
  if (Number.isFinite(state.cleanAt) && state.cleanAt >= snap.at) return false;
  if (state.alive === true) return false;
  if (
    state.alive === null &&
    Number.isFinite(state.leaseAt) &&
    now - state.leaseAt <= state.staleMs
  )
    return false;
  return true;
}
