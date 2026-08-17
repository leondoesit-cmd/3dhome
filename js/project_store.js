const DB_NAME = "home3d_projects";
const STORE = "projects";
const MAX_VERSIONS = 30;

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE))
        database.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, operation) {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const store = transaction.objectStore(STORE);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  } finally {
    // Always close — an error path used to leave the connection open until GC.
    try {
      database.close();
    } catch (_) {}
  }
}

export async function listProjects() {
  const records = await tx("readonly", (store) => store.getAll());
  return (records || []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id) {
  return tx("readonly", (store) => store.get(id));
}

export async function saveProject(id, name, json, note) {
  const now = Date.now();
  const old = await getProject(id).catch(() => null);
  const versions = (old && old.versions) || [];
  const last = versions[versions.length - 1];
  // Skip a full duplicate snapshot when the user hits Save twice with no edits
  // (or only changes the version note). Large scenes with textures make each
  // version expensive in IndexedDB.
  if (last && last.json === json) {
    if (note) last.note = String(note).slice(0, 120);
    last.at = now;
  } else {
    versions.push({
      id: "v-" + now.toString(36),
      at: now,
      note: String(note || "").slice(0, 120),
      json,
    });
    if (versions.length > MAX_VERSIONS) versions.splice(0, versions.length - MAX_VERSIONS);
  }
  const record = {
    id,
    name: String(name || "Home project").slice(0, 80),
    createdAt: old ? old.createdAt : now,
    updatedAt: now,
    json,
    versions,
  };
  await tx("readwrite", (store) => store.put(record));
  return record;
}

export async function deleteProject(id) {
  return tx("readwrite", (store) => store.delete(id));
}

export async function restoreVersion(projectId, versionId) {
  const project = await getProject(projectId);
  if (!project) return null;
  const version = (project.versions || []).find((v) => v.id === versionId);
  return version ? version.json : null;
}
