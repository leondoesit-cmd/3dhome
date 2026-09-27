/* Phase-3 gate: the layout document describes the real chrome, and rendering
 * it changes nothing.
 *
 * This phase ships nothing a user can see, on purpose, so "it works" cannot be
 * judged by looking at it. What can be judged is that the chrome is
 * pixel-identical with the flag on and off, that the host's own CSS still
 * matches the same elements, and that the document is nonetheless live enough
 * to move something when asked. All three are asserted here against the real
 * index.html, not a fixture — a parity claim made against a fixture is a claim
 * about the fixture.
 *
 * The left-pane switcher gets its own test because it is the specific thing
 * this design was chosen to protect. It is
 *
 *     #left-sidebar > .panel-section            { display: none }
 *     #left-sidebar[data-left="x"] > [data-left-pane="x"] { display: flex }
 *
 * and it works only while those panels are DIRECT children of #left-sidebar.
 * The obvious renderer — one wrapper div per node — breaks it and shows every
 * pane at once, which is why adopted elements are never wrapped.
 */
import test from "./helpers/customize_gate.mjs"; // skipped while UI Customize is off
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

let shared = null;

test.after(async () => {
  if (shared) await shared.close();
});

/* Boots the planner with the flag OFF, so every test starts from the shipped
   chrome and turns uikit on itself. Enabling it through localStorage before
   load would test a different thing — boot order — and hide a difference that
   only appears when the two states exist in one page. */
async function planner(width = 1440, height = 900) {
  if (!shared) shared = await openPage({ width, height });
  else await shared.resize(width, height);
  await shared.goto("/");
  await shared.eval(() => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    /* main.js only imports the host adapter when mf_uikit is set, and these
       tests deliberately boot with it off — so the module has to be pulled in
       here rather than read off the global it would otherwise install. */
    window.__host = () => window.__hostMod
      || (window.__hostMod = import("/js/uikit_host/index.js").then((m) => (window.__hostMod = m)));
    window.__snap = () => {
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.left * 100) / 100, y: Math.round(r.top * 100) / 100,
          w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100,
          display: getComputedStyle(el).display,
        };
      };
      const sel = [
        "#topbar", "#topbar .tb-start", "#topbar .tb-center", "#topbar .tb-end",
        "#left-sidebar", "#leftTabs",
        "#left-sidebar .panel-section.furn-panel",
        "#left-sidebar .panel-section.sh-section",
        "#left-sidebar .panel-section.mep-section",
        "#paramSection",
        "#left-sidebar .panel-section.warn-section",
        "#left-sidebar .panel-section.flex-fill",
        "#center-canvas", "#right-inspector",
      ];
      const out = {};
      for (const s of sel) out[s] = box(document.querySelector(s));
      // parentage and order, which a bounding box alone would not notice
      out.__topbarKids = [...document.getElementById("topbar").children].map((e) => e.className);
      out.__leftKids = [...document.getElementById("left-sidebar").children]
        .map((e) => e.id || e.className);
      return out;
    };
    return true;
  });
  return shared;
}

async function mountUikit(page) {
  return page.eval(async () => {
    const host = await window.__host();
    const ui = host.initUIKit({ force: true });
    if (!ui) throw new Error("initUIKit returned null");
    ui.refreshNow();
    return { problems: ui.problems, registry: ui.doc ? Object.keys(ui.doc.nodes).length : 0 };
  });
}

test("the shipped chrome is pixel-identical with the layout applied", opts, async () => {
  const page = await planner();
  const before = await page.eval(() => window.__snap());
  const mounted = await mountUikit(page);
  const after = await page.eval(() => window.__snap());

  assert.deepEqual(mounted.problems, [], "the shipped layout document is clean");
  assert.deepEqual(after, before, "every measured box, display and child order is unchanged");
});

test("the left-pane switcher still matches, because nothing was wrapped", opts, async () => {
  const page = await planner();
  await mountUikit(page);
  const result = await page.eval(() => {
    const left = document.getElementById("left-sidebar");
    const panes = [...left.querySelectorAll(".panel-section")];
    // every panel section is still a DIRECT child; that is what the rule needs
    const direct = panes.every((p) => p.parentElement === left);
    const visibleFor = (which) => {
      left.setAttribute("data-left", which);
      return panes.filter((p) => getComputedStyle(p).display !== "none")
        .map((p) => p.getAttribute("data-left-pane"));
    };
    return {
      direct,
      library: visibleFor("library"),
      tree: visibleFor("tree"),
      structure: visibleFor("structure"),
      wrappers: left.querySelectorAll(":scope > div.uikit-node").length,
    };
  });

  assert.ok(result.direct, "panel sections are still direct children of #left-sidebar");
  assert.equal(result.wrappers, 0, "uikit created no element inside the sidebar");
  assert.deepEqual(result.library, ["library"], "exactly one pane shows");
  assert.deepEqual(result.tree, ["tree"]);
  assert.deepEqual(result.structure, ["structure", "structure", "structure"],
    "the three structure panes, and only those");
});

