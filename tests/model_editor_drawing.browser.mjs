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
      toolbarLeft: parseFloat(getComputedStyle(document.getElementById("mdDrawingTools")).insetInlineStart)
        || parseFloat(getComputedStyle(document.getElementById("mdDrawingTools")).left),
      saveDup: !!document.getElementById("mdDrawingSave"),
      workflow: getComputedStyle(document.getElementById("mdWorkflow")).display,
      titleOpen: [...document.querySelectorAll("#mdSheetPanel details.md-sheet-group")].at(-1)?.open === true,
      overlap: (() => {
        const boxes = scene.views.map((place) => place.box);
        const hits = [];
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            if (a.x < b.x + b.w + 2 && a.x + a.w + 2 > b.x && a.y < b.y + b.h + 2 && a.y + a.h + 2 > b.y) {
              hits.push(scene.views[i].view.label + " × " + scene.views[j].view.label);
            }
          }
        }
        return hits;
      })(),
      tree: getComputedStyle(root.querySelector(".md-left")).display,
      status: document.getElementById("mdStatus").textContent,
      paper: scene.paper,
    };
  });
  assert.deepEqual(state.views, ["FRONT", "TOP", "RIGHT", "ISOMETRIC"]);
  assert.equal(state.dims, 2, "the two overall sizes are on the sheet before anyone drafts");
  assert.equal(state.panel, true, "the sheet's properties replace the inspector");
  assert.equal(state.toolbar, "flex");
  assert.ok(state.toolbarLeft < 40, "tools sit in the left rail, not across the paper");
  assert.equal(state.saveDup, false, "Save lives in the header, not a second time on the sheet");
  assert.equal(state.workflow, "none", "the modelling breadcrumb is not a drawing control");
  assert.equal(state.titleOpen, false, "the title block starts folded so the views stay on screen");
  assert.deepEqual(state.overlap, [], "views do not sit on top of each other");
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

test("adding multiple views and re-laying out keeps zero overlaps and updates view scales", opts, async () => {
  const page = await sheetPage();
  const res = await page.eval(() => {
    const sheet = window.cadDrawingSheet;
    sheet.addView("left");
    sheet.addView("back");
    sheet.addView("bottom");
    sheet.relayout();
    const scene = sheet.scene();
    const boxes = scene.views.map((place) => place.box);
    const hits = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.x < b.x + b.w + 2 && a.x + a.w + 2 > b.x && a.y < b.y + b.h + 2 && a.y + a.h + 2 > b.y) {
          hits.push(scene.views[i].view.label + " × " + scene.views[j].view.label);
        }
      }
    }
    const viewListTags = [...document.querySelectorAll(".md-sheet-view-name small")].map((s) => s.textContent);
    return {
      viewsCount: scene.views.length,
      overlap: hits,
      tags: viewListTags,
    };
  });
  assert.equal(res.viewsCount, 7);
  assert.deepEqual(res.overlap, []);
  assert.ok(res.tags.length >= 7);
});

