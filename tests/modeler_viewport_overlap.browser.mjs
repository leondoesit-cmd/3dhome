/* Viewport chrome that does not print itself over other viewport chrome.
 *
 * Every overlay in the model editor floats over the same canvas, and each one
 * used to pin itself to a corner on its own. That works until two are open at
 * once, and then the newer one simply covers the older one — silently, because
 * nothing in CSS or in a test ever compared their boxes. The plane chip covered
 * the confirmation corner completely; the profile offer landed on the hint; the
 * breadcrumb printed over the status line.
 *
 * So this measures. It walks the visible chrome over the canvas, in real
 * viewport coordinates, and asserts that no two boxes intersect and that none
 * of them has drifted off the viewport it is supposed to annotate.
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

async function editor(size) {
  if (!chrome) return null;
  if (!shared) shared = await openPage({ width: 1280, height: 800, lang: "en", mobile: false, touch: false });
  const page = shared;
  await page.waitForBoot();
  if (size) await page.resize(size.width, size.height);
  await page.eval(() => {
    localStorage.removeItem("home3d_modeler_draft");
    localStorage.removeItem("home3d_modeler_prefs");
  });
  await page.goto("/");
  await page.waitForBoot();
  await page.eval(() => { window.confirm = () => true; window.prompt = () => null; });
  await page.eval(() => document.getElementById("openModelerTop").click());
  await page.waitUntil(() => {
    const el = document.getElementById("modeler");
    return !!el && getComputedStyle(el).display !== "none";
  }, { what: "the model editor to open" });
  await page.waitUntil(() => {
    const w = document.getElementById("mdWelcome");
    if (w && !w.hidden && getComputedStyle(w).display !== "none") {
      const c = w.querySelector('[data-welcome-start="continue"]') || w.querySelector(".md-welcome-close");
      if (c) { c.click(); return false; }
    }
    return !document.getElementById("modeler")?.classList.contains("md-welcome-open");
  }, { what: "the welcome dialog to dismiss" });
  return page;
}

/* Visible chrome laid over the canvas, in viewport coordinates so that a
   `fixed` overlay is measured against the same origin as an `absolute` one —
   the mismatch between those two is itself a way to drift off the model. A
   rail is a transparent shelf, so it is walked through rather than measured. */
const collect = () => {
  const mid = document.querySelector("#modeler .md-mid");
  const midBox = mid.getBoundingClientRect();
  const out = [];
  const walk = (node) => {
    for (const el of node.children) {
      if (el.id === "mdCanvas" || el.id === "md3dHost") continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.hidden) continue;
      if (el.classList.contains("md-rail")) { walk(el); continue; }
      const inRail = el.parentElement.classList.contains("md-rail");
      if (cs.position === "absolute" || cs.position === "fixed" || inRail) {
        const r = el.getBoundingClientRect();
        const over = Math.min(r.right, midBox.right) - Math.max(r.left, midBox.left) > 0
          && Math.min(r.bottom, midBox.bottom) - Math.max(r.top, midBox.top) > 0;
        if (r.width > 0 && r.height > 0 && over) {
          out.push({
            name: el.id || el.className.toString().split(" ")[0],
            x: r.left, y: r.top, w: r.width, h: r.height,
            outLeft: Math.round(midBox.left - r.left), outTop: Math.round(midBox.top - r.top),
            outRight: Math.round(r.right - midBox.right), outBottom: Math.round(r.bottom - midBox.bottom),
          });
        }
        continue;
      }
      walk(el);
    }
  };
  walk(mid);
  return out;
};

/* One pixel of contact between two rounded chips is a rendering nicety, not a
   collision. Four is where one is demonstrably sitting on the other. */
const SLACK = 4;

function collisions(boxes) {
  const bad = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > SLACK && oy > SLACK) {
      bad.push(a.name + " x " + b.name + " (" + Math.round(ox) + "x" + Math.round(oy) + "px)");
    }
  }
  return bad;
}

function escapees(boxes) {
  return boxes.filter((b) => b.outLeft > SLACK || b.outTop > SLACK || b.outRight > SLACK || b.outBottom > SLACK)
    .map((b) => b.name + " (out by " + [b.outLeft, b.outTop, b.outRight, b.outBottom].join("/") + ")");
}

async function check(page, label) {
  const boxes = await page.eval(collect);
  assert.ok(boxes.length >= 3, label + ": collected almost no chrome (" + boxes.length + "), the probe is not looking at the viewport");
  assert.deepEqual(collisions(boxes), [], label + ": viewport chrome overlaps");
  assert.deepEqual(escapees(boxes), [], label + ": viewport chrome sits outside the viewport it annotates");
  return boxes;
}

