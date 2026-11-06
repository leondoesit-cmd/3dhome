// Wiring for fixes from the Codex review of the WebGPU migration. These paths
// run only on a GPU (offscreen sprite bakes, the Street View dome, RC body
// disposal, the benchmark page code), so the
// checks pin the code that carries each fix; the shared-texture lifetime
// itself is tested by behaviour in texture_share.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripComments } from "./source.mjs";
import { modelerSource } from "./helpers/modeler_source.mjs";

const read = (p) => stripComments(readFileSync(new URL("../" + p, import.meta.url), "utf8"));

test("a provisional sprite baked across a texture load is re-queued, not cached", () => {
  const src = read("js/plan_sprites.js");
  assert.match(src, /export function invalidateTexturedSprites\(\) \{\s*texGen\+\+;/);
  const pump = src.match(/async function pump\(\)[\s\S]*?\n}\n/);
  assert.ok(pump, "pump exists");
  assert.match(pump[0], /const gen = texGen;\s*const sp = await bake\(/);
  assert.match(pump[0], /if \(sp && sp\.prov && gen !== texGen\) \{[\s\S]*?queue\.set\(bestId, best\);[\s\S]*?\} else if \(sp\) \{\s*store\(/);
});

test("RC body disposal leaves textures shared with planner materials alone", () => {
  const src = read("js/rc_world.js");
  assert.match(src, /import \{ isSharedTexture \} from "\.\/pbr_material\.js";/);
  const dispose = src.match(/export function disposeGrp\(g\)[\s\S]*?\n}\n/);
  assert.ok(dispose, "disposeGrp exists");
  assert.match(dispose[0], /if \(o\.userData && o\.userData\.sharedMaps\) o\.traverse\(function \(x\) \{ borrowed\.add\(x\); \}\);/);
  assert.match(dispose[0], /if \(m\.map && m\.map\.dispose && !borrowed\.has\(o\) && !isSharedTexture\(m\.map\)\) m\.map\.dispose\(\);/);
  // custom bodies (built by planner builders from shared caches) are flagged
  const body = src.match(/export function customTruckBody\(key\)[\s\S]*?\n}\n/);
  assert.ok(body, "customTruckBody exists");
  assert.match(body[0], /wrap\.userData\.sharedMaps = true;\s*return wrap;/);
});

test("every sharedRepeat call names the material that holds the result", () => {
  const sources = [...["js/pbr_material.js", "js/primitives.js", "js/view3d.js"].map(read), stripComments(modelerSource())].join("\n");
  const calls = [...sources.matchAll(/\b(?:sharedRepeat|repeated)\(([^;]*?)\);/g)].map((m) => m[1]);
  assert.ok(calls.length >= 8, "found the call sites");
  for (const args of calls) assert.equal(args.split(",").length, 4, "owner missing in: " + args);
});

test("Street View faces are sampled as sRGB photographs", () => {
  const src = read("js/view3d.js");
  assert.match(src, /new THREE\.CubeTexture\([\s\S]{0,120}\);\s*cubeTex\.colorSpace = THREE\.SRGBColorSpace;/);
});

test("the GPU benchmark compiles the planner's lights and rejects fallback runs", () => {
  const src = read("tools/gpu_bench.mjs");
  // page code is a template string, so its comments sit between these lines
  assert.match(src, /r\.shadowMap\.enabled = true;[\s\S]{0,400}?v\.registerPlannerLights\(r\);\s*const scene = v\.getMainScene\(\)/);
  assert.match(src, /out\.backendMismatch = true;[\s\S]{0,200}return out;/);
  assert.match(src, /const valid = runs\.filter\(\(r\) => !r\.backendMismatch\);/);
});

test("the inspector's stand-in shadows follow in-place moves, not only rebuilds", () => {
  const view = read("js/view3d.js");
  assert.match(view, /export function shadowRevision\(\)/);
  const mark = view.match(/function markShadowRegion\(box, requeue\) \{[\s\S]*?\n}\n/);
  assert.ok(mark, "markShadowRegion exists");
  assert.match(mark[0], /if \(!requeue\) bumpShadowRevision\(\);/);
  assert.match(view, /function bumpShadowRevision\(\) \{\s*shadowRev\+\+;[\s\S]{0,120}dispatchEvent\(new Event\("scene3d:shadows"\)\)/);
  // the paced redraw putting a region back is no new change
  assert.match(view, /markShadowRegion\(shadowBox, true\);\s*shadowBox = null;/);
  assert.match(view, /export function requestShadowUpdate\(\) \{ bumpShadowRevision\(\);/);
  const insp = read("js/inspector_preview.js");
  // a change that lands after the last paint schedules one (trailing)
  assert.match(insp, /window\.addEventListener\("scene3d:shadows", function \(\) \{\s*if \(!visible \|\| !S\.invisibleRoof\) return;\s*clearTimeout\(shadowRepaintT\);\s*shadowRepaintT = setTimeout\(scheduleRender, 150\);/);
  assert.match(insp, /var rev = shadowRevision\(\);\s*if \(rev !== seenShadowRev\) \{\s*seenShadowRev = rev;\s*ownLights\.invalidate\(\);\s*\}\s*if \(ownLights\.swapIn\(scene, camera\)\)/);
});

test("the benchmark's extra renderer draws through stand-in lights and records only outer renders", () => {
  const src = read("tools/gpu_bench.mjs");
  assert.match(src, /createInspectorLights\(\)/);
  // out of the shared scene before the compile's await, after the prewarm stops
  assert.match(src, /v\.stopShadowSetPrewarm\(\);\s*swap\(\);[\s\S]{0,80}try \{ compiling = r\.compileAsync\(scene, cam\); \} finally \{ own\.swapOut\(false\); \}\s*await compiling;/);
  assert.match(src, /try \{ r\.render\(scene, cam\); \} finally \{ own\.swapOut\(true\); \}/);
  assert.match(src, /finally \{ own\.dispose\(\);/);
  assert.match(src, /if \(record && this\.domElement && B\.depth === 0\) B\.last\.set\(/);
});
