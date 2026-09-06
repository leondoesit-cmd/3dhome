/* Dedicated test suite for the customize-mode Layout Tree browser.
 *
 * Covers:
 * - Hierarchy rendering matching resolved layout (aria-level, aria-posinset, aria-setsize)
 * - Canvas -> Tree selection synchronization
 * - Tree -> Canvas selection synchronization
 * - Hidden nodes and tombstone (missing) nodes distinction
 * - Expand / Collapse behavior (clicking mark and aria-expanded)
 * - WAI-ARIA roving tabindex and arrow-key keyboard navigation
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

let shared = null;

test.after(async () => {
  if (shared) await shared.close();
});

async function customizing({ width = 1440, height = 900 } = {}) {
  if (!shared) shared = await openPage({ width, height });
  else await shared.resize(width, height);
  await shared.goto("/");
  await shared.eval(() => {
    localStorage.removeItem("mf_uikit");
    localStorage.removeItem("home3d_uikit:planner");
  });
  await shared.goto("/");
  await shared.eval(async () => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    window.__runAction("uikitCustomize");
    for (let i = 0; i < 400 && !document.querySelector(".uikit-ins"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const host = await import("/js/uikit_host/index.js");
    window.__ui = host.activeUIKit();
    window.__ed = window.__ui.editor;
    window.__frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  });
  return shared;
}

test("tree renders hierarchy and synchronizes with canvas selection", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    ed.command("select", { id: "panel:tree" });
    await window.__frame();

    const selectedRow = treeDetails.querySelector('.uikit-ins-tree-row[aria-selected="true"]');
    const selectedLevel = selectedRow ? selectedRow.getAttribute("aria-level") : null;
    const posInSet = selectedRow ? selectedRow.getAttribute("aria-posinset") : null;
    const setSize = selectedRow ? selectedRow.getAttribute("aria-setsize") : null;

    return {
      selectedNodeId: selectedRow && selectedRow.dataset.nodeId,
      selectedLevel: Number(selectedLevel),
      posInSet: Number(posInSet),
      setSize: Number(setSize),
      hasRoleTree: treeDetails.querySelector('[role="tree"]') !== null,
    };
  });

  assert.equal(result.hasRoleTree, true, "list has role=tree");
  assert.equal(result.selectedNodeId, "panel:tree", "canvas selection synced to tree aria-selected");
  assert.ok(result.selectedLevel >= 2, "panel is indented at level 2+");
  assert.ok(result.posInSet >= 1, "has valid aria-posinset");
  assert.ok(result.setSize >= 1, "has valid aria-setsize");
});

test("clicking a tree item selects it in the editor and on the canvas", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    ed.command("select", { id: null });
    await window.__frame();

    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const libraryRow = [...treeDetails.querySelectorAll(".uikit-ins-tree-row")]
      .find((r) => r.dataset.nodeId === "panel:library");

    libraryRow.click();
    await window.__frame();

    return {
      editorSelection: ed.selection(),
      inspectorTitle: document.querySelector(".uikit-ins-selection-title")?.textContent.trim(),
    };
  });

  assert.deepEqual(result.editorSelection, ["panel:library"], "tree click selected node in editor");
  assert.ok(result.inspectorTitle.includes("Library") || result.inspectorTitle.includes("panel:library"));
});

test("hidden nodes and tombstone nodes show distinct badges in tree", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const ui = window.__ui;
    const { ops } = await import("/uikit/index.js");

    // Hide panel:tree
    ed.command("select", { id: "panel:tree" });
    ed.command("hide");

    // Insert a tombstone node into left stack
    const tombstoneDoc = ops.insert(ui.doc, {
      id: "panel:ghost_deleted",
      parent: "n:left",
      node: { type: "item", ref: "panel:nonexistent_ref" },
    });
    ui.apply("Add tombstone", tombstoneDoc);
    ui.refreshNow();
    await window.__frame();

    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const hiddenRow = [...treeDetails.querySelectorAll(".uikit-ins-tree-row")]
      .find((r) => r.dataset.nodeId === "panel:tree");
    const hiddenBadge = hiddenRow?.querySelector(".uikit-ins-tree-state")?.textContent.trim();

    const tombRow = [...treeDetails.querySelectorAll(".uikit-ins-tree-row")]
      .find((r) => r.dataset.nodeId === "panel:ghost_deleted");
    const tombBadge = tombRow?.querySelector(".uikit-ins-tree-missing")?.textContent.trim();
    const tombDesc = tombRow?.getAttribute("aria-description");

    return {
      hiddenBadge,
      tombBadge,
      tombDesc,
    };
  });

  assert.equal(result.hiddenBadge, "Hidden", "hidden node has Hidden badge");
  assert.equal(result.tombBadge, "Missing", "tombstone has Missing badge");
  assert.equal(result.tombDesc, "Missing", "tombstone has aria-description=Missing");
});

test("expanding and collapsing branches updates aria-expanded and child rows", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const leftContainerRow = [...treeDetails.querySelectorAll(".uikit-ins-tree-row")]
      .find((r) => r.dataset.nodeId === "n:left");
    const initialExpanded = leftContainerRow.getAttribute("aria-expanded");
    const initialCount = treeDetails.querySelectorAll(".uikit-ins-tree-row").length;

    // Click the toggle mark on n:left to collapse it
    const mark = leftContainerRow.querySelector(".uikit-ins-tree-mark");
    mark.click();
    await window.__frame();

    const collapsedRow = [...treeDetails.querySelectorAll(".uikit-ins-tree-row")]
      .find((r) => r.dataset.nodeId === "n:left");
    const collapsedExpanded = collapsedRow ? collapsedRow.getAttribute("aria-expanded") : null;
    const collapsedCount = treeDetails.querySelectorAll(".uikit-ins-tree-row").length;
    const collapsedTabIndex = collapsedRow ? collapsedRow.tabIndex : null;
    const tabZeroCount = treeDetails.querySelectorAll('.uikit-ins-tree-row[tabindex="0"]').length;

    // Click again to re-expand
    const mark2 = collapsedRow.querySelector(".uikit-ins-tree-mark");
    mark2.click();
    await window.__frame();

    const reexpandedRow = [...treeDetails.querySelectorAll(".uikit-ins-tree-row")]
      .find((r) => r.dataset.nodeId === "n:left");
    const reexpandedExpanded = reexpandedRow ? reexpandedRow.getAttribute("aria-expanded") : null;
    const reexpandedCount = treeDetails.querySelectorAll(".uikit-ins-tree-row").length;

    return {
      initialExpanded,
      initialCount,
      collapsedExpanded,
      collapsedCount,
      collapsedTabIndex,
      tabZeroCount,
      reexpandedExpanded,
      reexpandedCount,
    };
  });

  assert.equal(result.initialExpanded, "true", "container initially expanded");
  assert.equal(result.collapsedExpanded, "false", "container aria-expanded=false when collapsed");
  assert.ok(result.collapsedCount < result.initialCount, "children hidden when collapsed");
  assert.equal(result.collapsedTabIndex, 0, "collapsed container retains tabindex=0");
  assert.equal(result.tabZeroCount, 1, "exactly one row retains tabindex=0 after mouse collapse");
  assert.equal(result.reexpandedExpanded, "true", "container re-expanded");
  assert.equal(result.reexpandedCount, result.initialCount, "all children restored on re-expand");
});

test("roving tabindex and arrow keys navigate, expand and collapse the tree", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const rows = [...treeDetails.querySelectorAll(".uikit-ins-tree-row")];
    const firstRow = rows[0];
    firstRow.focus();

    const sendKey = (key) => {
      document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      );
    };

    // ArrowDown should move to row 1
    sendKey("ArrowDown");
    const activeAfterDown = document.activeElement;
    const tabIndexAfterDown = activeAfterDown.tabIndex;

    // ArrowUp should move back to row 0
    sendKey("ArrowUp");
    const activeAfterUp = document.activeElement;

    // Find a container that is expanded
    const containerRow = rows.find((r) => r.getAttribute("aria-expanded") === "true");
    const containerId = containerRow.dataset.nodeId;
    containerRow.focus();

    // ArrowLeft should collapse it
    sendKey("ArrowLeft");
    await window.__frame();
    const liveCollapsed = treeDetails.querySelector(`[data-node-id="${containerId}"]`);
    const afterLeftExpanded = liveCollapsed?.getAttribute("aria-expanded");

    // ArrowRight should re-expand it
    sendKey("ArrowRight");
    await window.__frame();
    const liveExpanded = treeDetails.querySelector(`[data-node-id="${containerId}"]`);
    const afterRightExpanded = liveExpanded?.getAttribute("aria-expanded");

    return {
      movedDown: activeAfterDown.dataset.nodeId === rows[1].dataset.nodeId,
      tabIndexAfterDown,
      movedUp: activeAfterUp.dataset.nodeId === rows[0].dataset.nodeId,
      afterLeftExpanded,
      afterRightExpanded,
    };
  });

  assert.equal(result.movedDown, true, "ArrowDown moves focus to next item");
  assert.equal(result.tabIndexAfterDown, 0, "active item receives tabindex=0");
  assert.equal(result.movedUp, true, "ArrowUp moves focus back to previous item");
  assert.equal(result.afterLeftExpanded, "false", "ArrowLeft collapsed the container");
  assert.equal(result.afterRightExpanded, "true", "ArrowRight re-expanded the container");
});

test("multi-selection exposes exactly one roving tab stop (tabindex=0)", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    // Multi-select two items before tree is opened
    ed.command("select", { id: "panel:smarthome" });
    ed.command("select", { id: "panel:mep", additive: true });
    await window.__frame();

    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const tabZeroRows = [...treeDetails.querySelectorAll('.uikit-ins-tree-row[tabindex="0"]')];
    const selectedRows = [...treeDetails.querySelectorAll('.uikit-ins-tree-row[aria-selected="true"]')];

    return {
      selectedCount: selectedRows.length,
      tabZeroCount: tabZeroRows.length,
      tabZeroId: tabZeroRows[0]?.dataset.nodeId,
    };
  });

  assert.equal(result.selectedCount, 2, "both items marked aria-selected=true");
  assert.equal(result.tabZeroCount, 1, "exactly one roving tab stop exposed for multi-selection");
  assert.equal(result.tabZeroId, "panel:smarthome", "first selected item receives tabindex=0");
});

test("reordering and grouping update the tree without losing focus", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    // Click to select and focus panel:smarthome
    const smarthomeRow = treeDetails.querySelector('[data-node-id="panel:smarthome"]');
    smarthomeRow.click();
    await window.__frame();

    // Reorder panel:smarthome
    ed.command("reorder", { id: "panel:smarthome", to: 1 });
    await window.__frame();

    const reorderedFocusRow = treeDetails.querySelector('.uikit-ins-tree-row[tabindex="0"]');
    const focusedAfterReorder = reorderedFocusRow?.dataset.nodeId;

    // Group smarthome and mep
    ed.command("select", { id: "panel:smarthome" });
    ed.command("select", { id: "panel:mep", additive: true });
    ed.command("group");
    await window.__frame();

    const tabZeroAfterGroup = treeDetails.querySelectorAll('.uikit-ins-tree-row[tabindex="0"]');
    const groupRows = [...treeDetails.querySelectorAll('.uikit-ins-tree-row')].filter((r) => r.dataset.nodeId?.startsWith("g:"));

    return {
      focusedAfterReorder,
      groupCreated: groupRows.length > 0,
      singleTabZeroAfterGroup: tabZeroAfterGroup.length === 1,
    };
  });

  assert.equal(result.focusedAfterReorder, "panel:smarthome", "focus maintained on node after reorder");
  assert.equal(result.groupCreated, true, "group container rendered in tree");
  assert.equal(result.singleTabZeroAfterGroup, true, "exactly one tabindex=0 maintained after grouping");
});

test("missing tombstone badges render localized text in Hebrew", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const { ops } = await import("/uikit/index.js");
    const i18n = await import("/js/i18n.js");
    await i18n.setLang("he");

    // Insert tombstone
    const tombstoneDoc = ops.insert(ui.doc, {
      id: "panel:ghost_hebrew",
      parent: "n:left",
      node: { type: "item", ref: "panel:nonexistent_ref" },
    });
    ui.apply("Add tombstone", tombstoneDoc);
    ui.refreshNow();
    await window.__frame();

    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const tombRow = [...treeDetails.querySelectorAll(".uikit-ins-tree-row")]
      .find((r) => r.dataset.nodeId === "panel:ghost_hebrew");
    const tombBadge = tombRow?.querySelector(".uikit-ins-tree-missing")?.textContent.trim();
    const tombDesc = tombRow?.getAttribute("aria-description");

    await i18n.setLang("en");

    return {
      tombBadge,
      tombDesc,
    };
  });

  assert.equal(result.tombBadge, "חסר", "tombstone badge is translated into Hebrew (חסר)");
  assert.equal(result.tombDesc, "חסר", "aria-description is translated into Hebrew (חסר)");
});

test("in-place rename opens on F2 and pencil, commits on Enter, and does NOT open on double-click", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const row = treeDetails.querySelector('[data-node-id="panel:tree"]');
    row.focus();

    // 1. Double click should NOT open rename input (C4: double-click descends)
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await window.__frame();
    const hasInputAfterDblClick = !!treeDetails.querySelector(".uikit-ins-tree-inline-input");

    // 2. F2 should open rename input
    const targetRow = treeDetails.querySelector('[data-node-id="panel:tree"]');
    targetRow.focus();
    targetRow.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    await window.__frame();
    const inputAfterF2 = treeDetails.querySelector(".uikit-ins-tree-inline-input");
    const inputOpened = !!inputAfterF2;

    // 3. Edit and commit
    if (inputAfterF2) {
      inputAfterF2.value = "Custom Scene Tree";
      inputAfterF2.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await window.__frame();
    }

    const updatedRow = treeDetails.querySelector('[data-node-id="panel:tree"]');
    const updatedLabel = updatedRow ? updatedRow.querySelector(".uikit-ins-tree-label")?.textContent.trim() : "";

    return {
      hasInputAfterDblClick,
      inputOpened,
      updatedLabel,
    };
  });

  assert.equal(result.hasInputAfterDblClick, false, "double-click did not open rename input");
  assert.equal(result.inputOpened, true, "F2 opened inline rename input");
  assert.equal(result.updatedLabel, "Custom Scene Tree", "Enter committed rename");
});

test("tree icon button opens visual icon picker popover and updates icon", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const row = treeDetails.querySelector('[data-node-id="panel:tree"]');
    const iconBtn = row.closest(".uikit-ins-tree-item-wrap").querySelector(".uikit-ins-tree-icon-btn");
    iconBtn.click();
    await window.__frame();

    const picker = document.querySelector(".uikit-ins-icon-picker");
    const pickerOpened = !!picker;

    let selectedIcon = null;
    if (picker) {
      // Find a button in the icon picker grid
      const firstIconBtn = picker.querySelector(".uikit-ins-icon-btn");
      if (firstIconBtn) {
        selectedIcon = firstIconBtn.dataset.iconName;
        firstIconBtn.click();
        await window.__frame();
      }
    }

    const pickerClosed = !document.querySelector(".uikit-ins-icon-picker");
    const updatedNode = window.__ui.doc.nodes["panel:tree"];

    return {
      pickerOpened,
      pickerClosed,
      selectedIcon,
      nodeIcon: updatedNode ? updatedNode.icon : null,
    };
  });

  assert.equal(result.pickerOpened, true, "icon button opened icon picker popover");
  assert.equal(result.pickerClosed, true, "selecting icon closed picker popover");
  assert.equal(result.nodeIcon, result.selectedIcon, "selected icon recorded in document");
});

test("role='tree' hierarchy contains only role='none', 'presentation', or 'group' between tree and treeitems", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const treeList = document.querySelector('[role="tree"]');
    const treeItems = [...treeList.querySelectorAll('[role="treeitem"]')];
    const invalidIntermediates = [];
    const ALLOWED_ROLES = new Set(["none", "presentation", "group"]);

    for (const item of treeItems) {
      let cur = item.parentElement;
      while (cur && cur !== treeList) {
        const r = cur.getAttribute("role");
        if (!r || !ALLOWED_ROLES.has(r)) {
          invalidIntermediates.push({
            itemId: item.dataset.nodeId,
            tagName: cur.tagName.toLowerCase(),
            className: cur.className,
            role: r,
          });
        }
        cur = cur.parentElement;
      }
    }

    return {
      itemCount: treeItems.length,
      invalidIntermediates,
      ownedRoles: [...treeList.children].map((c) => c.getAttribute("role")),
      extraButtons: treeList.querySelectorAll(":scope > button").length,
    };
  });

  assert.ok(result.itemCount > 0, "found treeitems in tree");
  assert.deepEqual(result.invalidIntermediates, [], "every element between tree and treeitem has valid role");
  for (const role of result.ownedRoles) {
    assert.ok(role === "none" || role === "presentation" || role === "group" || role === "treeitem",
      "role=tree owns only treeitems/groups/none, not " + role);
  }
  assert.equal(result.extraButtons, 0, "action buttons are not direct children of role=tree");
});

/* Interactive content must not nest. Each row carries controls of its own —
 * the icon opens a picker, the pencil renames, the arrow resets — and while the
 * row itself was a <button> every one of those was a button inside a button:
 * invalid HTML whose parsing and accessibility-tree behaviour are undefined,
 * and no amount of correct ARIA on top of it helps.
 *
 * Asserted as the rule rather than as "the row is a div", so it still holds for
 * whichever control is added next and wherever it is put. */
