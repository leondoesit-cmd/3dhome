/* Night Shift weapons, frags and blasts, view model and pickups, split out of
   js/zombies_game.js. It shares the editor's state through live imports from
   ../zombies_game.js. */
import * as THREE from "three";
import { legacyIntensity } from "../gpu.js";
import { t } from "../i18n.js";
import { clamp } from "../state.js";
import { getDynGroup, getMainCamera, getMainScene } from "../view3d.js";
import { damageWorld, destructReady, explodeWorld } from "../zombies_destruct.js";
import { sndBlast, sndClick, sndFlame, sndImpact, sndPickup, sndReload, sndShot, sndWhoosh } from "../zombies_game/audio.js";
import { flashScreen, hudDirty, hurtPlayer, say } from "../zombies_game/hud.js";
import { awardRunPoints } from "../zombies_rules.js";
import { EYE, GRAV, MAX_ARMOR, MAX_HP, Z, pick, rnd, rr } from "../zombies_state.js";
import { boneBurst, damageZed, decal, dustBurst, freeSpot, groundAt, igniteZed, impactMark, liveRooms, losClear, makeNoise, moveCircle, severPart, shake, sparkBurst, spawnFirePart, spawnPart, tracer } from "../zombies_world.js";
import {
  FRAG, W, W_ORDER, W_UNLOCK, _camDir, _movePoint2D, _rc, _tmpIdx, _tmpVecs,
  _v0, _v1, buildViewModel, gameSettings, set__tmpIdx, vm, vmCache,
} from "../zombies_game.js";

function setWeapon(key) {
  var P = Z.p;
  if (!P || P.weapon === key || !P.owned[key]) return;
  P.weapon = key;
  P.reloading = 0;
  P.swing = 0;
  P.nextShot = 0;
  var cam = getMainCamera();
  if (Z.view) Z.view.visible = false;
  if (!vmCache[key]) {
    vmCache[key] = buildViewModel(key);
    cam.add(vmCache[key]);
  }
  Z.view = vmCache[key];
  Z.view.visible = true;
  Z.view.position.set(11, -9.5, -17);
  Z.view.rotation.set(0, 0, 0);
  sndClick();
  say(t(W[key].key), 0.9);
  hudDirty();
}
function cycleWeapon(dir) {
  var P = Z.p,
    have = W_ORDER.filter(function (k) {
      return P.owned[k];
    });
  var i = have.indexOf(P.weapon);
  setWeapon(have[(i + dir + have.length) % have.length]);
}

function tmpVec(x, y, z) {
  var v = _tmpVecs[_tmpIdx];
  set__tmpIdx((_tmpIdx + 1) % _tmpVecs.length);
  return v.set(x || 0, y || 0, z || 0);
}
// Reset pool index at the start of each fire/melee function so inner loops
// never wrap around and overwrite a vector a surrounding scope still needs.
function tmpReset() { set__tmpIdx(0); }

function camDir(spread) {
  var cam = getMainCamera();
  cam.getWorldDirection(_camDir);
  if (spread) {
    _camDir.x += rr(-spread, spread);
    _camDir.y += rr(-spread, spread);
    _camDir.z += rr(-spread, spread);
    _camDir.normalize();
  }
  return _camDir;
}

// resolve which body part a mesh belongs to (head = big damage, limbs = gore)
function partOf(obj) {
  var p = obj;
  while (p) {
    if (p.userData && p.userData.part) return p.userData.part;
    p = p.parent;
  }
  return "body";
}
function zedOf(obj) {
  var p = obj;
  while (p) {
    if (p.userData && p.userData.zed && p.userData.zed !== true) return p.userData.zed;
    p = p.parent;
  }
  return null;
}

function isViewOrPlayerObject(obj) {
  var cam = getMainCamera();
  var o = obj;
  while (o) {
    if (o === cam || o === Z.view) return true;
    if (o.userData && (o.userData.gib || o.userData.noHit || o.userData.isView || o.userData.pickup)) return true;
    o = o.parent;
  }
  return false;
}

function hitscan(origin, dir, range) {
  _rc.set(origin, dir);
  // Three.js sprites (planner labels, pickup-like helpers) need the active
  // camera during raycasting. Without it, a shot crossing one throws inside
  // Sprite.raycast before our normal no-hit filtering can run.
  _rc.camera = getMainCamera();
  _rc.far = range || 6000;
  var dyn = getDynGroup();
  var list = [];
  var ms = getMainScene();
  if (ms) list.push(ms);
  else {
    if (Z.grp) list.push(Z.grp);
    if (dyn) list.push(dyn);
  }
  var hits = _rc.intersectObjects(list, true);
  for (var i = 0; i < hits.length; i++) {
    var h = hits[i];
    if (!h.object.visible) continue;
    if (isViewOrPlayerObject(h.object)) continue;
    // skip flying severed parts / gore chunks
    if (h.object.userData && h.object.userData.gib) continue;
    var mat = h.object.material;
    if (mat && mat.blending === THREE.AdditiveBlending) continue; // fx/beams
    if (h.object.isPoints || h.object.isLine) continue;
    var zd = zedOf(h.object);
    if (zd && zd.dead) continue;
    return {
      point: h.point,
      dist: h.distance,
      zed: zd,
      obj: h.object,
      normal:
        h.face && h.object.matrixWorld
          ? h.face.normal.clone().transformDirection(h.object.matrixWorld)
          : new THREE.Vector3(0, 1, 0),
    };
  }
  return null;
}

