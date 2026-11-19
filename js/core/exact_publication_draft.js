/* Exact rebuild preparation writes recipes, bindings and feature/sketch status.
   Keep those writes private until the native and lightweight results are both
   ready. Retain live record identities for selections and pending body work. */
export function createExactPublicationDraft(document, transferredMeshes = []) {
  const originals = new Map();
  const copies = new Map();
  // Transferred meshes already belong to this generation. The paper drawing
  // and bulk display buffers are read-only inputs to all preparation stages.
  const opaque = new Set(transferredMeshes);
  opaque.add(document.drawing);
  for (const part of document.parts || []) {
    const mesh = part?.meshData;
    if (mesh) for (const key of ['positions','indices','normals','colors']) opaque.add(mesh[key]);
  }
  function isRecord(value) {
    return value && typeof value === 'object' && !opaque.has(value)
      && (Array.isArray(value) || Object.prototype.toString.call(value) === '[object Object]');
  }
  function copyTree(value) {
    if (!value || typeof value !== 'object' || opaque.has(value)) return value;
    if (copies.has(value)) return copies.get(value);
    if (!isRecord(value)) {
      const result = structuredClone(value);
      copies.set(value,result);
      return result;
    }
    const result = Array.isArray(value) ? new Array(value.length) : {...value};
    copies.set(value,result);
    originals.set(result,value);
    for (const key of Object.keys(value)) result[key] = copyTree(value[key]);
    return result;
  }

  // Always walk the source graph. Every path to a body, list or point gets
  // the same working copy, regardless of which property reached it first.
  const draft = copyTree(document);
  // Only plain document data is installed here. Replacing a boundary sketch
  // or regenerating cabinet records still replaces those records, while edits
  // to existing records reach the original objects held by the editor.
  function prepareCommit() {
    const edits = [], pending = [draft], seen = new Set();
    while (pending.length) {
      const working = pending.pop();
      if (seen.has(working)) continue;
      seen.add(working);
      // A new container is itself published, but its children may be copies
      // of existing live records. Resolve those edges before installing it.
      const live = originals.get(working) ?? working;
      if (live !== working) {
        for (const key of Object.keys(live)) {
          if (!Object.hasOwn(working,key)) edits.push([live,key,undefined,false]);
        }
      }
      for (const key of Object.keys(working)) {
        const child = working[key];
        if (isRecord(child)) pending.push(copies.get(child) ?? child);
        const value = originals.get(child) ?? child;
        if (!Object.hasOwn(live,key) || live[key] !== value) edits.push([live,key,value,true]);
      }
      if (Array.isArray(live) && live.length !== working.length) edits.push([live,'length',working.length,true]);
    }
    // Detached bodies may still own in-flight builds, even when they have no
    // scheduled timer. Retire their generations in the same verified write
    // plan as the replacement, including bodies still reachable via aliases.
    const currentBodies = new Set((draft.parts || []).map(part => originals.get(part) ?? part));
    for (const part of document.parts || []) {
      if (currentBodies.has(part)) continue;
      edits.push([part,'exactBuildToken',(part.exactBuildToken || 0)+1,true]);
      if (part.exactPending !== false) edits.push([part,'exactPending',false,true]);
    }
    // Validate every write before applying the first one. In particular a
    // read-only body field must not leave earlier document edits installed.
    for (const [target,key,,present] of edits) {
      const property = Object.getOwnPropertyDescriptor(target,key);
      const allowed = present
        ? property ? property.writable : Object.isExtensible(target)
        : property?.configurable;
      if (!allowed) throw new Error('Cannot publish exact rebuild field '+key);
    }
    return () => {
      for (const [target,key,value,present] of edits) {
        if (!present) delete target[key];
        else if (Object.hasOwn(target,key)) Object.defineProperty(target,key,{value});
        else Object.defineProperty(target,key,{value,writable:true,enumerable:true,configurable:true});
      }
    };
  }
  return {draft, prepareCommit};
}