test("no interactive element in the tree is nested inside another", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const list = document.querySelector(".uikit-ins-tree-list");
    /* Natively interactive elements only. A focusable CONTAINER holding
       focusable children is the composite-widget pattern every file tree uses
       — the roving tabindex is what makes one row the tab stop — and it is
       legal. What is not legal, and what this row used to do, is put a real
       <button> inside another one. */
    const INTERACTIVE = "button, a[href], input, select, textarea";
    const offenders = [];
    for (const el of list.querySelectorAll(INTERACTIVE)) {
      const outer = el.parentElement && el.parentElement.closest(INTERACTIVE);
      if (outer && list.contains(outer)) {
        offenders.push(el.className + " inside " + outer.className);
      }
    }
    return {
      rows: list.querySelectorAll('[role="treeitem"]').length,
      rowTags: [...new Set([...list.querySelectorAll('[role="treeitem"]')].map((r) => r.tagName.toLowerCase()))],
      controls: list.querySelectorAll("button").length,
      offenders,
      rowsWithIcon: [...list.querySelectorAll('[role="treeitem"]')].filter((r) => r.querySelector(".uikit-ins-tree-icon")).length,
      tabStops: [...list.querySelectorAll("button, [tabindex]")].filter((el) => el.tabIndex >= 0).length,
    };
  });

  assert.ok(result.rows > 0, "the tree has rows to check");
  assert.ok(result.controls >= result.rows, "and every row carries controls of its own");
  assert.deepEqual(result.rowTags, ["div"],
    "a treeitem that carries controls cannot itself be a button");
  assert.deepEqual(result.offenders, [],
    "no interactive element sits inside another: " + JSON.stringify(result.offenders));
  assert.equal(result.rowsWithIcon, result.rows, "icon/pencil/reset live inside the treeitem");
  assert.equal(result.tabStops, 1, "roving tabindex leaves one tab stop in the tree");
});