// Destruction is an enhancement to combat, not a requirement for it. The
// physics scene can be rebuilt asynchronously while a shot is in flight, so
// keep a stale physics mesh from taking the entire game loop down with it.
function damageWorldSafely(origin, dir, kind) {
  if (!destructReady()) return false;
  try {
    return damageWorld(origin, dir, kind);
  } catch (e) {
    return false;
  }
}

/* What a round landing on the world looks like: a short spark spit, a puff of
   pulverised surface, and a scuff that stays. `markChance` throttles the mark
   for shotguns, where eight pellets a shot would otherwise flush the shared
   decal ring buffer (and every blood stain in it) in two trigger pulls. */
function worldImpact(point, normal, markChance) {
  sparkBurst(point.x, point.y, point.z, normal.x, normal.y, normal.z, 5, true);
  dustBurst(point.x, point.y, point.z, normal.x, normal.y, normal.z, 5);
  if (markChance >= 1 || rnd() < markChance)
    impactMark(point.x, point.y, point.z, normal.x, normal.y, normal.z, rr(7, 12));
  sndImpact(point);
}

// A flame cone is broad, but it still needs a clear path to each target. The
// centre ray is only suitable for clipping the visual jet; using it for all
// targets let fire pass through walls whenever a zombie stood in the middle.
function flameCanReach(origin, target, maxDist, zd) {
  var toTarget = tmpVec(target.x - origin.x, target.y - origin.y, target.z - origin.z),
    distance = toTarget.length();
  if (distance > maxDist || distance < 0.001) return false;
  toTarget.multiplyScalar(1 / distance);
  var hit = hitscan(origin, toTarget, distance + 14);
  return !hit || hit.zed === zd || hit.dist >= distance - 12;
}

// head/limb classification from mesh tags first, then hit height
function zedPart(zd, point, obj) {
  var tagged = obj ? partOf(obj) : null;
  if (tagged === "head" || tagged === "limb" || tagged === "body") return tagged;
  var rel = point.y - zd.y,
    top = 172 * zd.rig.scale;
  if (zd.crawler) return rel > 44 ? "head" : "body";
  if (rel > top * 0.82) return "head";
  if (rel < top * 0.4) return "limb";
  return "body";
}

/* --- flamethrower: a cone of burning fuel, not a bullet ------------------- */
function flame(dt) {
  var P = Z.p,
    def = W.flamer;
  if (P.reloading > 0) return;
  if (P.ammo.flamer <= 0) {
    if (Z.t > (P.nextShot || 0)) {
      sndClick();
      P.nextShot = Z.t + 0.4;
      if (P.reserve.flamer > 0) reload();
      else say(t("z_no_fuel"), 0.9);
    }
    return;
  }
  // Fuel burns by time, not by trigger pulls. `rpm` is also the tank's
  // consumption rate, so a 600-rpm flamer consumes ten fuel units/second.
  // The old fixed 50ms step consumed twenty and made a full tank vanish in
  // about eleven seconds.
  var fuelInterval = 60 / def.rpm;
  P.flameFuel = (P.flameFuel || 0) + dt;
  while (P.flameFuel >= fuelInterval && P.ammo.flamer > 0) {
    P.flameFuel -= fuelInterval;
    P.ammo.flamer--;
    Z.stats.shots++;
  }
  hudDirty();

  var cam = getMainCamera();
  cam.getWorldPosition(_v0);
  var origin = _v0; // stays valid — not pooled
  cam.getWorldDirection(_v1);
  var dir = _v1;     // stays valid — not pooled
  var muzzleW = tmpVec();
  if (Z.view && Z.view.userData.muzzle) Z.view.userData.muzzle.getWorldPosition(muzzleW);
  else muzzleW.copy(origin);

  // the jet stops at the first wall, so you can't burn through a door
  var wall = hitscan(origin, dir, def.reach);
  var reach = wall && !wall.zed ? Math.max(40, wall.dist - 10) : def.reach;

  // visual: fuel motes accelerating away from the wand and dying out
  for (var i = 0; i < 7; i++) {
    var t2 = rr(0.05, 1) * reach,
      spread = t2 * 0.18;
    spawnFlamePart(
      muzzleW.x + dir.x * t2 + rr(-spread, spread),
      muzzleW.y + dir.y * t2 + rr(-spread, spread) + t2 * 0.0004,
      muzzleW.z + dir.z * t2 + rr(-spread, spread),
      dir,
      t2 / reach
    );
  }
  if (!Z.fireLight) {
    Z.fireLight = new THREE.PointLight(0xff7420, 0, 700, 2);
    Z.grp.add(Z.fireLight);
  }
  var rk = reach * 0.45;
  Z.fireLight.position.set(muzzleW.x + dir.x * rk, muzzleW.y + dir.y * rk, muzzleW.z + dir.z * rk);
  Z.fireLight.intensity = legacyIntensity(5.5 + Math.sin(Z.t * 30) * 1.6, 700);
  Z.fireLight.userData.t = 0.09;

  // damage: everything inside the cone, LOS already handled by `reach`
  P.flameTick = (P.flameTick || 0) - dt;
  var doDamage = P.flameTick <= 0;
  if (doDamage) P.flameTick = 0.1;
  for (var zi = 0; zi < Z.zeds.length && doDamage; zi++) {
    var zd = Z.zeds[zi];
    if (zd.dead) continue;
    var dx = zd.x - P.x,
      dy = zd.y + 90 - (P.y + EYE),
      dz = zd.z - P.z,
      d = Math.hypot(dx, dy, dz) || 1;
    if (d > reach + 40) continue;
    if ((dx / d) * dir.x + (dy / d) * dir.y + (dz / d) * dir.z < 1 - def.arc * 0.5) continue;
    if (!flameCanReach(origin, tmpVec(zd.x, zd.y + 90, zd.z), reach + 40, zd)) continue;
    var dmgMult = (Z.perks && Z.perks.damage) ? 1.35 : 1.0;
    damageZed(zd, def.dmg * dmgMult, tmpVec(zd.x, zd.y + 100, zd.z), dir, "body", false);
    igniteZed(zd, rr(4.5, 7));
  }
  // sustained heat weakens structure too — thin panels and glass give way
  if (doDamage && wall && !wall.zed && rnd() < 0.25)
    damageWorldSafely(origin, dir, "burn");

  P.bloom = Math.min(0.05, P.bloom + 0.0016);
  shake(0.045);
  makeNoise(P.x, P.z, def.noise);
  if (Z.t > (P.flameSndT || 0)) {
    P.flameSndT = Z.t + 0.18;
    sndFlame();
  }
}

