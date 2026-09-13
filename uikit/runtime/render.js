/* A resolved tree -> DOM, patched in place.
 *
 * WHY THERE ARE NO WRAPPERS AROUND ADOPTED ELEMENTS.
 *
 * The obvious design is one uikit <div> per node, with the host's element
 * inside it. It survives about five minutes of contact with a real
 * application. A host's stylesheet is written against the host's own tree, and
 * every wrapper inserted into that tree is an element its selectors did not
 * expect. In 3dhome the whole left-hand pane switcher is:
 *
 *     #left-sidebar > .panel-section            { display: none }
 *     #left-sidebar[data-left="x"] > [data-left-pane="x"] { display: flex }
 *
 * Put one div around each panel and no `>` matches any more: every pane shows
 * at once. `display: contents` does not help — it removes the wrapper's BOX,
 * not the wrapper, and selector matching never sees display at all. Thirty-one
 * rules in that one stylesheet use a child combinator from a container uikit
 * would own, and a module that cannot be dropped into an app without breaking
 * its CSS is not a module.
 *
 * So the node IS the element:
 *
 *   adopted leaf     the host's own element, in the host's own tree position
 *   built leaf       an element uikit created (button, separator, tombstone)
 *   bound container  a SLOT element — the container does not create a box, it
 *                    adopts the region the host already had, so children stay
 *                    direct children of #topbar / #left-sidebar
 *   free container   an element uikit created
 *
 * Only elements uikit CREATED carry `class="uikit-node"`, so no uikit rule can
 * ever restyle a host element. Identity — `data-uikit-id` — goes on all of
 * them, because the editor has to hit-test both kinds. Everything uikit writes
 * onto a borrowed element is inside the `data-uikit-*` / `--uikit-*`
 * namespaces or is `hidden`, which is exactly the loan runtime/adopt.js knows
 * how to take back.
 *
 * Customize-mode handles do not go around nodes either; they are drawn in the
 * overlay slot from each node's rect. That is how a design tool does it, and
 * it is the only version that works when the node is a host element uikit is
 * not allowed to wrap.
 *
 * PATCH, DO NOT REBUILD. A pass that changes one label must not re-create the
 * DOM: that destroys focus, scroll position, an open <select>, a half-typed
 * field, and hands the host back a panel that was detached for no reason.
 * Elements are looked up by node id, children are reordered with the minimum
 * number of insertBefore calls, and content is rebuilt only when its KIND
 * changes.
 */

import { clearTokens, applyTokens } from "./tokens.js";

const CONTENT_NONE = "none";
const CONTENT_ADOPT = "adopt";
const CONTENT_CUSTOM = "custom";
const CONTENT_BUTTON = "button";
const CONTENT_SEPARATOR = "separator";
const CONTENT_TOMBSTONE = "tombstone";

/* Reorder in place with the fewest moves. Only elements uikit CREATED are
   ever removed here: a host child the layout never claimed — #host-tail, a
   script tag, whatever the app put there — stays exactly where it is. An
   adopted element that left the tree is handled by release, not removal. */