const named = (boxes, name) => boxes.find((b) => b.name === name);

async function drawClosedProfile(page) {
  await page.eval(() => document.querySelector('#modeler [data-command="srect"]')?.click());
  await page.waitUntil(() => window.cadSketchSnapshot?.().tool === "srect", { what: "the rectangle tool" });
  await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.eval(async () => {
    const canvas = document.getElementById("mdCanvas");
    const r = canvas.getBoundingClientRect();
    const x0 = r.left + r.width / 2 - 80, y0 = r.top + r.height / 2 - 60;
    const fire = (t, x, y) => canvas.dispatchEvent(new PointerEvent(t, {
      bubbles: true, cancelable: true, pointerId: 83, pointerType: "mouse", isPrimary: true,
      button: 0, buttons: t === "pointerup" ? 0 : 1, clientX: x, clientY: y,
    }));
    const key = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    fire("pointerdown", x0, y0);
    fire("pointermove", x0 + 120, y0 + 90);
    for (const c of "80") key(c);
    key("Tab");
    for (const c of "40") key(c);
    key("Enter");
    await new Promise((r) => setTimeout(r, 120));
  });
}

test("nothing in the viewport covers anything else, from empty part to built solid", opts, async () => {
  const page = await editor();

  await check(page, "idle 3D on an empty part");

  await startDatumSketch(page);
  const sketching = await check(page, "sketch open");
  // The regression this file exists for: the plane chip and the confirmation
  // corner both docked to the top-end corner, and the chip won.
  const chip = named(sketching, "mdSketchPlaneChip");
  const corner = named(sketching, "mdContextActions");
  assert.ok(chip && corner, "both the plane chip and the confirmation corner should be up while sketching");
  assert.ok(corner.y >= chip.y + chip.h - SLACK,
    "the confirmation corner must stack below the plane chip, not under it");

  await drawClosedProfile(page);
  await check(page, "closed profile in the sketch");

  await page.eval(() => document.getElementById("mdAcceptCommand").click());
  await page.waitUntil(() => {
    const host = document.getElementById("mdProfileOffer");
    return !!host && !host.hidden && host.querySelectorAll("button").length > 0;
  }, { what: "the profile offer" });
  const offering = await check(page, "profile offer up");
  const offer = named(offering, "mdProfileOffer");
  const hint = named(offering, "mdHint");
  assert.ok(offer, "the profile offer should be measurable while it is up");
  if (hint) {
    assert.ok(hint.y >= offer.y + offer.h - SLACK,
      "the hint must sit below the profile offer, not underneath it");
  }

  await page.eval(() => document.querySelector("#mdProfileOffer button").click());
  await page.waitUntil(() => window.cadLoopSnapshot?.().authoring === "extrude", { what: "the extrude form" });
  await check(page, "a feature armed");

  await page.eval(() => document.getElementById("mdAcceptCommand").click());
  await page.waitUntil(() => window.cadLoopSnapshot?.().authoring === null, { what: "the extrude to commit" });
  const built = await check(page, "solid built");
  // The breadcrumb used to be laid inside the status bar's own box.
  const crumb = named(built, "mdBreadcrumb");
  const status = named(built, "mdStatus");
  if (crumb && status) {
    assert.ok(crumb.y + crumb.h <= status.y + SLACK,
      "the selection breadcrumb must clear the status line rather than print over it");
  }

  /* Section view needs a body to cut, so it belongs at the end of this flow
     rather than in a test of its own: it is the third thing that docks to the
     top-end shelf, and the shelf has to hold all three. */
  await page.eval(() => document.querySelector('#modeler [data-command="section"]')?.click());
  await page.waitUntil(() => {
    const el = document.getElementById("mdSectionControls");
    return !!el && !el.hidden;
  }, { what: "the section panel" });
  const sectioned = await check(page, "section view on");
  assert.ok(named(sectioned, "mdSectionControls"), "the section panel should be measurable while it is open");
});

/* Narrow is where hand-tuned offsets stop working: everything still fits at
   1280, and two chips meet in the middle at 900. */
test("the viewport stays uncluttered when the window is narrow", opts, async () => {
  const page = await editor({ width: 900, height: 700 });
  await check(page, "narrow, idle");
  await startDatumSketch(page);
  await check(page, "narrow, sketching");
  await drawClosedProfile(page);
  await page.eval(() => document.getElementById("mdAcceptCommand").click());
  await page.waitUntil(() => {
    const host = document.getElementById("mdProfileOffer");
    return !!host && !host.hidden && host.querySelectorAll("button").length > 0;
  }, { what: "the profile offer" });
  await check(page, "narrow, profile offer up");
});