function spawnFlamePart(x, y, z, dir, k) {
  // The dedicated fire pool gives the stream a white core, orange crown and
  // upward curl. Particles already sampled down the cone get a shorter life so
  // the visible jet ends exactly at the wall/reach limit.
  var hot = 1 - k * 0.58;
  spawnFirePart(
    x, y, z,
    dir.x * rr(260, 520) + rr(-55, 55),
    dir.y * rr(240, 500) + rr(15, 75),
    dir.z * rr(260, 520) + rr(-55, 55),
    rr(18, 34) * (0.8 + k * 0.55),
    rr(0.18, 0.36) * (1 - k * 0.35),
    hot
  );
  // A little dark exhaust behind the bright flame keeps it volumetric.
  if (k > 0.5 && rnd() < 0.28)
    spawnPart(
      x, y, z,
      dir.x * rr(25, 70) + rr(-25, 25), rr(45, 90), dir.z * rr(25, 70) + rr(-25, 25),
      rr(12, 23), 0.16, 0.13, 0.11, rr(0.45, 0.8), -GRAV * 0.08
    );
}

function fire() {
  var P = Z.p,
    def = W[P.weapon];
  if (P.dead || Z.paused) return;
  if (def.melee) return meleeSwing();
  if (def.flame) return; // driven per-frame from stepPlayer while held
  if (P.reloading > 0) return;
  if (Z.t < P.nextShot) return;
  if (P.ammo[P.weapon] <= 0) {
    sndClick();
    P.nextShot = Z.t + 0.25;
    if (P.reserve[P.weapon] > 0) reload();
    else say(t("z_no_ammo"), 0.9);
    return;
  }
  P.ammo[P.weapon]--;
  if (P.ammo[P.weapon] === Math.max(1, Math.floor(def.mag * 0.2)) && Z.t > (P.lowAmmoT || 0)) {
    P.lowAmmoT = Z.t + 8;
    say(t("z_low_ammo"), 1.1);
  }
  P.nextShot = Z.t + 60 / def.rpm;
  Z.stats.shots++;
  var cam = getMainCamera();
  cam.getWorldPosition(_v0);
  var origin = _v0; // stays valid — not pooled
  var muzzleW = tmpVec();
  if (Z.view && Z.view.userData.muzzle)
    Z.view.userData.muzzle.getWorldPosition(muzzleW);
  else muzzleW.copy(origin);

  var sprd =
    (def.spread + P.bloom) *
    (P.aim ? 0.38 : 1) *
    (P.crouch ? 0.85 : 1) *
    (1 + (P.distract || 0) * 1.6);
  for (var p = 0; p < def.pellets; p++) {
    var d = camDir(sprd);
    var h = hitscan(origin, d, 6000);
    var end = h
      ? h.point
      : tmpVec(origin.x + d.x * 3000, origin.y + d.y * 3000, origin.z + d.z * 3000);
    tracer(muzzleW.x, muzzleW.y, muzzleW.z, end.x, end.y, end.z);
    if (!h) continue;
    if (h.zed) {
      var part = zedPart(h.zed, h.point, h.obj);
      // falloff: point-blank hits hit harder
      var fall = h.dist < 180 ? 1.15 : h.dist > 900 ? 0.82 : 1;
      var dmgMult = (Z.perks && Z.perks.damage) ? 1.35 : 1.0;
      var dealt = damageZed(h.zed, def.dmg * fall * dmgMult, h.point, d, part, false);
      // damageZed attaches an articulated wound to the exact body/garment.
      // The old extra world-space decal stayed behind when the zombie moved,
      // exposing a flat floating card and doubling every visible hit.
      if (part === "head") {
        P.hitStop = Math.max(P.hitStop, 0.045);
        Z.slowT = Math.max(Z.slowT || 0, 0.12);
        Z.timeScale = 0.35;
      } else if (dealt > 40) P.hitStop = Math.max(P.hitStop, 0.03);
    } else {
      // The round has to leave a mark. Before, a wall hit produced sparks and
      // nothing else, so the only evidence a shot landed was the structure
      // breaking — which is why "no impact" read as the wall exploding.
      worldImpact(h.point, h.normal, def.pellets > 1 ? 0.3 : 1);
      // rounds chew furnishings: glass goes first, then panels and cabinetry.
      // Walls themselves are exempt (see HIT.immune in zombies_destruct.js).
      damageWorldSafely(origin, d, def.pellets > 1 ? "buck" : "bullet");
    }
  }
  // recoil into the look angles + viewmodel kick
  var kickMul = P.aim ? 0.55 : 1;
  P.pitch = clamp(P.pitch + def.kick * rr(0.7, 1.3) * kickMul, -1.35, 1.35);
  P.yaw += rr(-def.kick, def.kick) * 0.4 * kickMul;
  P.bloom = Math.min(0.07, P.bloom + def.bloom * (P.aim ? 0.45 : 1));
  P.vmKick = Math.min(1, P.vmKick + (def.kick * 18));
  shake(def.kick * 4);
  muzzleFlash(muzzleW, def);
  sndShot(def);
  makeNoise(P.x, P.z, def.noise * (P.aim ? 0.85 : 1));
  flashScreen("#ffd9a0", 0.07);
  hudDirty();
}

