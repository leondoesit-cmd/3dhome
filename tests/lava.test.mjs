import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  JUMP_V, GRAV, jumpApex, nextLavaY, heatFactor, isBurned, scorchAmount,
  formatTime, formatDelta, ghostDelta, planSignature, ghostStoreKey,
  stairTreads, shelfLandings, expandParkourRects, mantleTarget,
  pickExtraction, placeGems, emergencyCrates, collectGem, reachedExtract,
  interpolateGhost, ghostSample, comboOnLand, highPlatformCount,
  DIFFICULTY, LAVA_START_Y, GEM_FREEZE, COMBO_FREEZE,
  firstStep, countdownFor, pickSpawn, SPD_SPRINT, MAX_COUNTDOWN,
  busGains, lavaDetail, canVault, reachableFromFloor, pathOpen, rectHitsSegs,
  COMBO_FREEZE_AT,
} from "../js/lava_state.js";

test("jump apex clears sofa height without becoming a rocket", () => {
  const apex = jumpApex(JUMP_V, GRAV);
  assert.ok(apex > 70 && apex < 110);
});

test("lava seeps during the siren then climbs unless frozen", () => {
  const spec = DIFFICULTY.standard;
  const seep = nextLavaY(LAVA_START_Y, 0.016, spec.countdown * 0.5, spec, 0);
  assert.ok(seep > LAVA_START_Y && seep < 0);
  const held = nextLavaY(40, 0.5, spec.countdown + 1, spec, 1);
  assert.equal(held, 40);
  const risen = nextLavaY(40, 1, spec.countdown + 1, spec, 0);
  assert.equal(risen, 40 + spec.rise);
});

test("heat and burn use clearance above the lava surface", () => {
  assert.equal(heatFactor(90, 90), 1);
  assert.ok(heatFactor(90, 0) < 0.1);
  assert.equal(isBurned(0, 8), true);
  assert.equal(isBurned(80, 8), false);
  assert.ok(scorchAmount(80, 70) > 0.5);
  assert.equal(scorchAmount(80, 0), 0);
});

test("clock formatting and ghost deltas are signed", () => {
  assert.equal(formatTime(91230), "1:31.23");
  assert.equal(formatTime(430), "0:00.43");
  assert.equal(ghostDelta(10000, 9000), 1000);
  assert.equal(formatDelta(1234).startsWith("+"), true);
  assert.equal(formatDelta(-500).startsWith("−") || formatDelta(-500).startsWith("-"), true);
});

test("ghost store keys belong to a plan signature and difficulty", () => {
  const sig = planSignature(
    [{ x: 0, z: 0 }, { x: 400, z: 0 }],
    [{ id: 1, a: 0, b: 1, height: 270 }],
    [{ type: "sofa", x: 100, z: 80, h: 80, rot: 0 }]
  );
  assert.equal(typeof sig, "string");
  assert.ok(sig.length >= 4);
  assert.equal(ghostStoreKey(sig, "inferno"), "home3d_lava_" + sig + "_inferno");
});

test("stairs expand into climbable treads and bookshelves into shelves", () => {
  const stairs = { type: "stairs", x: 0, z: 0, rot: 0, w: 100, d: 250, h: 260, elev: 0 };
  const treads = stairTreads(stairs, 10);
  assert.equal(treads.length, 10);
  assert.ok(treads[0].y1 < treads[9].y1);
  assert.equal(treads[9].y1, 260);
  const shelves = shelfLandings({ type: "bookshelf", x: 0, z: 0, rot: 0, w: 80, d: 30, h: 180 }, 4);
  assert.equal(shelves.length, 4);
  const expanded = expandParkourRects([
    { x0: -50, x1: 50, z0: -125, z1: 125, y0: 0, y1: 260, item: stairs },
  ]);
  assert.equal(expanded.length, 10);
  assert.equal(expanded[0].kind, "tread");
});

