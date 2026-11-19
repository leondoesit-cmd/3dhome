// The menu bar's "Clear cache" button (js/dev_cache.js): every service worker
// unregistered, every stored cache deleted, then one reload.
import test from "node:test";
import assert from "node:assert/strict";
import { clearAppCache } from "../js/dev_cache.js";

test("clear cache drops the service workers and stored caches, then reloads", async () => {
  const order = [];
  const regs = [1, 2].map((i) => ({ unregister: async () => { order.push("unregister" + i); return true; } }));
  const stored = new Set(["modelforge-survey-manifest", "modelforge-survey-assets-1"]);
  const done = await clearAppCache({
    navigator: { serviceWorker: { getRegistrations: async () => regs } },
    caches: { keys: async () => [...stored], delete: async (k) => { order.push("delete"); return stored.delete(k); } },
    location: { reload: () => order.push("reload") },
  });
  assert.deepEqual(done, { workers: 2, caches: 2 });
  assert.equal(stored.size, 0);
  assert.equal(order.at(-1), "reload", "the reload comes after everything is cleared");
});

test("clear cache still reloads where there is no service worker or cache storage", async () => {
  let reloaded = 0;
  const done = await clearAppCache({ navigator: {}, caches: null, location: { reload: () => reloaded++ } });
  assert.deepEqual(done, { workers: 0, caches: 0 });
  assert.equal(reloaded, 1);
});
