/* Night Shift zombie removal, burning, screamer noise and acid clouds, split
   out of js/zombies_world.js. It shares the editor's state through live imports
   from ../zombies_world.js. */
import * as THREE from "three";
import { legacyIntensity } from "../gpu.js";
import { t } from "../i18n.js";
import { alertCritters } from "../zombies_critters.js";
import { GRAV, Z, hooks, rnd, rr } from "../zombies_state.js";
import { spawnFirePart, spawnPart } from "../zombies_world/fx_gore.js";
import { ownsGeo } from "../zombies_world/zombie_build.js";
import { killZed } from "../zombies_world/zombie_damage_anim.js";
import {
  ACID_CLOUDS, WEATHER, nsQuality, set_ACID_CLOUDS,
} from "../zombies_world.js";

export function removeZed(zd) {
  Z.grp.remove(zd.root);
  zd.root.traverse(function (o) {
    if (o.isMesh && ownsGeo(o.geometry)) o.geometry.dispose();
  });
  var i = Z.zeds.indexOf(zd);
  if (i >= 0) Z.zeds.splice(i, 1);
}

/* ---- fire ----------------------------------------------------------------
   A burning zombie keeps coming — that is the point of it. Fire is damage over
   time plus panic: they sprint, they flail, they light the room, and anything
   they blunder into catches too, so a corridor of them cooks itself.          */
export function igniteZed(zd, seconds) {
  if (!zd || zd.dead) return;
  var fresh = !(zd.burn > 0);
  zd.burn = Math.max(zd.burn || 0, seconds || 4);
  if (fresh) {
    zd.panicT = rr(1.4, 2.6);
    hooks.sndScream && rnd() < 0.5 && hooks.sndScream(zd);
    if (zd.rig && zd.rig.root) {
      var cap = nsQuality() === 0 ? 0 : nsQuality() === 1 ? 2 : 4;
      var lit = 0;
      for (var li = 0; li < Z.zeds.length; li++) {
        var other = Z.zeds[li];
        if (other && other !== zd && other.fireLight && other.fireLight.intensity > 0) lit++;
      }
      var fl = zd.fireLight;
      if (!fl && lit < cap) {
        fl = new THREE.PointLight(0xff6818, legacyIntensity(3.6, 420), 420, 2);
        fl.position.set(0, 100, 0);
        zd.rig.root.add(fl);
        zd.fireLight = fl;
      }
      if (fl) fl.intensity = cap > 0 ? legacyIntensity(3.6, 420) : 0;
    }
  }
}

export function stepBurn(zd, dt) {
  if (!(zd.burn > 0)) return;
  zd.burn -= dt;
  if (zd.panicT > 0) zd.panicT -= dt;
  if (zd.burn <= 0) {
    zd.burn = 0;
    zd.panicT = 0;
    if (zd.fireLight) zd.fireLight.intensity = 0;
    return;
  }
  // Layered flames rise from feet, torso, shoulders and head instead of two
  // generic dots around the whole bounding box.
  zd.fireT = (zd.fireT || 0) - dt;
  if (zd.fireT <= 0) {
    zd.fireT = nsQuality() === 0 ? 0.07 : 0.035;
    var sc = zd.rig && zd.rig.scale ? zd.rig.scale : 1;
    var levels = zd.crawler ? [20, 42, 62] : nsQuality() === 0 ? [68, 112] : [24, 68, 112, 152];
    for (var i = 0; i < levels.length; i++) {
      var wide = i === 1 || i === 2 ? 18 : 12;
      spawnFirePart(
        zd.x + rr(-wide, wide) * sc,
        zd.y + levels[i] * sc,
        zd.z + rr(-wide, wide) * sc,
        rr(-32, 32), rr(55, 125), rr(-32, 32),
        rr(18, 31) * sc, rr(0.35, 0.68), rr(0.55, 0.96)
      );
    }
    // Occasional soot and embers sell combustion without hiding the silhouette.
    if (rnd() < 0.34)
      spawnPart(
        zd.x + rr(-15, 15), zd.y + rr(80, 165) * sc, zd.z + rr(-15, 15),
        rr(-18, 18), rr(70, 125), rr(-18, 18), rr(9, 17),
        0.18, 0.13, 0.09, rr(0.55, 1.0), -GRAV * 0.05
      );
  }
  if (zd.fireLight) zd.fireLight.intensity = legacyIntensity(2.8 + Math.sin(Z.t * 26 + zd.phase) * 1.2, 420);
  if (zd.dead) return;
  // ~9 dps, and it does not care about armour or range
  zd.hp -= dt * 9;
  // fire spreads by contact: a burning body is a torch walking into a crowd
  zd.spreadT = (zd.spreadT || 0) - dt;
  if (zd.spreadT <= 0) {
    zd.spreadT = 0.25;
    for (var s = 0; s < Z.zeds.length; s++) {
      var o = Z.zeds[s];
      if (o === zd || o.dead || o.burn > 0) continue;
      if (Math.hypot(o.x - zd.x, o.z - zd.z) < 55) igniteZed(o, rr(3, 5));
    }
  }
  if (zd.hp <= 0) {
    killZed(zd, { x: 0, y: 1, z: 0 }, false, "burn");
    if (zd.burn > 0) zd.burn = 2.5; // keep smouldering on the corpse
  }
}