test("Kanban tree drag-and-drop drives seams, container highlight, dwell expansion, and drop", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const list = document.querySelector(".uikit-ins-tree-list");
    const getRow = (id) => list.querySelector(`[data-node-id="${id}"]`);

    // Collapse n:right if currently expanded so we can test dwell expansion
    const initialRightRow = getRow("n:right");
    const rightMark = initialRightRow ? initialRightRow.querySelector(".uikit-ins-tree-mark") : null;
    if (initialRightRow && initialRightRow.getAttribute("aria-expanded") === "true" && rightMark) {
      rightMark.click();
      await window.__frame();
    }
    const rightExpandedBefore = getRow("n:right")?.getAttribute("aria-expanded");

    // 1. Pointerdown on dragRow (panel:tree)
    const dragRow = getRow("panel:tree");
    if (dragRow) dragRow.scrollIntoView({ block: "nearest" });
    await window.__frame();
    const rDrag = dragRow ? dragRow.getBoundingClientRect() : null;

    if (dragRow && rDrag) {
      dragRow.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, button: 0,
        clientX: rDrag.left + 20, clientY: rDrag.top + rDrag.height / 2, pointerType: "mouse",
      }));

      // Move slightly past threshold (4px for mouse)
      document.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, cancelable: true,
        clientX: rDrag.left + 20, clientY: rDrag.top + rDrag.height / 2 + 10, pointerType: "mouse",
      }));
    }

    const isDraggingBefore = dragRow ? dragRow.classList.contains("is-dragging") : false;
    const isListDragging = list ? list.classList.contains("is-tree-dragging") : false;

    // 2. Hover over top third of target row (n:topbar) -> is-before seam
    const targetRow = getRow("n:topbar");
    const rTarget = targetRow ? targetRow.getBoundingClientRect() : null;

    if (rTarget) {
      document.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, cancelable: true,
        clientX: rTarget.left + 20, clientY: rTarget.top + rTarget.height * 0.15, pointerType: "mouse",
      }));
    }
    const dropLineBefore = document.querySelector(".uikit-ins-tree-drop-line");
    const dropLineBeforeClass = dropLineBefore ? dropLineBefore.className : "";
    const dropLineBeforeDepth = dropLineBefore ? dropLineBefore.style.getPropertyValue("--uikit-tree-depth") : "";

    // 3. Hover over bottom third of target row (n:topbar) -> is-after seam
    const targetRowBottom = getRow("n:topbar");
    const rTargetBottom = targetRowBottom ? targetRowBottom.getBoundingClientRect() : null;
    if (rTargetBottom) {
      document.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, cancelable: true,
        clientX: rTargetBottom.left + 20, clientY: rTargetBottom.top + rTargetBottom.height * 0.85, pointerType: "mouse",
      }));
    }

    const dropLineAfter = document.querySelector(".uikit-ins-tree-drop-line");
    const dropLineAfterClass = dropLineAfter ? dropLineAfter.className : "";

    // 4. Hover over middle third of collapsed container (n:right) -> drop-inside highlight + dwell timer
    const rightRow = getRow("n:right");
    const rRight = rightRow ? rightRow.getBoundingClientRect() : null;

    if (rRight) {
      document.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, cancelable: true,
        clientX: rRight.left + 20, clientY: rRight.top + rRight.height * 0.5, pointerType: "mouse",
      }));
    }

    const isDropInside = rightRow ? rightRow.classList.contains("uikit-ins-tree-drop-inside") : false;

    // 5. Wait 650ms for dwell timer to expand collapsed container
    await new Promise((resolve) => setTimeout(resolve, 650));
    await window.__frame();

    const rightExpandedAfterDwell = getRow("n:right")?.getAttribute("aria-expanded");

    // 6. Drop inside n:right on pointerup
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0 }));
    await window.__frame();

    const isDraggingAfter = !!document.querySelector(".is-dragging");
    const isListDraggingAfter = list ? list.classList.contains("is-tree-dragging") : false;
    const rightKidsAfter = (window.__ui.doc.nodes["n:right"]?.children || []).includes("panel:tree");

    return {
      isDraggingBefore,
      isListDragging,
      dropLineBeforeClass,
      dropLineBeforeDepth,
      dropLineAfterClass,
      isDropInside,
      rightExpandedBefore,
      rightExpandedAfterDwell,
      isDraggingAfter,
      isListDraggingAfter,
      rightKidsAfter,
    };
  });

  assert.equal(result.isDraggingBefore, true, "dragged row gains is-dragging class");
  assert.equal(result.isListDragging, true, "tree list gains is-tree-dragging class");
  assert.match(result.dropLineBeforeClass, /is-before/, "top third hover shows is-before drop line");
  assert.equal(result.dropLineBeforeDepth, "1", "drop line depth matches target row depth");
  assert.match(result.dropLineAfterClass, /is-after/, "bottom third hover shows is-after drop line");
  assert.equal(result.isDropInside, true, "middle third hover highlights container with drop-inside");
  assert.equal(result.rightExpandedBefore, "false", "container was collapsed before dwell");
  assert.equal(result.rightExpandedAfterDwell, "true", "600ms dwell expanded the container");
  assert.equal(result.isDraggingAfter, false, "is-dragging removed after drop");
  assert.equal(result.isListDraggingAfter, false, "is-tree-dragging removed after drop");
  assert.equal(result.rightKidsAfter, true, "dropping inside appended panel:tree to n:right");
});

