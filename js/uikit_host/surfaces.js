/* User-created dropdown widgets. The layout document names them; this module
 * is the DOM projection. ensureMenu is idempotent so refresh, undo, reload
 * and a language change all go through the same door.
 *
 * Shipped menu ids are refused: File/Edit/Export/More/History are host
 * chrome, not something this pool may overwrite.
 */

import { getMenuController } from "../dropdown_menus.js";

export const STATIC_MENU_IDS = Object.freeze([
  "menu:file", "menu:edit", "menu:export", "menu:more", "menu:history",
]);

const STATIC = new Set(STATIC_MENU_IDS);
const USER_PREFIX = "menu:user-";

const widgets = new Map();
let registryAdd = null;
let hostDocument = null;

export function isUserMenuId(id) {
  return typeof id === "string" && id.startsWith(USER_PREFIX);
}

export function connectSurfaces(doc, add) {
  hostDocument = doc;
  registryAdd = add;
}

export function ensureMenu(spec) {
  const opts = spec || {};
  const id = opts.id;
  if (!id || STATIC.has(id)) return null;
  const doc = hostDocument || (typeof document !== "undefined" ? document : null);
  if (!doc) return null;

  let widget = widgets.get(id);
  if (!widget) {
    const dd = doc.createElement("div");
    dd.className = "dropdown";
    dd.setAttribute("data-uikit-user-menu", id);
    const trigger = doc.createElement("button");
    trigger.type = "button";
    trigger.className = "dropdown-trigger";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    const icon = doc.createElement("i");
    icon.setAttribute("aria-hidden", "true");
    const label = doc.createElement("span");
    const caret = doc.createElement("i");
    caret.className = "ph ph-caret-down caret";
    caret.setAttribute("aria-hidden", "true");
    trigger.append(icon, label, caret);
    const menu = doc.createElement("div");
    menu.className = "dropdown-menu";
    menu.setAttribute("role", "menu");
    dd.append(trigger, menu);
    widget = { id, dd, trigger, menu, icon, label };
    widgets.set(id, widget);
    const menus = getMenuController();
    if (menus && typeof menus.wire === "function") menus.wire(dd);
    if (typeof registryAdd === "function") {
      registryAdd({
        id,
        kind: "menu",
        titleFallback: opts.label || "Menu",
        icon: opts.icon || null,
        adopt: () => widget.dd,
        target: () => {
          const menusNow = getMenuController();
          return (menusNow && menusNow.panelOf(widget.dd)) || widget.menu;
        },
        constraints: {
          resize: "none",
          accepts: ["command", "separator", "menu"],
        },
      });
    }
  }
  paintTrigger(widget, opts);
  return {
    adopt: () => widget.dd,
    target: () => {
      const menusNow = getMenuController();
      return (menusNow && menusNow.panelOf(widget.dd)) || widget.menu;
    },
  };
}

function paintTrigger(widget, opts) {
  const text = opts.label == null ? "" : String(opts.label);
  widget.label.textContent = text || "Menu";
  widget.trigger.setAttribute("aria-label", widget.label.textContent);
  const name = opts.icon;
  if (name) {
    const cls = String(name).startsWith("ph-") ? name : "ph-" + name;
    widget.icon.className = "ph " + cls;
    widget.icon.hidden = false;
  } else {
    widget.icon.className = "ph ph-squares-four";
    widget.icon.hidden = false;
  }
}

export function destroyMenu(id) {
  const widget = widgets.get(id);
  if (!widget) return;
  const menus = getMenuController();
  if (menus) menus.close(widget.dd, { force: true });
  if (widget.menu && widget.menu.parentNode) widget.menu.parentNode.removeChild(widget.menu);
  if (widget.dd && widget.dd.parentNode) widget.dd.parentNode.removeChild(widget.dd);
  widgets.delete(id);
}

export function destroyAllMenus() {
  for (const id of [...widgets.keys()]) destroyMenu(id);
}

export function reconcileMenus(doc) {
  const live = new Set();
  if (doc && doc.nodes) {
    for (const id of Object.keys(doc.nodes)) {
      if (!isUserMenuId(id)) continue;
      live.add(id);
      const node = doc.nodes[id];
      ensureMenu({
        id,
        label: node && node.label,
        icon: node && node.icon,
      });
    }
  }
  for (const id of [...widgets.keys()]) {
    if (!live.has(id)) destroyMenu(id);
  }
}

export const surfaces = {
  ensureMenu,
  destroyMenu,
  destroyAllMenus,
  reconcileMenus,
};