export function screamerCall(zd) {
  hooks.sndScream && hooks.sndScream(zd);
  Z.zeds.forEach(function (o) {
    if (o !== zd && !o.dead && Math.hypot(o.x - zd.x, o.z - zd.z) < 2200) {
      o.alerted = true;
      o.state = "chase";
    }
  });
  hooks.say && hooks.say(t("z_screamer"), 1.6);
  hooks.flashScreen && hooks.flashScreen("#7a0d18", 0.35);
  hooks.onScreamerCall && hooks.onScreamerCall(zd);
}

// gunfire draws everything nearby
export function makeNoise(x, z, radius) {
  Z.zeds.forEach(function (o) {
    if (o.dead || o.alerted) return;
    if (Math.hypot(o.x - x, o.z - z) < radius) {
      o.alerted = true;
      o.state = "chase";
    }
  });
  alertCritters(x, z, radius);
}

export function spawnAcidCloud(x, y, z) {
  ACID_CLOUDS.push({
    x: x, y: y, z: z,
    r: 30, maxR: 140,
    life: 6.5, maxLife: 6.5,
  });

  // Sound sizzle
  if (Z.audio && Z.audio.ctx && Z.audio.ctx.state === "running") {
    var ctx = Z.audio.ctx;
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(70, now + 0.5);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.52);
  }
}

export function stepAcidClouds(dt) {
  if (!Z.active || Z.paused) return;
  for (var i = ACID_CLOUDS.length - 1; i >= 0; i--) {
    var cloud = ACID_CLOUDS[i];
    cloud.life -= dt;
    var k = 1 - (cloud.life / cloud.maxLife);
    cloud.r = 30 + (cloud.maxR - 30) * Math.min(1, k * 2.2);

    // Green acid motes
    if (rnd() < 0.65) {
      spawnFirePart(
        cloud.x + rr(-cloud.r * 0.5, cloud.r * 0.5),
        cloud.y + rr(-10, 25),
        cloud.z + rr(-cloud.r * 0.5, cloud.r * 0.5),
        { x: rr(-20, 20), y: rr(15, 38), z: rr(-20, 20) },
        0.05,
        rr(18, 36)
      );
    }

    // Damage player inside cloud
    if (Z.p && !Z.p.dead) {
      var dPlayer = Math.hypot(Z.p.x - cloud.x, Z.p.z - cloud.z);
      if (dPlayer < cloud.r && Math.abs(Z.p.y - cloud.y) < 120) {
        Z.p.hp = Math.max(0, Z.p.hp - 8 * dt);
        Z.p.hurtT = Math.max(Z.p.hurtT || 0, 0.35);
        if (Z.hud && Z.hud.vig) {
          Z.hud.vig.style.setProperty("--z-green", "0.65");
        }
      }
    }

    if (cloud.life <= 0) {
      ACID_CLOUDS.splice(i, 1);
    }
  }
}

export function clearAcidClouds() {
  set_ACID_CLOUDS([]);
}

export function stepWeather(dt) {
  if (!Z.active || Z.paused) return;
  WEATHER.timer -= dt;
  if (WEATHER.timer <= 0) {
    WEATHER.timer = rr(14, 32);
    triggerLightning();
  }

  if (WEATHER.thunderDelay > 0) {
    WEATHER.thunderDelay -= dt;
    if (WEATHER.thunderDelay <= 0) {
      playThunder(WEATHER.thunderDist);
    }
  }
}

export function triggerLightning() {
  WEATHER.flashT = rr(0.12, 0.25);
  WEATHER.thunderDist = rr(800, 2400);
  WEATHER.thunderDelay = (WEATHER.thunderDist / 3400); // sound speed delay

  if (hooks.flashScreen) {
    hooks.flashScreen("#d0e4ff", WEATHER.flashT);
  }
  alertCritters(Z.p ? Z.p.x : 0, Z.p ? Z.p.z : 0, 1800);
}

function playThunder(dist) {
  if (!Z.audio || !Z.audio.ctx || Z.audio.ctx.state !== "running") return;
  var ctx = Z.audio.ctx;
  var now = ctx.currentTime;
  var osc = ctx.createOscillator();
  var filter = ctx.createBiquadFilter();
  var gain = ctx.createGain();

  var dur = rr(1.8, 3.5);
  var att = Math.max(0.1, 1 - dist / 2800);

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(rr(45, 75), now);
  osc.frequency.exponentialRampToValueAtTime(rr(25, 40), now + dur);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(180 * att, now);
  filter.frequency.exponentialRampToValueAtTime(60, now + dur);

  gain.gain.setValueAtTime(0.6 * att, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + dur + 0.1);
}

/* ===========================================================================
   SURFACE DECAL & DEBRIS QUERIES (Footstep Audio Modifiers)
   =========================================================================== */
export function isNearBloodDecal(px, pz) {
  if (!Z.decals || !Z.decals.list) return false;
  for (var i = 0; i < Z.decals.list.length; i++) {
    var d = Z.decals.list[i];
    if (d.visible && d.position.y < 5) {
      if (Math.hypot(d.position.x - px, d.position.z - pz) < 45) return true;
    }
  }
  return false;
}

export function isNearGlassDebris(px, pz) {
  if (Z.frags && Z.frags.length) {
    for (var i = 0; i < Z.frags.length; i++) {
      var f = Z.frags[i];
      if (f.g && Math.hypot(f.x - px, f.z - pz) < 55) return true;
    }
  }
  return false;
}
