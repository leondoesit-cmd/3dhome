/* localStorage, defensively.
 *
 * Every access is wrapped because localStorage THROWS rather than returning
 * null in a private window, under a blocked-cookies setting, and when the
 * origin's quota is full. A layout that cannot be saved is a small
 * disappointment; an exception on boot from a getItem in a constructor is a
 * white screen. Storage failing is a normal condition here, not an error.
 */

export function createLocalStorage(options) {
  const opts = options || {};
  const prefix = opts.prefix || "uikit:";
  const store = opts.storage || (typeof localStorage !== "undefined" ? localStorage : null);

  return {
    load(key) {
      if (!store) return null;
      let raw;
      try {
        raw = store.getItem(prefix + key);
      } catch (_) {
        return null;
      }
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_) {
        /* Corrupt, half-written, or from a different product on this origin.
           Returning null falls back to the shipped layout, which is always a
           safe place to land. */
        return null;
      }
    },

    save(key, doc) {
      if (!store) return false;
      try {
        store.setItem(prefix + key, JSON.stringify(doc));
        return true;
      } catch (_) {
        return false;
      }
    },

    clear(key) {
      if (!store) return false;
      try {
        store.removeItem(prefix + key);
        return true;
      } catch (_) {
        return false;
      }
    },
  };
}
