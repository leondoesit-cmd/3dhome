import { sourceFunctionText } from "./helpers/source_function.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { awardRunPoints, encounterCap, securedCount, reachableFloor, cameraPose } from '../js/zombies_rules.js';

test('spending credits never reduces earned score, later rewards update both', () => {
  const state = { score: 0, credits: 0 };
  awardRunPoints(state, 500);
  state.credits -= 300;
  awardRunPoints(state, 125);
  assert.deepEqual(state, { score: 625, credits: 325 });
});
test('every director phase respects small houses and the chosen hard cap', () => {
  for (const phase of ['build', 'lull', 'peak']) {
    assert.ok(encounterCap(8, 2, phase) <= 2);
    assert.ok(encounterCap(8, 16, phase) <= 8);
    assert.ok(encounterCap(16, 1, phase) >= 1);
  }
});
test('existing barricades count; damaged ones require repair, destroyed ones do not count', () => {
  const targets = [{x:0,z:0},{x:100,z:0}];
  const bars = [{mx:0,mz:0,hp:220,maxHp:220},{mx:100,mz:0,hp:50,maxHp:220}];
  assert.equal(securedCount(targets,bars),1);
  bars[1].hp=220;
  assert.equal(securedCount(targets,bars),2);
  bars.pop();
  assert.equal(securedCount(targets,bars),1);
});
test('reachable objectives cannot jump thin walls or enter disconnected rooms', () => {
  const points = reachableFloor({x:0,z:0},{minx:-80,maxx:160,minz:-80,maxz:80},
    (x) => x >= 15 && x <= 25, () => true);
  assert.ok(points.length > 1);
  assert.ok(points.every(p => p.x < 15));
});
test('navigation follows an actual doorway and records walk distance', () => {
  const points = reachableFloor({x:0,z:0},{minx:-80,maxx:160,minz:-80,maxz:120},
    (x,z) => x >= 15 && x <= 25 && z < 60, () => true);
  const end = points.find(p => p.x === 120 && p.z === 0);
  assert.ok(end);
  assert.ok(end.distance > 120);
});
test('camera motion is bounded, frame-rate independent, and comfort controls work', () => {
  const p = {crouch:true,aim:false,sprint:false,speedK:1,bob:1,lookDX:500};
  const settings = {bodycam:true,bob:0,shake:0,fov:82};
  const a={height:145}, b={height:145};
  for(let i=0;i<30;i++) cameraPose(p,settings,a,1/30);
  for(let i=0;i<120;i++) cameraPose(p,settings,b,1/120);
  assert.ok(Math.abs(a.height-b.height)<1e-9);
  const pose=cameraPose(p,settings,{},1/60);
  assert.equal(pose.height,104); assert.equal(pose.roll,0); assert.equal(pose.pitch,0);
  assert.equal(pose.fov,82);
  p.aim=true;
  assert.equal(cameraPose(p,settings,{},1/60).fov,68);
});

// Execute the actual gameplay boundaries with minimal world/audio adapters.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const gameSource = moduleSource("js/zombies_game.js");
function gameFunction(name, context) {
  const source = sourceFunctionText(gameSource, name);
  return vm.runInNewContext('(' + source.trim() + ')', context);
}
test('normal spawn locks stronger weapons with no hidden ammunition; sandbox unlocks them', () => {
  let sandbox = false;
  const context = { interiorBounds:()=>null, liveRooms:()=>[], freeSpot:(x,z)=>({x,z}), P_RAD:24, MAX_HP:100,
    gameSettings:()=>({sandbox}), W_ORDER:['knife','pistol','shotgun'],
    W:{knife:{melee:true},pistol:{mag:12,reserve:72},shotgun:{mag:8,reserve:24}} };
  const spawn = gameFunction('newPlayer', context);
  const p = spawn();
  assert.equal(p.owned.knife,true); assert.equal(p.owned.pistol,true);
  assert.equal(p.owned.shotgun,false); assert.equal(p.ammo.shotgun,0); assert.equal(p.reserve.shotgun,0);
  sandbox=true;
  const dev=spawn(); assert.equal(dev.owned.shotgun,true); assert.equal(dev.ammo.shotgun,8);
});
test('supply purchase spends credits once and does not award ammunition for locked guns', () => {
  const Z = {score:900,credits:350,wave:{state:'rest'},intermission:{chosen:false},
    p:{owned:{pistol:true},reserve:{pistol:0},frags:0},flash:{batt:0}};
  const buy=gameFunction('buyIntermission',{
    Z, INTERMISSION_OFFERS:{ammo:{cost:300}}, W_ORDER:['pistol','shotgun'], W:{pistol:{mag:12},shotgun:{mag:8}},
    FRAG:{maxCarry:6}, sndPerk(){},flashScreen(){},say(){},t:k=>k,hudDirty(){}
  });
  buy('ammo'); buy('ammo');
  assert.equal(Z.score,900); assert.equal(Z.credits,50); assert.equal(Z.p.reserve.pistol,36);
  assert.equal(Z.p.reserve.shotgun,undefined); assert.equal(Z.p.frags,2);
});

