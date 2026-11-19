/* Development aid: the menu bar's "Clear cache" button (data-act="clearCache").
   The relay already answers every app file with Cache-Control: no-cache and
   an ETag, so a plain reload revalidates them. What can still serve an old
   copy is the offline-survey service worker (survey-sw.js, scope "/"): it
   falls back to its stored copy whenever a request is slow or fails. This
   unregisters every service worker of the page, deletes every Cache Storage
   entry, then reloads. Browser objects are passed in so Node can test it. */
export async function clearAppCache(env = {}) {
  const nav = env.navigator !== undefined ? env.navigator : globalThis.navigator;
  const store = env.caches !== undefined ? env.caches : globalThis.caches;
  const loc = env.location !== undefined ? env.location : globalThis.location;
  const done = { workers: 0, caches: 0 };
  try {
    const regs = nav && nav.serviceWorker ? await nav.serviceWorker.getRegistrations() : [];
    for (const reg of regs) if (await reg.unregister()) done.workers++;
  } catch (e) { /* no service workers here (http, private window) */ }
  try {
    const keys = store ? await store.keys() : [];
    for (const key of keys) if (await store.delete(key)) done.caches++;
  } catch (e) { /* Cache Storage unavailable */ }
  if (loc && typeof loc.reload === "function") loc.reload();
  return done;
}
