/* Drawing mode in a real browser.
 *
 * The sheet is painted on a canvas, so there is no DOM to assert against: these
 * drive the drafting table through window.cadDrawingSheet — the same debugging
 * door cadPreviewView opens for the 3D preview — and check the things a
 * drawing is wrong without. That a view stays on its projection line when
 * dragged, that a dimension needs a snap and then measures the real geometry,
 * that a section produces a hatched view of the half that is left, and that the
 * exported SVG is the sheet on screen rather than a second drawing.
 *
 * Skips itself when Chrome is absent — set CHROME_PATH to point at a binary.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

const BRACKET = {
  key: "browser_drawing_bracket", name: "Bracket", price: 0,
  parts: [
    { id: "p1", kind: "box", name: "Base", color: "#9aa3ad", x0: -10, x1: 10, y0: 0, y1: 4, z0: -6, z1: 6 },
    { id: "p2", kind: "box", name: "Web", color: "#9aa3ad", x0: -10, x1: -6, y0: 0, y1: 14, z0: -6, z1: 6 },
    { id: "p3", kind: "cyl", name: "Boss", color: "#9aa3ad", x: 4, y: -1, z: 0, r: 2.5, h: 6 },
  ],
};

let shared = null;

/* One page for the file: opening the editor is the slow part, and every test
   here starts from the same sheet. */
async function sheetPage() {
  if (!chrome) return null;
  if (!shared) {
    shared = await openPage({ width: 1280, height: 820, mobile: false, touch: false });
    await shared.waitForBoot();
  } else {
    await shared.goto("/");
  }
  shared.consoleErrors.length = 0;
  await shared.eval(async (def) => {
    const start = [...document.querySelectorAll("button")].find((b) => /Continue with/i.test(b.textContent));
    if (start) start.click();
    const modeler = await import("/js/modeler.js");
    modeler.openModeler(def.key, JSON.parse(JSON.stringify(def)), null);
  }, BRACKET);
  await shared.waitUntil(() => {
    const welcome = document.getElementById("mdWelcome");
    if (welcome && !welcome.hidden) {
      const close = welcome.querySelector('[data-welcome-start="continue"]') || welcome.querySelector(".md-welcome-close");
      if (close) { close.click(); return false; }
    }
    const root = document.getElementById("modeler");
    return !!root && getComputedStyle(root).display !== "none" && !root.classList.contains("md-welcome-open");
  }, { what: "the model editor to open" });
  await shared.eval(() => document.querySelector('#mdModes [data-mode="drawing"]').click());
  await shared.waitUntil(() => !!window.cadDrawingSheet && window.cadDrawingSheet.scene().views.length > 0,
    { what: "the drawing sheet to build" });
  return shared;
}

test.after(async () => {
  if (shared) await shared.close();
});

test("a sheet opens on the standard views, dimensioned, with its own chrome", opts, async () => {
  const page = await sheetPage();
  const state = await page.eval(() => {
    const sheet = window.cadDrawingSheet, scene = sheet.scene();
    const root = document.getElementById("modeler");
    return {
      views: scene.views.map((place) => place.view.label),
      dims: (sheet.status().dims),
      panel: !!document.querySelector("#mdSheetPanel:not([hidden])"),
      toolbar: getComputedStyle(document.getElementById("mdDrawingTools")).display,
      tree: getComputedStyle(root.querySelector(".md-left")).display,
      status: document.getElementById("mdStatus").textContent,
      paper: scene.paper,
    };
  });
  assert.deepEqual(state.views, ["FRONT", "TOP", "RIGHT", "ISOMETRIC"]);
  assert.equal(state.dims, 2, "the two overall sizes are on the sheet before anyone drafts");
  assert.equal(state.panel, true, "the sheet's properties replace the inspector");
  assert.equal(state.toolbar, "flex");
  assert.equal(state.tree, "none", "a feature tree says nothing about a drawing");
  assert.deepEqual(state.paper, { w: 420, h: 297, label: "A3" });
  assert.match(state.status, /A3/);
  assert.match(state.status, /1:2/);
});

test("the sheet is actually painted, in more than one line weight", opts, async () => {
  const page = await sheetPage();
  const ink = await page.eval(() => {
    const canvas = document.getElementById("mdCanvas");
    const context = canvas.getContext("2d");
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0, paper = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luma = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (data[i + 3] > 8 && luma < 120) dark++;
      else if (luma > 240) paper++;
    }
    return { dark, paper };
  });
  assert.ok(ink.paper > 10000, "there is a white page under the drawing");
  assert.ok(ink.dark > 500, "and lines inked on it");
});

test("a dragged view slides along its projection line and never off it", opts, async () => {
  const page = await sheetPage();
  const moved = await page.eval(() => {
    const sheet = window.cadDrawingSheet, canvas = document.getElementById("mdCanvas");
    const rect = canvas.getBoundingClientRect(), state = sheet.state;
    const at = (mm) => ({ x: mm.x * state.zoom + state.ox + rect.left, y: mm.y * state.zoom + state.oy + rect.top });
    const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y, bubbles: true, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1,
    }));
    const before = sheet.scene().views.find((place) => place.view.label === "RIGHT");
    const grip = at({ x: before.x, y: before.y });
    send("pointerdown", grip.x, grip.y);
    send("pointermove", grip.x + 40, grip.y + 40);
    send("pointerup", grip.x + 40, grip.y + 40);
    const after = sheet.scene().views.find((place) => place.view.label === "RIGHT");
    return {
      selected: sheet.selection(),
      dx: Math.round((after.x - before.x) * 100) / 100,
      expected: Math.round((40 / state.zoom) * 100) / 100,
      dy: after.y - before.y,
    };
  });
  assert.equal(moved.selected.kind, "view");
  assert.equal(moved.dx, moved.expected, "it follows the cursor along its free axis");
  assert.equal(moved.dy, 0, "and holds the front view's centre line");
});

