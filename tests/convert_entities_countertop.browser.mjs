import assert from "node:assert/strict";
import test from "node:test";
import { openPage, findChrome } from "../tools/browser_harness.mjs";
import { startDatumSketch } from "./helpers/browser_sketch_workflow.mjs";

const chrome = await findChrome();
const opts = chrome ? { timeout: 240000 } : { skip: "Chrome unavailable" };

async function editor(page) {
  await page.eval(async () => {
    const { E, openModeler, sketchProjection, sketchVisibleModelEdges, worldToSketchPx, toPx } = await import("/js/modeler.js");
    const { projectWorldToSketch } = await import("/js/sketch_intersection.js");
    const { edgePoints } = await import("/js/modeler_mesh_geometry.js");
    const { ensureSketch } = await import("/js/sketch_solver.js");
    window.cadModelEdgeCanvasPoints = id => {
      const edge = sketchVisibleModelEdges().find(item => item.persistentId === id);
      const projection = sketchProjection();
      return edgePoints(edge.descriptor).map(p => {
        if (projection) return worldToSketchPx(projection, p);
        const uv = projectWorldToSketch(ensureSketch(E.def), p);
        return toPx(uv.x, uv.y);
      }).filter(Boolean);
    };
    openModeler(null, { key: "countertop-convert", name: "Countertop", parts: [] }, null);
  });
  await page.waitUntil(() => { const el = document.getElementById("modeler"); return !!el && getComputedStyle(el).display !== "none"; }, { what: "editor" });
  await page.waitUntil(() => {
    const welcome = document.getElementById("mdWelcome");
    if (welcome && !welcome.hidden && getComputedStyle(welcome).display !== "none") {
      const c = welcome.querySelector('[data-welcome-start="continue"]') || welcome.querySelector(".md-welcome-close");
      if (c) { c.click(); return false; }
    }
    return !document.getElementById("modeler")?.classList.contains("md-welcome-open");
  }, { what: "welcome" });
}

async function typedRectangle(page, width, height) {
  await startDatumSketch(page);
  await page.eval(() => {
    const osnap = document.querySelector("#mdOsnap");
    if (osnap && osnap.checked) { osnap.checked = false; osnap.dispatchEvent(new Event("change", { bubbles: true })); }
    document.querySelector('#modeler [data-command="srect"]').click();
  });
  await page.waitUntil(() => window.cadSketchSnapshot?.().tool === "srect", { what: "rect tool" });
  return page.eval(async ([w, h]) => {
    const canvas = document.getElementById("mdCanvas"), rect = canvas.getBoundingClientRect();
    const x0 = rect.left + rect.width / 2 - 80, y0 = rect.top + rect.height / 2 - 60;
    const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 71, pointerType: "mouse", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y }));
    const key = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    fire("pointerdown", x0, y0); fire("pointermove", x0 + 120, y0 + 90);
    for (const ch of String(w)) key(ch); key("Tab"); for (const ch of String(h)) key(ch); key("Enter");
    await new Promise((r) => setTimeout(r, 90));
    return window.cadSketchSnapshot();
  }, [width, height]);
}

