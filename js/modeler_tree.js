// The one FeatureManager renderer.
//
// It draws the normalised node model from core/tree_model.js and knows nothing
// about which document shape produced it — that is the whole point. A canonical
// history and a legacy parts list reach this file as the same rows, so rename,
// keyboard navigation, drag-reorder and the context menu are written once and
// behave the same in both.
//
// DOM helpers arrive as `deps` rather than being imported, so this module stays
// loadable (and testable) without the editor's 13k-line chrome.

import { flattenTree, findTreeNode } from "./core/tree_model.js";

const NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"]);

function iconMarkup(deps, node) {
  if (!node.icon) return "";
  if (node.icon.startsWith("ph-")) return '<i class="ph ' + node.icon + '"></i>';
  return deps.cadIcon(node.icon);
}

/* A row is one line of the tree, whatever it represents. Sections, folders,
   features, sketches, bodies and reference geometry differ only by which
   capability flags they carry — never by which code path drew them. */
function buildRow(node, depth, deps, handlers, state) {
  const row = deps.el("div", rowClasses(node));
  row.dataset.nodeId = node.id;
  if (node.targetId) row.dataset.historyTarget = node.targetId;
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-level", String(depth + 1));
  row.dataset.depth = String(depth);
  row.style.setProperty("--md-tree-indent", (depth * 13) + "px");
  if (depth > 1) {
    row.classList.add("md-tree-nested");
    row.style.setProperty("--md-tree-branch-offset", 10 + (depth - 1) * 13 + "px");
  }
  if (node.children.length) row.setAttribute("aria-expanded", String(!node.collapsed));
  row.tabIndex = state.activeId === node.id ? 0 : -1;

  const caret = deps.el("button", "md-tree-caret");
  caret.type = "button";
  if (node.children.length) {
    caret.innerHTML = '<i class="ph ' + (node.collapsed ? "ph-caret-right" : "ph-caret-down") + '"></i>';
    caret.setAttribute("aria-label", node.collapsed ? "Expand" : "Collapse");
    caret.addEventListener("click", (event) => { event.stopPropagation(); handlers.onToggleCollapse(node); });
  } else {
    caret.classList.add("md-tree-caret-empty");
    caret.tabIndex = -1;
    caret.setAttribute("aria-hidden", "true");
  }
  row.appendChild(caret);

  if (node.index != null && node.kind !== "section") row.appendChild(deps.el("span", "md-history-index", String(node.index + 1)));
  if (node.swatch) {
    const swatch = deps.el("span", "sw");
    swatch.style.background = node.swatch;
    row.appendChild(swatch);
  }
  row.appendChild(deps.el("span", "md-tree-icon", iconMarkup(deps, node)));

  const label = deps.el("span", "nm");
  const name = deps.el("b", "md-tree-name");
  name.textContent = node.name;
  if (node.technicalDetail) name.title = node.technicalDetail;
  label.appendChild(name);
  if (node.detail) {
    const detail = deps.el("small", "");
    detail.textContent = node.detail;
    label.appendChild(detail);
  }
  row.appendChild(label);
  if (node.shared) row.appendChild(deps.el("span", "md-tree-badge", "shared"));
  if (node.error) {
    row.title = node.error;
    const warning=deps.el("button", "ph ph-warning md-tree-warn");
    warning.type="button"; warning.title=deps.t("issueStartHere")+": "+node.error;
    warning.setAttribute("aria-label",warning.title);
    warning.addEventListener("click",(event)=>{event.stopPropagation(); if(handlers.onRepair)handlers.onRepair(node);else handlers.onEdit(node);});
    row.appendChild(warning);
  }

  const actions = deps.el("span", "md-history-actions");
  // The same eye means different things on different rows: on a feature or a
  // mate it stops the thing acting, on a body or a component it only takes it
  // out of the drawn scene. Labelling both "Suppress" would promise the wrong
  // one.
  if (node.can.suppress) actions.appendChild(action(deps,
    '<i class="ph ' + (node.suppressed ? "ph-eye-slash" : "ph-eye") + '"></i>',
    node.kind === "body" || node.kind === "component"
      ? deps.t(node.suppressed
        ? (node.kind === "component" ? "treeShowComponent" : "treeShow")
        : (node.kind === "component" ? "treeHideComponent" : "treeHide"))
      : deps.t(node.suppressed ? "unsuppress" : "suppress"),
    (event) => { event.stopPropagation(); handlers.onSuppress(node); }));
  if (node.can.rollback) actions.appendChild(action(deps,
    deps.cadIcon("rollbackhere"), deps.t("ctxRollbackHere"),
    (event) => { event.stopPropagation(); handlers.onRollback(node); }));
  if (node.can.remove) actions.appendChild(action(deps,
    '<i class="ph ph-trash"></i>', deps.t("del"),
    (event) => { event.stopPropagation(); handlers.onRemove(node); }));
  if (actions.childNodes.length) row.appendChild(actions);

  wireRow(row, node, deps, handlers, state);
  return row;
}

