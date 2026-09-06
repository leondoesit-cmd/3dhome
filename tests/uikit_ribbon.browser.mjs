/* Phase-7 gate: the model editor's ribbon, which is generated DOM.
 *
 * Every other surface uikit adopts is markup that exists before it starts and
 * outlives it. The ribbon is a string: buildDOM() writes it when the editor
 * opens, removes it when the editor closes, and throws it away and rebuilds it
 * on a language change because every caption in it is baked in at build time.
 * So the elements a saved layout points at are absent for most of a session,
 * come back as DIFFERENT elements, and disappear underneath uikit rather than
 * with it.
 *
 * What is under test is that none of that needed a new capability — only the
 * stable identity js/modeler.js was not emitting. The pieces come from the plan
 * dock: slots that register at runtime, and a container whose slot is absent
 * rendering nothing.
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

async function planner() {
  if (!shared) shared = await openPage({ width: 1440, height: 900 });
  await shared.goto("/");
  await shared.eval(() => {
    localStorage.removeItem("mf_uikit");
    localStorage.removeItem("home3d_uikit:planner");
    localStorage.removeItem("home3d_modeler_prefs");
  });
  await shared.goto("/");
  await shared.eval(async () => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    const host = await import("/js/uikit_host/index.js");
    window.__ui = host.initUIKit({ force: true });
    window.__ui.refreshNow();
    window.__host = host;
    window.__groups = () => [...document.querySelectorAll("[data-mdgroup]")]
      .map((e) => e.getAttribute("data-mdgroup"));
    window.__paneKids = (pane) =>
      [...document.querySelector('[data-command-pane="' + pane + '"]').children]
        .map((e) => e.getAttribute("data-uikit-id"));
    window.__frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  });
  return shared;
}

async function openEditor(page) {
  await page.eval(() => {
    window.confirm = () => true;
    document.getElementById("openModelerTop").click();
  });
  await page.waitUntil(() => {
    const el = document.getElementById("modeler");
    return !!el && getComputedStyle(el).display !== "none";
  }, { what: "the model editor to open" });
  await page.eval(async () => {
    const welcome = document.getElementById("mdWelcome");
    if (welcome && !welcome.hidden) welcome.hidden = true;
    await window.__frame();
  });
}

async function closeEditor(page) {
  await page.eval(async () => {
    window.confirm = () => true;
    const m = await import("/js/modeler.js");
    m.closeModeler();
    await window.__frame();
  });
}

test("with the editor closed, the ribbon's containers render nothing at all", opts, async () => {
  const page = await planner();
  const result = await page.eval(() => ({
    modeler: !!document.getElementById("modeler"),
    missing: window.__ui.missingSlots().map((m) => m.slot).filter((s) => s.startsWith("md:")).sort(),
    tagged: document.querySelectorAll('[data-uikit-id^="md:"]').length,
    strays: document.querySelectorAll("#app > .uikit-node").length,
    inDoc: Object.keys(window.__ui.doc.nodes).filter((k) => k.startsWith("n:md-")).length,
  }));

  assert.equal(result.modeler, false, "the editor has never been opened");
  assert.equal(result.inDoc, 4, "the document describes four panes all the same");
  assert.deepEqual(result.missing, ["md:assembly", "md:evaluate", "md:features", "md:sketch"],
    "and reports them as skipped rather than pretending");
  assert.equal(result.tagged, 0);
  assert.equal(result.strays, 0, "nothing fell back to a box in the app shell");
});

test("opening the editor brings the ribbon into the layout, unchanged", opts, async () => {
  const page = await planner();
  const before = await page.eval(() => document.querySelectorAll("[data-mdgroup]").length);
  assert.equal(before, 0);

  await openEditor(page);
  const result = await page.eval(async () => {
    await window.__frame();
    const pane = document.querySelector('[data-command-pane="features"]');
    return {
      groups: window.__groups(),
      slots: [...document.querySelectorAll('[data-uikit-slot^="md:"]')]
        .map((e) => e.getAttribute("data-uikit-slot")).sort(),
      features: window.__paneKids("features"),
      tagged: document.querySelectorAll('[data-uikit-id^="md:"]').length,
      created: pane.querySelectorAll(".uikit-node").length,
      missing: window.__ui.missingSlots().filter((m) => m.slot.startsWith("md:")).length,
      firstLabel: pane.querySelector(".md-command-group-label").textContent,
    };
  });

  assert.equal(result.groups.length, 14, "all fourteen groups carry their key");
  assert.deepEqual(result.slots, ["md:assembly", "md:evaluate", "md:features", "md:sketch"]);
  assert.deepEqual(result.features,
    ["md:grpStart", "md:grpFinish", "md:grpDirect", "md:grpReferences", "md:grpStandards"],
    "in the order buildDOM emits them, now as document nodes");
  assert.equal(result.tagged, 14);
  assert.equal(result.created, 0, "uikit made no element: the groups are the editor's own");
  assert.equal(result.missing, 0);
  assert.ok(result.firstLabel.length, "and the group still shows its translated label");
  await closeEditor(page);
});

/* Closing the editor HIDES its root; it does not remove it. The chrome is only
   thrown away when the language changes, because that is the one thing that
   invalidates the captions baked into it. Both paths matter and they are
   different: hidden means uikit is still holding live elements, removed means
   it must have let go of them first. */
