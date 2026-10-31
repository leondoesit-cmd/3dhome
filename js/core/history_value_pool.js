// Intern unchanged, large model definitions across undo snapshots. Returning
// a fresh decoded value prevents later live edits from changing older states.
import { retainHistoryPool } from './history_pool_roots.js';
export function createHistoryValuePool() {
  const tokens=new Map(),values=new Map();
  let sequence=0;
  return {
    pack(value) {
      const raw=JSON.stringify(value);
      let token=tokens.get(raw);
      if(!token){token='@model-history:'+ ++sequence;tokens.set(raw,token);values.set(token,raw);}
      return token;
    },
    unpack(value) {return values.has(value)?JSON.parse(values.get(value)):value;},
    retain(roots) { retainHistoryPool(values, roots, (token, raw) => { if (tokens.get(raw) === token) tokens.delete(raw); }); },
    entries(roots) { return [...values].filter(([token]) => !roots || roots.has(token)); },
    restore(entries) {
      for (const [token, raw] of entries || []) {
        const previous = values.get(token);
        if (previous !== raw && tokens.get(previous) === token) tokens.delete(previous);
        values.set(token, raw); tokens.set(raw, token);
        sequence = Math.max(sequence, Number(token.slice('@model-history:'.length)) || 0);
      }
    },
  };
}
