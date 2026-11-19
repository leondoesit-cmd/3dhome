// Region updates arrive in batches at 10 Hz. Spread the maps in a batch
// over drag frames; a cube and the sun otherwise redraw in the same frame.
export function dragShadowQueue() {
  let pending = new Map();
  return {
    add(shadow, box) {
      const previous = pending.get(shadow);
      if (previous) previous.union(box);
      else pending.set(shadow, box.clone());
    },
    take(paced) {
      if (!pending.size) return pending;
      if (!paced) {
        const batch = pending;
        pending = new Map();
        return batch;
      }
      const first = pending.keys().next().value;
      const batch = new Map([[first, pending.get(first)]]);
      pending.delete(first);
      return batch;
    },
    get size() { return pending.size; },
  };
}
