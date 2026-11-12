import test from "node:test";
import assert from "node:assert/strict";
import { findChrome, openPage } from "../tools/browser_harness.mjs";

const box = { key: "cm_mixed_box", name: "Box", parts: [
  { id: "box", kind: "box", x0: -4, x1: 4, y0: 0, y1: 3, z0: -2, z1: 2 },
] };
const lid = { key: "cm_mixed_lid", name: "Lid", parts: [
  { id: "lid", kind: "box", x0: -5, x1: 5, y0: 0, y1: 1, z0: -3, z1: 3 },
] };
const assembly = { key: "asm_mixed_box_lid", name: "Box and Lid", mates: [],
  components: [box, lid].map((part, i) => ({ id: i + 1, name: part.name, modelKey: part.key,
    def: part, grounded: true, visible: true, transform: { x: 0, y: i * 3, z: 0, rx: 0, ry: 0, rz: 0 } })) };

async function openDrawing(page, openAssembly) {
  await page.goto("/");
  await page.eval(async (key) => {
    [...document.querySelectorAll("button")].find(b => /Continue with/i.test(b.textContent))?.click();
    const { openModeler } = await import("/js/modeler.js");
    openModeler(key);
    document.querySelector('[data-welcome-start="continue"]')?.click();
  }, box.key);
  if (openAssembly) {
    await page.eval(() => {
      document.querySelector('#mdDocModes [data-doc="assembly"]').click();
      [...document.querySelectorAll("#mdLib .md-card")].find(card => card.querySelector(".nm")?.textContent === "Box and Lid").click();
    });
    await page.waitUntil(() => document.querySelector("#mdName").value === "Box and Lid", { what: "saved assembly to open" });
  }
  await page.eval(() => document.querySelector('#mdModes [data-mode="drawing"]').click());
  await page.waitUntil(() => window.cadDrawingSheet?.scene().views.length === 4, { what: "drawing views" });
}

async function changeView(page, index, option, value) {
  return page.eval((index, option, value) => {
    document.querySelectorAll("#mdSheetPanel .md-sheet-view-name")[index].click();
    const control = option === "source" ? document.querySelector("#mdSheetViewSource")
      : [...document.querySelectorAll("#mdSheetPanel select")].find(s => [...s.options].some(o => o.value === "shaded"));
    if (![...control.options].some(o => o.value === value)) throw new Error("Missing view choice " + value);
    control.value = value;
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }, index, option, value);
}

async function inspect(page) {
  return page.eval(() => window.cadDrawingSheet.scene().views.map(({ view, projection }) => ({
    dir: view.dir, source: view.source?.key || null, style: view.displayStyle,
    width: projection.bounds.u1 - projection.bounds.u0, height: projection.bounds.v1 - projection.bounds.v0,
    facets: projection.surfaces?.length || 0,
  })));
}

