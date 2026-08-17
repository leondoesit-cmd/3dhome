// Pure recovery decision, separated so crash/multi-tab edge cases can be tested
// without a browser DOM.
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