test("tree drag of a sibling onto the next row's lower half inserts immediately after it", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const list = document.querySelector(".uikit-ins-tree-list");
    const kids = () => (window.__ui.doc.nodes["n:app"].children || []).slice();
    const before = kids();

    const topbar = list.querySelector('[data-node-id="n:topbar"]');
    const left = list.querySelector('[data-node-id="n:left"]');
    const rFrom = topbar.getBoundingClientRect();
    const rLeft = left.getBoundingClientRect();

    topbar.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, button: 0,
      clientX: rFrom.left + 20, clientY: rFrom.top + rFrom.height / 2, pointerType: "mouse",
    }));
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, cancelable: true,
      clientX: rFrom.left + 20, clientY: rFrom.top + rFrom.height / 2 + 10, pointerType: "mouse",
    }));

    // Upper half of n:left — "leave topbar where it is"
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, cancelable: true,
      clientX: rLeft.left + 20, clientY: rLeft.top + rLeft.height * 0.15, pointerType: "mouse",
    }));
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0 }));
    await window.__frame();
    const afterNoop = kids();

    const topbar2 = list.querySelector('[data-node-id="n:topbar"]');
    const rFrom2 = topbar2.getBoundingClientRect();
    topbar2.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, button: 0,
      clientX: rFrom2.left + 20, clientY: rFrom2.top + rFrom2.height / 2, pointerType: "mouse",
    }));
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, cancelable: true,
      clientX: rFrom2.left + 20, clientY: rFrom2.top + rFrom2.height / 2 + 10, pointerType: "mouse",
    }));
    const left2 = list.querySelector('[data-node-id="n:left"]').getBoundingClientRect();
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, cancelable: true,
      clientX: left2.left + 20, clientY: left2.top + left2.height * 0.85, pointerType: "mouse",
    }));
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0 }));
    await window.__frame();

    return { before, afterNoop, after: kids() };
  });

  assert.deepEqual(result.afterNoop, result.before,
    "dropping on the next sibling's top half leaves the order alone");
  assert.equal(result.after[0], "n:left");
  assert.equal(result.after[1], "n:topbar",
    "dropping on n:left's lower half puts the topbar immediately under it, not after n:right");
});

