/* The selection grammar, exercised in a real editor rather than read off the
   source: the Sketch filter's disabled state where nothing sketch-shaped is
   pickable, Select All gathering topology instead of sketch entities, and a
   command taking the pick kind it needs without eating the user's filter.
 *
 * Skips itself when Chrome is absent — set CHROME_PATH to point at a binary.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

const MODEL = {
  key: "pick-model", id: "pick-model", definitionId: "pick-model",
  name: "Pick model", w: 20, d: 12, h: 8,
  metadata: { authoringSystem: "parametric-v1" },
  parts: [{
    id: "pick-part", featureId: "pick-box", kind: "box", name: "Body",
    x0: -10, x1: 10, y0: 0, y1: 8, z0: -6, z1: 6,
  }],
};

let shared = null;
test.after(async () => { if (shared) await shared.close(); });

/* One page for the file. `models` seeds the library BEFORE the reload that
   reads it; passing none opens the editor on an empty document, which is the
   only state where New Sketch goes straight to a datum sketch rather than
   asking which face or plane to put it on. */
async function editor(models) {
  if (!chrome) return null;
  if (!shared) shared = await openPage({ width: 1280, height: 800, lang: "en", mobile: false, touch: false });
  const page = shared;
  await page.waitForBoot();
  await page.eval(async (list) => {
    try {
      const { saveModelLibrary } = await import("./js/core/model_library_store.js");
      await saveModelLibrary(list);
    } catch {}
    localStorage.setItem("home3d_models", JSON.stringify(list));
    localStorage.removeItem("home3d_assemblies");
    localStorage.removeItem("home3d_modeler_draft");
    localStorage.removeItem("home3d_modeler_prefs");
  }, models || []);
  await page.goto("/");
  await page.waitForBoot();
  /* An unanswered window.confirm() freezes the page and every eval with it, so
     the harness must never be left to meet one by accident. */
  await page.eval(() => { window.confirm = () => true; });
  await page.eval(() => document.getElementById("openModelerTop").click());
  await page.waitUntil(() => {
    const el = document.getElementById("modeler");
    return !!el && getComputedStyle(el).display !== "none";
  }, { what: "the model editor to open" });
  await page.waitUntil(() => {
    const welcome = document.getElementById("mdWelcome");
    if (welcome && !welcome.hidden && getComputedStyle(welcome).display !== "none") {
      const c = welcome.querySelector('[data-welcome-start="continue"]') || welcome.querySelector(".md-welcome-close");
      if (c) { c.click(); return false; }
    }
    return !document.getElementById("modeler")?.classList.contains("md-welcome-open");
  }, { what: "the welcome dialog to dismiss" });
  if (models && models.length) {
    await page.eval(() => document.querySelector('#modeler [data-tab="lib"]').click());
    await page.waitUntil(() => [...document.querySelectorAll("#mdLib .md-card")]
      .some((card) => card.querySelector(".nm")?.textContent === "Pick model"), { what: "the seeded model card" });
    await page.eval(() => [...document.querySelectorAll("#mdLib .md-card")]
      .find((card) => card.querySelector(".nm")?.textContent === "Pick model").click());
    await page.waitUntil(() => window.cadSelectionSnapshot?.().mode === "3d", { what: "the loaded model" });
  }
  return page;
}

const filterState = () => [...document.querySelectorAll("#mdSelFilters [data-selfilter]")]
  .map((b) => ({ id: b.getAttribute("data-selfilter"), disabled: b.disabled, on: b.classList.contains("on") }));

