// Snapshot tokens are JSON string values. A conservative textual scan also
// retains token-looking user strings; it can keep extra data, never discard
// a referenced value. Avoid decoding every large history snapshot on cleanup.
export function historyPoolRoots(snapshots) {
  const roots = new Set();
  for (const snapshot of new Set(snapshots)) {
    if (typeof snapshot !== 'string') continue;
    for (const match of snapshot.matchAll(/"(@(?:tex:|floor:|baseline:|vector:|model-history:)\d+)"/g)) roots.add(match[1]);
  }
  return roots;
}

export function retainHistoryPool(pool, roots, onDelete) {
  for (const [token, value] of pool) {
    if (roots.has(token)) continue;
    pool.delete(token);
    if (onDelete) onDelete(token, value);
  }
}
