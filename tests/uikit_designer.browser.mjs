/* Phase-5 gate: the full designer against the real planner chrome.
 *
 * Resize, group, the inspector and the two kinds of rename. The arithmetic
 * behind each is unit-tested without a DOM; what only a browser can answer is
 * whether a size the user set actually beats the app's own stylesheet, whether
 * a group survives being made out of the host's own elements, and whether the
 * panel that edits all this can be clicked at all.
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

async function designing(options = {}) {
  if (!shared) shared = await openPage({ width: 1440, height: 900 });
  else await shared.resize(1440, 900);
  /* Two loads on purpose. Opening customize mode SETS mf_uikit, and
     localStorage survives a reload — so on the second test onwards main.js
     would auto-mount uikit during boot, and the "pristine" baseline captured
     below would already carry uikit's attributes. Clearing the flag and
     reloading is what makes every test in this file start from the shipped
     page rather than from whatever the last one left behind. */
  await shared.goto("/");
  await shared.eval(() => {
    localStorage.removeItem("mf_uikit");
    localStorage.removeItem("home3d_uikit:planner");
  });
  await shared.goto("/");
  await shared.eval(async () => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    localStorage.removeItem("home3d_uikit:planner");
    window.__ids = (sel) => [...document.querySelector(sel).children]
      .map((e) => e.getAttribute("data-uikit-id") || e.id || e.className);
    // Flush the guide's queued model read before taking a markup baseline.
    // A later frame may otherwise update area/door options during this test.
    (await import("/js/ui_planning_guide.js")).renderPlanningGuide();
    /* Captured BEFORE anything mounts. Mounting reorders the whitespace text
       nodes between the panels — syncChildren inserts elements ahead of the
       cursor and the blank text drifts to the end — so a baseline taken after
       mount is not the markup the app shipped, and comparing against it would
       let a teardown that failed to restore that interleaving pass. */
    window.__pristineLeft = document.getElementById("left-sidebar").outerHTML;
    window.__runAction("uikitCustomize");
    for (let i = 0; i < 400 && !document.querySelector(".uikit-ins"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const host = await import("/js/uikit_host/index.js");
    window.__ui = host.activeUIKit();
    window.__ed = window.__ui.editor;
    window.__frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    /* The first child of a toolbar column that this build actually renders. */
    window.__visibleChild = (parent) => (window.__ui.doc.nodes[parent].children || []).find((id) => {
      const el = document.querySelector('[data-uikit-id="' + CSS.escape(id) + '"]');
      const r = el && el.getBoundingClientRect();
      return !!r && r.width > 8 && r.height > 8;
    });
    if (!window.__ed) throw new Error("customize mode never opened");
  });
  if (options.openTree !== false) {
    await shared.eval(() => {
      const tree = document.querySelector(".uikit-ins-tree");
      if (tree && !tree.open) {
        tree.open = true;
        tree.dispatchEvent(new Event("toggle"));
      }
    });
  }
  return shared;
}

test("a user's size beats the app's own stylesheet", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const ui = window.__ui;
    const bar = document.getElementById("left-sidebar");
    const cssWidth = getComputedStyle(bar).width; // #left-sidebar { width: 300px }

    ui.apply("Resize", ops.resize(ui.doc, { id: "n:left", size: { w: 420 } }));
    ui.refreshNow();
    const after = getComputedStyle(bar).width;

    ui.undo();
    ui.refreshNow();
    return {
      cssWidth, after, back: getComputedStyle(bar).width,
      sizedAttr: bar.getAttribute("data-uikit-sized"),
      heightUntouched: !bar.style.height,
    };
  });

  assert.equal(result.cssWidth, "300px", "the app's own rule, by id");
  assert.equal(result.after, "420px", "and the user's size wins over it");
  assert.equal(result.back, "300px", "undo hands it back to the stylesheet");
  assert.equal(result.sizedAttr, null, "and the marker goes with it");
  assert.ok(result.heightUntouched, "resizing width never pinned a height");
});

test("a resize is clamped by the constraints the host declared", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const ui = window.__ui;
    const entry = ui.registry.get("panel:tree"); // { resize: "y", minH: 120 }
    const c = entry.constraints;
    ui.apply("Crush", ops.resize(ui.doc, {
      id: "panel:tree", size: { h: 4 },
      min: { w: c.minW, h: c.minH }, max: { w: c.maxW, h: c.maxH },
    }));
    ui.refreshNow();
    return { constraints: c, stored: ui.doc.nodes["panel:tree"].size };
  });

  assert.equal(result.constraints.resize, "y");
  assert.deepEqual(result.stored, { h: result.constraints.minH },
    "a panel cannot be crushed below the floor its host set");
});

test("grips are free on both axes unless the host pinned one", opts, async () => {
  const page = await designing();
  const result = await page.eval(() => {
    const ed = window.__ed;
    const grips = () => [...document.querySelectorAll("[data-uikit-grip]")]
      .map((e) => e.getAttribute("data-uikit-grip")).sort();

    ed.command("select", { id: "n:left" });
    const sidebar = grips();
    ed.command("select", { id: "panel:tree" });
    const pane = grips();
    ed.command("select", { id: "panel:tb-start" });
    const gridColumn = grips();
    return { sidebar, pane, gridColumn };
  });

  assert.deepEqual(result.sidebar, ["e", "n", "ne", "nw", "s", "se", "sw", "w"],
    "n:left declares no axis, so every edge and corner is on offer");
  assert.deepEqual(result.pane, ["n", "s"],
    "a pane whose host pinned resize:y still offers only its own two");
  assert.deepEqual(result.gridColumn, [],
    "a topbar grid track offers nothing, because the host said resize:none");
});

test("the right inspector is resizable but cannot be hidden", opts, async () => {
  const page = await designing();
  const result = await page.eval(() => {
    const ed = window.__ed;
    ed.command("select", { id: "n:right" });
    const grips = [...document.querySelectorAll("[data-uikit-grip]")]
      .map((element) => element.getAttribute("data-uikit-grip")).sort();
    const width = document.querySelector('.uikit-ins-num[aria-label="Width in pixels"]');
    width.value = "900";
    width.dispatchEvent(new Event("input", { bubbles: true }));
    const hideResult = ed.command("hide");
    ed.command("select", { id: "panel:inspectorMain" });
    const mainHideDisabled = [...document.querySelectorAll('.uikit-ins-check input[type="checkbox"]')]
      .find((input) => input.parentElement.textContent.includes("Hidden")).disabled;
    const mainHideResult = ed.command("hide");
    return {
      grips,
      width: getComputedStyle(document.getElementById("right-inspector")).width,
      stored: window.__ui.doc.nodes["n:right"].size,
      hidden: !!window.__ui.doc.nodes["n:right"].hidden,
      hideResult,
      mainHideDisabled,
      mainHideResult,
      note: document.querySelector(".uikit-ins-feedback").textContent,
    };
  });
  assert.deepEqual(result.grips, ["e", "w"]);
  assert.equal(result.width, "500px");
  assert.deepEqual(result.stored, { w: 500 });
  assert.equal(result.hidden, false);
  assert.equal(result.hideResult, false);
  assert.equal(result.mainHideDisabled, true);
  assert.equal(result.mainHideResult, false);
  assert.match(result.note, /remain available/i);
});

test("the customize inspector switches edges when it would cover the selection", opts, async () => {
  const page = await designing();
  const result = await page.eval(() => {
    const ed = window.__ed;
    const ins = document.querySelector(".uikit-ins");
    ed.command("select", { id: "n:right" });
    const moved = ins.classList.contains("uikit-ins-at-start");
    const movedLeft = ins.getBoundingClientRect().left;
    ed.command("select", { id: "n:left" });
    const returned = !ins.classList.contains("uikit-ins-at-start");
    const returnedLeft = ins.getBoundingClientRect().left;
    return { moved, movedLeft, returned, returnedLeft };
  });
  assert.equal(result.moved, true);
  assert.ok(result.movedLeft < result.returnedLeft);
  assert.equal(result.returned, true);
});

test("dragging a grip resizes, in one undo step", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const bar = document.getElementById("left-sidebar");
    ed.command("select", { id: "n:left" });
    const grip = document.querySelector('[data-uikit-grip="e"]');
    const g = grip.getBoundingClientRect();
    const y = g.top + g.height / 2;
    const startX = g.left + g.width / 2;

    const at = (x) => ({ clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 });
    document.dispatchEvent(new PointerEvent("pointerdown", at(startX)));
    for (let dx = 10; dx <= 60; dx += 10) {
      document.dispatchEvent(new PointerEvent("pointermove", at(startX + dx)));
    }
    document.dispatchEvent(new PointerEvent("pointerup", at(startX + 60)));

    const width = getComputedStyle(bar).width;
    const steps = window.__ui.history.steps().length;
    window.__ui.undo();
    window.__ui.refreshNow();
    return { width, steps, back: getComputedStyle(bar).width };
  });

  assert.equal(result.width, "360px", "300 + 60, from six pointermoves");
  assert.equal(result.steps, 2, "one starting state and ONE step for the whole drag");
  assert.equal(result.back, "300px", "a single undo takes the whole gesture back");
});

test("two siblings become a real group, and ungroup puts them back in place", opts, async () => {
  const page = await designing();
  const result = await page.eval(() => {
    const ed = window.__ed;
    const before = window.__ids("#left-sidebar");

    ed.command("select", { id: "panel:smarthome" });
    ed.command("select", { id: "panel:mep", additive: true });
    ed.command("group");

    const grouped = window.__ids("#left-sidebar");
    const groupId = ed.selection()[0];
    const groupEl = document.querySelector('[data-uikit-id="' + CSS.escape(groupId) + '"]');
    const inside = [...groupEl.children].map((e) => e.getAttribute("data-uikit-id"));

    ed.command("ungroup");
    return {
      before, grouped, groupId, inside,
      after: window.__ids("#left-sidebar"),
      created: groupEl.classList.contains("uikit-node"),
    };
  });

  assert.equal(result.grouped.length, result.before.length - 1, "two panes became one group");
  assert.ok(result.groupId.startsWith("g:user"));
  assert.deepEqual(result.inside, ["panel:smarthome", "panel:mep"],
    "in the order they sat, not the order they were clicked");
  assert.ok(result.created, "the group is an element uikit made, not a borrowed one");
  assert.deepEqual(result.after, result.before, "ungroup splices them back where they were");
});

test("grouping refuses what it cannot do, and says why", opts, async () => {
  const page = await designing();
  const result = await page.eval(() => {
    const ed = window.__ed;
    const note = () => document.querySelector(".uikit-ins-feedback").textContent;

    ed.command("select", { id: "panel:tree" });
    ed.command("group");
    const one = note();

    // a sidebar pane and a topbar column live in different parents
    ed.command("select", { id: "panel:tree" });
    ed.command("select", { id: "panel:tb-start", additive: true });
    ed.command("group");
    const across = note();

    ed.command("select", { id: "n:left" });
    ed.command("ungroup");
    const bound = note();
    return { one, across, bound, order: window.__ids("#left-sidebar") };
  });

  assert.match(result.one, /two or more/i, "one thing is not a group");
  assert.match(result.across, /different groups/i);
  assert.match(result.bound, /not a group/i, "#left-sidebar is the host's region, not a group");
});

test("the inspector edits the selected node, and cannot be clicked through", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    ed.command("select", { id: "panel:tree" });
    const ins = document.querySelector(".uikit-ins");
    const box = ins.getBoundingClientRect();

    // a click on the panel must not reselect whatever it happens to cover
    const before = ed.selection().slice();
    document.dispatchEvent(new PointerEvent("pointerdown", {
      clientX: box.left + 8, clientY: box.top + 8, bubbles: true, cancelable: true, button: 0,
    }));
    const afterClick = ed.selection().slice();

    const label = ins.querySelector('[data-uikit-field="label"]');
    label.value = "My tree";
    label.dispatchEvent(new Event("input", { bubbles: true }));

    const icon = ins.querySelector('[data-uikit-field="icon"]');
    icon.value = "ph-star";
    icon.dispatchEvent(new Event("input", { bubbles: true }));

    return {
      before, afterClick,
      pointerEvents: getComputedStyle(ins).pointerEvents,
      label: window.__ui.doc.nodes["panel:tree"].label,
      icon: window.__ui.doc.nodes["panel:tree"].icon,
      tag: document.querySelector(".uikit-ed-tag").textContent,
      steps: window.__ui.history.steps().length,
    };
  });

  assert.deepEqual(result.afterClick, result.before, "clicking the inspector does not change the selection");
  assert.equal(result.pointerEvents, "auto", "and it is genuinely clickable");
  assert.equal(result.label, "My tree");
  assert.equal(result.icon, "ph-star");
  assert.equal(result.tag, "My tree", "the overlay label follows the rename");
  assert.equal(result.steps, 3, "typing a name is one step, not one per keystroke");
});

