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

import { isContainer } from "../model/schema.js";
import { accel } from "../runtime/keys.js";
import { commandForKey, swallows } from "./a11y.js";
import {
  axisOf,
  dropIndicator,
  dropPlaceholder,
  insertionIndex,
  nearestContainer,
  passedThreshold,
  TOUCH_DRAG_THRESHOLD,
  TOUCH_LONG_PRESS_MS,
} from "./drag.js";
import { ghostRect, previewScale, snapshot } from "./ghost.js";
import { candidateAt, drillTarget, ascend, withinFocus } from "./depth.js";
import { CURSORS, handleAt, handleRects, handlesFor, rectFrom, sizeFrom } from "./resize.js";
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
  let nativePointer = null;
  const nativeHandle=target=>{const handle=target?.closest?.("[data-uikit-native-gesture]");return handle&&mount.contains(handle);};
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
  const warnedEscapes = new Map();

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

  /* The box a DRAG is about, which is not always the box the selection outline
   * is about. rectOf() prefers a node's portal — a menu's open dropdown is
   * tagged data-uikit-target and is what the user is looking at once the menu
   * is pinned open — but you press on the menu BUTTON, and taking the preview
   * from the panel puts a 150px dropdown under a cursor that grabbed a 47px
   * button, offset by wherever the panel happens to be. The preview is of the
   * thing under the pointer, so the pointer decides which box that is.
   */
  function grabTarget(id, point) {
    const el = elementOf(id);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && point.x >= r.left && point.x <= r.right &&
          point.y >= r.top && point.y <= r.bottom) {
        return { el, rect: { x: r.left, y: r.top, w: r.width, h: r.height } };
      }
    }
    const target = targetOf(id);
    return { el: target || el, rect: rectOf(id) };
  }

  /* ---- free nodes --------------------------------------------------------
   *
   * A float is the one node whose POSITION is the user's rather than the
   * layout's, so it is the one node a drag translates instead of reparenting.
   * Its rect is measured against the overlay slot the host placed, never the
   * viewport — see the FLOAT IS NOT position:fixed note in model/schema.js —
   * so both directions of the conversion go through the slot's own box.
   */
  function isFree(id) {
    const node = nodeFor(id);
    return !!(node && (node.type === "float" || node.slot === "overlay"));
  }

  function slotOrigin(id) {
    const el = elementOf(id);
    const slot = el && el.closest ? el.closest("[data-uikit-slot]") : null;
    if (!slot) return { x: 0, y: 0 };
    const r = slot.getBoundingClientRect();
    return { x: r.left, y: r.top };
  }

  /* The node's own rect in slot space: what it has been given, or where it
     currently sits when nobody has given it one yet. Starting a free drag from
     the measured box is what stops the first pixel of movement teleporting the
     panel to the slot's top-left corner. */
  function freeRectOf(id) {
    const node = nodeFor(id);
    if (node && node.rect) return Object.assign({}, node.rect);
    const r = rectOf(id);
    if (!r) return null;
    const origin = slotOrigin(id);
    return { x: Math.round(r.x - origin.x), y: Math.round(r.y - origin.y), w: r.w, h: r.h };
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
  const observedElements = new Set();

  function sync() {
    for (const [id, home] of warnedEscapes) {
      if (!nodeFor(id) || parentFor(id)?.id === home) warnedEscapes.delete(id);
    }
    if (!active) return;
    if(drag?.live){
      // A host repaint can strip transient attributes when it re-adopts a
      // control. Keep the visible source dimmed for the whole live gesture.
      const source=drag.shotFrom?.isConnected?drag.shotFrom:elementOf(drag.id);
      if(source&&!source.hasAttribute('data-uikit-lifted'))source.setAttribute('data-uikit-lifted','');
    }
    const layer = ensureOverlay();
    layer.replaceChildren();

    if (hover && selection.indexOf(hover) < 0) {
      const r = rectOf(hover);
      if (r) layer.appendChild(box("hover", r));
    }
    for (const id of selection) {
      const r = rectOf(id);
      if (!r) continue;
      /* While a resize is live the tag reads out the numbers instead of the
         name: during the one gesture where the size is the subject, the label
         you already know is the less useful of the two. */
      const tag = (sizing && sizing.id === id)
        ? Math.round(r.w) + " \u00d7 " + Math.round(r.h)
        : labelFor(id);
      layer.appendChild(box("sel", r, tag));
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
      if (drag.point && drag.id && drag.startRect) {
        /* The preview is the element, at the size it really is, held where the
           user grabbed it — not a box centred on the pointer. drag.startRect
           is the rect at pointerdown deliberately: the live one moves as the
           layout reflows around the drag, and a ghost that resizes mid-gesture
           is the tell that you are dragging a diagram of the thing. */
        const gr = ghostRect(drag.point, drag.grab, drag.startRect, drag.scale);
        const el = box("ghost", gr, drag.shot ? null : labelFor(drag.id));
        if (drag.shot) el.appendChild(drag.shot);
        if (!drag.target) el.classList.add("uikit-ed-ghost-homeless");
        else if (drag.target.snapped) el.classList.add("uikit-ed-ghost-snapped");
        layer.appendChild(el);
      }
    }
    if (resizeObserver) {
      const nextObserved = new Set([mount]);
      for (const item of flat()) {
        const element = elementOf(item.node.id);
        if (element) nextObserved.add(element);
      }
      for (const element of observedElements) if (!nextObserved.has(element)) {
        resizeObserver.unobserve(element);
        observedElements.delete(element);
      }
      for (const element of nextObserved) if (!observedElements.has(element)) {
        resizeObserver.observe(element);
        observedElements.add(element);
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
    observedElements.clear();
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
    const uncles = grand.parent.children.filter((c) => isContainer(c.type) && c.id !== id);
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
    if (!found) return false;
    const hidden = !found.node.hidden;
    let next = uikit.doc;
    let protectedItem = false;
    for (const selectedId of selection) {
      const node = nodeFor(selectedId);
      if (!node) continue;
      if (hidden && node.constraints?.hide === false) { protectedItem = true; continue; }
      next = ops().hide(next, { id: selectedId, hidden, variant: uikit.variant });
    }
    const done = apply(hidden ? "Hide selected" : "Show selected", next);
    if (done && hidden && inspector && typeof inspector.openPalette === "function") inspector.openPalette();
    if (protectedItem && inspector) inspector.note(ctx.t ? ctx.t("uikit_ins_cannot_hide", "This item must remain available.") : "This item must remain available.");
    return done;
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
    const alreadyWarned = warnedEscapes.has(id);
    const done = apply("Move " + labelFor(id), ops().move(uikit.doc, { id, parent, index }));
    if (done) {
      select(id, false);
      if (moving.escapes && currentParent && currentParent.id !== parent && !alreadyWarned) {
        warnedEscapes.set(id, currentParent.id);
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
      const next = ops().retitle(uikit.doc, { id, label: null, variant: uikit.variant });
      return apply("Rename", ops().setText(next, {
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
      ctx.ops.resetField(uikit.doc, { id, field, variant: uikit.variant, defaults: uikit.defaults })
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
      next = ctx.ops.resetNode(next, { id: each, variant: uikit.variant, defaults: uikit.defaults });
      if (uikit.defaults && uikit.variant === "base") {
        next = ctx.ops.resetPosition(next, { id: each, defaults: uikit.defaults });
      }
    }
    return apply(ids.length > 1 ? "Reset selected" : "Reset " + labelFor(ids[0]), next);
  }

  function insertParentId() {
    const id = firstSelected();
    const node = nodeFor(id);
    if (node && isContainer(node.type)) return id;
    const parent = id ? parentFor(id) : null;
    return parent ? parent.id : null;
  }

  function insertIndex(parent, index) {
    if (index != null) return index;
    const node = nodeFor(parent);
    const at = node?.children?.findIndex(child => child.id === firstSelected()) ?? -1;
    return at >= 0 ? at + 1 : node?.children?.length;
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
      case "insertSeparator": { const parent = a.parent || insertParentId(); return insertSeparator(parent, insertIndex(parent, a.index)); }
      case "insertMenu": { const parent = a.parent || insertParentId(); return insertMenu(parent, insertIndex(parent, a.index)); }
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
      case "cancelSession":
        return typeof uikit.discardEdit === "function" ? uikit.discardEdit() : false;
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

  /* Every container that would take this node, with its box — the candidate
     set for a drop the pointer did not land inside. Hidden and unrendered
     containers are excluded: reaching for something that is not on screen is
     not a friendlier drop, it is a mystery. */
  function acceptingCandidates(movingId) {
    const moving = movingId ? nodeFor(movingId) : null;
    const out = [];
    for (const item of flat()) {
      const node = item.node;
      if (!layoutContainer(node) || node.id === movingId) continue;
      if (node.hidden || contains(movingId, node.id)) continue;
      if (moving && !containerAccepts(node, moving, uikit.registry)) continue;
      const rect = rectOf(node.id);
      if (rect && rect.w > 0 && rect.h > 0) out.push({ id: node.id, rect });
    }
    return out;
  }

  /* The cursor is the app's, so it is set on the root element and taken back
     when the gesture ends. A drag that leaves the pointer looking idle reads
     as a drag that is not happening. */
  function setDragCursor(cursor) {
    const root = doc.documentElement;
    if (!root) return;
    if (cursor) root.style.setProperty("cursor", cursor, "important");
    else root.style.removeProperty("cursor");
  }

  /* The moment a press becomes a drag: take the picture, dim the original, and
     say so with the cursor. Deferred to here rather than pointerdown because
     the snapshot costs a style read per element and most presses are clicks. */
  function beginDrag() {
    if (!drag || !drag.startRect) return;
    setDragCursor("grabbing");
    const el = drag.shotFrom || elementOf(drag.id);
    if (el) {
      /* Photograph first, dim second: the dimming is an attribute on the very
         element being copied, and a clone taken after it carries the styling
         meant for the thing left behind. */
      drag.scale = previewScale(drag.startRect);
      drag.shot = snapshot(el, drag.startRect, { scale: drag.scale });
      el.setAttribute("data-uikit-lifted", "");
    }
  }

  function endDrag(pending) {
    setDragCursor(null);
    pending?.shotFrom?.removeAttribute('data-uikit-lifted');
    const el = pending && pending.id ? elementOf(pending.id) : null;
    if (el) el.removeAttribute("data-uikit-lifted");
    /* Belt and braces: a re-render during the drag can hand back a different
       element for the same id, and a stale dimmed node would stay dimmed. */
    for (const marked of doc.querySelectorAll("[data-uikit-lifted]")) {
      marked.removeAttribute("data-uikit-lifted");
    }
  }

  function onPointerDown(e) {
    if (!active || e.button !== 0) return;
    if(nativeHandle(e.target)){nativePointer=e.pointerId;return;}
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
      const free = isFree(grip.id);
      sizing = {
        id: grip.id, handle: grip.key, from: point, start: grip.rect,
        constraints: (node && node.constraints) || {},
        free,
        startRect: free ? freeRectOf(grip.id) : null,
        readout: null,
      };
      setDragCursor(CURSORS[grip.key] || "default");
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
          drag = null; // A long press drills; a fresh press starts the child drag.
          focusId = drill;
          const chain = chainFor(hit);
          const child = candidateAt(chain, focusId, rootId());
          select(child || drill, false);
          sync();
        }
      }, TOUCH_LONG_PRESS_MS);
    }

    if (targetId && isMovable(targetId)) {
      const grabbed = grabTarget(targetId, point);
      const startRect = grabbed.rect;
      drag = {
        id: targetId,
        from: point,
        point,
        live: false,
        indicator: null,
        placeholder: null,
        target: null,
        pointerType: e.pointerType,
        /* Where inside the box the pointer went down, so the preview can keep
           that exact grip for the whole gesture. */
        grab: startRect ? { dx: point.x - startRect.x, dy: point.y - startRect.y } : { dx: 0, dy: 0 },
        startRect,
        scale: 1,
        shot: null,
        free: isFree(targetId),
        freeStart: isFree(targetId) ? freeRectOf(targetId) : null,
        shotFrom: grabbed.el,
      };
    }
  }

  function onPointerMove(e) {
    if (!active || nativePointer===e.pointerId) return;
    const point = { x: e.clientX, y: e.clientY };

    if (sizing) {
      e.preventDefault();
      e.stopPropagation();
      /* Shift keeps the proportions; Alt frees the second axis on an edge
         handle, so pulling a bar's bottom edge can also set a width without
         reaching for the corner. Read per move, not at pointerdown, because a
         modifier pressed mid-drag has to take effect while the drag is live. */
      const size = sizeFrom(sizing.start, sizing.handle,
        point.x - sizing.from.x, point.y - sizing.from.y, sizing.constraints,
        { aspect: e.shiftKey, free: e.altKey });
      /* One history step for the whole drag, not one per pixel: the tag folds
         every apply in this gesture into the step already open. */
      let next = ctx.ops.resize(uikit.doc, {
        id: sizing.id, size, variant: uikit.variant,
        min: { w: sizing.constraints.minW, h: sizing.constraints.minH },
        max: { w: sizing.constraints.maxW, h: sizing.constraints.maxH },
      });
      /* A free node keeps the edge you are NOT holding still, which means the
         box moves as well as grows. Docked nodes never do: there the position
         is the layout's, and resize.js says so. */
      if (sizing.free && size) {
        const moved = rectFrom(sizing.startRect, sizing.handle, size);
        next = ctx.ops.setRect(next, { id: sizing.id, rect: moved, variant: uikit.variant });
      }
      apply("Resize " + labelFor(sizing.id), next, "resize:" + sizing.id);
      sizing.readout = size;
      sync();
      return;
    }

    if (!drag) {
      const id = nodeAt(point.x, point.y);
      if (id !== hover) {
        hover = id;
        /* "You can pick this up" is worth saying before the pick-up, and the
           cursor is the cheapest place to say it. */
        const overGrip = !!gripAt(point);
        setDragCursor(!overGrip && id && isMovable(id) ? "grab" : null);
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
    if (!drag.live) beginDrag();
    drag.live = true;
    drag.point = point;

    /* A free node is carried, not re-filed: the gesture writes its rect and
       never looks for a container at all. */
    if (drag.free && drag.freeStart) {
      const origin = slotOrigin(drag.id);
      const rect = {
        x: Math.round(point.x - drag.grab.dx - origin.x),
        y: Math.round(point.y - drag.grab.dy - origin.y),
        w: drag.freeStart.w,
        h: drag.freeStart.h,
      };
      apply("Move " + labelFor(drag.id),
        ctx.ops.setRect(uikit.doc, { id: drag.id, rect, variant: uikit.variant }),
        "rect:" + drag.id);
      sync();
      return;
    }

    const moving = nodeFor(drag.id);
    let container = containerAt(point.x, point.y, drag.id);
    let snapped = false;
    /* Nothing under the pointer will take it — reach for the closest thing
       that will, rather than letting the gesture die in a gutter. */
    if (!container) {
      const near = nearestContainer(acceptingCandidates(drag.id), point);
      if (near) {
        container = nodeFor(near.id);
        snapped = true;
      }
    }
    if (!container) {
      drag.indicator = null;
      drag.placeholder = null;
      drag.target = null;
      note("no-container");
      sync();
      return;
    }

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
    drag.target = { parent: container.id, index, snapped };
    drag.indicator = containerRect ? dropIndicator(containerRect, rects, index, axis) : null;
    drag.placeholder = (containerRect && movingRect)
      ? dropPlaceholder(containerRect, rects, index, axis, { w: movingRect.w, h: movingRect.h })
      : null;
    if (inspector) inspector.note("");
    sync();
  }

  function onPointerUp(e) {
    if(nativePointer===e.pointerId){nativePointer=null;return;}
    if (!active) return;
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    if (sizing) {
      e.preventDefault();
      e.stopPropagation();
      sizing = null;
      setDragCursor(null);
      sync();
      return;
    }
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    const pending = drag;
    drag = null;
    endDrag(pending);
    /* A free node was written to the document on the way, so the pointerup has
       nothing left to commit — the drag WAS the edit. */
    if (pending.live && pending.free) {
      select(pending.id, false);
      sync();
      return;
    }
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
    if (!active || nativeHandle(e.target)) return;
    if (isOwnUITarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onContextMenu(e) {
    if (!active || isOwnUITarget(e.target) || nativeHandle(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onKeyDown(e) {
    if (!active || (e.key!=="Escape"&&nativeHandle(e.target))) return;
    /* Accel+Alt is reserved: Ctrl/Cmd+Alt+U is createUIKit's escape hatch and
       Ctrl/Cmd+Alt+E is the host's way in and out. Claiming either here would
       put the way out behind the editor being in a good state, which is the
       situation it exists for. Tested on accel rather than ctrlKey alone,
       because on a Mac the combination arrives with Cmd. */
    if (accel(e) && e.altKey) return;
    if (e.key === "Escape" && inspector?.dismissConfirmation()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target?.closest?.(".uikit-ins-tree-inline-input")) return;
    // The picker owns Escape until its dialog has closed.
    if (e.key === "Escape" && doc.querySelector(".uikit-ins-icon-picker")) return;
    if (e.target && e.target.closest && e.target.closest(".uikit-ins-icon-picker")) return;
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

  /* A pointer the browser takes back — a system gesture, a lost capture, a
     context menu — never sends pointerup. Without this the ghost, the dimmed
     original and the grabbing cursor all survive a drag that has ended. */
  function onPointerCancel() {
    if (!active) return;
    const pending = drag;
    drag = null;
    sizing = null;
    endDrag(pending);
    setDragCursor(null);
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    sync();
  }

  const LISTENERS = [
    ["pointerdown", onPointerDown],
    ["pointermove", onPointerMove],
    ["pointerup", onPointerUp],
    ["pointercancel", onPointerCancel],
    ["click", onClick],
    ["contextmenu", onContextMenu],
    ["keydown", onKeyDown],
  ];

  function setActive(on) {
    const want = !!on;
    if (want === active) return active;
    active = want;
    nativePointer = null;
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
      endDrag(drag);
      setDragCursor(null);
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
    refreshLanguage() { if (active) inspector?.retranslate(); },
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
