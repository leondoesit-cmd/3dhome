/* Customize mode: the overlay, the selection, and the commands both a pointer
 * and the keyboard drive.
 *
 * THE OVERLAY DRAWS; IT DOES NOT CONTAIN. Handles are not wrapped around
 * nodes — they are boxes painted in a separate fixed layer, positioned from
 * each node's getBoundingClientRect(). That is forced by the same rule that
 * shapes runtime/render.js: an adopted node is the HOST's element, and putting
 * uikit chrome inside it or around it changes the tree the host's stylesheet
 * is written against. It is also simply how a design tool works — the
 * inspector in a browser's devtools highlights the same way, for the same
 * reason.
 *
 * The overlay is `position: fixed`, which looks like a contradiction of the
 * float rule in model/schema.js. It is not the same case. A floating PANEL is
 * content and has to stay inside the host's stacking and scroll contexts so it
 * sits under the modal it should sit under. The editor overlay is a lens over
 * the whole viewport, drawn while the app is deliberately inert, and viewport
 * coordinates are exactly what getBoundingClientRect() gives.
 *
 * POINTERS ARE INTERCEPTED IN THE CAPTURE PHASE. While customizing, clicking
 * Save must select the Save button, not save. Listening on the document with
 * capture and stopping propagation means the host's own handlers never run —
 * without uikit knowing what any of them are, and without the host having to
 * cooperate. The overlay itself stays pointer-events: none so it never becomes
 * the thing under the cursor.
 *
 * EVERY GESTURE IS A COMMAND. Pointer and keyboard both funnel through
 * command(), so the two can never drift apart, and so a test can assert what
 * an edit did rather than what a sequence of coordinates did.
 */

import { accel } from "../runtime/keys.js";
import { commandForKey, swallows } from "./a11y.js";
import {
  axisOf,
  dropIndicator,
  dropPlaceholder,
  insertionIndex,
  passedThreshold,
  TOUCH_DRAG_THRESHOLD,
  TOUCH_LONG_PRESS_MS,
} from "./drag.js";
import { candidateAt, drillTarget, ascend, withinFocus } from "./depth.js";
import { CURSORS, handleAt, handleRects, handlesFor, sizeFrom } from "./resize.js";
import { groupProblem, nextGroupId, PROBLEM_TEXT, ungroupProblem } from "./group.js";
import { createInspector } from "./inspector.js";
import { containerAccepts } from "./policy.js";

const OVERLAY_CLASS = "uikit-ed-overlay";

