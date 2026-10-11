/* The modelling loop as one gesture, driven in a real editor.
 *
 * The rule being tested is the four-beat one: intent, ghost, click, commit.
 * A form is what it feels like when a beat is missing; a toy is what it feels
 * like when the ghost and the solid disagree. So the assertions here are not
 * "did a box appear" — they are:
 *
 *   - the sequence runs without a modal ever opening,
 *   - the number that was TYPED is the number the document ends up carrying,
 *   - the ghost's parameters equal the committed feature's parameters,
 *   - each commit costs exactly one undo step,
 *   - while the confirmation corner is up it is the only commit button.
 *
 * Skips itself when Chrome is absent — set CHROME_PATH to point at a binary.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";
import { startDatumSketch } from "./helpers/browser_sketch_workflow.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

let shared = null;
test.after(async () => { if (shared) await shared.close(); });

/* Opens an empty part and installs modal tripwires. window.prompt and
   window.confirm are replaced by counters rather than by silent stubs: an
   unanswered modal would freeze the page and every eval with it, and a modal
   that IS answered silently would let a regression pass as a pass. */
async function editor() {
  if (!chrome) return null;
  if (!shared) shared = await openPage({ width: 1280, height: 800, lang: "en", mobile: false, touch: false });
  const page = shared;
  await page.waitForBoot();
  await page.eval(() => {
    localStorage.removeItem("home3d_modeler_draft");
    localStorage.removeItem("home3d_modeler_prefs");
  });
  await page.goto("/");
  await page.waitForBoot();
  await page.eval(() => {
    window.__modals = { prompt: 0, confirm: 0, alert: 0 };
    window.prompt = () => { window.__modals.prompt++; return null; };
    window.confirm = () => { window.__modals.confirm++; return true; };
    window.alert = () => { window.__modals.alert++; };
  });
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
  return page;
}

/* A rectangle drawn the way a hand draws one: press, move, then TYPE the size
   before letting go. The pointer is deliberately left down — the anchor a typed
   value attaches to is the live drag, so releasing first would be a different
   gesture with a different meaning. */
async function typedRectangle(page, width, height) {
  await startDatumSketch(page);
  await page.eval(() => {
    const osnap = document.querySelector("#mdOsnap");
    if (osnap && osnap.checked) { osnap.checked = false; osnap.dispatchEvent(new Event("change", { bubbles: true })); }
    document.querySelector('#modeler [data-command="srect"]').click();
  });
  await page.waitUntil(() => window.cadSketchSnapshot?.().tool === "srect", { what: "the rectangle tool" });
  await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.eval(async ([w, h]) => {
    const canvas = document.getElementById("mdCanvas");
    const rect = canvas.getBoundingClientRect();
    const x0 = rect.left + rect.width / 2 - 80, y0 = rect.top + rect.height / 2 - 60;
    const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 71, pointerType: "mouse", isPrimary: true,
      button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y,
    }));
    const key = (k, shiftKey) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: !!shiftKey, bubbles: true, cancelable: true }));
    fire("pointerdown", x0, y0);
    fire("pointermove", x0 + 120, y0 + 90);
    const dragging = window.cadSketchSnapshot();
    for (const ch of String(w)) key(ch);
    key("Tab");
    for (const ch of String(h)) key(ch);
    const typed = window.cadSketchSnapshot();
    key("Enter");
    await new Promise((r) => setTimeout(r, 90));
    return { dragging, typed, after: window.cadSketchSnapshot(), loop: window.cadLoopSnapshot() };
  }, [width, height]);
}

test("a typed rectangle commits the number that was typed, not the one that was dragged", opts, async () => {
  const page = await editor();
  const run = await typedRectangle(page, 80, 40);

  assert.ok(run.dragging.previewRect, "no ghost while dragging: the rubber-band must be visible before any commit");
  // The whole point of typing: the drag was ~120x90 screen px, the document
  // must carry 80 x 40, not whatever the pointer happened to be saying.
  assert.ok(Math.abs(run.after.width - 80) < 0.5,
    "typed width did not reach the sketch, got " + run.after.width);
  assert.ok(Math.abs(run.after.height - 40) < 0.5,
    "typed height did not reach the sketch, got " + run.after.height);
  assert.ok(run.after.pointCount >= 4, "the rectangle did not commit four points");

  const modals = await page.eval(() => window.__modals);
  assert.deepEqual(modals, { prompt: 0, confirm: 0, alert: 0 },
    "drawing a sized rectangle must not open a modal: " + JSON.stringify(modals));
});