test("real inspector clicks and editing keys stay inside the inspector", opts, async () => {
  const page = await designing();
  const result = await page.eval(() => {
    const ed = window.__ed;
    ed.command("select", { id: "panel:tree" });
    const ins = document.querySelector(".uikit-ins");
    const name = ins.querySelector('[data-uikit-field="label"]');
    const hidden = [...ins.querySelectorAll('.uikit-ins-check input[type="checkbox"]')]
      .find((input) => input.parentElement.textContent.includes("Hidden"));

    /* HTMLElement.click() follows the real capture/target/bubble path. The old
       document-capture listener stopped it before the checkbox's change
       handler, which is exactly the browser behavior this test pins. */
    hidden.click();
    const hiddenAfterClick = !!window.__ui.doc.nodes["panel:tree"].hidden;
    hidden.click();

    name.focus();
    const before = ed.selection().slice();
    const order = window.__ids("#left-sidebar");
    const keys = {};
    for (const key of ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab"]) {
      const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      name.dispatchEvent(ev);
      keys[key] = ev.defaultPrevented;
    }

    return {
      hiddenAfterClick,
      hiddenAfterKeys: !!window.__ui.doc.nodes["panel:tree"].hidden,
      before,
      after: ed.selection(),
      order,
      orderAfter: window.__ids("#left-sidebar"),
      keys,
    };
  });

  assert.equal(result.hiddenAfterClick, true, "a real inspector click reaches its control");
  assert.equal(result.hiddenAfterKeys, false, "editing keys did not hide the selected node");
  assert.deepEqual(result.after, result.before, "Tab and arrows did not change canvas selection");
  assert.deepEqual(result.orderAfter, result.order, "arrows did not reorder the layout");
  for (const prevented of Object.values(result.keys)) assert.equal(prevented, false);
});

/* A rename that only uikit can see is not a rename.
 *
 * Before the labels contract, retitling a node changed the overlay tag, the
 * breadcrumb, the tree row and the inspector — and the button on screen still
 * said what it always had. The words live behind this app's data-i18n
 * attributes, so the host writes them; uikit says which element and what.
 */
/* An item carries several independent edits, and undoing one must not undo the
 * rest. A single "Reset to default" cannot express that, so each parameter has
 * its own arrow — and the arrow is only on screen when there is something to
 * undo, which makes the panel double as "what have I changed here?". */
test("each parameter resets on its own, and shows an arrow only when it is set", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    const node = () => ui.doc.nodes["panel:tree"];
    const shown = (key) => {
      const el = document.querySelector(".uikit-ins-" + key);
      return !!el && !el.hidden;
    };

    ed.command("select", { id: "panel:tree" });
    await window.__frame();
    const arrowsAtRest = ["labelReset", "iconReset", "hiddenReset"].map(() => null);
    const noneAtRest = !shown("reset-one");

    ed.command("retitle", { id: "panel:tree", label: "Outline", everywhere: false });
    ed.command("reicon", { id: "panel:tree", icon: "ph-tree-structure" });
    ed.command("setHidden", { id: "panel:tree", hidden: true });
    await window.__frame();
    const arrowsAfterEdits = document.querySelectorAll(".uikit-ins-reset-one:not([hidden])").length;

    // Reset ONE parameter and confirm the other two survive it.
    ed.command("resetField", { id: "panel:tree", field: "icon" });
    await window.__frame();
    const afterIconReset = {
      label: node().label,
      icon: Object.prototype.hasOwnProperty.call(node(), "icon"),
      hidden: node().hidden,
    };

    ed.command("resetField", { id: "panel:tree", field: "label" });
    await window.__frame();
    const afterLabelReset = {
      label: Object.prototype.hasOwnProperty.call(node(), "label"),
      hidden: node().hidden,
    };

    return { arrowsAtRest, noneAtRest, arrowsAfterEdits, afterIconReset, afterLabelReset };
  });

  assert.equal(result.noneAtRest, true, "an untouched item offers nothing to reset");
  assert.equal(result.arrowsAfterEdits, 3, "one arrow per parameter that was changed");
  assert.equal(result.afterIconReset.icon, false, "the icon went back");
  assert.equal(result.afterIconReset.label, "Outline", "and the rename did not go with it");
  assert.equal(result.afterIconReset.hidden, true, "nor did the hidden flag");
  assert.equal(result.afterLabelReset.label, false, "then the rename went back on its own");
  assert.equal(result.afterLabelReset.hidden, true, "leaving the hidden flag standing");
});

/* Where an item sits is not a field — it is its parent's child list — so it
   cannot be cleared like one, and once the item has moved the old list no
   longer mentions it. That is what uikit.defaults is for. */
test("an item can be sent back to the place the layout shipped it in", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    const placeOf = (id) => {
      for (const key of Object.keys(ui.doc.nodes)) {
        const kids = ui.doc.nodes[key].children;
        if (Array.isArray(kids) && kids.includes(id)) return key + ":" + kids.indexOf(id);
      }
      return null;
    };

    const home = placeOf("panel:tree");
    ed.command("select", { id: "panel:tree" });
    await window.__frame();
    const rowAtHome = document.querySelector(".uikit-ins-pos").hidden;

    ed.command("move", { id: "panel:tree", parent: "n:right", index: 0 });
    await window.__frame();
    const moved = placeOf("panel:tree");
    const rowAfterMove = !document.querySelector(".uikit-ins-pos").hidden;

    ed.command("resetPosition", { id: "panel:tree" });
    await window.__frame();
    const back = placeOf("panel:tree");

    // A reorder inside one container counts as moved too.
    ed.command("move", { id: "panel:tree", parent: "n:left", index: 0 });
    await window.__frame();
    const reordered = placeOf("panel:tree");
    ed.command("resetPosition", { id: "panel:tree" });
    await window.__frame();

    return { home, moved, rowAtHome, rowAfterMove, back, reordered, afterReorderReset: placeOf("panel:tree") };
  });

  assert.equal(result.rowAtHome, true, "an item in its original place says nothing about position");
  assert.notEqual(result.moved, result.home, "the move really moved it");
  assert.equal(result.rowAfterMove, true, "and the panel now offers to put it back");
  assert.equal(result.back, result.home, "which it does, to the same parent AND index");
  assert.notEqual(result.reordered, result.home, "a reorder inside one container also counts");
  assert.equal(result.afterReorderReset, result.home, "and is undone the same way");
});

/* The two Name rows have different reach, so they have different resets. This
   is the distinction the "Rename app text in this language" checkbox makes
   when you set it; before this it had no matching way to undo. */
test("resetting one item's name leaves an app-wide rename standing", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    const words = () => {
      const el = document.querySelector('[data-uikit-id="tab:structure"] [data-i18n]');
      return el ? el.textContent : null;
    };
    const key = "left_tab_structure";
    const overridden = () => {
      const text = ui.doc.overrides && ui.doc.overrides.text;
      const lang = ui.lang ? ui.lang() : "en";
      return !!(text && ((text[lang] && text[lang][key] != null) || (text["*"] && text["*"][key] != null)));
    };

    ed.command("retitle", { id: "tab:structure", label: "Everywhere", everywhere: true });
    await window.__frame();
    const afterEverywhere = { words: words(), stored: overridden() };

    ed.command("retitle", { id: "tab:structure", label: "Just this", everywhere: false });
    await window.__frame();
    const afterBoth = { words: words(), stored: overridden() };

    // The item reset must leave the app-wide rename alone.
    ed.command("resetNode", { id: "tab:structure" });
    await window.__frame();
    const afterItemReset = { words: words(), stored: overridden() };

    // And its own reset is what clears it.
    ed.command("resetText", { key });
    await window.__frame();
    const afterTextReset = { words: words(), stored: overridden() };

    return { afterEverywhere, afterBoth, afterItemReset, afterTextReset };
  });

  assert.equal(result.afterEverywhere.stored, true, "the everywhere rename was stored against the string");
  assert.equal(result.afterBoth.words, "Just this", "the per-item name wins on the item itself");
  assert.equal(result.afterItemReset.stored, true,
    "resetting the item did NOT delete the app-wide rename");
  assert.equal(result.afterItemReset.words, "Everywhere",
    "so the item falls back to it rather than to the shipped word");
  assert.equal(result.afterTextReset.stored, false, "and its own reset is what clears it");
});

/* A pinned menu was unreachable.
 *
 * A dropdown is open only while its node — or something inside it — is
 * selected. One click on a menu item resolved to whatever ancestor sat at the
 * current focus depth, usually the toolbar; selecting the toolbar unpinned the
 * menu; the menu closed; and the item was gone before a second click could
 * drill toward it. Nothing under File could ever be selected.
 */
test("clicking an item inside an open menu selects the item, and the menu stays open", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    ed.command("select", { id: "menu:file" });
    await window.__frame();

    const openAfterSelect = !!document.querySelector(".dropdown.open");
    const save = document.querySelector('[data-uikit-id="act:save"]');
    const r = save ? save.getBoundingClientRect() : null;
    if (!r || !r.width) return { error: "the menu item has no box to click" };

    const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, button: 0 };
    /* elementFromPoint has to reach the item for the click to mean anything;
       asserted so a failure says "the menu was covered", not "wrong node". */
    const hit = document.elementFromPoint(at.clientX, at.clientY);
    const hitId = hit && hit.closest("[data-uikit-id]")
      ? hit.closest("[data-uikit-id]").getAttribute("data-uikit-id") : null;

    document.dispatchEvent(new PointerEvent("pointerdown", at));
    document.dispatchEvent(new PointerEvent("pointerup", at));
    await window.__frame();

    return {
      openAfterSelect,
      hitId,
      selected: ed.selection().slice(),
      openAfterClick: !!document.querySelector(".dropdown.open"),
    };
  });

  assert.equal(result.error, undefined, result.error || "");
  assert.equal(result.openAfterSelect, true, "selecting the menu pins it open");
  assert.equal(result.hitId, "act:save", "and the item is what is under the pointer");
  assert.deepEqual(result.selected, ["act:save"], "one click selects the item, not an ancestor");
  assert.equal(result.openAfterClick, true, "and the menu is still open to click the next one");
});

/* Whose words a rename changes.
 *
 * The label contract walks the element's own data-i18n* attributes plus AT
 * MOST ONE labelled child, because a button keeps its words on a span next to
 * an icon. Walking every descendant instead is right for a button and
 * catastrophic for a container: renaming the toolbar's centre column set the
 * title of every control inside it to the same string. */
test("renaming a container changes nothing inside it", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const words = () => ({
      plan: (document.querySelector('[data-act="viewPlan"] [data-i18n]') || {}).textContent,
      view3d: (document.querySelector('[data-act="view3d"] [data-i18n]') || {}).textContent,
      walk: (document.querySelector("#walkBtn") || {}).title,
      search: (document.getElementById("toolSearchInput") || {}).placeholder,
    });

    const before = words();
    // A pill holding several labelled controls has no words of its own.
    ed.command("retitle", { id: "grp:viewModes", label: "Views", everywhere: false });
    await window.__frame();
    const afterPill = words();

    // Nor does a whole toolbar column.
    ed.command("retitle", { id: "panel:tb-center", label: "Middle", everywhere: false });
    await window.__frame();
    const afterColumn = words();

    // But a BUTTON still renames, which is the case the descendant walk exists for.
    ed.command("retitle", { id: "act:png2d", label: "Picture", everywhere: false });
    await window.__frame();
    const leafWords = (document.querySelector('[data-uikit-id="act:png2d"] [data-i18n]') || {}).textContent;

    return { before, afterPill, afterColumn, leafWords };
  });

  assert.deepEqual(result.afterPill, result.before,
    "renaming the view pill left Plan and 3D saying what they said");
  assert.deepEqual(result.afterColumn, result.before,
    "and renaming the whole column changed nothing inside it either");
  assert.equal(result.leafWords, "Picture",
    "while a button with one labelled span still renames");
});