test("the Sketch filter is disabled where it cannot acquire anything", opts, async () => {
  const page = await editor();

  const in3d = await page.eval(filterState);
  assert.equal(in3d.find((b) => b.id === "sketch").disabled, true,
    "Sketch must be disabled in the 3D view: " + JSON.stringify(in3d));
  assert.equal(in3d.find((b) => b.id === "face").disabled, false, "Face must stay available");

  // Clicking a disabled filter must not take effect.
  await page.eval(() => document.querySelector('[data-selfilter="sketch"]').click());
  assert.notEqual(await page.eval(() => window.cadSelectionSnapshot().filter), "sketch",
    "a filter that cannot acquire anything must not become active");

  // Opening a sketch is what makes sketch geometry pickable, and the button
  // follows that rather than the name of the mode.
  await page.eval(() => document.querySelector('#modeler [data-command="newsketch"]').click());
  await page.waitUntil(() => window.cadSketchSnapshot?.().phase === "sketch", { what: "a datum sketch to open" });
  await page.waitUntil(() => window.cadSelectionSnapshot?.().sketchFilterAvailable === true,
    { what: "the Sketch filter to become available" });
  const inSketch = await page.eval(filterState);
  assert.equal(inSketch.find((b) => b.id === "sketch").disabled, false,
    "Sketch must be available once a sketch is open: " + JSON.stringify(inSketch));

  // Selecting it there, then leaving, must demote rather than strand it.
  await page.eval(() => document.querySelector('[data-selfilter="sketch"]').click());
  assert.equal(await page.eval(() => window.cadSelectionSnapshot().filter), "sketch");
  await page.eval(() => document.querySelector('#modeler [data-mode="3d"]').click());
  await page.waitUntil(() => window.cadSelectionSnapshot?.().sketchFilterAvailable === false,
    { what: "the 3D view to reclaim the filter" });
  const after = await page.eval(() => ({
    filter: window.cadSelectionSnapshot().filter,
    sketchOn: document.querySelector('[data-selfilter="sketch"]').classList.contains("on"),
    allOn: document.querySelector('[data-selfilter="all"]').classList.contains("on"),
  }));
  assert.equal(after.filter, "all", "a filter that can no longer acquire anything must fall back to All");
  assert.equal(after.sketchOn, false, "the stranded button must not still read as active");
  assert.equal(after.allOn, true, "the fallback must be painted, not just stored");
});

test("Select All in 3D gathers topology and leaves the solid in E.sel", opts, async () => {
  const page = await editor([MODEL]);

  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })));
  const all = await page.eval(() => window.cadSelectionSnapshot());
  assert.ok(all.topology > 0, "Select All should gather topology references, got " + all.topology);
  // The bug this replaces put a sketch entity in the slot holding the solid.
  assert.equal(all.selKind, "part", "E.sel must still hold the solid, not a sketch entity: " + all.selKind);
  assert.equal(all.sketchSel, 0, "the sketch selection must stay empty in the 3D view");

  // Scoped by the active filter, the way SolidWorks scopes Select All.
  await page.eval(() => document.querySelector('[data-selfilter="face"]').click());
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })));
  const faces = await page.eval(() => window.cadSelectionSnapshot());
  assert.ok(faces.topology > 0, "Face filter gathered nothing");
  assert.ok(faces.kinds.every((k) => k === "face"),
    "Face filter must gather faces only: " + JSON.stringify(faces.kinds.slice(0, 8)));
  assert.ok(faces.topology < all.topology, "faces alone must be fewer than faces plus edges");
});

test("a command takes the pick kind it needs without eating the user's filter", opts, async () => {
  const page = await editor([MODEL]);
  await page.eval(() => document.querySelector('[data-selfilter="edge"]').click());
  assert.equal(await page.eval(() => window.cadSelectionSnapshot().filter), "edge");

  /* New Sketch on a document that already has a body asks which face or plane
     to put the sketch on. That pick needs faces whatever the user's filter
     says — and used to get them by overwriting the filter and never putting it
     back, so an Edge filter chosen for the session silently became All. */
  await page.eval(() => document.querySelector('#modeler [data-command="newsketch"]').click());
  await page.waitUntil(() => window.cadSketchSnapshot?.().phase === "reference", { what: "the face/plane pick" });
  const during = await page.eval(() => window.cadSelectionSnapshot());
  assert.equal(during.activeFilter, "face", "the face pick must acquire faces");
  assert.equal(during.filter, "edge", "the user's own filter must survive the command");

  // And it is still theirs once the command is over.
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await page.waitUntil(() => window.cadSelectionSnapshot?.().activeFilter === "edge",
    { what: "the user's filter to come back" });
  assert.equal(await page.eval(() => window.cadSelectionSnapshot().filter), "edge");
});

