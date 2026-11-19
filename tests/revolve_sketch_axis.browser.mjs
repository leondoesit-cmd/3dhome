import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";
import { startDatumSketch } from "./helpers/browser_sketch_workflow.mjs";

const chrome = await findChrome();
const opts = chrome ? { timeout: 300000 } : { skip: "no Chrome found" };

async function tap(page, x, y) {
  await page.eval(async (at) => {
    const canvas = document.getElementById("mdCanvas");
    for (const type of ["pointermove", "pointerdown", "pointerup"]) {
      canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true,
        button: 0, buttons: type === "pointerdown" ? 1 : 0, clientX: at.x, clientY: at.y }));
    }
  }, { x, y });
}

async function frontSketch() {
  const page = await openPage({ width: 1440, height: 1000, lang: "en", mobile: false, touch: false });
  await page.goto("/");
  await page.waitForBoot();
  await page.eval(() => { localStorage.removeItem("home3d_modeler_draft"); document.getElementById("openModelerTop").click(); });
  await page.waitUntil(() => !!document.getElementById("mdWelcomeClose"));
  await page.eval(() => document.getElementById("mdWelcomeClose").click());
  await startDatumSketch(page, "plane:front");
  const rect = await page.eval(() => { const r = document.getElementById("mdCanvas").getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
  return { page, rect };
}

test("probe: revolve about a selected sketch line", opts, async () => {
  const { page, rect } = await frontSketch();
  try {
    // a throw-away line measures where the sketch puts model space, then goes
    await page.eval(() => document.querySelector('#modeler [data-command="wall"]').click());
    await tap(page, rect.left + rect.width * .4, rect.top + rect.height * .5);
    await tap(page, rect.left + rect.width * .6, rect.top + rect.height * .4);
    const cal = await page.eval(() => window.cadSketchSnapshot());
    const [p, q] = cal.points, [s, r] = cal.screenPoints;
    const kx = (r.x - s.x) / (q.x - p.x), ky = (r.y - s.y) / (q.y - p.y);
    const map = { kx, ky, ox: s.x - p.x * kx, oy: s.y - p.y * ky };
    await page.eval(() => document.querySelector('#modeler [data-command="select"]').click());
    for (let i = 0; i < 4 && (await page.eval(() => window.cadSketchSnapshot().entityTypes.length)); i++) await page.eval(() => document.getElementById("mdUndo").click());
    const after = await page.eval(() => window.cadSketchSnapshot());
    console.log("after undo", after.entityTypes.length, after.phase, JSON.stringify(after.viewPose));
    const recheck = after.screenPoints;
    const at = (x, y) => tap(page, rect.left + map.ox + x * map.kx, rect.top + map.oy + y * map.ky);
    await page.eval(() => document.querySelector('#modeler [data-command="wall"]').click());
    for (const [x, y] of [[-12, 30.6], [12, 30.6], [12, 32], [6, 33.5], [-6, 33.5], [-12, 32], [-12, 30.6]]) await at(x, y);
    await page.eval(() => document.querySelector('#modeler [data-command="select"]').click());
    await at(0, 30.6);
    const drawn = await page.eval(() => window.cadSketchSnapshot());
    console.log("drawn", JSON.stringify({ points: drawn.points, types: drawn.entityTypes, constraints: drawn.constraintTypes }));
    console.log("selection", JSON.stringify(await page.eval(() => window.cadSelectionSnapshot())));
    await page.eval(() => window.__modelerRunCommand("finishsketch"));
    await page.eval(() => window.__modelerRunCommand("revolvefeature"));
    await page.waitUntil(() => !!document.querySelector('#mdQuickSettings [data-parameter="$axisReference"] select'), { what: "revolve form" });
    const options = await page.eval(() => [...document.querySelector('#mdQuickSettings [data-parameter="$axisReference"] select').options].map((o) => ({ value: o.value, label: o.textContent, selected: o.selected })));
    console.log("axis options", JSON.stringify(options));
    for (const axis of ["axis:y", "axis:x"]) {
      const ghost = await page.eval((value) => {
        const select = document.querySelector('#mdQuickSettings [data-parameter="$axisReference"] select');
        select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); select.dispatchEvent(new Event("input", { bubbles: true }));
        window.cadSetFeatureFormParams({});
        return window.cadFinishPreviewSnapshot();
      }, axis);
      console.log("preview", axis, JSON.stringify(ghost).slice(0, 600));
    }
    await page.eval(() => [...document.querySelectorAll("#mdQuickSettings .md-feature-actions button")].find((b) => b.querySelector(".ph-check")).click());
    await page.waitUntil(() => { const b = window.cadBodySnapshot(); return b.length && b.every((x) => !x.pending && x.triangles); }, { ms: 120000, what: "exact revolve body" });
    const body = await page.eval(() => {
      const b = window.cadBodySnapshot()[0], mesh = window.cadPartMeshSnapshot(b.id), box = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
      for (let i = 0; i < mesh.positions.length; i += 3) ["x", "y", "z"].forEach((k, j) => { box[k + "0"] = Math.min(box[k + "0"], mesh.positions[i + j]); box[k + "1"] = Math.max(box[k + "1"], mesh.positions[i + j]); });
      return { body: b, box, feature: window.cadLoopSnapshot().lastFeature };
    });
    console.log("committed", JSON.stringify(body));
  } finally { await page.close(); }
});