test("renaming one item changes that element's own words, and only that element", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    const wordsOf = (id) => {
      const el = document.querySelector(`[data-uikit-id="${id}"]`);
      const span = el && el.querySelector("[data-i18n]");
      return span ? span.textContent : null;
    };

    const before = wordsOf("tab:structure");
    const siblingBefore = wordsOf("tab:library");

    ed.command("retitle", { id: "tab:structure", label: "Stru", everywhere: false });
    await window.__frame();
    const after = wordsOf("tab:structure");
    const siblingAfter = wordsOf("tab:library");
    const treeRow = document.querySelector('.uikit-ins-tree-row[data-node-id="tab:structure"] .uikit-ins-tree-label');
    const inTree = treeRow ? treeRow.textContent : null;

    // Clearing the rename must hand the app's own word back.
    ed.command("retitle", { id: "tab:structure", label: null, everywhere: false });
    await window.__frame();
    const cleared = wordsOf("tab:structure");

    // And so must undo, from a renamed state.
    ed.command("retitle", { id: "tab:structure", label: "Stru", everywhere: false });
    await window.__frame();
    ui.undo();
    ui.refreshNow();
    await window.__frame();
    const undone = wordsOf("tab:structure");

    return { before, after, inTree, siblingBefore, siblingAfter, cleared, undone };
  });

  assert.ok(result.before && result.before.length, "the tab had words to begin with");
  assert.equal(result.after, "Stru", "the element on screen says the new name");
  assert.equal(result.inTree, "Stru", "and so does the tree, as it always did");
  assert.equal(result.siblingAfter, result.siblingBefore,
    "the tab beside it is untouched: this is a rename of one item, not of a string");
  assert.equal(result.cleared, result.before, "clearing the rename gives the app its word back");
  assert.equal(result.undone, result.before, "and so does undo");
});

/* Teardown is where a rename that writes into the host's DOM would show up as
   a parity failure, because adopt.js restores attributes and knows nothing
   about words. The contract's restore() is what closes that, so this asserts
   it from the outside: rename, unmount, and the markup is what shipped. */
test("unmounting after a rename hands the host its own words back", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    /* The WORDS, not the markup. Comparing innerHTML here would compare
       data-uikit-id too, and this baseline is taken with uikit already
       mounted — tests/uikit_parity.browser.mjs is what owns byte-identity,
       from a baseline taken before the mount. */
    const words = () => [...document.querySelectorAll("#leftTabs [data-i18n]")]
      .map((n) => n.textContent);

    const before = words();
    ed.command("retitle", { id: "tab:structure", label: "Stru", everywhere: false });
    await window.__frame();
    const renamed = words();

    ui.edit(false);
    ui.unmount();
    await window.__frame();
    return { changed: JSON.stringify(renamed) !== JSON.stringify(before), after: words(), before };
  });

  assert.equal(result.changed, true, "the rename really did reach the markup");
  assert.deepEqual(result.after, result.before, "and unmount handed back the shipped words");
});

test("rename this one, or rename it everywhere, are different edits", opts, async () => {
  const page = await designing();
  const result = await page.eval(() => {
    const ed = window.__ed;
    const ins = document.querySelector(".uikit-ins");
    const label = ins.querySelector('[data-uikit-field="label"]');
    const everywhere = ins.querySelector(".uikit-ins-check input");

    ed.command("select", { id: "panel:tree" });
    label.value = "Just here";
    label.dispatchEvent(new Event("input", { bubbles: true }));
    const nodeLabel = window.__ui.doc.nodes["panel:tree"].label;
    const textsAfterNode = JSON.stringify(window.__ui.doc.overrides.text);

    everywhere.checked = true;
    everywhere.dispatchEvent(new Event("change", { bubbles: true }));
    label.value = "Everywhere";
    label.dispatchEvent(new Event("input", { bubbles: true }));

    return {
      nodeLabel, textsAfterNode,
      texts: window.__ui.doc.overrides.text,
      stillNodeLabel: window.__ui.doc.nodes["panel:tree"].label,
      lang: document.documentElement.lang,
    };
  });

  assert.equal(result.nodeLabel, "Just here", "the placement was renamed");
  assert.equal(result.textsAfterNode, "{}", "and no string override was written");
  assert.deepEqual(result.texts[result.lang], { uikit_p_tree: "Everywhere" },
    "the everywhere rename is stored against the language on screen");
  assert.equal(result.stillNodeLabel, "Just here",
    "the two are independent: the node override still stands");
});

test("Done exits for pointer users and the More menu reflects the session", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const menu = document.querySelector('[data-act="uikitCustomize"]');
    const during = menu.getAttribute("aria-checked");
    document.querySelector(".uikit-ins-done").click();
    for (let i = 0; i < 10 && document.querySelector(".uikit-ins"); i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return {
      during,
      after: menu.getAttribute("aria-checked"),
      editing: window.__ui.editing,
      inspector: !!document.querySelector(".uikit-ins"),
    };
  });
  assert.equal(result.during, "true");
  assert.equal(result.after, "false");
  assert.equal(result.editing, false);
  assert.equal(result.inspector, false);
});

test("Discard restores the layout from the start of the customization session", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const before = JSON.stringify(ui.doc);
    const beforeOrder = ui.doc.nodes["panel:leftTabs"].children.slice();
    window.__ed.command("retitle", { id: "tab:structure", label: "Temporary" });
    window.__ed.command("move", { id: "tab:structure", parent: "panel:leftTabs", index: 0 });
    document.getElementById("langBtn").click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    document.querySelector(".uikit-ins-head-action[title]").click();
    for (let i = 0; i < 20 && document.querySelector(".uikit-ins"); i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return {
      editing: ui.editing,
      inspector: !!document.querySelector(".uikit-ins"),
      restored: JSON.stringify(ui.doc) === before,
      order: ui.doc.nodes["panel:leftTabs"].children,
      beforeOrder,
      stored: localStorage.getItem("home3d_uikit:planner") === before,
    };
  });
  assert.equal(result.editing, false);
  assert.equal(result.inspector, false);
  assert.equal(result.restored, true);
  assert.deepEqual(result.order, result.beforeOrder);
  assert.equal(result.stored, true, "the restored session start is persisted for reload");
});

test("layout tree starts closed and search reveals matching paths", opts, async () => {
  const page = await designing({ openTree: false });
  const result = await page.eval(async () => {
    const tree = document.querySelector(".uikit-ins-tree");
    const initiallyOpen = tree.open;
    tree.open = true;
    tree.dispatchEvent(new Event("toggle"));
    const search = tree.querySelector(".uikit-ins-tree-search");
    search.value = "Hole wizard";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await window.__frame();
    return {
      initiallyOpen,
      hasMatch: !!tree.querySelector('[data-node-id="cmd:grpStart:holefeature"]'),
      hasUnrelated: !!tree.querySelector('[data-node-id="cmd:grpAnalyze:mass"]'),
      visibleRows: tree.querySelectorAll(".uikit-ins-tree-row").length,
    };
  });
  assert.equal(result.initiallyOpen, false);
  assert.equal(result.hasMatch, true);
  assert.equal(result.hasUnrelated, false);
  assert.ok(result.visibleRows > 1, "the matching row includes its ancestor path");
});

test("tree distinguishes unavailable workspace tools from missing elements", opts, async () => {
  const page = await designing();
  const result = await page.eval(() => {
    const unavailable = document.querySelector('.uikit-ins-tree-row[data-node-id="cmd:grpStart:holefeature"]');
    return {
      unavailable: unavailable && unavailable.querySelector(".uikit-ins-tree-unavailable")?.textContent,
      missing: !!(unavailable && unavailable.querySelector(".uikit-ins-tree-missing")),
    };
  });
  assert.match(result.unavailable || "", /Unavailable here/i);
  assert.equal(result.missing, false);
});

test("restoring defaults requires confirmation and offers a backup", opts, async () => {
  const page = await designing();
  const result = await page.eval(() => {
    const ed = window.__ed;
    ed.command("select", { id: "panel:tree" });
    ed.command("hide");
    const ins = document.querySelector(".uikit-ins");
    const byText = (root, text) => [...root.querySelectorAll("button")]
      .find((button) => button.textContent.trim() === text);
    const trigger = byText(ins, "Restore default layout");
    trigger.click();
    const confirm = ins.querySelector(".uikit-ins-confirm");
    const afterFirstClick = !!window.__ui.doc.nodes["panel:tree"].hidden;
    const backup = !!byText(confirm, "Export backup");
    byText(confirm, "Cancel").click();
    const cancelled = confirm.hidden && !!window.__ui.doc.nodes["panel:tree"].hidden;
    trigger.click();
    byText(confirm, "Restore").click();
    return {
      afterFirstClick,
      backup,
      cancelled,
      restored: !!window.__ui.doc.nodes["panel:tree"].hidden,
    };
  });
  assert.equal(result.afterFirstClick, true, "the first click does not destroy the layout");
  assert.equal(result.backup, true);
  assert.equal(result.cancelled, true);
  assert.equal(result.restored, false);
});

test("the item browser recovers hidden panels and places an unused command safely", opts, async () => {
  const page = await designing();
  const result = await page.eval(() => {
    const ed = window.__ed;
    const palette = document.querySelector(".uikit-ins-palette");
    const initiallyOpen = palette.open;

    // Hiding a node via command auto-opens the palette
    ed.command("select", { id: "panel:tree" });
    ed.command("hide");
    const openAfterHide = palette.open;

    // Show panel:tree back
    const hiddenRow = [...palette.querySelectorAll(".uikit-ins-item-row")]
      .find((row) => row.textContent.includes("Tree") && row.textContent.includes("Show"));
    hiddenRow.querySelector("button").click();

    // Centralized acceptance policy: programmatic placement to n:topbar or n:left is refused
    const topbarRejected = ed.command("place", { entry: { id: "act:walk", kind: "command" }, parent: "n:topbar" });
    const leftRejected = ed.command("place", { entry: { id: "act:walk", kind: "command" }, parent: "n:left" });

    const search = palette.querySelector('[type="search"]');
    search.value = "act:walk";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    const placeRow = palette.querySelector(".uikit-ins-place-row");
    const target = placeRow.querySelector("select");
    const initialDestinations = [...target.options].map((opt) => opt.value);

    // Group two sidebar panels into a real flex group container
    ed.command("select", { id: "panel:smarthome" });
    ed.command("select", { id: "panel:mep", additive: true });
    ed.command("group");
    const groupId = ed.selection()[0];

    // Re-query palette destination options
    palette.dispatchEvent(new Event("toggle"));
    search.value = "act:walk";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    const placeRowAfter = palette.querySelector(".uikit-ins-place-row");
    const targetAfter = placeRowAfter.querySelector("select");
    targetAfter.value = groupId;
    placeRowAfter.querySelector("button").click();

    const placedNode = window.__ui.doc.nodes["act:walk"];
    const groupChildren = (window.__ui.doc.nodes[groupId] && window.__ui.doc.nodes[groupId].children) || [];

    // Summary badge reports total items with title
    const countEl = palette.querySelector(".uikit-ins-summary-count");
    const countValue = countEl ? Number(countEl.textContent.trim()) : 0;
    const countTitle = countEl ? countEl.getAttribute("title") : "";

    return {
      initiallyOpen,
      openAfterHide,
      recovered: !!window.__ui.doc.nodes["panel:tree"].hidden,
      topbarRejected,
      leftRejected,
      hasTopbarDestination: initialDestinations.includes("n:topbar"),
      parentHasItem: groupChildren.includes("act:walk"),
      ref: placedNode && placedNode.ref,
      selected: ed.selection(),
      countValue,
      countHasBreakdown: countTitle.includes("hidden") || countTitle.includes("available"),
    };
  });
  assert.equal(result.initiallyOpen, false, "palette initially closed");
  assert.equal(result.openAfterHide, true, "palette auto-opens when hiding via command");
  assert.equal(result.recovered, false, "the hidden panel was restored");
  assert.equal(result.topbarRejected, false, "programmatic command placement into n:topbar is refused by policy");
  assert.equal(result.leftRejected, false, "programmatic command placement into n:left is refused by policy");
  assert.equal(result.hasTopbarDestination, false, "n:topbar is blocked from command destinations in UI");
  assert.equal(result.parentHasItem, true, "command placed into flex-backed group container");
  assert.equal(result.ref, "act:walk");
  assert.deepEqual(result.selected, ["act:walk"]);
  assert.ok(result.countValue > 0, "summary badge reports total items");
  assert.equal(result.countHasBreakdown, true, "summary badge title details hidden vs available items");
});

