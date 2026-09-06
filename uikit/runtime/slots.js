/* Named regions a layout can dock into.
 *
 * A slot is either the host's own element — `#topbar`, `#left-sidebar`, the
 * ids the rest of the app already queries — or one uikit creates because the
 * host did not offer one. The distinction matters at teardown: uikit removes
 * only what it made, and never an element the host still holds a reference to.
 *
 * `overlay` always exists, because that is where floating panels live. A float
 * is NOT position:fixed. Fixed escapes the host's stacking and scroll contexts,
 * which in a real app means a floating panel drawn on top of the modal it is
 * supposed to sit under. The overlay is one element the host places once, in
 * its own z-index order, and every floating node is absolutely positioned
 * inside it.
 */

export const DEFAULT_SLOTS = Object.freeze(["top", "left", "center", "right", "bottom", "overlay"]);

function resolveElement(source, root) {
  if (!source) return null;
  if (typeof source === "string") {
    const doc = (root && root.ownerDocument) || (root && root.nodeType === 9 ? root : null);
    const scope = doc || (typeof document !== "undefined" ? document : null);
    return scope ? scope.querySelector(source) : null;
  }
  return source.nodeType === 1 ? source : null;
}

export function createSlots(mount, provided, options) {
  const opts = options || {};
  const names = opts.names || DEFAULT_SLOTS;
  const given = provided || {};
  const slots = new Map();
  const made = [];

  for (const name of names) {
    const host = resolveElement(given[name], mount);
    if (host) {
      /* Borrowed. Tagged so the CSS can size it, and the tag is removed again
         at teardown — a host element must come back exactly as it was lent. */
      claim(name, host);
      continue;
    }
    const el = mount.ownerDocument.createElement("div");
    el.className = "uikit-slot";
    el.setAttribute("data-uikit-slot", name);
    mount.appendChild(el);
    slots.set(name, { el, owned: true });
    made.push(el);
  }

  function claim(name, host) {
    host.setAttribute("data-uikit-slot", name);
    slots.set(name, { el: host, owned: false });
    return host;
  }

  return {
    /* Slots that come and go while the page is up.
     *
     * The plan pane's eight dock zones exist only while the pane is roomy
     * enough to dock into; on a phone they are torn down and the panels go
     * back to a plain rail. A slot registry fixed at mount() cannot describe
     * that, and the alternative — uikit holding a reference to an element the
     * host has already removed — is how a layout ends up rendering into a
     * detached subtree nobody can see. */
    register(name, source) {
      const host = resolveElement(source, mount);
      if (!name || !host) return null;
      const existing = slots.get(name);
      if (existing && existing.el === host) return host;
      if (existing) this.unregister(name);
      return claim(name, host);
    },

    unregister(name) {
      const slot = slots.get(name);
      if (!slot) return false;
      if (slot.owned) {
        if (slot.el.parentNode) slot.el.parentNode.removeChild(slot.el);
      } else {
        slot.el.removeAttribute("data-uikit-slot");
      }
      slots.delete(name);
      return true;
    },

    get(name) {
      const slot = slots.get(name);
      return slot ? slot.el : null;
    },
    has(name) {
      return slots.has(name);
    },
    names() {
      return [...slots.keys()];
    },
    owns(name) {
      const slot = slots.get(name);
      return !!(slot && slot.owned);
    },
    teardown() {
      for (const [, slot] of slots) {
        if (slot.owned) {
          if (slot.el.parentNode) slot.el.parentNode.removeChild(slot.el);
        } else {
          slot.el.removeAttribute("data-uikit-slot");
        }
      }
      slots.clear();
      made.length = 0;
    },
  };
}