test("mantle prefers a facing ledge in the vault window", () => {
  const sofa = { x0: -40, x1: 40, z0: 30, z1: 90, y0: 0, y1: 80, item: { id: "s1" } };
  const hit = mantleTarget([sofa], 0, 0, 0, 0);
  assert.ok(hit);
  assert.equal(hit.y1, 80);
  const behind = mantleTarget([sofa], 0, 0, 0, Math.PI);
  assert.equal(behind, null);
});

test("extraction sits on the highest roomy platform and gems spread below it", () => {
  const platforms = [
    { x0: 0, x1: 80, z0: 0, z1: 80, y1: 50 },
    { x0: 100, x1: 180, z0: 0, z1: 90, y1: 90 },
    { x0: 200, x1: 280, z0: 0, z1: 80, y1: 180 },
  ];
  const extract = pickExtraction(platforms);
  assert.equal(extract.y, 180);
  const gems = placeGems(platforms, extract, 4);
  assert.ok(gems.length >= 1);
  gems.forEach((g) => assert.ok(g.y < extract.y));
  const got = collectGem(gems, gems[0].x, gems[0].y, gems[0].z);
  assert.equal(got, gems[0]);
  assert.equal(reachedExtract(extract, extract.x, extract.y, extract.z), true);
});

test("empty plans still get a crate spine toward extraction", () => {
  assert.equal(emergencyCrates({ minx: 0, minz: 0, maxx: 400, maxz: 400 }, 8, 6).length, 0);
  const crates = emergencyCrates({ minx: 0, minz: 0, maxx: 400, maxz: 400 }, 0, 6);
  assert.ok(crates.length >= 3);
  assert.ok(crates[crates.length - 1].y1 > crates[0].y1);
  assert.equal(highPlatformCount(crates), crates.length);
});

test("ghost samples interpolate heading across the ±π wrap", () => {
  const a = ghostSample(0, 0, 0, 0, 0, 3.0);
  const b = ghostSample(1000, 0, 100, 10, 0, -3.0);
  const pose = interpolateGhost([a, b], 0.5);
  assert.ok(pose);
  assert.ok(Math.abs(pose.x - 50) < 0.2);
  assert.ok(Math.abs(pose.yaw) > 2.5);
});

test("landing combo freezes lava after a two-piece chain", () => {
  const first = comboOnLand(null, "sofa", 0);
  assert.equal(first.combo, 0);
  const second = comboOnLand("sofa", "table", 0);
  assert.equal(second.combo, 1);
  assert.equal(second.freeze, 0);
  const third = comboOnLand("table", "shelf", 1);
  assert.equal(third.combo, COMBO_FREEZE_AT);
  assert.equal(third.freeze, COMBO_FREEZE);
  assert.ok(COMBO_FREEZE >= 0.8);
  assert.ok(GEM_FREEZE > 1);
});

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");
const game = await readFile(new URL("../js/lava_game.js", import.meta.url), "utf8");
const world = await readFile(new URL("../js/lava_world.js", import.meta.url), "utf8");
const ui = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");
const i18n = await readI18nSource();

test("the mode is wired like the other in-home games", () => {
  assert.match(html, /data-act="lava"/);
  assert.match(html, /id="lavaBtn"/);
  assert.match(html, /ph-flame/);
  assert.match(ui, /import\("\.\/lava\.js"\)/);
  assert.match(ui, /act === "lava"/);
  assert.match(i18n, /lv_ready_title: "The Floor is Lava"/);
  assert.match(i18n, /lv_ready_title: "הרצפה היא לבה"/);
});

