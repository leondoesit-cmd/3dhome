/* First-class host menu controller.
 *
 * The topbar dropdowns (File / Edit / Export / More, and any menu the layout
 * editor creates later) share one open/close/pin/path model. Positioning,
 * portal-to-body, aria-expanded, RTL, the phone sheet, and Escape-pops-one
 * all live here so customize-mode pinning and nested submenus cannot drift
 * from what a click on a trigger does.
 *
 * uikit never imports this file. The host adapter maps holdOpen() onto
 * openPath / closeAll.
 */

let instance = null;

export function getMenuController() {
  return instance;
}

export function initDropdownMenus(doc, options) {
  const opts = options || {};
  instance = createMenuController(doc, opts);
  instance.wireAll();
  return instance;
}

export function createMenuController(doc, options) {
  const opts = options || {};
  const onAction = opts.onAction || null;
  const selectionKind = opts.selectionKind || (() => null);

  const wired = new WeakSet();
  const pinned = new Set();
  let path = [];
  let lastTrigger = null;

  function panelOf(dd) {
    if (!dd) return null;
    let menu = dd.querySelector(":scope > .dropdown-menu");
    if (menu) return menu;
    const all = doc.querySelectorAll("body > .dropdown-menu");
    for (const m of all) {
      if (m._dd === dd) return m;
    }
    return dd.querySelector(".dropdown-menu");
  }

  function triggerOf(dd) {
    return (dd && dd.querySelector(".dropdown-trigger")) || dd;
  }

  function parentDropdown(dd) {
    if (!dd || !dd.parentElement) return null;
    const host = dd.parentElement.closest ? dd.parentElement.closest(".dropdown-menu") : null;
    return host && host._dd ? host._dd : null;
  }

  function pathOf(dd) {
    const out = [];
    let cur = dd;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      out.unshift(cur);
      cur = parentDropdown(cur);
    }
    return out;
  }

  function dropdownFor(el) {
    if (!el || !el.closest) return null;
    return el.closest(".dropdown")
      || (el.closest(".dropdown-menu") && el.closest(".dropdown-menu")._dd)
      || null;
  }

  function menuItems(menu) {
    if (!menu) return [];
    return Array.prototype.filter.call(menu.querySelectorAll("button"), function (b) {
      return !b.disabled && b.getAttribute("role") !== "separator";
    });
  }

  function refreshMenuState(menu) {
    if (!menu) return;
    const kind = selectionKind();
    menu.querySelectorAll("[data-needs]").forEach(function (b) {
      const need = b.getAttribute("data-needs");
      const ok = need === "sel" ? !!kind : need === "items" ? kind === "items" : true;
      b.disabled = !ok;
    });
  }

  function focusMenuItem(menu, idx) {
    const items = menuItems(menu);
    if (!items.length) return;
    const i = ((idx % items.length) + items.length) % items.length;
    items[i].focus();
  }

  function positionMenu(dd, menu, trigger) {
    const view = doc.defaultView || (typeof window !== "undefined" ? window : null);
    const width = view ? view.innerWidth : 1024;
    const height = view ? view.innerHeight : 768;
    const nested = !!parentDropdown(dd);
    if (width <= 768) {
      menu.style.left = "";
      menu.style.top = "";
      return;
    }
    const r = trigger.getBoundingClientRect();
    const mw = Math.max(menu.offsetWidth, 190);
    const isRTL = doc.documentElement && doc.documentElement.dir === "rtl";
    if (nested) {
      let x = isRTL ? r.left - mw - 4 : r.right + 4;
      x = Math.max(8, Math.min(x, width - mw - 8));
      let y = r.top;
      const mh = menu.offsetHeight;
      if (y + mh > height - 8) y = Math.max(8, height - mh - 8);
      menu.style.left = x + "px";
      menu.style.top = y + "px";
      return;
    }
    let x = isRTL ? r.right - mw : r.left;
    x = Math.max(8, Math.min(x, width - mw - 8));
    menu.style.left = x + "px";
    let top = r.bottom + 8;
    const mh = menu.offsetHeight;
    if (r.bottom + 8 + mh > height - 8) top = Math.max(8, r.top - 8 - mh);
    menu.style.top = top + "px";
  }

  function isNarrow() {
    const view = doc.defaultView || (typeof window !== "undefined" ? window : null);
    return !!(view && view.innerWidth <= 768);
  }

  function ensureBack(menu) {
    if (!menu || menu.querySelector(":scope > [data-menu-back]")) return;
    const back = doc.createElement("button");
    back.type = "button";
    back.setAttribute("data-menu-back", "");
    back.setAttribute("role", "menuitem");
    const he = doc.documentElement && doc.documentElement.lang === "he";
    back.textContent = he ? "חזרה" : "Back";
    back.addEventListener("click", function (e) {
      e.stopPropagation();
      pop({ refocus: true });
    });
    menu.insertBefore(back, menu.firstChild);
  }

  function stripBack(menu) {
    const back = menu && menu.querySelector(":scope > [data-menu-back]");
    if (back) back.remove();
  }

  function syncPhoneSheets() {
    if (!isNarrow()) return;
    const leaf = path.length ? path[path.length - 1] : null;
    path.forEach(function (d) {
      const menu = panelOf(d);
      if (!menu) return;
      const show = d === leaf;
      menu.classList.toggle("open", show);
      if (show && parentDropdown(d)) ensureBack(menu);
      else stripBack(menu);
    });
  }

  function actuallyOpen(dd, focusFirst) {
    const menu = panelOf(dd);
    const btn = triggerOf(dd);
    if (!menu || !btn) return;
    refreshMenuState(menu);
    dd.classList.add("open");
    menu.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-haspopup", "menu");
    lastTrigger = btn;
    positionMenu(dd, menu, btn);
    syncPhoneSheets();
    if (focusFirst) focusMenuItem(menu, 0);
  }

  function actuallyClose(dd, refocus) {
    if (!dd) return;
    const menu = panelOf(dd);
    const btn = triggerOf(dd);
    dd.classList.remove("open");
    if (menu) {
      menu.classList.remove("open");
      stripBack(menu);
    }
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      if (refocus) btn.focus();
    }
  }

  function open(dd, args) {
    const a = args || {};
    if (!dd) return;
    const nested = !!parentDropdown(dd);
    if (!nested && !a.pin) closeAll({ except: dd, preservePinned: true });
    if (a.pin) pinned.add(dd);
    if (path.indexOf(dd) < 0) {
      if (nested) path.push(dd);
      else path = [dd];
    }
    actuallyOpen(dd, !!a.focusFirst);
  }

  function close(dd, args) {
    const a = args || {};
    if (!dd) return;
    if (!a.force && pinned.has(dd)) return;
    pinned.delete(dd);
    path = path.filter((item) => item !== dd);
    actuallyClose(dd, !!a.refocus);
    if (!path.length) lastTrigger = null;
  }

  function closeAll(args) {
    const a = args || {};
    const keep = new Set();
    if (a.except) keep.add(a.except);
    if (a.preservePinned) pinned.forEach((dd) => keep.add(dd));
    doc.querySelectorAll(".dropdown.open").forEach(function (d) {
      if (keep.has(d)) return;
      actuallyClose(d, false);
      pinned.delete(d);
    });
    path = path.filter((dd) => keep.has(dd));
    if (!a.except && !a.preservePinned && a.refocus && lastTrigger) {
      lastTrigger.focus();
      lastTrigger = null;
    }
  }

  function openPath(dds, args) {
    const a = args || {};
    const wanted = (dds || []).filter(Boolean);
    closeAll({ preservePinned: false });
    pinned.clear();
    path = [];
    for (const dd of wanted) {
      if (a.pin !== false) pinned.add(dd);
      path.push(dd);
      actuallyOpen(dd, false);
    }
    if (a.focusFirst && wanted.length) {
      const leaf = panelOf(wanted[wanted.length - 1]);
      focusMenuItem(leaf, 0);
    }
  }

  function pop(args) {
    const a = args || {};
    if (path.length <= 1) {
      closeAll({ refocus: a.refocus, preservePinned: false });
      pinned.clear();
      path = [];
      return;
    }
    const leaf = path.pop();
    pinned.delete(leaf);
    actuallyClose(leaf, !!a.refocus);
    if (path.length) {
      const parent = path[path.length - 1];
      actuallyOpen(parent, false);
    }
  }

  function handleItemClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest("button") : null;
    const act = btn && btn.getAttribute("data-act");
    if (!act) return;
    if (typeof onAction === "function") onAction(act, e);
  }

  function wire(dd) {
    if (!dd || wired.has(dd)) return;
    const menu = dd.querySelector(".dropdown-menu");
    const btn = dd.querySelector(".dropdown-trigger");
    if (!menu || !btn) return;
    wired.add(dd);
    menu._dd = dd;
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    if (menu.parentNode !== doc.body) doc.body.appendChild(menu);
    menu.addEventListener("click", handleItemClick);

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (dd.classList.contains("open") && !pinned.has(dd)) close(dd, { refocus: false });
      else open(dd, { focusFirst: false });
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(dd, { focusFirst: true });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        open(dd, { focusFirst: false });
        focusMenuItem(panelOf(dd), -1);
      }
    });
    menu.addEventListener("keydown", function (e) {
      const items = menuItems(menu);
      const i = items.indexOf(doc.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusMenuItem(menu, i + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusMenuItem(menu, i - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusMenuItem(menu, 0);
      } else if (e.key === "End") {
        e.preventDefault();
        focusMenuItem(menu, -1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        pop({ refocus: true });
      } else if (e.key === "Tab") {
        closeAll({ preservePinned: false });
      } else if (/^[a-zA-Z֐-׿]$/.test(e.key)) {
        const q = e.key.toLowerCase();
        for (let n = 1; n <= items.length; n++) {
          const cand = items[(i + n + items.length) % items.length];
          if ((cand.textContent || "").trim().toLowerCase().indexOf(q) === 0) {
            cand.focus();
            break;
          }
        }
      }
    });
  }

  function wireAll() {
    doc.querySelectorAll(".dropdown").forEach(wire);
  }

  function isCustomizeChrome(el) {
    return !!(el && el.closest && el.closest(".uikit-ins, .uikit-overlay, .uikit-ed"));
  }

  doc.addEventListener("click", function (e) {
    if (isCustomizeChrome(e.target)) return;
    if (e.target.closest && e.target.closest(".dropdown-trigger")) return;
    closeAll({ preservePinned: true });
  });
  doc.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (isCustomizeChrome(e.target)) return;
    if (pinned.size) return;
    closeAll({ refocus: true, preservePinned: false });
  });

  return {
    open,
    close,
    closeAll,
    openPath,
    pop,
    wire,
    wireAll,
    panelOf,
    triggerOf,
    dropdownFor,
    pathOf,
    parentDropdown,
    isPinned: (dd) => pinned.has(dd),
    path: () => path.slice(),
  };
}
