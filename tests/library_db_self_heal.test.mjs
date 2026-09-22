import test from "node:test";
import assert from "node:assert/strict";
import { openModelLibraryDatabase } from "../js/core/model_library_store.js";

/* Just enough IndexedDB to exercise version and upgrade handling: named
   databases with a version, a set of stores and some stored records. */
function fakeIndexedDB(seed = {}) {
  const dbs = new Map(Object.entries(seed).map(([name, db]) => [name, {
    version: db.version, stores: new Map((db.stores || []).map((store) => [store, [`${store}-record`]])),
  }]));
  const upgrades = [];
  const connection = (record) => ({
    get version() { return record.version; },
    objectStoreNames: { contains: (name) => record.stores.has(name) },
    createObjectStore: (name) => { record.stores.set(name, []); },
    close() {},
  });
  return {
    dbs, upgrades,
    open(name, version) {
      const request = {};
      setTimeout(() => {
        const existing = dbs.get(name);
        const target = version == null ? (existing ? existing.version : 1) : version;
        if (existing && target < existing.version) {
          request.error = Object.assign(new Error("requested version is less than the existing version"), { name: "VersionError" });
          return request.onerror && request.onerror();
        }
        const record = existing || { version: 0, stores: new Map() };
        dbs.set(name, record);
        request.result = connection(record);
        if (target > record.version) {
          record.version = target;
          upgrades.push(target);
          request.onupgradeneeded && request.onupgradeneeded();
        }
        request.onsuccess && request.onsuccess();
      }, 0);
      return request;
    },
  };
}

const ALL = ["assemblies", "drafts", "models"];
const storesOf = (fake) => [...fake.dbs.get("home3d_model_library").stores.keys()].sort();

test("a fresh profile gets the library database at version 2 with every store", async (t) => {
  const fake = fakeIndexedDB();
  globalThis.indexedDB = fake; t.after(() => { delete globalThis.indexedDB; });
  const db = await openModelLibraryDatabase();
  assert.equal(db.version, 2);
  assert.deepEqual(storesOf(fake), ALL);
});

test("an empty version-2 database (a stray open) is healed instead of breaking every read", async (t) => {
  const fake = fakeIndexedDB({ home3d_model_library: { version: 2, stores: [] } });
  globalThis.indexedDB = fake; t.after(() => { delete globalThis.indexedDB; });
  const db = await openModelLibraryDatabase();
  assert.equal(db.version, 3, "upgraded one version past the broken one");
  assert.deepEqual(storesOf(fake), ALL);
  assert.deepEqual(fake.upgrades, [3]);
});

test("healing adds only what is missing and keeps stored models", async (t) => {
  const fake = fakeIndexedDB({ home3d_model_library: { version: 2, stores: ["models"] } });
  globalThis.indexedDB = fake; t.after(() => { delete globalThis.indexedDB; });
  await openModelLibraryDatabase();
  assert.deepEqual(storesOf(fake), ALL);
  assert.deepEqual(fake.dbs.get("home3d_model_library").stores.get("models"), ["models-record"], "existing data kept");
});

test("a database healed earlier opens at its own version without another upgrade", async (t) => {
  const fake = fakeIndexedDB({ home3d_model_library: { version: 3, stores: ALL } });
  globalThis.indexedDB = fake; t.after(() => { delete globalThis.indexedDB; });
  const db = await openModelLibraryDatabase();
  assert.equal(db.version, 3);
  assert.deepEqual(fake.upgrades, [], "no VersionError, no upgrade");
});

test("a healthy database is opened as is", async (t) => {
  const fake = fakeIndexedDB({ home3d_model_library: { version: 2, stores: ALL } });
  globalThis.indexedDB = fake; t.after(() => { delete globalThis.indexedDB; });
  const db = await openModelLibraryDatabase();
  assert.equal(db.version, 2);
  assert.deepEqual(fake.upgrades, []);
});