function muzzleFlash(pos, def) {
  var F = Z.mflash;
  if (!F) {
    F = Z.mflash = new THREE.PointLight(0xffd9a0, 0, 620, 2);
    Z.grp.add(F);
  }
  F.position.copy(pos);
  F.intensity = legacyIntensity(7 * (def.pellets > 1 ? 1.6 : 1), 620) * gameSettings().flashes;
  F.userData.t = 0.055;
  sparkBurst(pos.x, pos.y, pos.z, 0, 0, 0, def.pellets > 1 ? 14 : 7, true);
}

function reload() {
  var P = Z.p,
    def = W[P.weapon];
  if (def.melee || P.reloading > 0) return;
  if (P.ammo[P.weapon] >= def.mag || P.reserve[P.weapon] <= 0) return;
  var speedMod = (Z.perks && Z.perks.speed) ? 0.55 : 1.0;
  P.reloading = def.reload * speedMod;
  sndReload();
  say(t("z_reloading"), def.reload * speedMod);
}
function finishReload() {
  var P = Z.p,
    def = W[P.weapon],
    need = def.mag - P.ammo[P.weapon],
    take = Math.min(need, P.reserve[P.weapon]);
  P.ammo[P.weapon] += take;
  P.reserve[P.weapon] -= take;
  if (take > 0) Z.tutorialStage = 2;
  hudDirty();
}

/* --- melee: an arc sweep, generous but short ----------------------------- */
function meleeSwing() {
  var P = Z.p,
    def = W[P.weapon];
  if (P.swing > 0 || Z.t < P.nextShot) return;
  P.swing = def.swing;
  P.swingMax = def.swing;
  P.swingHit = false;
  P.nextShot = Z.t + def.rate;
  sndWhoosh(def);
  P.stam = Math.max(0, P.stam - 6);
}
function meleeConnect() {
  var P = Z.p,
    def = W[P.weapon],
    cam = getMainCamera();
  cam.getWorldPosition(_v0);
  var fx = Math.sin(P.yaw),
    fz = Math.cos(P.yaw),
    hitAny = false;
  // sweep the arc against zombie centres, nearest first
  var cands = Z.zeds
    .filter(function (zd) {
      return !zd.dead && Math.hypot(zd.x - P.x, zd.z - P.z) < def.reach + 30;
    })
    .sort(function (a, b) {
      return (
        Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z)
      );
    });
  for (var i = 0; i < cands.length && i < 3; i++) {
    var zd = cands[i],
      dx = zd.x - P.x,
      dz = zd.z - P.z,
      d = Math.hypot(dx, dz) || 1;
    var ang = Math.acos(clamp((dx / d) * fx + (dz / d) * fz, -1, 1));
    if (ang > def.arc) continue;
    var hy = zd.y + (zd.crawler ? 40 : rr(90, 150));
    var pt = tmpVec(zd.x, hy, zd.z);
    var dir = tmpVec(dx / d, 0, dz / d);
    // aiming high with an axe takes the head off
    var part = P.pitch < -0.12 ? "limb" : P.pitch > 0.16 && rnd() < 0.5 ? "head" : "body";
    if (rnd() < def.dismember) part = rnd() < 0.5 ? "head" : "limb";
    var dmgMult = (Z.perks && Z.perks.damage) ? 1.35 : 1.0;
    damageZed(zd, def.dmg * dmgMult, pt, dir, part, true);
    zd.stagger = Math.max(zd.stagger, def.stagger);
    // knockback
    zd.x += (dx / d) * def.stagger * 30;
    zd.z += (dz / d) * def.stagger * 30;
    hitAny = true;
    shake(0.28);
    P.hitStop = Math.max(P.hitStop, part === "head" ? 0.08 : 0.04);
    if (part === "head") {
      Z.slowT = Math.max(Z.slowT || 0, 0.14);
      Z.timeScale = 0.3;
    }
    if (def.arc < 0.7) break;                     // stabs hit one thing
  }
  if (!hitAny) {
    // hit the world instead: sparks + a satisfying clang
    cam.getWorldDirection(_v1);
    var swingDir = _v1.clone();
    var h = hitscan(_v0.clone(), swingDir, def.reach + 20);
    if (h) {
      worldImpact(h.point, h.normal, 1);
      shake(0.14);
      // an axe into a cabinet should take the door off, same as in walk mode
      damageWorld(_v0.clone(), swingDir, "melee");
    }
  }
  makeNoise(P.x, P.z, 260);
}

