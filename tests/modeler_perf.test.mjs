import { modelerSource as readModelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as acorn from "../vendor/acorn/acorn.mjs";
import { openPage, findChrome } from "../tools/browser_harness.mjs";
import { checkLateBoundThree } from "../tools/module_check.mjs";

const chrome = await findChrome();
const browserOpts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

const modelerSource = readModelerSource();

/* ---- Behavioural tests (real runtime invariants in the browser) -------- */

test("hover across model does zero part-geometry disposals and zero buildPart calls", browserOpts, async () => {
  const page = await openPage({ width: 1280, height: 800, lang: "en" });
  try {
    await page.goto("/");
    await page.eval(async () => {
      const { openModeler } = await import("/js/modeler.js");
      const fixture = await (await fetch("/tests/fixtures/legacy_feature_manager.json")).json();
      openModeler(null, fixture, null);
    });

    await page.waitUntil(() => {
      const el = document.getElementById("modeler");
      return !!el && getComputedStyle(el).display !== "none";
    }, { what: "the model editor to open" });

    await page.eval(() => {
      const welcome = document.getElementById("mdWelcome");
      if (welcome && !welcome.hidden) {
        const c = welcome.querySelector('[data-welcome-start="continue"]') || welcome.querySelector(".md-welcome-close");
        if (c) c.click();
      }
    });

    await page.waitUntil(() => {
      return !!window.cadPreviewView && !!window.cadBuildPartCount && !!window.cadDecoGroups;
    }, { what: "modeler preview to initialize" });

    /* buildPart is called through its local binding, so patching
       window.cadBuildPart observes nothing — read the in-module counter
       instead. Geometry disposal IS observable by patching dispose() on the
       live mesh instances, because clearGroup() calls it on those objects. */
    const beforeStats = await page.eval(() => {
      window._geometryDisposals = 0;
      window._buildPartAtStart = window.cadBuildPartCount();

      /* Each body now hangs under its own partRoot Group so a live parameter
         drag can dispose one body's meshes without touching the rest, so the
         part meshes are no longer direct children of grp. */
      const partMeshes = [];
      window.cadPreviewView.grp?.traverse((c) => { if (c.isMesh) partMeshes.push(c); });
      window._trackedGeometries = new Set();
      partMeshes.forEach((m) => {
        if (m.geometry) {
          window._trackedGeometries.add(m.geometry);
          const origDispose = m.geometry.dispose;
          m.geometry.dispose = function () {
            window._geometryDisposals++;
            return origDispose.apply(this, arguments);
          };
        }
      });
      return { meshCount: partMeshes.length, geomCount: window._trackedGeometries.size, buildPartAtStart: window._buildPartAtStart };
    });

    assert.ok(beforeStats.meshCount > 0, "at least one part mesh exists in preview");
    assert.equal(typeof beforeStats.buildPartAtStart, "number",
      "window.cadBuildPartCount() must exist — without it the buildPart assertion below is vacuous");

    // Simulate mouse hover movements across the 3D canvas
    await page.eval(async () => {
      const cv = document.getElementById("mdPrev") || document.querySelector("#modeler canvas");
      const r = cv.getBoundingClientRect();
      for (let i = 0; i < 20; i++) {
        const x = r.left + r.width * (0.3 + (i / 20) * 0.4);
        const y = r.top + r.height * 0.5;
        cv.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
          clientX: x, clientY: y, buttons: 0,
        }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    });

    // Verify zero buildPart calls and zero geometry disposals occurred during hover
    const afterStats = await page.eval(() => {
      return {
        buildPartCalls: window.cadBuildPartCount() - window._buildPartAtStart,
        geometryDisposals: window._geometryDisposals,
        activeMeshes: (() => { let n = 0; window.cadPreviewView.grp?.traverse((c) => { if (c.isMesh) n++; }); return n; })(),
      };
    });

    assert.equal(afterStats.buildPartCalls, 0, "zero buildPart calls must occur during hover");
    assert.equal(afterStats.geometryDisposals, 0, "zero part-geometry disposals must occur during hover");
    assert.equal(afterStats.activeMeshes, beforeStats.meshCount, "part mesh count must remain unchanged");
  } finally {
    await page.close();
  }
});

test("assembly multi-instance isolation: hovering an edge on one component does not decorate the matching edge on a second instance", browserOpts, async () => {
  const page = await openPage({ width: 1280, height: 800, lang: "en" });
  try {
    await page.goto("/");
    await page.eval(async () => {
      const { openModeler } = await import("/js/modeler.js");
      const fixture = await (await fetch("/tests/fixtures/legacy_feature_manager.json")).json();
      openModeler(null, fixture, null);
    });

    await page.waitUntil(() => {
      const el = document.getElementById("modeler");
      return !!el && getComputedStyle(el).display !== "none";
    }, { what: "the model editor to open" });

    await page.eval(() => {
      const welcome = document.getElementById("mdWelcome");
      if (welcome && !welcome.hidden) {
        const c = welcome.querySelector('[data-welcome-start="continue"]') || welcome.querySelector(".md-welcome-close");
        if (c) c.click();
      }
    });

    await page.waitUntil(() => !!window.cadPreviewView && !!window.cadRefreshDecorations
      && !!window.cadDecoGroups && !!window.cadSetHoverTopology,
      { what: "modeler decoration seams to initialize" });

    /* Two components off ONE library part therefore share every persistentId.
       refreshDecorations() runs outside buildAssembly's scope, so the only
       thing stopping a hover on one instance from lighting the other is its
       restore of E.buildComponent per entry. Reuse a part the editor actually
       built — a hand-rolled one silently produces no edges — and require BOTH
       halves: component 1 lights, component 2 does not. Asserting only the
       second half passes on an empty scene and would not notice the isolation
       being deleted outright. */
    const result = await page.eval(async () => {
      const { THREE } = await import("/js/three_lazy.js");
      const source = window.cadDecoGroups[0];
      if (!source) return { error: "no decoration groups were built" };

      const comp1 = { id: "comp-inst-1", name: "Instance 1", visible: true };
      const comp2 = { id: "comp-inst-2", name: "Instance 2", visible: true };
      const group1 = new THREE.Group(), group2 = new THREE.Group();

      window.cadSetHoverTopology(null);
      window.cadDecoGroups.length = 0;
      window.cadDecoGroups.push(
        { part: source.part, mesh: source.mesh, group: group1, component: comp1 },
        { part: source.part, mesh: source.mesh, group: group2, component: comp2 }
      );

      // Pass 1: no hover. Proves the shared part yields pickable edges at all —
      // without this the isolation assertion could pass on an empty scene.
      window.cadRefreshDecorations();
      const topoLine = (g) => g.children.find((c) => c.isLine && c.userData && c.userData.cadTopology);
      const hoverId = (topoLine(group1) || { userData: { cadTopology: {} } }).userData.cadTopology.persistentId;
      const baseline = {
        one: group1.children.filter((c) => c.isMesh).length,
        two: group2.children.filter((c) => c.isMesh).length,
        edges: group1.children.filter((c) => c.isLine).length,
      };

      /* Pass 2: hover an edge stamped as component 1's. Force both entries
         dirty so the per-entry rebuild filter cannot mask the isolation
         behaviour this test exists to check. */
      window.cadSetHoverTopology({ kind: "edge", persistentId: hoverId, componentId: comp1.id });
      window.cadDecoGroups.forEach((entry) => { entry.dirty = true; });
      window.cadRefreshDecorations();

      const out = {
        hoverId: hoverId || null,
        baseline: baseline,
        comp1Highlights: group1.children.filter((c) => c.isMesh).length,
        comp2Highlights: group2.children.filter((c) => c.isMesh).length,
      };
      window.cadSetHoverTopology(null);
      window.cadDecoGroups.length = 0;
      if (window.cadUpdatePreview) window.cadUpdatePreview();   // put the real decoration back
      return out;
    });

    assert.equal(result.error, undefined, result.error || "");
    assert.ok(result.baseline.edges > 0,
      "the shared part must yield pickable edges, otherwise the isolation check below is vacuous");
    assert.ok(result.hoverId, "an edge persistentId must be resolvable to hover");
    assert.equal(result.baseline.one, 0, "no highlight before anything is hovered");
    assert.equal(result.baseline.two, 0, "no highlight before anything is hovered");

    // The positive control. If this is 0 the negative assertion proves nothing.
    assert.ok(result.comp1Highlights > 0,
      "the hovered component must be decorated — without this the isolation assertion is vacuous");
    assert.equal(result.comp2Highlights, 0,
      "a second instance of the same model must NOT be decorated by a hover on the first");
  } finally {
    await page.close();
  }
});

test("a selection change consumes the existing coreRun instead of rebuilding the document", browserOpts, async () => {
  const page = await openPage({ width: 1280, height: 800, lang: "en" });
  try {
    await page.goto("/");
    await page.eval(async () => {
      const { openModeler } = await import("/js/modeler.js");
      const fixture = await (await fetch("/tests/fixtures/canonical_parametric.json")).json();
      openModeler(null, fixture, null);
    });
    await page.waitUntil(() => {
      const el = document.getElementById("modeler");
      return !!el && getComputedStyle(el).display !== "none";
    }, { what: "the model editor to open" });
    await page.eval(() => {
      const welcome = document.getElementById("mdWelcome");
      if (welcome && !welcome.hidden) {
        const c = welcome.querySelector('[data-welcome-start="continue"]') || welcome.querySelector(".md-welcome-close");
        if (c) c.click();
      }
    });
    await page.waitUntil(() => !!window.cadPreviewView && !!window.cadRebuildDocCount, { what: "modeler preview to initialize" });

    /* Counts structuredClone, which rebuildParametricDocument calls twice per
       run (once for the snapshot, once inside ensureParametricDocument). A
       selection click cannot change the document, so a run there would
       reproduce the coreRun already held — the redundant work this guards. */
    const counts = await page.eval(() => {
      const before = window.cadRebuildDocCount();
      const workBefore = window.cadPreviewWorkSnapshot();
      const meshes = [];
      window.cadPreviewView.grp.traverse(object => { if (object.isMesh && object.userData.cadPart) meshes.push(object); });
      const identities = meshes.map(object => ({ object, geometry: object.geometry }));
      let disposals = 0;
      for (const geometry of new Set(meshes.map(object => object.geometry))) {
        const dispose = geometry.dispose;
        geometry.dispose = function () { disposals++; return dispose.apply(this, arguments); };
      }
      const canvas = document.querySelector("#mdPrev");
      const r = canvas.getBoundingClientRect();
      for (const type of ["pointerdown", "pointerup"]) {
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
          button: 0, buttons: type === "pointerdown" ? 1 : 0,
        }));
      }
      const workAfter = window.cadPreviewWorkSnapshot();
      return { rebuilds: window.cadRebuildDocCount() - before, seam: typeof window.cadRebuildDocCount,
        builds: workAfter.builds - workBefore.builds, disposals,
        stableMeshes: identities.every(({ object, geometry }) => object.parent && object.geometry === geometry),
        meshes: meshes.length, drawingBefore: workBefore.drawingToken, drawingAfter: workAfter.drawingToken };
    });

    assert.equal(counts.seam, "function",
      "window.cadRebuildDocCount() must exist — without it the assertion below is vacuous");
    assert.equal(counts.rebuilds, 0,
      "a selection click must not re-run rebuildParametricDocument — refreshSelection consumes the existing coreRun");
    assert.ok(counts.meshes > 0);
    assert.equal(counts.builds, 0, 'selection must retain committed solid buffers');
    assert.equal(counts.disposals, 0, 'selection must not dispose solid geometry');
    assert.equal(counts.stableMeshes, true);
    assert.equal(counts.drawingAfter, counts.drawingBefore, 'selection must retain drawing projections');
  } finally {
    await page.close();
  }
});