test("a placed command executes after leaving customize mode", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const ui = window.__ui;

    // Group two sidebar panels into a group container
    ed.command("select", { id: "panel:smarthome" });
    ed.command("select", { id: "panel:mep", additive: true });
    ed.command("group");
    const groupId = ed.selection()[0];

    // Place command into the group
    ed.command("place", { entry: { id: "act:walk", kind: "command" }, parent: groupId });
    await window.__frame();

    // Exit customize mode
    await ui.edit(false);
    await window.__frame();

    let executedAction = null;
    const prevRun = window.__runAction;
    window.__runAction = (act) => { executedAction = act; };

    const placedEl = document.querySelector('[data-uikit-id="act:walk"]');
    if (placedEl) placedEl.click();

    window.__runAction = prevRun;
    return {
      placedExists: !!placedEl,
      executedAction,
    };
  });

  assert.equal(result.placedExists, true, "placed command element exists in DOM");
  assert.equal(result.executedAction, "walk", "placed command executed once after exiting customize mode");
});

test("the overlay follows host movement and the inspector stays in a short viewport", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    ed.command("select", { id: "panel:tb-center" });
    const panel = document.querySelector('[data-uikit-id="panel:tb-center"]');
    const box = () => document.querySelector(".uikit-ed-sel").getBoundingClientRect();
    const before = box().left;
    panel.style.transform = "translateX(24px)";
    document.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const hostLeft = panel.getBoundingClientRect().left;
    const overlayLeft = box().left;
    panel.style.transform = "";
    return { before, hostLeft, overlayLeft };
  });
  assert.notEqual(result.hostLeft, result.before);
  assert.ok(Math.abs(result.overlayLeft - result.hostLeft) < 1);

  await page.resize(844, 390);
  const bounds = await page.eval(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const rect = document.querySelector(".uikit-ins").getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height, viewport: innerHeight };
  });
  assert.ok(bounds.top >= 0, "the header remains reachable");
  assert.ok(bounds.bottom <= bounds.viewport, "the inspector stays inside the viewport");
});

test("everything the designer added is gone when customize mode closes", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const ui = window.__ui;
    const before = window.__pristineLeft;

    let disconnectCalled = false;
    const origDisconnect = ResizeObserver.prototype.disconnect;
    ResizeObserver.prototype.disconnect = function() {
      disconnectCalled = true;
      return origDisconnect.apply(this, arguments);
    };

    ui.apply("Resize", ops.resize(ui.doc, { id: "n:left", size: { w: 420 } }));
    ui.refreshNow();
    ui.editor.command("select", { id: "panel:tree" });

    await ui.edit(false);
    ResizeObserver.prototype.disconnect = origDisconnect;

    const host = await import("/js/uikit_host/index.js");
    const problems = host.teardownUIKit();

    return {
      before,
      after: document.getElementById("left-sidebar").outerHTML,
      problems,
      disconnectCalled,
      inspectors: document.querySelectorAll(".uikit-ins").length,
      overlays: document.querySelectorAll(".uikit-ed-overlay").length,
      grips: document.querySelectorAll("[data-uikit-grip]").length,
      width: getComputedStyle(document.getElementById("left-sidebar")).width,
    };
  });

  assert.equal(result.inspectors, 0, "the inspector is gone");
  assert.equal(result.overlays, 0);
  assert.equal(result.grips, 0);
  assert.equal(result.disconnectCalled, true, "ResizeObserver disconnected on customize exit");
  assert.equal(result.width, "300px", "and the app's own width is back in charge");
  assert.deepEqual(result.problems, []);
  assert.equal(result.after, result.before, "byte-identical, after a resize and a selection");
});

test("double-click drills into container, sticky focus keeps depth, breadcrumb and Escape ascend", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    ed.command("select", { id: null });
    await window.__frame();

    const topbar = document.getElementById("topbar");
    const rect = topbar.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // First pointerup
    document.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, button: 0, bubbles: true }));
    document.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y, button: 0, bubbles: true }));
    const afterFirstClickFocus = ed.focus();

    // Second pointerup within 100ms (synthesized double click)
    await new Promise((r) => setTimeout(r, 50));
    document.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, button: 0, bubbles: true }));
    document.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y, button: 0, bubbles: true }));
    await window.__frame();
    const afterDblClickFocus = ed.focus();

    // First Escape ascends one level to root (n:app)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await window.__frame();
    const afterEscapeFocus = ed.focus();
    const stillEditing = window.__ui.editing;

    // Second Escape at root exits customize mode
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await window.__frame();
    const afterSecondEscapeEditing = window.__ui.editing;

    return {
      afterFirstClickFocus,
      afterDblClickFocus,
      afterEscapeFocus,
      stillEditing,
      afterSecondEscapeEditing,
    };
  });

  assert.equal(result.afterFirstClickFocus, null, "single click leaves focus at root");
  assert.equal(result.afterDblClickFocus, "n:topbar", "double-click drills into container");
  assert.ok(result.afterEscapeFocus === "n:app" || result.afterEscapeFocus === null, "Escape ascends back to root");
  assert.equal(result.stillEditing, true, "Escape ascended one level instead of exiting customize mode outright");
  assert.equal(result.afterSecondEscapeEditing, false, "second Escape at root exits customize mode");
});

test("selecting a dropdown menu node pins it open via holdOpen, deselecting closes it", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const fileMenu = document.querySelector('[data-uikit-id="menu:file"]');
    const wasOpenBefore = fileMenu ? fileMenu.classList.contains("open") : false;

    // Select the file menu
    ed.command("select", { id: "menu:file" });
    await window.__frame();
    const isOpenWhileSelected = fileMenu ? fileMenu.classList.contains("open") : false;

    // Deselect
    ed.command("select", { id: null });
    await window.__frame();
    const isOpenAfterDeselect = fileMenu ? fileMenu.classList.contains("open") : false;

    return {
      hasFileMenu: !!fileMenu,
      wasOpenBefore,
      isOpenWhileSelected,
      isOpenAfterDeselect,
    };
  });

  assert.equal(result.hasFileMenu, true, "menu:file exists with data-uikit-id");
  assert.equal(result.wasOpenBefore, false, "dropdown is closed before selection");
  assert.equal(result.isOpenWhileSelected, true, "selecting dropdown pins it open via holdOpen");
  assert.equal(result.isOpenAfterDeselect, false, "deselecting unpins and closes dropdown");
});

/* The legality check on the COMMIT path, which is a different check from the
 * one the drag makes.
 *
 * Both drag surfaces refuse an illegal target while the pointer is still down:
 * the canvas in onPointerMove, the tree through treeDropTarget's acceptsFn. So
 * a test driven by pointer events proves the preview, not the commit — and the
 * commit is reachable without either, from the keyboard's moveOut and from any
 * command("move") a host makes. Remove the guard in move() and every existing
 * test still passes; this is the one that notices.
 *
 * n:topbar is the sharpest case in this app. #topbar is
 * `grid-template-columns: minmax(0,1fr) auto minmax(0,1fr)` — three tracks,
 * exactly — so its accepts list names the three columns by id and a fourth
 * child would be laid out by a rule that does not exist for it. */
test("an illegal move is refused at the commit, not only during the drag", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const ui = window.__ui;
    const childrenOf = (id) => ((ui.doc.nodes[id] || {}).children || []).slice();

    const topbarBefore = childrenOf("n:topbar");
    const startBefore = childrenOf("panel:tb-start");
    const historyBefore = ui.history ? ui.history.length : null;

    // A command into #topbar: refused by the host's declared accepts list.
    const intoTopbar = ed.command("move", { id: "act:undo", parent: "n:topbar", index: 0 });
    await window.__frame();

    // A container into its own subtree: refused by ops.move itself.
    const intoItself = ed.command("move", { id: "panel:tb-start", parent: "panel:tb-start", index: 0 });
    await window.__frame();

    // And the same node into a target that DOES accept it, so the test cannot
    // pass by move() being broken outright.
    const legal = ed.command("move", { id: "act:undo", parent: "panel:tb-end", index: 0 });
    await window.__frame();

    return {
      intoTopbar,
      intoItself,
      legal,
      topbarAfter: childrenOf("n:topbar"),
      startAfterIllegal: startBefore,
      topbarBefore,
      undoNowIn: Object.keys(ui.doc.nodes).find(
        (id) => ((ui.doc.nodes[id] || {}).children || []).includes("act:undo")
      ),
      historyBefore,
    };
  });

  assert.equal(result.intoTopbar, false, "a command is refused by #topbar's three-track accepts list");
  assert.equal(result.intoItself, false, "and a container cannot be dropped into its own subtree");
  assert.deepEqual(result.topbarAfter, result.topbarBefore,
    "a refused move left the document exactly as it was");
  assert.equal(result.legal, true, "while a legal move still goes through");
  assert.equal(result.undoNowIn, "panel:tb-end", "and lands where it was sent");
});

test("moving an escaping node out of its parent warns in the inspector note", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;

    // Moving more:walk out of More onto the toolbar
    const moved = ed.command("move", { id: "more:walk", parent: "panel:tb-start", index: 0 });
    await window.__frame();
    const noteText = document.querySelector(".uikit-ins-feedback")?.textContent || "";

    const movedBack = ed.command("move", { id: "more:walk", parent: "menu:more", index: 2 });
    await window.__frame();
    const noteAfterReturn = document.querySelector(".uikit-ins-feedback")?.textContent || "";

    const movedOutAgain = ed.command("move", { id: "more:walk", parent: "panel:tb-start", index: 0 });
    await window.__frame();
    const noteAfterSecondMove = document.querySelector(".uikit-ins-feedback")?.textContent || "";

    return {
      moved,
      noteText,
      movedBack,
      noteAfterReturn,
      movedOutAgain,
      noteAfterSecondMove,
    };
  });

  assert.equal(result.moved, true, "moving more:walk onto the toolbar is allowed");
  assert.equal(result.noteText, "Moving this item out of its container may alter its responsive visibility or appearance.",
    "moving an escaping node warns the user with exact localized text");
  assert.equal(result.movedBack, true, "moving more:walk back to More is allowed");
  assert.equal(result.noteAfterReturn, "", "moving back does not re-warn");
  assert.equal(result.movedOutAgain, true, "moving more:walk out a second time is allowed");
  assert.equal(result.noteAfterSecondMove, "", "warnedEscapes prevents duplicate warning on subsequent moves");
});

/* The hierarchy the tree is supposed to show. Menu items used to be parked at
 * the ROOT, in slot-bound containers of their own, because the host portals an
 * open .dropdown-menu to <body> and a plain parent/child pair would have had
 * syncChildren drag those buttons back into the wrapper.
 *
 * The entry's target() hook removes the need: the node is still the .dropdown
 * WRAPPER, so it keeps its place among .tb-start's children, but its children
 * are synced into whatever menuItemsFor() resolves — the menu, in either home.
 * So the containment can be honest, and this is the test that says it is.
 */
