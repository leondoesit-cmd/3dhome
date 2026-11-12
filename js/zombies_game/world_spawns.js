/* Night Shift camera, radar, barricades, perk stations, spawn picking, waves
   and nav markers, split out of js/zombies_game.js. It shares the editor's
   state through live imports from ../zombies_game.js. */
import * as THREE from "three";
import { pointInPoly, roomName } from "../geometry.js";
import { t } from "../i18n.js";
import { clamp, fin } from "../state.js";
import { getMainCamera } from "../view3d.js";
import { sndClick, sndHammer, sndPerk, sndPickup, sndPower, sndStinger, sndThunder } from "../zombies_game/audio.js";
import { flashScreen, hudDirty, hurtPlayer, say, wipeVisor } from "../zombies_game/hud.js";
import { jump, pauseGame, shove, unlockPointer } from "../zombies_game/input.js";
import { cycleWeapon, reload, scatterPickups, setWeapon, throwFrag } from "../zombies_game/weapons.js";
import { awardRunPoints, cameraPose, encounterCap, reachableFloor, securedCount } from "../zombies_rules.js";
import { EXTRACT_LEN, EYE, MAX_ARMOR, MAX_HP, P_CLEAR, P_RAD, REST_LEN, RUN_WAVES, SPD_WALK, STEP, Z, Z_MAX_ALIVE, pick, rnd, rr } from "../zombies_state.js";
import { Z_TYPES, blockedAt, groundAt, interiorBounds, liveRooms, losClear, spawnZed } from "../zombies_world.js";
import {
  FRAG, INTERMISSION_OFFERS, KEYMAP, MIN_SPAWN_DIST, W, W_ORDER, gameSettings,
  houseAliveCap, qualityHordeCap, spawnInsideHouse,
} from "../zombies_game.js";

function applyCamera() {
  var P = Z.p,
    cam = getMainCamera();
  var cfg = gameSettings();
  var pose = cameraPose(P, cfg, Z.cameraMotion || (Z.cameraMotion = {}), Z.lastDt || 1 / 60);
  var eye = pose.height;
  if (P.dead) eye = clamp(EYE - P.deadT * 180, 26, EYE); // the fall
  var pitch = P.pitch + pose.pitch + Z.shakeV.y * cfg.shake + (P.dead ? Math.min(0.9, P.deadT * 0.5) : 0);
  var yaw = P.yaw + Z.shakeV.x * cfg.shake;
  cam.position.set(P.x, P.y + eye, P.z);
  var dx = Math.cos(pitch) * Math.sin(yaw),
    dy = Math.sin(pitch),
    dz = Math.cos(pitch) * Math.cos(yaw);
  cam.up.set(0, 1, 0);
  cam.lookAt(P.x + dx * 400, P.y + eye + dy * 400, P.z + dz * 400);
  // roll: lean into strafing, tilt hard when dying
  var strafe = (Z.keys.right ? 1 : 0) - (Z.keys.left ? 1 : 0);
  cam.rotateZ((P.dead ? Math.min(1.2, P.deadT * 0.8) : 0) + strafe * -0.008 * cfg.bob + pose.roll);
  // FOV punch: aim tightens, sprint opens up, hurt/adrenal/distract pulses
  if (Z.baseFov == null) Z.baseFov = cam.fov || 60;
  var want = pose.fov;
  // frame-rate independent approach (~0.18 per 60Hz frame)
  cam.fov += (want - cam.fov) * (1 - Math.pow(0.82, (Z.lastDt || 1 / 60) * 60));
  cam.updateProjectionMatrix();
}

/* ===========================================================================
   10b. TACTICAL RADAR, BARRICADES, PERKS & POWER GRID
   =========================================================================== */
function initRadar() {
  var c = Z.hud && Z.hud.radar;
  if (!c) return;
  c.width = 110;
  c.height = 110;
  Z.radarCtx = c.getContext("2d");
}