/* ===========================================================================
   6b. FRAG GRENADES — thrown, bounced, cooked
   =========================================================================== */
function throwFrag(lob) {
  var P = Z.p;
  if (P.dead || Z.paused) return;
  if ((P.frags || 0) <= 0) {
    sndClick();
    say(t("z_no_frags"), 0.9);
    return;
  }
  if (Z.t < (P.nextFrag || 0)) return;
  P.nextFrag = Z.t + 0.55;
  P.frags--;
  var cam = getMainCamera();
  cam.getWorldPosition(_v0);
  cam.getWorldDirection(_v1);
  var dir = _v1.clone(),
    speed = FRAG.throwV * (lob ? 0.45 : 1);

  var g = new THREE.Group();
  var bodyM = new THREE.Mesh(
    new THREE.SphereGeometry(4.4, 10, 8),
    vm(0x3d4a30, 0.62, 0.35)
  );
  bodyM.scale.set(1, 1.22, 1);
  g.add(bodyM);
  g.add(
    new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 2.4, 8), vm(0x8a8f96, 0.4, 0.7))
  ).position.y = 5.4;
  // a blinking primer so a live one is findable on a dark floor
  var led = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xff3020 })
  );
  led.position.set(0, 5.6, 2.4);
  g.add(led);
  g.position.copy(_v0).add(dir.clone().multiplyScalar(28));
  Z.grp.add(g);

  Z.frags.push({
    g: g,
    led: led,
    x: g.position.x, y: g.position.y, z: g.position.z,
    vx: dir.x * speed,
    vy: dir.y * speed + 130,
    vz: dir.z * speed,
    fuse: FRAG.fuse,
    rest: 0,
  });
  sndWhoosh(W.pan);
  hudDirty();
}

