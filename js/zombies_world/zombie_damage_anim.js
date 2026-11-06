/* Night Shift zombie kills, surface hits and decals, damage, animation and
   per-frame stepping, split out of js/zombies_world.js. It shares the editor's
   state through live imports from ../zombies_world.js. */
import * as THREE from "three";
import { legacyIntensity } from "../gpu.js";
import { t } from "../i18n.js";
import { clamp, fin } from "../state.js";
import { awardRunPoints } from "../zombies_rules.js";
import { GRAV, STEP, Z, hooks, pick, rnd, rr } from "../zombies_state.js";
import { bloodBurst, boneBurst, decal, explodeBody, severPart, shake, sparkBurst, spawnFleshChunk } from "../zombies_world/fx_gore.js";
import { removeZed, screamerCall, spawnAcidCloud, stepBurn } from "../zombies_world/hazards.js";
import { organicDecalGeometry } from "../zombies_world/textures.js";
import {
  HIT_SURFACE_MAT, NO_RAYCAST, TEX, _zedMovePoint, blockedAt, groundAt,
  interiorBounds, losClear, moveCircle, nsQuality,
} from "../zombies_world.js";

export function killZed(zd, dir, gib, style) {
  if (zd.dead) return;
  zd.dead = true;
  zd.deadT = 0;
  zd.fallDir = Math.atan2(dir ? dir.x : 0, dir ? dir.z : 1);
  zd.gibbed = !!gib;
  Z.stats.kills++;
  Z.killStreak++;
  Z.streakT = 2.8;
  Z.combo = (Z.combo || 0) + 1;
  Z.comboT = 3.2;
  var basePts = zd.type === "brute" ? 250 : zd.type === "screamer" ? 180 : zd.type === "runner" ? 120 : 100;
  awardRunPoints(Z, Math.round(basePts * (1 + Math.min(8, Z.combo) * 0.15)));
  bloodBurst(zd.x, 95, zd.z, 0, 0.4, 0, 28);
  decal(zd.x, 0.8, zd.z, 0, 1, 0, rr(55, 110));
  if (zd.type === "bloater") spawnAcidCloud(zd.x, zd.y + 40, zd.z);
  var how = style || "blow";
  if (gib) {
    // catastrophic break — limbs and flesh fly off the torso
    if (how === "cut") {
      // melee finish: limbs shear off in the swing direction one after another
      var order = ["head", "armL", "armR", "legL", "legR"];
      order.forEach(function (k, i) {
        if (!zd.limbs[k]) return;
        var ang = (i / 5) * 1.4 - 0.7;
        var ld = {
          x: (dir && dir.x) || Math.sin(ang),
          y: 0.35 + rnd() * 0.25,
          z: (dir && dir.z) || Math.cos(ang),
        };
        severPart(zd, k, ld, "cut", 0.95 + i * 0.05);
      });
      // torso meat ribbons
      for (var ci = 0; ci < 6; ci++)
        spawnFleshChunk(
          zd.x + rr(-16, 16),
          zd.y + rr(70, 140),
          zd.z + rr(-16, 16),
          ((dir && dir.x) || 0) * rr(80, 220) + rr(-60, 60),
          rr(40, 200),
          ((dir && dir.z) || 0) * rr(80, 220) + rr(-60, 60),
          rr(5, 12),
          "cut"
        );
      bloodBurst(zd.x, zd.y + 110, zd.z, (dir && dir.x) || 0, 0.5, (dir && dir.z) || 0, 30);
    } else {
      explodeBody(zd, dir || { x: 0, y: 1, z: 0 }, 1.1);
    }
    if (zd.rig && zd.rig.body) zd.rig.body.scale.setScalar(0.92);
  } else {
    // non-gib death: still a chance a loose limb tears free on the fall
    if (rnd() < 0.4) {
      var loose = [];
      if (zd.limbs.armL) loose.push("armL");
      if (zd.limbs.armR) loose.push("armR");
      if (zd.limbs.head && rnd() < 0.25) loose.push("head");
      if (loose.length)
        severPart(
          zd,
          pick(loose),
          dir || { x: rr(-1, 1), y: 0.4, z: rr(-1, 1) },
          how === "cut" ? "cut" : "blow",
          0.75
        );
    }
  }
  // eye lights die on whatever head remains attached
  if (zd.rig && zd.rig.eyes)
    zd.rig.eyes.forEach(function (ey) {
      if (ey && ey.parent) ey.visible = false;
    });
  if (zd.rig && zd.rig.rim) zd.rig.rim.intensity = 0;
  hooks.sndDeath && hooks.sndDeath(zd);
  hooks.onKill && hooks.onKill(zd, gib);
  if (Z.killStreak >= 3) hooks.say && hooks.say(t("z_streak", { n: Z.killStreak }), 1.2);
  hooks.hudDirty && hooks.hudDirty();
}