test("a saved arrangement reaches the real ribbon, and survives being hidden", opts, async () => {
  const page = await planner();
  await openEditor(page);
  const moved = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const ui = window.__ui;
    ui.apply("Reorder", ops.reorder(ui.doc, { id: "md:grpStandards", index: 0 }));
    ui.refreshNow();
    await window.__frame();
    return { kids: window.__paneKids("features"), el: !!document.querySelector('[data-mdgroup="grpStandards"]') };
  });
  assert.equal(moved.kids[0], "md:grpStandards", "the group moved to the front of its pane");

  await closeEditor(page);
  const closed = await page.eval(() => ({
    present: !!document.getElementById("modeler"),
    visible: getComputedStyle(document.getElementById("modeler")).display !== "none",
    slots: document.querySelectorAll('[data-uikit-slot^="md:"]').length,
    kids: window.__paneKids("features"),
  }));
  assert.ok(closed.present, "the editor keeps its chrome to reopen into");
  assert.equal(closed.visible, false, "it is hidden, not destroyed");
  assert.equal(closed.slots, 4, "so the slots are still real and still registered");
  assert.equal(closed.kids[0], "md:grpStandards", "and the arrangement is still on it");

  await openEditor(page);
  const reopened = await page.eval(async () => {
    await window.__frame();
    return { kids: window.__paneKids("features"), groups: window.__groups().length };
  });
  assert.equal(reopened.groups, 14);
  assert.equal(reopened.kids[0], "md:grpStandards", "and reopening changes nothing about it");
  await closeEditor(page);
});

test("when the chrome is destroyed, uikit lets go of it first", opts, async () => {
  const page = await planner();
  await openEditor(page);
  const result = await page.eval(async () => {
    await window.__frame();
    const held = window.__ui.adopter.size();

    /* The one thing that really removes the ribbon: a language change makes
       the next open rebuild it, and destroyDOM() drops the root. If uikit were
       still holding those elements at that moment, its teardown would try to
       restore them into a tree that no longer exists. */
    window.confirm = () => true;
    const i18n = await import("/js/i18n.js");
    await i18n.setLang(i18n.getLang() === "he" ? "en" : "he");
    const m = await import("/js/modeler.js");
    m.closeModeler();
    m.openModeler();
    await window.__frame();
    const rebuilt = document.querySelectorAll('[data-uikit-id^="md:"]').length;
    m.closeModeler();

    const problems = window.__host.teardownUIKit();
    await i18n.setLang("en");
    return {
      held, rebuilt, problems,
      leftovers: document.querySelectorAll(".uikit-node, .uikit-slot").length,
      stray: document.querySelectorAll("[data-uikit-id]").length,
    };
  });

  assert.ok(result.held > 0, "the editor's groups really were adopted");
  assert.equal(result.rebuilt, 14, "the rebuilt ribbon was adopted again, cleanly");
  assert.deepEqual(result.problems, [], "nothing was left holding a detached element");
  assert.equal(result.leftovers, 0);
  assert.equal(result.stray, 0, "and no element kept a uikit identity");
});

test("a language change rebuilds the ribbon, and the layout follows it", opts, async () => {
  const page = await planner();
  await openEditor(page);
  const result = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const ui = window.__ui;
    ui.apply("Reorder", ops.reorder(ui.doc, { id: "md:grpFinish", index: 0 }));
    ui.refreshNow();
    await window.__frame();
    const before = {
      kids: window.__paneKids("features"),
      label: document.querySelector('[data-mdgroup="grpFinish"] .md-command-group-label').textContent,
      el: document.querySelector('[data-mdgroup="grpFinish"]'),
    };

    /* The editor throws its whole chrome away on a language switch, because
       every caption in it was baked in at build time. The next open builds a
       brand new ribbon — different elements, same keys. */
    window.confirm = () => true;
    const i18n = await import("/js/i18n.js");
    await i18n.setLang(i18n.getLang() === "he" ? "en" : "he");
    const m = await import("/js/modeler.js");
    m.closeModeler();
    await window.__frame();
    return { before: { kids: before.kids, label: before.label }, sameEl: before.el };
  });

  await openEditor(page);
  const after = await page.eval(async () => {
    await window.__frame();
    const el = document.querySelector('[data-mdgroup="grpFinish"]');
    return {
      kids: window.__paneKids("features"),
      label: el.querySelector(".md-command-group-label").textContent,
      rebuilt: el !== window.__lastFinish,
    };
  });

  assert.deepEqual(after.kids, result.before.kids,
    "the arrangement survived the rebuild — the key is what a layout points at, not the words");
  assert.notEqual(after.label, result.before.label,
    "and the group really is showing the other language now");
  await page.eval(async () => {
    const i18n = await import("/js/i18n.js");
    await i18n.setLang("en");
  });
  await closeEditor(page);
});