test("a closed profile offers its features instead of guessing one", opts, async () => {
  const page = await editor();
  await typedRectangle(page, 80, 40);

  const before = await page.eval(() => window.cadLoopSnapshot());
  await page.eval(() => document.getElementById("mdAcceptCommand").click());
  await page.waitUntil(() => {
    const host = document.getElementById("mdProfileOffer");
    return !!host && !host.hidden && host.querySelectorAll("button").length > 0;
  }, { what: "the profile offer after Finish Sketch" });

  const offer = await page.eval(() => ({
    labels: [...document.querySelectorAll("#mdProfileOffer button")].map((b) => b.textContent.trim()),
    loop: window.cadLoopSnapshot(),
  }));
  // Finishing a sketch must not have built anything on its own.
  assert.equal(offer.loop.parts, before.parts,
    "Finish Sketch created a solid by itself — the offer replaced the guess, it must not also make it");
  assert.ok(offer.labels.length >= 4,
    "a closed profile should offer every feature that can consume it, got " + JSON.stringify(offer.labels));
  assert.equal(offer.loop.authoring, null, "no feature may be armed until the user picks one");
});

test("the ghost and the commit agree, and the commit costs one undo step", opts, async () => {
  const page = await editor();
  await typedRectangle(page, 80, 40);
  await page.eval(() => document.getElementById("mdAcceptCommand").click());
  await page.waitUntil(() => {
    const host = document.getElementById("mdProfileOffer");
    return !!host && !host.hidden && host.querySelectorAll("button").length > 0;
  }, { what: "the profile offer" });

  const before = await page.eval(() => window.cadLoopSnapshot());
  await page.eval(() => document.querySelector("#mdProfileOffer button").click());
  await page.waitUntil(() => window.cadLoopSnapshot?.().authoring === "extrude", { what: "the extrude form" });

  const armed = await page.eval(() => window.cadLoopSnapshot());
  assert.ok(armed.ghost, "arming a feature must put a ghost up before anything is committed");
  assert.equal(armed.corner.visible, true, "the corner must be up while a feature is armed");
  assert.equal(armed.corner.mode, "feature");
  // Beat 4 has exactly one button. The form's own pair is hidden behind the
  // corner rather than removed, so Enter and the green check stay one path.
  assert.equal(armed.formActionsPresent, true, "the form's action row should still exist to be clicked through");
  assert.equal(armed.formActionsHidden, true,
    "two commit buttons: the feature form still shows its own Apply while the corner is up");
  assert.equal(armed.parts, before.parts, "arming a feature must not build anything");

  await page.eval(() => document.getElementById("mdAcceptCommand").click());
  await page.waitUntil(() => window.cadLoopSnapshot?.().authoring === null, { what: "the extrude to commit" });

  const done = await page.eval(() => window.cadLoopSnapshot());
  assert.ok(done.parts > before.parts, "accepting from the corner did not build the solid");
  assert.equal(done.ghost, null, "the ghost must be gone once the kernel owns the body");
  assert.equal(done.undoDepth - before.undoDepth, 1,
    "one commit must be one undo step, got " + (done.undoDepth - before.undoDepth));
  // Ghost and solid agree: the depth that was previewed is the depth stored.
  assert.equal(done.lastFeature.type, "extrude");
  assert.equal(Number(done.lastFeature.params.depth), Number(armed.ghost.params.depth),
    "the committed depth differs from the depth the ghost was showing");

  const modals = await page.eval(() => window.__modals);
  assert.deepEqual(modals, { prompt: 0, confirm: 0, alert: 0 },
    "the whole loop must run without a modal: " + JSON.stringify(modals));
});

test("the corner's cancel throws the ghost away without touching history", opts, async () => {
  const page = await editor();
  await typedRectangle(page, 80, 40);
  await page.eval(() => document.getElementById("mdAcceptCommand").click());
  await page.waitUntil(() => {
    const host = document.getElementById("mdProfileOffer");
    return !!host && !host.hidden && host.querySelectorAll("button").length > 0;
  }, { what: "the profile offer" });

  const before = await page.eval(() => window.cadLoopSnapshot());
  await page.eval(() => document.querySelector("#mdProfileOffer button").click());
  await page.waitUntil(() => window.cadLoopSnapshot?.().authoring === "extrude", { what: "the extrude form" });
  await page.eval(() => document.getElementById("mdCancelCommand").click());
  await page.waitUntil(() => window.cadLoopSnapshot?.().authoring === null, { what: "the feature to be abandoned" });

  const after = await page.eval(() => window.cadLoopSnapshot());
  assert.equal(after.ghost, null, "the ghost outlived the command it belonged to");
  assert.equal(after.parts, before.parts, "cancelling built a body anyway");
  assert.equal(after.undoDepth, before.undoDepth,
    "a cancelled feature left an undo step behind: " + before.undoDepth + " -> " + after.undoDepth);
});