// ---- navigation flow field -------------------------------------------------
import { navGrid, navFillRows, navFlow, navStep, navLink } from '../js/zombies_rules.js';

function walk(grid, dist, from, max = 200) {
  let p = { ...from }; const path = [p];
  for (let i = 0; i < max; i++) {
    const s = navStep(grid, dist, p.x, p.z, 1);
    if (!s) break;
    if (s.link) { p = { x: s.x, z: s.z, via: s.link }; path.push(p); continue; }
    p = { x: s.x, z: s.z }; path.push(p);
  }
  return path;
}

test('zombies route round a wall through the doorway instead of pressing into it', () => {
  // wall along x=100 with a doorway at z 150..230
  const blocked = (x, z) => x >= 75 && x <= 125 && !(z >= 150 && z <= 230);
  const g = navGrid({ minx: 0, maxx: 300, minz: 0, maxz: 300 }, 20, 0);
  while (!navFillRows(g, blocked, 3));
  const dist = navFlow(g, 260, 20);
  const path = walk(g, dist, { x: 20, z: 20 });
  const end = path[path.length - 1];
  assert.ok(Math.hypot(end.x - 260, end.z - 20) < 21, 'reaches the player');
  assert.ok(path.every(p => !blocked(p.x, p.z)), 'never steps into the wall');
  assert.ok(path.some(p => p.x >= 75 && p.x <= 125), 'crosses at the doorway');
});

test('a sealed room is unreachable on foot, but a window link lets them climb in', () => {
  // closed box x,z in [100,200] (walls 10 thick) — player inside, zombie outside
  const blocked = (x, z) => {
    const inX = x >= 85 && x <= 215, inZ = z >= 85 && z <= 215;
    const core = x > 115 && x < 185 && z > 115 && z < 185;
    return inX && inZ && !core;
  };
  const g = navGrid({ minx: 0, maxx: 300, minz: 0, maxz: 300 }, 20, 0);
  while (!navFillRows(g, blocked, 3));
  let dist = navFlow(g, 150, 150);
  assert.equal(navStep(g, dist, 20, 20, 2), null, 'no path without a way in');
  assert.ok(navLink(g, 150, 60, 150, 140, 6, { ox: 150, oz: 140 }));
  dist = navFlow(g, 150, 150);
  const path = walk(g, dist, { x: 20, z: 20 });
  assert.ok(path.some(p => p.via), 'climbs through the window');
  const end = path[path.length - 1];
  assert.ok(Math.hypot(end.x - 150, end.z - 150) < 21, 'reaches the player inside');
});

test('a window costs more than a short walk round to an open door', () => {
  // wall x=100 with a doorway near the zombie's row; a window right in front
  const blocked = (x, z) => x >= 75 && x <= 125 && !(z >= 0 && z <= 60);
  const g = navGrid({ minx: 0, maxx: 300, minz: 0, maxz: 300 }, 20, 0);
  while (!navFillRows(g, blocked, 3));
  navLink(g, 60, 120, 140, 120, 6, { ox: 140, oz: 120 });
  const dist = navFlow(g, 260, 40);
  const path = walk(g, dist, { x: 40, z: 60 });
  assert.ok(!path.some(p => p.via), 'takes the door, not the window');
});

test('stepZed steers through the shared navigation piece and plays window climbs', () => {
  const zed = sourceFunctionText(moduleSource('js/zombies_world.js'), 'stepZed');
  assert.match(zed, /steerZed\(zd, tx, tz, dt\)/);
  assert.match(zed, /stepVault\(zd, dt\)/);
  const input = sourceFunctionText(moduleSource('js/zombies_game.js'), 'tick');
  assert.match(input, /stepNav\(dt\);\s*forEachPhysicsStep/);
});
