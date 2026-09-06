/* A compact, keyboard-native view of the resolved layout. The canvas remains
 * the primary editor; this is the precise fallback for overlapping, tiny or
 * currently hidden nodes that cannot be reached reliably with a pointer.
 *
 * Supports in-place rename (F2 / pencil), in-place icon selection (icon button),
 * double-click drill-down into containers, and Kanban-style drag-and-drop.
 */

import { treeDropTarget, passedThreshold, TOUCH_DRAG_THRESHOLD } from "./drag.js";
import { openIconPicker } from "./icon_picker.js";
import { drillTarget } from "./depth.js";

export function createTreeBrowser(context) {
  const ctx = context || {};
  const doc = ctx.document;
  const t = ctx.t || ((_, fallback) => fallback);

  const root = doc.createElement("details");
  root.className = "uikit-ins-browser uikit-ins-tree";
  const summary = doc.createElement("summary");
  summary.textContent = t("uikit_ins_tree", "Layout tree");
  root.appendChild(summary);

  const list = doc.createElement("div");
  list.className = "uikit-ins-tree-list";
  list.setAttribute("role", "tree");
  list.setAttribute("aria-label", t("uikit_ins_tree", "Layout tree"));
  root.appendChild(list);

  let lastTree = null;
  let lastSelection = [];
  let focusedId = null;
  let editingNodeId = null;
  let treeDrag = null;
  let dwellTimer = null;
  let dropLineEl = null;
  let lastRowUp = null;
  const collapsed = new Set();

  function title(node) {
    return ctx.titleFor ? ctx.titleFor(node)
      : node.label || (node.entry && node.entry.title) || node.ref || node.id;
  }

  function findPathTo(tree, targetId, path = []) {
    if (!tree) return null;
    if (tree.id === targetId) return path;
    for (const child of tree.children || []) {
      const found = findPathTo(child, targetId, path.concat(tree.id));
      if (found) return found;
    }
    return null;
  }

  function setFocus(button) {
    if (!button) return;
    const allRows = list.querySelectorAll(".uikit-ins-tree-row");
    for (const r of allRows) r.tabIndex = -1;
    button.tabIndex = 0;
    focusedId = button.dataset.nodeId;
    button.focus();
  }

  function toggleCollapse(nodeId, forceState) {
    const isClosed = collapsed.has(nodeId);
    const nextClosed = forceState != null ? forceState : !isClosed;
    if (nextClosed) collapsed.add(nodeId);
    else collapsed.delete(nodeId);
    renderCurrent();
    const btn = list.querySelector(`[data-node-id="${nodeId}"]`);
    if (btn) setFocus(btn);
  }

  function fallbackIcon(node) {
    if (!node) return null;
    if (ctx.icons && typeof ctx.icons.iconFor === "function") {
      return ctx.icons.iconFor(node);
    }
    return node.icon || (node.entry && node.entry.icon) || null;
  }

  function startInlineRename(nodeId) {
    editingNodeId = nodeId;
    renderCurrent();
    const input = list.querySelector(".uikit-ins-tree-inline-input");
    if (input) {
      input.focus();
      input.select();
    }
  }

  function commitRename(nodeId, newName) {
    if (editingNodeId !== nodeId) return;
    editingNodeId = null;
    const trimmed = (newName || "").trim();
    if (trimmed && typeof ctx.command === "function") {
      const everywhere = (typeof ctx.isRenameEverywhere === "function") ? ctx.isRenameEverywhere() : false;
      ctx.command("retitle", { id: nodeId, label: trimmed, everywhere });
    }
    renderCurrent();
  }

  function cancelRename() {
    editingNodeId = null;
    renderCurrent();
  }

  function clearDropIndicators() {
    for (const el of list.querySelectorAll(".uikit-ins-tree-drop-inside")) {
      el.classList.remove("uikit-ins-tree-drop-inside");
    }
    if (dropLineEl && dropLineEl.parentNode) {
      dropLineEl.parentNode.removeChild(dropLineEl);
    }
  }

  function ensureDropLine() {
    if (!dropLineEl) {
      dropLineEl = doc.createElement("div");
      dropLineEl.className = "uikit-ins-tree-drop-line";
    }
    return dropLineEl;
  }

  function onTreePointerMove(e) {
    if (!treeDrag) return;
    const point = { x: e.clientX, y: e.clientY };
    const thresh = treeDrag.pointerType === "touch" ? TOUCH_DRAG_THRESHOLD : 4;
    if (!treeDrag.active) {
      if (!passedThreshold({ x: treeDrag.startX, y: treeDrag.startY }, point, thresh)) return;
      treeDrag.active = true;
      list.classList.add("is-tree-dragging");
      treeDrag.rowEl.classList.add("is-dragging");
    }

    const listRect = list.getBoundingClientRect();
    if (point.y < listRect.top + 24) {
      list.scrollTop -= 6;
    } else if (point.y > listRect.bottom - 24) {
      list.scrollTop += 6;
    }

    clearDropIndicators();

    const allRowBtns = [...list.querySelectorAll(".uikit-ins-tree-row")];
    const rowSpecs = allRowBtns.map((el) => {
      const id = el.dataset.nodeId;
      const pId = el.dataset.parentId || null;
      const n = (ctx.nodeFor && ctx.nodeFor(id)) || null;
      const r = el.getBoundingClientRect();
      const isCont = !!(n && n.children);
      const isColl = isCont && collapsed.has(id);
      return {
        id,
        parentId: pId,
        rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        isContainer: isCont,
        isCollapsed: isColl,
        childrenCount: (n && n.children && n.children.length) || 0,
        index: Number(el.getAttribute("aria-posinset") || "1") - 1,
      };
    });

    const acceptsFn = (parentId, draggingId) => {
      if (!parentId || !draggingId) return false;
      if (typeof ctx.containerAccepts === "function") {
        const pNode = ctx.nodeFor ? ctx.nodeFor(parentId) : null;
        const mNode = ctx.nodeFor ? ctx.nodeFor(draggingId) : null;
        if (!pNode || !mNode) return false;
        return ctx.containerAccepts(pNode, mNode);
      }
      return true;
    };

    const target = treeDropTarget(rowSpecs, point, treeDrag.id, acceptsFn);
    treeDrag.dropTarget = target;

    if (target && target.valid) {
      const targetBtn = list.querySelector(`[data-node-id="${target.targetId}"]`);
      if (target.zone === "inside") {
        if (targetBtn) {
          targetBtn.classList.add("uikit-ins-tree-drop-inside");
          if (collapsed.has(target.targetId) && !dwellTimer) {
            dwellTimer = setTimeout(() => {
              collapsed.delete(target.targetId);
              renderCurrent();
              dwellTimer = null;
            }, 600);
          }
        }
      } else {
        if (dwellTimer) {
          clearTimeout(dwellTimer);
          dwellTimer = null;
        }
        if (targetBtn) {
          const wrap = targetBtn.closest(".uikit-ins-tree-item-wrap");
          if (wrap) {
            ensureDropLine();
            dropLineEl.className = "uikit-ins-tree-drop-line is-" + target.zone;
            const depth = targetBtn.getAttribute("aria-level")
              ? Number(targetBtn.getAttribute("aria-level")) - 1
              : 0;
            dropLineEl.style.setProperty("--uikit-tree-depth", String(depth));
            wrap.appendChild(dropLineEl);
          }
        }
      }
    } else {
      if (dwellTimer) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
    }
  }

  function onTreePointerUp(e) {
    if (dwellTimer) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }
    if (!treeDrag) return;
    const current = treeDrag;
    treeDrag = null;

    if (current.active) {
      list.classList.remove("is-tree-dragging");
      current.rowEl.classList.remove("is-dragging");
      clearDropIndicators();

      if (current.dropTarget && current.dropTarget.valid) {
        const { parentId, index, zone } = current.dropTarget;
        if (typeof ctx.command === "function") {
          ctx.command("move", { id: current.id, parent: parentId, index });
        }
        if (zone === "inside") {
          collapsed.delete(parentId);
        }
        renderCurrent();
      }
    }
  }

  doc.addEventListener("pointermove", onTreePointerMove);
  doc.addEventListener("pointerup", onTreePointerUp);

  function destroy() {
    doc.removeEventListener("pointermove", onTreePointerMove);
    doc.removeEventListener("pointerup", onTreePointerUp);
    if (dwellTimer) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }
    treeDrag = null;
    clearDropIndicators();
  }

  function row(node, depth, selected, index, totalSiblings, parentId) {
    const hasChildren = !!(node.children && node.children.length);
    const isCollapsed = hasChildren && collapsed.has(node.id);
    const isSelected = selected.has(node.id);

    const itemWrap = doc.createElement("div");
    itemWrap.className = "uikit-ins-tree-item-wrap";
    itemWrap.setAttribute("role", "none");

    /* A DIV, not a button. The row carries three controls of its own — the
       icon opens the picker, the pencil renames, the arrow resets — and
       putting a <button> inside a <button> is invalid HTML. Those controls
       live INSIDE this treeitem: a div is not interactive, so the nesting
       rule does not fire, and role=tree may own only treeitems (the wrap is
       role=none). They are tabindex=-1 so the roving tabindex on the row
       stays the one tab stop. */
    const rowEl = doc.createElement("div");
    rowEl.className = "uikit-ins-tree-row";
    rowEl.setAttribute("role", "treeitem");
    rowEl.setAttribute("aria-level", String(depth + 1));
    rowEl.setAttribute("aria-selected", isSelected ? "true" : "false");
    rowEl.setAttribute("aria-posinset", String(index + 1));
    rowEl.setAttribute("aria-setsize", String(totalSiblings));
    rowEl.style.setProperty("--uikit-tree-depth", String(depth));
    rowEl.dataset.nodeId = node.id;
    if (parentId) rowEl.dataset.parentId = parentId;

    if (hasChildren) {
      rowEl.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    }

    const primaryFocusId = focusedId || (lastSelection.length ? lastSelection[0] : null);
    const isCurrentFocus = primaryFocusId
      ? node.id === primaryFocusId
      : (depth === 0 && index === 0);
    rowEl.tabIndex = isCurrentFocus ? 0 : -1;

    const mark = doc.createElement("span");
    mark.className = "uikit-ins-tree-mark";
    mark.textContent = hasChildren ? (isCollapsed ? "▸" : "▾") : "·";
    if (hasChildren) {
      mark.setAttribute("aria-hidden", "true");
    }

    const iconBtn = doc.createElement("button");
    iconBtn.type = "button";
    iconBtn.tabIndex = -1;
    iconBtn.className = "uikit-ins-tree-icon-btn";
    iconBtn.title = t("uikit_ins_icon_select", "Change icon");
    iconBtn.setAttribute("aria-label", t("uikit_ins_icon_select", "Change icon"));
    const iconSpan = doc.createElement("span");
    iconSpan.className = "uikit-ins-tree-icon";
    const iconInner = doc.createElement("span");
    iconSpan.appendChild(iconInner);
    const iconName = fallbackIcon(node);
    if (ctx.icons && typeof ctx.icons.render === "function") {
      ctx.icons.render(iconName, iconInner);
    } else if (iconName) {
      iconInner.setAttribute("data-uikit-icon", iconName);
    }
    iconBtn.appendChild(iconSpan);

    iconBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openIconPicker({
        document: doc,
        anchor: iconBtn,
        currentIcon: node.icon || null,
        icons: ctx.icons,
        t,
        onSelect: (chosenName) => {
          if (typeof ctx.command === "function") {
            ctx.command("reicon", { id: node.id, icon: chosenName });
          }
        },
        onReset: () => {
          if (typeof ctx.command === "function") {
            ctx.command("reicon", { id: node.id, icon: null });
          }
        },
      });
    });

    rowEl.append(mark, iconBtn);

    if (editingNodeId === node.id) {
      const input = doc.createElement("input");
      input.type = "text";
      input.className = "uikit-ins-tree-inline-input";
      input.value = title(node);
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          commitRename(node.id, input.value);
        } else if (e.key === "Escape") {
          cancelRename();
        }
      });
      input.addEventListener("blur", () => {
        commitRename(node.id, input.value);
      });
      rowEl.appendChild(input);
    } else {
      const label = doc.createElement("span");
      label.className = "uikit-ins-tree-label";
      label.textContent = title(node);
      label.title = label.textContent;
      rowEl.appendChild(label);
    }

    const roleSpan = doc.createElement("span");
    roleSpan.className = "uikit-ins-tree-role";
    const roleFallback = {
      dock: "Workspace layout",
      bar: "Toolbar",
      stack: "Sidebar column",
      group: "Tool group",
      menu: "Menu",
      item: node.entry && node.entry.kind === "panel" ? "Panel" : "Button",
      separator: "Divider",
    };
    const roleKind = (node.entry && node.entry.kind === "menu") ? "menu" : node.type;
    roleSpan.textContent = t("uikit_kind_" + roleKind, roleFallback[roleKind] || node.type);
    rowEl.appendChild(roleSpan);

    const isLeaf = !(node.children && node.children.length);
    const isMissing = !!(node.tombstone || (node.entry && node.entry.tombstone)
      || (isLeaf && ctx.hasElement && !ctx.hasElement(node.id)));
    if (isMissing) {
      const missingState = doc.createElement("span");
      missingState.className = "uikit-ins-tree-state uikit-ins-tree-missing";
      missingState.textContent = t("uikit_ins_missing", "Missing");
      rowEl.setAttribute("aria-description", t("uikit_ins_missing", "Missing"));
      rowEl.appendChild(missingState);
    }

    if (node.hidden) {
      const hiddenState = doc.createElement("span");
      hiddenState.className = "uikit-ins-tree-state";
      hiddenState.textContent = t("uikit_ins_hidden", "Hidden");
      rowEl.appendChild(hiddenState);
    }

    const pencilBtn = doc.createElement("button");
    pencilBtn.type = "button";
    pencilBtn.tabIndex = -1;
    pencilBtn.className = "uikit-ins-tree-action uikit-ins-tree-rename";
    pencilBtn.title = t("uikit_ins_rename", "Rename") + " (F2)";
    pencilBtn.setAttribute("aria-label", t("uikit_ins_rename", "Rename"));
    const pencilSpan = doc.createElement("span");
    const renameIcon = ctx.icons && typeof ctx.icons.iconFor === "function"
      ? ctx.icons.iconFor({ kind: "action:rename" })
      : null;
    if (renameIcon && typeof ctx.icons.render === "function") {
      ctx.icons.render(renameIcon, pencilSpan);
    } else {
      pencilSpan.textContent = "✎";
    }
    pencilBtn.appendChild(pencilSpan);
    pencilBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startInlineRename(node.id);
    });

    /* Reset this one item — every parameter it carries, and where it sits.
       Not the app-wide wording: that has a reach this item does not own, and
       its own reset lives in the inspector beside the checkbox that made it. */
    const resetBtn = doc.createElement("button");
    resetBtn.type = "button";
    resetBtn.tabIndex = -1;
    resetBtn.className = "uikit-ins-tree-action uikit-ins-tree-reset";
    resetBtn.title = t("uikit_ins_reset_node", "Reset to default");
    resetBtn.setAttribute("aria-label", t("uikit_ins_reset_node", "Reset to default"));
    const resetSpan = doc.createElement("span");
    resetSpan.className = "uikit-ins-tree-action-glyph";
    if (ctx.icons && typeof ctx.icons.render === "function" &&
        typeof ctx.icons.iconFor === "function") {
      ctx.icons.render(ctx.icons.iconFor({ kind: "action:reset" }), resetSpan);
    } else {
      resetSpan.textContent = "\u21ba";
    }
    resetBtn.appendChild(resetSpan);
    resetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof ctx.command === "function") ctx.command("resetNode", { id: node.id });
    });

    rowEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (editingNodeId === node.id) return;
      if (e.target.closest(".uikit-ins-tree-mark") ||
          e.target.closest(".uikit-ins-tree-icon-btn") ||
          e.target.closest(".uikit-ins-tree-action")) {
        return;
      }
      treeDrag = {
        id: node.id,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        pointerType: e.pointerType,
        rowEl: rowEl,
      };
    });

    rowEl.addEventListener("click", (e) => {
      if (e.target === mark || e.target.closest(".uikit-ins-tree-mark")) {
        e.stopPropagation();
        toggleCollapse(node.id);
        return;
      }
      if (e.target === iconBtn || e.target.closest(".uikit-ins-tree-icon-btn") ||
          e.target === pencilBtn || e.target.closest(".uikit-ins-tree-action") ||
          editingNodeId === node.id) {
        return;
      }
      if (typeof ctx.select === "function") {
        ctx.select(node.id);
      }
      setFocus(rowEl);

      const now = Date.now();
      if (lastRowUp && (now - lastRowUp.time) <= 400 && lastRowUp.id === node.id) {
        lastRowUp = null;
        const drill = drillTarget(node);
        if (drill) {
          if (typeof ctx.setFocus === "function") ctx.setFocus(drill);
          if (typeof ctx.select === "function") ctx.select(drill);
          collapsed.delete(drill);
          renderCurrent();
        }
      } else {
        lastRowUp = { time: now, id: node.id };
      }
    });

    rowEl.addEventListener("dblclick", (e) => {
      if (e.target.closest(".uikit-ins-tree-mark") ||
          e.target.closest(".uikit-ins-tree-icon-btn") ||
          e.target.closest(".uikit-ins-tree-action") ||
          editingNodeId === node.id) {
        return;
      }
      const drill = drillTarget(node);
      if (drill) {
        if (typeof ctx.setFocus === "function") ctx.setFocus(drill);
        if (typeof ctx.select === "function") ctx.select(drill);
        collapsed.delete(drill);
        renderCurrent();
      }
    });

    rowEl.append(pencilBtn, resetBtn);
    itemWrap.appendChild(rowEl);
    list.appendChild(itemWrap);

    if (hasChildren && !isCollapsed) {
      const children = node.children || [];
      for (let i = 0; i < children.length; i++) {
        row(children[i], depth + 1, selected, i, children.length, node.id);
      }
    }
  }

  function renderCurrent() {
    if (!root.open) return;
    const hadFocus = list.contains(doc.activeElement);
    list.replaceChildren();
    if (!lastTree) return;

    const selected = new Set(lastSelection);
    row(lastTree, 0, selected, 0, 1, null);

    const active = list.querySelector(`[data-node-id="${focusedId}"]`);
    if (active) {
      const allRows = list.querySelectorAll(".uikit-ins-tree-row");
      for (const r of allRows) r.tabIndex = -1;
      active.tabIndex = 0;
      if (hadFocus && editingNodeId == null) active.focus();
    }
  }

  list.addEventListener("focusin", (e) => {
    const rowBtn = e.target && e.target.closest(".uikit-ins-tree-row");
    if (rowBtn && rowBtn.dataset.nodeId && editingNodeId == null) {
      focusedId = rowBtn.dataset.nodeId;
      const allRows = list.querySelectorAll(".uikit-ins-tree-row");
      for (const r of allRows) r.tabIndex = -1;
      rowBtn.tabIndex = 0;
    }
  });

  list.addEventListener("keydown", (e) => {
    if (editingNodeId != null) return;
    const rows = [...list.querySelectorAll(".uikit-ins-tree-row")];
    if (!rows.length) return;

    const currentButton = (e.target && e.target.closest(".uikit-ins-tree-row")) ||
      (doc.activeElement && doc.activeElement.closest(".uikit-ins-tree-row"));
    const currentIndex = currentButton ? rows.indexOf(currentButton) : -1;

    switch (e.key) {
      case "F2": {
        if (currentButton && currentButton.dataset.nodeId) {
          e.preventDefault();
          startInlineRename(currentButton.dataset.nodeId);
        }
        break;
      }
      case "ArrowDown": {
        e.preventDefault();
        const next = rows[Math.min(currentIndex + 1, rows.length - 1)];
        setFocus(next);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = rows[Math.max(currentIndex - 1, 0)];
        setFocus(prev);
        break;
      }
      case "ArrowRight": {
        if (!currentButton) break;
        e.preventDefault();
        const nodeId = currentButton.dataset.nodeId;
        const expanded = currentButton.getAttribute("aria-expanded");
        if (expanded === "false") {
          toggleCollapse(nodeId, false);
        } else if (expanded === "true") {
          const next = rows[currentIndex + 1];
          if (next && next.dataset.parentId === nodeId) {
            setFocus(next);
          }
        }
        break;
      }
      case "ArrowLeft": {
        if (!currentButton) break;
        e.preventDefault();
        const nodeId = currentButton.dataset.nodeId;
        const expanded = currentButton.getAttribute("aria-expanded");
        if (expanded === "true") {
          toggleCollapse(nodeId, true);
        } else {
          const parentId = currentButton.dataset.parentId;
          if (parentId) {
            const parentButton = list.querySelector(`[data-node-id="${parentId}"]`);
            if (parentButton) setFocus(parentButton);
          }
        }
        break;
      }
      case "Home": {
        e.preventDefault();
        setFocus(rows[0]);
        break;
      }
      case "End": {
        e.preventDefault();
        setFocus(rows[rows.length - 1]);
        break;
      }
      case "Enter":
      case " ": {
        if (currentButton) {
          e.preventDefault();
          currentButton.click();
        }
        break;
      }
    }
  });

  let prevSelectionKey = "";

  function sync(tree, selection) {
    lastTree = tree;
    lastSelection = selection || [];
    const newKey = lastSelection.join(",");
    if (newKey && newKey !== prevSelectionKey) {
      prevSelectionKey = newKey;
      for (const selId of lastSelection) {
        const ancestors = findPathTo(lastTree, selId);
        if (ancestors) {
          for (const anc of ancestors) collapsed.delete(anc);
        }
      }
    }
    if (!root.open) return;
    renderCurrent();
  }

  root.addEventListener("toggle", () => {
    if (root.open) renderCurrent();
  });

  return {
    element: root,
    sync,
    destroy,
    open: () => {
      root.open = true;
      renderCurrent();
    },
    isCollapsed: (id) => collapsed.has(id),
  };
}