test("parkour uses mantle, coyote time, and the shared physics clock", () => {
  assert.match(game, /function tryMantle\(/);
  assert.match(game, /P\.coyote = COYOTE/);
  assert.match(game, /safeDeltaSeconds[\s\S]*forEachPhysicsStep/);
  assert.match(game, /moveKinematicCapsule/);
  assert.match(world, /ShaderMaterial/);
  assert.match(world, /uTime/);
  assert.match(world, /emergencyCrates/);
  assert.match(css, /body\.lava-on #floor-tabs/);
  assert.match(css, /#lvHud/);
});

test("combo breaks when landing on the floor", () => {
  const c1 = comboOnLand(null, "sofa", 0);
  assert.equal(c1.combo, 0);
  const c2 = comboOnLand("sofa", "table", 0);
  assert.equal(c2.combo, 1);
  const cFloor = comboOnLand("table", "floor", 1);
  assert.equal(cFloor.combo, 0);
  assert.equal(cFloor.freeze, 0);
  const cAfterFloor = comboOnLand("floor", "shelf", 0);
  assert.equal(cAfterFloor.combo, 0);
});

test("camera uses lookAt forward alignment and stopRumble is exported", () => {
  assert.match(game, /cam\.lookAt\(/);
  assert.match(game, /cam\.up\.set\(0,\s*1,\s*0\)/);
  assert.match(world, /export function stopRumble\(/);
  assert.match(game, /stopRumble\(\)/);
});

test("touch controls use non-blocking container with pointer events on actions", () => {
  assert.match(css, /#lvTouch\s*\{\s*display:\s*none;\s*pointer-events:\s*none;/);
  assert.match(css, /\.lv-touch-stick\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(css, /\.lv-touch-actions\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(css, /#lvHud:has\(#lvTouch\.on\)\s*#lvHint\s*\{\s*display:\s*none/);
  assert.match(game, /L\.keys\.jumpHold = true/);
  assert.match(game, /t\("lv_go"\)/);
});

test("lava mesh centers on bounding box", () => {
  assert.match(world, /cx\s*=\s*\(bounds\.minx \+ bounds\.maxx\) \/ 2/);
  assert.match(world, /grp\.position\.set\(cx,\s*0,\s*cz\)/);
  assert.match(world, /if \(best\) \{\s*seg\(l,\s*r,\s*best\);/);
});

/* ---- QA pass: the run clock, the grade, and the course it is built from ---- */

test("the beacon is not live until the siren stops", () => {
  // spawning next to extraction used to end the run at 0:00.00 — a record no
  // one can beat, set before the clock started
  assert.match(game, /L\.t >= runSpec\(\)\.countdown && reachedExtract\(/);
  assert.match(game, /L\.bestMs = Math\.round\(ms\);/);
  // and no phantom lead over the record while the clock still reads zero
  assert.match(game, /L\.bestMs && rising \? formatDelta/);
});

test("the ghost is sampled on the run clock, not the wall clock", () => {
  assert.match(game, /if \(L\.ghostRec\.length && L\.runMs - L\.ghostLast < GHOST_SAMPLE_MS\) return;/);
  assert.match(game, /L\.ghostLast = L\.runMs;/);
  assert.match(game, /ghostSample\(L\.runMs, 0, P\.x, P\.y, P\.z, P\.yaw\)/);
  assert.doesNotMatch(game, /recordGhost\(performance\.now\(\)\)/);
  // playback reads the same clock the recording is stamped with
  assert.match(game, /interpolateGhost\(L\.ghostPlay\.s, L\.runMs \/ 1000\)/);
});

test("the molten grade dims the planner's daylight and survives a rebuild", () => {
  // fog and a dark background alone left a fully lit showroom with an orange
  // filter over it — the rig itself has to give way
  assert.match(world, /export function applyHeatGrade\(/);
  assert.match(world, /rig\.hemi\.groundColor\.setHex\(0xff5316\)/, "the melt lights from below");
  assert.match(world, /scene\.environment = null/);
  assert.match(world, /pr\.l\.intensity = pr\.i0 \* 0\.12/);
  // snapshot exactly once, re-apply as often as needed
  assert.match(world, /export function reheatAfterRebuild\(\) \{\s*if \(!L\.prevGfx\) return;/);
  assert.match(world, /export function exitHeat\(\)[\s\S]*?rig\.hemi\.groundColor\.setHex\(sv\.hemiGnd\)/);
  assert.match(game, /buildCol\(\);\s*relayoutAfterRebuild\(\);\s*reheatAfterRebuild\(\);/);
});

test("the glow stays above the slab while the lava is still under it", () => {
  assert.match(world, /var localY = Math\.max\(40, 48 - lavaY\);/);
  assert.match(world, /vis\.light\.position\.set\(px - grp\.position\.x, localY, pz - grp\.position\.z\)/);
});

test("the beacon fits under the ceiling it is standing in", () => {
  assert.match(world, /function ceilingClearance\(y\)/);
  assert.match(world, /grp\.scale\.setScalar\(clamp\(clearance \/ 126, 0\.34, 1\)\)/);
  assert.match(world, /extractBeacon\(ceilingClearance\(L\.extract\.y\)\)/);
});

test("pointer lock belongs to the run, not to the menus", () => {
  // preventDefault on every mousedown made the pause sliders undraggable
  assert.match(game, /if \(!L\.active \|\| !L\.started \|\| L\.paused\) return;/);
  assert.match(game, /closest\("#lvHud \.lv-card, #lvPauseBtn, #lvTouch"\)/);
  assert.match(game, /import \{ detectTouch \} from "\.\/chrome_posture\.js"/);
});

test("a run's own crate spine survives a scene rebuild", () => {
  assert.match(world, /export function relayoutAfterRebuild\(/);
  assert.match(world, /\(L\.crates \|\| \[\]\)\.forEach\(function \(c\) \{ L\.col\.rects\.push\(c\); \}\)/);
});

test("the mantle timer settles on zero and scorch respects stacking", () => {
  assert.match(game, /P\.mantle = 0;/);
  assert.match(world, /var y1 = \(it\.elev \|\| 0\) \+ \(it\.h \|\| 80\);/);
  assert.match(game, /L\.msgT -= dt \|\| 0\.016;/);
});

test("the control hint is readable and takes itself away", () => {
  assert.match(css, /#lvHint \{[\s\S]*?background: rgba\(18, 6, 3, 0\.62\)/);
  assert.match(css, /#lvHint\.fade \{ opacity: 0; \}/);
  assert.match(game, /h\.hint\.classList\.toggle\("fade", L\.t > spec\.countdown \+ 2\.2\)/);
});

/* ---- the siren has to fit the room it is sounding in ---- */

function step(x, z, y1, half) {
  half = half || 40;
  return { x0: x - half, x1: x + half, z0: z - half, z1: z + half, y0: 0, y1: y1 };
}

test("the siren stretches to cover the ground this spawn has to cross", () => {
  const spec = DIFFICULTY.standard;
  // a step under your feet: the difficulty's own floor is enough
  assert.equal(countdownFor(spec, 0, 1), spec.countdown);
  // an open-plan loft: 900cm at a sprint cannot be done in 4.6s, so it grows
  const far = countdownFor(spec, 900, 1);
  assert.ok(far > spec.countdown, "a distant first step buys more siren");
  assert.ok(far >= 900 / SPD_SPRINT, "at least the sprint itself: " + far);
  assert.ok(countdownFor(spec, 1800, 1) > far, "further still means longer");
  // Inferno is still Inferno — the floor is the difficulty, never below it
  assert.ok(countdownFor(DIFFICULTY.inferno, 0, 1) < countdownFor(DIFFICULTY.casual, 0, 1));
  assert.ok(countdownFor(spec, 1e6, 4) <= MAX_COUNTDOWN, "and it is bounded");
});

test("the first step is the near, roomy, climbable one", () => {
  const rects = [
    step(0, 0, 8),      // a rug: not off the floor
    step(600, 0, 60),   // right height, wrong postcode
    step(120, 0, 60),   // the answer
    step(90, 0, 260),   // a wardrobe you cannot vault from the floor
    { x0: 100, x1: 108, z0: 0, z1: 8, y0: 0, y1: 60 }, // too small to land on
  ];
  const found = firstStep(rects, 0, 0, 0);
  assert.ok(found, "something is climbable here");
  assert.equal(found.rc.x1, 160, "picked the near 60cm ledge");
  assert.ok(found.dist > 0 && found.dist < 120);
  assert.equal(firstStep([step(0, 0, 8)], 0, 0, 0), null, "a rug is not a step");
  assert.equal(firstStep([], 0, 0, 0), null);
});

test("the drill starts beside a step, and away from the goal", () => {
  const near = step(0, 0, 60);
  const far = step(800, 0, 60);
  const extract = { x: -400, y: 200, z: 0 };
  const spawn = pickSpawn([near, far], null, extract);
  assert.ok(spawn, "a spawn was chosen");
  assert.ok(spawn.step === far, "start at the step furthest from extraction");
  assert.ok(spawn.x > 800, "stand off it on the far side, not on top of it");
  // and whatever is chosen, the step is genuinely within reach of the siren
  const reach = firstStep([near, far], spawn.x, spawn.z, 0);
  assert.ok(reach && reach.dist < 120, "the first move is a stride, not a trek");
  assert.equal(pickSpawn([step(0, 0, 8)], null, extract), null, "no steps, no opinion");
});

test("a spawn stays inside the walls", () => {
  const bounds = { minx: -200, maxx: 200, minz: -200, maxz: 200 };
  const spawn = pickSpawn([step(150, 150, 60)], bounds, { x: -150, y: 200, z: -150 });
  assert.ok(spawn.x <= bounds.maxx - 40 && spawn.x >= bounds.minx + 40);
  assert.ok(spawn.z <= bounds.maxz - 40 && spawn.z >= bounds.minz + 40);
});

test("the run reads one clock, sized once, and points at the way out", () => {
  assert.match(game, /L\.spec = Object\.assign\(\{\}, spec, \{\s*countdown: countdownFor\(spec, step \? step\.dist : 0, 1\),/);
  assert.match(game, /function runSpec\(\) \{\s*return L\.spec \|\| specFor/);
  assert.match(game, /var spec = runSpec\(\);/);
  assert.match(world, /export function stepGuide\(step, show, time\)/);
  assert.match(game, /stepGuide\(P \? firstStep\(L\.platforms, P\.x, P\.z, P\.y, wallSegs\(\)\) : null, L\.t < spec\.countdown/);
  assert.match(world, /var start = pickSpawn\(L\.platforms, bounds, L\.extract\);/);
});

test("the siren bar drains, and a dead run restarts on one key", () => {
  assert.match(game, /: 1 - clamp\(L\.t \/ Math\.max\(0\.1, spec\.countdown\), 0, 1\)/);
  assert.match(game, /h\.rise\.classList\.toggle\("counting", !rising\)/);
  assert.match(css, /#lvRise\.counting #lvRiseFill/);
  assert.match(game, /\(e\.code === "KeyR" \|\| e\.code === "Space"\)\)\s*\{\s*restart\(\);/);
  assert.match(i18n, /lv_retry_key/);
});

test("volume is applied once, on the master bus", () => {
  const g = busGains(0.2, 0.5);
  assert.equal(g.voice, 0.2);
  assert.equal(g.master, 0.5);
  assert.doesNotMatch(world, /peak \* vol\(\)/);
  assert.match(world, /busGains\(peak, 1\)\.voice/);
  assert.match(world, /master\.gain\.value = busGains\(1, vol\(\)\)\.master/);
});

test("quality detail drops tessellation and gem lights on Fast", () => {
  assert.equal(lavaDetail(0).seg, 12);
  assert.equal(lavaDetail(0).gemLight, false);
  assert.ok(lavaDetail(2).seg > lavaDetail(1).seg);
  assert.equal(DIFFICULTY.casual.gems, 8);
  assert.equal(DIFFICULTY.standard.gems, 6);
  assert.equal(DIFFICULTY.inferno.gems, 4);
  assert.match(world, /placeGems\(rects, L\.extract, gemN/);
  assert.match(game, /lvQualitySlider/);
});

test("extraction prefers a climbable platform over an isolated roof", () => {
  const sofa = { x0: 0, x1: 80, z0: 0, z1: 80, y0: 0, y1: 80 };
  const roof = { x0: 4000, x1: 4120, z0: 4000, z1: 4120, y0: 0, y1: 400 };
  const extract = pickExtraction([sofa, roof]);
  assert.equal(extract.y, 80);
  const seen = reachableFromFloor([sofa, roof]);
  assert.equal(seen[0], 1);
  assert.ok(!seen[1]);
});

test("a wall between platforms blocks a vault", () => {
  const a = { x0: 0, x1: 40, z0: 0, z1: 40, y1: 50 };
  const b = { x0: 80, x1: 120, z0: 0, z1: 40, y1: 90 };
  assert.equal(canVault(a, b), true);
  const wall = [{ ax: 60, az: -40, bx: 60, bz: 40 }];
  assert.equal(pathOpen(20, 20, 100, 20, wall), false);
  assert.equal(canVault(a, b, wall), false);
});

test("the first step prefers a ledge in this room over one through a wall", () => {
  const blocked = step(120, 0, 60);
  const open = step(0, 160, 60);
  const wall = [{ ax: 50, az: -80, bx: 50, bz: 80 }];
  const found = firstStep([blocked, open], 0, 0, 0, wall);
  assert.ok(found);
  assert.equal(found.rc, open);
});

test("emergency crates nudge off a bisecting wall", () => {
  const bounds = { minx: 0, minz: 0, maxx: 400, maxz: 400 };
  const wall = [{ ax: 200, az: 0, bx: 200, bz: 400 }];
  const crates = emergencyCrates(bounds, 0, 6, wall);
  assert.ok(crates.length >= 3);
  crates.forEach((c) => {
    assert.equal(rectHitsSegs(c.x0, c.z0, c.x1, c.z1, wall), false);
  });
});

test("rotated stair treads collapse to a center box", () => {
  const stairs = { type: "stairs", x: 0, z: 0, rot: 45, w: 100, d: 250, h: 260, elev: 0 };
  const treads = stairTreads(stairs, 10);
  assert.equal(treads.length, 10);
  treads.forEach((t) => {
    assert.ok(t.x1 - t.x0 < 40, "rotated tread AABB should not be a diamond");
    assert.ok(t.z1 - t.z0 < 40);
  });
});

test("gems skip slots that fail the free check", () => {
  const platforms = [
    { x0: 0, x1: 80, z0: 0, z1: 80, y1: 50 },
    { x0: 100, x1: 180, z0: 0, z1: 90, y1: 90 },
    { x0: 200, x1: 280, z0: 0, z1: 80, y1: 140 },
  ];
  const extract = pickExtraction(platforms);
  const none = placeGems(platforms, extract, 4, { isFree: () => false });
  assert.equal(none.length, 0);
  const some = placeGems(platforms, extract, 4);
  assert.ok(some.length >= 1);
});

test("the HUD shows freeze, compass, mantle, haze, and a death hold", () => {
  assert.match(game, /id="lvFreezeFill"/);
  assert.match(game, /id="lvCompass"/);
  assert.match(game, /id="lvMantle"/);
  assert.match(game, /id="lvHaze"/);
  assert.match(game, /function previewCourse\(/);
  assert.match(game, /function showEndCard\(/);
  assert.match(game, /L\.endDelay = DEATH_HOLD/);
  assert.match(game, /L\.ghostFade/);
  assert.match(game, /function syncResponsiveHud\(/);
  assert.match(css, /#lvFreezeFill/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /#lvHud\.lv-narrow/);
  assert.match(css, /#lvHaze/);
  assert.match(css, /data-act="crouch"/);
  assert.match(i18n, /lv_all_gems: "All gems"/);
  assert.match(i18n, /lv_all_gems: "כל האבנים"/);
  assert.match(i18n, /lv_mantle_prompt/);
  assert.match(i18n, /lv_frozen/);
  assert.match(world, /uFrozen/);
  assert.match(world, /function pruneAudioNodes\(/);
  assert.match(world, /export function rebuildLavaMesh\(/);
});
