// The planner's light rig (js/view3d.js): physical light paths (a hidden
// ceiling is still a ceiling, nothing shines through a blind wall), penumbra
// settings that take effect, a shadow budget inside WebGPU's per-stage texture
// limit, and shadow redraws scoped to what moved. These are source checks —
// the rig only exists on a GPU.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = (await readFile(join(root, "js/view3d.js"), "utf8")).replace(/\r\n/g, "\n");
const between = (a, b) => {
  const i = src.indexOf(a);
  assert.ok(i >= 0, "missing: " + a);
  return src.slice(i, src.indexOf(b, i));
};

test("shadows use the PCF filter that reads shadow.radius", () => {
  // r185's PCFSoftShadowFilter is a fixed 3×3 gather: every radius was ignored
  assert.match(src, /renderer\.shadowMap\.type = THREE\.PCFShadowMap;/);
  assert.doesNotMatch(src, /shadowMap\.type = THREE\.PCFSoftShadowMap/);
});

test("no light reaches a room except through its openings", () => {
  // the fill light stays dark: nothing may shine down through a hidden ceiling
  assert.match(between("export function applyEnv()", "var relightHooks"), /flt\.intensity = LUX \* 0\.0;/);
  assert.doesNotMatch(src, /SKY_CASTER_LAYER/);
  const fit = between("function fitPracticalLights()", "function tagItemPhysicsRole");
  assert.match(fit, /!room && gap < o\.distance/, "a lamp outside every room that reaches the house is found");
  assert.match(fit, /rank: 0/, "and it is first in line for a shadow");
  assert.match(fit, /k\.l\.distance = k\.clip/, "over budget it stops at the wall instead");
  const ops = between("function applyItemOps()", "// Zero opacity keeps");
  assert.match(ops, /if \(lampMoved\) fitPracticalLights\(\);/, "a dragged lamp takes its clip and shadow along");
});

test("every casting light shares one budget under the 16-texture stage limit", () => {
  assert.match(src, /var MAX_SHADOW_MAPS = [1-8];/);
  const fit = between("function fitPracticalLights()", "function tagItemPhysicsRole");
  assert.match(fit, /MAX_SHADOW_MAPS - \(sun && sun\.castShadow \? 1 : 0\)/, "the sun takes a slot by day");
  assert.match(fit, /if \(!night && \(S\.dayK \|\| 0\) > 0\.02\)/, "windows hand over to the practicals at dusk");
  assert.match(fit, /!gameRendererLock/, "games never pay for the planner's shadows");
  assert.match(between("export function applyEnv()", "var relightHooks"), /sun\.castShadow = on;/,
    "a sun below the horizon casts nothing");
});

test("a drag redraws only the shadows that reach it, at a capped rate", () => {
  const ops = between("function applyItemOps()", "// Zero opacity keeps");
  assert.match(ops, /markShadowRegion\(region\);/);
  assert.doesNotMatch(ops, /shadowsDirty = true/, "a drag must not invalidate every map in the house");
  assert.match(between("function lightReaches(", "function syncShadowUpdates"), /box\.distanceToPoint\(_lightPos\) < o\.distance/);
  assert.match(src, /time - regionShadowT < 100/, "region redraws follow a drag at ~10 Hz");
});

test("orbit frames skip per-object uniform refreshes", () => {
  // a velocity target in the scene MRT makes three refresh every object's
  // uniforms on every frame; TRAA reprojects from depth + camera instead
  assert.match(src, /scenePass\.setMRT\(TSL\.mrt\(\{ output: TSL\.output, normal: TSL\.normalView \}\)\);/);
  assert.doesNotMatch(src, /velocity: TSL\.velocity/);
  assert.match(src, /traaPass = ADDONS\.traa\(lit, depthNode, velocityNode, camera\);/);
  const loop = between("var live = doorsMoving", "updateViewGizmo();");
  assert.match(loop, /syncCameraVelocity\(\);/, "the camera history advances once per painted frame");
});

test("a sun patch is brighter than the sky light beside the window", () => {
  const env = between("export function applyEnv()", "var relightHooks");
  const win = /o\.userData\.baseI \* ([\d.]+) \* dk/.exec(env);
  assert.ok(win && Number(win[1]) <= 0.8, "window sky light no longer drowns the sun patch");
});

test("a rebuild keeps the shaders it already has", () => {
  const memo = between("function surfaceMaterial(", "var shadowDirtyBox");
  assert.match(memo, /var hit = surfaceMemo\.get\(key\);/, "one material per distinct surface, across rebuilds");
  assert.match(memo, /mat\.dispose = keepShared;/, "every disposal path passes a shared surface by");
  assert.doesNotMatch(src.replace(memo, ""), /[^.\w]pbrSurfaceMaterial\((?!entry)/, "planner surfaces all go through the memo");
  assert.match(src, /if \(isSharedSurface\(mat\)\) mat = mat\.clone\(\);/, "x-ray never changes a shared surface");
  assert.match(between("export function rebuild3D()", "function tagItemPhysicsRole"), /retireGroup\(dyn\);/,
    "the old scene is disposed after the new one has painted");
  assert.match(src, /if \(retired\.length\) disposeRetired\(\);/);
  assert.match(src, /nowT - lastRebuildT > 400\) \{\s*renderer\.compile\(scene, camera\);/, "no full compile on back-to-back rebuilds");
});