function action(deps, html, title, onClick) {
  const button = deps.btn(html, onClick, "md-part-x");
  button.title = title;
  button.setAttribute("aria-label", title);
  return button;
}

function rowClasses(node) {
  const classes = ["md-part", "md-tree-row", "md-tree-" + node.kind];
  if (node.selected) classes.push("on");
  if (node.suppressed) classes.push("md-suppressed");
  if (node.rolled) classes.push("md-rolled");
  if (node.error) classes.push("error");
  if (node.state) classes.push("state-" + node.state);
  return classes.join(" ");
}

function wireRow(row, node, deps, handlers, state) {
  row.addEventListener("click", (event) => {
    if (event.target.closest(".md-part-x, .md-tree-caret, .md-tree-rename")) return;
    state.activeId = node.id;
    if (node.kind === "section") { handlers.onToggleCollapse(node); return; }
    // A second click on an already-selected row starts a rename, the way a file
    // manager does. It never fires on the click that selected the row, so it
    // cannot fight with selection.
    if (node.can.rename && node.selected && state.lastClickId === node.id && !event.ctrlKey && !event.metaKey) {
      beginRename(row, node, deps, handlers);
      state.lastClickId = null;
      return;
    }
    state.lastClickId = node.id;
    handlers.onSelect(node, event);
  });
  row.addEventListener("dblclick", (event) => {
    if (event.target.closest(".md-part-x, .md-tree-caret, .md-tree-rename")) return;
    event.stopPropagation();
    if (node.can.edit) handlers.onEdit(node);
    else if (node.children.length) handlers.onToggleCollapse(node);
  });
  row.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handlers.onContextMenu(node, event, { rename: () => beginRename(row, node, deps, handlers) });
  });
  // Focus is the authority on which row the keyboard acts upon. Tracking it
  // only on click let the two drift apart — tab into a row and F2 renamed
  // whichever row had last been clicked, which on a fresh tree was the first
  // section and therefore silently did nothing.
  row.addEventListener("focusin", () => { state.activeId = node.id; });
  if (handlers.onHover) {
    row.addEventListener("mouseenter", () => handlers.onHover(node.targetId));
    row.addEventListener("mouseleave", () => handlers.onHover(null));
    row.addEventListener("focusin", () => handlers.onHover(node.targetId));
    row.addEventListener("focusout", (event) => { if (!row.contains(event.relatedTarget)) handlers.onHover(null); });
  }
  if (node.can.reorder) {
    row.draggable = true;
    row.addEventListener("dragstart", (event) => {
      state.dragId = node.id;
      row.classList.add("md-tree-dragging");
      event.dataTransfer.effectAllowed = "move";
      try { event.dataTransfer.setData("text/plain", node.id); } catch { /* Safari before a drag image */ }
    });
    row.addEventListener("dragend", () => {
      state.dragId = null;
      row.classList.remove("md-tree-dragging");
      row.closest(".md-tree")?.querySelectorAll(".md-tree-drop-before, .md-tree-drop-after")
        .forEach((el) => el.classList.remove("md-tree-drop-before", "md-tree-drop-after"));
    });
    row.addEventListener("dragover", (event) => {
      if (!state.dragId || state.dragId === node.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const box = row.getBoundingClientRect();
      const after = event.clientY > box.top + box.height / 2;
      row.classList.toggle("md-tree-drop-before", !after);
      row.classList.toggle("md-tree-drop-after", after);
    });
    row.addEventListener("dragleave", () => row.classList.remove("md-tree-drop-before", "md-tree-drop-after"));
    row.addEventListener("drop", (event) => {
      if (!state.dragId || state.dragId === node.id) return;
      event.preventDefault();
      const box = row.getBoundingClientRect();
      const after = event.clientY > box.top + box.height / 2;
      row.classList.remove("md-tree-drop-before", "md-tree-drop-after");
      handlers.onReorder(state.dragId, node, after);
      state.dragId = null;
    });
  }
}

/* Inline rename. The label is swapped for an input in place rather than a
   dialog, so the name is edited where it is read. Enter commits, Escape and
   blur-without-change abandon, and an empty name is a no-op rather than a way
   to lose a feature's identity. */
export function beginRename(row, node, deps, handlers) {
  if (!node.can.rename || row.querySelector(".md-tree-rename")) return;
  const label = row.querySelector(".nm");
  if (!label) return;
  const original = node.name;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "md-tree-rename";
  input.value = original;
  input.setAttribute("aria-label", "Rename");
  label.hidden = true;
  label.after(input);
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const next = input.value.trim();
    input.remove();
    label.hidden = false;
    if (commit && next && next !== original) handlers.onRename(node, next);
  };
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); finish(true); }
    else if (event.key === "Escape") { event.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("click", (event) => event.stopPropagation());
  input.focus();
  input.select();
}

/* Arrow-key navigation over the visible rows, the way a real tree control
   behaves: Left collapses or steps to the parent, Right expands or steps to the
   first child, F2 renames, Enter opens. */
