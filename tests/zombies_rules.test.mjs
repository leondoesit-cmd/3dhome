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
