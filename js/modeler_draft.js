// Local draft snapshots for the model editor. Planner persist.js already
// autosaves the spatial document; this store covers the in-progress part or
// assembly that only lives in the editor until Save to library.

export const MODELER_DRAFT_KEY = "home3d_modeler_draft";
export const MODELER_TAB_KEY = "home3d_modeler_tab_id";
export const MODELER_DRAFT_VERSION = 1;

export function modelerDraftKey(owner) {
  return owner ? MODELER_DRAFT_KEY + ":" + owner : MODELER_DRAFT_KEY;
}

// sessionStorage survives a reload/crash restore, while a newly opened tab gets
// its own namespace. Never fall back to the shared legacy key for new writes.
export function modelerDraftOwner(storage, createId = () => crypto.randomUUID()) {
  if (!storage) return createId();
  try {
    let id = storage.getItem(MODELER_TAB_KEY);
    if (!id) { id = createId(); storage.setItem(MODELER_TAB_KEY, id); }
    return id;
  } catch (error) { return createId(); }
}

// Starting a separate document must not overwrite the recovery snapshot the
// user elected to keep. Only switch this tab's write namespace; retain records.
export function freshModelerDraftOwner(storage, createId = () => crypto.randomUUID()) {
  const id = createId();
  try { if (storage) storage.setItem(MODELER_TAB_KEY, id); } catch (error) {}
  return id;
}

function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function serializeModelerDraft(payload, now) {
  return JSON.stringify({
    v: MODELER_DRAFT_VERSION,
    at: now || Date.now(),
    docType: payload.docType === "assembly" ? "assembly" : "part",
    def: payload.def || null,
    assembly: payload.assembly || null,
    // Keep the exact record that this edit started from. On crash restore the
    // save must compare against that record, not against the edited draft.
    // A JSON string keeps its topology cache intact while the authored def's
    // regenerable cache is omitted by the replacer below.
    libraryBaselineJson: payload.libraryBaseline ? JSON.stringify(payload.libraryBaseline) : null,
    assemblyBaselineJson: payload.assemblyBaseline ? JSON.stringify(payload.assemblyBaseline) : null,
  }, function(key,value) {
    // This verified cache is derived from the authored history, and can dwarf
    // the editable document. Reopening regenerates it before exact operations.
    return key === "exactTopologyCache" ? undefined : value;
  });
}

export function parseModelerDraft(raw) {
  if (!raw) return null;
  var data;
  try { data = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch (error) { return null; }
  if (!data || data.v !== MODELER_DRAFT_VERSION) return null;
  if (data.docType !== "part" && data.docType !== "assembly") return null;
  if (data.docType === "part" && !data.def) return null;
  if (data.docType === "assembly" && !data.assembly) return null;
  return clone(data);
}

export function writeModelerDraft(storage, payload, now, owner) {
  if (!storage || typeof storage.setItem !== "function") return false;
  try {
    storage.setItem(modelerDraftKey(owner), serializeModelerDraft(payload, now));
    return true;
  } catch (error) {
    return false;
  }
}

export function readModelerDraft(storage, owner) {
  if (!storage || typeof storage.getItem !== "function") return null;
  try { return parseModelerDraft(storage.getItem(modelerDraftKey(owner))); }
  catch (error) { return null; }
}

export function clearModelerDraft(storage, owner) {
  if (!storage || typeof storage.removeItem !== "function") return;
  try { storage.removeItem(modelerDraftKey(owner)); } catch (error) {}
}

// The old single slot is copied to exactly one tab and then removed. A legacy
// IDB record is claimed separately in one transaction by the IDB store.
export function claimLegacyModelerDraft(storage, owner) {
  if (!storage || !owner) return null;
  try {
    const current = readModelerDraft(storage, owner);
    if (current) return current;
    const legacy = readModelerDraft(storage);
    if (!legacy) return null;
    storage.setItem(modelerDraftKey(owner), serializeModelerDraft(legacy, legacy.at));
    storage.removeItem(MODELER_DRAFT_KEY);
    return legacy;
  } catch (error) { return null; }
}
