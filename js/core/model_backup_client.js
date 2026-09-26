/* Browser side of the relay's model disk backups (server/model_backup.mjs).
 *
 * The model library lives in IndexedDB, which the browser may clear. Every
 * library write is mirrored to disk through the relay, and the Library panel
 * can bring back what the browser lost. Backup is best-effort by design: it
 * never throws and never delays or fails a save. Served by anything other than
 * server/relay.mjs the endpoint is missing, and the status says so. */

export const MODEL_BACKUP_ENDPOINT = "/api/model-backup";

let status = "unknown"; // "on" once a backup landed, "off" after a failure
const sentSignatures = new Map(); // key -> signature of the content last backed up
let queue = Promise.resolve();

export function modelBackupStatus() { return status; }

// FNV-1a over the serialized record plus its length: cheap enough to run on
// every save, and only used to skip re-sending what this session already sent.
export function backupSignature(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return text.length + ":" + hash.toString(16);
}

// Records whose content differs from what was last backed up this session.
export function pendingModelBackups(models, sent = sentSignatures) {
  const pending = [];
  for (const model of models || []) {
    if (!model || typeof model.key !== "string" || !model.key) continue;
    let text;
    try { text = JSON.stringify(model); } catch (_) { continue; }
    const signature = backupSignature(text);
    if (sent.get(model.key) !== signature) pending.push({ key: model.key, text, signature });
  }
  return pending;
}

export async function backupModels(models, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const sent = options.sent || sentSignatures;
  const pending = pendingModelBackups(models, sent);
  if (!pending.length) return { sent: 0 };
  try {
    // Exact-CAD payloads live in a separate browser database that a wipe
    // clears too; the caller supplies them so the backup restores whole.
    const attachments = {};
    if (typeof options.attachmentsFor === "function") {
      const byKey = new Map((models || []).map((model) => [model && model.key, model]));
      for (const entry of pending) {
        try {
          const list = await options.attachmentsFor(byKey.get(entry.key));
          if (Array.isArray(list) && list.length) attachments[entry.key] = list;
        } catch (_) { /* back the record up without them rather than not at all */ }
      }
    }
    const response = await fetchImpl(MODEL_BACKUP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"models":[' + pending.map((entry) => entry.text).join(",") + '],"attachments":' + JSON.stringify(attachments) + "}",
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const body = await response.json();
    const results = Array.isArray(body && body.results) ? body.results : [];
    let landed = 0;
    for (const entry of pending) {
      const result = results.find((item) => item && item.key === entry.key);
      if (result && !result.error) { sent.set(entry.key, entry.signature); landed++; }
    }
    status = landed === pending.length ? "on" : "off";
    return { sent: landed, failed: pending.length - landed };
  } catch (error) {
    status = "off";
    return { sent: 0, failed: pending.length, error: String(error && error.message || error) };
  }
}

// Serialized so two quick saves cannot race over which content was sent last.
// Pass a library array that is not mutated afterwards (the modeler hands over
// its cache, which is only ever reassigned).
export function queueModelBackup(models, options) {
  queue = queue.then(() => backupModels(models, options), () => backupModels(models, options));
  return queue;
}

export async function listDiskBackups(options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  try {
    const response = await fetchImpl(MODEL_BACKUP_ENDPOINT, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const body = await response.json();
    if (status === "unknown") status = "on";
    return Array.isArray(body && body.models) ? body.models : [];
  } catch (_) {
    status = "off";
    return [];
  }
}

// → { model, attachments } or null.
export async function fetchDiskBackup(key, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  try {
    const response = await fetchImpl(MODEL_BACKUP_ENDPOINT + "?key=" + encodeURIComponent(key), { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const body = await response.json();
    if (!body || !body.model || body.model.key !== key) return null;
    return { model: body.model, attachments: Array.isArray(body.attachments) ? body.attachments : [] };
  } catch (_) {
    return null;
  }
}

// Backed-up models whose key is not in the library now: what a wipe lost.
export function missingFromLibrary(backups, library) {
  const present = new Set((library || []).map((model) => model && model.key));
  return (backups || []).filter((backup) => backup && backup.key && !present.has(backup.key));
}