test("all fourteen ribbon groups are containers holding their buttons inside .md-command-items", opts, async () => {
  const page = await planner();
  await openEditor(page);
  const result = await page.eval(async () => {
    await window.__frame();
    const r = await import("/js/uikit_host/ribbon.js");
    const ui = window.__ui;
    const doc = ui.doc;
    const groups = r.GROUPS;
    let totalButtons = 0;
    const missingButtons = [];
    const misplacedButtons = [];
    const groupChecks = [];

    for (const group of groups) {
      const gNode = doc.nodes[r.groupNodeId(group.key)];
      const expectedButtons = r.RIBBON_BUTTONS[group.key] || [];
      const gEl = document.querySelector(`[data-uikit-id="md:${group.key}"]`);
      const itemsEl = gEl ? gEl.querySelector(".md-command-items") : null;
      const groupOk = gNode && gNode.type === "group" && Array.isArray(gNode.children);
      groupChecks.push({ key: group.key, isGroup: groupOk, childCount: gNode?.children?.length || 0, expected: expectedButtons.length });

      for (const b of expectedButtons) {
        totalButtons++;
        const bid = r.groupButtonNodeId(group.key, b.id);
        const bEl = document.querySelector(`[data-uikit-id="${bid}"]`);
        if (!bEl) {
          missingButtons.push(bid);
        } else if (bEl.parentElement !== itemsEl) {
          misplacedButtons.push(bid);
        } else if (!bEl.classList.contains("md-command")) {
          missingButtons.push(bid + ":not-adopted");
        }
      }
    }

    return {
      groupCount: groups.length,
      groupChecks,
      totalButtons,
      missingButtons,
      misplacedButtons,
      createdButtons: document.querySelectorAll(".md-command-items .uikit-node").length,
      taggedButtons: document.querySelectorAll('[data-uikit-id^="cmd:"]').length,
      /* Counted from the RIBBON built on the page, not from RIBBON_BUTTONS.
         Every other number here descends from that table — totalButtons IS the
         table, and a tagged button exists only because the table adopted it —
         so without this one the test cannot see a button the table missed. */
      domButtons: document.querySelectorAll(".md-command-items .md-command").length,
    };
  });

  assert.equal(result.groupCount, 14, "fourteen groups checked");
  assert.equal(result.totalButtons, 76, "76 ribbon buttons across all 14 groups");
  assert.equal(result.taggedButtons, 76, "all 76 buttons adopted with data-uikit-id");
  /* The converse of the assertion above, and the one that catches drift the
     other direction: buildDOM() is a string in js/modeler.js and RIBBON_BUTTONS
     is a static table describing it. Add a fifteenth button to a group and
     every count here still agrees with itself — the table would simply not
     claim it, and the structure browser would quietly show that group short by
     one. This is the only number in the test the table cannot move. */
  assert.equal(result.domButtons, result.totalButtons,
    "the table claims every button the ribbon actually builds");
  assert.equal(result.createdButtons, 0, "uikit created no placeholder elements in .md-command-items");
  assert.deepEqual(result.missingButtons, [], "all buttons are real adopted host buttons");
  assert.deepEqual(result.misplacedButtons, [], "all buttons placed inside .md-command-items");
  for (const check of result.groupChecks) {
    assert.equal(check.isGroup, true, `group ${check.key} is a container`);
    assert.equal(check.childCount, check.expected, `group ${check.key} has expected child count`);
  }
  await closeEditor(page);
});