test("a menu owns its items in the tree, one level below it", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const doc = ui.doc;

    const exportNode = doc.nodes["menu:export"];
    const parentOf = (id) => Object.keys(doc.nodes)
      .find((k) => (doc.nodes[k].children || []).includes(id)) || null;

    /* The tree draws depth as --uikit-tree-depth, so "one level below" is a
       number on screen and not merely a shape in the document. */
    const depthOf = (id) => {
      const row = document.querySelector(`.uikit-ins-tree-row[data-node-id="${id}"]`);
      return row ? Number(row.style.getPropertyValue("--uikit-tree-depth")) : null;
    };

    return {
      exportIsGroup: !!exportNode && exportNode.type === "group",
      exportChildren: (exportNode && exportNode.children) || [],
      png2dParent: parentOf("act:png2d"),
      exportParent: parentOf("menu:export"),
      rootChildren: doc.nodes["n:app"].children.filter((c) => c.startsWith("menu")),
      exportDepth: depthOf("menu:export"),
      png2dDepth: depthOf("act:png2d"),
    };
  });

  assert.equal(result.exportIsGroup, true, "Export is a container, not a leaf");
  assert.deepEqual(result.exportChildren,
    ["act:exportjson", "act:png2d", "act:png3d", "act:exportgltf"],
    "and it holds its four commands, in menu order");
  assert.equal(result.png2dParent, "menu:export", "PNG 2D's parent is Export");
  assert.equal(result.exportParent, "panel:tb-start", "and Export still sits in the toolbar column");
  assert.deepEqual(result.rootChildren, [],
    "no menu container is parked at the root any more");
  assert.equal(result.png2dDepth, result.exportDepth + 1,
    "the tree draws PNG 2D exactly one level below Export");
});

/* The trap the old slot existed to avoid, now guarded by target() instead.
 * With the menu OPEN its element is a child of <body>, so a target() that
 * queried the wrapper would return null, fall back to the wrapper, and sync the
 * four buttons into it — emptying the popup while it is on screen. */
test("a render while the menu is open syncs into the portaled element, not the wrapper", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    const { menuItemsFor, menuAt } = await import("/js/uikit_host/panels.js");

    // Selecting the menu pins it open, which is what portals it to <body>.
    ed.command("select", { id: "menu:export" });
    await window.__frame();

    const menuEl = menuItemsFor(document, "menu_export", 2)();
    const wrapper = menuAt(document, "menu_export", 2)();
    const portaled = menuEl.parentElement === document.body;

    // Force a full render while it is open and portaled.
    ui.refreshNow();
    await window.__frame();

    const inMenu = [...menuEl.querySelectorAll("button[data-act]")].map((b) => b.getAttribute("data-act"));
    const strandedInWrapper = [...wrapper.querySelectorAll(":scope > button[data-act]")].length;

    // And a move while open still lands in the menu.
    ed.command("move", { id: "act:exportgltf", parent: "menu:export", index: 0 });
    await window.__frame();
    const afterMove = [...menuEl.querySelectorAll("button[data-act]")].map((b) => b.getAttribute("data-act"));

    ed.command("select", { id: null });
    await window.__frame();

    return { portaled, inMenu, strandedInWrapper, afterMove };
  });

  assert.equal(result.portaled, true, "an open menu really is a child of <body>");
  assert.deepEqual(result.inMenu, ["exportjson", "png2d", "png3d", "exportgltf"],
    "a render while open left all four buttons in the menu");
  assert.equal(result.strandedInWrapper, 0,
    "and pulled none of them into the .dropdown wrapper");
  assert.equal(result.afterMove[0], "exportgltf", "a move while open lands in the menu too");
});

/* Menu children live in a panel the host portals to <body>. Without tagging
   that panel, a pointer drop on a File item walks off the document and the
   drag reports no-container — which is why double-clicking a menu (to pin it
   open) made its items look immovable. */
test("dragging a pinned menu item reorders it and can drop it onto the toolbar", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const { menuItemsFor } = await import("/js/uikit_host/panels.js");

    function parentOf(id) {
      for (const [pid, n] of Object.entries(window.__ui.doc.nodes)) {
        if ((n.children || []).includes(id)) return pid;
      }
      return null;
    }
    function center(el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    function fire(type, x, y) {
      document.dispatchEvent(new PointerEvent(type, {
        clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1,
      }));
    }
    function drag(fromEl, toEl) {
      const from = center(fromEl);
      const to = center(toEl);
      fire("pointerdown", from.x, from.y);
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        fire("pointermove",
          from.x + (to.x - from.x) * (i / steps),
          from.y + (to.y - from.y) * (i / steps));
      }
      fire("pointerup", to.x, to.y);
    }

    ed.command("select", { id: "menu:file" });
    await window.__frame();

    const menuEl = menuItemsFor(document, "menu_file", 0)();
    const tagged = menuEl && menuEl.getAttribute("data-uikit-target");
    const save = document.querySelector('[data-uikit-id="act:save"]');
    const reset = document.querySelector('[data-uikit-id="act:reset"]');
    const undo = document.querySelector('[data-uikit-id="act:undo"]');

    const before = (window.__ui.doc.nodes["menu:file"].children || []).slice();
    drag(save, reset);
    await window.__frame();
    const afterReorder = (window.__ui.doc.nodes["menu:file"].children || []).slice();

    const saveAgain = document.querySelector('[data-uikit-id="act:save"]');
    drag(saveAgain, undo);
    await window.__frame();

    return {
      tagged,
      portaled: menuEl.parentElement === document.body,
      beforeIndex: before.indexOf("act:save"),
      afterIndex: afterReorder.indexOf("act:save"),
      stillInFileAfterReorder: afterReorder.includes("act:save"),
      parentAfterDrop: parentOf("act:save"),
    };
  });

  assert.equal(result.tagged, "menu:file", "the portaled panel is tagged as the menu's drop target");
  assert.equal(result.portaled, true);
  assert.ok(result.beforeIndex >= 0 && result.afterIndex > result.beforeIndex,
    "dragging Save onto Reset inside the open menu moved it down");
  assert.equal(result.stillInFileAfterReorder, true);
  assert.equal(result.parentAfterDrop, "panel:tb-start",
    "dragging Save onto Undo took it out of File and onto the toolbar");
});

/* Groups default to a row. Edit is a menu, so a vertical drag of Undo onto
   Redo must measure Y — otherwise the insertion index never changes and the
   drop preview is a full-height strip instead of a gap. */
test("dragging Undo onto Redo in the open Edit menu puts Undo underneath", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const { menuItemsFor } = await import("/js/uikit_host/panels.js");

    function center(el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    function fire(type, x, y) {
      document.dispatchEvent(new PointerEvent(type, {
        clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      }));
    }

    ed.command("select", { id: "menu:edit" });
    await window.__frame();

    const menuEl = menuItemsFor(document, "menu_edit", 1)();
    const undo = document.querySelector('[data-uikit-id="btn:undo"]');
    const redo = document.querySelector('[data-uikit-id="btn:redo"]');
    const before = (window.__ui.doc.nodes["menu:edit"].children || []).slice();

    const from = center(undo);
    const to = center(redo);
    fire("pointerdown", from.x, from.y);
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      fire("pointermove",
        from.x + (to.x - from.x) * (i / steps),
        from.y + (to.y - from.y) * (i / steps));
    }
    const ghost = !!document.querySelector(".uikit-ed-ghost");
    const gap = !!document.querySelector(".uikit-ed-drop, .uikit-ed-placeholder");
    fire("pointerup", to.x, to.y);
    await window.__frame();

    return {
      before,
      after: (window.__ui.doc.nodes["menu:edit"].children || []).slice(),
      ghost,
      gap,
      portaled: menuEl && menuEl.parentElement === document.body,
    };
  });

  assert.equal(result.portaled, true);
  assert.equal(result.before[0], "btn:undo");
  assert.equal(result.before[1], "btn:redo");
  assert.equal(result.after[0], "btn:redo", "Redo stays above");
  assert.equal(result.after[1], "btn:undo", "and Undo lands under it");
  assert.equal(result.ghost, true, "a drag preview follows the pointer");
  assert.equal(result.gap, true, "and a drop gap is drawn in the menu");
});

/* Dividers are first-class nodes. Reordering a command must not drop or
   duplicate them. */
test("reordering inside a menu leaves its dividers where the host put them", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    const { menuItemsFor } = await import("/js/uikit_host/panels.js");
    const menuEl = menuItemsFor(document, "menu_edit", 1)();
    const shape = () => [...menuEl.children].map((c) =>
      c.classList.contains("menu-divider") ? "|" : (c.getAttribute("data-act") || c.tagName.toLowerCase()));

    const before = shape();
    ed.command("move", { id: "act:deleteSel", parent: "menu:edit", index: 0 });
    await window.__frame();
    const after = shape();
    ui.undo();
    await window.__frame();
    return { before, after, reverted: shape() };
  });

  assert.ok(result.before.includes("|"), "the Edit menu really does have dividers");
  assert.equal(result.after.filter((x) => x === "|").length,
    result.before.filter((x) => x === "|").length, "no divider was added or lost");
  assert.equal(result.after[0], "deleteSel", "the moved command went where it was sent");
  assert.deepEqual(result.reverted, result.before, "and undo put the whole row back");
});

test("tree lists menu items while menu is closed and moving one reorders real menu in DOM", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    const { menuItemsFor } = await import("/js/uikit_host/panels.js");
    const menuEl = menuItemsFor(document, "menu_file", 0)();
    if (!menuEl) return { error: "menu element not found" };

    const isOpenBefore = menuEl.classList.contains("open");
    const hasTreeItemWhileClosed = !!document.querySelector('.uikit-ins-tree-row[data-node-id="act:save"]');
    const actsBefore = [...menuEl.querySelectorAll("button[data-act]")].map((b) => b.getAttribute("data-act"));

    // Moving act:save from index 1 to index 0
    const moved = ed.command("move", { id: "act:save", parent: "menu:file", index: 0 });
    await window.__frame();

    const actsAfter = [...menuEl.querySelectorAll("button[data-act]")].map((b) => b.getAttribute("data-act"));

    // Deselect to close pinned menu
    ed.command("select", { id: null });
    await window.__frame();
    const isOpenAfterDeselect = menuEl.classList.contains("open");

    // Undo
    ui.undo();
    await window.__frame();
    const actsReverted = [...menuEl.querySelectorAll("button[data-act]")].map((b) => b.getAttribute("data-act"));

    return {
      isOpenBefore,
      hasTreeItemWhileClosed,
      actsBefore,
      moved,
      actsAfter,
      isOpenAfterDeselect,
      actsReverted,
    };
  });

  assert.equal(result.isOpenBefore, false, "menu was closed initially");
  assert.equal(result.hasTreeItemWhileClosed, true, "tree lists menu items while menu is closed");
  assert.equal(result.moved, true, "reordering item in menu:file is allowed");
  assert.equal(result.actsBefore[0], "newPlan", "newPlan was first before move");
  assert.equal(result.actsBefore[1], "save", "save was second before move");
  assert.equal(result.actsAfter[0], "save", "save moved to first in real DOM");
  assert.equal(result.actsAfter[1], "newPlan", "newPlan shifted to second");
  assert.equal(result.isOpenAfterDeselect, false, "menu closes once deselected");
  assert.deepEqual(result.actsReverted, result.actsBefore, "undo restored original DOM order");
});

test("opening a pinned menu portals to <body> without layout pulling buttons into .dropdown wrapper", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const { menuItemsFor } = await import("/js/uikit_host/panels.js");
    const menuEl = menuItemsFor(document, "menu_file", 0)();
    if (!menuEl) return { error: "menu element not found" };

    const parentTag = menuEl.parentElement ? menuEl.parentElement.tagName.toLowerCase() : null;
    const isDirectChildOfBody = menuEl.parentElement === document.body;

    // Selecting act:save pins the dropdown open via holdOpen
    ed.command("select", { id: "act:save" });
    await window.__frame();
    const isOpenWhenSelected = menuEl.classList.contains("open");

    // Clear selection
    ed.command("select", { id: null });
    await window.__frame();
    const isOpenAfterDeselect = menuEl.classList.contains("open");

    return {
      parentTag,
      isDirectChildOfBody,
      isOpenWhenSelected,
      isOpenAfterDeselect,
    };
  });

  assert.equal(result.isDirectChildOfBody, true, "menu element is a direct child of document.body");
  assert.equal(result.parentTag, "body", "parent is body, not #topbar or .dropdown wrapper");
  assert.equal(result.isOpenWhenSelected, true, "menu is pinned open when selecting one of its items");
  assert.equal(result.isOpenAfterDeselect, false, "menu closes when item is deselected");
});

