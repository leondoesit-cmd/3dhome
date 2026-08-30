/* Browser layout tests for the Fold inner / iPad dock-rail posture.
 *
 * Verifies that roomy compact devices (short edge >= 520, long edge >= 700 with touch)
 * receive the `dock-rail` posture:
 * - Planner panels stand as docked side columns beside the canvas instead of full-width sheets.
 * - Modeler Tree stands as a persistent side column while secondary commands use floating sheets.
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

test("dock-rail posture: Fold inner (717x829) establishes side columns for Planner", opts, async () => {
  if (!shared) shared = await openPage({ width: 717, height: 829, touch: true, mobile: true });
  else await shared.resize(717, 829, { touch: true, mobile: true });
  await shared.goto("/");

  const posture = await shared.eval(() => {
    return {
      compact: document.body.classList.contains("compact-nav"),
      dockRail: document.body.classList.contains("dock-rail"),
      sheetDrawers: document.body.classList.contains("sheet-drawers"),
    };
  });

  assert.equal(posture.compact, true, "717x829 touch must have compact-nav");
  assert.equal(posture.dockRail, true, "717x829 touch must have dock-rail");
  assert.equal(posture.sheetDrawers, false, "717x829 touch must not be sheet-drawers");

  // Toggle left sidebar and verify it stands as a column (position is not fixed)
  const leftStyle = await shared.eval(() => {
    document.body.classList.add("show-left");
    const sidebar = document.getElementById("left-sidebar");
    const cs = window.getComputedStyle(sidebar);
    const rect = sidebar.getBoundingClientRect();
    return {
      position: cs.position,
      display: cs.display,
      width: rect.width,
      left: rect.left,
    };
  });

  assert.notEqual(leftStyle.position, "fixed", "dock-rail left sidebar must not be a fixed bottom sheet");
  assert.ok(leftStyle.width >= 200, "dock-rail left sidebar width must be a column");
});

test("dock-rail posture: iPad (768x1024) establishes side columns for Modeler Tree", opts, async () => {
  if (!shared) shared = await openPage({ width: 768, height: 1024, touch: true, mobile: true });
  else await shared.resize(768, 1024, { touch: true, mobile: true });
  await shared.goto("/");

  // Launch Modeler
  await shared.eval(() => {
    document.getElementById("openModelerTop")?.click();
  });
  await shared.waitUntil(() => {
    const el = document.getElementById("modeler");
    return !!el && window.getComputedStyle(el).display !== "none";
  });

  const treeState = await shared.eval(() => {
    document.getElementById("modeler")?.classList.add("md-tree-on");
    const tree = document.querySelector("#modeler .md-left");
    const cs = tree ? window.getComputedStyle(tree) : null;
    const rect = tree ? tree.getBoundingClientRect() : null;
    return {
      exists: !!tree,
      display: cs?.display,
      width: rect ? rect.width : 0,
    };
  });

  assert.equal(treeState.exists, true, "Modeler left tree panel must exist");
  assert.notEqual(treeState.display, "none", "Tree panel must be visible in dock-rail when tree is on");
  assert.ok(treeState.width >= 200, "Tree panel width must be column-sized in dock-rail");
});