test("loop, tangency and invert grow the selection from a real pick", opts, async () => {
  const page = await editor([MODEL]);
  // Select one face by hand through the snapshot's own vocabulary: pick the
  // whole body, then keep a single face, which is what a click leaves behind.
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })));
  await page.eval(() => {
    const snap = window.cadSelectionSnapshot();
    const at = snap.kinds.indexOf("face");
    window.cadSelectTopologyById(snap.ids[at]);
  });
  const one = await page.eval(() => window.cadSelectionSnapshot());
  assert.equal(one.topology, 1);
  assert.equal(one.kinds[0], "face");

  // A box face's loop is its four bounding edges.
  await page.eval(() => window.cadRunSelectionOperation("selectloop"));
  const loop = await page.eval(() => window.cadSelectionSnapshot());
  assert.equal(loop.topology, 4, "a face loop should be four edges, got " + loop.topology);
  assert.ok(loop.kinds.every((k) => k === "edge"), "a loop is edges: " + JSON.stringify(loop.kinds));

  // Inverting an edge selection stays within edges: 12 - 4 = 8.
  await page.eval(() => window.cadRunSelectionOperation("selectinvert"));
  const inverted = await page.eval(() => window.cadSelectionSnapshot());
  assert.equal(inverted.topology, 8, "invert should leave the other eight edges");
  assert.ok(inverted.kinds.every((k) => k === "edge"));

  // Connected from an edge takes every edge of the body.
  await page.eval(() => window.cadRunSelectionOperation("selectconnected"));
  assert.equal((await page.eval(() => window.cadSelectionSnapshot())).topology, 12);
});

test("the Vertex filter acquires corners the other filters cannot", opts, async () => {
  const page = await editor([MODEL]);
  await page.eval(() => document.querySelector('[data-selfilter="vertex"]').click());
  assert.equal(await page.eval(() => window.cadSelectionSnapshot().filter), "vertex");

  // Eight corners exist for the box, derived rather than stored.
  const corners = await page.eval(() => window.cadVertexCount());
  assert.equal(corners, 8, "a box body should derive eight corners, got " + corners);

  // Ctrl+A under the Vertex filter gathers nothing: Select All walks the
  // stored topology, and corners are not in it. It must not corrupt anything.
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })));
  const after = await page.eval(() => window.cadSelectionSnapshot());
  assert.equal(after.selKind, "part", "E.sel must still hold the solid");
});

test("grow, shrink and saved selections work on a real body", opts, async () => {
  const page = await editor([MODEL]);
  // Start from one face.
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })));
  await page.eval(() => {
    const snap = window.cadSelectionSnapshot();
    window.cadSelectTopologyById(snap.ids[snap.kinds.indexOf("face")]);
  });

  // A box face touches four others; a second ring takes the whole body.
  await page.eval(() => window.cadRunSelectionOperation("selectgrow"));
  const grown = await page.eval(() => window.cadSelectionSnapshot());
  assert.equal(grown.topology, 5, "grow should reach the four adjacent faces, got " + grown.topology);
  assert.ok(grown.kinds.every((k) => k === "face"), "grow must not change kind");
  await page.eval(() => window.cadRunSelectionOperation("selectgrow"));
  assert.equal((await page.eval(() => window.cadSelectionSnapshot())).topology, 6);

  // Shrink pulls back: with every face selected none is on the boundary.
  await page.eval(() => window.cadRunSelectionOperation("selectshrink"));
  assert.equal((await page.eval(() => window.cadSelectionSnapshot())).topology, 6);

  // Save it, clear, and bring it back.
  const saved = await page.eval(() => window.cadSaveNamedSelection("All faces"));
  assert.equal(saved, 6, "the saved set should hold six faces");
  await page.eval(() => window.cadSelectTopologyById(window.cadSelectionSnapshot().ids[0]));
  assert.equal((await page.eval(() => window.cadSelectionSnapshot())).topology, 1);
  const restored = await page.eval(() => window.cadRestoreNamedSelection("All faces"));
  assert.equal(restored, 6, "restoring should bring back all six");
  assert.equal((await page.eval(() => window.cadSelectionSnapshot())).topology, 6);
});

test("Shift and a digit switch the filter, and a held one snaps back", opts, async () => {
  const page = await editor([MODEL]);
  assert.equal(await page.eval(() => window.cadSelectionSnapshot().filter), "all");

  const chord = (down) => (code) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, shiftKey: down, bubbles: true }));
  // A tap sticks.
  await page.eval(() => { const e = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, shiftKey: t === "keydown", bubbles: true }));
    e("keydown", "Digit3"); e("keyup", "Digit3"); });
  assert.equal(await page.eval(() => window.cadSelectionSnapshot().filter), "edge", "Shift+3 should select the Edge filter");

  // Held past the tap window, it borrows and gives back on release.
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit2", shiftKey: true, bubbles: true })));
  assert.equal(await page.eval(() => window.cadSelectionSnapshot().filter), "face");
  await new Promise((r) => setTimeout(r, 420));
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit2", bubbles: true })));
  assert.equal(await page.eval(() => window.cadSelectionSnapshot().filter), "edge",
    "a held filter must restore the one the user had chosen");
});