/* ---- Structural AST and rule enforcement tests ------------------------- */

test("checkLateBoundThree catches module-scope new THREE.* instantiations", () => {
  const badSource = `
    import { THREE } from "./three_lazy.js";
    var scratch = new THREE.Raycaster();
    export function foo() {}
  `;
  const ast = acorn.parse(badSource, { ecmaVersion: "latest", sourceType: "module", locations: true });
  const violations = [];
  checkLateBoundThree(ast, (node, expr) => violations.push({ line: node.loc.start.line, expr }));
  assert.equal(violations.length, 1);
  assert.match(violations[0].expr, /new THREE\.Raycaster\(\)/);

  const goodSource = `
    import { THREE } from "./three_lazy.js";
    var scratch = null;
    export function getScratch() {
      if (!scratch) scratch = new THREE.Raycaster();
      return scratch;
    }
  `;
  const goodAst = acorn.parse(goodSource, { ecmaVersion: "latest", sourceType: "module", locations: true });
  const goodViolations = [];
  checkLateBoundThree(goodAst, (node, expr) => goodViolations.push(expr));
  assert.equal(goodViolations.length, 0);
});

test("opening a canonical document rebuilds it exactly once, not twice", browserOpts, async () => {
  const page = await openPage({ width: 1280, height: 800, lang: "en" });
  try {
    await page.goto("/");
    await page.eval(async () => { await import("/js/modeler.js"); });
    await page.waitUntil(() => !!window.cadRebuildDocCount, { what: "modeler module to evaluate" });

    /* openModeler() rebuilds the document, then calls refreshAll(), which would
       rebuild it again. coreRunFresh makes the refresh consume that run. This
       replaces a source-regex assertion that broke the moment a counter was
       added one line above the pattern it matched — the behaviour is what
       matters, not the shape of the source. */
    const rebuilds = await page.eval(async () => {
      const { openModeler } = await import("/js/modeler.js");
      const fixture = await (await fetch("/tests/fixtures/canonical_parametric.json")).json();
      const before = window.cadRebuildDocCount();
      openModeler(null, fixture, null);
      await new Promise((r) => requestAnimationFrame(r));
      return window.cadRebuildDocCount() - before;
    });

    assert.equal(rebuilds, 1, "a canonical open must run rebuildParametricDocument exactly once");
  } finally {
    await page.close();
  }
});

