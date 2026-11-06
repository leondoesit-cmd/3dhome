import { moduleSource } from "./helpers/module_source.mjs";
import { stylesSource } from "./helpers/styles_source.mjs";
import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripComments } from "./source.mjs";

const game = moduleSource("js/zombies_game.js");
const world = moduleSource("js/zombies_world.js");
const tex = await readFile(new URL("../js/zombies_tex.js", import.meta.url), "utf8");
const destruct = await readFile(new URL("../js/zombies_destruct.js", import.meta.url), "utf8");
const physicsDamage = await readFile(new URL("../js/physics/damage.js", import.meta.url), "utf8");
const i18n = await readI18nSource();
const css = stylesSource();

test("texture resolution budgets are reduced by 50% for lower memory footprint", () => {
  assert.match(tex, /var BUDGET = 512;/);
  assert.match(tex, /quality >= 2 \? 512 : quality >= 1 \? 384 : 256/);
  assert.match(tex, /128/);
});

test("physics destruction supports 3 modes: none, parts-only without slicing, and full fracture", () => {
  assert.match(physicsDamage, /ctx\.destructionMode === "none"/);
  assert.match(physicsDamage, /const allowFracture = ctx\.destructionMode !== "parts";/);
  assert.match(destruct, /function setGameDestructionMode\(mode\)/);
  assert.match(destruct, /setDestructionMode/);
  assert.match(game, /#zDestructSlider/);
  assert.match(game, /setGameDestructionMode/);
});

test("Night Shift includes Titan boss on wave milestones with dedicated boss health bar", () => {
  assert.match(world, /titan:\s*\{/);
  assert.match(world, /boss:\s*true/);
  assert.match(game, /spawnZed\("titan"/);
  assert.match(game, /Z\.boss\s*=/);
  assert.match(css, /#zBossBar/);
  assert.match(i18n, /z_boss_titan:/);
});

test("barricade mechanics allow boarding up doorways with interact E and zombie destruction", () => {
  assert.match(game, /function buildBarricadeAt\(/);
  assert.match(game, /function getNearestDoorSeg\(/);
  assert.match(world, /if \(Z\.barricades && Z\.barricades\.length && zd\.alerted\)/);
  assert.match(i18n, /z_barricaded:/);
  assert.match(i18n, /z_prompt_barricade:/);
});

test("perk vending stations provide Speed Cola, Juggernaut, and Double Tap buffs", () => {
  assert.match(game, /function spawnPerkStations\(/);
  assert.match(game, /function buyPerk\(/);
  assert.match(game, /Z\.perks\.speed/);
  assert.match(game, /Z\.perks\.damage/);
  assert.match(game, /Z\.perks\.jugg/);
  assert.match(css, /#zPerkBadges/);
  assert.match(i18n, /z_perk_speed:/);
  assert.match(i18n, /z_perk_jugg:/);
  assert.match(i18n, /z_perk_damage:/);
});

test("power grid failure blackout events allow interactive fuse box restoration", () => {
  assert.match(game, /function triggerBlackout\(/);
  assert.match(game, /function restorePower\(/);
  assert.match(game, /function spawnFuseBox\(/);
  assert.match(world, /if \(Z\.blackout\) \{\s*Z\.lamps\.forEach/);
  assert.match(i18n, /z_power_restored:/);
  assert.match(i18n, /z_prompt_fusebox:/);
});

test("tactical radar renders player arrow, zombie threats, and barricade blips", () => {
  assert.match(game, /function initRadar\(/);
  assert.match(game, /function stepRadar\(/);
  assert.match(css, /#zRadarWrap/);
  assert.match(css, /#zRadar/);
});

test("procedural WebAudio synthesizers exist for thunder, power, hammer, and perk sounds", () => {
  assert.match(game, /function sndHammer\(/);
  assert.match(game, /function sndPower\(/);
  assert.match(game, /function sndThunder\(/);
  assert.match(game, /function sndPerk\(/);
});

test("Night Shift hides leftover planner chrome over the game HUD", () => {
  assert.match(css, /body\.zombies-on #floor-tabs/);
  assert.match(css, /body\.zombies-on #edit3dBtn/);
  assert.match(css, /body\.zombies-on #view-3d \.view-edit-btn/);
});

test("death screen clears the interact prompt instead of leaving a perk buy hint", () => {
  assert.match(game, /P\.dead = true;\s*P\.deadT = 0;\s*Z\.interactPrompt = "";/);
  assert.match(game, /var prompt = P\.dead \? "" : \(Z\.interactPrompt \|\| ""\)/);
  assert.match(game, /Z\.hud\.root\.classList\.remove\("on", "z-lite", "distracted"/);
});

test("wave spawns stay off the player in a small house", () => {
  assert.match(game, /var MIN_SPAWN_DIST = 180/);
  assert.match(game, /w\.nx \* 180/);
  assert.match(game, /function houseAliveCap\(/);
  assert.match(game, /houseAliveCap\(\)/);
  assert.match(game, /spawnT: n <= 1 \? 2\.8 : 0/);
  assert.match(game, /function spawnInsideHouse\(/);
});

test("Fast quality keeps a usable night grade and starts with the flashlight on", () => {
  assert.match(world, /var lampCap = nsQuality\(\) >= 2 \? 8 : nsQuality\(\) >= 1 \? 3 : 2/);
  assert.match(world, /ren\.toneMappingExposure = q === 0 \? 0\.62 : 0\.48/);
  assert.match(world, /var fillI = quality === 0 \? 1\.15 : 0\.55/);
  assert.match(game, /Z\.flash\.batt = 100;\s*Z\.flash\.on = true;/);
});

test("wave objectives come from real rooms, doors, and the fuse box", () => {
  assert.match(game, /function makeWaveObjective\(n, event\)/);
  assert.match(game, /var rm = farthestRoom\(\), b = interiorBounds\(\)/);
  assert.match(game, /Z\.col\.doorSegs\.length/);
  assert.match(game, /kind: "power", x: Z\.fuseBox\.x/);
  assert.match(game, /function placeNavMarker\(/);
  assert.match(game, /z_objective_complete/);
});

test("encounter director creates lulls and peaks and reacts to player capability", () => {
  assert.match(game, /function updateDirector\(dt, live\)/);
  assert.match(game, /D\.phase === "lull"/);
  assert.match(game, /D\.phase === "peak"/);
  assert.match(game, /D\.capability = clamp/);
  assert.match(game, /phaseScale = Z\.director\.phase === "lull"/);
});

test("specialists are readable and screamers call real reinforcements", () => {
  assert.match(game, /function directedType\(Wv\)/);
  assert.match(game, /candidate === "brute" \|\| candidate === "bloater" \|\| candidate === "screamer"/);
  assert.match(world, /hooks\.onScreamerCall && hooks\.onScreamerCall\(zd\)/);
  assert.match(game, /Z\.wave\.pending = Math\.min\(Z\.wave\.total \+ 4, Z\.wave\.pending \+ 3\)/);
  assert.match(i18n, /z_screamer_reinforcements:/);
});

test("intermission makes score a one-choice tactical resource", () => {
  assert.match(game, /var INTERMISSION_OFFERS =/);
  assert.match(game, /function buyIntermission\(kind\)/);
  assert.match(game, /Z\.intermission\.chosen = true/);
  assert.match(game, /data-buy="ammo"/);
  assert.match(css, /#zIntermission/);
});

test("runs end with pressured extraction and a victory summary", () => {
  assert.match(game, /if \(Wv\.n >= RUN_WAVES\)/);
  assert.match(game, /function beginExtraction\(\)/);
  assert.match(game, /function stepExtraction\(dt\)/);
  assert.match(game, /function finishRun\(\)/);
  assert.match(game, /id="zVictory"/);
  assert.match(i18n, /z_victory: "EXTRACTED"/);
});

test("mobile play gets soft visible-target aim and larger interaction radii", () => {
  assert.match(game, /function stepMobileAimAssist\(dt\)/);
  assert.match(game, /!losClear\(P\.x, P\.z, zd\.x, zd\.z\)/);
  assert.match(game, /Math\.abs\(yawErr\) > 0\.16/);
  assert.match(game, /Z\.touchMode \? 135 : 95/);
  assert.match(game, /Z\.touchMode \? 82 : 58/);
});

test("hitscan supplies a camera before Three.js evaluates scene sprites", () => {
  // read as code: the camera has to be set before the raycast, whether or not
  // the line comment that explains why is still sitting between the two
  assert.match(stripComments(game), /_rc\.set\(origin, dir\);[\s\S]*?_rc\.camera = getMainCamera\(\);/);
});
