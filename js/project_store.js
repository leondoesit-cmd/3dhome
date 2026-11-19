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

/* Read, version and write in ONE readwrite transaction: IndexedDB runs
   overlapping readwrite transactions on a store one after another, so two
   saves (two tabs, a double click) each see the other's version instead of
   both reading the same record and the second write dropping the first's. */
export async function saveProject(id, name, json, note) {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      let record = null;
      const read = store.get(id);
      read.onsuccess = () => {
        const now = Date.now();
        const old = read.result || null;
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
            // the time alone repeated for two saves in one millisecond
            id: "v-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 7),
            at: now,
            note: String(note || "").slice(0, 120),
            json,
          });
          if (versions.length > MAX_VERSIONS) versions.splice(0, versions.length - MAX_VERSIONS);
        }
        record = {
          id,
          name: String(name || "Home project").slice(0, 80),
          createdAt: old ? old.createdAt : now,
          updatedAt: now,
          json,
          versions,
        };
        store.put(record);
      };
      read.onerror = () => reject(read.error);
      transaction.oncomplete = () => resolve(record);
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  } finally {
    try {
      database.close();
    } catch (_) {}
  }
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