export function createDesigner(context) {
  const ctx = context || {};
  const uikit = ctx.uikit;
  const mount = ctx.mount;
  const doc = mount.ownerDocument;

  let active = false;
  let overlay = null;
  let selection = [];
  let hover = null;
  let drag = null;
  let sizing = null;
  let inspector = null;
  let syncFrame = 0;
  let resizeObserver = null;
  let focusId = null;
  let lastUp = null;
  let touchTimer = null;
  let heldNodeId = null;
  const warnedEscapes = new Set();

  function updateHoldOpen(nextId) {
    if (typeof ctx.holdOpen !== "function") return;
    if (nextId === heldNodeId) return;
    if (heldNodeId) {
      ctx.holdOpen(heldNodeId, false);
      heldNodeId = null;
    }
    if (nextId) {
      ctx.holdOpen(nextId, true);
      heldNodeId = nextId;
    }
  }

  function rootId() {
    const resolved = uikit.resolved();
    return (resolved && resolved.root)
      || (uikit.doc && uikit.doc.variants && uikit.doc.variants.base && uikit.doc.variants.base.root)
      || null;
  }

  function chainFor(id) {
    if (!id) return [];
    const chain = [];
    let cur = id;
    while (cur) {
      chain.unshift(cur);
      const parent = parentFor(cur);
      cur = parent ? parent.id : null;
    }
    return chain;
  }

  /* ---- the resolved tree, flattened -------------------------------------- */

  function tree() {
    const resolved = uikit.resolved();
    return resolved ? resolved.tree : null;
  }

  function walk(node, parent, out) {
    if (!node) return out;
    out.push({ node, parent });
    for (const child of node.children || []) walk(child, node, out);
    return out;
  }

  function flat() {
    return walk(tree(), null, []);
  }

  function entryFor(id) {
    return flat().find((e) => e.node.id === id) || null;
  }

  function nodeFor(id) {
    const found = entryFor(id);
    return found ? found.node : null;
  }

  function parentFor(id) {
    const found = entryFor(id);
    return found ? found.parent : null;
  }

  function handlesOf(id) {
    const found = entryFor(id);
    if (!found || !found.parent) return [];
    return handlesFor(found.node, found.parent);
  }

  function elementOf(id) {
    return doc.querySelector('[data-uikit-id="' + cssEscape(id) + '"]');
  }

  function targetOf(id) {
    return doc.querySelector('[data-uikit-target="' + cssEscape(id) + '"]');
  }

  /* Node ids are the app's own names — `act:save`, `panel:tb-start` — so they
     carry colons, which a selector reads as a pseudo-class. CSS.escape is not
     in every engine this may run in, hence the fallback. */
  function cssEscape(value) {
    const g = typeof globalThis !== "undefined" ? globalThis : null;
    if (g && g.CSS && typeof g.CSS.escape === "function") return g.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c);
  }

  function rectOf(id) {
    const target = targetOf(id);
    if (target) {
      const tr = target.getBoundingClientRect();
      if (tr.width > 0 && tr.height > 0) {
        return { x: tr.left, y: tr.top, w: tr.width, h: tr.height };
      }
    }
    const el = elementOf(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /* The root is selectable but never movable: it is the region the host handed
     over, and "drag the whole app somewhere" is not a gesture. */
  function isMovable(id) {
    const resolved = uikit.resolved();
    if (!resolved || resolved.root === id) return false;
    const found = entryFor(id);
    return !!(found && found.parent);
  }

  /* ---- overlay ----------------------------------------------------------- */

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = doc.createElement("div");
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute("aria-hidden", "true");
    doc.body.appendChild(overlay);
    return overlay;
  }

  function box(kind, rect, label) {
    const el = doc.createElement("div");
    el.className = "uikit-ed-box uikit-ed-" + kind;
    el.style.left = rect.x + "px";
    el.style.top = rect.y + "px";
    el.style.width = rect.w + "px";
    el.style.height = rect.h + "px";
    if (label) {
      const tag = doc.createElement("span");
      tag.className = "uikit-ed-tag";
      tag.textContent = label;
      el.appendChild(tag);
    }
    return el;
  }

  function displayTitle(value) {
    const node = typeof value === "string"
      ? ((entryFor(value) || {}).node || { id: value }) : (value || {});
    if (node.label) return node.label;
    if (node.entry && node.entry.title) return node.entry.title;
    if (node.title) return node.title;
    if (node.ref) return node.ref;
    const fromHost = ctx.names && ctx.names[node.id];
    if (fromHost) {
      if (Array.isArray(fromHost)) {
        return ctx.t ? ctx.t(fromHost[0], fromHost[1]) : fromHost[1];
      }
      return ctx.t ? ctx.t(fromHost, fromHost) : fromHost;
    }
    return String(node.id || "")
      .replace(/^n:/, "").replace(/^pt:/, "")
      .replace(/[-_:]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function labelFor(id) {
    return displayTitle(id);
  }

  /* Repaint the whole overlay. It holds at most a handful of boxes, so
     rebuilding is cheaper than diffing and cannot go stale. */
  function sync() {
    if (!active) return;
    const layer = ensureOverlay();
    layer.replaceChildren();

    if (hover && selection.indexOf(hover) < 0) {
      const r = rectOf(hover);
      if (r) layer.appendChild(box("hover", r));
    }
    for (const id of selection) {
      const r = rectOf(id);
      if (!r) continue;
      layer.appendChild(box("sel", r, labelFor(id)));
      /* Handles only on the last-selected node. Eight grips on each of five
         selected panels is noise, and a resize gesture has one subject. */
      if (id !== firstSelected()) continue;
      const rects = handleRects(r);
      for (const key of handlesOf(id)) {
        const grip = box("grip", rects[key]);
        grip.setAttribute("data-uikit-grip", key);
        grip.style.cursor = CURSORS[key];
        layer.appendChild(grip);
      }
    }
    if (drag && drag.live) {
      if (drag.target && drag.target.parent) {
        const containerRect = rectOf(drag.target.parent);
        if (containerRect) {
          layer.appendChild(box("target", containerRect));
        }
      }
      if (drag.placeholder) {
        layer.appendChild(box("placeholder", drag.placeholder));
      }
      if (drag.indicator) {
        layer.appendChild(box("drop", drag.indicator));
      }
      if (drag.point && drag.id) {
        const movingRect = rectOf(drag.id);
        if (movingRect) {
          const ghostRect = {
            x: drag.point.x - movingRect.w / 2,
            y: drag.point.y - movingRect.h / 2,
            w: movingRect.w,
            h: movingRect.h,
          };
          layer.appendChild(box("ghost", ghostRect, labelFor(drag.id)));
        }
      }
    }
    if (resizeObserver) {
      resizeObserver.observe(mount);
      for (const item of flat()) {
        const element = elementOf(item.node.id);
        if (element) resizeObserver.observe(element);
      }
    }
    if (inspector) inspector.sync();
  }

  /* Layout can move without a uikit command: the viewport can resize, an
     inner panel can scroll, or the host can expand a section. Coalesce all of
     those signals into one overlay repaint per frame. */
  function requestSync() {
    if (!active || syncFrame) return;
    const view = doc.defaultView || globalThis;
    if (typeof view.requestAnimationFrame !== "function") {
      sync();
      return;
    }
    syncFrame = view.requestAnimationFrame(() => {
      syncFrame = 0;
      sync();
    });
  }

  function startGeometryWatch() {
    const view = doc.defaultView;
    if (!view) return;
    view.addEventListener("resize", requestSync, { passive: true });
    doc.addEventListener("scroll", requestSync, { capture: true, passive: true });
    if (view.visualViewport) {
      view.visualViewport.addEventListener("resize", requestSync, { passive: true });
      view.visualViewport.addEventListener("scroll", requestSync, { passive: true });
    }
    if (typeof view.ResizeObserver === "function") {
      resizeObserver = new view.ResizeObserver(requestSync);
    }
  }

  function stopGeometryWatch() {
    const view = doc.defaultView;
    if (view) {
      view.removeEventListener("resize", requestSync);
      doc.removeEventListener("scroll", requestSync, true);
      if (view.visualViewport) {
        view.visualViewport.removeEventListener("resize", requestSync);
        view.visualViewport.removeEventListener("scroll", requestSync);
      }
      if (syncFrame && typeof view.cancelAnimationFrame === "function") {
        view.cancelAnimationFrame(syncFrame);
      }
    }
    syncFrame = 0;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
  }

  /* ---- selection --------------------------------------------------------- */

  function select(id, additive) {
    if (!id) {
      selection = [];
    } else if (additive) {
      const at = selection.indexOf(id);
      if (at >= 0) selection.splice(at, 1);
      else selection.push(id);
    } else {
      selection = [id];
    }
    updateHoldOpen(selection.length ? selection[selection.length - 1] : null);
    sync();
    return selection.slice();
  }

  /* Tab order is the document order of everything below the root. Nothing is
     selected yet means the first node forwards and the last one backwards,
     which is what Tab and Shift+Tab do everywhere else. */
  function selectNext(dir) {
    const all = flat().filter((e) => e.parent).map((e) => e.node.id);
    if (!all.length) return selection.slice();
    const step = dir < 0 ? -1 : 1;
    const current = selection.length ? all.indexOf(selection[selection.length - 1]) : -1;
    if (current < 0) return select(all[step < 0 ? all.length - 1 : 0], false);
    return select(all[(current + step + all.length) % all.length], false);
  }

  /* ---- commands ---------------------------------------------------------- */

  function ops() {
    return ctx.ops;
  }

  function firstSelected() {
    return selection.length ? selection[selection.length - 1] : null;
  }

  function reorder(dir) {
    const id = firstSelected();
    if (!id || !isMovable(id)) return false;
    const found = entryFor(id);
    const siblings = found.parent.children.map((c) => c.id);
    const at = siblings.indexOf(id);
    const to = at + (dir < 0 ? -1 : 1);
    if (to < 0 || to > siblings.length - 1) return false;
    return apply("Reorder " + labelFor(id), ops().reorder(uikit.doc, { id, index: to }));
  }

  /* Lift a node out of its container and into the one beside it. The target is
     the parent's sibling in the requested direction; at the end of the row
     there is nowhere to go, and doing nothing is the honest answer. */
  function moveOut(dir) {
    const id = firstSelected();
    if (!id || !isMovable(id)) return false;
    const found = entryFor(id);
    const grand = flat().find((e) => e.node.id === found.parent.id);
    if (!grand || !grand.parent) return false;
    const uncles = grand.parent.children.filter((c) => (c.children || []).length || c.id !== id);
    const at = uncles.findIndex((c) => c.id === found.parent.id);
    const target = uncles[at + (dir < 0 ? -1 : 1)];
    if (!target || target.id === id) return false;
    const index = dir < 0 ? (target.children || []).length : 0;
    return move(id, target.id, index);
  }

  function setHidden(id, hidden) {
    if (!id) return false;
    const found = entryFor(id);
    if (!found) return false;
    if (hidden && found.node.constraints && found.node.constraints.hide === false) {
      if (inspector) inspector.note(ctx.t
        ? ctx.t("uikit_ins_cannot_hide", "This item must remain available.")
        : "This item must remain available.");
      return false;
    }
    const done = apply(
      (hidden ? "Hide " : "Show ") + labelFor(id),
      ops().hide(uikit.doc, { id, hidden: !!hidden, variant: uikit.variant })
    );
    if (done && hidden && inspector && typeof inspector.openPalette === "function") {
      inspector.openPalette();
    }
    return done;
  }

  function hide() {
    const id = firstSelected();
    const found = id ? entryFor(id) : null;
    return found ? setHidden(id, !found.node.hidden) : false;
  }

  function place(entry, parent) {
    if (!entry || !entry.id || uikit.variant !== "base") return false;
    const target = nodeFor(parent);
    if (!target || !target.children) return false;
    if (!containerAccepts(target, entry, uikit.registry)) return false;
    const ref = entry.source || entry.id;
    let id = entry.id;
    let suffix = 2;
    while (uikit.doc.nodes[id]) id = "place:" + ref + ":" + suffix++;
    const done = apply(
      "Add " + (entry.title || entry.id),
      ops().insert(uikit.doc, {
        id,
        node: { type: "item", ref },
        parent,
        index: target.children.length,
      })
    );
    if (done) select(id, false);
    return done;
  }

  function apply(label, next, tag) {
    if (next === uikit.doc) return false;
    uikit.apply(label, next, tag);
    uikit.refreshNow();
    return true;
  }

  /* Why a gesture was refused, in the user's language when the host has one.
     A refusal that shows nothing is indistinguishable from a broken button. */
  function note(problem) {
    if (!inspector) return;
    const fallback = PROBLEM_TEXT[problem] || problem;
    const text = ctx.t ? ctx.t("uikit_grp_" + problem.replace(/-/g, "_"), fallback) : fallback;
    inspector.note(text);
  }

  function isMenuNode(node) {
    return !!(node && node.entry && node.entry.kind === "menu");
  }

  function insertSeparator(parent, index) {
    if (uikit.variant !== "base") {
      note("position-base-only");
      return false;
    }
    const target = nodeFor(parent);
    if (!target || !target.children) return false;
    if (!containerAccepts(target, { type: "separator", kind: "separator" }, uikit.registry)) return false;
    const id = nextGroupId(uikit.doc, "sep:user-");
    const done = apply("Add divider", ops().insert(uikit.doc, {
      id,
      node: { type: "separator" },
      parent,
      index: index == null ? target.children.length : index,
    }));
    if (done) select(id, false);
    return done;
  }

  function insertMenu(parent, index) {
    if (uikit.variant !== "base") {
      note("position-base-only");
      return false;
    }
    const target = nodeFor(parent);
    if (!target || !target.children) return false;
    if (!containerAccepts(target, { kind: "menu", type: "group" }, uikit.registry)) return false;
    const id = nextGroupId(uikit.doc, "menu:user-");
    const label = ctx.t ? ctx.t("uikit_ins_new_menu", "Menu") : "Menu";
    if (ctx.surfaces && typeof ctx.surfaces.ensureMenu === "function") {
      if (!ctx.surfaces.ensureMenu({ id, label })) return false;
    }
    const done = apply("Add menu", ops().insert(uikit.doc, {
      id,
      node: {
        type: "group",
        ref: id,
        label,
        orient: "col",
        children: [],
        constraints: { resize: "none", accepts: ["command", "separator", "menu"] },
      },
      parent,
      index: index == null ? target.children.length : index,
    }));
    if (done) select(id, false);
    return done;
  }

  function createSubmenu(ids, parent) {
    const id = nextGroupId(uikit.doc, "menu:user-");
    const label = ctx.t ? ctx.t("uikit_ins_submenu", "Submenu") : "Submenu";
    if (ctx.surfaces && typeof ctx.surfaces.ensureMenu === "function") {
      if (!ctx.surfaces.ensureMenu({ id, label })) return false;
    }
    const order = parent.children.map((c) => c.id).filter((c) => ids.indexOf(c) >= 0);
    const done = apply("Create submenu", ctx.ops.group(uikit.doc, {
      ids: order,
      id,
      label,
      ref: id,
      orient: "col",
      constraints: { resize: "none", accepts: ["command", "separator", "menu"] },
    }));
    if (done) select(id, false);
    return done;
  }

  function group() {
    const ids = selection.slice();
    const problem = groupProblem(uikit.doc, ids, (id) => {
      const found = entryFor(id);
      return found && found.parent ? found.parent.id : null;
    });
    if (problem) {
      note(problem);
      return false;
    }
    const parent = entryFor(ids[0]).parent;
    if (isMenuNode(parent)) return createSubmenu(ids, parent);
    const id = nextGroupId(uikit.doc);
    const order = parent.children.map((c) => c.id).filter((c) => ids.indexOf(c) >= 0);
    const done = apply("Group", ctx.ops.group(uikit.doc, { ids: order, id, label: null }));
    if (done) select(id, false);
    return done;
  }

  function ungroup() {
    const id = firstSelected();
    const problem = ungroupProblem(uikit.doc, id);
    if (problem) {
      note(problem);
      return false;
    }
    const done = apply("Ungroup", ctx.ops.ungroup(uikit.doc, { id }));
    if (done) select(null);
    return done;
  }

  function ascendFocus() {
    if (!focusId || focusId === rootId()) return false;
    const up = ascend(focusId, (id) => {
      const f = entryFor(id);
      return f && f.parent ? f.parent.id : null;
    }, rootId());
    const prev = focusId;
    focusId = up;
    select(prev, false);
    sync();
    return true;
  }

  function move(id, parent, index) {
    if (!id || !parent) return false;
    const targetContainer = nodeFor(parent);
    const moving = nodeFor(id);
    if (!targetContainer || !moving || !containerAccepts(targetContainer, moving, uikit.registry)) return false;
    const currentParent = parentFor(id);
    const done = apply("Move " + labelFor(id), ops().move(uikit.doc, { id, parent, index }));
    if (done) {
      select(id, false);
      if (moving.escapes && currentParent && currentParent.id !== parent && !warnedEscapes.has(id)) {
        warnedEscapes.add(id);
        note("escapes");
      }
    }
    return done;
  }

  function retitle(id, label, everywhere) {
    if (!id) return false;
    const node = nodeFor(id);
    if (!node) return false;
    if (everywhere) {
      const key = node && node.entry ? node.entry.textKey || node.entry.id : null;
      if (!key) return false;
      return apply("Rename", ops().setText(uikit.doc, {
        key, lang: ctx.lang ? ctx.lang() : null, value: label,
      }));
    }
    return apply("Rename " + labelFor(id), ops().retitle(uikit.doc, {
      id, label: label == null ? null : String(label), variant: uikit.variant,
    }));
  }

  function reicon(id, icon) {
    if (!id) return false;
    return apply("Icon " + labelFor(id), ops().reicon(uikit.doc, {
      id, icon: icon || null, variant: uikit.variant,
    }));
  }

  /* ---- reset ------------------------------------------------------------ */

  /* One parameter at a time, because an item carries several independent edits
     and undoing the colour should not undo the rename. The whole-item reset
     below is these, together, plus the position. */
  function resetField(id, field) {
    if (!id || !field) return false;
    return apply(
      "Reset " + field + " on " + labelFor(id),
      ctx.ops.resetField(uikit.doc, { id, field, variant: uikit.variant })
    );
  }

  function resetPosition(id) {
    if (!id || !uikit.defaults) return false;
    /* Structural, so base only — ops.move refuses anything else. Saying so
       here rather than letting it throw keeps the button honest at a
       breakpoint, where "put it back" has no meaning it could deliver. */
    if (uikit.variant !== "base") {
      note("position-base-only");
      return false;
    }
    return apply(
      "Move " + labelFor(id) + " back",
      ctx.ops.resetPosition(uikit.doc, { id, defaults: uikit.defaults })
    );
  }

  /* The undo for "rename app text in this language". Keyed by string, not by
     node, because that is the reach the edit had. */
  function resetText(key, lang) {
    if (!key) return false;
    return apply(
      "Reset app text",
      ctx.ops.resetText(uikit.doc, { key, lang: lang || (ctx.lang ? ctx.lang() : null) })
    );
  }

  /* Everything this item carries, and where it sits. Deliberately NOT the
     app-wide wording: that has a reach the item does not own, and its own
     reset sits next to the checkbox that created it. */
  function resetNode(id) {
    /* One id when the tree's arrow asked, otherwise the whole selection —
       the inspector's button says "Reset selected" when there is more than
       one, and it has to mean it. Folded into a single history step so a
       five-item reset takes one undo, not five. */
    const ids = id ? [id] : selection.slice();
    if (!ids.length) return false;
    let next = uikit.doc;
    for (const each of ids) {
      next = ctx.ops.resetNode(next, { id: each, variant: uikit.variant });
      if (uikit.defaults && uikit.variant === "base") {
        next = ctx.ops.resetPosition(next, { id: each, defaults: uikit.defaults });
      }
    }
    return apply(ids.length > 1 ? "Reset selected" : "Reset " + labelFor(ids[0]), next);
  }

  function insertParentId() {
    const id = firstSelected();
    const node = nodeFor(id);
    if (node && node.children) return id;
    const parent = id ? parentFor(id) : null;
    return parent ? parent.id : null;
  }

  function command(name, args) {
    const a = args || {};
    if (inspector) inspector.note("");
    switch (name) {
      case "select": return select(a.id, a.additive);
      case "selectNext": return selectNext(a.dir || 1);
      case "ascend": return ascendFocus();
      case "move": return move(a.id, a.parent, a.index);
      case "retitle": return retitle(a.id, a.label, a.everywhere);
      case "reicon": return reicon(a.id, a.icon);
      case "reorder": return reorder(a.dir || 1);
      case "moveOut": return moveOut(a.dir || 1);
      case "hide": return hide();
      case "setHidden": return setHidden(a.id, a.hidden);
      case "place": return place(a.entry, a.parent);
      case "insertSeparator": return insertSeparator(a.parent || insertParentId(), a.index);
      case "insertMenu": return insertMenu(a.parent || insertParentId(), a.index);
      case "createSubmenu": return group();
      case "group": return group();
      case "ungroup": return ungroup();
      case "resetField": return resetField(a.id || firstSelected(), a.field);
      case "resetPosition": return resetPosition(a.id || firstSelected());
      case "resetText": return resetText(a.key, a.lang);
      case "resetNode": return resetNode(a.id || firstSelected());
      case "resetVariant": return apply(
        "Reset " + uikit.variant,
        ctx.ops.resetVariant(uikit.doc, { variant: uikit.variant })
      );
      case "undo": uikit.undo(); uikit.refreshNow(); sync(); return true;
      case "redo": uikit.redo(); uikit.refreshNow(); sync(); return true;
      case "reset": uikit.resetAll(); uikit.refreshNow(); selection = []; sync(); return true;
      case "exit": uikit.edit(false); return true;
      default: return false;
    }
  }

  /* ---- pointer ----------------------------------------------------------- */

  function nodeAt(x, y) {
    const el = doc.elementFromPoint(x, y);
    /* The inspector is uikit's own chrome floating over the app. Without this
       the panel would select whatever node it happens to be covering, and
       every click on a field would change the selection out from under it. */
    if (el && el.closest && el.closest(".uikit-ins")) return null;
    const owner = el && el.closest ? el.closest("[data-uikit-id]") : null;
    return owner ? owner.getAttribute("data-uikit-id") : null;
  }

  function layoutContainer(node) {
    return !!(node && node.type && node.type !== "item" && node.type !== "separator");
  }

  /* The container under the pointer that is NOT the thing being dragged, and
     not inside it. Walking up from the deepest hit means dropping onto a
     button targets the bar that button is in, which is what the gesture looks
     like it should do.

     A container may hold its children in a host portal — a panel that is not
     the node element. That panel is tagged data-uikit-target so a drop on a
     menu item still finds the menu after the panel has been moved to body. */
  function containerAt(x, y, movingId) {
    const moving = movingId ? nodeFor(movingId) : null;
    let el = doc.elementFromPoint(x, y);
    while (el && el.closest) {
      const owner = el.closest("[data-uikit-id], [data-uikit-target]");
      if (!owner) return null;
      const id = owner.getAttribute("data-uikit-id") || owner.getAttribute("data-uikit-target");
      const found = entryFor(id);
      if (found && layoutContainer(found.node) && id !== movingId && !contains(movingId, id)) {
        if (!moving || containerAccepts(found.node, moving, uikit.registry)) {
          return found.node;
        }
      }
      el = owner.parentElement;
    }
    return null;
  }

  function contains(ancestorId, id) {
    const found = entryFor(ancestorId);
    if (!found) return false;
    const stack = [found.node];
    while (stack.length) {
      const node = stack.pop();
      if (node.id === id) return true;
      for (const child of node.children || []) stack.push(child);
    }
    return false;
  }

  function gripAt(point) {
    const id = firstSelected();
    if (!id) return null;
    const rect = rectOf(id);
    if (!rect) return null;
    const key = handleAt(point, rect, handlesOf(id));
    return key ? { id, key, rect } : null;
  }

  /* Is this point over a piece of uikit's OWN chrome? nodeAt() already refuses
     to resolve one to a node, but that is not enough on its own: returning
     null there and then selecting null clears the selection the panel is
     editing, so every click on a field emptied the inspector. */
  function overOwnUI(point) {
    const el = doc.elementFromPoint(point.x, point.y);
    return isOwnUITarget(el);
  }

  /* Document capture has to win over the HOST, but it must yield to uikit's
     own controls. A listener on the inspector cannot do that for us: capture
     reaches document before it reaches the inspector. Keep this check at the
     document listener instead, where the routing decision is actually made. */
  function isOwnUITarget(target) {
    const el = target && target.nodeType === 3 ? target.parentElement : target;
    return !!(el && el.closest && el.closest(".uikit-ins"));
  }

  function onPointerDown(e) {
    if (!active || e.button !== 0) return;
    const point = { x: e.clientX, y: e.clientY };
    if (overOwnUI(point)) return;
    e.preventDefault();
    e.stopPropagation();

    /* A grip is checked BEFORE the node under the cursor. Handles straddle the
       edge they resize, so half of every grip sits over a neighbour — pick by
       what is on screen and the gesture would grab the wrong element exactly
       when the user aimed carefully. */
    const grip = gripAt(point);
    if (grip) {
      const node = nodeFor(grip.id);
      sizing = {
        id: grip.id, handle: grip.key, from: point, start: grip.rect,
        constraints: (node && node.constraints) || {},
      };
      return;
    }

    const hit = nodeAt(point.x, point.y);
    let targetId = null;
    if (hit) {
      if (e.ctrlKey || e.metaKey) {
        targetId = hit;
        const p = parentFor(hit);
        focusId = p ? p.id : rootId();
      } else {
        const chain = chainFor(hit);
        /* A surface that is open only BECAUSE it is selected is its own focus
           context.
         *
           A dropdown is pinned open while its node — or something inside it —
           is selected. Without this line, one click on a menu item resolved to
           whatever ancestor sat at the current focus depth, usually the
           toolbar; selecting the toolbar unpinned the menu; the menu closed;
           and the item was gone before a second click could drill toward it.
           Nothing under an open menu could ever be selected. */
        if (heldNodeId && chain.indexOf(heldNodeId) >= 0) {
          focusId = heldNodeId;
        } else if (!withinFocus(chain, focusId)) {
          focusId = rootId();
        }
        const candidate = candidateAt(chain, focusId, rootId());
        targetId = candidate || hit;
      }
    } else {
      focusId = rootId();
    }

    select(targetId, e.shiftKey);

    if (e.pointerType === "touch" && targetId) {
      touchTimer = setTimeout(() => {
        touchTimer = null;
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(15);
        }
        const node = nodeFor(targetId);
        const drill = node ? drillTarget(node) : null;
        if (drill) {
          focusId = drill;
          const chain = chainFor(hit);
          const child = candidateAt(chain, focusId, rootId());
          select(child || drill, false);
          sync();
        }
      }, TOUCH_LONG_PRESS_MS);
    }

    if (targetId && isMovable(targetId)) {
      drag = {
        id: targetId,
        from: point,
        point,
        live: false,
        indicator: null,
        placeholder: null,
        target: null,
        pointerType: e.pointerType,
      };
    }
  }

  function onPointerMove(e) {
    if (!active) return;
    const point = { x: e.clientX, y: e.clientY };

    if (sizing) {
      e.preventDefault();
      e.stopPropagation();
      const size = sizeFrom(sizing.start, sizing.handle,
        point.x - sizing.from.x, point.y - sizing.from.y, sizing.constraints);
      /* One history step for the whole drag, not one per pixel: the tag folds
         every apply in this gesture into the step already open. */
      apply("Resize " + labelFor(sizing.id), ctx.ops.resize(uikit.doc, {
        id: sizing.id, size, variant: uikit.variant,
        min: { w: sizing.constraints.minW, h: sizing.constraints.minH },
        max: { w: sizing.constraints.maxW, h: sizing.constraints.maxH },
      }), "resize:" + sizing.id);
      sync();
      return;
    }

    if (!drag) {
      const id = nodeAt(point.x, point.y);
      if (id !== hover) {
        hover = id;
        sync();
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    const thresh = drag.pointerType === "touch" ? TOUCH_DRAG_THRESHOLD : undefined;
    if (!drag.live && !passedThreshold(drag.from, point, thresh)) return;

    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    drag.live = true;
    drag.point = point;

    const container = containerAt(point.x, point.y, drag.id);
    if (!container) {
      drag.indicator = null;
      drag.placeholder = null;
      drag.target = null;
      note("no-container");
      sync();
      return;
    }

    const moving = nodeFor(drag.id);
    if (!containerAccepts(container, moving, uikit.registry)) {
      drag.indicator = null;
      drag.placeholder = null;
      drag.target = null;
      note("rejects");
      sync();
      return;
    }

    const kids = (container.children || []).filter((c) => c.id !== drag.id);
    const rects = kids.map((c) => rectOf(c.id)).filter(Boolean);
    const axis = axisOf(container, rects);
    const index = insertionIndex(rects, point, axis);
    const containerRect = rectOf(container.id);
    const movingRect = rectOf(drag.id);
    drag.target = { parent: container.id, index };
    drag.indicator = containerRect ? dropIndicator(containerRect, rects, index, axis) : null;
    drag.placeholder = (containerRect && movingRect)
      ? dropPlaceholder(containerRect, rects, index, axis, { w: movingRect.w, h: movingRect.h })
      : null;
    if (inspector) inspector.note("");
    sync();
  }

  function onPointerUp(e) {
    if (!active) return;
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    if (sizing) {
      e.preventDefault();
      e.stopPropagation();
      sizing = null;
      sync();
      return;
    }
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    const pending = drag;
    drag = null;
    if (pending.live && pending.target) {
      command("move", {
        id: pending.id,
        parent: pending.target.parent,
        index: pending.target.index,
      });
      sync();
      return;
    }

    const now = Date.now();
    const point = { x: e.clientX, y: e.clientY };
    const id = firstSelected();
    if (lastUp && (now - lastUp.time) <= 400 &&
        Math.hypot(point.x - lastUp.point.x, point.y - lastUp.point.y) <= 16 &&
        lastUp.id === id && id != null) {
      lastUp = null;
      const node = nodeFor(id);
      const drill = node ? drillTarget(node) : null;
      if (drill) {
        focusId = drill;
        const hit = nodeAt(point.x, point.y);
        const chain = chainFor(hit);
        const child = candidateAt(chain, focusId, rootId());
        select(child || drill, false);
      }
    } else {
      lastUp = { time: now, point, id };
    }
    sync();
  }

  /* Clicks are swallowed outright. pointerdown already did the selecting, and
     letting the click through would run whatever the host bound to it — the
     one thing customize mode must never do. */
  function onClick(e) {
    if (!active) return;
    if (isOwnUITarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onKeyDown(e) {
    if (!active) return;
    /* Accel+Alt is reserved: Ctrl/Cmd+Alt+U is createUIKit's escape hatch and
       Ctrl/Cmd+Alt+E is the host's way in and out. Claiming either here would
       put the way out behind the editor being in a good state, which is the
       situation it exists for. Tested on accel rather than ctrlKey alone,
       because on a Mac the combination arrives with Cmd. */
    if (accel(e) && e.altKey) return;
    /* Inputs, selects and buttons in the inspector own their normal keys.
       Escape is the one intentional exception: it is the universal way to
       finish the editing session even while a field has focus. */
    if (isOwnUITarget(e.target)) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (focusId && focusId !== rootId()) {
          command("ascend");
        } else {
          command("exit");
        }
      }
      return;
    }
    if (e.key === "Escape") {
      const inMenu = e.target && e.target.closest && e.target.closest('[role="menu"]');
      if (inMenu) return;
      e.preventDefault();
      e.stopPropagation();
      if (focusId && focusId !== rootId()) {
        command("ascend");
      } else {
        command("exit");
      }
      return;
    }
    const cmd = commandForKey(e);
    if (!cmd && !swallows(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (cmd) command(cmd.name, cmd);
  }

  const LISTENERS = [
    ["pointerdown", onPointerDown],
    ["pointermove", onPointerMove],
    ["pointerup", onPointerUp],
    ["click", onClick],
    ["keydown", onKeyDown],
  ];

  function setActive(on) {
    const want = !!on;
    if (want === active) return active;
    active = want;
    if (active) {
      if (mount && mount.style) mount.style.touchAction = "none";
      for (const [type, fn] of LISTENERS) doc.addEventListener(type, fn, true);
      startGeometryWatch();
      ensureOverlay();
      inspector = createInspector({
        document: doc,
        uikit,
        ops: ctx.ops,
        icons: ctx.icons || null,
        names: ctx.names || null,
        tokens: typeof ctx.tokens === "function" ? ctx.tokens() : (ctx.tokens || []),
        exportName: ctx.exportName || "layout",
        t: ctx.t || null,
        lang: () => (ctx.lang ? ctx.lang() : null),
        selection: () => selection.slice(),
        focus: () => focusId,
        setFocus: (id) => {
          focusId = id;
          sync();
        },
        nodeFor,
        parentFor,
        tree,
        nodes: () => flat().map((item) => item.node),
        hasElement: (id) => {
          const el = elementOf(id);
          return !!(el && !el.classList.contains("uikit-tombstone"));
        },
        titleFor: displayTitle,
        rectFor: rectOf,
        ungroupProblem: (id) => ungroupProblem(uikit.doc, id),
        command,
        onChanged: sync,
      });
      inspector.mount();
      sync();
    } else {
      if (mount && mount.style) mount.style.touchAction = "";
      for (const [type, fn] of LISTENERS) doc.removeEventListener(type, fn, true);
      stopGeometryWatch();
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      if (inspector) inspector.unmount();
      inspector = null;
      selection = [];
      hover = null;
      drag = null;
      sizing = null;
      focusId = null;
      lastUp = null;
      updateHoldOpen(null);
      warnedEscapes.clear();
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    }
    return active;
  }

  return {
    implemented: true,
    isActive: () => active,
    setActive,
    sync,
    command,
    selection: () => selection.slice(),
    focus: () => focusId,
    setFocus: (id) => {
      focusId = id;
      sync();
    },
    nodes: () => flat().map((e) => e.node.id),
    rectOf,
    handlesOf,
    inspectorElement: () => (inspector ? inspector.element() : null),
    context: ctx,
  };
}