test("Select does not open the sketch sheet, and the keyboard stays itself", opts, async () => {
  const page = await editor([MODEL]);
  assert.equal((await page.eval(() => window.cadSelectionSnapshot())).modelPlane, false);

  // V used to lay #mdCanvas over the viewport and kill face picking.
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true })));
  const afterV = await page.eval(() => window.cadSelectionSnapshot());
  assert.equal(afterV.tool, "select");
  assert.equal(afterV.modelPlane, false, "Select must not open the sketch sheet");
  assert.equal(await page.eval(() => document.getElementById("modeler").classList.contains("md-model-sketching")), false);

  /* And because the Paint chord is gated on !modelPlaneActive, an overlay
     armed by Select used to make B mean "rectangle" instead of Paint. */
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true })));
  assert.equal((await page.eval(() => window.cadSelectionSnapshot())).tool, "paint", "B must still reach Paint after Select");

  // Leaving Paint with Escape must not arm it either.
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  const afterEsc = await page.eval(() => window.cadSelectionSnapshot());
  assert.equal(afterEsc.tool, "select");
  assert.equal(afterEsc.modelPlane, false, "Escape from Paint must not open the sketch sheet");
});

test("the inspector asks with a form, not with window.prompt", opts, async () => {
  const page = await editor([MODEL]);
  await page.eval(() => { window.__promptCalled = false; window.prompt = () => { window.__promptCalled = true; return null; }; });
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })));
  await page.eval(() => document.querySelector('#modeler [data-tab="ops"]').click());
  await page.waitUntil(() => [...document.querySelectorAll("#modeler .md-ops button")].some((b) => /linear/i.test(b.textContent)),
    { what: "the part operations" });

  await page.eval(() => [...document.querySelectorAll("#modeler .md-ops button")].find((b) => /linear/i.test(b.textContent)).click());
  await page.waitUntil(() => document.querySelectorAll("#mdQuickSettings input, #mdQuickSettings select").length > 0, { what: "the pattern form" });
  const fields = await page.eval(() => [...document.querySelectorAll("#mdQuickSettings input, #mdQuickSettings select")].map((i) => i.dataset.parameter));
  // Three axes as three fields, where "20,0,0" in a text box used to be.
  assert.deepEqual(fields, ["count", "stepX", "stepY", "stepZ"]);
  assert.equal(await page.eval(() => window.__promptCalled), false, "nothing may reach window.prompt");
});

test("finishing a sketch offers the four features instead of opening Extrude", opts, async () => {
  const page = await editor();
  await page.eval(() => document.querySelector('#modeler [data-command="newsketch"]').click());
  await page.waitUntil(() => window.cadSketchSnapshot?.().phase === "sketch", { what: "a datum sketch" });

  // Draw a closed rectangle with the sketch tool, then finish.
  await page.eval(() => {
    const canvas = document.getElementById("mdCanvas"), r = canvas.getBoundingClientRect();
    const at = (x, y) => ({ clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1, button: 0, isPrimary: true, pointerType: "mouse" });
    document.querySelector('#modeler [data-command="sketchrect"]')?.click();
    canvas.dispatchEvent(new PointerEvent("pointerdown", at(120, 120)));
    canvas.dispatchEvent(new PointerEvent("pointermove", at(240, 210)));
    canvas.dispatchEvent(new PointerEvent("pointerup", at(240, 210)));
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 400)));

  await page.eval(() => document.querySelector('#modeler [data-command="finishsketch"]').click());
  await page.eval(() => new Promise((r) => setTimeout(r, 600)));

  const offer = await page.eval(() => {
    const host = document.getElementById("mdProfileOffer");
    return {
      shown: !!host && !host.hidden,
      labels: host ? [...host.querySelectorAll("button")].map((b) => b.textContent.trim()) : [],
      leading: host ? (host.querySelector("button")?.className || "") : "",
      featureFormOpen: document.querySelectorAll("#mdQuickSettings [data-parameter]").length > 0,
    };
  });
  // Either a closed profile was drawn and the four are offered, or none was and
  // nothing is offered — but Extrude must never have opened itself.
  assert.equal(offer.featureFormOpen, false, "finishing must not open a feature form unasked");
  if (offer.shown) {
    assert.equal(offer.labels.length, 4, "four features can consume a closed profile: " + JSON.stringify(offer.labels));
    assert.match(offer.leading, /btn-accent/, "the leading choice is the one Enter takes");
  }
});