test("three Box views and a shaded Box and Lid view survive Save and a cold library reopen", {
  skip: !(await findChrome()) && "Chrome unavailable",
}, async () => {
  const page = await openPage({ width: 1360, height: 900 });
  try {
    await page.eval(async (box, lid, assembly) => {
      const store = await import("/js/core/model_library_store.js");
      const { tessellatePart } = await import("/js/core/part_tessellate.js");
      box.parts[0].meshData = {positions:tessellatePart(box.parts[0]).positions,
        exactBounds:{min:{x:-4,y:0,z:-2},max:{x:4,y:3.125,z:2}}};
      await store.putModelLibraryRecord(box);
      await store.putModelLibraryRecord(lid);
      await store.putAssemblyLibraryRecord(assembly);
    }, box, lid, assembly);
    await openDrawing(page, true);
    const initial = await inspect(page);
    assert.ok(initial.every(view => !view.source));
    assert.equal(initial[0].height, 4, "assembly includes the placed lid");
    for (let i = 0; i < 3; i++) await changeView(page, i, "source", "part:" + box.key);
    await changeView(page, 3, "style", "shaded");
    const mixed = await inspect(page);
    assert.deepEqual(mixed.slice(0, 3).map(v => [v.dir, v.source, v.width, v.height, v.facets]), [
      ["front", box.key, 8, 3, 0], ["top", box.key, 8, 4, 0], ["right", box.key, 4, 3, 0],
    ]);
    const exactHeight = await page.eval(() => {
      const sheet=window.cadDrawingSheet, front=sheet.scene().views[0];
      sheet.select({kind:"view",id:front.id});sheet.autoDimension();
      const vertical=[...sheet.scene().dims.values()].find(d=>d.dim.viewId===front.id && d.dim.type==="vertical" && d.dim.auto==="extent");
      return Math.abs(vertical.dim.refs[1].v-vertical.dim.refs[0].v);
    });
    assert.equal(exactHeight,3.125,"live overall dimension uses the kernel bounds, beyond the last mesh vertex");
    assert.equal(mixed[3].source, null);
    assert.equal(mixed[3].height, initial[3].height);
    assert.ok(mixed[3].facets > 6, "both solids produce shaded faces");
    const pickId = await page.eval(() => {
      const sheet=window.cadDrawingSheet, place=sheet.scene().views[0];
      const edge=place.projection.visible.find(s=>Math.abs(s.a.u-s.b.u)===8 && s.a.v===s.b.v);
      const pick=mm=>{
        const x=sheet.state.ox+mm.x*sheet.state.zoom, y=sheet.state.oy+mm.y*sheet.state.zoom;
        sheet.pointerMove({},x,y);sheet.pointerDown({button:0},x,y);sheet.pointerUp({button:0},x,y);
      };
      sheet.setTool("dim");
      pick(place.toSheet(edge.a));pick(place.toSheet(edge.b));pick({x:place.x,y:place.box.y+place.box.h+12});
      const id=sheet.selection()?.id, dim=sheet.scene().dims.get(id);
      if (!dim?.dim.sourceBinding || dim.dangling) throw new Error("Manual Box dimension did not bind to its projected edge");
      return id;
    });
    await page.eval(() => document.querySelector("#mdSave").click());
    await page.waitUntil(async () => {
      const { loadAssemblyLibrary } = await import("/js/core/model_library_store.js");
      const saved = (await loadAssemblyLibrary()).find(a => a.key === "asm_mixed_box_lid");
      return saved?.drawing?.views[3].displayStyle === "shaded";
    }, { what: "assembly drawing in IndexedDB" });
    await openDrawing(page, true);
    assert.deepEqual(await inspect(page), mixed);
    assert.equal(await page.eval(id=>window.cadDrawingSheet.scene().dims.get(id).dangling,pickId),false);
    assert.equal(await page.eval(() => document.querySelectorAll('#mdSheetPanel [data-view-source="part:cm_mixed_box"]').length), 3);

    // The reverse workflow starts on the part's sheet and inserts the assembly.
    await openDrawing(page, false);
    await changeView(page, 3, "source", "assembly:" + assembly.key);
    await changeView(page, 3, "style", "shaded");
    const iso = (await inspect(page))[3];
    assert.equal(iso.source, assembly.key);
    assert.equal(iso.height, mixed[3].height);
    assert.equal(iso.facets, mixed[3].facets);

    // Write through another tab's real library and BroadcastChannel. Observe
    // the idle panel and its last painted scene without forcing a scene read.
    await page.send("Runtime.evaluate", { expression:"window.mixedSourcePeer = window.open(location.href);", userGesture:true });
    await page.waitUntil(() => window.mixedSourcePeer?.__home3dBooted, {what:"second library tab to boot", ms:60000});
    const saveFromPeer = async (record, remove) => page.eval(async (record, remove) => {
      const peer = window.mixedSourcePeer, script = peer.document.createElement("script");
      script.type = "module";
      script.textContent = "import { saveAssemblies } from " + JSON.stringify(location.origin + "/js/modeler.js")
        + "; try { const ok = await saveAssemblies(" + JSON.stringify(remove ? record.key : record)
        + ", " + JSON.stringify(remove ? {mode:"delete"} : {}) + "); window.finished(ok); } catch(e) { window.failed(e); }";
      const done = new Promise((resolve,reject) => { peer.finished = resolve; peer.failed = reject; });
      peer.document.body.appendChild(script);
      return done;
    }, record, remove);
    const changed = structuredClone(assembly);
    changed.name = "Box and raised lid";
    changed.components[1].transform.y += 3;
    assert.equal(await saveFromPeer(changed,false),true);
    await page.waitUntil(() => document.querySelector(".md-sheet-view-source")?.textContent === "Box and raised lid",
      {what:"idle panel to display the renamed reference"});
    assert.ok(await page.eval((height) => window.cadDrawingSheet.state.scene.views[3].projection.bounds.v1
      - window.cadDrawingSheet.state.scene.views[3].projection.bounds.v0 > height, iso.height));
    assert.equal(await saveFromPeer(changed,true),true);
    await page.waitUntil(() => document.querySelector(".md-sheet-view-source")?.textContent.includes("(missing)"),
      {what:"idle drawing to display source deletion"});
    assert.equal(await page.eval(() => window.cadDrawingSheet.state.scene.views[3].projection.bounds),null);
    await page.eval(() => { window.mixedSourcePeer.close(); });

    // Losing a reference must not put the host Box in the assembly's place.
    const missing = await page.eval(async (key) => {
      const { deleteAssemblyLibraryRecord } = await import("/js/core/model_library_store.js");
      await deleteAssemblyLibraryRecord(key);
      const scene = window.cadDrawingSheet.scene(), view = scene.views[3];
      return { bounds: view.projection.bounds, issue: scene.diagnostics.find(d => d.viewId === view.id) };
    }, assembly.key);
    assert.equal(missing.bounds, null);
    assert.equal(missing.issue.code, "view-source-unavailable");
    assert.match(missing.issue.message, /Box and Lid/);
    await page.eval(async (record) => {
      const { putAssemblyLibraryRecord } = await import("/js/core/model_library_store.js");
      await putAssemblyLibraryRecord(record);
    }, assembly);
    assert.deepEqual((await inspect(page))[3], iso, "restoring the same library key restores the shaded projection");
    const imported = await page.eval(async (box, assembly) => {
      const store = await import("/js/core/model_library_store.js");
      assembly.drawing = { views:[{id:"front",dir:"front",source:{kind:"part",key:box.key}}] };
      await store.importKeptLibraryBundle({models:[box],assemblies:[assembly]});
      const saved = (await store.loadAssemblyLibrary()).find(a => a.key === assembly.key+"-2");
      return [saved.drawing.views[0].source.key, saved.components[0].modelKey];
    },box,assembly);
    assert.deepEqual(imported,[box.key+"-2",box.key+"-2"]);
  } finally {
    await page.close();
  }
});
