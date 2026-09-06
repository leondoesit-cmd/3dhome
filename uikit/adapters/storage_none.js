/* No persistence. The layout lives for as long as the page does.
   Useful for a demo, for a host that persists documents itself, and for tests
   that must not leak state into the next one. */
export function createNullStorage() {
  return {
    load() {
      return null;
    },
    save() {
      return false;
    },
    clear() {
      return false;
    },
  };
}