function hitSurfaceMaterial(kind) {
  var k = kind === "tear" ? "tear" : kind + "_" + ((rnd() * TEX.wound.length) | 0);
  if (HIT_SURFACE_MAT[k]) return HIT_SURFACE_MAT[k];
  var map = kind === "tear" ? TEX.tear : TEX.wound[parseInt(k.split("_")[1], 10)];
  HIT_SURFACE_MAT[k] = new THREE.MeshStandardMaterial({
    map: map,
    color: 0xffffff,
    transparent: true,
    opacity: kind === "tear" ? 0.98 : 0.92,
    alphaTest: kind === "tear" ? 0.08 : 0.055,
    roughness: kind === "tear" ? 0.9 : 0.42,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  return HIT_SURFACE_MAT[k];
}

function hitAnchor(zd, point, part) {
  var r = zd && zd.rig;
  if (!r || !r.root) return null;
  r.root.updateMatrixWorld(true);
  var local = r.root.worldToLocal(point.clone());
  if (part === "head" && r.head && r.head.parent) return r.head;
  if (part === "limb") {
    if (local.y > 92) {
      var arm = local.x < 0 ? r.armL : r.armR;
      if (arm && arm.sh && arm.sh.parent) return arm.sh;
    }
    var leg = local.x < 0 ? r.legL : r.legR;
    if (leg && leg.knee && leg.knee.parent) return leg.knee;
    if (leg && leg.hip && leg.hip.parent) return leg.hip;
  }
  return r.torso && r.torso.parent ? r.torso : r.root;
}

// Keep fabric damage in the garment hierarchy. A tear attached to the body
// bone looked fixed in space whenever a loose sleeve, coat or hem swayed;
// choosing the nearest matching cloth shell means it now follows both the
// limb and the garment's secondary motion (and flies away with a severed
// limb because it is still inside that limb's group).
function clothAnchor(zd, layerName, point, fallback) {
  var r = zd && zd.rig,
    meshes = r && r.clothes && r.clothes.meshes;
  if (!meshes || !point) return fallback;
  var best = null,
    bestD = Infinity,
    wp = new THREE.Vector3();
  for (var i = 0; i < meshes.length; i++) {
    var mesh = meshes[i];
    if (!mesh || !mesh.parent || mesh.userData.clothLayer !== layerName) continue;
    mesh.updateWorldMatrix(true, false);
    mesh.getWorldPosition(wp);
    var d = wp.distanceToSquared(point);
    if (d < bestD) {
      bestD = d;
      best = mesh;
    }
  }
  return best || fallback;
}

function addSurfaceDecal(anchor, point, dir, size, kind, aspect) {
  if (!anchor || !point) return null;
  anchor.updateMatrixWorld(true);
  var localPoint = anchor.worldToLocal(point.clone());
  var outward = (dir && dir.lengthSq() > 0.0001 ? dir.clone().negate() : new THREE.Vector3(0, 0, 1)).normalize();
  var localNormal = anchor.worldToLocal(point.clone().add(outward)).sub(localPoint).normalize();
  if (!fin(localNormal.x) || localNormal.lengthSq() < 0.01) localNormal.set(0, 0, 1);
  var mat = hitSurfaceMaterial(kind);
  var mesh = new THREE.Mesh(organicDecalGeometry((rnd() * 10000) | 0, kind === "tear" ? 12 : 15), mat);
  mesh.scale.set(size, size * (aspect || 0.78), 1);
  mesh.position.copy(localPoint).add(localNormal.clone().multiplyScalar(0.025));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localNormal);
  mesh.rotation.z += rr(-0.45, 0.45);
  mesh.userData.zedHitFx = true;
  mesh.raycast = NO_RAYCAST;
  anchor.add(mesh);
  return mesh;
}

function damageSurface(zd, dmg, point, dir, part, melee) {
  if (!zd || !zd.rig || !point) return;
  var r = zd.rig;
  var skinK = Math.min(1, (r.skinDamage || 0) + Math.min(0.22, dmg / 260));
  r.skinDamage = skinK;
  // Skin materials are cloned per zombie, so impact bruising no longer tints
  // every other undead that happens to share the cached flesh map.
  // ...and the bruising multiplies the skin's own tint rather than replacing
  // it, so a shot no longer resets a green or jaundiced body back to the
  // untinted photo. tint0 is captured on the first hit, before any damage.
  [r.fleshMat, r.fleshSoftMat].forEach(function (m) {
    if (!m || !m.color) return;
    if (!m.userData.tint0) m.userData.tint0 = m.color.clone();
    var b = m.userData.tint0;
    m.color.setRGB(
      b.r * (1 - skinK * 0.2),
      b.g * (1 - skinK * 0.52),
      b.b * (1 - skinK * 0.46)
    );
    m.needsUpdate = true;
  });

  var relY = point.y - zd.y;
  var layerName = part === "limb" ? (relY < 78 ? "pants" : "sleeve") : relY < 38 ? "pants" : "shirt";
  var layer = r.clothes && r.clothes.layers && r.clothes.layers[layerName];
  var makeTear = false;
  if (layer) {
    layer.damage = Math.min(1, (layer.damage || 0) + Math.min(0.24, dmg / 120));
    zd.clothDamage = (zd.clothDamage || 0) + dmg;
    // Sustained fire accumulates damage; melee and strong rounds open fabric
    // immediately, while weak hits wait until the same spot has been worked.
    zd.clothImpact = (zd.clothImpact || 0) + dmg;
    makeTear = melee || dmg >= 12 || zd.clothImpact >= 22;
    if (makeTear) zd.clothImpact = Math.max(0, zd.clothImpact - 22);
    // Same rule for textiles: soil the garment's own colour, don't overwrite
    // it with a grey that made every damaged shirt the same shade.
    if (!layer.mat.userData.tint0) {
      layer.mat.userData.tint0 = layer.mat.color.clone();
      layer.mat.userData.rough0 = layer.mat.roughness;
    }
    var lb = layer.mat.userData.tint0;
    layer.mat.color.setRGB(
      lb.r * (1 - layer.damage * 0.18),
      lb.g * (1 - layer.damage * 0.24),
      lb.b * (1 - layer.damage * 0.24)
    );
    layer.mat.roughness = layer.mat.userData.rough0 - layer.damage * 0.18;
    layer.mat.needsUpdate = true;
  }

  var anchor = hitAnchor(zd, point, part);
  if (!anchor) return;
  var size = Math.max(4.5, Math.min(13, 4.5 + dmg * 0.055));
  var wound = addSurfaceDecal(anchor, point, dir, size, "wound", 0.85);
  if (wound) {
    zd.skinWounds = zd.skinWounds || [];
    zd.skinWounds.push(wound);
    if (zd.skinWounds.length > 10) {
      var old = zd.skinWounds.shift();
      if (old && old.parent) old.parent.remove(old);
      if (old && old.geometry) old.geometry.dispose();
    }
  }
  if (makeTear && layer) {
    var fabricAnchor = clothAnchor(zd, layerName, point, anchor);
    var tear = addSurfaceDecal(fabricAnchor, point, dir, size * 1.28, "tear", 0.54);
    if (tear) {
      tear.userData.clothLayer = layerName;
      zd.clothTears = zd.clothTears || [];
      zd.clothTears.push(tear);
      if (zd.clothTears.length > 8) {
        var oldT = zd.clothTears.shift();
        if (oldT && oldT.parent) oldT.parent.remove(oldT);
        if (oldT && oldT.geometry) oldT.geometry.dispose();
      }
    }
  }
}

export function damageZed(zd, dmg, point, dir, part, melee) {
  if (!zd || zd.dead) return 0;
  var mult = 1,
    head = part === "head";
  if (head) mult = 3.6;
  else if (part === "limb") mult = 0.7;
  // weakpoint: exposed gut
  if (!head && part === "body" && point && point.y - zd.y > 90 && point.y - zd.y < 120) mult *= 1.15;
  var d = dmg * mult;
  zd.hp -= d;
  damageSurface(zd, d, point, dir, part, melee);
  Z.stats.hits++;
  Z.stats.dmgDealt = (Z.stats.dmgDealt || 0) + d;
  if (head) Z.stats.heads++;
  if (melee) Z.stats.melee++;
  bloodBurst(point.x, point.y, point.z, dir.x * 0.45, 0.55, dir.z * 0.45, head ? 22 : 11);
  if (head) boneBurst(point.x, point.y, point.z, 3);
  hooks.hitMarker && hooks.hitMarker(head);
  hooks.sndFlesh && hooks.sndFlesh(point, head);
  if (head) hooks.onHeadshot && hooks.onHeadshot(zd, d);
  // stagger: heavy melee and shotguns rock them back
  zd.stagger = Math.max(zd.stagger, melee ? 0.48 : head ? 0.28 : 0.14);
  zd.alerted = true;
  if (zd.state === "tease") zd.state = "chase";
  zd.grabT = 0;
  zd.hitFlash = 0.12;
  zd.jiggle = Math.max(zd.jiggle || 0, melee ? 1.1 : 0.7);

  var mode = melee ? "cut" : "blow";
  var force = melee ? 1.05 : d > 50 ? 1.35 : 1.0;

  // accumulate limb trauma → animated sever when threshold crossed
  if (part === "limb" || head) {
    trySeverFromHit(zd, point, dir, d, melee, mode, force);
  } else if (part === "body" && d > 28) {
    // blown flesh chunks from torso without full limb loss
    var n = melee ? 1 : d > 45 ? 4 : 2;
    for (var ci = 0; ci < n; ci++) {
      spawnFleshChunk(
        point.x + rr(-6, 6),
        point.y + rr(-6, 6),
        point.z + rr(-6, 6),
        (dir.x || 0) * rr(60, 220) + rr(-80, 80),
        rr(40, 220),
        (dir.z || 0) * rr(60, 220) + rr(-80, 80),
        rr(4, 12),
        melee ? "cut" : "blow"
      );
    }
    if (d > 48 && rnd() < 0.35) {
      // catastrophic body hit can rip an arm free
      var arm = zd.limbs.armL && zd.limbs.armR ? pick(["armL", "armR"]) : zd.limbs.armL ? "armL" : zd.limbs.armR ? "armR" : null;
      if (arm) severPart(zd, arm, dir, mode, force * 0.9);
    }
  }

  if (zd.hp <= 0) {
    var style = melee ? "cut" : "blow";
    // decapitation on killing headshot — head flies off before body drops
    if (head && zd.limbs.head) {
      severPart(zd, "head", dir, style, force * 1.2);
    }
    // big damage, head kill, or heavy melee → full body break
    var doGib = d > 50 || head || (!melee && d > 40) || (melee && d > 45);
    killZed(zd, dir, doGib, style);
    return d;
  }
  return d;
}

// Pick nearest intact limb to the hit and either chip it or sever it.
export function trySeverFromHit(zd, point, dir, dmg, melee, mode, force) {
  if (!zd.limbDmg) zd.limbDmg = { armL: 0, armR: 0, legL: 0, legR: 0, head: 0 };
  var cand = [];
  function push(key, approxY, approxX) {
    if (!zd.limbs[key]) return;
    var wx = zd.x + (approxX || 0);
    var wy = zd.y + (approxY || 100);
    var wz = zd.z;
    var dist = point ? Math.hypot(point.x - wx, point.y - wy, point.z - wz) : 0;
    cand.push({ key: key, dist: dist });
  }
  push("head", 160, 0);
  push("armL", 130, -25);
  push("armR", 130, 25);
  push("legL", 50, -12);
  push("legR", 50, 12);
  if (!cand.length) return;
  cand.sort(function (a, b) {
    return a.dist - b.dist;
  });
  var best = cand[0].key;

  // headshots: only sever head on heavy hits (or kill path handles it)
  if (best === "head") {
    zd.limbDmg.head += dmg;
    if (zd.limbDmg.head > 55 && dmg > 20 && zd.hp > 0) {
      severPart(zd, "head", dir, mode, force);
      // headless zombie keeps staggering on remaining HP
      zd.stagger = Math.max(zd.stagger, 0.7);
      zd.spd *= 0.85;
    }
    return;
  }

  zd.limbDmg[best] = (zd.limbDmg[best] || 0) + dmg;
  var thresh = melee ? 28 : 36;
  // axes / heavy hits lower the bar
  if (dmg > 50) thresh *= 0.55;
  else if (dmg > 35) thresh *= 0.75;

  var shouldSever =
    zd.limbDmg[best] >= thresh ||
    (melee && dmg > 40 && rnd() < 0.7) ||
    (!melee && dmg > 30 && rnd() < 0.45);

  if (shouldSever) {
    severPart(zd, best, dir, mode, force);
  } else if (dmg > 12) {
    // chip of flesh even without full sever
    spawnFleshChunk(
      point.x,
      point.y,
      point.z,
      (dir.x || 0) * rr(40, 160),
      rr(30, 140),
      (dir.z || 0) * rr(40, 160),
      rr(3, 8),
      melee ? "cut" : "blow"
    );
  }
}

/* ---- animation ---------------------------------------------------------- */
function limbAttached(zd, key) {
  return !!(zd.limbs && zd.limbs[key]);
}
function armOK(zd, side) {
  return limbAttached(zd, side) && zd.rig[side] && zd.rig[side].sh && zd.rig[side].sh.parent;
}
function legOK(zd, side) {
  return limbAttached(zd, side) && zd.rig[side] && zd.rig[side].hip && zd.rig[side].hip.parent;
}

function springAngle(owner, valueKey, velocityKey, target, dt, stiffness, damping) {
  var value = owner[valueKey] || 0,
    velocity = owner[velocityKey] || 0;
  // Critically damped-ish transform spring. Capping dt avoids a tab-resume
  // spike snapping every lock and hem across the model.
  dt = Math.min(0.05, Math.max(0, dt || 0));
  velocity += (target - value) * (stiffness || 44) * dt;
  velocity *= Math.pow(damping || 0.018, dt);
  value += velocity * dt;
  owner[valueKey] = value;
  owner[velocityKey] = velocity;
  return value;
}

// One cheap motion sample drives every garment on this zombie. It provides
// coherent inertia from real travel and turning, replacing the old collection
// of unrelated sine waves without introducing a cloth solver or allocations.
function sampleClothMotion(zd, dt) {
  dt = Math.min(0.05, Math.max(0.001, dt || 0.016));
  if (zd.clothLastX == null) {
    zd.clothLastX = zd.x;
    zd.clothLastZ = zd.z;
    zd.clothLastHead = zd.head || 0;
  }
  var inv = 1 / dt,
    vx = (zd.x - zd.clothLastX) * inv,
    vz = (zd.z - zd.clothLastZ) * inv,
    head = zd.head || 0,
    fx = Math.sin(head),
    fz = Math.cos(head),
    rx = fz,
    rz = -fx,
    rawF = clamp((vx * fx + vz * fz) / 230, -1.35, 1.35),
    rawS = clamp((vx * rx + vz * rz) / 230, -1.1, 1.1),
    dh = head - zd.clothLastHead;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  var rawTurn = clamp(dh * inv / 6, -1.2, 1.2),
    prevF = zd.clothRawF || 0,
    prevS = zd.clothRawS || 0,
    follow = 1 - Math.exp(-dt * 8.5);

  zd.clothImpulseF = ((zd.clothImpulseF || 0) + clamp(rawF - prevF, -0.8, 0.8) * 0.62) * Math.pow(0.028, dt);
  zd.clothImpulseS = ((zd.clothImpulseS || 0) + clamp(rawS - prevS, -0.7, 0.7) * 0.55) * Math.pow(0.035, dt);
  zd.clothFlowF = (zd.clothFlowF || 0) + (rawF - (zd.clothFlowF || 0)) * follow;
  zd.clothFlowS = (zd.clothFlowS || 0) + (rawS - (zd.clothFlowS || 0)) * follow;
  zd.clothTurn = (zd.clothTurn || 0) + (rawTurn - (zd.clothTurn || 0)) * (1 - Math.exp(-dt * 11));
  zd.clothRawF = rawF;
  zd.clothRawS = rawS;
  zd.clothLastX = zd.x;
  zd.clothLastZ = zd.z;
  zd.clothLastHead = head;
}

function applyJiggle(zd, moving, ph, dt) {
  var r = zd.rig;
  if (!r) return;
  if (nsQuality() === 0 && zd.dist > 320 && !zd.dead) return;
  sampleClothMotion(zd, dt);
  var bounce = moving ? Math.abs(Math.sin(ph)) : Math.abs(Math.sin(ph * 0.5)) * 0.25;
  var hip = Math.sin(ph * 0.5);
  // impact jiggle decays
  zd.jiggle = Math.max(0, (zd.jiggle || 0) - dt * 4.2);
  var j = zd.jiggle;
  // toned-down body motion — still reads, less "bounce show"
  var jigAmp = (zd.female ? 0.55 : 0.3) * (0.35 + bounce * 0.55 + j * 1.4);

  if (r.breastL && r.breastL.userData.baseY != null) {
    var bl = r.breastL;
    bl.position.y = bl.userData.baseY - bounce * 1.6 * jigAmp - j * Math.sin(Z.t * 18) * 1.2;
    bl.position.z = bl.userData.baseZ + bounce * 0.7 * jigAmp;
    bl.rotation.x = bounce * 0.06 * jigAmp + j * Math.sin(Z.t * 14) * 0.08;
    bl.rotation.z = hip * 0.03 * jigAmp;
    bl.scale.setScalar(1 + bounce * 0.02 * jigAmp + j * 0.03);
  }
  if (r.breastR && r.breastR.userData.baseY != null) {
    var br = r.breastR;
    br.position.y = br.userData.baseY - bounce * 1.6 * jigAmp - j * Math.sin(Z.t * 18 + 1) * 1.2;
    br.position.z = br.userData.baseZ + bounce * 0.7 * jigAmp;
    br.rotation.x = bounce * 0.06 * jigAmp + j * Math.sin(Z.t * 14 + 1) * 0.08;
    br.rotation.z = -hip * 0.03 * jigAmp;
    br.scale.setScalar(1 + bounce * 0.02 * jigAmp + j * 0.03);
  }
  if (r.buttL && r.buttL.userData.baseSX) {
    var s = 1 + bounce * 0.04 * jigAmp + j * 0.05;
    r.buttL.scale.set(r.buttL.userData.baseSX * s, r.buttL.userData.baseSY * (1 + bounce * 0.03), r.buttL.userData.baseSZ * s);
    r.buttR.scale.set(r.buttR.userData.baseSX * s, r.buttR.userData.baseSY * (1 + bounce * 0.03), r.buttR.userData.baseSZ * s);
  }
  if (r.hairLocks && r.hairLocks.length) {
    for (var i = 0; i < r.hairLocks.length; i++) {
      var lock = r.hairLocks[i];
      if (!lock || !lock.upper || !lock.lower || !lock.anchor.parent) continue;
      var hAmp = (moving ? 0.22 : 0.06) + j * 0.16;
      var hPhase = ph * 0.8 + lock.phase;
      var hx = Math.sin(hPhase) * hAmp - Math.abs(Math.sin(hPhase * 0.5)) * hAmp * 0.35;
      var hz = Math.cos(hPhase * 0.74 + 0.8) * hAmp * 0.72;
      lock.upper.rotation.x = springAngle(lock, "upperX", "upperVX", hx, dt);
      lock.upper.rotation.z = springAngle(lock, "upperZ", "upperVZ", hz, dt);
      lock.lower.rotation.x = springAngle(lock, "lowerX", "lowerVX", hx * 1.45 + Math.sin(hPhase * 1.6) * hAmp * 0.42, dt);
      lock.lower.rotation.z = springAngle(lock, "lowerZ", "lowerVZ", hz * 1.5 + Math.cos(hPhase * 1.25) * hAmp * 0.38, dt);
    }
  }
  if (r.clothes && r.clothes.flaps) {
    var flowF = zd.clothFlowF || 0,
      flowS = zd.clothFlowS || 0,
      turn = zd.clothTurn || 0,
      impulseF = zd.clothImpulseF || 0,
      impulseS = zd.clothImpulseS || 0,
      travel = Math.min(1.4, Math.hypot(flowF, flowS));
    for (var fi = 0; fi < r.clothes.flaps.length; fi++) {
      var flap = r.clothes.flaps[fi];
      if (!flap || !flap.upper || !flap.lower || !flap.root.parent) continue;
      var cAmp = ((moving ? 0.055 : 0.014) + travel * 0.075 + j * 0.11) * flap.sway;
      var cPhase = ph * 0.72 + flap.phase;
      var cx = 0.035 + (flowF * 0.16 + impulseF * 0.2) * flap.drag + Math.sin(cPhase) * cAmp;
      var cz = -(flowS * 0.13 + impulseS * 0.18) * flap.drag + Math.cos(cPhase * 1.3) * cAmp * 0.55;
      var cy = -turn * (0.075 + Math.abs(flap.side) * 0.055) * flap.drag + flap.side * travel * 0.018;
      // Coat tails are deliberately softer than the upper attachment; the
      // lower half arrives late and keeps moving after a turn or sudden stop.
      flap.upper.rotation.x = springAngle(flap, "upperX", "upperVX", cx, dt, 38, 0.022);
      flap.upper.rotation.y = springAngle(flap, "upperY", "upperVY", cy, dt, 34, 0.026);
      flap.upper.rotation.z = springAngle(flap, "upperZ", "upperVZ", cz, dt, 36, 0.024);
      flap.lower.rotation.x = springAngle(flap, "lowerX", "lowerVX", cx * 1.62 + Math.sin(cPhase * 1.8) * cAmp * 0.38, dt, 25, 0.052);
      flap.lower.rotation.y = springAngle(flap, "lowerY", "lowerVY", cy * 1.7 + flap.side * turn * 0.04, dt, 23, 0.06);
      flap.lower.rotation.z = springAngle(flap, "lowerZ", "lowerVZ", cz * 1.5, dt, 24, 0.055);
    }
  }
  if (r.clothes && r.clothes.meshes) {
    var shellF = zd.clothFlowF || 0,
      shellS = zd.clothFlowS || 0,
      shellTurn = zd.clothTurn || 0,
      shellKickF = zd.clothImpulseF || 0,
      shellKickS = zd.clothImpulseS || 0;
    for (var ci = 0; ci < r.clothes.meshes.length; ci++) {
      var fabric = r.clothes.meshes[ci];
      if (!fabric || !fabric.parent) continue;
      var fs = fabric.userData.clothSway || 1;
      var fphase = (ci + 1) * 0.63;
      // Shells follow one shared flow field, with only a small phase offset for
      // weave flutter. This reads as one garment rather than vibrating parts.
      var fAmp = (moving ? 1 : 0.25) * (0.005 + bounce * 0.009) * fs;
      fabric.rotation.x = (fabric.userData.clothBaseRX || 0) + (shellF * 0.007 + shellKickF * 0.012) * fs + Math.sin(ph * 1.15 + fphase) * fAmp;
      fabric.rotation.z = (fabric.userData.clothBaseRZ || 0) - (shellS * 0.009 + shellKickS * 0.014 + shellTurn * 0.006) * fs + Math.sin(ph * 0.82 + fphase * 1.7) * fAmp;
      fabric.rotation.y = (fabric.userData.clothBaseRY || 0) - shellTurn * 0.004 * fs + Math.sin(ph * 0.68 + fphase) * fAmp * 0.35;
    }
  }
  if (r.aura) {
    r.aura.intensity = legacyIntensity(0.15 + 0.12 * Math.sin(Z.t * 2.2 + zd.phase) + (zd.state === "tease" ? 0.15 : 0), 160);
    r.aura.distance = zd.state === "tease" ? 200 : 150;
  }
}

export function animZed(zd, dt) {
  var r = zd.rig;
  if (!r || !r.body) return;
  var pretty = !!(r.pretty || zd.pretty);
  var female = !!(r.female || zd.female);
  var tease = zd.state === "tease";
  var burning = zd.burn > 0;
  var burnPanic = burning && zd.panicT > 0;
  var chaseMul = burnPanic ? 15 : burning ? 7.5 : tease ? 1.6 : zd.type === "runner" ? 11 : zd.type === "brute" ? 3.6 : pretty ? 4.2 : 5.0;
  var ph = (zd.phase += dt * (zd.state === "chase" || zd.state === "flank" || tease ? chaseMul : zd.state === "attack" ? 3.2 : 2.2));
  var hasHead = limbAttached(zd, "head") && r.head && r.head.parent;
  var hasAL = armOK(zd, "armL"),
    hasAR = armOK(zd, "armR"),
    hasLL = legOK(zd, "legL"),
    hasLR = legOK(zd, "legR");

  if (zd.dead) {
    zd.deadT += dt;
    var k = Math.min(1, zd.deadT / 0.75);
    var e = 1 - Math.pow(1 - k, 3);
    var side = Math.sin(zd.fallDir || 0) * 0.35;
    var fold = zd.gibbed ? 1.65 : 1.52;
    r.body.rotation.x = e * fold;
    r.body.rotation.z = e * side;
    r.body.position.y = -e * (zd.gibbed ? 36 : 28);
    r.root.position.y = zd.y - Math.max(0, zd.deadT - (zd.gibbed ? 2.2 : 3.5)) * 30;
    if (r.torso) r.torso.rotation.z = Math.sin(zd.deadT * 4) * 0.08 * (1 - k);
    if (hasAL) r.armL.sh.rotation.x = -0.4 - e * 1.2;
    if (hasAR) r.armR.sh.rotation.x = -0.4 - e * 0.85;
    if (hasLL) r.legL.hip.rotation.x = e * 0.4;
    if (hasLR) r.legR.hip.rotation.x = e * 0.55;
    // death jiggle burst
    applyJiggle(zd, false, zd.deadT * 8, dt);
    if (zd.deadT > 5.5) r.root.visible = zd.deadT < 8.2;
    if (r.eyes)
      r.eyes.forEach(function (ey) {
        if (ey && ey.parent) ey.visible = zd.deadT < 1.1 && hasHead;
      });
    if (r.aura) r.aura.intensity = legacyIntensity(Math.max(0, 0.5 - zd.deadT * 0.2), 160);
    return;
  }
  if (zd.hitFlash > 0) {
    zd.hitFlash -= dt;
    var punch = 1 + zd.hitFlash * 0.35;
    if (r.torso) r.torso.scale.setScalar(punch);
    zd.jiggle = Math.max(zd.jiggle || 0, 0.85);
  } else if (r.torso && r.torso.scale.x !== 1 && r.torso.scale.y === r.torso.scale.x)
    r.torso.scale.setScalar(1);

  var moving = zd.state === "chase" || zd.state === "wander" || zd.state === "flank";
  var sw = moving ? Math.sin(ph) : Math.sin(ph * 0.35) * 0.15;

  if (burning && !zd.crawler) {
    // A unique two-stage burn reaction: frantic, asymmetric flailing while the
    // panic timer is live, then a weakening convulsive stumble as health falls.
    var fireAmp = burnPanic ? 1 : 0.48;
    var wr = Math.sin(ph * 1.7);
    var wr2 = Math.sin(ph * 2.35 + 1.4);
    r.body.rotation.x = (burnPanic ? -0.06 : 0.38) + wr2 * 0.16 * fireAmp;
    r.body.rotation.z = wr * 0.22 * fireAmp;
    r.body.position.y = Math.abs(Math.sin(ph * 1.25)) * (burnPanic ? 7 : 3);
    if (r.torso) {
      r.torso.rotation.x = -0.12 + wr * 0.18 * fireAmp;
      r.torso.rotation.y = wr2 * 0.42 * fireAmp;
      r.torso.rotation.z = -wr * 0.2 * fireAmp;
    }
    if (hasAL) {
      r.armL.sh.rotation.x = -2.55 + wr * 0.65 * fireAmp;
      r.armL.sh.rotation.z = 0.75 + wr2 * 0.32 * fireAmp;
      r.armL.sh.rotation.y = wr2 * 0.3;
      if (r.armL.el) r.armL.el.rotation.x = -0.25 - Math.abs(wr2) * 0.75;
    }
    if (hasAR) {
      r.armR.sh.rotation.x = -2.35 - wr2 * 0.72 * fireAmp;
      r.armR.sh.rotation.z = -0.8 - wr * 0.3 * fireAmp;
      r.armR.sh.rotation.y = -wr * 0.3;
      if (r.armR.el) r.armR.el.rotation.x = -0.3 - Math.abs(wr) * 0.7;
    }
    if (hasLL) {
      r.legL.hip.rotation.x = wr * (burnPanic ? 1.05 : 0.45);
      if (r.legL.knee) r.legL.knee.rotation.x = Math.max(0, -wr) * 1.05;
    }
    if (hasLR) {
      r.legR.hip.rotation.x = -wr2 * (burnPanic ? 0.9 : 0.38);
      if (r.legR.knee) r.legR.knee.rotation.x = Math.max(0, wr2) * 0.9;
    }
    if (hasHead) {
      r.head.rotation.x = -0.42 + wr2 * 0.24;
      r.head.rotation.z = wr * 0.3;
    }
    zd.jiggle = Math.max(zd.jiggle || 0, burnPanic ? 0.52 : 0.25);
  } else if (zd.crawler) {
    r.body.rotation.x = 1.32;
    r.body.position.y = 22;
    if (hasAL) {
      r.armL.sh.rotation.x = -1.5 + sw * 0.95;
      if (r.armL.el) r.armL.el.rotation.x = -0.9;
    }
    if (hasAR) {
      r.armR.sh.rotation.x = -1.5 - sw * 0.95;
      if (r.armR.el) r.armR.el.rotation.x = -0.9;
    }
    if (r.torso) r.torso.rotation.z = sw * 0.18;
    if (hasHead) r.head.rotation.x = -0.35;
  } else if (zd.grabbing) {
    // intimate grab pose — pressed close, hips rolling
    r.body.rotation.x = 0.2;
    r.body.position.y = Math.sin(Z.t * 10) * 2;
    if (r.torso) {
      r.torso.rotation.z = Math.sin(Z.t * 9) * 0.14;
      r.torso.rotation.y = Math.sin(Z.t * 5) * 0.1;
    }
    if (hasAL) {
      r.armL.sh.rotation.x = -2.2;
      r.armL.sh.rotation.z = 0.5;
      if (r.armL.el) r.armL.el.rotation.x = -0.2;
    }
    if (hasAR) {
      r.armR.sh.rotation.x = -2.15;
      r.armR.sh.rotation.z = -0.5;
      if (r.armR.el) r.armR.el.rotation.x = -0.2;
    }
    if (hasHead) r.head.rotation.x = 0.35;
    zd.jiggle = Math.max(zd.jiggle || 0, 0.4);
  } else if (tease) {
    // brief pause / head-tilt lure — still undead, not a pin-up
    var tw = Math.sin(ph * 1.2);
    r.body.rotation.x = 0.12 + Math.sin(ph * 0.7) * 0.04;
    r.body.rotation.z = tw * 0.1;
    r.body.position.y = Math.abs(Math.sin(ph)) * 1.2;
    if (r.torso) {
      r.torso.rotation.y = tw * 0.12;
      r.torso.rotation.z = tw * 0.08;
      r.torso.rotation.x = 0.05;
    }
    if (hasAL) {
      r.armL.sh.rotation.x = -1.0 + tw * 0.15;
      r.armL.sh.rotation.z = 0.45;
      if (r.armL.el) r.armL.el.rotation.x = -0.7;
    }
    if (hasAR) {
      r.armR.sh.rotation.x = -0.95 - tw * 0.15;
      r.armR.sh.rotation.z = -0.45;
      if (r.armR.el) r.armR.el.rotation.x = -0.7;
    }
    if (hasLL) r.legL.hip.rotation.x = 0.1 + tw * 0.06;
    if (hasLR) r.legR.hip.rotation.x = -0.2 - tw * 0.05;
    if (hasHead) {
      r.head.rotation.x = 0.05;
      r.head.rotation.z = tw * 0.08;
    }
  } else if (zd.windup > 0) {
    // attack wind-up: lean back, arms raised for the swipe
    var wk = clamp(1 - zd.windup / 0.55, 0, 1);
    r.body.rotation.x = 0.05 - wk * 0.25;
    r.body.position.y = wk * 4;
    if (r.torso) {
      r.torso.rotation.x = -wk * 0.2;
      r.torso.rotation.y = Math.sin(Z.t * 20) * 0.04;
    }
    if (hasAL) {
      r.armL.sh.rotation.x = -2.4 - wk * 0.3;
      r.armL.sh.rotation.z = 0.5 + wk * 0.3;
      if (r.armL.el) r.armL.el.rotation.x = -0.3;
    }
    if (hasAR) {
      r.armR.sh.rotation.x = -2.3 - wk * 0.35;
      r.armR.sh.rotation.z = -0.5 - wk * 0.3;
      if (r.armR.el) r.armR.el.rotation.x = -0.3;
    }
    if (hasLL) r.legL.hip.rotation.x = 0.2;
    if (hasLR) r.legR.hip.rotation.x = -0.15;
    if (hasHead) r.head.rotation.x = -0.25;
  } else {
    // classic uneven shamble — dragging foot, heavy lean, clawing arms
    var hunch = zd.type === "brute" ? 0.18 : zd.type === "runner" ? 0.22 : 0.28;
    if (pretty) hunch *= 0.85;
    var limp = 0.12; // permanent limp bias
    r.body.rotation.x = hunch + Math.sin(ph * 0.5) * 0.07;
    r.body.rotation.z = Math.sin(ph * 0.5) * (zd.type === "runner" ? 0.14 : 0.12) + limp * 0.3;
    r.body.position.y = Math.abs(Math.sin(ph)) * (moving ? (zd.type === "runner" ? 5.2 : 4.2) : 0.8);
    // asymmetric stride: right leg drags
    if (hasLL) {
      r.legL.hip.rotation.x = sw * (zd.type === "runner" ? 0.9 : 0.7);
      if (r.legL.knee) r.legL.knee.rotation.x = Math.max(0, -sw) * 0.85;
    }
    if (hasLR) {
      r.legR.hip.rotation.x = -sw * (zd.type === "runner" ? 0.55 : 0.4) - limp;
      if (r.legR.knee) r.legR.knee.rotation.x = Math.max(0, sw) * 0.35 + limp * 0.5;
    }
    // clawing reach
    var reach = zd.state === "chase" || zd.state === "flank" ? -1.45 : -0.55;
    if (zd.cool > 0.55) reach = -0.25; // recovery after swipe
    if (hasAL) {
      r.armL.sh.rotation.x = reach + sw * 0.32 + Math.sin(ph * 1.3) * 0.08;
      r.armL.sh.rotation.z = 0.28 + (zd.cool > 0.5 ? 0.15 : 0);
      r.armL.sh.rotation.y = Math.sin(ph * 0.8) * 0.1;
      if (r.armL.el) r.armL.el.rotation.x = -0.65 - Math.abs(sw) * 0.25;
    }
    if (hasAR) {
      r.armR.sh.rotation.x = reach - sw * 0.28 + Math.sin(ph * 1.1 + 1) * 0.08;
      r.armR.sh.rotation.z = -0.32 - (zd.cool > 0.5 ? 0.15 : 0);
      r.armR.sh.rotation.y = Math.sin(ph * 0.8 + 0.5) * 0.1;
      if (r.armR.el) r.armR.el.rotation.x = -0.6 - Math.abs(sw) * 0.22;
    }
    if (r.torso) {
      r.torso.rotation.z = sw * 0.14;
      r.torso.rotation.y = sw * 0.18;
      r.torso.rotation.x = Math.sin(ph * 0.6) * 0.05;
    }
    if (hasHead) r.head.rotation.x = zd.type === "screamer" ? -0.2 : 0.08 + Math.sin(ph * 0.4) * 0.06;
  }

  // head tracks player with lolling undead tilt
  if (r.neck && r.neck.parent) {
    var toP = Math.atan2(Z.p.x - zd.x, Z.p.z - zd.z) - zd.head;
    while (toP > Math.PI) toP -= 6.283;
    while (toP < -Math.PI) toP += 6.283;
    r.neck.rotation.y = zd.alerted || tease ? clamp(toP, -0.95, 0.95) : Math.sin(ph * 0.3) * 0.55;
    r.neck.rotation.z = Math.sin(ph * 0.23) * 0.32 + (zd.alerted ? 0.05 : 0.22);
    if (zd.stagger > 0) r.neck.rotation.x = -zd.stagger * 0.45;
    else r.neck.rotation.x = Math.sin(ph * 0.35) * 0.12;
  }
  if (zd.stagger > 0) {
    r.body.rotation.x -= zd.stagger * 1.15;
    r.body.position.y -= zd.stagger * 7;
    zd.jiggle = Math.max(zd.jiggle || 0, zd.stagger);
  }

  applyJiggle(zd, moving || tease, ph, dt);

  var eGlow = tease ? 1.4 : zd.alerted ? 1.15 : 0.4;
  if (r.eyes && hasHead)
    r.eyes.forEach(function (ey, i) {
      if (!ey || !ey.parent) return;
      var pulse = 0.85 + 0.35 * Math.sin(Z.t * (tease ? 6 : zd.alerted ? 11 : 5) + zd.phase + i);
      ey.scale.setScalar(eGlow * pulse * (i >= 2 ? 1.35 : 1));
    });
  if (r.rim) r.rim.intensity = legacyIntensity((zd.alerted ? 0.45 : 0.18) * (0.8 + 0.2 * Math.sin(Z.t * 6 + zd.phase)), r.rim.distance);
}

export function stepZedVisuals(zd, dt) {
  if (!zd || !zd.root) return;
  // A dead rig still settles, but only its final pose for this rendered frame
  // matters. Live distant rigs retain a reduced animation cadence, and Fast
  // drops that further so a full horde is not posed 60 times a second.
  if (zd.dead) {
    animZed(zd, dt);
    return;
  }
  zd.animT += dt;
  var q = nsQuality();
  var animStep = 0;
  if (q === 0) animStep = zd.dist > 280 ? 0.08 : zd.dist > 140 ? 0.04 : 0;
  else if (zd.dist > 750) animStep = 0.05;
  if (!animStep || zd.animT >= animStep) {
    animZed(zd, zd.animT);
    zd.animT = 0;
  }
}

export function stepZed(zd, dt, deferVisuals) {
  if (zd.burn > 0) stepBurn(zd, dt);
  if (zd.dead) {
    zd.deadT += dt;
    if (zd.deadT > 9) {
      removeZed(zd);
      return;
    }
    if (!deferVisuals) stepZedVisuals(zd, dt);
    return;
  }
  var dx = Z.p.x - zd.x,
    dz = Z.p.z - zd.z,
    dist = Math.hypot(dx, dz);
  zd.dist = dist;
  if (zd.stagger > 0) zd.stagger -= dt;
  if (zd.cool > 0) zd.cool -= dt;
  zd.grabbing = false;

  // --- perception (runners hear better, brutes see less but never forget)
  if (!zd.alerted) {
    var seeR = zd.type === "runner" ? 1100 : zd.type === "brute" ? 700 : 950;
    var hearsR = Z.p.sprint ? 700 : Z.p.crouch ? 110 : 340;
    if (zd.type === "runner") hearsR *= 1.25;
    var sees = dist < seeR && losClear(zd.x, zd.z, Z.p.x, Z.p.z);
    // flashlight beam can reveal you: if flashlight is on and pointing roughly at them
    if (!sees && Z.flash && Z.flash.on && dist < 900) {
      var fx = Math.sin(Z.p.yaw),
        fz = Math.cos(Z.p.yaw),
        tdx = (zd.x - Z.p.x) / (dist || 1),
        tdz = (zd.z - Z.p.z) / (dist || 1);
      if (tdx * fx + tdz * fz > 0.82) sees = true;
    }
    var hears = dist < hearsR;
    if (sees || hears) {
      zd.alerted = true;
      zd.state = "chase";
      hooks.sndGrowl && hooks.sndGrowl(zd, true);
      if (zd.type === "screamer") screamerCall(zd);
    }
  } else if (dist > 1800 && !losClear(zd.x, zd.z, Z.p.x, Z.p.z)) {
    if ((zd.lost = (zd.lost || 0) + dt) > (zd.type === "brute" ? 10 : 5.5)) {
      zd.alerted = false;
      zd.state = "wander";
      zd.lost = 0;
    }
  } else zd.lost = 0;

  // --- siren tease: hold mid-range and pose to spike player distraction
  if (zd.alerted && zd.siren && !Z.p.dead && !zd.crawler && zd.stagger <= 0) {
    if (dist > 140 && dist < 520 && losClear(zd.x, zd.z, Z.p.x, Z.p.z)) {
      zd.teaseT = (zd.teaseT || 0) + dt;
      // enter tease in waves
      if (zd.teaseT > 0.4 && (zd.state === "chase" || zd.state === "tease" || zd.state === "flank")) {
        if (zd.state !== "tease" && rnd() < dt * 1.8) {
          zd.state = "tease";
          zd.teaseMax = rr(2.0, 3.6);
          zd.teaseT = 0;
          hooks.sndGrowl && hooks.sndGrowl(zd, false);
          if (hooks.say && rnd() < 0.4) hooks.say(t("z_distract"), 1.1);
        }
      }
      // leave tease after a beat or if player gets close
      if (zd.state === "tease" && (zd.teaseT > (zd.teaseMax || 2.5) || dist < 160)) {
        zd.state = "chase";
        zd.teaseT = 0;
      }
    } else if (zd.state === "tease") {
      zd.state = "chase";
      zd.teaseT = 0;
    }
  }

  // --- attack / grab
  var reach = (zd.type === "brute" ? 92 : 78) * zd.rig.scale;
  if (zd.alerted && dist < reach && !Z.p.dead) {
    if (zd.state === "tease") zd.state = "chase";
    // grab: if player is cornered / standing still in face-hug range
    // pretty undead grab faster and hold longer (more "distracting")
    var grabNeed = zd.pretty || zd.female ? 0.35 : 0.55;
    if (dist < reach * 0.78 && zd.cool <= 0 && Z.p.speedK < 0.35) {
      zd.grabT = (zd.grabT || 0) + dt;
      if (zd.grabT > grabNeed) {
        zd.grabbing = true;
        hooks.hurtPlayer && hooks.hurtPlayer(zd.dmg * 0.35 * dt * 4, zd);
        if (Z.p) {
          Z.p.stam = Math.max(0, Z.p.stam - dt * 28);
          // intimate grab spikes distraction hard
          Z.p.distract = Math.min(1, (Z.p.distract || 0) + dt * (zd.distract || 0.5) * 1.8);
        }
        zd.jiggle = Math.max(zd.jiggle || 0, 0.7);
      }
    } else zd.grabT = Math.max(0, (zd.grabT || 0) - dt * 2);

    if (!zd.grabbing) {
      if (zd.windup > 0) {
        zd.windup -= dt;
        if (zd.windup <= 0) {
          // the swipe lands only if you're still in range — backpedalling works
          if (Math.hypot(Z.p.x - zd.x, Z.p.z - zd.z) < reach + 24) {
            var dmgMul = zd.type === "brute" ? 1.1 : 1;
            hooks.hurtPlayer && hooks.hurtPlayer(zd.dmg * dmgMul, zd);
            hooks.sndSwipe && hooks.sndSwipe(zd, true);
          } else hooks.sndSwipe && hooks.sndSwipe(zd, false);
          zd.cool = zd.rate;
        }
      } else if (zd.cool <= 0) {
        zd.windup = zd.type === "runner" ? 0.28 : zd.type === "brute" ? 0.55 : 0.4;
        hooks.sndGrowl && hooks.sndGrowl(zd, false);
      }
    }
    zd.state = "attack";
  } else if (zd.alerted) {
    zd.grabT = 0;
    // don't stomp siren tease / existing flank
    if (zd.state !== "tease") {
      // flanking: some zombies peel off to approach from the side when crowded
      zd.crowdT -= dt;
      if (zd.crowdT <= 0) {
        zd.crowdT = 0.12;
        zd.frontCount = 0;
        for (var fi = 0; fi < Z.zeds.length; fi++) {
          var oz = Z.zeds[fi];
          if (oz === zd || oz.dead || !oz.alerted) continue;
          // measure directly: oz.dist is only refreshed when that zed steps,
          // so half the horde would be judged on last frame's positions
          if (Math.hypot(oz.x - Z.p.x, oz.z - Z.p.z) < 200) zd.frontCount++;
        }
      }
      if (zd.frontCount >= 2 && dist > 140 && dist < 700 && rnd() < dt * 0.8) {
        zd.state = "flank";
        var side = zd.flankSign || (rnd() < 0.5 ? -1 : 1);
        zd.flankSign = side;
        var px = Math.sin(Z.p.yaw),
          pz = Math.cos(Z.p.yaw),
          rx = -pz,
          rz = px;
        zd.flankX = Z.p.x + rx * side * rr(140, 260) - px * 40;
        zd.flankZ = Z.p.z + rz * side * rr(140, 260) - pz * 40;
      } else if (zd.state !== "flank" || dist < 120) zd.state = "chase";
    }
  } else if (zd.state !== "wander" && rnd() < dt * 0.2) {
    zd.state = "wander";
    var b = interiorBounds();
    if (b) {
      zd.wander.x = rr(b.minx + 60, b.maxx - 60);
      zd.wander.z = rr(b.minz + 60, b.maxz - 60);
    }
  }

  // --- steering
  var tx, tz;
  if (zd.burn > 0 && zd.panicT > 0) {
    // blind: it runs away from whatever last hurt it, not toward you
    tx = zd.x - (Z.p.x - zd.x);
    tz = zd.z - (Z.p.z - zd.z);
  } else if (zd.state === "tease") {
    // hold ground and face the player
    tx = zd.x;
    tz = zd.z;
  } else if (zd.state === "flank" && zd.flankX != null) {
    tx = zd.flankX;
    tz = zd.flankZ;
    if (Math.hypot(tx - zd.x, tz - zd.z) < 50) zd.state = "chase";
  } else if (zd.state === "chase" || zd.state === "attack") {
    // lead the player slightly when sprinting (runners predict)
    var lead = zd.type === "runner" ? 0.18 : 0.05;
    tx = Z.p.x + (Z.p.vx || 0) * lead;
    tz = Z.p.z + (Z.p.vz || 0) * lead;
  } else {
    tx = zd.wander.x;
    tz = zd.wander.z;
    if (Math.hypot(tx - zd.x, tz - zd.z) < 40 && rnd() < dt * 2) zd.state = "idle";
  }
  var ang = Math.atan2(tx - zd.x, tz - zd.z);
  // wall feelers: probe left/right and slide along obstacles (crude but it
  // gets them through doorways, which is all a house needs)
  zd.feel += dt;
  if (zd.feel > 0.1) {
    zd.feel = 0;
    var probe = zd.type === "brute" ? 78 : 64,
      best = ang,
      found = false;
    for (var o = 0; o <= 6 && !found; o++) {
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        var a2 = ang + sgn * o * 0.32;
        if (
          !blockedAt(
            zd.x + Math.sin(a2) * probe,
            zd.z + Math.cos(a2) * probe,
            20, zd.y, zd.crawler ? 60 : 160, STEP
          )
        ) {
          best = a2;
          found = true;
          break;
        }
        if (o === 0) break;
      }
    }
    zd.steer = best;
  }
  var mv = zd.steer != null ? zd.steer : ang;
  var spd = zd.spd * (zd.stagger > 0 ? 0.12 : 1) * (zd.state === "attack" ? 0.18 : 1);
  if (zd.state === "tease") spd *= 0.08; // almost still while posing
  if (zd.windup > 0) spd *= 0.25;
  if (zd.grabbing) spd *= 0.05;
  // on fire: a blind panic sprint first, then a failing shamble
  if (zd.burn > 0) spd *= zd.panicT > 0 ? 1.55 : 0.82;
  // sirens approach a little slower so you watch them longer
  if (zd.siren && zd.state === "chase") spd *= 0.82;
  // runners burst when they first spot you
  if (zd.type === "runner" && zd.alerted) {
    if (zd.burstT == null) zd.burstT = 1.8;
    if (zd.burstT > 0) {
      zd.burstT -= dt;
      spd *= 1.22;
    }
  }
  _zedMovePoint.x = zd.x;
  _zedMovePoint.z = zd.z;
  var zR = zd.crawler ? 18 : zd.type === "brute" ? 26 : 22;
  moveCircle(
    _zedMovePoint,
    Math.sin(mv) * spd * dt,
    Math.cos(mv) * spd * dt,
    zR,
    zd.y,
    zd.crawler ? 60 : 160,
    STEP
  );
  zd.x = _zedMovePoint.x;
  zd.z = _zedMovePoint.z;
  // Separation is stable at 15–20 Hz; running this O(n²) pass every rendered
  // frame was wasted CPU in hordes.
  zd.sepT -= dt;
  if (zd.sepT <= 0) {
    zd.sepT = 0.06;
    for (var s = 0; s < Z.zeds.length; s++) {
      var ot = Z.zeds[s];
      if (ot === zd || ot.dead) continue;
      var sx = zd.x - ot.x,
        sz = zd.z - ot.z,
        sd = Math.hypot(sx, sz),
        minD = zd.type === "brute" ? 52 : 40;
      if (sd < minD && sd > 0.01) {
        var push = (minD - sd) * 0.55;
        zd.x += (sx / sd) * push;
        zd.z += (sz / sd) * push;
      }
    }
  }
  // open doors by walking into them (brutes smash faster)
  zd.doorT -= dt;
  if (Z.col && zd.alerted && zd.doorT <= 0) {
    zd.doorT = 0.16;
    Z.col.doorSegs.forEach(function (ds) {
      if (!ds.pivot || ds.pivot.userData.open) return;
      var mx = (ds.ax + ds.bx) / 2,
        mz = (ds.az + ds.bz) / 2;
      // check if blocked by an active barricade
      if (Z.barricades && Z.barricades.some(function (b) { return Math.hypot(b.mx - mx, b.mz - mz) < 40; })) return;
      var need = zd.type === "brute" || zd.type === "titan" ? 100 : 68;
      if (Math.hypot(zd.x - mx, zd.z - mz) < need) {
        ds.pivot.userData.open = true;
        Z.doorsOpened.push(ds.pivot);
        hooks.sndDoor && hooks.sndDoor(mx, mz);
        if (zd.type === "brute" || zd.type === "titan") {
          shake(0.35);
          sparkBurst(mx, 100, mz, 0, 1, 0, 10, true);
        }
      }
    });
  }

  // attack barricades if nearby
  if (Z.barricades && Z.barricades.length && zd.alerted) {
    for (var bi = Z.barricades.length - 1; bi >= 0; bi--) {
      var bar = Z.barricades[bi];
      var bDist = Math.hypot(zd.x - bar.mx, zd.z - bar.mz);
      if (bDist < (zd.type === "titan" || zd.type === "brute" ? 95 : 75)) {
        bar.hp -= (zd.dmg || 15) * dt * 2.2;
        if (Math.random() < dt * 6) {
          sparkBurst(bar.mx, 80, bar.mz, 0, 1, 0, 4, true);
        }
        if (bar.hp <= 0) {
          if (bar.mesh && Z.grp) Z.grp.remove(bar.mesh);
          Z.barricades.splice(bi, 1);
          shake(0.35);
          hooks.sndDoor && hooks.sndDoor(bar.mx, bar.mz);
        }
      }
    }
  }

  if (zd.type === "titan" && dist < 1200) {
    zd.titanStepT = (zd.titanStepT || 0) + dt;
    if (zd.titanStepT > 0.65) {
      zd.titanStepT = 0;
      shake(0.18);
    }
  }

  // ground follow (they climb onto furniture the same way the player does)
  var g = groundAt(zd.x, zd.z, zd.y, STEP);
  if (g > zd.y) zd.y = Math.min(g, zd.y + 200 * dt);
  else {
    zd.vy -= GRAV * dt;
    zd.y += zd.vy * dt;
    if (zd.y <= g) {
      zd.y = g;
      zd.vy = 0;
    }
  }
  // face travel (or face player while teasing / attacking)
  var facePlayer = Math.atan2(Z.p.x - zd.x, Z.p.z - zd.z);
  var face = zd.state === "tease" || zd.state === "attack" || zd.grabbing ? facePlayer : mv;
  var dh = face - zd.head;
  while (dh > Math.PI) dh -= 6.283;
  while (dh < -Math.PI) dh += 6.283;
  zd.head += dh * Math.min(1, dt * (zd.state === "tease" ? 4 : zd.type === "runner" ? 9 : 6));
  zd.root.position.set(zd.x, zd.y, zd.z);
  zd.root.rotation.y = zd.head;

  // idle growls, panned in 3D
  zd.growlT -= dt;
  if (zd.growlT <= 0) {
    zd.growlT = rr(2.2, 7.5) / (zd.alerted ? 2.2 : 1);
    if (dist < 1500) hooks.sndGrowl && hooks.sndGrowl(zd, false);
  }
  if (!deferVisuals) stepZedVisuals(zd, dt);
}