test("menu item moved to .tb-end warns escapes and still runs its action", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;

    let dispatched = null;
    window.__runAction = (act) => { dispatched = act; };

    // Move act:save from menu:file to panel:tb-end
    const moved = ed.command("move", { id: "act:save", parent: "panel:tb-end", index: 0 });
    await window.__frame();

    const noteText = document.querySelector(".uikit-ins-feedback")?.textContent || "";
    const saveInTbEnd = document.querySelector("#topbar .tb-end button[data-act='save']");

    // Run action via registry entry
    const entry = ui.registry.get("act:save");
    if (entry && typeof entry.run === "function") {
      entry.run();
    }

    return {
      moved,
      noteText,
      saveInTbEndFound: !!saveInTbEnd,
      dispatched,
    };
  });

  assert.equal(result.moved, true, "moving act:save to panel:tb-end succeeded");
  assert.equal(result.noteText, "Moving this item out of its container may alter its responsive visibility or appearance.",
    "escape warning shown when moving menu item to toolbar column");
  assert.equal(result.saveInTbEndFound, true, "button element now lives in .tb-end in DOM");
  assert.equal(result.dispatched, "save", "action runs through the host dispatcher");
});

test("tree lists Edit menu items while closed and moving one reorders real menu in DOM", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    const { menuItemsFor } = await import("/js/uikit_host/panels.js");
    const menuEl = menuItemsFor(document, "menu_edit", 1)();
    if (!menuEl) return { error: "edit menu element not found" };

    const isOpenBefore = menuEl.classList.contains("open");
    const hasTreeItemWhileClosed = !!document.querySelector('.uikit-ins-tree-row[data-node-id="act:deleteSel"]');
    const actsBefore = [...menuEl.querySelectorAll("button[data-act]")].map((b) => b.getAttribute("data-act"));

    // Move act:deleteSel from last (index 5) to index 0
    const moved = ed.command("move", { id: "act:deleteSel", parent: "menu:edit", index: 0 });
    await window.__frame();

    const actsAfter = [...menuEl.querySelectorAll("button[data-act]")].map((b) => b.getAttribute("data-act"));

    // Deselect to close pinned menu
    ed.command("select", { id: null });
    await window.__frame();
    const isOpenAfterDeselect = menuEl.classList.contains("open");

    // Move act:dupSel from menu:edit to panel:tb-end and check escape warning
    const movedTbEnd = ed.command("move", { id: "act:dupSel", parent: "panel:tb-end", index: 0 });
    await window.__frame();
    const noteText = document.querySelector(".uikit-ins-feedback")?.textContent || "";
    const dupInTbEnd = document.querySelector("#topbar .tb-end button[data-act='dupSel']");

    let dispatched = null;
    window.__runAction = (act) => { dispatched = act; };
    const entry = ui.registry.get("act:dupSel");
    if (entry && typeof entry.run === "function") entry.run();

    // Undo twice
    ui.undo();
    await window.__frame();
    ui.undo();
    await window.__frame();
    const actsReverted = [...menuEl.querySelectorAll("button[data-act]")].map((b) => b.getAttribute("data-act"));

    return {
      isOpenBefore,
      hasTreeItemWhileClosed,
      actsBefore,
      moved,
      actsAfter,
      isOpenAfterDeselect,
      movedTbEnd,
      noteText,
      dupInTbEndFound: !!dupInTbEnd,
      dispatched,
      actsReverted,
    };
  });

  assert.equal(result.isOpenBefore, false, "edit menu was closed initially");
  assert.equal(result.hasTreeItemWhileClosed, true, "tree lists edit menu items while closed");
  assert.equal(result.moved, true, "reordering item in menu:edit is allowed");
  assert.deepEqual(result.actsBefore, ["undo", "redo", "dupSel", "groupItems", "ungroupItems", "deleteSel"], "initial acts in DOM");
  assert.equal(result.actsAfter[0], "deleteSel", "deleteSel moved to first in real DOM");
  assert.equal(result.isOpenAfterDeselect, false, "edit menu closes when deselected");
  assert.equal(result.movedTbEnd, true, "moving act:dupSel to tb-end succeeded");
  assert.equal(result.noteText, "Moving this item out of its container may alter its responsive visibility or appearance.",
    "escape warning shown when moving edit item to toolbar");
  assert.equal(result.dupInTbEndFound, true, "dupSel button now in tb-end");
  assert.equal(result.dispatched, "dupSel", "dupSel runs through host dispatcher");
  assert.deepEqual(result.actsReverted, result.actsBefore, "undo restored original DOM order");
});

test("tree lists Export menu items and opening pins it portaled to body without wrapper pull", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    const { menuItemsFor } = await import("/js/uikit_host/panels.js");
    const menuEl = menuItemsFor(document, "menu_export", 2)();
    if (!menuEl) return { error: "export menu element not found" };

    const isOpenBefore = menuEl.classList.contains("open");
    const hasTreeItemWhileClosed = !!document.querySelector('.uikit-ins-tree-row[data-node-id="act:exportgltf"]');
    const actsBefore = [...menuEl.querySelectorAll("button[data-act]")].map((b) => b.getAttribute("data-act"));

    // Selecting act:exportgltf pins the dropdown open via holdOpen
    ed.command("select", { id: "act:exportgltf" });
    await window.__frame();
    const isOpenWhenSelected = menuEl.classList.contains("open");
    const isDirectChildOfBody = menuEl.parentElement === document.body;

    // Moving act:exportgltf to index 0
    const moved = ed.command("move", { id: "act:exportgltf", parent: "menu:export", index: 0 });
    await window.__frame();
    const actsAfter = [...menuEl.querySelectorAll("button[data-act]")].map((b) => b.getAttribute("data-act"));

    // Deselect closes menu
    ed.command("select", { id: null });
    await window.__frame();
    const isOpenAfterDeselect = menuEl.classList.contains("open");

    // Move act:png2d to tb-end and verify escape note & run
    const movedTbEnd = ed.command("move", { id: "act:png2d", parent: "panel:tb-end", index: 0 });
    await window.__frame();
    const noteText = document.querySelector(".uikit-ins-feedback")?.textContent || "";
    let dispatched = null;
    window.__runAction = (act) => { dispatched = act; };
    const entry = ui.registry.get("act:png2d");
    if (entry && typeof entry.run === "function") entry.run();

    // Undo twice
    ui.undo();
    await window.__frame();
    ui.undo();
    await window.__frame();
    const actsReverted = [...menuEl.querySelectorAll("button[data-act]")].map((b) => b.getAttribute("data-act"));

    return {
      isOpenBefore,
      hasTreeItemWhileClosed,
      actsBefore,
      isOpenWhenSelected,
      isDirectChildOfBody,
      moved,
      actsAfter,
      isOpenAfterDeselect,
      movedTbEnd,
      noteText,
      dispatched,
      actsReverted,
    };
  });

  assert.equal(result.isOpenBefore, false, "export menu was closed initially");
  assert.equal(result.hasTreeItemWhileClosed, true, "tree lists export menu items while closed");
  assert.equal(result.isOpenWhenSelected, true, "export menu pinned open when selecting child");
  assert.equal(result.isDirectChildOfBody, true, "export menu element is direct child of body when opened");
  assert.equal(result.moved, true, "reordering item in menu:export is allowed");
  assert.deepEqual(result.actsBefore, ["exportjson", "png2d", "png3d", "exportgltf"], "initial acts in DOM");
  assert.equal(result.actsAfter[0], "exportgltf", "exportgltf moved to first in real DOM");
  assert.equal(result.isOpenAfterDeselect, false, "export menu closes when deselected");
  assert.equal(result.movedTbEnd, true, "moving act:png2d to tb-end succeeded");
  assert.equal(result.noteText, "Moving this item out of its container may alter its responsive visibility or appearance.",
    "escape warning shown when moving export item to toolbar");
  assert.equal(result.dispatched, "png2d", "png2d runs through host dispatcher");
  assert.deepEqual(result.actsReverted, result.actsBefore, "undo restored original DOM order");
});

test("left tab buttons can be reordered in panel:leftTabs and clicking one switches pane", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    const tabList = document.getElementById("leftTabs");
    const tabsBefore = [...tabList.querySelectorAll("button[data-left-tab]")].map((b) => b.getAttribute("data-left-tab"));

    // Move tab:structure to index 0
    const moved = ed.command("move", { id: "tab:structure", parent: "panel:leftTabs", index: 0 });
    await window.__frame();

    const tabsAfter = [...tabList.querySelectorAll("button[data-left-tab]")].map((b) => b.getAttribute("data-left-tab"));

    // Exit customize mode and click the reordered button
    await ui.edit(false);
    await window.__frame();

    const firstBtn = tabList.querySelector("button[data-left-tab]");
    firstBtn.click();
    await window.__frame();

    const activePane = document.getElementById("left-sidebar").getAttribute("data-left");

    return {
      tabsBefore,
      moved,
      tabsAfter,
      firstBtnTab: firstBtn.getAttribute("data-left-tab"),
      activePane,
    };
  });

  assert.equal(result.tabsBefore[0], "project", "project guide is the first tab");
  assert.equal(result.moved, true, "reordering tab:structure is allowed");
  assert.equal(result.tabsAfter[0], "structure", "structure tab moved to first in real DOM");
  assert.equal(result.firstBtnTab, "structure", "first button element is structure tab");
  assert.equal(result.activePane, "structure", "clicking reordered tab switches active left pane to structure");
});

test("moving a left tab button out of panel:leftTabs warns escapes", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;

    // Move tab:library out of panel:leftTabs to panel:tb-end
    const moved = ed.command("move", { id: "tab:library", parent: "panel:tb-end", index: 0 });
    await window.__frame();

    const noteText = document.querySelector(".uikit-ins-feedback")?.textContent || "";
    const tabInTbEnd = document.querySelector("#topbar .tb-end button[data-left-tab='library']");

    return {
      moved,
      noteText,
      tabInTbEndFound: !!tabInTbEnd,
    };
  });

  assert.equal(result.moved, true, "moving tab:library to panel:tb-end succeeded");
  assert.equal(result.noteText, "Moving this item out of its container may alter its responsive visibility or appearance.",
    "escape warning shown when moving tab button out of panel:leftTabs");
  assert.equal(result.tabInTbEndFound, true, "tab button now lives in .tb-end in DOM");
});

test("document dir is pinned to ltr even in Hebrew and at narrow viewport", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const i18n = await import("/js/i18n.js");
    await i18n.setLang("he");
    await window.__frame();
    const dirHe = document.documentElement.dir;
    const langHe = document.documentElement.lang;

    await i18n.setLang("en");
    await window.__frame();
    const dirEn = document.documentElement.dir;

    return { dirHe, langHe, dirEn };
  });

  assert.equal(result.langHe, "he", "html lang reflects Hebrew");
  assert.equal(result.dirHe, "ltr", "app pins documentElement.dir to ltr even in Hebrew");
  assert.equal(result.dirEn, "ltr", "documentElement.dir remains ltr in English");
});

test("touch targets have height >= 44px under coarse pointer emulation", opts, async () => {
  const page = await designing();
  await page.resize(375, 667, { mobile: true, touch: true });
  const result = await page.eval(async () => {
    const ed = window.__ed;
    ed.command("select", { id: "panel:tree" });
    await window.__frame();

    const selectors = [
      ".uikit-ins-tree-row",
      ".uikit-ins-check",
      ".uikit-ins-head-actions button",
    ];
    const elements = document.querySelectorAll(selectors.join(", "));
    const measured = [];
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0 && getComputedStyle(el).display !== "none") {
        measured.push({
          tag: el.tagName.toLowerCase(),
          cls: el.className,
          h: Math.round(rect.height),
          pass: rect.height >= 43.5,
        });
      }
    }
    const input = document.querySelector(".uikit-ins input");
    const inputFontSize = input ? getComputedStyle(input).fontSize : null;
    return {
      total: measured.length,
      allPass: measured.length > 0 && measured.every((m) => m.pass),
      failures: measured.filter((m) => !m.pass),
      inputFontSize,
    };
  });

  await page.resize(1440, 900, { mobile: false, touch: false });

  assert.ok(result.total > 0, "found coarse touch targets in inspector");
  assert.equal(result.allPass, true, "all touch targets meet 44px min-height: " + JSON.stringify(result.failures));
  assert.equal(result.inputFontSize, "16px", "input font size is 16px to prevent zoom on touch devices");
});

