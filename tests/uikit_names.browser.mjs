/* Verification that the layout structure browser presents human-intuitive English names
 * rather than HTML tags, CSS classes, or internal IDs.
 *
 * Requirements:
 * - No tree row or inspector label matches a raw HTML tag name (div, button, etc.)
 * - No label contains internal colon-prefixed IDs (n:topbar, panel:tree, act:save)
 * - Every node has a normalized icon and a friendly role pill
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

async function customizing() {
  if (!shared) shared = await openPage({ width: 1440, height: 900 });
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

const FORBIDDEN_TAGS = new Set([
  "DIV", "BUTTON", "SPAN", "SECTION", "NAV", "HEADER", "MAIN", "A", "UL", "LI",
  "div", "button", "span", "section", "nav", "header", "main", "a", "ul", "li",
]);

test("structure browser rows contain plain English names, not HTML code or internal IDs", opts, async () => {
  const page = await customizing();
  const rows = await page.eval(async () => {
    const treeDetails = document.querySelector(".uikit-ins-tree");
    treeDetails.open = true;
    treeDetails.dispatchEvent(new Event("toggle"));
    await window.__frame();

    const rowEls = [...treeDetails.querySelectorAll(".uikit-ins-tree-row")];
    return rowEls.map((el) => {
      const label = el.querySelector(".uikit-ins-tree-label");
      const role = el.querySelector(".uikit-ins-tree-role");
      const icon = el.querySelector(".uikit-ins-tree-icon");
      return {
        id: el.dataset.nodeId,
        labelText: label ? label.textContent.trim() : "",
        roleText: role ? role.textContent.trim() : "",
        hasIcon: !!icon,
      };
    });
  });

  assert.ok(rows.length >= 5, "tree contains rows");

  for (const r of rows) {
    // 1. Must not contain colons (e.g. n:topbar, panel:tree, act:save)
    assert.ok(
      !r.labelText.includes(":"),
      `Row for ${r.id} has colon in label: "${r.labelText}"`
    );

    // 2. Must not be a raw HTML tag
    assert.ok(
      !FORBIDDEN_TAGS.has(r.labelText),
      `Row for ${r.id} is an HTML tag: "${r.labelText}"`
    );

    // 3. Must not look like a CSS class or selector
    assert.ok(
      !r.labelText.startsWith(".") && !r.labelText.startsWith("#"),
      `Row for ${r.id} starts with CSS selector prefix: "${r.labelText}"`
    );

    // 4. Must have a friendly role
    assert.ok(
      r.roleText.length > 0,
      `Row for ${r.id} has no friendly role text`
    );
    assert.ok(
      !r.roleText.includes(":"),
      `Row for ${r.id} has colon in role text: "${r.roleText}"`
    );

    // 5. Must have an icon
    assert.ok(r.hasIcon, `Row for ${r.id} has normalized icon container`);
  }
});

test("inspector header and breadcrumbs show plain English titles and normalized icons", opts, async () => {
  const page = await customizing();
  const info = await page.eval(async () => {
    const ed = window.__ed;
    ed.command("select", { id: "panel:tree" });
    await window.__frame();

    const headerTitle = document.querySelector(".uikit-ins-selection-title");
    const kind = document.querySelector(".uikit-ins-kind");
    const headerIcon = document.querySelector(".uikit-ins-header-icon");
    const crumbs = [...document.querySelectorAll(".uikit-ins-crumb")].map((c) => c.textContent.trim());

    return {
      title: headerTitle ? headerTitle.textContent.trim() : "",
      kind: kind ? kind.textContent.trim() : "",
      hasHeaderIcon: !!headerIcon,
      crumbs,
    };
  });

  assert.ok(!info.title.includes(":"), `Header title has colon: "${info.title}"`);
  assert.ok(!info.kind.includes(":"), `Kind has colon: "${info.kind}"`);
  assert.ok(!FORBIDDEN_TAGS.has(info.title), `Header title is HTML tag: "${info.title}"`);
  assert.ok(info.hasHeaderIcon, "Header has icon");
  assert.ok(info.crumbs.length >= 2, "Breadcrumbs has multiple ancestors");
  for (const crumb of info.crumbs) {
    assert.ok(!crumb.includes(":"), `Crumb has colon: "${crumb}"`);
    assert.ok(!FORBIDDEN_TAGS.has(crumb), `Crumb is HTML tag: "${crumb}"`);
  }
});