function stepFrags(dt) {
  for (var i = Z.frags.length - 1; i >= 0; i--) {
    var f = Z.frags[i];
    f.fuse -= dt;
    // ballistic arc, then bounce off floor/furniture and slide to a stop
    f.vy -= GRAV * dt;
    _movePoint2D.x = f.x;
    _movePoint2D.z = f.z;
    moveCircle(_movePoint2D, f.vx * dt, f.vz * dt, 5, f.y, 12, 0);
    // a blocked step means it hit something upright — kill the horizontal push
    var wantX = f.x + f.vx * dt,
      wantZ = f.z + f.vz * dt;
    if (Math.abs(_movePoint2D.x - wantX) > 0.5 || Math.abs(_movePoint2D.z - wantZ) > 0.5) {
      f.vx *= -0.35;
      f.vz *= -0.35;
      sndImpact({ x: f.x, y: f.y, z: f.z });
    }
    f.x = _movePoint2D.x;
    f.z = _movePoint2D.z;
    f.y += f.vy * dt;
    var floor = groundAt(f.x, f.z, f.y, 0);
    if (f.y <= floor + 4) {
      f.y = floor + 4;
      if (f.vy < -60) {
        f.vy *= -0.36;                       // bounce
        f.vx *= 0.62;
        f.vz *= 0.62;
        sndImpact({ x: f.x, y: f.y, z: f.z });
      } else {
        f.vy = 0;
        f.vx *= Math.pow(0.02, dt);          // friction to rest
        f.vz *= Math.pow(0.02, dt);
      }
    }
    f.g.position.set(f.x, f.y, f.z);
    f.g.rotation.x += (f.vz * 0.0006 + 0.02);
    f.g.rotation.z -= (f.vx * 0.0006 + 0.02);
    // primer blinks faster as the fuse runs out
    if (f.led) f.led.visible = Math.sin(Z.t * (10 + (FRAG.fuse - f.fuse) * 14)) > 0;
    if (f.fuse <= 0) {
      detonate(f.x, f.y, f.z);
      Z.grp.remove(f.g);
      f.g.traverse(function (o) {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
      Z.frags.splice(i, 1);
    }
  }
}

// Survivors of a close blast keep coming, minus a limb.
function loseLimbToBlast(zd, dir) {
  var opts = [];
  if (zd.limbs.armL) opts.push("armL");
  if (zd.limbs.armR) opts.push("armR");
  if (!zd.crawler && zd.limbs.legL) opts.push("legL");
  if (!zd.crawler && zd.limbs.legR) opts.push("legR");
  if (opts.length) severPart(zd, pick(opts), dir, "blow", 1.2);
}

function detonate(x, y, z) {
  var P = Z.p;
  // --- the flash itself
  var L = Z.blastLight;
  if (!L) {
    L = Z.blastLight = new THREE.PointLight(0xffca70, 0, 1400, 2);
    Z.grp.add(L);
  }
  L.position.set(x, y + 20, z);
  L.intensity = legacyIntensity(30, 1400) * gameSettings().flashes;
  L.userData.t = 0.16;
  sparkBurst(x, y + 10, z, 0, 1, 0, 40, true);
  boneBurst(x, y + 10, z, 12);
  decal(x, 1.2, z, 0, 1, 0, rr(120, 190));
  sndBlast({ x: x, y: y, z: z });

  // --- zombies: falloff from the core, blocked by walls
  for (var i = Z.zeds.length - 1; i >= 0; i--) {
    var zd = Z.zeds[i];
    if (zd.dead) continue;
    var d = Math.hypot(zd.x - x, zd.y + 90 - y, zd.z - z);
    if (d > FRAG.radius) continue;
    // a wall between you and the blast is most of a grenade's mercy
    var shielded = !losClear(x, z, zd.x, zd.z);
    var k = (1 - d / FRAG.radius) * (shielded ? 0.3 : 1);
    var dmg = FRAG.dmg * k * k;
    if (dmg < 4) continue;
    var dir = tmpVec((zd.x - x) / (d || 1), 0.3, (zd.z - z) / (d || 1));
    // Always score it against the torso: the limb zone carries a 0.7 damage
    // multiplier, so using it for close hits made the epicentre the *weakest*
    // place to stand. Dismemberment is applied on top instead.
    damageZed(zd, dmg, tmpVec(zd.x, zd.y + 90, zd.z), dir, "body", false);
    if (!zd.dead) {
      if (d < FRAG.radius * 0.4 && !shielded) loseLimbToBlast(zd, dir);
      zd.stagger = Math.max(zd.stagger, 0.9 * k);
      zd.x += dir.x * 60 * k;
      zd.z += dir.z * 60 * k;
    }
  }

  // --- the room itself
  explodeWorld({ x: x, y: y, z: z }, FRAG.radius * 0.85, FRAG.power);

  // --- the player, if they cooked it in their own hand
  var pd = Math.hypot(P.x - x, P.y + 90 - y, P.z - z);
  if (pd < FRAG.radius) {
    var pk = 1 - pd / FRAG.radius;
    if (!losClear(x, z, P.x, P.z)) pk *= 0.3;
    if (pk > 0.05) hurtPlayer(FRAG.dmg * 0.42 * pk * pk, { x: x, z: z });
  }
  shake(1.5 * clamp(1 - pd / (FRAG.radius * 1.6), 0.15, 1));
  flashScreen("#ffcf90", clamp(0.5 * (1 - pd / FRAG.radius), 0.06, 0.5));
  makeNoise(x, z, 2600);
  Z.slowT = Math.max(Z.slowT || 0, 0.16);
  Z.timeScale = 0.45;
}

function stepViewModel(dt) {
  var P = Z.p,
    v = Z.view;
  if (!v) return;
  var def = W[P.weapon];
  // sway from look delta, bob from walking, kick from firing
  P.swayX += (P.lookDX * -0.25 - P.swayX) * Math.min(1, dt * 9);
  P.swayY += (P.lookDY * -0.2 - P.swayY) * Math.min(1, dt * 9);
  P.lookDX *= 0.82;
  P.lookDY *= 0.82;
  var bobA = P.speedK * (P.sprint ? 2.4 : 1.4) * gameSettings().bob,
    bx2 = Math.sin(P.bob) * bobA,
    by = Math.abs(Math.cos(P.bob)) * bobA * 0.8;
  P.vmKick *= Math.pow(0.0016, dt);
  var sw = 0,
    swRot = 0;
  if (P.swing > 0) {
    P.swing -= dt;
    var k = 1 - P.swing / P.swingMax;
    if (!P.swingHit && k > 0.34) {
      P.swingHit = true;
      meleeConnect();
    }
    // wind up then whip through
    var e = k < 0.3 ? -k / 0.3 : Math.sin(((k - 0.3) / 0.7) * Math.PI);
    if (def.hand === "stab") {
      sw = -e * 26;
      swRot = e * 0.2;
    } else if (def.hand === "chop") {
      swRot = -e * 1.6;
      sw = -e * 10;
    } else {
      swRot = -e * 1.1;
      P.vmYaw = e * 0.9;
    }
    if (P.swing <= 0) P.vmYaw = 0;
  } else P.vmYaw = (P.vmYaw || 0) * 0.8;
  var rl = P.reloading > 0 ? Math.sin((1 - P.reloading / W[P.weapon].reload) * Math.PI) : 0;
  v.position.set(
    11 + P.swayX + bx2 + (P.aim ? -11 : 0),
    -9.5 + P.swayY + by - rl * 10 - P.vmKick * 1.2 + (P.aim ? 3.4 : 0),
    -17 + P.vmKick * 4 + sw + (P.aim ? 4 : 0)
  );
  v.rotation.set(
    -P.vmKick * 0.35 + swRot + rl * 0.9,
    (P.vmYaw || 0) - P.swayX * 0.02,
    rl * 0.5 + (P.vmYaw || 0) * 0.4
  );
}

/* ===========================================================================
   7. PICKUPS — ammo, health and new weapons, laid on the real furniture
   =========================================================================== */
function surfaceSpots(n) {
  // prefer real worktop/table/shelf heights (40–120cm) — that's where you'd
  // actually leave a box of shells
  var out = [];
  if (!Z.col) return out;
  var cands = Z.col.rects.filter(function (r) {
    var h = r.y1;
    return h > 38 && h < 122 && r.x1 - r.x0 > 30 && r.z1 - r.z0 > 30;
  });
  for (var i = 0; i < n; i++) {
    if (!cands.length) break;
    var r = pick(cands);
    out.push({
      x: rr(r.x0 + 8, r.x1 - 8),
      z: rr(r.z0 + 8, r.z1 - 8),
      y: r.y1 + 6,
    });
  }
  return out;
}

function makePickup(kind, x, y, z, weapon) {
  var g = new THREE.Group();
  var col =
    kind === "health" ? 0x2fd06a :
    kind === "weapon" ? 0xffc23c :
    kind === "armor" ? 0x5ec8ff :
    kind === "adrenaline" ? 0xff66aa :
    kind === "frag" ? 0xff8c3a :
    0x4aa6ff;
  var glow = new THREE.Mesh(
    new THREE.SphereGeometry(11, 16, 12),
    new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  g.add(glow);
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(12, 0.7, 8, 24),
    new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  var body;
  if (kind === "health") {
    body = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 8), vm(0xeef0f2, 0.45, 0.12));
  } else if (kind === "weapon") {
    body = buildViewModel(weapon);
    body.scale.setScalar(0.55);
  } else if (kind === "armor") {
    body = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 6), vm(0x3a4a58, 0.55, 0.45));
  } else if (kind === "adrenaline") {
    body = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 14, 10), vm(0xff88bb, 0.35, 0.2));
    body.rotation.z = Math.PI / 2;
  } else if (kind === "frag") {
    // a bandolier of them, so it reads as more than one
    body = new THREE.Group();
    for (var fi = 0; fi < 3; fi++) {
      var fg = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), vm(0x3d4a30, 0.62, 0.35));
      fg.scale.set(1, 1.2, 1);
      fg.position.set((fi - 1) * 8, 0, 0);
      body.add(fg);
    }
  } else {
    body = new THREE.Mesh(new THREE.BoxGeometry(13, 8, 9), vm(0x3a4a2c, 0.65, 0.12));
  }
  g.add(body);
  if (kind === "health") {
    var c1 = new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 0.7), vm(0xd02020, 0.35, 0));
    c1.position.z = 4.1;
    g.add(c1);
    var c2 = c1.clone();
    c2.rotation.z = Math.PI / 2;
    g.add(c2);
  } else if (kind === "armor") {
    var plate = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 1), vm(0x6a8aaa, 0.4, 0.6));
    plate.position.z = 3.5;
    g.add(plate);
  }
  // The additive shell already reads as a pickup. A PointLight per pickup
  // multiplied the cost of every nearby material and tanked crowded rooms.
  g.position.set(x, y, z);
  Z.grp.add(g);
  var pu = { g: g, kind: kind, weapon: weapon, x: x, y: y, z: z, ph: rnd() * 6, ring: ring };
  Z.pickups.push(pu);
  return pu;
}