test("Kanban tree drag-and-drop refuses illegal targets and preserves document", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const list = document.querySelector(".uikit-ins-tree-list");

    // Attempt illegal drag: dropping container n:topbar onto its own child panel:tb-start
    const topbarRow = list.querySelector('[data-node-id="n:topbar"]');
    const rTopbar = topbarRow.getBoundingClientRect();

    topbarRow.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, button: 0,
      clientX: rTopbar.left + 20, clientY: rTopbar.top + rTopbar.height / 2, pointerType: "mouse",
    }));
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, cancelable: true,
      clientX: rTopbar.left + 20, clientY: rTopbar.top + rTopbar.height / 2 + 10, pointerType: "mouse",
    }));

    // Hover over panel:tb-start in middle third
    const startRow = list.querySelector('[data-node-id="panel:tb-start"]');
    const rStart = startRow.getBoundingClientRect();
    document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, cancelable: true,
      clientX: rStart.left + 20, clientY: rStart.top + rStart.height * 0.5, pointerType: "mouse",
    }));

    const hasDropInsideOnIllegal = startRow.classList.contains("uikit-ins-tree-drop-inside");
    const hasDropLineOnIllegal = !!document.querySelector(".uikit-ins-tree-drop-line");

    const docBefore = JSON.stringify(window.__ui.doc);

    // Drop on illegal target
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0 }));
    await window.__frame();

    const docAfter = JSON.stringify(window.__ui.doc);

    return {
      hasDropInsideOnIllegal,
      hasDropLineOnIllegal,
      docUnchanged: docBefore === docAfter,
    };
  });

  assert.equal(result.hasDropInsideOnIllegal, false, "illegal target does not show drop-inside highlight");
  assert.equal(result.hasDropLineOnIllegal, false, "illegal target does not show drop line");
  assert.equal(result.docUnchanged, true, "illegal drop leaves document identical");
});

