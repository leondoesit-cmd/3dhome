// Intern unchanged, large model definitions across undo snapshots. Returning
// a fresh decoded value prevents later live edits from changing older states.
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
  };
}