test("uikit adds no element to the document and tags only what it borrowed", opts, async () => {
  const page = await planner();
  const result = await page.eval(async () => {
    /* By element IDENTITY, not by a count taken either side of an await.
       Loading the host module yields to the event loop, and the app is still
       working during it — icon_settings swaps every <i class="ph"> for an
       inline <svg>, which adds elements uikit had nothing to do with. A count
       straddling that measures the app, not this module. So: load first, then
       snapshot, then mount synchronously.

       Counted inside <body>, because that is where the claim lives. uikit does
       add exactly one element to <head> — its stylesheet — and that is both
       intended and load-bearing: without it the customize overlay has no
       `pointer-events: none` and swallows every click in the app. */
    const host = await window.__host();
    const before = new Set([...document.body.getElementsByTagName("*")]);
    const ui = host.initUIKit({ force: true });
    ui.refreshNow();
    const added = [...document.body.getElementsByTagName("*")].filter((e) => !before.has(e));
    return {
      added: added.map((e) => e.tagName.toLowerCase() + "." + (e.className || "")),
      created: document.body.querySelectorAll(".uikit-node, .uikit-slot").length,
      stylesheets: document.head.querySelectorAll("#uikit-stylesheet").length,
      tagged: [...document.querySelectorAll("[data-uikit-id]")].map((e) => e.getAttribute("data-uikit-id")).sort(),
    };
  });

  assert.deepEqual(result.added, [], "not one element was added to the UI");
  assert.equal(result.stylesheets, 1, "and exactly one stylesheet, in head, where it belongs");
  assert.equal(result.created, 0, "the whole render is borrowed elements");
  assert.deepEqual(result.tagged, [
    /* The topbar's three columns, deep-adopted: `act:` where the button has
       its own data-act, `btn:` where it has none, `menu:` for a dropdown
       wrapper, `grp:` for a region that is one control rather than several. */
    "act:addFloor", "act:autoGenerate", "act:deleteSel",
    "act:dupSel", "act:exportgltf", "act:exportjson",
    "act:groupItems", "act:importBlueprint", "act:importBlueprintTrace",
    "act:importjson", "act:lang", "act:load",
    "act:newPlan", "act:openModeler", "act:openTextureGallery",
    "act:png2d", "act:png3d", "act:redo",
    "act:reset", "act:roomScan", "act:save",
    "act:shortcuts", "act:undo", "act:ungroupItems",
    "act:workspace", "btn:agent", "btn:friends",
    "btn:plannerGuide", "btn:redo", "btn:settings",
    "btn:theme", "btn:undo", "btn:videoStudio",
    "grp:playModes", "grp:toolSearch", "grp:viewModes",
    "menu:edit", "menu:export", "menu:file",
    "menu:history", "menu:more", "more:agent",
    "more:autoGenerate", "more:friends", "more:lava",
    "more:openModeler", "more:openTextureGallery", "more:photo",
    "more:rc", "more:toggleLegacy", "more:uikitCustomize",
    "more:walk", "more:zombies", "n:app",
    "n:left", "n:pt-bottom", "n:pt-bottom-left",
    "n:pt-bottom-right", "n:pt-left", "n:pt-right",
    "n:pt-top", "n:pt-top-left", "n:pt-top-right",
    "n:right", "n:topbar", "panel:cost",
    "panel:environment", "panel:friends", "panel:inspectorMain",
    "panel:leftTabs", "panel:library", "panel:mep",
    "panel:params", "panel:planningGuide", "panel:site", "panel:smarthome",
    "panel:tb-center", "panel:tb-end", "panel:tb-start",
    "panel:tree", "panel:warnings", "pt:layers",
    "pt:rooms", "pt:status", "pt:tools", "pt:walls",
    "sep:edit-1", "sep:edit-2", "sep:file-1",
    "sep:more-1", "sep:more-2", "tab:home", "tab:library", "tab:project", "tab:structure",
    "tab:tree",
  ], "every node in the document, and nothing else");
});

test("the registry finds the app's real commands, through its one dispatcher", opts, async () => {
  const page = await planner();
  const result = await page.eval(async () => {
    const host = await window.__host();
    const reg = host.createHostRegistry(document, {});
    const ids = reg.ids();
    const save = reg.get("act:save");
    let ran = null;
    const spy = host.createHostRegistry(document, { run: (act) => { ran = act; } });
    spy.get("act:save").run();
    return {
      total: ids.length,
      hasSave: !!save,
      saveTitle: save && save.title,
      saveIcon: save && save.icon,
      hasPanels: ids.filter((i) => i.startsWith("panel:")).length,
      commands: ids.filter((i) => i.startsWith("act:")).length,
      ran,
    };
  });

  assert.ok(result.commands >= 140, "found the app's data-act catalogue: " + result.commands);
  assert.equal(result.hasPanels, 16, "including the project guide container");
  assert.ok(result.hasSave);
  assert.ok(result.saveTitle && result.saveTitle.length, "labels come from the page, in the active language");
  assert.equal(result.saveIcon, "ph-floppy-disk", "and icons from the button or the curated list");
  assert.equal(result.ran, "act:save".slice(4), "run() goes through the host's single dispatcher");
});