test("drawing mode hides tree toggle and eliminates inspector toggle overlap on sheet panel", opts, async () => {
  const page = await sheetPage();
  const state = await page.eval(() => {
    const leftToggle = document.getElementById("mdToggleLeft");
    const rightToggle = document.getElementById("mdToggleRight");
    const sheetPanel = document.getElementById("mdSheetPanel");
    const drawingTools = document.getElementById("mdDrawingTools");

    const leftStyle = getComputedStyle(leftToggle);
    const rightStyle = getComputedStyle(rightToggle);
    const sheetStyle = getComputedStyle(sheetPanel);
    const toolsStyle = getComputedStyle(drawingTools);

    const initial = {
      leftHidden: leftStyle.display === "none",
      rightHidden: rightStyle.display === "none",
      sheetVisible: sheetStyle.display !== "none",
      toolsVisible: toolsStyle.display !== "none",
    };

    // Collapse sheet panel via header action button
    const collapseBtn = sheetPanel.querySelector(".md-sheet-head-actions button:last-child");
    collapseBtn.click();

    const afterCollapse = {
      sheetDisplay: getComputedStyle(sheetPanel).display,
      rightDisplay: getComputedStyle(rightToggle).display,
    };

    // Expand again via floating right toggle
    rightToggle.click();

    const afterExpand = {
      sheetDisplay: getComputedStyle(sheetPanel).display,
      rightDisplay: getComputedStyle(rightToggle).display,
    };

    return { initial, afterCollapse, afterExpand };
  });

  assert.equal(state.initial.leftHidden, true, "tree toggle must be hidden in drawing mode");
  assert.equal(state.initial.rightHidden, true, "inspector toggle must be hidden while sheet panel is open");
  assert.equal(state.initial.sheetVisible, true);
  assert.equal(state.initial.toolsVisible, true);

  assert.equal(state.afterCollapse.sheetDisplay, "none", "sheet panel hides when collapsed");
  assert.notEqual(state.afterCollapse.rightDisplay, "none", "right toggle shows when sheet panel is collapsed");

  assert.notEqual(state.afterExpand.sheetDisplay, "none", "sheet panel shows when re-expanded");
  assert.equal(state.afterExpand.rightDisplay, "none", "right toggle hides when sheet panel is open");
});

/* Associativity, in the real editor: the sheet only knows the model's named
   geometry because modeler.js hands it topologyEntriesForPart. Nothing below
   the controller can be exercised anywhere else.

   The two points picked are the boss's rims, which the cylinder's topology
   names. A box's corner is deliberately NOT used: the editor draws solids as
   RoundedBoxGeometry, so the projected corner is a fillet and coincides with no
   named vertex — and a dimension that bound to the ideal corner anyway would be
   the nearest-match guess this whole mechanism refuses to make. */
test("a placed dimension binds to the model's own topology, and a lost one is listed", opts, async () => {
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
    /* The boss is x=4, y=-1, h=6: its two rims are seen edge-on here. */
    click(at(front.toSheet({ u: 4, v: 5 })));
    click(at(front.toSheet({ u: 4, v: -1 })));
    click(at({ x: front.box.x + front.box.w + 18, y: front.y }));
    const doc = sheet.document();
    const placed = doc.dims[doc.dims.length - 1];
    const bound = (placed.refs || []).map((ref) => ref.pid || null);
    const healthy = sheet.danglingDims().length;
    const panelClean = document.getElementById("mdSheetDangling").hidden;
    const value = (() => {
      const label = sheet.scene().items.find((item) => item.dimId === placed.id && item.type === "text");
      return label ? label.text : null;
    })();

    /* Now lose the reference the way a deleted feature would. */
    placed.refs.forEach((ref) => { ref.pid = "feature:gone:edge:x"; });
    sheet.invalidate();
    sheet.select({ kind: "dim", id: placed.id });
    const issues = sheet.danglingDims();
    const label = sheet.scene().items.find((item) => item.dimId === placed.id && item.type === "text");
    const panel = document.getElementById("mdSheetDangling");
    return {
      bound, healthy, panelClean, value,
      issues: issues.length,
      label: label ? label.text : null,
      panelShown: !panel.hidden,
      panelRows: panel.querySelectorAll(".md-sheet-dangling-item").length,
      exported: sheet.svg().includes("⚠ ("),
    };
  });
  assert.ok(result.bound.length === 2 && result.bound.every(Boolean),
    "both picks recorded a persistent topology id, not just a pair of view coordinates");
  assert.equal(result.value, "60", "and it measures the boss, 6 cm tall, in sheet millimetres");
  assert.equal(result.healthy, 0, "a sheet whose references all resolve reports nothing");
  assert.equal(result.panelClean, true);
  assert.equal(result.issues, 1);
  assert.match(result.label, /^⚠ \(/, "a dangling value is flagged and bracketed on the paper");
  assert.equal(result.panelShown, true, "and listed in the sheet panel where it can be acted on");
  assert.equal(result.panelRows, 1);
  assert.equal(result.exported, true, "the export says the same thing the canvas does");
});
