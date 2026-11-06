// The planner's light rig (js/view3d.js): physical light paths (a hidden
// ceiling is still a ceiling, nothing shines through a blind wall), penumbra
// settings that take effect, a shadow budget inside WebGPU's per-stage texture
// limit, and shadow redraws scoped to what moved. These are source checks —
// the rig only exists on a GPU.
import test from "node:test";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = moduleSource("js/view3d.js");
// whole top-level functions by name: a split of view3d.js can put neighbours in other files
const fn = (...names) => names.map((name) => sourceFunctionText(src, name)).join("\n");
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
  // wiring only — which surface each mask lets light reach is in room_bounce.test.mjs
  // no fill light: a shadowless directional shone through every wall and ceiling
  assert.doesNotMatch(src, /new THREE\.DirectionalLight\(0xeaf0ff/);
  assert.doesNotMatch(src, /SKY_CASTER_LAYER/);
  const fit = fn("fitPracticalLights");
  assert.match(fit, /!room && gap < o\.distance/, "a lamp outside every room that reaches the house is found");
  assert.match(fit, /rank: 0/, "and it is first in line for a shadow");
  assert.match(fit, /fitLightMasks\(\);/, "whatever is left without a shadow is masked to its room");
  const masks = fn("fitLightMasks");
  assert.match(masks, /lightMaskRoom\(rooms, l\.position\.x, l\.position\.z, l\.castShadow\)/, "window daylight");
  assert.match(masks, /lightMaskRoom\(rooms, it\.x, it\.z, o\.castShadow\)/, "lamps");
  assert.match(masks, /hemi\.userData\.maskRoom = SKY_ONLY;/, "the sky light stops at the ceilings");
  assert.match(masks, /sun\.castShadow && renderer && renderer\.shadowMap\.enabled \? UNMASKED : SKY_ONLY/,
    "and so does a sun with no shadow map");
  assert.match(fn("buildBounceLights"), /fitLightMasks\(\);/,
    "renumbered rooms re-mask the lights");
  const ops = fn("applyItemOps").split("// Zero opacity keeps")[0];
  assert.match(ops, /if \(lampMoved\) fitPracticalLights\(\);/, "a dragged lamp takes its mask and shadow along");
});

test("the shaders read the room map the masks are written in", async () => {
  // GPU-only: Node cannot build the node materials
  const rb = (await readFile(join(root, "js/room_bounce.js"), "utf8")).replace(/\r\n/g, "\n");
  assert.match(rb, /TSL\.texture\(map, p\.sub\(origin\)\.div\(span\)\)\.level\(0\)/,
    "mip 0 always: the environment pass samples at its roughness level, and the map has no other mips");
  assert.match(rb, /map\.magFilter = map\.minFilter = THREE\.NearestFilter;/, "room numbers are never blended");
  assert.match(rb, /nodes\.set\(THREE\.PointLight, maskedLightNode\(THREE\.PointLightNode\)\);/);
  assert.match(rb, /nodes\.set\(THREE\.SpotLight, maskedLightNode\(THREE\.SpotLightNode\)\);/);
  assert.match(rb, /nodes\.set\(THREE\.DirectionalLight, maskedLightNode\(THREE\.DirectionalLightNode\)\);/);
  assert.match(rb, /nodes\.set\(THREE\.HemisphereLight, SkyHemisphereLightNode\);/);
  assert.match(rb, /node = pmrem\.mul\(skyOpen\(\)\);/, "the environment map stops at the ceilings");
});

test("every casting light shares one budget under the 16-texture stage limit", () => {
  assert.match(src, /var MAX_SHADOW_MAPS = [1-8];/);
  const fit = fn("fitPracticalLights");
  assert.match(fit, /MAX_SHADOW_MAPS - \(sun && sun\.castShadow \? 1 : 0\)/, "the sun takes a slot by day");
  assert.match(fit, /if \(!night && \(over \? over\.day : \(S\.dayK \|\| 0\) > 0\.02\)\)/, "windows hand over to the practicals at dusk");
  assert.match(fit, /!gameRendererLock/, "games never pay for the planner's shadows");
  assert.match(fn("applyEnv"), /sun\.castShadow = on;/,
    "a sun below the horizon casts nothing");
});

test("a drag redraws only the shadows that reach it, at a capped rate", () => {
  const ops = fn("applyItemOps").split("// Zero opacity keeps")[0];
  assert.match(ops, /markShadowRegion\(region\);/);
  assert.doesNotMatch(ops, /shadowsDirty = true/, "a drag must not invalidate every map in the house");
  assert.match(fn("lightReaches"), /box\.distanceToPoint\(_lightPos\) < o\.distance/);
  assert.match(src, /time - regionShadowT < 100/, "region redraws follow a drag at ~10 Hz");
});