test("Project and Convert Entities use only the edges picked on the countertop face", opts, async () => {
  const page = await openPage({ width: 1440, height: 900, lang: "en", mobile: false, touch: false });
  try {
    await editor(page);
    await typedRectangle(page, 600, 580);
    await page.eval(() => document.getElementById("mdAcceptCommand").click());
    await page.waitUntil(() => { const host = document.getElementById("mdProfileOffer"); return !!host && !host.hidden && host.querySelectorAll("button").length > 0; }, { what: "offer" });
    await page.eval(() => document.querySelector("#mdProfileOffer button").click());
    await page.waitUntil(() => window.cadLoopSnapshot?.().authoring === "extrude", { what: "extrude form" });
    await page.eval(() => {
      const input = document.querySelector('#mdQuickSettings input[data-parameter="depth"], #mdQuickSettings [data-key="depth"] input');
      if (!input) throw new Error("no depth input: " + document.getElementById("mdQuickSettings").innerHTML.slice(0, 2000));
      input.value = "34"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.eval(() => document.getElementById("mdAcceptCommand").click());
    await page.waitUntil(() => window.cadLoopSnapshot?.().authoring === null, { what: "extrude commit", ms: 60000 });
    await page.waitUntil(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })); const s = window.cadSelectionSnapshot(); return s.kinds.includes("face"); }, { what: "topology", ms: 60000 });
    const selection = await page.eval(() => window.cadSelectionSnapshot());
    const top = selection.ids.find((id) => /:face:end$/.test(id));
    const edges = selection.ids.filter((id) => /:edge:profile:\d+:end$/.test(id));
    assert.ok(top && edges.length === 4, JSON.stringify(selection));
    await page.eval((id) => window.cadSelectTopologyById(id), top);
    await page.eval(() => document.querySelector('#modeler [data-command="newsketch"]').click());
    await page.waitUntil(() => window.cadSketchSnapshot?.().phase === "sketch", { what: "face sketch" });

    async function pick(id, add = false) {
      return page.eval(([id, add]) => {
        const canvas = document.getElementById("mdCanvas"), rect = canvas.getBoundingClientRect();
        const pts = window.cadModelEdgeCanvasPoints(id);
        const middle = Math.floor(pts.length / 3);
        const a = pts[middle], b = pts[middle + 1];
        const init = { bubbles: true, button: 0, pointerId: 1, pointerType: "mouse", ctrlKey: add,
          clientX: rect.left + (a.x + b.x) / 2, clientY: rect.top + (a.y + b.y) / 2 };
        canvas.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
        canvas.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
        return window.cadSelectionSnapshot().ids;
      }, [id, add]);
    }
    async function apply(command, construction = false) {
      await page.eval((id) => document.querySelector('#modeler [data-command="' + id + '"]').click(), command);
      const checked = await page.eval(() => document.querySelector('#mdQuickSettings input[type="checkbox"]').checked);
      assert.equal(checked, false, "profile geometry is the default");
      await page.eval((construction) => {
        if (construction) document.querySelector('#mdQuickSettings input[type="checkbox"]').click();
        document.querySelector("#mdQuickSettings .md-quick-apply").click();
      }, construction);
      return page.eval(() => window.cadSketchSnapshot());
    }

    assert.deepEqual(await pick(edges[0]), [edges[0]]);
    const projected = await apply("project");
    assert.deepEqual(projected.entityTypes, ["line"]);
    assert.deepEqual(projected.constructionFlags, [false]);
    assert.deepEqual(projected.constraintTypes, ["onModelEdge", "onModelEdge"]);
    assert.equal(projected.degreesOfFreedom, 0);
    await page.eval(() => document.getElementById("mdUndo").click());
    assert.deepEqual(await page.eval(() => window.cadSketchSnapshot().entityTypes), []);
    const silhouette = await page.eval(() => {
      window.cadClearTopologySelection();
      document.querySelector('#modeler [data-command="project"]').click();
      return window.cadSketchSnapshot();
    });
    assert.ok(silhouette.entityTypes.length >= 4 && silhouette.constructionFlags.every(Boolean));
    await page.eval(() => document.getElementById("mdUndo").click());
    assert.deepEqual(await pick(edges[0]), [edges[0]]);
    assert.deepEqual(await pick(edges[1], true), edges.slice(0, 2));
    const reference = await apply("convertentities", true);
    assert.deepEqual(reference.entityTypes, ["line", "line"]);
    assert.deepEqual(reference.constructionFlags, [true, true]);
    assert.equal(reference.degreesOfFreedom, 0);

    // Sketch the sink opening inside the face. Use the four picked corners
    // to place it on the countertop regardless of the sheet's zoom or origin.
    await page.eval((edges) => {
      const ends = edges.flatMap(id => window.cadModelEdgeCanvasPoints(id));
      const center = ends.reduce((c, p) => ({ x: c.x + p.x/ends.length, y: c.y + p.y/ends.length }), { x: 0, y: 0 });
      const rx = (Math.max(...ends.map(p => p.x)) - Math.min(...ends.map(p => p.x))) / 5;
      const ry = (Math.max(...ends.map(p => p.y)) - Math.min(...ends.map(p => p.y))) / 7;
      const canvas = document.getElementById("mdCanvas"), rect = canvas.getBoundingClientRect();
      document.querySelector('#modeler [data-command="sell"]').click();
      for (const [x, y] of [[0, 0], [rx, 0], [0, ry]]) {
        const init = { bubbles: true, button: 0, pointerId: 1, pointerType: "mouse",
          clientX: rect.left + center.x + x, clientY: rect.top + center.y + y };
        canvas.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
        canvas.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
      }
      document.querySelector('#modeler [data-command="select"]').click();
    }, edges);
    assert.deepEqual(await page.eval(() => window.cadSketchSnapshot().entityTypes), ["line", "line", "ellipse"]);
    await page.eval(() => document.getElementById("mdAcceptCommand").click());
    await page.waitUntil(() => [...document.querySelectorAll("#mdProfileOffer button")].some(b => /cut/i.test(b.textContent)), { what: "cut from the ellipse profile" });
    await page.eval(() => [...document.querySelectorAll("#mdProfileOffer button")].find(b => /cut/i.test(b.textContent)).click());
    await page.waitUntil(() => window.cadLoopSnapshot().authoring === "extrudeCut", { what: "cut form" });
    await page.eval(() => document.getElementById("mdAcceptCommand").click());
    await page.waitUntil(() => window.cadLoopSnapshot().authoring === null, { what: "cut commit", ms: 60000 });
    await page.waitUntil(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }));
      return window.cadSelectionSnapshot().shapes.includes("ellipse");
    }, { what: "exact elliptical cut rim", ms: 60000 });
    const cut = await page.eval(() => window.cadSelectionSnapshot());
    assert.equal(await page.eval(id => window.cadSelectTopologyById(id), top), true);
    await page.eval(() => document.querySelector('#modeler [data-command="newsketch"]').click());
    await page.waitUntil(() => window.cadSketchSnapshot().phase === "sketch", { what: "sketch on cut face" });
    const rim = cut.ids[cut.shapes.indexOf("ellipse")];
    const picked = await pick(rim);
    assert.deepEqual(picked, [rim]);
    const sink = await apply("convertentities");
    assert.deepEqual(sink.entityTypes, ["ellipse"], JSON.stringify({rim, picked, hint: await page.eval(() => document.getElementById("mdQuickSettings").innerText)}));
    assert.deepEqual(sink.constructionFlags, [false]);
    assert.equal(sink.degreesOfFreedom, 0);
  } finally { await page.close(); }
});