test("a dimension needs a snap, then measures the projected geometry", opts, async () => {
  const page = await sheetPage();
  const result = await page.eval(() => {
    const sheet = window.cadDrawingSheet, canvas = document.getElementById("mdCanvas");
    const rect = canvas.getBoundingClientRect(), state = sheet.state;
    const at = (mm) => ({ x: mm.x * state.zoom + state.ox + rect.left, y: mm.y * state.zoom + state.oy + rect.top });
    const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y, bubbles: true, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1,
    }));
    const click = (point) => { send("pointermove", point.x, point.y); send("pointerdown", point.x, point.y); send("pointerup", point.x, point.y); };
    document.querySelector('[data-drawing-tool="dim"]').click();
    const front = sheet.scene().views.find((place) => place.view.label === "FRONT");
    /* Empty paper first: a dimension that starts anywhere is a dimension that
       measures nothing. */
    const blank = at({ x: front.box.x - 30, y: front.box.y - 30 });
    click(blank);
    const startedOnNothing = !!sheet.state.draft;
    /* Then the two ends of the longest horizontal edge in the view. */
    let widest = null;
    for (const segment of front.projection.visible) {
      if (Math.abs(segment.a.v - segment.b.v) > 0.01) continue;
      const length = Math.abs(segment.a.u - segment.b.u);
      if (!widest || length > widest.length) widest = { length, segment };
    }
    click(at(front.toSheet(widest.segment.a)));
    const snapped = sheet.state.snap && sheet.state.snap.kind;
    click(at(front.toSheet(widest.segment.b)));
    const picked = sheet.state.draft ? sheet.state.draft.refs.length : 0;
    const below = at({ x: front.x, y: front.box.y + front.box.h + 24 });
    click(below);
    const dims = sheet.scene().items.filter((item) => item.dimId && item.type === "text");
    return {
      startedOnNothing, snapped, picked,
      values: dims.map((item) => item.text),
      measured: Math.round(widest.length * 100),
      selection: sheet.selection(),
    };
  });
  assert.equal(result.startedOnNothing, false, "nothing to snap to means nothing is started");
  assert.equal(result.snapped, "end");
  assert.equal(result.picked, 2);
  assert.equal(result.selection.kind, "dim", "the new dimension is what is selected afterwards");
  assert.equal(result.values.length, 3, "the two overall sizes plus the one just placed");
  assert.ok(result.values.includes(String(result.measured / 10)),
    "it reads the length of the edge it was placed on, in the sheet's millimetres");
});

test("a section cut produces a hatched view of the half that is left", opts, async () => {
  const page = await sheetPage();
  const result = await page.eval(() => {
    const sheet = window.cadDrawingSheet, canvas = document.getElementById("mdCanvas");
    const rect = canvas.getBoundingClientRect(), state = sheet.state;
    const at = (mm) => ({ x: mm.x * state.zoom + state.ox + rect.left, y: mm.y * state.zoom + state.oy + rect.top });
    const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y, bubbles: true, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1,
    }));
    document.querySelector('[data-drawing-tool="section"]').click();
    const front = sheet.scene().views.find((place) => place.view.label === "FRONT");
    const start = at({ x: front.x - 10, y: front.y - 20 }), end = at({ x: front.x - 10, y: front.y + 25 });
    send("pointerdown", start.x, start.y);
    send("pointermove", end.x, end.y);
    send("pointerup", end.x, end.y);
    const scene = sheet.scene();
    const section = scene.views.find((place) => place.view.section);
    return {
      label: section && section.view.label,
      hatch: scene.items.filter((item) => item.style === "hatch").length,
      cutline: scene.items.filter((item) => item.style === "cutline").length,
      views: scene.views.length,
      status: document.getElementById("mdStatus").textContent,
    };
  });
  assert.match(result.label, /SECTION A-A/);
  assert.ok(result.hatch > 4, "the cut face is hatched");
  assert.ok(result.cutline > 0, "and the parent view carries the cutting plane line");
  assert.equal(result.views, 5);
  assert.match(result.status, /5 views/);
});

test("sheet setup rewrites the paper, and the export is the sheet on screen", opts, async () => {
  const page = await sheetPage();
  const result = await page.eval(() => {
    const sheet = window.cadDrawingSheet;
    const select = document.querySelector("#mdSheetSize");
    select.value = "A4";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const svg = sheet.svg();
    return {
      paper: sheet.scene().paper,
      a4: /width="297mm" height="210mm"/.test(svg),
      views: (svg.match(/>FRONT</g) || []).length,
      title: /Bracket/.test(svg),
      angle: /THIRD ANGLE/.test(svg),
    };
  });
  assert.equal(result.paper.label, "A4");
  assert.equal(result.a4, true, "the SVG prints at the size the title block claims");
  assert.equal(result.views, 1);
  assert.equal(result.title, true);
  assert.equal(result.angle, true);
});

test("leaving and re-entering Drawing mode keeps the sheet that was drafted", opts, async () => {
  const page = await sheetPage();
  const kept = await page.eval(async () => {
    const sheet = window.cadDrawingSheet;
    sheet.addView("left");
    const before = sheet.scene().views.length;
    document.querySelector('#mdModes [data-mode="3d"]').click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    document.querySelector('#mdModes [data-mode="drawing"]').click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { before, after: window.cadDrawingSheet.scene().views.length };
  });
  assert.equal(kept.after, kept.before, "the drawing lives in the document, not in the mode");
});