export function syncChildren(container, wanted, created = new Set()) {
  const want = new Set(wanted);

  /* An unclaimed child is the host's, and WHERE it sits is part of what it
     says. A `.menu-divider` separates the group above it from the group below;
     leaving it behind while its neighbours are reordered does not preserve it,
     it relocates it. Reordering the Edit menu used to sweep both dividers to
     the end and leave one flat list of six commands.
   *
     So every run of unclaimed children is anchored to the claimed child it
     follows, and travels with it. One rule, no exception for the last run: an
     earlier draft exempted it so that .tb-end's trailing plumbing could not be
     dragged around, and that exemption is precisely what broke the Edit menu —
     move the last command to the front and the divider above it becomes a
     trailing run, loses its anchor, and is stranded at the end.

     The run BEFORE the first claimed child needs no anchor at all: the cursor
     starts at the first claimed child, so nothing is ever inserted ahead of
     it, and #toggle-left and the brand stay where they are by construction. */
  const anchored = [];
  let anchor = null;
  let run = [];
  for (let el = container.firstElementChild; el; el = el.nextElementSibling) {
    if (want.has(el)) {
      if (anchor && run.length) anchored.push([anchor, run]);
      anchor = el;
      run = [];
    } else if (anchor) {
      run.push(el);
    }
  }
  if (anchor && run.length) anchored.push([anchor, run]);

  function advanceCursor(cur) {
    while (cur && !want.has(cur)) {
      const next = cur.nextSibling;
      if (created.has(cur)) {
        container.removeChild(cur);
      }
      cur = next;
    }
    return cur;
  }
  let cursor = advanceCursor(container.firstChild);
  for (const el of wanted) {
    if (cursor === el) {
      cursor = advanceCursor(cursor.nextSibling);
      continue;
    }
    container.insertBefore(el, cursor);
  }

  /* Second pass, because the first one is about the claimed children and
     changing it would cost the minimal-move property. A node advanceCursor
     removed is skipped rather than resurrected.
   *
     ELEMENTS ONLY, in both passes. index.html is indented, so every one of
     these containers is half whitespace text nodes; treating those as
     unclaimed children and dragging them after their neighbour re-flows the
     source formatting, which adopt.js does not restore and
     tests/uikit_parity.browser.mjs compares byte for byte. Inserting before
     the next ELEMENT rather than the next node leaves the whitespace exactly
     where the host wrote it. */
  for (const [owner, kids] of anchored) {
    let after = owner;
    for (const kid of kids) {
      if (kid.parentNode !== container) continue;
      if (after.nextElementSibling !== kid) {
        container.insertBefore(kid, after.nextElementSibling);
      }
      after = kid;
    }
  }
}