function scatterPickups(wave) {
  clearPickups();
  var spots = surfaceSpots(5 + Math.min(6, wave));
  // fall back to room centres when the flat has no worktops
  if (spots.length < 3) {
    liveRooms().forEach(function (r) {
      var f = freeSpot(r.cx + rr(-80, 80), r.cz + rr(-80, 80), 20);
      spots.push({ x: f.x, z: f.z, y: 22 });
    });
  }
  spots.forEach(function (s, i) {
    var roll = rnd();
    var kind =
      roll < 0.25 ? "health" :
      roll < 0.38 ? "armor" :
      roll < 0.45 ? "adrenaline" :
      roll < 0.6 ? "frag" :
      "ammo";
    // first slots bias toward ammo/health
    if (i < 2) kind = i === 0 ? "health" : "ammo";
    makePickup(kind, s.x, s.y + 4, s.z);
  });
  // a new weapon shows up every couple of waves, in combat-friendly order
  var nextGun = W_UNLOCK.filter(function (k) {
    return !Z.p.owned[k];
  })[0];
  if (nextGun && (wave === 1 || wave % 2 === 0)) {
    var s2 = spots.length ? pick(spots) : { x: Z.p.x + 120, z: Z.p.z, y: 30 };
    makePickup("weapon", s2.x, s2.y + 6, s2.z, nextGun);
  }
}

function disposePickup(pu) {
  if (Z.grp) Z.grp.remove(pu.g);
  pu.g.traverse(function (o) {
    if (o.isMesh && o.geometry) o.geometry.dispose();
  });
}

// Uncollected drops from earlier waves would otherwise pile up forever.
function clearPickups() {
  Z.pickups.forEach(disposePickup);
  Z.pickups = [];
}