test("no English text leaks into uikit inspector when in Hebrew", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const i18n = await import("/js/i18n.js");
    await i18n.setLang("he");
    await window.__frame();

    const ins = document.querySelector(".uikit-ins");
    if (!ins) return { found: false, leaks: [] };

    const texts = [];
    const walk = (el) => {
      if (!el || getComputedStyle(el).display === "none" || el.hidden) return;
      if (el.tagName === "KBD" || el.tagName === "CODE" || el.classList.contains("uikit-icon") || el.classList.contains("ph")) return;
      for (const node of el.childNodes) {
        if (node.nodeType === 3) {
          const txt = (node.nodeValue || "").trim();
          if (txt && !/^[\d\s.,:;!?%—–·\-_/\\()\[\]{}]+$/.test(txt)) {
            texts.push(txt);
          }
        }
      }
      for (const child of el.children) walk(child);
    };
    walk(ins);

    const leaks = texts.filter((t) => /^[A-Za-z]/.test(t));

    await i18n.setLang("en");
    return { found: true, leaks, count: texts.length };
  });

  assert.equal(result.found, true, "inspector was found");
  assert.ok(result.count > 10, "inspected non-empty set of localized strings");
  assert.deepEqual(result.leaks, [], "no visible text in inspector leaks English words when in Hebrew");
});

test("placing an already-used command inserts a replica that still runs", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const ui = window.__ui;
    const ran = [];
    const prev = window.__runAction;
    window.__runAction = (act) => { ran.push(act); };

    ed.command("select", { id: "panel:tb-start" });
    const added = ed.command("insertMenu");
    await window.__frame();
    const menuId = Object.keys(ui.doc.nodes).find((id) => id.indexOf("menu:user-") === 0);
    const placed = ed.command("place", {
      entry: ui.registry.get("act:save"),
      parent: menuId,
    });
    await window.__frame();

    const replicaId = Object.keys(ui.doc.nodes).find((id) => id.indexOf("place:") === 0);
    const adopted = document.querySelector('[data-uikit-id="act:save"]');
    const replica = replicaId ? document.querySelector('[data-uikit-id="' + replicaId + '"]') : null;
    if (replica) replica.click();
    const ranDuringEdit = ran.slice();
    document.querySelector(".uikit-ins-done").click();
    for (let i = 0; i < 20 && document.querySelector(".uikit-ins"); i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    const replicaAfter = replicaId ? document.querySelector('[data-uikit-id="' + replicaId + '"]') : null;
    if (replicaAfter) replicaAfter.click();
    window.__runAction = prev;

    return {
      added,
      placed,
      menuId,
      replicaId,
      replicaRef: replicaId ? ui.doc.nodes[replicaId].ref : null,
      twoButtons: !!(adopted && replica && adopted !== replica),
      replicaIsButton: !!(replica && replica.tagName === "BUTTON"),
      replicaAct: replica ? replica.getAttribute("data-act") : null,
      collision: !!(adopted && replica && adopted.getAttribute("data-uikit-id") === replica.getAttribute("data-uikit-id")),
      ran,
    };
  });

  assert.equal(result.added, true, "Add menu created a user dropdown");
  assert.ok(result.menuId, "the new menu has a menu:user- id");
  assert.equal(result.placed, true, "placing Save while it still lives in File is allowed");
  assert.ok(result.replicaId, "the second placement is a replica node");
  assert.equal(result.replicaRef, "act:save");
  assert.equal(result.twoButtons, true, "two buttons, one adopted and one built");
  assert.equal(result.replicaIsButton, true);
  assert.equal(result.collision, false, "replica id does not collide with the adopted node");
  assert.ok(result.ran.includes("save"), "the replica still calls run()");
});

test("inspector Name clicks do not close a pinned File menu", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    ed.command("select", { id: "menu:file" });
    await window.__frame();
    const wrap = document.querySelector('[data-uikit-id="menu:file"]');
    const panel = [...document.querySelectorAll("body > .dropdown-menu")].find((m) => m._dd === wrap);
    const name = document.querySelector('[data-uikit-field="label"]');
    if (name) {
      name.click();
      name.focus();
      name.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    await window.__frame();
    const stillOpen = !!(wrap && wrap.classList.contains("open") && panel && panel.classList.contains("open"));
    const onBody = !!(panel && panel.parentElement === document.body);
    document.querySelector(".uikit-ins-done").click();
    for (let i = 0; i < 20 && document.querySelector(".uikit-ins"); i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    return {
      stillOpen,
      onBody,
      closedAfterDone: !(wrap && wrap.classList.contains("open")),
    };
  });
  assert.equal(result.stillOpen, true, "File stays .open after clicking inspector Name");
  assert.equal(result.onBody, true, "the panel remains a body child");
  assert.equal(result.closedAfterDone, true, "Done closes the pinned menu");
});

test("More is a menu of placements distinct from toolbar twins", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    const tree = document.querySelector(".uikit-ins-tree");
    tree.open = true;
    tree.dispatchEvent(new Event("toggle"));
    await window.__frame();
    const moreKids = (ui.doc.nodes["menu:more"] || {}).children || [];
    const walk = ui.registry.get("more:walk");
    const launch = ui.registry.get("act:openModeler");
    const moreLaunch = ui.registry.get("more:openModeler");
    ed.command("select", { id: "more:uikitCustomize" });
    const hidden = ed.command("setHidden", { id: "more:uikitCustomize", hidden: true });
    const note = document.querySelector(".uikit-ins-feedback")?.textContent || "";
    const moved = ed.command("move", { id: "more:walk", parent: "panel:tb-start", index: 0 });
    const escapeNote = document.querySelector(".uikit-ins-feedback")?.textContent || "";
    return {
      moreKids,
      walkUnderMore: moreKids.includes("more:walk"),
      walkSource: walk && walk.source,
      walkRef: ui.doc.nodes["more:walk"] && ui.doc.nodes["more:walk"].ref,
      distinctLaunch: !!(launch && moreLaunch && launch.id !== moreLaunch.id),
      hideRefused: hidden === false,
      hideNote: note,
      moved,
      escapeNote,
      kind: document.querySelector(".uikit-ins-kind")?.textContent || "",
    };
  });
  assert.equal(result.walkUnderMore, true, "Walk lives under More");
  assert.equal(result.walkSource, "act:walk");
  assert.equal(result.walkRef, "more:walk");
  assert.equal(result.distinctLaunch, true, "toolbar Model editor and More Model editor are different nodes");
  assert.equal(result.hideRefused, true, "hiding Customize Interface is refused");
  assert.match(result.hideNote, /remain available/i);
  assert.equal(result.moved, true);
  assert.match(result.escapeNote, /responsive|appearance|visibility/i);
});

test("dividers are nodes: File tree shows one and Add divider inserts another", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const ed = window.__ed;
    const tree = document.querySelector(".uikit-ins-tree");
    tree.open = true;
    tree.dispatchEvent(new Event("toggle"));
    await window.__frame();
    const fileKids = ui.doc.nodes["menu:file"].children.slice();
    const sepAt = fileKids.indexOf("sep:file-1");
    const room = fileKids[sepAt - 1];
    const reset = fileKids[sepAt + 1];
    const sepEl = document.querySelector('[data-uikit-id="sep:file-1"]');
    ed.command("move", { id: "sep:file-1", parent: "menu:file", index: 0 });
    await window.__frame();
    const afterMove = ui.doc.nodes["menu:file"].children[0];
    const sepElAfter = document.querySelector('[data-uikit-id="sep:file-1"]');
    const { menuItemsFor } = await import("/js/uikit_host/panels.js");
    const menuEl = menuItemsFor(document, "menu_file", 0)();
    const firstIsSep = menuEl && menuEl.firstElementChild === sepElAfter;
    ed.command("select", { id: "menu:export" });
    const added = ed.command("insertSeparator");
    await window.__frame();
    const exportKids = ui.doc.nodes["menu:export"].children;
    const created = exportKids.find((id) => String(id).indexOf("sep:user-") === 0);
    const createdEl = created ? document.querySelector('[data-uikit-id="' + created + '"]') : null;
    return {
      sepAt,
      room,
      reset,
      hasSepRow: !!document.querySelector('.uikit-ins-tree-row[data-node-id="sep:file-1"]'),
      afterMove,
      firstIsSep,
      added,
      created,
      createdClass: createdEl && createdEl.className,
      createdRole: createdEl && createdEl.getAttribute("role"),
    };
  });
  assert.ok(result.sepAt > 0);
  assert.equal(result.room, "act:roomScan");
  assert.equal(result.reset, "act:reset");
  assert.equal(result.hasSepRow, true, "File tree shows the divider");
  assert.equal(result.afterMove, "sep:file-1", "moving the divider node moves it");
  assert.equal(result.firstIsSep, true, "the real element moved with the node");
  assert.equal(result.added, true);
  assert.ok(result.created, "Add divider while Export is selected inserts a created separator");
  assert.match(result.createdClass || "", /uikit-sep/);
  assert.equal(result.createdRole, "separator");
});

test("dropping adopt on a shipped divider makes the tree row Missing", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const raw = ui.registry.raw("sep:file-1");
    const prev = raw.adopt;
    raw.adopt = () => null;
    ui.refreshNow();
    await window.__frame();
    window.__ed.command("select", { id: "sep:file-1" });
    await window.__frame();
    const tree = document.querySelector(".uikit-ins-tree");
    if (tree && !tree.open) {
      tree.open = true;
      tree.dispatchEvent(new Event("toggle"));
      await window.__frame();
    }
    const row = document.querySelector('.uikit-ins-tree-row[data-node-id="sep:file-1"]');
    const missing = !!(row && row.querySelector(".uikit-ins-tree-missing"));
    raw.adopt = prev;
    ui.refreshNow();
    return { missing };
  });
  assert.equal(result.missing, true, "a shipped divider whose adopt() is gone is Missing");
});

test("Add menu puts a real dropdown in Toolbar start that holdOpen can pin", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const ui = window.__ui;
    const surfaces = await import("/js/uikit_host/surfaces.js");
    const refused = surfaces.ensureMenu({ id: "menu:file", label: "Nope" });
    const first = surfaces.ensureMenu({ id: "menu:user-idem", label: "Once" });
    const second = surfaces.ensureMenu({ id: "menu:user-idem", label: "Once" });
    const idempotent = !!(first && second && first.adopt() === second.adopt());
    surfaces.destroyMenu("menu:user-idem");

    ed.command("select", { id: "panel:tb-start" });
    const added = ed.command("insertMenu");
    await window.__frame();
    const id = Object.keys(ui.doc.nodes).find((k) => k.indexOf("menu:user-") === 0);
    const el = id ? document.querySelector('[data-uikit-id="' + id + '"]') : null;
    ed.command("select", { id });
    await window.__frame();
    const panel = el && [...document.querySelectorAll("body > .dropdown-menu")].find((m) => m._dd === el);
    const inStart = !!(el && el.closest(".tb-start"));
    const placed = ed.command("place", {
      entry: ui.registry.get("act:png2d"),
      parent: id,
    });
    await window.__frame();
    return {
      refused: refused === null,
      idempotent,
      added,
      id,
      isDropdown: !!(el && el.classList.contains("dropdown")),
      inStart,
      open: !!(el && el.classList.contains("open")),
      panelOnBody: !!(panel && panel.parentElement === document.body),
      placed,
      childCount: id ? ui.doc.nodes[id].children.length : 0,
    };
  });
  assert.equal(result.refused, true, "ensureMenu refuses a shipped menu id");
  assert.equal(result.idempotent, true, "ensureMenu is idempotent");
  assert.equal(result.added, true);
  assert.equal(result.isDropdown, true, "a real .dropdown appears among Toolbar start children");
  assert.equal(result.inStart, true);
  assert.equal(result.open, true, "selecting it pins it via holdOpen");
  assert.equal(result.panelOnBody, true);
  assert.equal(result.placed, true, "it accepts a placed command");
  assert.equal(result.childCount, 1);
});