test("reordering buttons within a ribbon group updates .md-command-items in the DOM while keeping the group label intact", opts, async () => {
  const page = await planner();
  await openEditor(page);
  const result = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const ui = window.__ui;
    // Move revolvefeature to the first position in grpStart
    ui.apply("Reorder", ops.reorder(ui.doc, { id: "cmd:grpStart:revolvefeature", index: 0 }));
    ui.refreshNow();
    await window.__frame();

    const grpEl = document.querySelector('[data-mdgroup="grpStart"]');
    const itemsEl = grpEl.querySelector(".md-command-items");
    const labelEl = grpEl.querySelector(".md-command-group-label");
    const firstButtonId = itemsEl.firstElementChild.getAttribute("data-uikit-id");
    const labelText = labelEl ? labelEl.textContent.trim() : null;

    // Check click invokes action
    let clicked = false;
    const btn = itemsEl.firstElementChild;
    btn.addEventListener("click", () => { clicked = true; }, { once: true });
    ui.registry.get("cmd:grpStart:revolvefeature").run();

    return {
      firstButtonId,
      labelText,
      clicked,
      childrenInDoc: ui.doc.nodes["md:grpStart"].children.slice(0, 3),
    };
  });

  assert.equal(result.firstButtonId, "cmd:grpStart:revolvefeature", "revolvefeature is first in .md-command-items");
  assert.equal(result.childrenInDoc[0], "cmd:grpStart:revolvefeature", "revolvefeature is first in doc node children");
  assert.equal(result.labelText, "Start", "group label remains Start and was not displaced");
  assert.equal(result.clicked, true, "running command entry clicks adopted button");
  await closeEditor(page);
});

test("moving a ribbon button out of its group warns in the inspector note", opts, async () => {
  const page = await planner();
  await openEditor(page);
  const result = await page.eval(async () => {
    window.__runAction("uikitCustomize");
    for (let i = 0; i < 400 && !document.querySelector(".uikit-ins"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const host = await import("/js/uikit_host/index.js");
    const ui = host.activeUIKit();
    const ed = ui.editor;
    await window.__frame();

    // Move extrude button out of grpStart to panel:tb-end
    const moved = ed.command("move", { id: "cmd:grpStart:extrude", parent: "panel:tb-end", index: 0 });
    await window.__frame();

    const noteText = document.querySelector(".uikit-ins-note")?.textContent || "";
    const parentNodeId = ui.doc.nodes["cmd:grpStart:extrude"]
      ? ui.doc.nodes["panel:tb-end"].children[0]
      : null;

    // Close customize mode
    const doneBtn = document.querySelector(".uikit-ins-actions button");
    if (doneBtn) doneBtn.click();
    await window.__frame();

    return {
      moved,
      noteText,
      parentNodeId,
    };
  });

  assert.equal(result.moved, true, "moving ribbon button to panel:tb-end succeeded");
  assert.equal(result.parentNodeId, "cmd:grpStart:extrude", "extrude was moved into panel:tb-end");
  assert.equal(result.noteText, "Moving this item out of its container may alter its responsive visibility or appearance.",
    "escape warning is shown when ribbon button leaves its container");
  await closeEditor(page);
});

test("button arrangement inside a ribbon group survives language switch and DOM rebuild", opts, async () => {
  const page = await planner();
  await openEditor(page);
  const result = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const ui = window.__ui;
    // Move booleanfeature to index 0 in grpFinish
    ui.apply("Reorder", ops.reorder(ui.doc, { id: "cmd:grpFinish:booleanfeature", index: 0 }));
    ui.refreshNow();
    await window.__frame();

    const beforeEl = document.querySelector('[data-uikit-id="cmd:grpFinish:booleanfeature"]');

    // Change language to Hebrew - causes modeler DOM to be destroyed and rebuilt on next open
    window.confirm = () => true;
    const i18n = await import("/js/i18n.js");
    await i18n.setLang("he");
    const m = await import("/js/modeler.js");
    m.closeModeler();
    await window.__frame();
    return { beforeElPresent: !!beforeEl };
  });

  assert.equal(result.beforeElPresent, true);

  await openEditor(page);
  const after = await page.eval(async () => {
    await window.__frame();
    const grpEl = document.querySelector('[data-mdgroup="grpFinish"]');
    const itemsEl = grpEl.querySelector(".md-command-items");
    const firstButtonId = itemsEl.firstElementChild.getAttribute("data-uikit-id");
    const buttonLabel = itemsEl.firstElementChild.textContent.trim();
    const groupLabel = grpEl.querySelector(".md-command-group-label").textContent.trim();

    return {
      firstButtonId,
      buttonLabel,
      groupLabel,
      totalTagged: document.querySelectorAll('[data-uikit-id^="cmd:"]').length,
    };
  });

  assert.equal(after.firstButtonId, "cmd:grpFinish:booleanfeature", "booleanfeature is still first after language rebuild");
  assert.equal(after.groupLabel, "גימור", "group label is in Hebrew");
  assert.equal(after.buttonLabel, "בוליאני", "button label is in Hebrew");
  assert.equal(after.totalTagged, 76, "all 76 ribbon buttons re-adopted after rebuild");

  await page.eval(async () => {
    const i18n = await import("/js/i18n.js");
    await i18n.setLang("en");
  });
  await closeEditor(page);
});