function stepRadar() {
  if (!Z.hud || !Z.radarCtx || !Z.p) return;
  if (Z.t < (Z.radarNext || 0)) return;
  Z.radarNext = Z.t + 0.1;
  var ctx = Z.radarCtx;
  var w = 110, h = 110, cx = 55, cy = 55;
  ctx.clearRect(0, 0, w, h);

  // radar backdrop
  ctx.fillStyle = "rgba(10, 16, 24, 0.75)";
  ctx.beginPath();
  ctx.arc(cx, cy, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(40, 100, 140, 0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // radar sweep pulse ring
  var sweepR = ((Z.t * 32) % 50);
  ctx.strokeStyle = "rgba(60, 180, 240, " + (0.35 * (1 - sweepR / 50)) + ")";
  ctx.beginPath();
  ctx.arc(cx, cy, sweepR, 0, Math.PI * 2);
  ctx.stroke();

  var scale = 0.038;
  var P = Z.p;

  // nearby barricades
  if (Z.barricades) {
    ctx.strokeStyle = "#ffc23c";
    ctx.lineWidth = 2;
    Z.barricades.forEach(function (b) {
      var dx = (b.mx - P.x) * scale;
      var dz = (b.mz - P.z) * scale;
      if (Math.hypot(dx, dz) < 46) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dz, 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }

  // fusebox
  if (Z.fuseBox && Z.blackout) {
    var fdx = (Z.fuseBox.x - P.x) * scale;
    var fdz = (Z.fuseBox.z - P.z) * scale;
    if (Math.hypot(fdx, fdz) < 46) {
      ctx.fillStyle = Math.sin(Z.t * 8) > 0 ? "#ff2040" : "#ff8800";
      ctx.beginPath();
      ctx.arc(cx + fdx, cy + fdz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The cyan pulse is always a real place in this floor plan: the room being
  // held now, or the room selected as the final extraction point.
  var nav = Z.wave && Z.wave.state === "extract" ? Z.extraction : Z.objective;
  if (nav && !nav.completed && fin(nav.x) && fin(nav.z)) {
    var ndx = (nav.x - P.x) * scale, ndz = (nav.z - P.z) * scale;
    var nd = Math.hypot(ndx, ndz);
    if (nd > 45) {
      ndx *= 45 / nd;
      ndz *= 45 / nd;
    }
    ctx.strokeStyle = "#53e7ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + ndx, cy + ndz, 3.5 + Math.sin(Z.t * 5), 0, Math.PI * 2);
    ctx.stroke();
  }

  // living zombies
  if (Z.zeds) {
    Z.zeds.forEach(function (z) {
      if (z.dead) return;
      var zdx = (z.x - P.x) * scale;
      var zdz = (z.z - P.z) * scale;
      if (Math.hypot(zdx, zdz) < 46) {
        ctx.beginPath();
        var r = z.boss ? 4.5 : 2.5;
        ctx.fillStyle = z.boss ? "#ff0055" : (z.type === "screamer" ? "#aa44ff" : "#ff2a3a");
        ctx.arc(cx + zdx, cy + zdz, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // player green arrow
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-P.yaw + Math.PI);
  ctx.fillStyle = "#20e870";
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(4, 5);
  ctx.lineTo(0, 3);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function getNearestDoorSeg() {
  if (!Z.col || !Z.col.doorSegs || !Z.p) return null;
  var P = Z.p, nearest = null, minDist = Z.touchMode ? 155 : 115;
  Z.col.doorSegs.forEach(function (ds) {
    var mx = (ds.ax + ds.bx) / 2, mz = (ds.az + ds.bz) / 2;
    var d = Math.hypot(P.x - mx, P.z - mz);
    if (d < minDist) {
      minDist = d;
      nearest = ds;
    }
  });
  return nearest;
}

function buildBarricadeAt(ds) {
  var mx = (ds.ax + ds.bx) / 2, mz = (ds.az + ds.bz) / 2;
  var existing = Z.barricades && Z.barricades.find(function (b) {
    return Math.hypot(b.mx - mx, b.mz - mz) < 40;
  });
  if (existing) {
    if (existing.hp >= existing.maxHp) {
      say(t("z_barricaded"), 1.0);
      return;
    }
    existing.hp = existing.maxHp;
    sndHammer();
    say(t("z_barricaded"), 1.0);
    return;
  }

  var grp = new THREE.Group();
  var dx = ds.bx - ds.ax, dz = ds.bz - ds.az;
  var len = Math.hypot(dx, dz) || 85;
  var angle = Math.atan2(dx, dz);
  grp.position.set(mx, 0, mz);
  grp.rotation.y = angle + Math.PI / 2;

  var mat = new THREE.MeshStandardMaterial({
    color: 0x6e4a28,
    roughness: 0.85,
    metalness: 0.05,
  });
  for (var i = 0; i < 4; i++) {
    var plank = new THREE.Mesh(new THREE.BoxGeometry(len * 1.04, 13, 3.5), mat);
    plank.position.y = 35 + i * 36 + (rnd() - 0.5) * 5;
    plank.rotation.z = (rnd() - 0.5) * 0.1;
    plank.castShadow = true;
    grp.add(plank);
  }
  if (Z.grp) Z.grp.add(grp);
  if (!Z.barricades) Z.barricades = [];
  Z.barricades.push({
    id: ds.id || ("bar_" + Math.random()),
    mx: mx, mz: mz,
    ax: ds.ax, az: ds.az, bx: ds.bx, bz: ds.bz,
    hp: 220, maxHp: 220,
    mesh: grp,
  });
  sndHammer();
  flashScreen("#ffb850", 0.08);
  awardRunPoints(Z, 20);
  say(t("z_barricaded"), 1.2);
  hudDirty();
}

/* Clearance from the nearest collision wall (or door leaf) at plan position —
   keeps spawned stations out of the partitions they were placed next to. */
function wallClearAt(x, z) {
  if (!Z.col) return Infinity;
  var best = Infinity;
  [Z.col.segs || [], Z.col.doorSegs || []].forEach(function (list) {
    for (var i = 0; i < list.length; i++) {
      var s = list[i],
        dx = s.bx - s.ax,
        dz = s.bz - s.az,
        len2 = dx * dx + dz * dz || 1;
      var u = ((x - s.ax) * dx + (z - s.az) * dz) / len2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      var d = Math.hypot(s.ax + dx * u - x, s.az + dz * u - z) - (s.half || 0);
      if (d < best) best = d;
    }
  });
  return best;
}

/* First candidate spot with enough elbow room (the pedestal is ~18 cm radius
   and the player has to stand next to it), else the room centre. */
function perkStationSpot(rm, idx) {
  if (!rm) return { x: idx * 90, z: 0 };
  var candidates = [
    { x: rm.cx + (idx === 1 ? 65 : idx === 2 ? -65 : 0), z: rm.cz + (idx === 1 ? -65 : idx === 2 ? 65 : 0) },
    { x: rm.cx + 95, z: rm.cz },
    { x: rm.cx - 95, z: rm.cz },
    { x: rm.cx, z: rm.cz + 95 },
    { x: rm.cx, z: rm.cz - 95 },
    { x: rm.cx, z: rm.cz },
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (wallClearAt(candidates[i].x, candidates[i].z) >= 45) return candidates[i];
  }
  return { x: rm.cx, z: rm.cz };
}

function spawnPerkStations() {
  if (Z.perkStations && Z.perkStations.length) return;
  Z.perkStations = [];
  var rooms = liveRooms();
  var pdefs = [
    { kind: "speed", cost: 500, col: 0x22d060, key: "z_perk_speed" },
    { kind: "jugg", cost: 750, col: 0xd02230, key: "z_perk_jugg" },
    { kind: "damage", cost: 600, col: 0xe0a010, key: "z_perk_damage" },
  ];
  pdefs.forEach(function (pdef, idx) {
    var rm = rooms[idx % Math.max(1, rooms.length)];
    var spot = perkStationSpot(rm, idx),
      px = spot.x,
      pz = spot.z;
    var grp = new THREE.Group();
    grp.position.set(px, 30, pz);

    var pedMat = new THREE.MeshStandardMaterial({ color: 0x1e2228, metalness: 0.6, roughness: 0.4 });
    var ped = new THREE.Mesh(new THREE.CylinderGeometry(14, 18, 55, 12), pedMat);
    ped.position.y = 0;
    grp.add(ped);

    var bMat = new THREE.MeshStandardMaterial({
      color: pdef.col,
      emissive: pdef.col,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.1,
    });
    var bottle = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 20, 10), bMat);
    bottle.position.y = 36;
    grp.add(bottle);

    var pl = new THREE.PointLight(pdef.col, 0.5, 140);
    pl.position.y = 40;
    grp.add(pl);

    if (Z.grp) Z.grp.add(grp);
    Z.perkStations.push({
      kind: pdef.kind,
      cost: pdef.cost,
      col: pdef.col,
      key: pdef.key,
      x: px, y: 30, z: pz,
      mesh: grp,
      bottle: bottle,
    });
  });
}

function buyPerk(st) {
  if (Z.perks && Z.perks[st.kind]) {
    say(t(st.key) + " (" + t("z_perk_active") + ")", 1.2);
    return;
  }
  if ((Z.credits || 0) < st.cost) {
    say(t(st.key) + " — " + t("z_cost_pts", { n: st.cost }), 1.4);
    return;
  }
  Z.credits -= st.cost;
  if (!Z.perks) Z.perks = {};
  Z.perks[st.kind] = true;

  if (st.kind === "jugg") {
    if (Z.p) {
      Z.p.hp = 150;
      Z.p.armor = Math.max(Z.p.armor || 0, 50);
    }
  }

  sndPerk();
  flashScreen("#" + st.col.toString(16).padStart(6, "0"), 0.22);
  say(t("z_perk_acquired", { p: t(st.key) }), 2.2);
  hudDirty();
}

function spawnFuseBox() {
  if (Z.fuseBox && Z.fuseBox.mesh) return;
  var rooms = liveRooms();
  var r = rooms.length > 1 ? rooms[1] : rooms[0];
  var fx = r ? r.cx : 0, fz = r ? r.cz : 0;
  var reachable = farthestRoom().route;
  var fuseSpot = reachable.reduce(function (best, pt) {
    return Math.hypot(pt.x - fx, pt.z - fz) < Math.hypot(best.x - fx, best.z - fz) ? pt : best;
  }, reachable[0]);
  fx = fuseSpot.x; fz = fuseSpot.z;
  var grp = new THREE.Group();
  grp.position.set(fx, 130, fz);

  var boxMat = new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: 0.8, roughness: 0.3 });
  var box = new THREE.Mesh(new THREE.BoxGeometry(30, 42, 10), boxMat);
  grp.add(box);

  var ledMat = new THREE.MeshBasicMaterial({ color: 0xff1020 });
  var led = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 8), ledMat);
  led.position.set(0, 8, 6);
  grp.add(led);

  var light = new THREE.PointLight(0xff2020, 0.8, 120);
  light.position.set(0, 8, 9);
  grp.add(light);

  if (Z.grp) Z.grp.add(grp);
  Z.fuseBox = {
    x: fx, y: 130, z: fz,
    mesh: grp, led: ledMat, light: light,
  };
}

function triggerBlackout() {
  Z.blackout = true;
  if (!Z.fuseBox) spawnFuseBox();
  if (Z.fuseBox) {
    Z.fuseBox.led.color.setHex(0xff1020);
    Z.fuseBox.light.color.setHex(0xff2020);
    Z.fuseBox.light.intensity = 0.8;
  }
  // the surge bites the flashlight too — without this the event is cosmetic
  if (Z.flash) Z.flash.batt = Math.min(Z.flash.batt, 45);
  say(t("z_event_blackout"), 3.0);
  flashScreen("#000000", 0.5);
  sndStinger();
}

/* `manual` is the fuse-box interaction: only that pays the bonus and makes
   the announcement. Wave clear also ends the blackout, silently — the wave
   reward line already covers it. */
function restorePower(manual) {
  if (!Z.blackout) return;
  Z.blackout = false;
  if (Z.fuseBox) {
    Z.fuseBox.led.color.setHex(0x20e850);
    Z.fuseBox.light.color.setHex(0x20e850);
    Z.fuseBox.light.intensity = 0.4;
  }
  sndPower();
  if (manual) {
    awardRunPoints(Z, 150);
    say(t("z_power_restored"), 2.0);
  }
  flashScreen("#20e870", 0.18);
  hudDirty();
}

function updateInteractPrompt() {
  if (!Z.p || Z.p.dead) {
    Z.interactPrompt = "";
    return;
  }
  var P = Z.p;
  var prompt = "";
  // 1. Fuse box
  var reach = Z.touchMode ? 135 : 95;
  if (Z.fuseBox && Z.blackout && Math.hypot(P.x - Z.fuseBox.x, P.z - Z.fuseBox.z) < reach) {
    prompt = t("z_prompt_fusebox");
  }
  // 2. Perk stations
  if (!prompt && Z.perkStations) {
    for (var psi = 0; psi < Z.perkStations.length; psi++) {
      var pst = Z.perkStations[psi];
      if (Math.hypot(P.x - pst.x, P.z - pst.z) < (Z.touchMode ? 125 : 85)) {
        prompt = (Z.perks && Z.perks[pst.kind])
          ? t(pst.key) + " (" + t("z_perk_active") + ")"
          : t("z_prompt_perk", { name: t(pst.key), cost: pst.cost });
        break;
      }
    }
  }
  // 3. Barricade doorway
  if (!prompt) {
    var nearDoor = getNearestDoorSeg();
    if (nearDoor) {
      var dmx = (nearDoor.ax + nearDoor.bx) / 2, dmz = (nearDoor.az + nearDoor.bz) / 2;
      var hasBar = Z.barricades && Z.barricades.some(function (b) { return Math.hypot(b.mx - dmx, b.mz - dmz) < 40; });
      if (!hasBar) prompt = t("z_prompt_barricade");
    }
  }
  Z.interactPrompt = prompt;
}

function hasContextualInteract() {
  return !!Z.interactPrompt;
}

function handleInteract() {
  var P = Z.p;
  if (!P || P.dead || Z.paused) return;
  // 1. Fuse box
  var reach = Z.touchMode ? 135 : 95;
  if (Z.fuseBox && Z.blackout && Math.hypot(P.x - Z.fuseBox.x, P.z - Z.fuseBox.z) < reach) {
    restorePower(true);
    return;
  }
  // 2. Perk stations
  if (Z.perkStations) {
    for (var psi = 0; psi < Z.perkStations.length; psi++) {
      var pst = Z.perkStations[psi];
      if (Math.hypot(P.x - pst.x, P.z - pst.z) < (Z.touchMode ? 125 : 85)) {
        buyPerk(pst);
        return;
      }
    }
  }
  // 3. Barricades
  var nearDoor = getNearestDoorSeg();
  if (nearDoor) {
    buildBarricadeAt(nearDoor);
    return;
  }
}

function stepStorm(dt) {
  // only while a wave is actually on — lightning during the calm intermission
  // reads as a rendering bug, not weather
  if (!Z.wave || Z.wave.state === "rest") return;
  if (!Z.storm) {
    Z.storm = { nextLightning: rr(12, 24) };
  }
  Z.storm.nextLightning -= dt;
  if (Z.storm.nextLightning <= 0) {
    Z.storm.nextLightning = rr(14, 28);
    flashScreen("#b0c8ff", 0.35);
    setTimeout(function () {
      if (Z.active && !Z.paused) sndThunder();
    }, rr(400, 1100));
  }
}

/* ===========================================================================
   11. WAVES
   =========================================================================== */
function spawnPoints() {
  // Prefer doorways and windows, pushed well outside so a studio cannot
  // spawn a walker on the player's feet. Interior room points are fallbacks.
  var pts = [];
  function add(x, z) {
    pts.push({ x: x, z: z });
  }
  if (Z.col) {
    Z.col.windows.forEach(function (w) {
      add(w.x + w.nx * 180, w.z + w.nz * 180);
      add(w.x - w.nx * 180, w.z - w.nz * 180);
    });
    Z.col.doorSegs.forEach(function (d) {
      var mx = (d.ax + d.bx) / 2,
        mz = (d.az + d.bz) / 2,
        dx = d.bx - d.ax,
        dz = d.bz - d.az,
        len = Math.hypot(dx, dz) || 1,
        nx = -dz / len,
        nz = dx / len;
      add(mx + nx * 160, mz + nz * 160);
      add(mx - nx * 160, mz - nz * 160);
    });
  }
  liveRooms().forEach(function (r) {
    add(r.cx, r.cz);
    r.pts.forEach(function (p, i) {
      var q = r.pts[(i + 1) % r.pts.length];
      add((p.x + q.x) / 2, (p.z + q.z) / 2);
    });
  });
  var b = interiorBounds();
  if (!pts.length && b)
    for (var i = 0; i < 8; i++)
      add(rr(b.minx + 60, b.maxx - 60), rr(b.minz + 60, b.maxz - 60));
  return pts;
}

function spawnCrowded(p) {
  for (var q = 0; q < Z.zeds.length; q++) {
    var o2 = Z.zeds[q];
    if (!o2.dead && Math.hypot(o2.x - p.x, o2.z - p.z) < 85) return true;
  }
  return false;
}

function scoreSpawn(p) {
  if (!p || !Z.p) return -1e9;
  var d = Math.hypot(p.x - Z.p.x, p.z - Z.p.z);
  if (d < MIN_SPAWN_DIST || spawnCrowded(p)) return -1e9;
  var hidden = !losClear(p.x, p.z, Z.p.x, Z.p.z);
  var outside = !spawnInsideHouse(p.x, p.z);
  return (outside ? 1400 : 0) + (hidden ? 900 : 0) + Math.min(d, 1400) - Math.max(0, d - 1600);
}

function pickSpawn() {
  var pts = Z.spawnPts && Z.spawnPts.length ? Z.spawnPts : (Z.spawnPts = spawnPoints());
  var best = null,
    bestScore = -1e9;
  for (var i = 0; i < 14; i++) {
    var p = pick(pts);
    if (!p) break;
    var score = scoreSpawn(p);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (!best || bestScore < -1e8) {
    // Exhaustive pass for tiny plans where 14 random draws miss the only
    // legal (outside, far) window/door points.
    for (var j = 0; j < pts.length; j++) {
      var score2 = scoreSpawn(pts[j]);
      if (score2 > bestScore) {
        bestScore = score2;
        best = pts[j];
      }
    }
  }
  if (!best || bestScore < -1e8) {
    var b = interiorBounds();
    if (b) {
      best = {
        x: Z.p.x < (b.minx + b.maxx) / 2 ? b.maxx + 120 : b.minx - 120,
        z: Z.p.z < (b.minz + b.maxz) / 2 ? b.maxz + 120 : b.minz - 120,
      };
    } else best = { x: Z.p.x + 400, z: Z.p.z + 400 };
  }
  return best;
}

function waveTypes(n) {
  // the mix gets nastier: runners from 2, brutes from 3, screamers from 4
  var pool = [];
  for (var k in Z_TYPES) {
    if (k === "runner" && n < 2) continue;
    if (k === "brute" && n < 3) continue;
    if (k === "bloater" && n < 3) continue;
    if (k === "screamer" && n < 4) continue;
    if (k === "crawler" && n < 2) continue;
    var w = Z_TYPES[k].w;
    if (k === "runner") w += n * 6;
    if (k === "brute") w += n * 2;
    if (k === "bloater") w += Math.max(0, n - 2) * 2;
    if (k === "screamer") w += Math.max(0, n - 3) * 2;
    if (k === "crawler") w += Math.max(0, n - 1) * 2;
    for (var i = 0; i < w; i++) pool.push(k);
  }
  return pool;
}

function removeNavMarker() {
  if (!Z.navMarker) return;
  if (Z.navMarker.parent) Z.navMarker.parent.remove(Z.navMarker);
  Z.navMarker.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  Z.navMarker = null;
}

function placeNavMarker(x, z, radius, color) {
  removeNavMarker();
  if (!Z.grp) return;
  var grp = new THREE.Group();
  grp.position.set(x, 3, z);
  var mat = new THREE.MeshBasicMaterial({
    color: color || 0x53e7ff, transparent: true, opacity: 0.72,
    side: THREE.DoubleSide, depthWrite: false,
  });
  var ring = new THREE.Mesh(new THREE.RingGeometry(radius - 5, radius, 48), mat);
  ring.rotation.x = -Math.PI / 2;
  grp.add(ring);
  var beamMat = new THREE.MeshBasicMaterial({
    color: color || 0x53e7ff, transparent: true, opacity: 0.09,
    side: THREE.DoubleSide, depthWrite: false,
  });
  var beam = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.7, radius, 220, 32, 1, true), beamMat);
  beam.position.y = 110;
  grp.add(beam);
  Z.grp.add(grp);
  Z.navMarker = grp;
}

function farthestRoom() {
  var rooms = liveRooms(), b = interiorBounds(), P = Z.p;
  var points = reachableFloor(P, b, function (x, z) {
    return blockedAt(x, z, P_RAD + 2, P.y, P_CLEAR, STEP) || Math.abs(groundAt(x, z, P.y, STEP) - P.y) > STEP;
  }, function (x, z) { return !rooms.length || rooms.some(function (rm) { return rm.pts && pointInPoly(x, z, rm.pts); }); });
  var best = points[0], bestRoom = null;
  points.forEach(function (pt) {
    if (pt.distance > best.distance) { best = pt; }
  });
  // Prefer a clear reachable point near a room center, ranked by route length.
  var candidates = rooms.map(function (rm) {
    var pt = points.reduce(function (a, c) {
      return Math.hypot(c.x - rm.cx, c.z - rm.cz) < Math.hypot(a.x - rm.cx, a.z - rm.cz) ? c : a;
    }, points[0]);
    return { room: rm, point: pt, near: Math.hypot(pt.x - rm.cx, pt.z - rm.cz) };
  }).filter(function (c) { return c.near < 150 && c.point.distance > 160; });
  candidates.sort(function (a, c) { return c.point.distance - a.point.distance; });
  if (candidates.length) { best = candidates[0].point; bestRoom = candidates[0].room; }
  return { cx: best.x, cz: best.z, distance: best.distance,
    name: bestRoom ? roomName(bestRoom.key) || t("z_destination_room") : t("z_destination_safe"),
    route: points, point: best };
}

function makeWaveObjective(n, event) {
  removeNavMarker();
  var rm = farthestRoom(), b = interiorBounds();
  var targets = (Z.col && Z.col.doorSegs || []).map(function (ds) {
    return { x: (ds.ax + ds.bx) / 2, z: (ds.az + ds.bz) / 2 };
  }).filter(function (target) {
    return rm.route.some(function (pt) { return Math.hypot(pt.x - target.x, pt.z - target.z) < 90; });
  });
  var obj;
  if (event === "blackout" && Z.fuseBox) {
    obj = { kind: "power", x: Z.fuseBox.x, z: Z.fuseBox.z, progress: 0, need: 1, completed: false };
  } else if (n % 2 === 0 && targets.length) {
    obj = {
      kind: "secure", progress: 0,
      targets: targets, need: Math.min(2, targets.length), completed: false,
    };
  } else {
    var x = rm ? rm.cx : b ? (b.minx + b.maxx) / 2 : Z.p.x;
    var z = rm ? rm.cz : b ? (b.minz + b.maxz) / 2 : Z.p.z;
    obj = { kind: "hold", name: rm.name, x: x, z: z, progress: 0, need: 9 + Math.min(5, n), radius: 125, completed: false };
    placeNavMarker(x, z, obj.radius, 0x53e7ff);
  }
  Z.objective = obj;
}

function objectiveProgress(obj) {
  return obj ? clamp((obj.progress || 0) / Math.max(1, obj.need || 1), 0, 1) : 0;
}

function objectiveLabel(obj) {
  var label = t(obj.kind === "hold" ? "z_objective_hold" : obj.kind === "secure" ? "z_objective_secure" : "z_objective_power");
  if (obj.x != null) label += " · " + (obj.name || t("z_destination_room")) + " · " + Math.ceil(Math.hypot(Z.p.x - obj.x, Z.p.z - obj.z) / 100) + " m";
  return t("z_optional") + " · " + label;
}

function objectiveCount(obj) {
  if (obj.kind === "hold") return t("z_hold_count", { n: Math.ceil(Math.max(0, obj.need - obj.progress)) });
  return Math.min(obj.need, Math.floor(obj.progress || 0)) + " / " + obj.need;
}

function completeObjective() {
  var obj = Z.objective;
  if (!obj || obj.completed) return;
  obj.completed = true;
  obj.progress = obj.need;
  awardRunPoints(Z, 225);
  Z.p.armor = Math.min(MAX_ARMOR, (Z.p.armor || 0) + 20);
  removeNavMarker();
  sndPickup();
  flashScreen("#53e7ff", 0.16);
  say(t("z_objective_complete", { n: 225 }), 2.2);
  hudDirty();
}

function stepObjective(dt) {
  var obj = Z.objective;
  if (!obj || obj.completed || !Z.wave || Z.wave.state !== "fight") return;
  if (obj.kind === "hold") {
    var inside = Math.hypot(Z.p.x - obj.x, Z.p.z - obj.z) <= obj.radius;
    obj.progress = clamp(obj.progress + dt * (inside ? 1 : -0.35), 0, obj.need);
  } else if (obj.kind === "secure") {
    obj.progress = securedCount(obj.targets, Z.barricades || []);
    var next = obj.targets.find(function (target) { return securedCount([target], Z.barricades || []) === 0; });
    if (next && (obj.x !== next.x || obj.z !== next.z)) {
      obj.x = next.x; obj.z = next.z;
      placeNavMarker(next.x, next.z, 45, 0x53e7ff);
    }
  } else if (obj.kind === "power") {
    obj.progress = Z.blackout ? 0 : 1;
  }
  if (obj.progress >= obj.need) completeObjective();
}

function beginIntermission() {
  Z.intermission = { chosen: false };
  hudDirty();
}

function buyIntermission(kind) {
  var offer = INTERMISSION_OFFERS[kind];
  if (!offer || !Z.wave || Z.wave.state !== "rest" || !Z.intermission || Z.intermission.chosen) return;
  if ((Z.credits || 0) < offer.cost) {
    say(t("z_not_enough"), 1.2);
    return;
  }
  Z.credits -= offer.cost;
  Z.intermission.chosen = true;
  if (kind === "ammo") {
    W_ORDER.forEach(function (k) {
      if (!W[k].melee && Z.p.owned[k]) Z.p.reserve[k] = Math.max(Z.p.reserve[k] || 0, W[k].mag * 3);
    });
    Z.p.frags = Math.min(FRAG.maxCarry, (Z.p.frags || 0) + 2);
    if (Z.flash) Z.flash.batt = 100;
  } else if (kind === "fortify") {
    (Z.barricades || []).forEach(function (b) { b.hp = b.maxHp; });
    if (!(Z.barricades || []).length && Z.col && Z.col.doorSegs && Z.col.doorSegs.length)
      buildBarricadeAt(Z.col.doorSegs[0]);
    Z.p.armor = Math.min(MAX_ARMOR, (Z.p.armor || 0) + 35);
  } else {
    Z.p.hp = (Z.perks && Z.perks.jugg) ? 150 : MAX_HP;
    Z.p.armor = Math.min(MAX_ARMOR, (Z.p.armor || 0) + 60);
    Z.p.adrenalT = Math.max(Z.p.adrenalT || 0, 5);
  }
  sndPerk();
  flashScreen("#ffd35a", 0.14);
  say(t("z_purchase_done"), 1.5);
  hudDirty();
}

function updateDirector(dt, live) {
  var D = Z.director;
  if (!D) D = Z.director = { phase: "build", phaseT: 7, warned: {} };
  D.phaseT -= dt;
  if (D.phaseT <= 0) {
    if (D.phase === "lull") { D.phase = "build"; D.phaseT = 7; }
    else if (D.phase === "build") { D.phase = "peak"; D.phaseT = 5.5; }
    else if (D.phase === "peak") { D.phase = "lull"; D.phaseT = live > 2 ? 3.5 : 5; }
    else { D.phase = "build"; D.phaseT = 7; }
  }
  var ammoDef = W[Z.p.weapon];
  var ammoK = ammoDef.melee ? 1 : clamp(((Z.p.ammo[Z.p.weapon] || 0) + (Z.p.reserve[Z.p.weapon] || 0) * 0.2) / Math.max(1, ammoDef.mag), 0, 1);
  D.capability = clamp((Z.p.hp / ((Z.perks && Z.perks.jugg) ? 150 : MAX_HP)) * 0.65 + ammoK * 0.35, 0, 1);
}

function directedType(Wv) {
  var counts = {};
  Z.zeds.forEach(function (z) { if (!z.dead) counts[z.type] = (counts[z.type] || 0) + 1; });
  var type = "walker";
  for (var i = 0; i < 7; i++) {
    var candidate = pick(Wv.pool) || "walker";
    var specialist = candidate === "brute" || candidate === "bloater" || candidate === "screamer";
    if (specialist && (counts[candidate] || 0) >= 1) continue;
    if (candidate === "runner" && (counts.runner || 0) >= 4) continue;
    type = candidate;
    break;
  }
  if ((type === "brute" || type === "bloater" || type === "screamer") && !Z.director.warned[type]) {
    Z.director.warned[type] = true;
    say(t("z_role_" + type), 1.8);
    sndStinger();
  }
  return type;
}

function extractionPoint() {
  var rm = farthestRoom();
  return { x: rm.cx, z: rm.cz, distance: rm.distance, name: rm.name };
}

function beginExtraction() {
  var pt = extractionPoint();
  Z.objective = null;
  Z.intermission = null;
  Z.extraction = { x: pt.x, z: pt.z, radius: 120, progress: 0, need: 4, name: pt.name, time: Math.max(EXTRACT_LEN, pt.distance / SPD_WALK * 2 + 12) };
  Z.wave.state = "extract";
  Z.wave.timer = 0;
  Z.wave.spawnT = 1;
  Z.wave.pool = waveTypes(RUN_WAVES);
  placeNavMarker(pt.x, pt.z, Z.extraction.radius, 0x5dff9a);
  say(t("z_extract_started"), 3);
  sndStinger();
  hudDirty();
}

function finishRun() {
  if (Z.victory) return;
  Z.victory = true;
  Z.paused = true;
  Z.keys = {};
  Z.p.firing = false;
  removeNavMarker();
  unlockPointer();
  sndStinger();
  if (Z.hud) {
    Z.hud.victoryH.textContent = t("z_victory");
    Z.hud.victoryP.textContent = t("z_victory_stats", { k: Z.stats.kills, h: Z.stats.heads, s: Z.score || 0 });
    Z.hud.victoryAgain.textContent = t("z_again");
    Z.hud.victoryExit.textContent = t("z_exit");
    Z.hud.victory.classList.add("on");
  }
}

function stepExtraction(dt) {
  var X = Z.extraction, Wv = Z.wave;
  if (!X) return;
  X.time -= dt;
  var inside = Math.hypot(Z.p.x - X.x, Z.p.z - X.z) <= X.radius;
  X.progress = clamp(X.progress + dt * (inside ? 1 : -0.6), 0, X.need);
  if (X.progress >= X.need) return finishRun();
  if (X.time <= 0) {
    hurtPlayer(999, { x: X.x, z: X.z });
    return;
  }
  Wv.spawnT -= dt;
  var live = Z.zeds.filter(function (z) { return !z.dead; }).length;
  var cap = Math.min(qualityHordeCap(), gameSettings().maxAlive || Z_MAX_ALIVE, houseAliveCap(), 10);
  if (Wv.spawnT <= 0 && live < cap) {
    Wv.spawnT = rr(0.7, 1.25);
    var p = pickSpawn(), zd = spawnZed(directedType(Wv), p.x, p.z);
    zd.alerted = true;
    zd.state = "chase";
  }
}

function startWave(n) {
  var total = Math.round(Math.min(52, 5 + n * 3 + (n >= 5 ? n : 0)) * ({ easy: 0.75, normal: 1, hard: 1.25 }[gameSettings().difficulty]));
  // special event waves
  var event = null;
  if (n > 1 && n % 5 === 0) event = "horde";
  else if (n > 2 && n % 4 === 0) event = "blackout";
  else if (n >= 6 && n % 3 === 0) event = "runners";

  var pool = waveTypes(n);
  if (event === "horde") {
    total = Math.min(60, total + 10);
    pool = pool.concat(pool.filter(function (k) { return k === "walker" || k === "crawler"; }));
  } else if (event === "runners") {
    pool = [];
    for (var r = 0; r < 40; r++) pool.push(r < 30 ? "runner" : "walker");
  }

  Z.wave = {
    n: n,
    total: total,
    pending: total,
    state: "fight",
    timer: 0,
    spawnT: n <= 1 ? 2.8 : 0,
    pool: pool,
    event: event,
    bossSpawned: false,
    difficulty: gameSettings().difficulty,
  };
  Z.director = { phase: "build", phaseT: n === 1 ? 9 : 7, warned: {} };
  Z.intermission = null;
  Z.spawnPts = spawnPoints();
  if (event === "horde") say(t("z_event_horde", { n: n }), 2.8);
  else if (event === "blackout") {
    triggerBlackout();
  } else if (event === "runners") say(t("z_event_runners", { n: n }), 2.8);
  else say(t("z_wave_start", { n: n }), 2.4);
  sndStinger();
  scatterPickups(n);
  // boss Titan every 5 waves
  if (n >= 5 && n % 5 === 0) {
    var bp = pickSpawn();
    var boss = spawnZed("titan", bp.x, bp.z);
    boss.hp = 750 + (n - 5) * 200;
    boss.maxHp = boss.hp;
    boss.alerted = true;
    boss.boss = true;
    boss.state = "chase";
    Z.wave.pending = Math.max(0, Z.wave.pending - 1);
    Z.wave.bossSpawned = true;
    Z.boss = { zed: boss, maxHp: boss.hp, name: t("z_boss_titan") };
    say(t("z_event_titan", { n: n }), 3.2);
  }
  makeWaveObjective(n, event);
  hudDirty();
}

function stepWave(dt) {
  var Wv = Z.wave;
  if (!Wv) return;
  Wv.timer += dt;
  if (Wv.state === "fight") {
    stepObjective(dt);
    Wv.spawnT -= dt;
    var live = Z.zeds.filter(function (z2) {
      return !z2.dead;
    }).length;
    // A horde is hundreds of separately animated meshes. Keep the user's
    // horde choice as an upper bound, while the graphics tier supplies a safe
    // visual cap so Fast actually reduces both CPU simulation and draw calls.
    updateDirector(dt, live);
    var qualityCap = qualityHordeCap();
    var aliveCap = Math.min(
      gameSettings().maxAlive || Z_MAX_ALIVE,
      qualityCap,
      houseAliveCap(),
    );
    aliveCap = encounterCap(aliveCap, houseAliveCap(), Z.director.phase);
    if (Wv.pending > 0 && Wv.spawnT <= 0 && live < aliveCap) {
      var baseCd = Wv.event === "horde" ? 1.4 : Wv.event === "runners" ? 1.1 : 2.4;
      var phaseScale = Z.director.phase === "lull" ? 2.4 : Z.director.phase === "peak" ? 0.58 : 1;
      var reliefScale = (1.35 - Z.director.capability * 0.45) * ({ easy: 1.25, normal: 1, hard: 0.8 }[Wv.difficulty || "normal"]);
      Wv.spawnT = clamp(baseCd - Wv.n * 0.14, 0.35, 2.5) * phaseScale * reliefScale * rr(0.7, 1.25);
      var p = pickSpawn(),
        type = directedType(Wv);
      var zd = spawnZed(type, p.x, p.z);
      // late waves: slight stat ramp
      if (Wv.n > 6) {
        zd.hp *= 1 + (Wv.n - 6) * 0.04;
        zd.spd *= 1 + (Wv.n - 6) * 0.02;
      }
      Wv.pending--;
    }
    if (Wv.pending <= 0 && live === 0) {
      if (Wv.n >= RUN_WAVES) {
        beginExtraction();
        return;
      }
      Wv.state = "rest";
      Wv.timer = 0;
      say(t("z_wave_clear", { n: Wv.n }), 3);
      Z.stats.best = Math.max(Z.stats.best, Wv.n);
      awardRunPoints(Z, 150 + Wv.n * 40);
      // A small guaranteed breather prevents soft-locks. The meaningful refill
      // is the one-of-three intermission decision below.
      Z.p.hp = Math.min((Z.perks && Z.perks.jugg) ? 150 : MAX_HP, Z.p.hp + 6);
      if (Z.blackout) restorePower(false);
      Z.boss = null;
      removeNavMarker();
      beginIntermission();
      hudDirty();
    }
  } else if (Wv.state === "rest") {
    if (Wv.timer > REST_LEN) startWave(Wv.n + 1);
    else if (Wv.timer > REST_LEN - 3 && !Wv.warned) {
      Wv.warned = true;
      say(t("z_wave_next"), 2.6);
    }
  } else if (Wv.state === "extract") stepExtraction(dt);
}

function onKeyDown(e) {
  if (!Z.active) return;
  // Night Shift owns the keyboard while active; do not also trigger planner
  // shortcuts (notably P, which otherwise opens Photo Mode behind the pause UI).
  e.stopImmediatePropagation();
  if ((e.code === "KeyP" || e.code === "Escape") && !Z.p.dead) {
    // Escape first releases pointer lock; the lock-change handler opens pause.
    if (e.code === "Escape" && Z.locked) return;
    pauseGame(!Z.paused);
    e.preventDefault();
    return;
  }
  if (Z.paused) {
    e.preventDefault();
    return;
  }
  var m = KEYMAP[e.code];
  if (m) {
    Z.keys[m] = true;
    if (m === "crouchKey") Z.p.crouch = true;
    e.preventDefault();
    return;
  }
  if (e.code.indexOf("Digit") === 0) {
    // 1-9 pick slots 1-9; 0 picks the tenth (the flamer)
    var n = parseInt(e.code.slice(5), 10);
    n = n === 0 ? 9 : n - 1;
    if (W_ORDER[n] && Z.p.owned[W_ORDER[n]]) setWeapon(W_ORDER[n]);
    e.preventDefault();
    return;
  }
  if (e.code === "KeyG") throwFrag(Z.keys.crouchKey); // crouched = short lob
  else if (e.code === "KeyR") reload();
  else if (e.code === "KeyF") {
    if (Z.flash) {
      Z.flash.on = !Z.flash.on && Z.flash.batt > 0;
      sndClick();
      say(Z.flash.on ? t("z_flash_on") : t("z_flash_off"), 0.8);
    }
  } else if (e.code === "KeyQ") cycleWeapon(-1);
  else if (e.code === "KeyE") {
    if (hasContextualInteract()) handleInteract();
    else cycleWeapon(1);
  }
  else if (e.code === "KeyV") wipeVisor();
  else if (e.code === "KeyX") {
    // shove — pushes everything in front of you back hard. Moved off Space when
    // Space became jump; it is a real mechanic (stamina cost + dodge burst), so
    // it got rebound rather than dropped.
    shove();
  } else if (e.code === "Space") jump();
  else return;
  e.preventDefault();
}

export {
  applyCamera, buyIntermission, handleInteract, initRadar, objectiveCount,
  objectiveLabel, objectiveProgress, onKeyDown, removeNavMarker, spawnFuseBox,
  spawnPerkStations, startWave, stepRadar, stepStorm, stepWave,
  updateInteractPrompt,
};
