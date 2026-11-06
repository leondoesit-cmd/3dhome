import { moduleSource } from "./helpers/module_source.mjs";
import { stylesSource } from "./helpers/styles_source.mjs";
import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL("../" + name, import.meta.url), "utf8");
// RC is split across rc.js (facade) + rc_state/world/game — source-scan tests
// need the whole implementation, not just the re-export entry.
const readRC = async () =>
  (
    await Promise.all([
      read("js/rc.js"),
      read("js/rc_state.js"),
      read("js/rc_world.js"),
      read("js/rc_game.js"),
    ])
  ).join("\n");
// drive.js and rc_editor.js are split the same way — scan the whole module set.
const readDrive = async () =>
  (
    await Promise.all(
      [
        "drive", "drive_modes", "drive_state", "drive_mp", "drive_world",
        "drive_camera", "drive_peds", "drive_traffic", "drive_sky", "drive_ai",
      ].map((n) =>
        read("js/" + n + ".js"),
      ),
    )
  ).join("\n");
const readEditor = async () =>
  (
    await Promise.all(
      ["", "_state", "_geom", "_actions", "_map", "_faces"].map((n) =>
        read("js/rc_editor" + n + ".js"),
      ),
    )
  ).join("\n");
// The editor's pure geometry lives in rc_editor_geom.js; its only dependency is
// the state module, whose only dependency is i18n — stub that and the real
// helpers (with their real constants) run in Node.
const importEditorGeom = async () => {
  const [state, geom] = await Promise.all([
    read("js/rc_editor_state.js"),
    read("js/rc_editor_geom.js"),
  ]);
  const stateUrl =
    "data:text/javascript," +
    encodeURIComponent(
      state
        .replace('import { getLang } from "./i18n.js";', "var getLang = () => 'en';")
        .replace(
          'import { STEP_UP as SHARED_STEP_UP } from "./road_surface.js";',
          "var SHARED_STEP_UP = 2.2;",
        ),
    );
  return import(
    "data:text/javascript," +
    encodeURIComponent(geom.replace('from "./rc_editor_state.js"', `from "${stateUrl}"`))
  );
};

test("map racing and miniature RC use independent UI copy", async () => {
  const [race, drive, i18n] = await Promise.all([
    read("js/race.js"), readDrive(), readI18nSource(),
  ]);
  assert.match(race, /t\("mr_title"\)/);
  assert.match(drive, /t\("mr_leaderboard"\)/);
  assert.match(i18n, /mr_title: "Map Racing & Missions"/);
  assert.match(i18n, /rc_title: "RC Truck Race"/);
});

test("online map races share one scheduled start", async () => {
  const [race, drive] = await Promise.all([read("js/race.js"), readDrive()]);
  assert.match(race, /race_go[\s\S]*startAt/);
  assert.match(race, /Date\.now\(\) \+ 5000/);
  assert.match(drive, /mp && mp\.startAt \? mp\.startAt - Date\.now\(\)/);
});