export function createRenderer(options) {
  const opts = options || {};
  const mount = opts.mount;
  const slots = opts.slots;
  const adopter = opts.adopter;
  const icons = opts.icons || null;
  /* Renaming one adopted element is the host's job, not this module's.
   *
     uikit knows WHICH element — it stamped data-uikit-id on it — and nothing
     more; which child of it carries the words is a fact about the host's
     markup. An earlier draft guessed with selectors like
     `span:not([class*='badge'])`, which put one application's class names
     inside the portable module and gave adopt.js a second restore path it
     knew nothing about. So the host applies and the host restores, and this
     file only remembers which elements are currently carrying a rename. */
  const labels = opts.labels || null;
  const iconized = new Set();
  const labelled = new Set(); // adopted elements the host has renamed for us
  const onRun = typeof opts.onRun === "function" ? opts.onRun : null;
  /* Variables the host has declared as user-editable, on top of uikit's own. */
  const allowedTokens = new Set(opts.allowedTokens || []);
  const doc = mount.ownerDocument;

  const elements = new Map(); // node id -> the element that IS this node
  const created = new Set(); // the subset uikit made and may therefore remove
  const bound = new Map(); // node id -> slot element it bound to
  const content = new Map(); // node id -> { kind, entry, dispose, parts }
  const targets = new Map(); // node id -> panel that HOLDS its children when that is not `el`
  const tokenState = new Map();
  const hiddenByUs = new Set(); // nodes uikit hid, and may therefore unhide
  let lastIds = new Set();

  function make(tag, className) {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    created.add(el);
    return el;
  }

  function setAttr(el, name, value) {
    if (value == null || value === false || value === "") el.removeAttribute(name);
    else if (el.getAttribute(name) !== String(value)) el.setAttribute(name, String(value));
  }

  function setVar(el, name, value) {
    if (value == null) el.style.removeProperty(name);
    else el.style.setProperty(name, typeof value === "number" ? value + "px" : String(value));
  }

  /* A container may paint its children somewhere other than the element that
     IS the node — a host portal. Hit-testing has to find the container from
     those children, so the panel is tagged with the node's id without becoming
     the node (data-uikit-id stays on the wrapper). */
  function bindTarget(id, el) {
    const prev = targets.get(id);
    if (prev && prev !== el) prev.removeAttribute("data-uikit-target");
    if (el) {
      if (el.getAttribute("data-uikit-target") !== id) el.setAttribute("data-uikit-target", id);
      targets.set(id, el);
    } else {
      targets.delete(id);
    }
  }

  function clearTarget(id) {
    const el = targets.get(id);
    if (el && el.getAttribute("data-uikit-target") === id) el.removeAttribute("data-uikit-target");
    targets.delete(id);
  }

  function kindOf(node) {
    if (node.tombstone) return CONTENT_TOMBSTONE;
    if (node.type === "separator") {
      const entry = node.entry;
      if (entry && typeof entry.adopt === "function" && node.id === entry.id) return CONTENT_ADOPT;
      return CONTENT_SEPARATOR;
    }
    if (node.type !== "item") return CONTENT_NONE;
    const entry = node.entry;
    if (!entry) return CONTENT_TOMBSTONE;
    if (typeof entry.adopt === "function" && node.id === entry.id) return CONTENT_ADOPT;
    if (typeof entry.render === "function") return CONTENT_CUSTOM;
    return CONTENT_BUTTON;
  }

  function buildButton(node) {
    const button = make("button", "uikit-node uikit-item");
    button.type = "button";
    const iconEl = doc.createElement("span");
    iconEl.className = "uikit-icon";
    const labelEl = doc.createElement("span");
    labelEl.className = "uikit-label";
    button.append(iconEl, labelEl);
    button.addEventListener("click", () => {
      const entry = (content.get(node.id) || {}).entry;
      if (onRun) onRun(entry, node);
      else if (entry && typeof entry.run === "function") entry.run();
    });
    return { el: button, parts: { button, iconEl, labelEl } };
  }

  function paintButton(node, parts) {
    const { iconEl, labelEl, button } = parts;
    labelEl.textContent = node.label == null ? "" : String(node.label);
    setAttr(button, "title", node.label == null ? null : String(node.label));
    setAttr(button, "data-uikit-ref", node.ref);
    if (icons && typeof icons.render === "function") icons.render(node.icon, iconEl);
    else setAttr(iconEl, "data-uikit-icon", node.icon);
    iconEl.hidden = !node.icon;
  }

  /* The element for a node, created or borrowed on first sight and reused
     after. Returns null when a node cannot be realised at all — an adopt()
     that found nothing — so the caller can fall through to a tombstone. */
  const isContainer = (node) => node.type !== "item" && node.type !== "separator";

  /* The slot element a container wants to BE, or null if it should have a box
     of its own. The root container is the mount: giving it a box would put an
     extra div between the host's element and the whole layout, for no gain. */
  function wantedSlot(node, isRoot) {
    // Floating panels live inside an overlay slot; they must never become it.
    if (!isContainer(node) || node.type === "float") return null;
    if (node.slot) return slots.get(node.slot) || null;
    return isRoot ? mount : null;
  }

  function elementFor(node, kind, isRoot) {
    const existing = elements.get(node.id);
    const held = content.get(node.id);
    if (existing && held && held.kind === kind && stillCorrect(node, isRoot, existing)) {
      if (kind === CONTENT_ADOPT && node.entry && typeof node.entry.adopt === "function") {
        if (node.entry.adopt() !== existing) {
          /* The host no longer hands this node that element — fall through
             and rebuild (a tombstone if adopt() now returns nothing). */
        } else {
          return existing;
        }
      } else {
        return existing;
      }
    }

    // kind changed, slot changed, or first pass: let go of whatever was there
    dropElement(node.id);

    if (isContainer(node)) {
      const slotEl = wantedSlot(node, isRoot);
      if (slotEl && !isBoundElsewhere(node.id, slotEl)) {
        bound.set(node.id, slotEl);
        elements.set(node.id, slotEl);
        content.set(node.id, { kind: CONTENT_NONE });
        return slotEl;
      }
      if (node.entry && typeof node.entry.adopt === "function") {
        const el = node.entry.adopt();
        if (el) {
          adopter.claim(el);
          bound.set(node.id, el);
          elements.set(node.id, el);
          content.set(node.id, { kind: CONTENT_ADOPT, entry: node.entry, adopted: el });
          return el;
        }
      }
      const el = make("div", "uikit-node");
      elements.set(node.id, el);
      content.set(node.id, { kind: CONTENT_NONE });
      return el;
    }

    switch (kind) {
      case CONTENT_ADOPT: {
        const el = node.entry.adopt();
        if (!el) return elementFor(node, CONTENT_TOMBSTONE, isRoot);
        /* Claim before the child-ordering pass moves it. Reading its parent
           afterwards would record the position the layout just gave it, and
           "restore" would put it back where it already was. */
        adopter.claim(el);
        elements.set(node.id, el);
        content.set(node.id, { kind, entry: node.entry, adopted: el });
        return el;
      }
      case CONTENT_CUSTOM: {
        const el = make("div", "uikit-node uikit-custom");
        elements.set(node.id, el);
        const dispose = node.entry.render(el, node);
        content.set(node.id, {
          kind, entry: node.entry,
          dispose: typeof dispose === "function" ? dispose : null,
        });
        return el;
      }
      case CONTENT_BUTTON: {
        const built = buildButton(node);
        elements.set(node.id, built.el);
        content.set(node.id, { kind, entry: node.entry, parts: built.parts });
        return built.el;
      }
      case CONTENT_SEPARATOR: {
        const el = make("div", "uikit-node uikit-sep");
        el.setAttribute("role", "separator");
        elements.set(node.id, el);
        content.set(node.id, { kind });
        return el;
      }
      default: {
        const el = make("div", "uikit-node uikit-tombstone");
        elements.set(node.id, el);
        content.set(node.id, { kind: CONTENT_TOMBSTONE });
        return el;
      }
    }
  }

  function isBoundElsewhere(id, slotEl) {
    for (const [other, el] of bound) if (el === slotEl && other !== id) return true;
    return false;
  }

  /* Is the element we already have still the right one? For a leaf, yes — its
     kind decided that. For a container it is not enough: a variant that
     repoints `slot` (the left panel becoming a bottom sheet on a phone)
     changes nothing about the node's KIND, so without this check the container
     would stay bound to the slot it had at first render and the variant would
     silently do nothing. */
  function stillCorrect(node, isRoot, existing) {
    if (!isContainer(node)) return true;
    const want = wantedSlot(node, isRoot);
    const isBound = bound.has(node.id);
    if (want) return isBound ? bound.get(node.id) === want : isBoundElsewhere(node.id, want);
    return !isBound;
  }

  /* Let go of a node's element without deciding where it goes. Adopted
     elements are RELEASED (they go home); created ones are detached; a bound
     slot is only un-tagged, never removed — the host owns it. */
  /* Hand a BORROWED element back the way runtime/adopt.js does for an adopted
     one. A bound slot — #topbar, #left-sidebar, the mount — is never claimed by
     the adopter, so nothing else would ever strip what paint() wrote on it:
     the data-uikit-* attributes, and the --uikit-* custom properties that a
     resize leaves behind. Missing the second of those left `style="--uikit-w:
     420px"` on the sidebar after teardown, which is exactly the kind of
     residue this module promises not to leave. */
  function unlend(el) {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith("data-uikit-") && attr.name !== "data-uikit-slot") {
        el.removeAttribute(attr.name);
      }
    }
    const style = el.style;
    for (let i = style.length - 1; i >= 0; i--) {
      const name = style[i];
      if (name.startsWith("--uikit-")) style.removeProperty(name);
    }
    if (!el.getAttribute("style")) el.removeAttribute("style");
  }

  function dropElement(id) {
    restoreIcon(elements.get(id));
    const held = content.get(id);
    const el = elements.get(id);
    if (el && hiddenByUs.has(id)) {
      el.hidden = false;
      hiddenByUs.delete(id);
    }
    if (held && typeof held.dispose === "function") {
      try {
        held.dispose();
      } catch (_) {
        /* a host's teardown throwing must not strand the rest of the DOM */
      }
    }
    if (held && held.kind === CONTENT_ADOPT && held.adopted) {
      applyTokens(held.adopted, null, tokenState, allowedTokens);
      restoreLabel(held.adopted);
      adopter.release(held.adopted);
    } else if (el) {
      applyTokens(el, null, tokenState, allowedTokens);
      restoreLabel(el);
      if (bound.has(id)) {
        unlend(el);
      } else if (created.has(el)) {
        if (el.parentNode) el.parentNode.removeChild(el);
        created.delete(el);
      }
    }
    bound.delete(id);
    elements.delete(id);
    content.delete(id);
    clearTarget(id);
  }

  function restoreIcon(el) {
    if (!el || !iconized.has(el)) return;
    iconized.delete(el);
    if (typeof icons?.restore === "function") icons.restore(el);
  }

  function restoreLabel(el) {
    if (!el || !labelled.has(el)) return;
    labelled.delete(el);
    if (labels && typeof labels.restore === "function") labels.restore(el);
  }

  /* Applied only where the words are the HOST's — a borrowed element, or a
     slot the layout is expressing itself through. A button uikit built paints
     its own label in paintButton() and needs nothing here. */
  function syncLabel(node, el) {
    if (!labels || typeof labels.apply !== "function") return;
    if (created.has(el)) return;
    if (node.customLabel != null) {
      labels.apply(el, node.customLabel);
      labelled.add(el);
    } else {
      restoreLabel(el);
    }
  }

  let editing = false;

  function paint(node, isRoot) {
    const kind = kindOf(node);
    const el = elementFor(node, kind, isRoot);
    const isCreated = created.has(el);

    setAttr(el, "data-uikit-id", node.id);
    syncLabel(node, el);
    if (!created.has(el) && typeof icons?.apply === "function") {
      if (node.customIcon != null) { icons.apply(el, node.customIcon); iconized.add(el); }
      else restoreIcon(el);
    }
    if (isCreated || bound.has(node.id)) {
      setAttr(el, "data-uikit-type", node.type);
      setAttr(el, "data-uikit-orient", node.orient);
      setAttr(el, "data-uikit-flow", node.flow);
    }
    setAttr(el, "data-uikit-collapsed", node.collapsed ? "1" : null);
    setAttr(el, "data-uikit-tombstone", node.tombstone);
    setAttr(el, "data-uikit-float", node.type === "float" ? "1" : null);
    /* While customizing, a hidden node stays on screen and is marked instead.
       A user who has just hidden something has to be able to see what they did
       and put it back; a panel that vanishes the instant it is hidden can only
       be recovered through undo, and only if they realise that is what
       happened. */
    setAttr(el, "data-uikit-hidden", editing && node.hidden ? "1" : null);
    /* Only ever unhide what UIKIT hid.
     *
       A borrowed element's visibility is often the host's own business — the
       plan dock shows and hides the wall palette with the active tool — and
       writing `el.hidden = false` on every pass would drag it back on screen
       a frame after the app hid it. So hiding is remembered, and clearing it
       is limited to the nodes this module is responsible for. */
    const wantHidden = !editing && !!node.hidden;
    if (wantHidden) {
      if (!el.hidden) hiddenByUs.add(node.id);
      el.hidden = true;
    } else if (hiddenByUs.has(node.id)) {
      el.hidden = false;
      hiddenByUs.delete(node.id);
    }

    setVar(el, "--uikit-w", node.size ? node.size.w : null);
    setVar(el, "--uikit-h", node.size ? node.size.h : null);
    /* Which axes the USER has set, as an attribute the stylesheet can select
       on. A custom property's presence is not something CSS can test, and the
       rule that applies a user's size has to outrank the host's own — a
       sidebar whose width is `#left-sidebar { width: 300px }` would otherwise
       ignore every resize. */
    let sized = "";
    if (node.rect) sized = "wh";
    else if (node.size) {
      sized = (node.size.w != null ? "w" : "") + (node.size.h != null ? "h" : "");
    }
    setAttr(el, "data-uikit-sized", sized || null);
    if (node.rect) {
      setVar(el, "--uikit-x", node.rect.x);
      setVar(el, "--uikit-y", node.rect.y);
      setVar(el, "--uikit-w", node.rect.w);
      setVar(el, "--uikit-h", node.rect.h);
    }
    applyTokens(el, node.tokens, tokenState, allowedTokens);

    const held = content.get(node.id);
    if (held) held.entry = node.entry || held.entry;
    if (held && held.kind === CONTENT_BUTTON) paintButton(node, held.parts);
    if (held && held.kind === CONTENT_TOMBSTONE) {
      el.textContent = node.label || node.ref || node.id;
      setAttr(el, "data-uikit-ref", node.ref || null);
    }
    return el;
  }

  function update(resolved) {
    editing = !!resolved.edit;
    const seen = new Set();
    const missing = []; // containers whose slot is not on the page right now
    const portals = new Map(); // slot name -> [element]

    function place(el, slotName) {
      if (!portals.has(slotName)) portals.set(slotName, []);
      portals.get(slotName).push(el);
    }

    function walk(node, isRoot) {
      /* A container that declares a slot IS that region. When the region is
         not there — the plan pane's dock zones on a phone, a layout written
         for a host that has more regions than this one — the container is not
         there either. Falling back to a box of its own would put the pane's
         floating tool panels in the middle of the app shell, which is worse
         than showing nothing and much harder to explain. */
      if (isContainer(node) && node.slot && !slots.has(node.slot)) {
        missing.push({ id: node.id, slot: node.slot });
        return null;
      }
      seen.add(node.id);
      const el = paint(node, isRoot);

      if (node.children && node.children.length) {
        const inline = [];
        for (const child of node.children) {
          const childEl = walk(child, false);
          if (!childEl) continue; // a container whose slot is not on the page
          /* A LEAF may portal into a slot. A CONTAINER with a slot has already
             bound to it and is that slot, so it is not also a child of
             anything. */
          if (child.slot && slots.has(child.slot)) {
            if (isContainer(child) && bound.get(child.id) === slots.get(child.slot)) continue;
            place(childEl, child.slot);
          } else {
            inline.push(childEl);
          }
        }
        const targetEl = (node.entry && typeof node.entry.target === "function")
          ? (node.entry.target(el) || el)
          : el;
        if (editing && targetEl !== el) bindTarget(node.id, targetEl);
        else clearTarget(node.id);
        syncChildren(targetEl, inline, created);
      } else if (isContainer(node)) {
        // an emptied container: drop what uikit put there, keep what the host did
        const targetEl = (node.entry && typeof node.entry.target === "function")
          ? (node.entry.target(el) || el)
          : el;
        if (editing && targetEl !== el) bindTarget(node.id, targetEl);
        else clearTarget(node.id);
        syncChildren(targetEl, [], created);
      }
      return el;
    }

    const rootEl = resolved.tree ? walk(resolved.tree, true) : null;
    // a root that is a leaf rather than a container still has to land somewhere
    if (rootEl && created.has(rootEl) && !rootEl.parentNode) mount.appendChild(rootEl);

    for (const name of slots.names()) {
      const slotEl = slots.get(name);
      // a slot a container bound to is filled by that container's own walk
      let claimed = false;
      for (const el of bound.values()) if (el === slotEl) claimed = true;
      if (!claimed) syncChildren(slotEl, portals.get(name) || [], created);
    }

    for (const id of lastIds) {
      if (!seen.has(id)) dropElement(id);
    }
    lastIds = seen;

    applyTokens(mount, resolved.tokens, tokenState, allowedTokens);
    return { seen, missing };
  }

  function teardown() {
    for (const id of [...content.keys()]) dropElement(id);
    const problems = adopter.releaseAll();
    for (const el of created) if (el.parentNode) el.parentNode.removeChild(el);
    created.clear();
    hiddenByUs.clear();
    elements.clear();
    bound.clear();
    content.clear();
    for (const id of [...targets.keys()]) clearTarget(id);
    lastIds = new Set();
    clearTokens(tokenState);
    return problems;
  }

  return {
    update,
    teardown,
    /* The element that IS this node — a host's own element for an adopted
       node, a slot for a bound container, one uikit made otherwise. */
    elementFor(id) {
      return elements.get(id) || null;
    },
    isCreated(id) {
      const el = elements.get(id);
      return !!el && created.has(el);
    },
    adoptedFor(id) {
      const held = content.get(id);
      return held && held.kind === CONTENT_ADOPT ? held.adopted : null;
    },
  };
}