test("grouping two Edit items creates a submenu whose Escape pops one level", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const ui = window.__ui;
    ed.command("select", { id: "act:dupSel" });
    ed.command("select", { id: "act:deleteSel", additive: true });
    const grouped = ed.command("createSubmenu");
    await window.__frame();
    const submenuId = ((ui.doc.nodes["menu:edit"] || {}).children || []).find((id) => String(id).indexOf("menu:user-") === 0);
    const depth = submenuId ? 1 + (ui.doc.nodes[submenuId].children || []).length : 0;
    ed.command("select", { id: submenuId });
    await window.__frame();
    const sub = document.querySelector('[data-uikit-id="' + submenuId + '"]');
    const edit = document.querySelector('[data-uikit-id="menu:edit"]');
    const subPanel = [...document.querySelectorAll("body > .dropdown-menu")].find((m) => m._dd === sub);
    const editPanel = [...document.querySelectorAll("body > .dropdown-menu")].find((m) => m._dd === edit);
    const bothOpen = !!(sub && sub.classList.contains("open") && edit && edit.classList.contains("open")
      && subPanel && subPanel.classList.contains("open") && editPanel && editPanel.classList.contains("open"));
    if (subPanel) {
      subPanel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
    await window.__frame();
    const afterEsc = {
      subOpen: !!(sub && sub.classList.contains("open")),
      editOpen: !!(edit && edit.classList.contains("open") && editPanel && editPanel.classList.contains("open")),
    };
    ed.command("select", { id: submenuId });
    const ungrouped = ed.command("ungroup");
    await window.__frame();
    const editKids = ui.doc.nodes["menu:edit"].children;
    return {
      grouped,
      submenuId,
      depth,
      bothOpen,
      afterEsc,
      ungrouped,
      dupBack: editKids.includes("act:dupSel"),
      delBack: editKids.includes("act:deleteSel"),
      submenuGone: submenuId ? !ui.doc.nodes[submenuId] : false,
    };
  });
  assert.equal(result.grouped, true);
  assert.ok(result.submenuId);
  assert.ok(result.depth >= 3, "tree depth +2 under Edit (submenu + its items)");
  assert.equal(result.bothOpen, true, "open pin shows both panels");
  assert.equal(result.afterEsc.subOpen, false, "Escape pops the submenu");
  assert.equal(result.afterEsc.editOpen, true, "and leaves the parent menu open");
  assert.equal(result.ungrouped, true);
  assert.equal(result.dupBack, true);
  assert.equal(result.delBack, true);
  assert.equal(result.submenuGone, true);
});

test("phone viewport nested menus use a single sheet with Back", opts, async () => {
  const page = await designing();
  await page.resize(390, 844);
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const ui = window.__ui;
    ed.command("select", { id: "act:dupSel" });
    ed.command("select", { id: "act:deleteSel", additive: true });
    ed.command("createSubmenu");
    await window.__frame();
    const submenuId = ((ui.doc.nodes["menu:edit"] || {}).children || []).find((id) => String(id).indexOf("menu:user-") === 0);
    ed.command("select", { id: submenuId });
    await window.__frame();
    const openPanels = [...document.querySelectorAll("body > .dropdown-menu.open")];
    const back = document.querySelector("body > .dropdown-menu.open [data-menu-back]");
    return {
      openCount: openPanels.length,
      hasBack: !!back,
    };
  });
  await page.resize(1440, 900);
  assert.equal(result.openCount, 1, "phone shows one sheet at a time");
  assert.equal(result.hasBack, true, "nested sheet offers Back");
});


test("icon picker Escape closes only the picker and restores keyboard focus", opts, async () => {
  const page = await designing();
  const result = await page.eval(() => {
    window.__ed.command("select", { id: "act:undo" });
    const trigger = document.querySelector(".uikit-ins-header-icon");
    trigger.click();
    const search = document.querySelector(".uikit-ins-icon-search");
    let leaked = 0;
    const spy = () => leaked++;
    document.addEventListener("keydown", spy);
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    document.removeEventListener("keydown", spy);
    return {
      active: window.__ed.isActive(),
      picker: !!document.querySelector(".uikit-ins-icon-picker"),
      focused: document.activeElement === trigger,
      tag: trigger.tagName,
      label: trigger.getAttribute("aria-label"),
      leaked,
    };
  });
  assert.equal(result.active, true);
  assert.equal(result.picker, false);
  assert.equal(result.focused, true);
  assert.equal(result.tag, "BUTTON");
  assert.ok(result.label);
  assert.equal(result.leaked, 0, "typing in the picker never reaches host shortcuts");
});

test("icon picker closes when its selection changes or customization ends", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    window.__ed.command("select", { id: "act:undo" });
    document.querySelector(".uikit-ins-header-icon").click();
    window.__ed.command("select", { id: "act:redo" });
    const afterSelection = !!document.querySelector(".uikit-ins-icon-picker");
    document.querySelector(".uikit-ins-header-icon").click();
    await window.__ui.edit(false);
    return { afterSelection, afterExit: !!document.querySelector(".uikit-ins-icon-picker") };
  });
  assert.equal(result.afterSelection, false);
  assert.equal(result.afterExit, false);
});

test("layout tree icon picker is removed when customization ends", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    document.querySelector(".uikit-ins-tree-icon-btn").click();
    const opened = !!document.querySelector(".uikit-ins-icon-picker");
    await window.__ui.edit(false);
    return { opened, remains: !!document.querySelector(".uikit-ins-icon-picker") };
  });
  assert.equal(result.opened, true);
  assert.equal(result.remains, false);
});

/* ---- the drag preview and how far a drop can reach ------------------------
 *
 * The arithmetic is unit-tested in uikit/tests/editor_drag.test.mjs. What only
 * a browser can answer is whether the preview is actually a picture of the
 * element — a snapshot lifted out of the host's tree keeps none of the host's
 * CSS unless ghost.js carries the computed style across, and "the ghost is an
 * empty blue box" is exactly the failure this replaced.
 */
test("the drag preview is the element itself, held where the pointer grabbed it", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    /* A real adopted host control in the toolbar's start column. Picked by
       measurement rather than by index: several of that column's children are
       features this build hides, and a zero-sized node has no picture to take. */
    const id = window.__visibleChild("panel:tb-start");
    const el = document.querySelector('[data-uikit-id="' + CSS.escape(id) + '"]');
    const box = el.getBoundingClientRect();
    /* Drill to the column, so the press picks up the control rather than the
       whole toolbar section the depth rule would otherwise resolve to. */
    ed.setFocus("panel:tb-start");
    /* Grabbed deliberately off-centre, near the right-hand edge. */
    const grabX = box.left + box.width - 4;
    const grabY = box.top + 3;
    const at = (x, y) => ({ clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 });

    document.dispatchEvent(new PointerEvent("pointerdown", at(grabX, grabY)));
    document.dispatchEvent(new PointerEvent("pointermove", at(grabX + 120, grabY + 60)));
    await window.__frame();

    const ghost = document.querySelector(".uikit-ed-ghost");
    const shot = ghost && ghost.querySelector(".uikit-ed-ghost-shot");
    const ghostBox = ghost.getBoundingClientRect();
    const shotStyle = shot ? getComputedStyle(shot.firstElementChild) : null;
    const sourceStyle = getComputedStyle(el);
    const out = {
      hasShot: !!shot,
      /* the same words, not a label the editor invented */
      shotText: shot ? shot.textContent.replace(/\s+/g, " ").trim() : "",
      sourceText: el.textContent.replace(/\s+/g, " ").trim(),
      shotColor: shotStyle ? shotStyle.color : null,
      sourceColor: sourceStyle.color,
      shotFont: shotStyle ? shotStyle.fontFamily : null,
      sourceFont: sourceStyle.fontFamily,
      /* the grabbed pixel is still under the pointer */
      gripX: Math.round(grabX + 120 - ghostBox.left),
      gripY: Math.round(grabY + 60 - ghostBox.top),
      expectX: Math.round(grabX - box.left),
      expectY: Math.round(grabY - box.top),
      width: Math.round(ghostBox.width),
      sourceWidth: Math.round(box.width),
      // Selection may cause the host to replace an adopted control. Assert
      // the visible source, rather than a reference captured before selection.
      lifted: !!document.querySelector('[data-uikit-id="' + CSS.escape(id) + '"]')?.hasAttribute("data-uikit-lifted"),
      dragSource: { id, selected: ed.selection(), connected: el.isConnected,
        lifted: [...document.querySelectorAll('[data-uikit-lifted]')].map(node=>node.getAttribute('data-uikit-id')) },
      cursor: document.documentElement.style.cursor,
      /* the copy must not be addressable, or a label's `for` follows it */
      idsInShot: shot ? shot.querySelectorAll("[id], [data-uikit-id]").length : -1,
    };

    document.dispatchEvent(new PointerEvent("pointerup", at(grabX + 120, grabY + 60)));
    await window.__frame();
    out.ghostsAfter = document.querySelectorAll(".uikit-ed-ghost").length;
    out.liftedAfter = document.querySelectorAll("[data-uikit-lifted]").length;
    out.cursorAfter = document.documentElement.style.cursor;
    return out;
  });

  assert.equal(result.hasShot, true, "the preview carries a snapshot, not just an outline");
  assert.equal(result.shotText, result.sourceText, "and the snapshot is the element's own content");
  assert.equal(result.shotColor, result.sourceColor, "computed style crossed with it");
  assert.equal(result.shotFont, result.sourceFont);
  assert.equal(result.width, result.sourceWidth, "shown at the size it really is");
  assert.equal(result.gripX, result.expectX, "the grabbed pixel is still under the pointer");
  assert.equal(result.gripY, result.expectY);
  assert.equal(result.lifted, true, "the original is dimmed while its copy is carried: " + JSON.stringify(result.dragSource));
  assert.equal(result.cursor, "grabbing");
  assert.equal(result.idsInShot, 0, "nothing in the copy can be addressed");
  assert.equal(result.ghostsAfter, 0, "and it is all gone on release");
  assert.equal(result.liftedAfter, 0);
  assert.equal(result.cursorAfter, "");
});

test("a drop that misses every container reaches for the nearest one that fits", opts, async () => {
  const page = await designing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const id = window.__visibleChild("panel:tb-start");
    const el = document.querySelector('[data-uikit-id="' + CSS.escape(id) + '"]');
    const box = el.getBoundingClientRect();
    const bar = document.getElementById("topbar").getBoundingClientRect();
    ed.setFocus("panel:tb-start");
    const at = (x, y) => ({ clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 });

    document.dispatchEvent(new PointerEvent("pointerdown",
      at(box.left + box.width / 2, box.top + box.height / 2)));
    /* Into the gutter below the toolbar — over nothing that accepts a command.
       The old editor showed no indicator and dropped nothing at all here. */
    const overX = bar.right - 60;
    const overY = bar.bottom + 14;
    document.dispatchEvent(new PointerEvent("pointermove", at(overX, overY)));
    await window.__frame();
    const snapped = !!document.querySelector(".uikit-ed-ghost-snapped");
    const target = !!document.querySelector(".uikit-ed-target");
    const parentBefore = window.__ui.doc.nodes["panel:tb-start"].children.slice();
    document.dispatchEvent(new PointerEvent("pointerup", at(overX, overY)));
    await window.__frame();
    return {
      snapped, target, parentBefore,
      moved: ed.selection()[0],
      parentAfter: window.__ui.doc.nodes["panel:tb-start"].children.slice(),
      id,
    };
  });

  assert.equal(result.target, true, "a target is shown rather than the gesture dying in the gutter");
  assert.equal(result.snapped, true, "and the preview says the target was reached for, not landed on");
  assert.equal(result.moved, result.id, "the drop committed, and the moved node stays selected");
  assert.notDeepEqual(result.parentAfter, result.parentBefore,
    "it left the column it started in, rather than the gesture being dropped");
});