test("map race builder previews and races the same snapped road course", async () => {
  const [race, world, drive, route] = await Promise.all([
    read("js/race.js"), read("js/drive_world.js"), read("js/drive.js"), read("js/road_route.js"),
  ]);
  assert.match(race, /fetchRoadRoute\(picked/);
  assert.match(race, /routed\.points\.map/);
  assert.match(race, /picked\[i\]\.marker\.setLatLng/);
  assert.match(race, /initial \|\| \[\]/);
  assert.match(race, /points\.splice\(0, points\.length, \.\.\.pts\)/);
  assert.match(route, /payload\.waypoints/);
  assert.match(world, /export async function fetchRouteData/);
  assert.match(drive, /route\.waypoints\.slice\(1\)/);
  assert.match(drive, /cp\.mesh\.position\.x = wp\.x/);
});

test("crazy taxi pays for the driving, not just the delivery", async () => {
  const [drive, i18n] = await Promise.all([readDrive(), readI18nSource()]);
  // fare variety with its own pace + payout, and a delivery that buys time back
  assert.match(drive, /export const FARE_KINDS/);
  assert.match(drive, /D\.ses\.endAt \+= bonusS \* 1000/);
  // combo ladder, capped, reset when a passenger bails
  assert.match(drive, /export function comboMult/);
  assert.match(drive, /Math\.min\(3, 1 \+ 0\.25/);
  assert.match(drive, /D\.ses\.combo = 0;[\s\S]*tx_missed/);
  // stunt cash off near misses and held drifts
  assert.match(drive, /export function taxiStunts/);
  assert.match(drive, /nearMissAt/);
  assert.match(drive, /tx_drift/);
  // fares are snapped onto the routable street, not left in a back garden
  assert.match(drive, /const snapped = r\.waypoints && r\.waypoints\[1\]/);
  // a session ends with a rating and a saved personal best for the area
  assert.match(drive, /export function taxiGrade/);
  assert.match(drive, /home3d_taxi_best_/);
  assert.match(i18n, /tx_grade: "Rating"/);
  assert.match(i18n, /tx_grade: "דירוג"/);
});

test("taxi results rank every online player by cash", async () => {
  const drive = await readDrive();
  assert.match(drive, /export function renderTaxiResults/);
  assert.match(drive, /D\.ses\.board\[b\]\.cash \|\| 0\) - \(D\.ses\.board\[a\]\.cash/);
  // an untrusted peer name never reaches the card as markup
  assert.match(drive, /escapeHTML\(D\.ses\.board\[c\]\.name\)/);
  // a peer finishing after you refreshes the card without losing your numbers
  assert.match(drive, /if \(best == null\) best = D\.ses\.bestCash/);
});

test("driving to a friend navigates: routed ETA, snapped door, re-routing", async () => {
  const [drive, i18n] = await Promise.all([readDrive(), readI18nSource()]);
  assert.match(drive, /export function routeProgress/);
  assert.match(drive, /t\("dr_eta", \{ min: mins \}\)/);
  // the beacon moves to the kerb OSRM snapped to, so "arrived" fires on a road
  assert.match(drive, /D\.ses\.dest = \{ x: drop\.x, z: drop\.z \}/);
  // strayed off the guide → one fresh route, rate limited
  assert.match(drive, /p\.off > 70/);
  assert.match(drive, /dr_reroute/);
  assert.match(drive, /now - \(D\.ses\.rerouteAt \|\| 0\) > 12000/);
  assert.match(i18n, /dr_reroute: "Off route/);
});

test("online drives share one coordinate frame and clean up peers", async () => {
  const drive = await readDrive();
  // poses travel as lat/lon: a free cruise anchors each client at its own home
  assert.match(drive, /la: Math\.round\(ll\.lat \* 1e6\)/);
  assert.match(drive, /data\.la != null \? llToM\(data\.la, data\.lo\)/);
  assert.match(drive, /def: \{ id: "cruise" \}/);
  // a peer who quits stops being a car parked in the road forever
  assert.match(drive, /GHOST_TIMEOUT/);
  assert.match(drive, /export function dropGhost/);
  assert.match(drive, /net\.on\("peer-leave"/);
});

test("multiplayer standings ride the pose packet already being sent", async () => {
  const [drive, css] = await Promise.all([readDrive(), stylesSource()]);
  assert.match(drive, /export function boardTick/);
  // progress fields on the same 11 Hz car packet — no extra traffic
  assert.match(drive, /p: D\.ses\.cpIndex \|\| 0/);
  assert.match(drive, /\$: D\.ses\.cash \|\| 0/);
  // peer names are relay input: rows are built as text nodes, never innerHTML
  assert.match(drive, /nm\.textContent = r\.name/);
  assert.doesNotMatch(drive, /driveBoard[\s\S]{0,400}innerHTML/);
  assert.match(css, /#driveBoard/);
  assert.match(css, /\.dr-bd-row\.me/);
});

test("the drive camera has four rigs and a director that cuts between shots", async () => {
  const [drive, css, i18n] = await Promise.all([
    readDrive(), stylesSource(), readI18nSource(),
  ]);
  assert.match(drive, /export const CAM_MODES = \["chase", "hood", "bumper", "cinema"\]/);
  assert.match(drive, /e\.code === "KeyC"/);
  // the director owns a shot list and re-frames when a shot goes stale
  assert.match(drive, /const SHOTS = \["orbit", "crane", "dolly", "flyby", "hero"\]/);
  assert.match(drive, /function shotStale/);
  // a cut snaps the camera instead of gliding across town
  assert.match(drive, /D\.camPos = null; \/\/ a cut is a cut/);
  // never set up a shot inside a wall
  assert.match(drive, /if \(!insideBuilding\(spot\.x, spot\.z\)\) break/);
  // scripted beats: the countdown and the results card
  assert.match(drive, /cinemaFor\(Math\.max\(0, D\.ses\.countdownEnd - performance\.now\(\)\) \+ 400, "crane"\)/);
  assert.match(drive, /cinemaFor\(90000, "orbit"\)/);
  // letterbox + grade, and the dashboard steps out of the shot
  assert.match(css, /#drive-overlay\.dr-cine #driveGrade::before/);
  assert.match(css, /#drive-overlay\.dr-cine #driveHud/);
  assert.match(i18n, /dr_cam_cinema: "🎬 Cinematic camera"/);
  assert.match(i18n, /dr_cam_cinema: "🎬 מצלמה קולנועית"/);
});

test("pedestrians walk the pavement, dodge cars, and get back up", async () => {
  const [peds, drive] = await Promise.all([read("js/drive_peds.js"), readDrive()]);
  // crowd size follows street LENGTH — an OSM straight is two points
  assert.match(peds, /lineLength\(rpts\) \/ 110/);
  assert.match(peds, /function walkable/);
  // a car bearing down makes them run for the far kerb, not down the road
  assert.match(peds, /function startle/);
  assert.match(peds, /closing > 3/);
  // knocked down, then up again — there is no other outcome modelled
  assert.match(peds, /p\.state = "down"/);
  assert.match(peds, /p\.state = "walk";\n        p\.g\.rotation\.x = 0/);
  // live coords, not the parked vehicle's stale x/z
  assert.match(peds, /car\.vx, car\.vz/);
  // they are deliberately not shootable
  assert.doesNotMatch(peds, /weaponTargets|kind: "ped"/);
  // and they tick from the frame loop
  assert.match(drive, /pedsTick\(dt, tNow\)/);
});

test("street dressing is a live budget, not a first-chunk lottery", async () => {
  const drive = await readDrive();
  assert.match(drive, /export function dressWay/);
  assert.match(drive, /hooks\.dressWay\(rpts, wid, w\.id\)/);
  // lamps and trees are recycled once they fall behind
  assert.match(drive, /function pruneProps/);
  assert.match(drive, /PROP_KEEP/);
  // five pooled lights hop to the nearest lamps instead of one light per lamp
  assert.match(drive, /const LAMP_LIGHTS = 5/);
  assert.match(drive, /5\.5 \* CD_M/); // metre-scale candela, not the cm constant
  assert.match(drive, /export function syncLamps/);
});

test("a time-of-day switch never destroys an environment still in flight", async () => {
  const sky = await read("js/drive_sky.js");
  // disposing the outgoing PMREM target in the same tick froze WebGPU solid
  assert.match(sky, /envRetire\.push\(\{ rt: D\.envRT, at: performance\.now\(\), frame/);
  assert.match(sky, /export function envRetireTick/);
  assert.match(sky, /envRetireTick\(performance\.now\(\)\)/);
  assert.doesNotMatch(sky, /if \(D\.envRT\) D\.envRT\.dispose\(\);/);
});

test("traffic drives the streamed network instead of parking on it", async () => {
  const [drive, ai] = await Promise.all([readDrive(), read("js/drive_ai.js")]);
  // a lane on the right of the centreline, and a way handed on at its end
  assert.match(ai, /function lanePoint/);
  assert.match(ai, /function nextLeg/);
  assert.match(ai, /JOIN_R/);
  // a PARKED car at the kerb must not stop the whole street
  assert.match(ai, /side < \(o\.ai \? 2\.4 : 1\.5\)/);
  // brake for the player and for people in the road
  assert.match(ai, /if \(!player\.onFoot\)[\s\S]{0,200}return ahead/);
  assert.match(ai, /for \(const p of D\.peds\)/);
  // dense OSM vertices are consumed in one tick, and deadlocks time out
  assert.match(ai, /for \(let guard = 0; guard < 8 && d < 4\.5/);
  assert.match(ai, /a\.stuck > 5/);
  // parked cars and traffic hold separate budgets, and AI runs its lights
  assert.match(drive, /if \(!v\.ai\) parked\+\+/);
  assert.match(drive, /\|\| !!v\.ai\) && !v\.wrecked/);
  assert.match(drive, /trafficTick\(dt, tNow\)/);
  // walkers now fear any moving car, not just the player's
  assert.match(drive, /function threats\(\)/);
  assert.match(drive, /if \(!v\.ai \|\| v\.wrecked \|\| v\.ai\.speed < 3\) continue/);
});

test("drive mode is playable without a keyboard", async () => {
  const [drive, css, i18n] = await Promise.all([
    readDrive(), stylesSource(), readI18nSource(),
  ]);
  // analog axes sit alongside the boolean keys, never replacing them
  assert.match(drive, /axis: \{ steer: 0, throttle: 0, brake: 0 \}/);
  assert.match(drive, /const gas = Math\.max\(D\.keys\.up \? 1 : 0, D\.axis\.throttle\)/);
  // gamepad: sticks, triggers, edge-triggered face buttons
  assert.match(drive, /navigator\.getGamepads/);
  assert.match(drive, /const PAD_BTN = /);
  assert.match(drive, /D\.padWas/);
  // on-screen pad, mounted only where the pointer is coarse
  assert.match(drive, /export function touchWanted/);
  assert.match(drive, /pointer: coarse/);
  assert.match(drive, /id = "driveTouch"/);
  assert.match(css, /#driveTouch button/);
  // the dashboard moves clear of the pad and the keyboard hint goes away
  assert.match(css, /#drive-overlay\.has-touch #driveHint \{ display: none; \}/);
  assert.match(i18n, /dr_t_gas: "Accelerate"/);
  assert.match(i18n, /dr_t_gas: "האצה"/);
});

test("a failed chunk is retried, cached and prefetched", async () => {
  const [world, state] = await Promise.all([
    read("js/drive_world.js"), read("js/drive_state.js"),
  ]);
  // the bug: a rate-limited reply is valid JSON with no elements
  assert.match(state, /export const bldChunks = new Map\(\)/);
  assert.match(world, /if \(!j \|\| !Array\.isArray\(j\.elements\)\) return fail\(\)/);
  assert.match(world, /state: "failed"/);
  assert.match(world, /CHUNK_BACKOFF_MAX/);
  // cached in IndexedDB, so a second drive costs no network at all
  assert.match(world, /createObjectStore\("chunk"\)/);
  assert.match(world, /export function chunkGet/);
  assert.match(world, /chunkPut\(key, j\.elements\)/);
  // and the streamer looks where the car is going, not only where it is
  assert.match(world, /if \(sp > 6\)/);
  assert.match(world, /CHUNK_INFLIGHT/);
});

test("a city block is a handful of draw calls, not a thousand", async () => {
  const world = await read("js/drive_world.js");
  // tint rides in vertex colours so one material covers a whole facade style
  assert.match(world, /export function facadeBatchMaterial/);
  assert.match(world, /vertexColors: true/);
  assert.match(world, /function paintGeometry/);
  assert.match(world, /mergeGeometries/);
  assert.match(world, /export function flushBuildingBatch/);
  // roofs bake their height in: a merged mesh has no per-roof transform
  assert.match(world, /roofGeo\.translate\(0, base \+ hEff, 0\)/);
  // a Street View photo still takes one building out of the batch
  assert.match(world, /export function hideFromBatch/);
  assert.match(world, /rec\.mesh = new THREE\.Mesh\(geo, mat\)/);
});

test("night bleeds through a real bloom pass, not just sprites", async () => {
  const drive = await readDrive();
  assert.match(drive, /from "three\/tsl"/);
  assert.match(drive, /boxBlur/);
  assert.match(drive, /luminance\(color\.rgb\)/);
  assert.match(drive, /export function syncBloom/);
  // night drops the threshold and lifts the bleed
  assert.match(drive, /D\.bloomCut\.value = night \? 0\.42 : 0\.78/);
  // any backend that will not build the graph keeps rendering directly
  assert.match(drive, /D\.postFailed = true/);
  assert.match(drive, /else gpuRender\(D\.renderer, D\.scene, D\.camera\)/);
});

test("an impossible finish time is flagged rather than believed", async () => {
  const [drive, i18n] = await Promise.all([readDrive(), readI18nSource()]);
  assert.match(drive, /export function finishSuspect/);
  // faster than the countdown, faster than the car, or never seen at the gate
  assert.match(drive, /if \(ms > now - D\.ses\.t0 \+ 2500\) return true/);
  assert.match(drive, /courseMeters\(D\.ses\.def\.points\) \/ 62/);
  assert.match(drive, /\(seen\.cp \|\| 0\) < need/);
  // shown, sorted last, and labelled — not silently dropped
  assert.match(drive, /dr-res-suspect/);
  assert.match(drive, /mr_unverified/);
  assert.match(i18n, /mr_unverified: "unverified time"/);
});

test("the sky is painted, because raw GLSL does not survive WebGPU", async () => {
  const [sky, drive, traffic] = await Promise.all([
    read("js/drive_sky.js"), read("js/drive.js"), read("js/drive_traffic.js"),
  ]);
  // no hand-written shader anywhere in the drive scene: the WebGPU node builder
  // rejects ShaderMaterial and the sky lost its sun, clouds and stars to it
  assert.doesNotMatch(sky, /new THREE\.ShaderMaterial/);
  assert.doesNotMatch(traffic, /new THREE\.ShaderMaterial/);
  assert.doesNotMatch(sky, /gl_FragColor/);
  assert.doesNotMatch(traffic, /gl_FragColor/);
  assert.doesNotMatch(drive, /skyUni/);
  // an equirect canvas painted once per preset, not an fbm per pixel per frame
  assert.match(sky, /export function paintSky/);
  assert.match(sky, /function paintClouds/);
  assert.match(sky, /^\s*paintSky\(\);/m, "the preset change repaints the baked sky");
  // sun placed to match three's sphere UVs, drawn across the seam
  assert.match(sky, /function sunUV/);
  assert.match(sky, /Math\.atan2\(d\.z, -d\.x\)/);
  assert.match(sky, /for \(let k = -1; k <= 1; k\+\+\)/);
  // clouds drift by turning their own sphere
  assert.match(sky, /D\.skyClouds\.rotation\.y \+= dt/);
  // and the reflection env prefilters the SAME painted sky
  assert.match(sky, /D\.envTex = new THREE\.CanvasTexture\(D\.skyCanvas\)/);
  assert.match(sky, /EquirectangularReflectionMapping/);
});

test("tyre marks fade through a node material", async () => {
  const traffic = await read("js/drive_traffic.js");
  assert.match(traffic, /MeshBasicNodeMaterial/);
  assert.match(traffic, /attribute\("aBirth", "float"\)/);
  assert.match(traffic, /skidMat\.opacityNode = clamp/);
  assert.match(traffic, /uniform\(0\), uLife: uniform\(SKID_LIFE\)/);
});

test("a time-of-day switch refills the cars' environment instead of replacing it", async () => {
  const sky = await read("js/drive_sky.js");
  // a new PMREM target re-keyed every car material (prefilterInto: tests/sky_model.test.mjs)
  assert.match(sky, /const rt = prefilterInto\(D\.pmrem, D\.envTex, D\.envRT\);\s*if \(rt === D\.envRT\) return;/);
  assert.doesNotMatch(sky, /D\.pmrem\.fromEquirectangular\(D\.envTex\)/);
});

test("a retired environment map waits for the frames that used it", async () => {
  const [sky, drive] = await Promise.all([read("js/drive_sky.js"), read("js/drive.js")]);
  assert.match(sky, /ENV_RETIRE_FRAMES/);
  assert.match(sky, /\(D\.frameNo \|\| 0\) - envRetire\[0\]\.frame > ENV_RETIRE_FRAMES/);
  assert.match(drive, /D\.frameNo = \(D\.frameNo \|\| 0\) \+ 1/);
});

test("miniature RC supports touch and analog gamepad driving", async () => {
  const [rc, css] = await Promise.all([readRC(), stylesSource()]);
  assert.match(rc, /navigator\.getGamepads/);
  assert.match(rc, /data-hold="fwd"/);
  assert.match(rc, /input\.steerAxis/);
  assert.match(rc, /Number\.isFinite\(input\.throttle\)/);
  assert.match(css, /@media \(pointer: coarse\)/);
});

test("miniature RC samples the exact continuous rendered road surface", async () => {
  const [rc, track, helperSource] = await Promise.all([
    readRC(), trackSource(), read("js/road_surface.js"),
  ]);
  const helper = await import(`data:text/javascript,${encodeURIComponent(helperSource)}`);
  const triA = {
    ax: 0, ay: 2, az: 0, bx: 10, by: 4, bz: 0, cx: 10, cy: 8, cz: 10,
    minx: 0, maxx: 10, minz: 0, maxz: 10,
  };
  const triB = {
    ax: 0, ay: 2, az: 0, bx: 10, by: 8, bz: 10, cx: 0, cy: 6, cz: 10,
    minx: 0, maxx: 10, minz: 0, maxz: 10,
  };
  // Both rendered triangles return the same height on their shared diagonal.
  assert.equal(helper.triangleHeightAt(triA, 5, 5), 5);
  assert.equal(helper.triangleHeightAt(triB, 5, 5), 5);
  assert.equal(helper.surfaceHeightAt([triA, triB], 5, 5, 4, 2.2), 5);
  const sample = helper.surfaceSampleAt([triA, triB], 4, 2, 3, 2.2);
  assert.equal(sample.height, helper.triangleHeightAt(triA, 4, 2));
  assert.ok(sample.normal.y > 0.85);
  assert.ok(Math.abs(Math.hypot(sample.normal.x, sample.normal.y, sample.normal.z) - 1) < 1e-9);
  // An unreachable flyover is not mistaken for the floor layer below it.
  assert.equal(helper.surfaceHeightAt([{ ...triA, ay: 40, by: 42, cy: 46 }], 5, 5, 0, 2.2), null);
  // A truck stays on the deck it is ON where a second pass of the road crosses
  // just above it — picking the highest reachable layer instead is what put a
  // 2cm lip in the lane at every place the circuit ran over itself.
  const flat = (h) => ({
    ax: 0, ay: h, az: 0, bx: 10, by: h, bz: 0, cx: 10, cy: h, cz: 10,
    minx: 0, maxx: 10, minz: 0, maxz: 10,
  });
  assert.equal(helper.surfaceHeightAt([flat(6), flat(7.5)], 6, 2, 6, 2.2), 6);
  // ...but a layer above a truck that is climbing toward it is still reachable
  assert.equal(helper.surfaceHeightAt([flat(7.5)], 6, 2, 6, 2.2), 7.5);
  // ...and while falling, the topmost surface underneath catches it
  assert.equal(helper.surfaceHeightAt([flat(6), flat(0.7)], 6, 2, 20, 2.2), 6);

  assert.match(track, /surface\.push\(surfaceTri\(pe\[0\], qe\[0\], qe\[1\]\)\)/);
  assert.doesNotMatch(track, /repeatDepth/);
  // A per-pass lift may only reach the deck through edges()/widen(), which feed
  // the rendered quads AND the collision triangles. A drawing-only lift is what
  // used to stand the truck at a different height from the deck it could see.
  assert.match(track, /function edges\(p\)[\s\S]*?y = p\.y \+ \(p\.lift \|\| 0\)/);
  assert.match(track, /function widen\(p, w\)[\s\S]*?y = p\.y \+ \(p\.lift \|\| 0\)/);
  assert.match(track, /y0: p\.y \+ \(p\.lift \|\| 0\)/);
  assert.match(rc, /surfaceHeightAt\(R\.col\.surface, x, z, y, step\)/);
  // the deck outranks whatever it is laid over, so a road crossing a counter is
  // a bridge and not a ramp onto the counter
  assert.match(rc, /return g - roadY > step \? g : roadY;/);
  // and only a sustained climb launches: a one-frame lip must not throw a truck
  assert.match(rc, /car\.climb = \(car\.climb \|\| 0\) \+ \(rate - \(car\.climb \|\| 0\)\)/);
  assert.match(rc, /car\.grp\.quaternion\.setFromRotationMatrix\(carBasis\)/);
  assert.match(rc, /car\.y = g;[\s\S]*car\.vy = 0;/);
  assert.match(rc, /waterAt\(car\.x, car\.z\) && !roadUnderCar/);
  assert.match(rc, /if \(roadUnderCar\) car\.sink = 0/);
  assert.match(rc, /var followsRoad =[\s\S]*car\.grounded !== false[\s\S]*roadSupport/);
  assert.match(rc, /if \(!followsRoad && car\.y > g \+ 0\.05\)/);
  assert.doesNotMatch(rc, /car\.y \+= \(g - car\.y\)/);
  assert.doesNotMatch(rc, /function enforceRoadLayer\(/);
  assert.doesNotMatch(rc, /function recoverUnderRoad\(/);
});

// js/track.js as one module. moduleSource drops the pieces' imports and relies on
// the main file importing what they use; track.js now imports only what it uses
// itself (the rest are bare `import "./x.js";`, which a data: URL cannot resolve),
// so the two names the pieces take from outside are imported here.
const trackSource = () =>
  'import { pointInPoly } from "./geometry.js";\nimport { STEP_UP } from "./road_surface.js";\n' +
  moduleSource("js/track.js").replace(/^import "\.[^"]*";\n/gm, "");

// Build a real road (js/track.js against the vendored three) on a synthetic flat
// whose route doubles back through a branch, exactly like routeAllRooms does, and
// measure the deck a truck would actually drive on.
async function buildTestRoad(customAnchors) {
  const root = new URL("../", import.meta.url);
  const src = trackSource()
    .replace('from "three"', `from "${new URL("vendor/three/three.module.js", root).href}"`)
    .replace('from "./state.js"', `from "${new URL("js/state.js", root).href}"`)
    .replace('from "./geometry.js"', `from "${new URL("js/geometry.js", root).href}"`)
    .replace('from "./road_surface.js"', `from "${new URL("js/road_surface.js", root).href}"`);
  const { buildRoad } = await import(`data:text/javascript,${encodeURIComponent(src)}`);
  const segs = [];
  const wall = (ax, az, bx, bz) => segs.push({ ax, az, bx, bz, half: 5 });
  wall(0, 0, 900, 0);
  wall(900, 0, 900, 700);
  wall(900, 700, 0, 700);
  wall(0, 700, 0, 0);
  wall(400, 0, 400, 240);
  wall(400, 420, 400, 700);
  wall(700, 260, 900, 260);
  const rects = [
    { x0: 60, z0: 60, x1: 220, z1: 200, y0: 0, y1: 45 },
    { x0: 500, z0: 80, x1: 640, z1: 180, y0: 0, y1: 75 },
    { x0: 760, z0: 420, x1: 880, z1: 560, y0: 0, y1: 52 },
    { x0: 120, z0: 520, x1: 300, z1: 640, y0: 0, y1: 60 },
  ];
  const env = {
    rects: () => rects,
    segs: () => segs,
    groundAt: (x, z, y, step) =>
      rects.reduce(
        (g, r) =>
          x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && r.y1 <= y + step + 0.01
            ? Math.max(g, r.y1)
            : g,
        0,
      ),
  };
  // in and back out of the middle branch — the doubled-back stretch
  const anchors = customAnchors || [
    { x: 200, z: 150 }, { x: 200, z: 560 }, { x: 330, z: 620 }, { x: 600, z: 600 },
    { x: 820, z: 600 }, { x: 820, z: 340 }, { x: 600, z: 330 }, { x: 600, z: 130 },
    { x: 600, z: 330 }, { x: 330, z: 330 }, { x: 330, z: 130 },
  ];
  return { road: buildRoad(anchors, [], env), env };
}

// Home mode: the apartment itself is the circuit. Same synthetic flat, but the
// route has to be one a truck could drive on the real floor — through the gaps
// in the walls, round what it cannot climb, up a ramp onto what it can.
async function buildHomeRoad(extra, customAnchors, extraEnv) {
  const root = new URL("../", import.meta.url);
  const src = trackSource()
    .replace('from "three"', `from "${new URL("vendor/three/three.module.js", root).href}"`)
    .replace('from "./state.js"', `from "${new URL("js/state.js", root).href}"`)
    .replace('from "./geometry.js"', `from "${new URL("js/geometry.js", root).href}"`)
    .replace('from "./road_surface.js"', `from "${new URL("js/road_surface.js", root).href}"`);
  const { buildRoad } = await import(`data:text/javascript,${encodeURIComponent(src)}`);
  const segs = [];
  const wall = (ax, az, bx, bz) => segs.push({ ax, az, bx, bz, half: 5 });
  // one room split by a wall with a single doorway at x 250-350
  wall(0, 0, 600, 0);
  wall(600, 0, 600, 600);
  wall(600, 600, 0, 600);
  wall(0, 600, 0, 0);
  wall(0, 300, 250, 300);
  wall(350, 300, 600, 300);
  const rooms = [
    { pts: [{ x: 5, z: 5 }, { x: 595, z: 5 }, { x: 595, z: 295 }, { x: 5, z: 295 }] },
    { pts: [{ x: 5, z: 305 }, { x: 595, z: 305 }, { x: 595, z: 595 }, { x: 5, z: 595 }] },
  ];
  const rects = [
    { x0: 150, z0: 60, x1: 450, z1: 230, y0: 0, y1: 45 }, // bed: climbable
    { x0: 60, z0: 380, x1: 200, z1: 520, y0: 0, y1: 190 }, // wardrobe: not
    ...(extra || []),
  ];
  const env = {
    homeMode: true,
    hasJump: false,
    rects: () => rects,
    tops: () => rects,
    segs: () => segs,
    groundAt: (x, z, y, step) =>
      rects.reduce(
        (g, r) =>
          x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && r.y1 <= y + step + 0.01
            ? Math.max(g, r.y1)
            : g,
        0,
      ),
    blockedAt: () => false,
    ...(extraEnv || {}),
  };
  const anchors = customAnchors || [
    { x: 300, z: 150 }, { x: 500, z: 150 }, { x: 300, z: 450 }, { x: 500, z: 450 },
  ];
  return { road: buildRoad(anchors, rooms, env), env, segs, rects };
}

test("RC home mode drives the flat itself and only decks what it must", async () => {
  const { road, env, segs, rects } = await buildHomeRoad();
  assert.ok(road && road.feats.home);
  const C = road.center;

  // 1. Most of the lap has NO road: the floor and the furniture carry the truck.
  //    (This is the whole point of the mode — a ribbon under the kart the whole
  //    way round is what made the game feel disconnected from the home.)
  const decked = C.filter((p) => p.deck).length;
  assert.ok(decked / C.length < 0.4, `${Math.round((decked / C.length) * 100)}% of the lap is road`);
  assert.equal(road.col.surface.length, decked ? road.col.surface.length : 0);

  // 2. The line is one a truck can drive: it never crosses a wall.
  const hitsWall = (a, b) =>
    segs.some((s) => {
      const r = { x: b.x - a.x, z: b.z - a.z },
        q = { x: s.bx - s.ax, z: s.bz - s.az };
      const den = r.x * q.z - r.z * q.x;
      if (!den) return false;
      const t = ((s.ax - a.x) * q.z - (s.az - a.z) * q.x) / den;
      const u = ((s.ax - a.x) * r.z - (s.az - a.z) * r.x) / den;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    });
  const crossings = C.filter((p, i) => hitsWall(p, C[(i + 1) % C.length])).length;
  assert.equal(crossings, 0, "the racing line goes through a wall");

  // 3. Nothing solid is left standing in the lane: every sample is either clear,
  //    on a surface it climbed, or decked (which owns collision in rc.js).
  const stuck = C.filter((p) => {
    if (p.deck || p.hold) return false;
    return rects.some(
      (r) =>
        p.x >= r.x0 - 2 && p.x <= r.x1 + 2 && p.z >= r.z0 - 2 && p.z <= r.z1 + 2 &&
        r.y0 < p.y + 2.6 && r.y1 > p.y + 2.2,
    );
  }).length;
  assert.equal(stuck, 0, "the lap runs into something solid");

  // Automatic racing starts with a simple floor circuit. Climbing furniture
  // is an explicit option and cannot be a prerequisite for a valid lap.
  assert.equal(road.feats.rides, 0);
  assert.equal(road.feats.through, 0);
  assert.equal(road.quality.valid, true);
  assert.ok(road.quality.minRadius >= 21.9);

});

test("optional furniture visits never displace a safe automatic floor circuit", async () => {
  const { road } = await buildHomeRoad([
    { x0: 380, z0: 380, x1: 540, z1: 520, y0: 38, y1: 42 },
  ], undefined, { homeFeatures: true });
  assert.ok(road && road.feats.home);
  assert.equal(road.quality.valid, true);
  assert.equal(road.feats.through, 0);
  assert.ok(road.quality.minRadius >= 21.9);
});

test("RC home mode hands collision back to the apartment", async () => {
  const rc = await readRC();
  // the mode reaches the road builder, and the ride heights come from the
  // per-MESH boxes (a sofa's merged box tops out at its backrest)
  assert.match(rc, /homeMode: !!R\.homeMode/);
  assert.match(rc, /col\.tops = raw\.map/);
  // no off-road rescue: driving on the living-room floor is the point, not a
  // fault to be fished out of
  assert.match(rc, /!R\.homeMode &&\s*\n?\s*R\.race &&/);
  // ...and only a deck actually worth falling off still pushes a kart back
  assert.match(rc, /\(!R\.homeMode \|\| car\.y > 8\)/);
});

test("a hand-shaped RC height profile drives the actual road", async () => {
  const anchors = [
    { x: 200, z: 150, y: 0.7 }, { x: 200, z: 560, y: 0.7 },
    { x: 330, z: 620, y: 42 }, { x: 600, z: 600, y: 90 },
    { x: 820, z: 600, y: 90 }, { x: 820, z: 340, y: 42 },
    { x: 600, z: 330, y: 0.7 }, { x: 600, z: 130, y: 0.7 },
    { x: 600, z: 330, y: 0.7 }, { x: 330, z: 330, y: 0.7 },
    { x: 330, z: 130, y: 0.7 },
  ];
  const { road } = await buildTestRoad(anchors);
  assert.ok(road);
  assert.equal(road.feats.manualHeight, true);
  assert.equal(road.high, 90);
  assert.ok(Math.max(...road.center.map((p) => p.y)) >= 89);
  assert.ok(Math.min(...road.center.map((p) => p.y)) < 2);
  assert.equal(road.feats.jump, undefined);
  assert.equal(road.feats.spiral, undefined);
});

test("the RC road deck is flat where it is laid on the floor", async () => {
  const { road, env } = await buildTestRoad();
  const { triangleHeightAt, surfaceHeightAt } = await import(
    new URL("../js/road_surface.js", import.meta.url)
  );
  assert.ok(road && road.col.surface.length > 200);

  // 1. No part of the deck may sink below the floor. The bank used to saturate at
  //    BANK_MAX on every bend, which rolled a floor-level deck (0.7cm proud) so
  //    far that one edge went 3.8cm under the floorboards and the other stood
  //    proud of them: the road read as a chain of separate tilted plates.
  const under = road.col.surface.filter(
    (t) => Math.min(t.ay, t.by, t.cy) < -0.05,
  );
  assert.equal(under.length, 0, "deck triangles below the floor");

  // 2. A floor-level sample is flat; anything elevated is only gently banked.
  const prims = road.col.road;
  let maxFloorCross = 0,
    maxCross = 0;
  for (let k = 0; k < prims.length; k++) {
    const p = prims[k];
    const mx = p.ax + p.ux * p.len * 0.5,
      mz = p.az + p.uz * p.len * 0.5;
    const at = (off) => {
      const x = mx - p.uz * off,
        z = mz + p.ux * off;
      const a = triangleHeightAt(road.col.surface[2 * k], x, z);
      return a == null ? triangleHeightAt(road.col.surface[2 * k + 1], x, z) : a;
    };
    const l = at(8),
      r = at(-8);
    if (l == null || r == null) continue;
    const cross = Math.abs(l - r);
    maxCross = Math.max(maxCross, cross);
    // only the deck actually lying ON the floor — the bank fades in with height
    if (Math.max(p.y0, p.y1) < 1.5) maxFloorCross = Math.max(maxFloorCross, cross);
  }
  assert.ok(maxFloorCross < 0.4, `floor deck is rolled by ${maxFloorCross.toFixed(2)}cm`);
  assert.ok(maxCross < 3, `deck cross-slope reaches ${maxCross.toFixed(2)}cm`);

  // 3. Walk the driven line with rc.js's own ground rule: the surface carrying
  //    the truck must be continuous. Steps of 2cm used to sit at the joins
  //    between two passes of the road, and a step up followed by a step down is
  //    what launched a truck into the air.
  const groundAt = (x, z, y, step) => {
    const furniture = env.groundAt(x, z, y, step);
    const deck = surfaceHeightAt(road.col.surface, x, z, y, step);
    if (deck == null) return furniture;
    return furniture - deck > step ? furniture : deck;
  };
  let y = null,
    worst = 0;
  for (const p of prims) {
    for (let t = 0; t < p.len; t += 1) {
      const h = groundAt(p.ax + p.ux * t, p.az + p.uz * t, y == null ? p.y0 : y, 2.2);
      // >10cm is the deliberate gap at the ramp jump, not a seam
      if (y != null && Math.abs(h - y) > worst && Math.abs(h - y) < 10)
        worst = Math.abs(h - y);
      y = h;
    }
  }
  // The steepest thing on the circuit is a designed ramp at roughly 0.5cm of
  // rise per cm travelled; anything above that is a lip between two sections.
  assert.ok(worst <= 0.6, `worst step along the driven line is ${worst.toFixed(2)}cm`);
});

// The two things the generated circuit was reported as getting wrong: corners no
// truck can hold, and the road laid on top of itself. Both come from the same
// place — a room tour that drives into every branch and back out along the same
// line — and both are measured here on the line the game actually drives.
test("the generated RC circuit holds a driveable radius and lays two lanes, not one", async () => {
  const { road } = await buildTestRoad();
  const C = road.center,
    n = C.length,
    W = 26;
  const turn = (i) => {
    const a = C[(i - 1 + n) % n],
      b = C[i],
      c = C[(i + 1) % n];
    let d = Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  };
  const seg = (i) => Math.hypot(C[(i + 1) % n].x - C[i].x, C[(i + 1) % n].z - C[i].z);

  // 1. Even sample spacing. The passes that shape the assembled line move
  //    samples, and where a corner would not open they used to pull the tip in
  //    until four samples sat 0.22cm apart — a 34° turn between two 2mm segments
  //    folds two full-width deck quads straight over each other.
  const lens = [...Array(n).keys()].map(seg).sort((a, b) => a - b);
  assert.ok(lens[0] > 2, `shortest centreline segment is ${lens[0].toFixed(2)}cm`);

  // 2. A radius a truck can hold. Measured as arc/angle so it cannot be faked by
  //    bunching samples: the same tight arc sampled finer reads as a smaller
  //    per-sample turn but the SAME radius.
  const radii = [];
  for (let i = 0; i < n; i++) {
    if (C[i].gap || C[(i + 1) % n].gap || C[(i - 1 + n) % n].gap) continue;
    const t = turn(i);
    radii.push(t > 1e-4 ? (seg(i) + seg((i - 1 + n) % n)) / 2 / t : 1e6);
  }
  // Not zero — a tour that has to double back down a 40cm gap between a unit and
  // a wall cannot be given a 20cm radius there, and moving the line out of that
  // gap is the router's job, not this pass's. On this flat it was 12 before the
  // curvature limiter and the lane split went in.
  const tight = radii.filter((r) => r < 20).length;
  assert.ok(tight <= 4, `${tight} corners tighter than a 20cm radius`);

  // 3. Two lanes, not one road driven twice. Where the tour doubles back the two
  //    directions are pushed apart at the anchors and each deck is narrowed to
  //    what the pair can fit into, so the running surfaces must not intersect.
  let overlapped = 0;
  for (let i = 0; i < n; i++) {
    let near = 1e9,
      otherW = W / 2;
    for (let j = 0; j < n; j++) {
      if (Math.min((i - j + n) % n, (j - i + n) % n) <= 12) continue;
      if (Math.abs((C[j].y || 0) - (C[i].y || 0)) > 4) continue; // a flyover is not a lane
      const d = Math.hypot(C[i].x - C[j].x, C[i].z - C[j].z);
      if (d < near) {
        near = d;
        otherW = C[j].w || W / 2;
      }
    }
    if (near < (C[i].w || W / 2) + otherW) overlapped++;
  }
  assert.ok(
    overlapped / n < 0.12,
    `${Math.round((overlapped / n) * 100)}% of the lap has a second deck laid on it`,
  );
});

test("RC track safety keeps obstacle checks stable and respects the jump switch", async () => {
  const [rc, track] = await Promise.all([readRC(), trackSource()]);
  // Checking one furniture item must not replace the requested flyover height
  // with a boolean for every item that follows it.
  assert.match(track, /highBlocked = r\.y0 < \(high \|\| 0\) \+ 7/);
  assert.doesNotMatch(track, /,\s*high = r\.y0/);
  // Turning jumps off produces a continuous deck, not merely hidden visuals.
  assert.match(track, /gapN = env && env\.hasJump === false \? 0/);
  // A grounded kart may only lose road support inside a deliberate jump gap.
  assert.match(rc, /wasOnRoad &&[\s\S]*?!roadUnderCar &&[\s\S]*?!inTrackGap\(car\.x, car\.z, car\.y\)/);
  assert.match(rc, /car\.x = moveFromX;[\s\S]*?car\.z = moveFromZ;/);

  const { road } = await buildTestRoad();
  // Rebuild the same synthetic route with the physical gap disabled.
  const root = new URL("../", import.meta.url);
  const src = track
    .replace('from "three"', `from "${new URL("vendor/three/three.module.js", root).href}"`)
    .replace('from "./state.js"', `from "${new URL("js/state.js", root).href}"`)
    .replace('from "./geometry.js"', `from "${new URL("js/geometry.js", root).href}"`)
    .replace('from "./road_surface.js"', `from "${new URL("js/road_surface.js", root).href}"`);
  const { buildRoad } = await import(`data:text/javascript,${encodeURIComponent(src)}`);
  const safeRoad = buildRoad(
    [{ x: 0, z: 0 }, { x: 0, z: 240 }, { x: 300, z: 240 }, { x: 300, z: 0 }],
    [],
    {
      hasJump: false,
      rects: () => [], segs: () => [], groundAt: () => 0,
      blockedAt: () => false,
    },
  );
  assert.equal(safeRoad.feats.jump, false);
  assert.equal(safeRoad.col.gaps.length, 0);
  assert.ok(safeRoad.center.every((p) => !p.gap));
  for (let i = 0; i < safeRoad.center.length; i++) {
    const a = safeRoad.center[i], b = safeRoad.center[(i + 1) % safeRoad.center.length];
    assert.ok(Math.abs(a.y - b.y) < 4, "jump-off deck has no vertical cliff");
  }

  // When furniture consumes the whole possible route, sideways nudging cannot
  // succeed. The fallback must produce one flat flyover above it, rather than
  // accepting a ribbon through the object.
  const impossibleBox = { x0: -1000, z0: -1000, x1: 1000, z1: 1000, y0: 0, y1: 80 };
  const bridgedRoad = buildRoad(
    [{ x: 0, z: 0 }, { x: 0, z: 240 }, { x: 300, z: 240 }, { x: 300, z: 0 }],
    [],
    {
      hasJump: false,
      rects: () => [impossibleBox], segs: () => [], groundAt: () => 0,
      blockedAt: () => true,
    },
  );
  assert.ok(bridgedRoad.feats.bridged > 0);
  const bridgeY = bridgedRoad.center.filter((p) => !p.gap).map((p) => p.y);
  const minBridgeY = Math.min(...bridgeY);
  assert.ok(minBridgeY > impossibleBox.y1, `bridge height ${minBridgeY}`);
  assert.ok(Math.max(...bridgeY) - Math.min(...bridgeY) < 1e-9);

  const Col2D = await import(new URL("../js/col2d.js", import.meta.url));
  const inside = { x: 0, z: 0 };
  const world = {
    segs: [{ ax: -20, az: 0, bx: 20, bz: 0, half: 2 }],
    rects: [{ x0: -5, z0: -5, x1: 5, z1: 5, y0: 0, y1: 50 }],
    rails: [], doorSegs: [],
  };
  assert.equal(
    Col2D.collideCircle(world, inside, 1.8, 10, 2.6, 2.2, {
      ignoreWorldAt: () => true,
    }),
    0,
    "the deck owns collision while it supports the kart",
  );
});

test("miniature RC uses a controllable low-speed driving tune", async () => {
  const rc = await readRC();
  assert.match(rc, /MAXV = 78/);
  assert.match(rc, /ACC = 88/);
  assert.match(rc, /DRAG = 1\.65/);
  assert.match(rc, /TURN_MAX = 3\.35/);
});

test("the live RC track editor defers rebuilds and edits from both views", async () => {
  const [rc, ed] = await Promise.all([readRC(), readEditor()]);

  // One editor owns both views: rc.js keeps no second editor UI of its own.
  assert.doesNotMatch(rc, /openRcEditor|toggle3dTrackEditor|render3dBeacons/);
  assert.match(rc, /import \{[\s\S]*?editorPointerDown[\s\S]*?\} from "\.\/rc_editor\.js"/);
  // The 3D view hands presses to the editor first but still orbits / drives.
  assert.match(rc, /if \(editorActive\(\) && editorPointerDown\(e\)\) return;/);
  assert.match(rc, /if \(editorActive\(\) && editorPointerMove\(e\)\) return;/);
  // A full buildRoad is ~90ms — dragging a handle must never call it per frame.
  assert.doesNotMatch(rc, /buildTrack\(\); \/\/ Live morph/);
  assert.match(ed, /function scheduleBuild\(delay\)[\s\S]*?setTimeout/);
  assert.match(ed, /D\.ghostPts = ghostLine\((?:ST\.)?D\.anchors\)/);
  // The map draws the road that actually exists, so rc.js must keep the
  // centreline the road builder returned.
  assert.match(rc, /center: road\.center/);
  // Editing from a chase cam 24cm behind a 4cm truck is useless: the editor
  // owns an overview camera while it is open.
  assert.match(rc, /function editorCam\(dt\)/);
  assert.match(rc, /R\.edCam\.on && editorActive\(\)/);
  // 3D is the designer: clicks hit models, handles drag on their own plane,
  // and a cone lifts a point off the floor.
  assert.match(ed, /out\.mesh = true/);
  assert.match(ed, /userData\.lift/);
  assert.match(ed, /faceApply\(pick\.tg, "top"/);
  assert.match(ed, /intersectPlane\(new THREE\.Plane\(new THREE\.Vector3\(0, 1, 0\), -hy\)/);
  assert.match(ed, /id="rcEdShowMap"/);
  // The map replaces the existing 2D design pane and opens beside 3D on a
  // desktop: the map shapes the route while 3D picks real surfaces. Compact
  // layouts keep one large view and can open the map from the 🗺️ chip.
  assert.match(ed, /document\.getElementById\("view-2d"\)/);
  assert.match(ed, /document\.getElementById\("right-inspector"\)/);
  assert.doesNotMatch(ed, /document\.getElementById\("view-3d"\) \|\| document\.body/);
  assert.match(rc, /function editorSplit\(on\)/);
  assert.match(rc, /window\.__setViewMode\(compact \? "3d" : "split"\)/);
  assert.match(rc, /else if \(R\.edPrevView\) \{[\s\S]*?window\.__setViewMode\(R\.edPrevView\)/);

  // A route belongs to the flat it was drawn on: stored anchors carry that
  // plan's signature and are dropped (auto tour instead) when the walls change.
  assert.match(rc, /function planSig\(\)/);
  assert.match(rc, /R\.anchorsSig === planSig\(\)/);
  assert.match(rc, /var anchors = customAnchors\(\) \|\| routeAllRooms\(rooms\);/);
  assert.match(rc, /if \(!R\.race\) buildTrack\(\);/);
  assert.match(ed, /var seed = (?:ST\.)?E\.anchors\(\) \|\| (?:ST\.)?E\.presets\.auto/);
  assert.match(ed, /function reseedForPlan\(\)/);

  // Precise point editing stays literal even when collision-aware map snapping
  // is enabled, and live rebuild state is visible instead of feeling stalled.
  assert.match(ed, /function nudgeSelected\(dx, dz\)[\s\S]*?x: a\.x \+ dx, z: a\.z \+ dz/);
  assert.match(ed, /function setSelectedCoords\(x, z\)[\s\S]*?x: x, z: z/);
  assert.match(ed, /id="rcEdPointX" type="number"/);
  assert.match(ed, /function editorStatus\(kind\)/);
  assert.match(ed, /editorStatus\("preview"\)/);
  // The default gesture edits visible pieces: points move alone, a section
  // moves as one piece, and its on-canvas lift handle owns the height profile.
  assert.match(ed, /data-mode="shape" class="active"/);
  assert.match(ed, /function segmentAt\(pts, x, z, r\)/);
  assert.match(ed, /D\.segDrag = \{/);
  assert.match(ed, /function heightFromScreen\(sy\)/);
  assert.match(ed, /id="rcEdSegH" type="range"/);
  // The surface model is explicit in the editor: a home route is not presented
  // as a continuous road, and the most common add-point edit needs no mode
  // switch or hidden modifier.
  assert.match(ed, /id="rcEdHome"/);
  assert.match(ed, /id="rcEdRoad"/);
  assert.match(ed, /function setSurfaceMode\(home\)[\s\S]*?ST\.E\.cfg\.homeMode = !!home/);
  assert.match(ed, /double-click to add a point/);
  const map = await read("js/rc_editor_map.js");
  assert.match(map, /addEventListener\("dblclick"/);
  assert.match(map, /homeSurface && !c\.deck/);
  assert.match(map, /strokeCategorized/);
  assert.match(ed, /id="rcEdFollow"/);
  assert.match(ed, /id="rcEdAutoPath"/);
  assert.match(ed, /function setFollow\(/);
  assert.match(ed, /function setSegmentSurf\(/);
  assert.match(ed, /data-surf="road"/);
  assert.match(ed, /id="rcEd3dHint"/);
  assert.match(ed, /id="rcEdKey"/);
  assert.match(ed, /function noteUserEdit\(/);
  assert.match(ed, /if \(a\.surf === "road" \|\| a\.surf === "home"\) out\.surf = a\.surf/);
  const trackSrc = trackSource();
  assert.match(trackSrc, /env\.followAnchors/);
  assert.match(trackSrc, /function applyUserSurf\(/);
  assert.match(trackSrc, /if \(attract === false\) return/);
  assert.match(rc, /followAnchors: !!R\.followAnchors/);

  // Pure routing helpers, exercised against the real source.
  const helper = await importEditorGeom();
  const loop = [
    { x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 },
  ];
  // A new point drops into the leg it is nearest to, not onto the end of the
  // list — appending is what made clicking in the 3D view produce a zigzag.
  assert.equal(helper.insertSpot(loop, 50, -20).i, 1);
  assert.equal(helper.insertSpot(loop, 120, 50).i, 2);
  assert.equal(helper.insertSpot(loop, -20, 50).i, 4);
  assert.equal(helper.segmentAt(loop, 50, 2, 5), 0);
  assert.equal(helper.segmentAt(loop, 50, 20, 5), -1);
  // The ghost route is a closed spline through every anchor.
  const ghost = helper.ghostLine(loop);
  assert.equal(ghost.length, loop.length * 10 + 1);
  assert.deepEqual(ghost[0], ghost[ghost.length - 1]);
  for (const a of loop)
    assert.ok(
      ghost.some((g) => Math.hypot(g.x - a.x, g.z - a.z) < 1e-6),
      "spline passes through every anchor",
    );
});

test("a hand-picked pass-by drives the item the editor marked, and only once", async () => {
  // The face tool's "drive over this one" is an anchor flagged `ride: true` on
  // the item. The builder has to bind it to the plat it stands on (the editor and
  // the builder hold different snapshots, so it cannot carry the rect itself),
  // ramp onto it — and NOT then seed a second automatic detour onto the same bed.
  const { road } = await buildHomeRoad(undefined, [
    { x: 300, z: 145, ride: true }, // the bed at x 150-450 / z 60-230, top 45
    { x: 520, z: 400 },
    { x: 120, z: 250 },
  ]);
  assert.ok(road && road.feats.home);
  assert.ok(road.feats.rides >= 1, "the marked item is not ridden");
  assert.equal(road.feats.detours, 0, "the same item was also auto-detoured onto");
  const onBed = road.center.filter(
    (p) => p.x > 150 && p.x < 450 && p.z > 60 && p.z < 230 && p.y > 40,
  );
  assert.ok(onBed.length > 3, `only ${onBed.length} samples ride the bed`);
  // riding it means holding a surface at its height, whether or not a deck is
  // drawn there (the ride itself is bare — that is the point of home mode)
  assert.ok(onBed.every((p) => p.hold), "a ride sample with nothing to drive on");
});

test("a user-drawn home route follows its points and can pin a road stretch", async () => {
  const anchors = [
    { x: 80, z: 80, surf: "road" },
    { x: 520, z: 80 },
    { x: 520, z: 520 },
    { x: 80, z: 520 },
  ];
  const { road } = await buildHomeRoad(undefined, anchors, { followAnchors: true });
  assert.ok(road && road.feats.home);
  assert.equal(road.feats.follow, true);
  // The driven line stays near the handles instead of A* wandering off.
  const nearFirst = road.center.filter(
    (p) => Math.hypot(p.x - 80, p.z - 80) < 40 || Math.hypot(p.x - 520, p.z - 80) < 40,
  );
  assert.ok(nearFirst.length > 2, "follow mode left the user's corners");
  const onFirstLeg = road.center.filter((p) => p.x > 90 && p.x < 500 && p.z < 160);
  assert.ok(
    onFirstLeg.some((p) => p.deck),
    "a section marked as road is still painted as floor",
  );
});

test("the RC pass-by tool edits intent and keeps rule and points together", async () => {
  const [ed, rc] = await Promise.all([readEditor(), readRC()]);

  // A rule is picked on the plan: click a model or a room, get its four sides
  // plus (only when the builder can actually ramp onto it) its top.
  assert.match(ed, /data-mode="faces"/);
  assert.match(ed, /function pickTarget\(x, z\)/);
  assert.match(ed, /import \{ canRide, rideSpot \} from "\.\/track\.js"/);
  // ...and track.js exports exactly that, rather than the editor keeping its own
  // copy of the rule (which would drift the first time RIDE_MAX moved).
  const track = trackSource();
  assert.match(track, /export function canRide\(r, tops\)/);
  assert.match(track, /export function rideSpot\(r, tops\)/);

  // Smart, and measured against the same clearance the validator uses — plus an
  // indoors test, or a bed against an outside wall gets a pass laid in the garden.
  assert.match(ed, /function faceScore\(tg, face\)|export function faceScore/);
  assert.match(ed, /function indoors\(x, z\)[\s\S]*?pointInPoly/);
  assert.match(ed, /indoors\(x, z\) \? clearAt\(x, z, 0\.7\) : -60/);
  // The direction is the cheaper way round the loop — except for a ride, whose
  // entry face is the one the ramp is built on and so is not negotiable.
  assert.match(ed, /if \(!rule\.ride && pts\.length >= 2\)/);
  assert.match(ed, /if \(rule\.flip\) made\.reverse\(\)/);

  // The rule owns its points (a\.f) and only its points, so flipping re-lays
  // them and deleting takes exactly them away.
  assert.match(ed, /function stripRule\(pts, id\)[\s\S]*?a\.f !== id/);
  assert.match(ed, /p\.f = rule\.id/);
  // ...and a rule with no points left is not a rule any more.
  assert.match(ed, /export function faceRules\(\)[\s\S]*?live\[r\.id\]/);
  // Undo has to take the rule with the points: one history entry, both halves.
  assert.match(ed, /snap\.faces = \((?:ST\.)?D\.faces \|\| \[\]\)\.slice\(\)/);
  assert.match(ed, /export function restoreEntry\(entry\)/);
  // Every clone keeps the tags — history, presets and the write-through.
  assert.match(ed, /if \(a\.f\) out\.f = a\.f;[\s\S]*?if \(a\.ride\) out\.ride = true;/);

  // The builder must not spiral a ride point off the bed it was put on.
  assert.match(rc, /if \(a\.ride \|\| fin\(a\.y\)\) return Object\.assign\(\{\}, a\);/);
  assert.match(track, /function attachRides\(anchors, plats, tops\)/);
  assert.match(track, /roundTurnarounds\(attachRides\(anchors, plats, tops\)\)/);
});

test("the RC track editor judges a route against the walls before it is built", async () => {
  const ed = await readEditor();

  // A route is checked the way the road builder lays it, and the problems are
  // navigable and repairable instead of only discovered by crashing into them.
  assert.match(ed, /function validate\(\)/);
  assert.match(ed, /function revalidate\(\)/);
  assert.match(ed, /function gotoIssue\(\)/);
  assert.match(ed, /function autoFix\(\)/);
  assert.match(ed, /id="rcEdIssues"/);
  assert.match(ed, /id="rcEdFix"/);
  // Validation is a commit-time job — a moving handle must stay cheap.
  assert.match(ed, /if \(save !== false\) \{\s*\n\s*(?:ST\.)?E\.save\(\);\s*\n\s*revalidate\(\)/);
  // Snapping a dropped point clears the whole DECK, not just a 12cm car.
  assert.match(ed, /function roomySpot\(x, z, y\)[\s\S]*?halfRoad\(\) \+ 1\.5/);
  assert.match(ed, /var s = (?:ST\.)?D && (?:ST\.)?D\.noSnap \? null : roomySpot\(/);
  // Modifier snapping and two-finger pinch on the map.
  assert.match(ed, /function applySnap\(x, z, i, e\)/);
  assert.match(ed, /ANG_SNAP = Math\.PI \/ 12/);
  assert.match(ed, /D\.touches\.size >= 2/);
  assert.match(ed, /function startPinch\(\)[\s\S]*?D\.hist\.pop\(\)/);
  // A single point can carry its own height, and drop it again.
  assert.match(ed, /function setAnchorHeight\(i, y, live, auto\)/);
  assert.match(ed, /id="rcEdPointH"/);

  const { segClear, rectsClear } = await importEditorGeom();
  // A 10cm-thick wall along z=0 leaves 45cm of floor at z=50.
  const wall = [{ ax: -100, az: 0, bx: 100, bz: 0, half: 5 }];
  assert.equal(segClear(wall, 0, 50), 45);
  assert.ok(segClear(wall, 0, 2) < 0, "a point inside the wall reads negative");
  // A box only counts where it actually stands in the deck's way: an 8cm step
  // blocks a floor-level route, but the same box is nothing 90cm up.
  const box = [{ x0: 0, x1: 100, z0: 0, z1: 100, y0: 0, y1: 8 }];
  assert.equal(rectsClear(box, 50, 150, 0.7), 50);
  assert.ok(rectsClear(box, 50, 50, 0.7) < 0, "inside the box reads negative");
  assert.equal(rectsClear(box, 50, 50, 90), 1e6, "a flyover clears it entirely");
});

// ---------------------------------------------------------------------------
// Race structure: what happens around the flag, not on the way to it.
// ---------------------------------------------------------------------------

test("the player crossing the line does not end the race under the bots", async () => {
  const rc = await readRC();
  // The old code set state "done" and popped the results the instant the
  // player finished, so every rival's placing was extrapolated from progress.
  assert.doesNotMatch(rc, /showResults\(\);\s*\n\s*R\.race\.state = "done";/);
  assert.match(rc, /R\.race\.playerDone = now;/);
  // …and one place closes the race, on any of the three routes into it.
  assert.match(rc, /function finishRace\(now, skipped\)/);
  assert.match(rc, /if \(allDone\(\)\) finishRace\(now, false\)/);
  assert.match(rc, /waited > FINISH_GRACE_MS/);
  assert.match(rc, /finishRace\(performance\.now\(\), true\)/); // the skip button
  // a solo time trial has nobody to wait for
  assert.match(rc, /R\.race\.mode === "trial" \|\| allDone\(\)/);
});

test("RC lap timing keeps splits, a lap record and a running delta", async () => {
  const rc = await readRC();
  // Best lap is its own record, separate from the best total.
  assert.match(rc, /export function bestLapKey\(\)[\s\S]*?sig \+ "_lap"/);
  assert.match(rc, /export function saveBestLap\(ms\)/);
  assert.match(rc, /export function saveBestTime\(ms\)/);
  // The delta is measured at gates, which both laps are guaranteed to share —
  // not at fixed wall-clock offsets, which would compare different corners.
  assert.match(rc, /function recordSplit\(idx, now\)/);
  assert.match(rc, /race\.delta = tt - ref;/);
  assert.match(rc, /race\.bestSplits = race\.splits\.slice\(\);/);
  assert.match(rc, /lapTimes\.push\(Math\.round\(lapMs\)\)/);
  // lap 1 is timed from the flag, not from the first frame after it
  assert.match(rc, /R\.race\.lapT0 = R\.race\.t0;/);
});

test("pausing the RC race shifts absolute timers instead of expiring them", async () => {
  const rc = await readRC();
  assert.match(rc, /export function setPaused\(on\)/);
  // Every gameplay deadline is a performance.now() stamp: a 30s pause must not
  // expire every boost, wreck timer and item cooldown at once.
  assert.match(rc, /var PAUSE_STAMPS = \[[\s\S]*?"boostT"[\s\S]*?"deadT"[\s\S]*?\]/);
  assert.match(rc, /R\.race\.t0 \+= d;/);
  assert.match(rc, /shiftTimers\(d\);/);
  // and the sim itself stops
  assert.match(rc, /if \(R\.paused\) \{[\s\S]*?return true;/);
});

test("an elevated RC rescue lands on the road surface, not the gate's height", async () => {
  const rc = await readRC();
  // A gate stores the height of its own centre; on a spiral that is up to ~20cm
  // above the deck under (x,z), and dropping the truck there reads as another
  // fall off the circuit.
  assert.match(
    rc,
    /var sy = surfaceHeightNear\(R\.col && R\.col\.surface, spot\.x, spot\.z, at\.y, 40\);/,
  );
  assert.match(rc, /pc\.y = sy != null \? sy : at\.y;/);
});

test("RC difficulty drives skill, the rubber band and item aggression", async () => {
  const [rc, kart] = await Promise.all([readRC(), read("js/kart.js")]);
  assert.match(rc, /export const DIFFICULTY = \{[\s\S]*?easy:[\s\S]*?hard:[\s\S]*?\}/);
  // the band is no longer two hard-coded constants
  assert.doesNotMatch(rc, /maxv \*= prog < pprog \? 1\.08 : 0\.95;/);
  assert.match(rc, /maxv \*= prog < pprog \? band\.catchUp : band\.slowLead;/);
  assert.match(rc, /aiSkill: d\.skill \+ i \* d\.step/);
  // kart.js reads the aggression off the car, and still behaves as before when
  // the field is absent
  assert.match(kart, /var ag = car\.aiItems == null \? 1 : car\.aiItems;/);
  // ag <= 0 must never produce an Infinity/negative item cooldown
  assert.match(kart, /car\.aiItemT = now \+ \(ag > 0\.05 \? 260 \/ ag : 5200\);/);
});

test("the RC minimap colours elevation against the circuit's own floor", async () => {
  const mini = await read("js/rc_minimap.js");
  // A plan whose floor slab sits at y=162 (an upper storey) saturated every
  // sample into the top bucket when the ramp was measured from world zero.
  assert.doesNotMatch(mini, /p\.y \/ high/);
  assert.match(mini, /if \(C\[k\]\.y < lo\) lo = C\[k\]\.y;/);
  assert.match(mini, /\(p\.y - lo\) \/ span/);
  // the static layer is cached — a race must not redraw walls + road per frame
  assert.match(mini, /M\.base = document\.createElement\("canvas"\)/);
  assert.match(mini, /if \(M\.dirty\) \{\s*\n\s*paintBase\(\);/);
});

test("the RC ghost and peer trucks belong to the track they were set on", async () => {
  const [ghost, mp] = await Promise.all([read("js/rc_ghost.js"), read("js/rc_mp.js")]);
  // a ghost is keyed off the circuit signature, so a rebuilt track drops it
  assert.match(ghost, /function storeKey\(\)[\s\S]*?bestLapKey\(\)/);
  // …and it is a rendered memory: no physics, no collision, cloned materials
  assert.match(ghost, /c\.transparent = true;/);
  assert.match(ghost, /var c = m\.clone\(\);/);
  // a remote start for a different apartment is refused, not silently joined
  assert.match(mp, /if \(d\.sig && E\.planSig\(\) !== d\.sig\)/);
  // peers are ghosts: rc_mp never touches the local simulation
  assert.doesNotMatch(mp, /carPhysics|collideCircle|applyDamage/);
  // a Sprite's geometry is a three singleton — disposing it kills every sprite
  assert.match(mp, /if \(o\.isSprite\)/);
});

test("RC audio has continuous scrub and rumble voices plus a per-truck garage", async () => {
  const rc = await readRC();
  // one-shot beeps cannot express a held squeal or road noise
  assert.match(rc, /export function skidTick\(slip, speed\)/);
  assert.match(rc, /export function rumbleTick\(speed, kind\)/);
  assert.match(rc, /export function thud\(force\)/);
  assert.match(rc, /export function setVolume\(v\)/);
  // the engine is stepped through gears rather than swept linearly
  assert.match(rc, /var g = Math\.min\(GEARS - 1, Math\.floor\(ratio \* GEARS\)\);/);
  // a setup belongs to the truck it was dialled for
  assert.match(rc, /export function tuneStore\(\)[\s\S]*?R\.tunes\[tuneKey\(\)\]/);
  assert.match(rc, /export function bankAdd\(n\)/);
});

test("RC race craft drafts, passes, looks back and shows live rival gaps", async () => {
  const [rc, css, i18n] = await Promise.all([
    readRC(),
    stylesSource(),
    readI18nSource(),
  ]);
  // Sitting in a rival's wake is extra top speed, not just a visual.
  assert.match(rc, /DRAFT_MULT = 0\.14/);
  assert.match(rc, /function draftFactor\(car\)/);
  assert.match(rc, /maxv \*= 1 \+ DRAFT_MULT \* draft/);
  // Bots steer analog and hold a private line so they can actually pass.
  assert.match(rc, /aiLane: \(\(i % 3\) - 1\) \* 5\.4/);
  assert.match(rc, /input\.steerAxis = -clamp\(steer, -1, 1\)/);
  assert.match(rc, /car\.passSide = odx \* ofz - odz \* ofx >= 0 \? 1 : -1/);
  // A rear tap that isn't a slam is a bump-draft.
  assert.match(rc, /b\.v \+= rel \* 0\.12/);
  // Look-back is a hold (V / B / on-screen), not another camera mode.
  assert.match(rc, /R\.keys\.look = true/);
  assert.match(rc, /out\.look = out\.look \|\| padButton\(pad, 1\)/);
  assert.match(rc, /carCam\(pc, dt, now, !!\(pInput\.look \|\| R\.touch\.look\)\)/);
  assert.match(rc, /data-hold="look"/);
  // Race presentation: start gantry, sector chip, rival interval, wrong-way.
  assert.match(rc, /function updateStartLights\(left\)/);
  assert.match(rc, /function pathPos\(car\)/);
  assert.match(rc, /function updateGaps\(pc\)/);
  assert.match(rc, /function updateWrongWay\(pc\)/);
  assert.match(rc, /updateSplitsHud\(idx\)/);
  assert.match(css, /#rcLights/);
  assert.match(css, /#rcGap/);
  assert.match(css, /#rcWarn/);
  assert.match(css, /#rcSplits\.on/);
  assert.match(i18n, /rc_wrong_way: "WRONG WAY"/);
  assert.match(i18n, /rc_look: "Look back"/);
  assert.match(i18n, /V=look back/);
  // Position stays on even with items off — placing is not a kart pickup.
  assert.match(rc, /R\.hud\.pos\.classList\.toggle\("on", racing\)/);

  // The slipstream cone: dead ahead and close is a full draft; beside or
  // behind the other truck is none. Same numbers the game uses.
  const DRAFT_DIST = 22;
  const draftAt = (dx, dz) => {
    const d = Math.hypot(dx, dz);
    if (d < 3.6 || d > DRAFT_DIST) return 0;
    const along = dz / d; // heading 0 looks down +Z
    if (along < 0.72) return 0;
    return (1 - (d - 3.6) / (DRAFT_DIST - 3.6)) * along;
  };
  assert.ok(draftAt(0, 10) > 0.5, "a truck 10cm ahead is in the wake");
  assert.equal(draftAt(0, -10), 0, "a truck behind is not a draft");
  assert.equal(draftAt(18, 2), 0, "a truck beside is not a draft");
  assert.ok(draftAt(0, 6) > draftAt(0, 18), "closer ahead drafts harder");
});

// ---------------------------------------------------------------------------
// QA round: bugs found by playing the game in a real browser, pinned here.
// ---------------------------------------------------------------------------

test("the results camera never outlives the results screen", async () => {
  const rc = await readRC();
  // finishRace parks the view on an orbit of the winner (R.cam.results). Two
  // paths used to leave it set forever: dismissing the sheet with Escape, and
  // quitting the mode from the results screen. Both froze the chase camera
  // and — because footStep was nested under the camera branch — the on-foot
  // figure too.
  assert.match(
    rc,
    /R\.hud\.results\.classList\.remove\("on"\);\s*\n\s*\/\/[^]*?R\.cam\.results = null;/,
    "Escape on the results sheet must drop the orbit camera",
  );
  assert.match(rc, /R\.race = null;\s*\n\s*R\.cam\.results = null;/, "toggleRC(false) clears it");
  // On-foot movement is simulation: it runs beside the camera selection, not
  // inside the branch that picks which camera owns the frame.
  assert.match(rc, /if \(R\.phase === "foot" && R\.fig\) footStep\(dt, pInput\);\s*\n\s*\/\/ player view/);
  assert.match(rc, /\/\/ player view[\s\S]*?else if \(R\.phase === "foot" && R\.fig\) \{\s*\n\s*R\.fig\.camYaw/);
  assert.doesNotMatch(rc, /else if \(R\.phase === "foot" && R\.fig\) \{\s*\n\s*footStep/);
});

test("room requirements and the RC race no longer share one i18n key", async () => {
  const [i18n, html] = await Promise.all([readI18nSource(), read("index.html")]);
  // rc_title was defined twice per locale; the second definition ("RC Truck
  // Race") won, so the planner's constraints panel announced itself as a race.
  assert.match(i18n, /rcon_title: "דרישות חדר"/);
  assert.match(i18n, /rcon_title: "Room requirements"/);
  assert.match(html, /data-i18n="rcon_title"/);
  assert.equal((i18n.match(/\brc_title:/g) || []).length, 2, "rc_title = the race, once per locale");
});

test("the editor ghost line updates its buffer in place", async () => {
  const ed = await readEditor();
  // The old code disposed the ghost line's geometry and built a fresh one on
  // every edit — under WebGPU that destroyed buffers mid-submit and flooded
  // the console with GPUValidationError once per frame.
  assert.match(ed, /attr\.needsUpdate = true;\s*\n\s*gm\.setDrawRange\(0, pts\.length\);/);
  assert.doesNotMatch(ed, /ST\.D\.ghost\.geometry = gm;/);
  // a bigger route still grows the buffer — but only then
  assert.match(ed, /if \(!attr \|\| attr\.count < pts\.length\)/);
});

test("rival gaps stay readable when the player is stationary", async () => {
  const rc = await readRC();
  // gap = distance / max(22, |v|): a parked truck used to read "166.69" for a
  // rival one corner ahead. Capped, and one decimal like any timing tower.
  assert.match(rc, /s > 99\.9 \? "99\.9\+" : s\.toFixed\(1\)/);
  assert.doesNotMatch(rc, /Math\.abs\(aPos - me\) \/ spd\)\.toFixed\(2\)/);
});

test("a race the player cannot finish still offers an ending", async () => {
  const [rc, i18n] = await Promise.all([readRC(), readI18nSource()]);
  // Only the player crossing the line armed the finish grace: if every rival
  // was home and the player was stuck, the race could never end.
  assert.match(rc, /rc_field_done/);
  assert.match(rc, /if \(aiGone && lastAi && now - R\.race\.t0 - lastAi > FINISH_GRACE_MS\)/);
  assert.match(i18n, /rc_field_done: "כל היריבים סיימו — דלג לתוצאות"/);
  assert.match(i18n, /rc_field_done: "Field's home — skip to results"/);
});

test("a wedged truck is told about the rescue key", async () => {
  const [rc, i18n] = await Promise.all([readRC(), readI18nSource()]);
  assert.match(rc, /function updateStuckHint\(pc, input, now\)/);
  assert.match(rc, /updateStuckHint\(pc, pInput, now\);/);
  assert.match(i18n, /rc_stuck: "🔧 תקוע\? הקש R לחילוץ"/);
  assert.match(i18n, /rc_stuck: "🔧 Stuck\? Press R to rescue"/);
});

test("RC mode has a top-level keyboard shortcut like walk and photo", async () => {
  const [ui, html, i18n] = await Promise.all([
    moduleSource("js/ui.js"), read("index.html"), readI18nSource(),
  ]);
  assert.match(ui, /e\.key === "c" \|\| e\.key === "C"[\s\S]*?runAction\("rc"\)/);
  assert.match(ui, /\["C", "k_rc"\]/);
  assert.match(html, /<button data-act="rc" role="menuitem">[\s\S]*?<kbd class="menu-kbd">C<\/kbd>/);
  assert.match(i18n, /k_rc: "מרוץ משאיות RC"/);
  assert.match(i18n, /k_rc: "RC truck race"/);
});

test("waypoint checks survive an empty or rebuilt track", async () => {
  const rc = await readRC();
  // checkWaypoints dereferenced R.track.wps[car.next] unguarded — a track
  // rebuilt mid-race (or one with no gates) threw inside the physics loop.
  assert.match(rc, /var wps = R\.track && R\.track\.wps;\s*\n\s*if \(!wps \|\| !wps\.length \|\| !wps\[car\.next\]\) return;/);
});

test("one step-height constant drives physics, road builder and editor", async () => {
  const [surface, track, rc, edState] = await Promise.all([
    read("js/road_surface.js"), trackSource(), readRC(), read("js/rc_editor_state.js"),
  ]);
  assert.match(surface, /export const STEP_UP = 2\.2;/);
  // track.js is split: course_plan.js and routes.js (the pieces that use it) import it
  for (const f of ["js/track/course_plan.js", "js/track/routes.js"]) {
    assert.match(await read(f), /import \{ STEP_UP \} from "\.\.\/road_surface\.js";/);
  }
  assert.doesNotMatch(track, /STEP_UP = 2\.2,/, "track.js keeps no private copy");
  assert.match(rc, /export const STEP_H = STEP_UP;/);
  assert.match(edState, /export const STEP_UP = SHARED_STEP_UP;/);
  // …and the value itself still feeds the physics the tests above measure
  const helper = await import(new URL("../js/road_surface.js", import.meta.url));
  assert.equal(helper.STEP_UP, 2.2);
});

test("hot-loop sampling reuses caller scratch instead of allocating", async () => {
  const [rc, surface] = await Promise.all([readRC(), read("js/road_surface.js")]);
  assert.match(surface, /export function surfaceSampleAt\(tris, x, z, y, step, out\)/);
  assert.match(rc, /car\.sampScratch \|\| \(car\.sampScratch = \{ height: 0, normal: null \}\)/);
  // the per-frame sort-copy and per-substep point allocations are gone too
  // (showResults sorting once per race is fine and stays)
  assert.match(rc, /var placeScratch = \[\]/);
  assert.match(
    rc,
    /placeScratch\.length = 0;\s*\n\s*for \(var i = 0; i < R\.cars\.length; i\+\+\) placeScratch\.push\(R\.cars\[i\]\);/,
  );
  assert.match(rc, /var moveScratch = \{ x: 0, z: 0 \};/);

  // …and the out-param returns identical geometry to the allocating call
  const helper = await import(new URL("../js/road_surface.js", import.meta.url));
  const tris = [
    { ax: 0, ay: 2, az: 0, bx: 10, by: 4, bz: 0, cx: 10, cy: 8, cz: 10, minx: 0, maxx: 10, minz: 0, maxz: 10 },
  ];
  const fresh = helper.surfaceSampleAt(tris, 4, 2, 3, 2.2);
  const scratch = { height: 0, normal: null };
  const reused = helper.surfaceSampleAt(tris, 4, 2, 3, 2.2, scratch);
  assert.equal(reused, scratch, "out object is returned, not copied");
  assert.equal(reused.height, fresh.height);
  assert.deepEqual(reused.normal, fresh.normal);
  assert.equal(helper.surfaceSampleAt(tris, 99, 99, 0, 2.2, scratch), null, "a miss stays null even with scratch");
});

test("spray droplets share geometry and material", async () => {
  const rc = await readRC();
  // A droplet used to be its own SphereGeometry + MeshBasicMaterial, disposed
  // per particle: a puddle spent more time allocating than driving.
  assert.match(rc, /new THREE\.Mesh\(sprayGeo, sprayMat\)/);
  assert.match(rc, /s\.m\.scale\.setScalar\(s\.r \* Math\.max\(0\.05, 1 - age \* 1\.4\)\)/);
  const sprayDeath = /if \(age > 0\.7 \|\| s\.m\.position\.y < 0\) \{\s*\n\s*scene\.remove\(s\.m\);/;
  assert.match(rc, sprayDeath);
  // quitting the mode must not dispose the shared resources per droplet
  assert.match(rc, /R\.spray\.forEach\(function \(s\) \{\s*\n\s*scene\.remove\(s\.m\);/);
});

test("teardown never disposes a Sprite's shared singleton geometry", async () => {
  const [ed, rc, ghost, mp] = await Promise.all([
    readEditor(), readRC(), read("js/rc_ghost.js"), read("js/rc_mp.js"),
  ]);
  // A Sprite's geometry is a module-level singleton inside three — disposing it
  // in a bulk traverse takes out every sprite in the app (car halos, item FX),
  // and the WebGPU renderer then errors once per frame on the destroyed buffer.
  // kart.js and rc_mp.js already guard; the editor's clear3d/sync3d, the
  // track's disposeGrp and the ghost teardown were missing the guard.
  assert.match(ed, /function disposeNode\(o\) \{\s*\n\s*if \(o\.geometry && !o\.isSprite\) o\.geometry\.dispose\(\);/);
  assert.match(ed, /ST\.D\.grp\.traverse\(disposeNode\)/);
  assert.match(ed, /h\.traverse\(disposeNode\)/);
  assert.match(rc, /if \(o\.geometry && o\.geometry\.dispose && !o\.isSprite\) o\.geometry\.dispose\(\);/);
  assert.match(ghost, /if \(o\.geometry && o\.geometry\.dispose && !o\.isSprite\) o\.geometry\.dispose\(\);/);
  assert.match(mp, /if \(o\.isSprite\)/); // the original guard, still present
});

test("the editor map's deferred paint dies with the editor", async () => {
  const [ed, map] = await Promise.all([readEditor(), read("js/rc_editor_map.js")]);
  // draw() schedules a rAF; closing the editor before it fired threw
  // "Cannot set properties of null (setting 'drawReq')" once per close.
  assert.match(map, /var D = ST\.D;\s*\n\s*D\.drawReq = requestAnimationFrame/);
  assert.match(map, /if \(ST\.D !== D\) return;/);
  assert.match(ed, /if \(ST\.D\.drawReq\) cancelAnimationFrame\(ST\.D\.drawReq\);/);
});
