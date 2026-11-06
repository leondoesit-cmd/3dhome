// Intern unchanged, large model definitions across undo snapshots. Returning
// a fresh decoded value prevents later live edits from changing older states.
import { historyPoolRoots, retainHistoryPool } from './history_pool_roots.js';
const TOKEN_PREFIX='@model-history:';
export function createHistoryValuePool() {
  const tokens=new Map(),values=new Map();
  let sequence=0;
  const intern=raw=>{
    let token=tokens.get(raw);
    if(!token){token=TOKEN_PREFIX+ ++sequence;tokens.set(raw,token);values.set(token,raw);}
    return token;
  };
  return {
    pack(value) {return intern(JSON.stringify(value));},
    intern,
    has(token) {return values.has(token);},
    unpack(value) {return values.has(value)?JSON.parse(values.get(value)):value;},
    retain(roots) { retainHistoryPool(values, roots, (token, raw) => { if (tokens.get(raw) === token) tokens.delete(raw); }); },
    entries(roots) { return [...values].filter(([token]) => !roots || roots.has(token)); },
    restore(entries) {
      for (const [token, raw] of entries || []) {
        const previous = values.get(token);
        if (previous !== raw && tokens.get(previous) === token) tokens.delete(previous);
        values.set(token, raw); tokens.set(raw, token);
        sequence = Math.max(sequence, Number(token.slice(TOKEN_PREFIX.length)) || 0);
      }
    },
  };
}

// Whole-document undo snapshots (the CAD modeler's) repeat derived caches that
// rarely change between steps: one embedded rolled hinge carries megabytes of
// mesh and exact topology. Values under the named keys are stored once in a
// pool and the snapshot holds their token. Decoding still yields fresh copies.
export function createHistorySnapshotCodec(keys,{minLength=4096}={}) {
  const pool=createHistoryValuePool(),pooled=new Set(keys);
  return {
    stringify(value) {
      return JSON.stringify(value,function(key,item){
        if(!pooled.has(key) || !item || typeof item!=='object')return item;
        const raw=JSON.stringify(item);
        return raw.length<minLength ? item : pool.intern(raw);
      });
    },
    // A token whose value was released decodes as absent derived data rather
    // than as a string where a mesh or cache object is expected.
    parse(text) {
      return JSON.parse(text,function(key,item){
        if(!pooled.has(key) || typeof item!=='string' || !item.startsWith(TOKEN_PREFIX))return item;
        return pool.has(item) ? pool.unpack(item) : undefined;
      });
    },
    // Release pooled values no retained snapshot refers to any more.
    retain(snapshots) { if(pool.entries().length)pool.retain(historyPoolRoots(snapshots)); },
    entries() { return pool.entries(); },
  };
}
