/* The infrastructure-only 3D path (docs/perf_plan.md, package D): showing or
   hiding a system swaps the conduits instead of rebuilding the house, and
   the conduits are merged per material. GPU-only wiring, so pinned by source;
   the merge itself is tested by behaviour in mep_merge3d.test.mjs. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripComments } from "./source.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import { S } from "../js/state.js";

const read = (p) => stripComments(readFileSync(new URL("../" + p, import.meta.url), "utf8"));

test("S.mep3D is a transient flag that starts clear", () => {
  assert.equal(S.mep3D, false);
});

test("the MEP panel's visibility controls ask for the MEP-only rebuild", () => {
  const src = read("js/ui_mep.js");
  assert.match(src, /eye\.onclick = function \(\) \{\s*m\.vis\[sys\] = hidden;\s*S\.mep3D = true;/);
  assert.match(src, /optCheck\(t\("mep_3d"\), m\.show3D, function \(v\) \{ m\.show3D = v; S\.mep3D = true; \}\)/);
  assert.match(src, /m\.layerVis\[layer\] = v;\s*S\.mep3D = true;/);
  // the x-ray changes wall, slab and ground materials: those still rebuild everything
  assert.match(sourceFunctionText(src, "setRoutingLayer"), /S\.dirty3D = true;/);
});

test("the 3D loop drains S.mep3D after the item path and never before a full rebuild", () => {
  const src = stripComments(moduleSource("js/view3d.js"));
  assert.match(src, /if \(S\.mep3D && !S\.dirty3D && !heldNow\) \{\s*S\.mep3D = false;\s*rebuildMEP3D\(\);/);
  const rebuild = sourceFunctionText(src, "rebuild3D");
  assert.match(rebuild, /S\.mep3D = false;/, "a full rebuild covers the MEP-only one");
  assert.match(rebuild, /buildMEP3D\(mepRoot, THREE, cutH\(\)\);\s*if \(!isPhysicsEnabled\(\)\) mergeMEPMeshes\(mepRoot, THREE\);/);
  const only = sourceFunctionText(src, "rebuildMEP3D");
  assert.match(only, /if \(isPhysicsEnabled\(\)\) \{\s*S\.dirty3D = true;\s*return false;/, "physics keeps one body per pipe");
  assert.match(only, /ghostRoot\(mepRoot, false\);\s*retireGroup\(mepRoot\);\s*buildMEP3D\(mepRoot, THREE, cutH\(\)\);\s*mergeMEPMeshes\(mepRoot, THREE\);\s*applyLayers3D\(\);/);
});

test("an infrastructure-only edit swaps the conduits; one that moves an x-ray setting rebuilds", async () => {
  const { conduitsChanged, mepXrayKey, ensureMEP } = await import("../js/mep.js");
  S.mep = null;
  const m = ensureMEP();
  S.dirty3D = false; S.mep3D = false;
  conduitsChanged();
  assert.deepEqual([S.dirty3D, S.mep3D], [false, true]);
  S.mep3D = false;
  const before = mepXrayKey();
  conduitsChanged(before);
  assert.deepEqual([S.dirty3D, S.mep3D], [false, true], "x-ray unchanged");
  S.mep3D = false;
  m.xray.floor = !m.xray.floor; // e.g. a run put under the floor
  conduitsChanged(before);
  assert.deepEqual([S.dirty3D, S.mep3D], [true, false], "walls, slabs and ground change material");
  S.dirty3D = false;
});

test("inspector edits, adding a device and finishing a route use the MEP-only path", () => {
  const ui = read("js/ui_mep.js");
  assert.match(ui, /e\.elev = v; conduitsChanged\(\); render2D\(\);/);
  assert.match(ui, /e\.dia = Math\.max\(0\.5, v\); conduitsChanged\(\);/);
  assert.match(ui, /e\.exposed = v; conduitsChanged\(\);/);
  assert.match(ui, /e\.fall = Math\.max\(0, v\);\s*conduitsChanged\(\);/);
  assert.match(ui, /setMEPLayer\(e, lysel\.value\);\s*conduitsChanged\(xray0\);/);
  assert.match(ui, /deleteMEP\(sel\);\s*select\(null\);\s*conduitsChanged\(\);/);
  // x-ray settings and the layer-revealing actions keep the full rebuild
  assert.match(ui, /m\.xray\.walls = v;\s*S\.dirty3D = true;/);
  assert.match(sourceFunctionText(read("js/interaction/mep_tools.js"), "commitRoute"), /conduitsChanged\(xray0\);/);
  assert.match(read("js/interaction/pointer_down.js"), /select\(\{ kind: "mepNode", ref: nn \}\);\s*conduitsChanged\(xray0\);/);
});

test("an MEP drag repaints only the HUD while the overlay is there", () => {
  const move = stripComments(moduleSource("js/interaction.js"));
  assert.match(move, /dragMEP\(px, pz\);\s*S\.mep3D = true;\s*if \(mepOverlayOnHud\(\)\) requestRenderHUD\(\); else render2D\(\);/);
  // the same predicate that puts the overlay on the HUD while the flow animates
  assert.match(stripComments(moduleSource("js/plan2d.js")), /export function mepOverlayOnHud\(\) \{\s*return mepOnHud\(\);\s*\}/);
});