/* The tree hangs pointermove/pointerup on the DOCUMENT, because a drag that
 * starts on a row does not stay over it. Those two are the only listeners in
 * the editor outside the designer's own add/remove pair, so they are the two
 * that can outlive the panel: createTreeBrowser runs afresh every time
 * customize mode opens, and the inspector's unmount only removes the DOM.
 *
 * There is no gesture that shows the leak. A stale handler returns at its
 * first line because its `treeDrag` is null, and closing the panel ends any
 * drag that was in flight, so even a press held across teardown comes out
 * clean. The cost is memory — a retained closure holding a detached tree, one
 * per session — which is why this is counted rather than provoked.
 */
test("the tree lets go of the document when customize mode closes", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ui = window.__ui;

    /* Over one complete open-and-close, every document listener the editor
       takes out it must put back. Close the session this page arrived in
       first: its listeners were taken before the spy existed, and counting
       only their removal would show a phantom imbalance the wrong way. */
    await ui.edit(false);

    const added = {};
    const removed = {};
    const origAdd = document.addEventListener;
    const origRemove = document.removeEventListener;
    document.addEventListener = function (type, fn, o) {
      added[type] = (added[type] || 0) + 1;
      return origAdd.call(this, type, fn, o);
    };
    document.removeEventListener = function (type, fn, o) {
      removed[type] = (removed[type] || 0) + 1;
      return origRemove.call(this, type, fn, o);
    };

    await ui.edit(true);
    await window.__frame();
    const opened = !!document.querySelector(".uikit-ins-tree");
    await ui.edit(false);

    document.addEventListener = origAdd;
    document.removeEventListener = origRemove;

    const net = {};
    for (const type of new Set([...Object.keys(added), ...Object.keys(removed)])) {
      net[type] = (added[type] || 0) - (removed[type] || 0);
    }
    return { opened, pointermove: net.pointermove || 0, pointerup: net.pointerup || 0 };
  });

  assert.equal(result.opened, true, "control: the cycle really did build a tree to tear down");
  assert.equal(result.pointermove, 0,
    "every document pointermove listener taken during the session was handed back");
  assert.equal(result.pointerup, 0, "and every pointerup one");
});
