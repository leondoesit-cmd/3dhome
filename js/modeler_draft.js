// Local draft snapshots for the model editor. Planner persist.js already
// autosaves the spatial document; this store covers the in-progress part or
// assembly that only lives in the editor until Save to library.

export const MODELER_DRAFT_KEY = "home3d_modeler_draft";
export const MODELER_DRAFT_VERSION = 1;

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

export function writeModelerDraft(storage, payload, now) {
  if (!storage || typeof storage.setItem !== "function") return false;
  try {
    storage.setItem(MODELER_DRAFT_KEY, serializeModelerDraft(payload, now));
    return true;
  } catch (error) {
    return false;
  }
}

export function readModelerDraft(storage) {
  if (!storage || typeof storage.getItem !== "function") return null;
  try { return parseModelerDraft(storage.getItem(MODELER_DRAFT_KEY)); }
  catch (error) { return null; }
}

export function clearModelerDraft(storage) {
  if (!storage || typeof storage.removeItem !== "function") return;
  try { storage.removeItem(MODELER_DRAFT_KEY); } catch (error) {}
}