/* The topbar's columns are the only containers whose CHILDREN the layout
 * names, so they are the only place where syncChildren has to reorder around
 * elements it does not own. .tb-end has four of those, and they sit in the two
 * positions that matter: a .separator in the middle of the claimed run, and
 * #toggle-right plus two hidden file inputs trailing after the last claimed
 * child — the exact spot where a cursor that skips without removing, or one
 * that removes without checking, gets it wrong.
 *
 * Asserted as the full child list rather than "they are still present",
 * because present-but-reordered is the failure this is guarding against and a
 * containment check would pass on it. */
test("adopting a column's children leaves the host's own plumbing where it was", opts, async () => {
  const page = await planner();
  const result = await page.eval(async () => {
    const naming = (el) => el.id || el.getAttribute("data-uikit-id") || el.className || el.tagName;
    const order = (sel) => [...document.querySelector(sel).children].map(naming);

    const endBefore = order("#topbar .tb-end");
    const centerBefore = order("#topbar .tb-center");

    const ui = (await window.__host()).initUIKit({ force: true });
    ui.refreshNow();

    return {
      endBefore,
      endAfter: order("#topbar .tb-end"),
      centerBefore,
      centerAfter: order("#topbar .tb-center"),
      /* The four in .tb-end and the one in .tb-center that the layout never
         names: none of them may be tagged, because a tag is the loan uikit
         takes and it has not borrowed these. */
      untagged: ["importfile", "texInput", "toggle-right", "m-top-selection"]
        .map((id) => {
          const el = document.getElementById(id);
          return id + ":" + (!el ? "missing" : (el.hasAttribute("data-uikit-id") ? "TAGGED" : "clean"));
        }),
    };
  });

  assert.deepEqual(result.endAfter, result.endBefore,
    ".tb-end kept every child, claimed and unclaimed, in its original order");
  assert.deepEqual(result.centerAfter, result.centerBefore,
    ".tb-center did too, around the phone-only title mirror it does not claim");
  assert.deepEqual(result.untagged,
    ["importfile:clean", "texInput:clean", "toggle-right:clean", "m-top-selection:clean"],
    "and the host's own plumbing was never borrowed");
});

test("the document is live: an op really moves the host's own panel", opts, async () => {
  const page = await planner();
  const result = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const ui = (await window.__host()).initUIKit({ force: true });
    ui.refreshNow();

    const left = document.getElementById("left-sidebar");
    const tree = document.querySelector("#left-sidebar .panel-section.flex-fill");
    const orderBefore = [...left.children].map((e) => e.id || e.className);

    ui.apply("Move tree", ops.reorder(ui.doc, { id: "panel:tree", index: 0 }));
    ui.refreshNow();
    const orderAfter = [...left.children].map((e) => e.id || e.className);

    ui.undo();
    ui.refreshNow();
    const orderUndone = [...left.children].map((e) => e.id || e.className);

    return {
      orderBefore, orderAfter, orderUndone,
      sameElement: document.querySelector("#left-sidebar .panel-section.flex-fill") === tree,
      stillDirect: tree.parentElement === left,
    };
  });

  assert.notDeepEqual(result.orderAfter, result.orderBefore, "the panel actually moved");
  assert.equal(result.orderAfter[0], "panel-section flex-fill", "to the top of the sidebar");
  assert.deepEqual(result.orderUndone, result.orderBefore, "and undo put it back");
  assert.ok(result.sameElement, "it was moved, never rebuilt");
  assert.ok(result.stillDirect, "and it is still a direct child, so the pane rule still holds");
});

test("turning the layout off hands the chrome back untouched", opts, async () => {
  const page = await planner();
  const result = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const sig = () => document.getElementById("left-sidebar").outerHTML;
    const before = sig();

    const ui = (await window.__host()).initUIKit({ force: true });
    ui.refreshNow();
    // rearrange, so teardown has something real to undo
    ui.apply("Move tree", ops.reorder(ui.doc, { id: "panel:tree", index: 0 }));
    ui.refreshNow();

    const problems = (await window.__host()).teardownUIKit();
    return { before, after: sig(), problems, snapshot: window.__snap() };
  });

  assert.deepEqual(result.problems, [], "nothing was reported as unrestorable");
  assert.equal(result.after, result.before,
    "byte-identical markup, including the panel that had been moved");
});