test("orbit frames skip per-object uniform refreshes", () => {
  // a velocity target in the scene MRT makes three refresh every object's
  // uniforms on every frame; TRAA reprojects from depth + camera instead
  assert.match(src, /scenePass\.setMRT\(TSL\.mrt\(\{ output: TSL\.output \}\)\);/);
  assert.doesNotMatch(src, /velocity: TSL\.velocity/);
  assert.match(src, /traaPass = ADDONS\.traa\(lit, depthNode, velocityNode, camera\);/);
  const loop = between("var live = doorsMoving", "updateViewGizmo();");
  assert.match(loop, /syncCameraVelocity\(\);/, "the camera history advances once per painted frame");
});

test("a sun patch is brighter than the sky light beside the window", () => {
  const env = fn("applyEnv");
  const win = /o\.userData\.baseI \* ([\d.]+) \* dk/.exec(env);
  assert.ok(win && Number(win[1]) <= 0.8, "window sky light no longer drowns the sun patch");
});

test("a rebuild keeps the shaders it already has", () => {
  const memo = fn("surfaceMaterial");
  assert.match(memo, /var hit = surfaceMemo\.get\(key\);/, "one material per distinct surface, across rebuilds");
  assert.match(memo, /mat\.dispose = keepShared;/, "every disposal path passes a shared surface by");
  assert.doesNotMatch(src.replace(memo, ""), /[^.\w]pbrSurfaceMaterial\((?!entry)/, "planner surfaces all go through the memo");
  assert.match(src, /if \(isSharedSurface\(mat\)\) mat = mat\.clone\(\);/, "x-ray never changes a shared surface");
  assert.match(fn("rebuild3D"), /retireGroup\(dyn\);/,
    "the old scene is disposed after the new one has painted");
  assert.match(src, /if \(retired\.length\) disposeRetired\(\);/);
  assert.match(src, /scene && camera && !firstCompiled\) \{/, "only the first build holds a frame");
  assert.doesNotMatch(src, /renderer\.compile\(scene, camera\)/, "never the synchronous whole-scene compile");
});

test("opening the 3D view shows why it is busy, and waits on nothing else", async () => {
  // the tier probe would create a throwaway WebGL context (~0.7 s blocked)
  assert.match(fn("init3D"), /Promise\.all\(\[loadThree\(\), primeGpuTier\(\)\]\)/);
  // compileAsync builds against a render context the post-processed frame
  // never uses: waiting for it held the view blank for its 6 s timeout and
  // saved ~0.6 s of the first draw. The first draw now runs with
  // "Preparing the 3D view…" painted, one frame after it goes up.
  const first = between("scene && camera && !firstCompiled) {", "lastRebuildT = nowT;");
  assert.doesNotMatch(first, /compileAsync\(/);
  assert.match(first, /if \(prep\) prep\.style\.display = "block";/);
  assert.match(first, /requestAnimationFrame\(open\);/);
  assert.match(src, /if \(compileGate\) return;/);
  assert.match(between("renderScene();\n        if (prepUntilDrawn)", "disposeRetired();"), /prepEl\.style\.display = "none";/,
    "it comes down after the first draw, not before");
  // library bitmaps are decoded off the main thread, not by the upload
  const pbr = (await readFile(join(root, "js/pbr_material.js"), "utf8")).replace(/\r\n/g, "\n");
  const load = pbr.slice(pbr.indexOf("function loadTexture("), pbr.indexOf("/** Shared textures for an entry"));
  assert.match(load, /createImageBitmap\(blob, \{ imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" \}\)/);
  assert.match(load, /tx\.flipY = false;/, "WebGL2 ignores UNPACK_FLIP_Y for bitmaps");
});

test("a texture landing rebuilds only the pieces built without it", () => {
  const evAt = src.indexOf('window.addEventListener("customTextureLoaded"');
  const ev = src.slice(evAt, src.indexOf("\n});", evAt) + 4);
  assert.doesNotMatch(ev, /catalogRev\+\+/, "a finish first wanted by the walls must not rebuild every piece");
  assert.match(ev, /if \(c\.missedTexture\) c\.sig = null;/);
  assert.match(fn("buildAndCache"), /missedTexture: textureMisses\(\) !== missed/);
});

test("each lit room fills itself with the light that enters it", () => {
  // wiring only — the arithmetic and the no-leak rule are in room_bounce.test.mjs
  const fit = fn("fitBounceLights");
  assert.match(fit, /windowLights\.forEach/, "daylight entering through the room's windows");
  assert.match(fit, /FURN\[it\.type\]\.lamp/, "and its lamps at night");
  assert.match(fit, /roomBounce\.setIrradiance\(roomIrradiance\(/);
  assert.match(between("function build3D()", "ready3D = true;"),
    /roomBounce\.register\(renderer\);\n  roomBounce\.confineSky\(scene\);\n  scene\.add\(roomBounce\.light\);/,
    "one light, registered with the renderer, for the life of the view");
  assert.doesNotMatch(fn("buildBounceLights", "fitLightMasks", "lightFlux", "fitBounceLights"), /\.visible =|takeLight\(/,
    "never toggled or swapped: the light set every shader is keyed on stays put");
  assert.match(fn("applyEnv"), /fitBounceLights\(\);/);
});

test("ambient occlusion reads normals from depth, not a normal target", () => {
  assert.match(src, /aoPass = ADDONS\.ao\(depthNode, null, camera\);/);
  assert.match(src, /scenePass\.setMRT\(TSL\.mrt\(\{ output: TSL\.output \}\)\);/);
});

test("a light that stops casting keeps its shadow node", async () => {
  const gpu = (await readFile(join(root, "js/gpu.js"), "utf8")).replace(/\r\n/g, "\n");
  assert.match(gpu, /function keepShadowNodes\(\)/);
  assert.match(gpu, /this\.shadowNode = null;.*\n\s*try \{ return setup\.call\(this, builder\); \} finally \{ this\.shadowNode = keep; \}/);
  assert.match(gpu, /export function createRenderer\(opts\) \{\n  keepShadowNodes\(\);/);
});

test("the inspector preview draws the planner scene with the planner's light masks", async () => {
  const preview = (await readFile(join(root, "js/inspector_preview.js"), "utf8")).replace(/\r\n/g, "\n");
  assert.match(preview, /if \(!plannerLights\) plannerLights = registerPlannerLights\(renderer\);/);
  assert.match(fn("registerPlannerLights"), /roomBounce\.register\(r\);/);
  // each light keeps the mask it would have without a shadow map (effectiveMaskRoom)
  const fit = fn("fitLightMasks");
  assert.match(fit, /l\.userData\.maskRoomUnshadowed = lightMaskRoom\(rooms, l\.position\.x, l\.position\.z, false\);/);
  assert.match(fit, /o\.userData\.maskRoomUnshadowed = lightMaskRoom\(rooms, it\.x, it\.z, false\);/);
  assert.match(fit, /sun\.userData\.maskRoomUnshadowed = SKY_ONLY;/);
});

test("the other shadow sets are built ahead, in the scene pass's own context", () => {
  const block = fn("startPrewarm");
  // every set the hour is not using, a mesh at a time, a frame between builds
  assert.match(block, /SHADOW_SETS\.filter\(function \(s\) \{ return s\.night !== night \|\| s\.sun !== sun\.castShadow; \}\)/);
  assert.match(block, /await compileForScenePass\(meshes\[i\], depth\);\s*await new Promise\(function \(r\) \{ requestAnimationFrame\(r\); \}\);/);
  // the scene pass's target and MRT stay set until the build is done, and its call depth keys the context
  const compile = fn("compileForScenePass");
  assert.match(compile, /renderer\.setRenderTarget\(prewarmPass\.renderTarget\);\s*renderer\.setMRT\(prewarmPass\._mrt\);/);
  assert.match(compile, /d === undefined \? depth : d/);
  assert.match(compile, /return Promise\.resolve\(p\)\.then\(done, done\);/);
  // a set switch with no draw since must not reuse the old lights key
  assert.match(fn("applyShadowSet"), /forgetLightKeys\(renderer\);/);
  // nothing is drawn, rebuilt or relit while a shader is being built from the lights
  const loop = between("var live = doorsMoving || humansLive || physicsLive || extLive;", "if (needsRender || live || settle > 0) {");
  assert.match(loop, /if \(prewarmHolds\(\)\) return;/);
  assert.match(src, /if \(prewarmRun && \(S\.dirty3D \|\| S\.items3D\.size\)\) \{\s*prewarmRun\.stop = true;\s*if \(!finishPrewarm\(\)\) return;/);
  assert.match(fn("applyEnv").split("shadowsDirty = true;")[0], /prewarmRun\.envPending = true;\s*return;/);
  assert.match(fn("finishPrewarm"), /if \(run\.envPending\) applyEnv\(\);/);
});