function stepPickups(dt) {
  for (var i = Z.pickups.length - 1; i >= 0; i--) {
    var pu = Z.pickups[i];
    pu.ph += dt;
    pu.g.position.y = pu.y + Math.sin(pu.ph * 2.2) * 4;
    pu.g.rotation.y += dt * 1.5;
    if (pu.ring) {
      pu.ring.rotation.z += dt * 2.4;
      pu.ring.scale.setScalar(1 + Math.sin(pu.ph * 3) * 0.08);
    }
    if (Math.hypot(pu.x - Z.p.x, pu.z - Z.p.z) < (Z.touchMode ? 82 : 58) && Math.abs(pu.y - Z.p.y) < 140) {
      takePickup(pu);
      disposePickup(pu);
      Z.pickups.splice(i, 1);
    }
  }
}

function takePickup(pu) {
  var P = Z.p;
  if (pu.kind === "health") {
    P.hp = Math.min(MAX_HP, P.hp + 40);
    say(t("z_pick_health"), 1.2);
    flashScreen("#2fd06a", 0.16);
  } else if (pu.kind === "armor") {
    P.armor = Math.min(MAX_ARMOR, (P.armor || 0) + 50);
    say(t("z_pick_armor"), 1.3);
    flashScreen("#5ec8ff", 0.14);
  } else if (pu.kind === "adrenaline") {
    P.adrenalT = Math.max(P.adrenalT || 0, 8);
    P.stam = 100;
    say(t("z_pick_adrenal"), 1.4);
    flashScreen("#ff66aa", 0.18);
  } else if (pu.kind === "frag") {
    P.frags = Math.min(FRAG.maxCarry, (P.frags || 0) + 2);
    say(t("z_pick_frag"), 1.2);
    flashScreen("#ff8c3a", 0.12);
  } else if (pu.kind === "weapon") {
    P.owned[pu.weapon] = true;
    if (!W[pu.weapon].melee) {
      P.reserve[pu.weapon] = (P.reserve[pu.weapon] || 0) + W[pu.weapon].reserve;
      P.ammo[pu.weapon] = W[pu.weapon].mag;
    }
    say(t("z_pick_weapon", { w: t(W[pu.weapon].key) }), 1.8);
    setWeapon(pu.weapon);
  } else {
    var guns = W_ORDER.filter(function (k) {
      return P.owned[k] && !W[k].melee;
    });
    if (guns.length) {
      guns.forEach(function (k) {
        P.reserve[k] = (P.reserve[k] || 0) + Math.round(W[k].mag * 0.9);
      });
      say(t("z_pick_ammo"), 1.2);
    } else {
      P.hp = Math.min(MAX_HP, P.hp + 15);
      say(t("z_pick_ammo"), 1.2);
    }
    if (Z.flash) Z.flash.batt = Math.min(100, Z.flash.batt + 45);
  }
  awardRunPoints(Z, 25);
  sndPickup();
  hudDirty();
}

/* ===========================================================================
   8. AUDIO — everything procedural (no assets), positioned in stereo
   =========================================================================== */
function audio() {
  if (Z.audio) return Z.audio;
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var master = ctx.createGain();
    master.gain.value = 0.88 * ((gameSettings().volume || 70) / 100);
    master.connect(ctx.destination);
    // permanent ambient bed: two detuned drones through a slow filter sweep
    var bed = ctx.createGain();
    bed.gain.value = 0.0;
    bed.connect(master);
    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    lp.Q.value = 3;
    lp.connect(bed);
    var o1 = ctx.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = 41;
    var o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = 27.5;
    o1.connect(lp);
    o2.connect(lp);
    o1.start();
    o2.start();
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    var lg = ctx.createGain();
    lg.gain.value = 90;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    bed.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 4);
    // reusable noise buffer
    var nb = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate),
      nd = nb.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    Z.audio = { ctx: ctx, master: master, noise: nb, bed: bed, drone: lp };
  } catch (e) {
    Z.audio = null;
  }
  return Z.audio;
}
function panFor(x, z) {
  var A = audio();
  if (!A) return null;
  var p = A.ctx.createStereoPanner ? A.ctx.createStereoPanner() : null;
  if (!p) return null;
  var dx = x - Z.p.x,
    dz = z - Z.p.z,
    fx = Math.sin(Z.p.yaw),
    fz = Math.cos(Z.p.yaw),
    rx = -fz,
    rz = fx,
    d = Math.hypot(dx, dz) || 1;
  p.pan.value = clamp(((dx / d) * rx + (dz / d) * rz) * -1, -1, 1);
  return p;
}
function distGain(x, z, ref) {
  var d = Math.hypot(x - Z.p.x, z - Z.p.z);
  return clamp(1 - d / (ref || 1600), 0, 1);
}
function noiseSrc(A) {
  var s = A.ctx.createBufferSource();
  s.buffer = A.noise;
  s.loop = true;
  return s;
}

export {
  audio, clearPickups, cycleWeapon, distGain, finishReload, fire, flame,
  noiseSrc, panFor, reload, scatterPickups, setWeapon, stepFrags, stepPickups,
  stepViewModel, throwFrag, tmpVec,
};
