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
  assert.match(rebuild, /buildMEP3D\(mepRoot, THREE\);\s*if \(!isPhysicsEnabled\(\)\) mergeMEPMeshes\(mepRoot, THREE\);/);
  const only = sourceFunctionText(src, "rebuildMEP3D");
  assert.match(only, /if \(isPhysicsEnabled\(\)\) \{\s*S\.dirty3D = true;\s*return false;/, "physics keeps one body per pipe");
  assert.match(only, /ghostRoot\(mepRoot, false\);\s*retireGroup\(mepRoot\);\s*buildMEP3D\(mepRoot, THREE\);\s*mergeMEPMeshes\(mepRoot, THREE\);\s*applyLayers3D\(\);/);
});
