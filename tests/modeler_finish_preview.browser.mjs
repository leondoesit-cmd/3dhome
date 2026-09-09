/* Fillet, chamfer and shell in a real editor: opening the form with edges (or a
   face) already picked must put an approximate body in the scene straight away,
   say out loud that it is approximate rather than synced, and take it away again
   when the form is dismissed.
 *
 * The approximation is normally reached through requestAnimationFrame, which
 * never fires in a headless pane (visibilityState is "hidden"). openParametric-
 * Feature() syncs the preview directly, so these tests drive that path and read
 * the result rather than waiting for a frame that will not come.
 *
 * Skips itself when Chrome is absent — set CHROME_PATH to point at a binary.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

const MODEL = {
  key: "finish-model", id: "finish-model", definitionId: "finish-model",
  name: "Finish model", w: 20, d: 12, h: 8,
  metadata: { authoringSystem: "parametric-v1" },
  parts: [{
    id: "finish-part", featureId: "finish-box", kind: "box", name: "Body",
    x0: -10, x1: 10, y0: 0, y1: 8, z0: -6, z1: 6,
  }],
};

let shared = null;
test.after(async () => { if (shared) await shared.close(); });

async function editor() {
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
  }, [MODEL]);
  await page.goto("/");
  await page.waitForBoot();
  await page.eval(() => { window.confirm = () => true; });
  await page.eval(() => document.getElementById("openModelerTop").click());
  await page.waitUntil(() => {
    const el = document.getElementById("modeler");
    return !!el && getComputedStyle(el).display !== "none";
  }, { what: "the model editor to open" });
  await page.waitUntil(() => {
    const welcome = document.getElementById("mdWelcome");
    if (welcome && !welcome.hidden && getComputedStyle(welcome).display !== "none") {
      const start = welcome.querySelector('[data-welcome-start="continue"]') || welcome.querySelector(".md-welcome-close");
      if (start) { start.click(); return false; }
    }
    return !welcome || welcome.hidden || getComputedStyle(welcome).display === "none";
  }, { what: "the welcome sheet to be out of the way" });
  await page.waitUntil(() => typeof window.cadFinishPreviewSnapshot === "function",
    { what: "the editor test hooks" });
  // The editor opens blank; the body under test comes from the seeded library.
  await page.eval(() => document.querySelector('#modeler [data-tab="lib"]').click());
  await page.waitUntil(() => [...document.querySelectorAll("#mdLib .md-card")]
    .some((card) => card.querySelector(".nm")?.textContent === "Finish model"), { what: "the seeded model card" });
  await page.eval(() => [...document.querySelectorAll("#mdLib .md-card")]
    .find((card) => card.querySelector(".nm")?.textContent === "Finish model").click());
  await page.waitUntil(() => window.cadSelectionSnapshot?.().mode === "3d", { what: "the loaded model" });
  return page;
}

/* Pick one topology reference by id pattern, the way a viewport click leaves
   it: select everything, then keep a single entry.  Which edge matters here —
   only an edge running along the sweep has a profile corner to round. */
async function pick(page, kind, match) {
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })));
  return page.eval(([want, pattern]) => {
    const snap = window.cadSelectionSnapshot();
    const re = pattern ? new RegExp(pattern) : null;
    const at = snap.ids.findIndex((id, index) => snap.kinds[index] === want && (!re || re.test(id)));
    if (at < 0) return false;
    return window.cadSelectTopologyById(snap.ids[at]);
  }, [kind, match || null]);
}

/* The user's own dismissal: the form's Cancel button. */
async function cancel(page) {
  await page.eval(() => {
    const button = document.querySelector("#mdQuickSettings .md-quick-cancel");
    if (button) button.click();
  });
}

for (const [type, kind, match] of [["fillet", "edge", ":y:"], ["chamfer", "edge", ":y:"], ["shell", "face", ":top"]]) {
  test(type + " shows an approximate body the moment its form opens", opts, async () => {
    const page = await editor();
    assert.equal(await pick(page, kind, match), true, "could not pick a " + kind);
    assert.equal(await page.eval((t) => window.cadOpenFeatureForm(t), type), true);

    const snap = await page.eval(() => window.cadFinishPreviewSnapshot());
    assert.equal(snap.type, type);
    assert.ok(snap.parts.length, type + " put no preview body in the scene");
    assert.ok(snap.approximate, type + " did not report an approximate preview");
    assert.ok(snap.parts.some((part) => part.approximate), "no preview body is flagged approximate");
    // the source body is still replaced, so the ghost is not a second coincident solid
    assert.equal(snap.replaces, "finish-part");
    if (type === "shell") assert.ok(snap.parts.some((part) => part.holes > 0), "shell drew no wall cavity");
    else assert.ok(snap.parts.some((part) => part.points > 4), "the box corner was not cut");

    // The claim on the badge is "approximate", never "views synced".
    assert.ok(snap.badge, "no live badge on the form");
    assert.equal(snap.badge.state, "approximate");
    assert.match(snap.badge.text, /Approximate/);
    assert.doesNotMatch(snap.badge.text, /synced/i);

    await cancel(page);
    const after = await page.eval(() => window.cadFinishPreviewSnapshot());
    assert.equal(after.parts.length, 0, type + " left a preview body behind after the form closed");
    assert.equal(after.approximate, false);
    assert.equal(after.formOpen, false);
  });
}

test("a selection the approximation cannot describe falls back to no preview", opts, async () => {
  const page = await editor();
  // A rim across the extrusion has no corner in the profile representation.
  const picked = await pick(page, "edge", ":x:");
  assert.equal(picked, true, "could not pick a horizontal edge");
  assert.equal(await page.eval(() => window.cadOpenFeatureForm("fillet")), true);
  const snap = await page.eval(() => window.cadFinishPreviewSnapshot());
  assert.equal(snap.approximate, false, "an unrepresentable pick must not be approximated");
  // today's behaviour: the exact path alone, with the source body standing in
  assert.equal(snap.parts.length, 1);
  assert.equal(snap.parts[0].approximate, false);
  assert.equal(snap.badge.state, "calculating");
  await cancel(page);
});

test("closing the form is on its own enough to take the ghost body away", opts, async () => {
  const page = await editor();
  assert.equal(await pick(page, "edge", ":y:"), true);
  assert.equal(await page.eval(() => window.cadOpenFeatureForm("chamfer")), true);
  assert.ok((await page.eval(() => window.cadFinishPreviewSnapshot())).approximate);

  // closeFeaturePanel() alone, without the Cancel button clearing first: several
  // callers dismiss the form that way and used to leave the body in the scene.
  await page.eval(() => window.cadCloseFeatureForm());
  const after = await page.eval(() => window.cadFinishPreviewSnapshot());
  assert.equal(after.parts.length, 0, "closing the panel left a preview body behind");
  assert.equal(after.approximate, false);
  assert.equal(after.replaces, null, "the source body is still hidden by a preview that no longer exists");
  await cancel(page);
});