test("editor_view guards resize layout reads with sizeDirty", async () => {
  const editorViewSource = await readFile(new URL("../js/editor_view.js", import.meta.url), "utf8");
  assert.match(editorViewSource, /var lastW\s*=\s*0,\s*lastH\s*=\s*0,\s*settling\s*=\s*0,\s*sizeDirty\s*=\s*true;/);
  assert.match(editorViewSource, /view\.invalidateSize\s*=\s*function\s*\(\)\s*\{\s*sizeDirty\s*=\s*true;\s*\};/);
  assert.match(editorViewSource, /if\s*\(!force\s*&&\s*!sizeDirty\)\s*return\s*false;/);
});

test("parametric_rebuild avoids deep cloning snapshot and features", async () => {
  const rebuildSource = await readFile(new URL("../js/core/parametric_rebuild.js", import.meta.url), "utf8");
  assert.match(rebuildSource, /const executable\s*=\s*\{\s*\.\.\.compiled\.document,\s*sketches:\s*\(compiled\.document\.sketches\s*\|\|\s*\[\]\)\.map/);
  assert.doesNotMatch(rebuildSource, /const executable\s*=\s*cloneDomain\(snapshot\);/);
});

test("cad_kernel shapeToMeshData batches node transformation into Float64Array", async () => {
  const kernelSource = await readFile(new URL("../js/cad_kernel.js", import.meta.url), "utf8");
  assert.match(kernelSource, /const nbNodes\s*=\s*triangulation\.NbNodes\(\);/);
  assert.match(kernelSource, /const nodes\s*=\s*new Float64Array\(nbNodes \* 3\);/);
  assert.match(kernelSource, /for\s*\(let n = 1;\s*n <= nbNodes;\s*n\+\+\)\s*\{/);
});

test("inspector panes use active-tab dirty flags: inactive tabs are deferred until clicked", browserOpts, async () => {
  const page = await openPage({ width: 1280, height: 800, lang: "en" });
  try {
    await page.goto("/");
    await page.eval(async () => {
      const { openModeler } = await import("/js/modeler.js");
      const fixture = await (await fetch("/tests/fixtures/legacy_feature_manager.json")).json();
      openModeler(null, fixture, null);
    });

    await page.waitUntil(() => {
      const el = document.getElementById("modeler");
      return !!el && getComputedStyle(el).display !== "none";
    });

    await page.eval(() => {
      const welcome = document.getElementById("mdWelcome");
      if (welcome && !welcome.hidden) {
        const c = welcome.querySelector('[data-welcome-start="continue"]') || welcome.querySelector(".md-welcome-close");
        if (c) c.click();
      }
    });

    await page.waitUntil(() => !!window.cadInspectorDirty);

    const dirtyStateBefore = await page.eval(() => {
      return { ...window.cadInspectorDirty };
    });

    // shape is the default active tab on open, so shape should have been cleared, others dirty
    assert.equal(dirtyStateBefore.shape, false, "active tab 'shape' must have its dirty flag cleared after fillInspector");
    assert.equal(dirtyStateBefore.look, true, "inactive tab 'look' must remain dirty until selected");
    assert.equal(dirtyStateBefore.ops, true, "inactive tab 'ops' must remain dirty until selected");

    // Switch to Look tab
    await page.eval(() => {
      const lookTab = document.querySelector('[data-tab="look"]');
      if (lookTab) lookTab.click();
    });

    const dirtyStateAfter = await page.eval(() => {
      return { ...window.cadInspectorDirty };
    });

    assert.equal(dirtyStateAfter.look, false, "switching to 'look' tab must render the pane and clear its dirty flag");
  } finally {
    await page.close();
  }
});

test("inspectorDirty replaces lastInspectorSignature with no force parameter", () => {
  assert.match(modelerSource, /var inspectorDirty\s*=\s*\{\s*sketch:\s*true,\s*shape:\s*true,\s*look:\s*true,\s*ops:\s*true\s*\};/);
  assert.doesNotMatch(modelerSource, /lastInspectorSignature/);
  assert.doesNotMatch(modelerSource, /function fillInspector\s*\(\s*force\s*\)/);
  assert.match(modelerSource, /function fillInspector\s*\(\s*\)/);
});

test("shapeToMeshData generates Float32Array normals, colors, and subshapeMap", async () => {
  const kernelSource = await readFile(new URL("../js/cad_kernel.js", import.meta.url), "utf8");
  assert.match(kernelSource, /const normals\s*=\s*new Float32Array\(positions\.length\);/);
  assert.match(kernelSource, /const colors\s*=\s*new Float32Array\(positions\.length\);/);
  assert.match(kernelSource, /const subshapeMap\s*=\s*Object\.create\(null\);/);
  assert.match(kernelSource, /return\s*\{\s*positions,\s*normals,\s*colors,\s*faceRanges,\s*subshapeMap\s*[,}]/);
});

test("2D canvas pointermove uses requestAnimationFrame coalescing", () => {
  assert.match(modelerSource, /var pointerMoveRaf\s*=\s*0;/);
  assert.match(modelerSource, /pointerMoveRaf\s*=\s*requestAnimationFrame\(/);
  assert.match(modelerSource, /function flush2DPointerMove\(\)/);
  assert.match(modelerSource, /function cancel2DPointerMove\(\)/);
});

test("refreshDecorations uses spatial and hover filtering to avoid re-creating unaffected groups", () => {
  assert.match(modelerSource, /function isEntryAffectedByHover\(entry,\s*hoverRef\)/);
  assert.match(modelerSource, /var needsRebuild\s*=\s*entry\.group\.children\.length\s*===\s*0/);
});

test("resolveTopologyPick uses spatial bounding box candidate filtering and scratch Matrix4/Vector3", () => {
  assert.match(modelerSource, /getScratchCandidateBox\(\)/);
  assert.match(modelerSource, /candidateBox\.expandByScalar\(threshold\);/);
  assert.match(modelerSource, /ray\.ray\.intersectsBox\(candidateBox\)/);
  assert.match(modelerSource, /_scratchToComponent\.copy\(meshChain\.group\.matrixWorld\)\.invert\(\)/);
});

test("closeModeler cleans up animation frames and hover state", () => {
  assert.match(modelerSource, /if\s*\(cancel2DPointerMoveGlobal\)\s*cancel2DPointerMoveGlobal\(\);/);
  assert.match(modelerSource, /E\.hoverTopology\s*=\s*null;/);
});