function wireKeyboard(container, model, deps, handlers, state) {
  container.addEventListener("keydown", (event) => {
    if (event.target.classList?.contains("md-tree-rename") || event.target.closest("button")) return;
    const visible = flattenTree(model.nodes).map((entry) => entry.node);
    if (!visible.length) return;
    const currentIndex = Math.max(0, visible.findIndex((item) => item.id === state.activeId));
    const current = visible[currentIndex] || visible[0];
    const focusAt = (index) => {
      const next = visible[Math.max(0, Math.min(visible.length - 1, index))];
      if (!next) return;
      state.activeId = next.id;
      const row = container.querySelector('[data-node-id="' + cssEscape(next.id) + '"]');
      if (row) { container.querySelectorAll('[role="treeitem"]').forEach((item) => { item.tabIndex = -1; }); row.tabIndex = 0; row.focus(); }
    };
    if (NAV_KEYS.has(event.key)) event.preventDefault();
    if (event.key === "ArrowDown") focusAt(currentIndex + 1);
    else if (event.key === "ArrowUp") focusAt(currentIndex - 1);
    else if (event.key === "Home") focusAt(0);
    else if (event.key === "End") focusAt(visible.length - 1);
    else if (event.key === "ArrowRight") {
      if (current.children.length && current.collapsed) handlers.onToggleCollapse(current);
      else if (current.children.length) focusAt(currentIndex + 1);
    } else if (event.key === "ArrowLeft") {
      if (current.children.length && !current.collapsed) handlers.onToggleCollapse(current);
      else {
        const parent = parentOf(model.nodes, current.id);
        if (parent) focusAt(visible.findIndex((item) => item.id === parent.id));
      }
    } else if (event.key === "F2") {
      event.preventDefault();
      const row = container.querySelector('[data-node-id="' + cssEscape(current.id) + '"]');
      if (row) beginRename(row, current, deps, handlers);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (current.error && handlers.onRepair) handlers.onRepair(current);
      else if (current.can.edit) handlers.onEdit(current);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      if (!current.can.remove) return;
      event.preventDefault();
      // The tree has handled the key. Without this the same keydown reaches the
      // editor's window listener, which deletes the current selection on top —
      // and selecting a mate row selects both components it holds, so deleting
      // one mate took two parts with it.
      event.stopPropagation();
      handlers.onRemove(current);
    }
  });
}

function cssEscape(value) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
}

function parentOf(nodes, id, parent = null) {
  for (const item of nodes || []) {
    if (item.id === id) return parent;
    const hit = parentOf(item.children, id, item);
    if (hit !== null && hit !== undefined) return hit;
  }
  return null;
}

/* Draw the model into `host`. Returns the state object so the caller can keep
   the focused row across a refresh. */
export function renderTreeModel(host, model, deps, handlers, state = {}) {
  host.innerHTML = "";
  const container = deps.el("div", "md-tree md-tree-unified");
  container.setAttribute("role", "tree");
  container.dataset.mode = model.mode;

  let rollbackEmitted = false;
  const emitRollback = () => {
    if (rollbackEmitted) return;
    rollbackEmitted = true;
    container.appendChild(rollbackBar(deps, handlers));
  };
  const emit = (nodes, depth) => {
    nodes.forEach((node) => {
      // The rollback bar belongs *between* history rows, so it is emitted from
      // the same walk rather than appended after it — a folder or a nested
      // sketch must not push it out of place.
      if (node.index != null && node.index === model.rollbackAt && depth <= 1) emitRollback();
      container.appendChild(buildRow(node, depth, deps, handlers, state));
      if (!node.collapsed && node.children.length) emit(node.children, depth + 1);
    });
  };
  model.nodes.forEach((section) => {
    container.appendChild(buildRow(section, 0, deps, handlers, state));
    if (!section.collapsed && section.children.length) emit(section.children, 1);
    if (section.id === "section:history" && !section.collapsed && model.rollbackAt >= model.historyCount) {
      emitRollback();
    }
  });

  if (!state.activeId || !findTreeNode(model.nodes, state.activeId)) {
    state.activeId = flattenTree(model.nodes)[0]?.node.id || null;
    const first = state.activeId && container.querySelector('[data-node-id="' + cssEscape(state.activeId) + '"]');
    if (first) first.tabIndex = 0;
  }
  wireKeyboard(container, model, deps, handlers, state);
  host.appendChild(container);
  return state;
}

/* The editor already owns a rollback bar — with its caption, its styling and
   its double-click-to-release — so it is passed in rather than rebuilt here.
   The fallback exists only so this module stays drawable on its own. */
function rollbackBar(deps, handlers) {
  if (deps.rollbackBar) return deps.rollbackBar();
  const bar = deps.el("div", "md-rollbar");
  bar.title = deps.t("rollbackRelease");
  bar.setAttribute("role", "separator");
  bar.addEventListener("dblclick", () => handlers.onRollbackRelease && handlers.onRollbackRelease());
  return bar;
}
