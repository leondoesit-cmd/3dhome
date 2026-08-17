// FPS weapon system for on-foot mode inside the drive world (js/drive.js).
// Owns: procedural gun viewmodels attached to the camera, firing (hitscan
// raycasts with spread/bloom), tracers + impact particles + muzzle flash,
// procedural WebAudio gunshots, the FPS HUD (crosshair, ammo, health bar,
// damage vignette, WASTED screen), player health/regen/death, and a shared
// particle/explosion FX pool that drive.js also uses for burning vehicles.
//
// drive.js owns the player/camera transform and world state; this module
// talks back through the ctx callbacks:
//   targets()                  -> [{root, kind:'world'|'vehicle'|'ghost', ref}]
//   onHit(kind, ref, dmg, point, dir)   hit something that takes damage
//   onShot(origin[3], dir[3], key)      local shot fired (MP broadcast)
//   onDeath()                            wasted-timer elapsed, respawn me
//   kick(dPitch, dYaw)                   recoil into the look angles
import * as THREE from "three";
// CD_M, not CD: drive mode and its weapon viewmodel are METRE-scale
// (see js/drive.js header). CD is calibrated for the centimetre planner scene.
import { CD_M } from "./gpu.js";
import { t } from "./i18n.js";

// ---- weapon definitions ----------------------------------------------------
const DEFS = {
  pistol: {
    nameKey: "wp_pistol", rpm: 330, dmg: 15, pellets: 1, mag: 12, reserve: 72,
    spread: 0.010, bloom: 0.014, kick: 0.012, auto: false, reloadS: 1.05,
    sndCut: 2600, sndDur: 0.2, sndGain: 0.55,
  },
  smg: {
    nameKey: "wp_smg", rpm: 750, dmg: 8, pellets: 1, mag: 32, reserve: 160,
    spread: 0.026, bloom: 0.008, kick: 0.0078, auto: true, reloadS: 1.7,
    sndCut: 2200, sndDur: 0.16, sndGain: 0.42,
  },
  shotgun: {
    nameKey: "wp_shotgun", rpm: 80, dmg: 7, pellets: 8, mag: 6, reserve: 36,
    spread: 0.055, bloom: 0.035, kick: 0.034, auto: false, reloadS: 2.4,
    sndCut: 1500, sndDur: 0.34, sndGain: 0.8,
  },
};
const ORDER = ["pistol", "smg", "shotgun"];

// ---- procedural gun meshes -------------------------------------------------
// Low-poly box builds in real meters; each returns a group whose userData
// carries a `muzzle` Object3D at the barrel tip (for flash + tracer origin).
let matMetal, matDark, matWood, matGrip;
function gunMats() {
  if (matMetal) return;
  matMetal = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.4, metalness: 0.65 });
  matDark = new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.7, metalness: 0.3 });
  matWood = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.85 });
  matGrip = new THREE.MeshStandardMaterial({ color: 0x1c1f23, roughness: 0.9 });
}
function B(g, w, h, d, mat, x, y, z, rx, rz) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  if (rz) m.rotation.z = rz;
  g.add(m);
  return m;
}
function C(g, r, len, mat, x, y, z) {
  const geo = new THREE.CylinderGeometry(r, r, len, 10);
  geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function muzzleAt(g, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  g.add(o);
  g.userData.muzzle = o;
}
function buildGun(key) {
  gunMats();
  const g = new THREE.Group();
  if (key === "pistol") {
    B(g, 0.048, 0.05, 0.2, matMetal, 0, 0.038, -0.06); // slide
    B(g, 0.044, 0.034, 0.17, matDark, 0, 0, -0.045); // frame
    B(g, 0.04, 0.1, 0.055, matGrip, 0, -0.062, 0.02, 0.18); // grip
    B(g, 0.006, 0.012, 0.01, matDark, 0, 0.069, -0.15); // front sight
    B(g, 0.02, 0.012, 0.012, matDark, 0, 0.069, 0.028); // rear sight
    C(g, 0.008, 0.03, matDark, 0, 0.038, -0.175); // barrel tip
    muzzleAt(g, 0, 0.038, -0.2);
  } else if (key === "smg") {
    B(g, 0.056, 0.075, 0.4, matMetal, 0, 0.02, -0.05); // receiver
    C(g, 0.013, 0.2, matDark, 0, 0.033, -0.33); // barrel
    C(g, 0.02, 0.09, matDark, 0, 0.033, -0.27); // shroud
    B(g, 0.038, 0.16, 0.055, matGrip, 0, -0.09, -0.1, 0.12); // magazine
    B(g, 0.036, 0.09, 0.05, matGrip, 0, -0.06, 0.08, 0.2); // pistol grip
    B(g, 0.03, 0.04, 0.18, matDark, 0, 0.02, 0.22); // stock
    B(g, 0.006, 0.016, 0.01, matDark, 0, 0.068, -0.31); // front sight
    B(g, 0.024, 0.016, 0.012, matDark, 0, 0.068, 0.05); // rear sight
    muzzleAt(g, 0, 0.033, -0.435);
  } else {
    C(g, 0.014, 0.52, matMetal, 0, 0.035, -0.28); // barrel
    C(g, 0.017, 0.34, matDark, 0, -0.005, -0.2); // tube mag
    B(g, 0.05, 0.075, 0.2, matMetal, 0, 0.012, 0.02); // receiver
    B(g, 0.045, 0.05, 0.14, matWood, 0, -0.005, -0.24); // pump
    B(g, 0.05, 0.1, 0.24, matWood, 0, -0.035, 0.19, 0.13); // stock
    B(g, 0.006, 0.014, 0.01, matDark, 0, 0.07, -0.52); // bead sight
    muzzleAt(g, 0, 0.035, -0.55);
  }
  return g;
}

// ---- soft-circle sprite texture (shared by all particles) ------------------
let puffTex = null;
function getPuffTex() {
  if (puffTex) return puffTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.6, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

export function createWeapons(ctx) {
  const { scene, camera, overlay } = ctx;
  // viewmodel children need the camera inside the scene graph
  if (!camera.parent) scene.add(camera);

  // ---- state ---------------------------------------------------------------
  const inv = {}; // key -> {mag, reserve}
  ORDER.forEach((k) => (inv[k] = { mag: DEFS[k].mag, reserve: DEFS[k].reserve }));
  let curKey = "pistol",
    active = false,
    firing = false,
    ads = false,
    nextFire = 0,
    bloom = 0,
    recoil = 0,
    bobPhase = 0,
    reloadUntil = 0,
    switchAnim = 0, // raise animation after a swap
    hp = 100,
    lastDmg = -1e9,
    deadUntil = 0,
    dead = false;

  // ---- viewmodel -----------------------------------------------------------
  const vm = new THREE.Group();
  vm.visible = false;
  camera.add(vm);
  const guns = {};
  ORDER.forEach((k) => {
    guns[k] = buildGun(k);
    guns[k].visible = false;
    vm.add(guns[k]);
  });
  guns[curKey].visible = true;
  // muzzle flash: additive sprite + short-lived light
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getPuffTex(), color: 0xffd890, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0, depthWrite: false,
    }),
  );
  flash.scale.set(0.16, 0.16, 1);
  vm.add(flash);
  const flashLight = new THREE.PointLight(0xffb45a, 0, 9, 2);
  camera.add(flashLight);
  let flashT = 0;

  // ---- HUD -----------------------------------------------------------------
  const hud = document.createElement("div");
  hud.id = "fpsHud";
  hud.innerHTML =
    '<div id="fpsCross"><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i>' +
    '<span id="fpsHit">✕</span></div>' +
    '<div id="fpsAmmo"><span id="fpsWName"></span><b id="fpsMag"></b><i id="fpsRes"></i></div>' +
    '<div id="fpsHealth"><div id="fpsHealthFill"></div></div>' +
    '<div id="fpsDmg"></div>' +
    '<div id="fpsWasted"><h1>' + t("ft_wasted") + "</h1><span>" + t("ft_respawn") + "</span></div>";
  overlay.appendChild(hud);
  const el = (id) => hud.querySelector("#" + id);
  const crossEl = el("fpsCross"),
    hitEl = el("fpsHit"),
    dmgEl = el("fpsDmg"),
    wastedEl = el("fpsWasted"),
    healthFill = el("fpsHealthFill");
  function ammoHUD() {
    const w = inv[curKey];
    el("fpsWName").textContent = t(DEFS[curKey].nameKey);
    el("fpsMag").textContent = reloadUntil ? "--" : w.mag;
    el("fpsRes").textContent = "/ " + w.reserve;
    el("fpsMag").classList.toggle("low", !reloadUntil && w.mag <= DEFS[curKey].mag * 0.25);
  }
  function healthHUD() {
    healthFill.style.width = Math.max(0, hp) + "%";
    healthFill.classList.toggle("low", hp < 35);
  }
  ammoHUD();
  healthHUD();

  // ---- audio ---------------------------------------------------------------
  let ac = null,
    noiseBuf = null;
  function audio() {
    if (ac) return ac;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const len = Math.floor(ac.sampleRate * 0.6);
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (_) {
      ac = null;
    }
    return ac;
  }
  // filtered noise burst — the basis of every shot / impact / boom
  function noise(dur, cutoff, gain, delay) {
    const a = audio();
    if (!a) return;
    try {
      const t0 = a.currentTime + (delay || 0);
      const src = a.createBufferSource();
      src.buffer = noiseBuf;
      const lp = a.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = cutoff;
      const g = a.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(lp).connect(g).connect(a.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch (_) {}
  }
  function thump(f0, f1, dur, gain, delay) {
    const a = audio();
    if (!a) return;
    try {
      const t0 = a.currentTime + (delay || 0);
      const o = a.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      const g = a.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(a.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch (_) {}
  }
  function click(freq, gain, delay) {
    const a = audio();
    if (!a) return;
    try {
      const t0 = a.currentTime + (delay || 0);
      const o = a.createOscillator();
      o.type = "square";
      o.frequency.value = freq;
      const g = a.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04);
      o.connect(g).connect(a.destination);
      o.start(t0);
      o.stop(t0 + 0.06);
    } catch (_) {}
  }
  function shotSound(def, dist) {
    // dist>0 = a peer's shot: quieter and muffled with distance
    const att = dist ? Math.max(0.06, 1 - dist / 320) : 1;
    noise(def.sndDur, def.sndCut * (dist ? 0.4 : 1), def.sndGain * 0.5 * att);
    if (def.pellets > 1 || dist) thump(110, 45, 0.16, 0.25 * att);
  }

  // ---- particles / tracers (shared FX pool) --------------------------------
  const parts = []; // {sp, vx,vy,vz, life, t0:age, grow, fade, damp}
  const tracers = []; // {line, age, life}
  function puff(x, y, z, o) {
    if (parts.length > 260) return;
    const m = new THREE.SpriteMaterial({
      map: getPuffTex(), color: o.color, transparent: true,
      opacity: o.opacity != null ? o.opacity : 0.8, depthWrite: false,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const sp = new THREE.Sprite(m);
    sp.position.set(x, y, z);
    sp.scale.set(o.size, o.size, 1);
    scene.add(sp);
    parts.push({
      sp, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: o.life || 0.8, age: 0, grow: o.grow || 0, damp: o.damp || 1,
    });
  }
  function sparks(p, n, color, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        el2 = Math.random() * Math.PI - Math.PI / 2,
        v = speed * (0.4 + Math.random() * 0.9);
      puff(p.x, p.y, p.z, {
        color, size: 0.1 + Math.random() * 0.12, opacity: 0.95, add: true,
        vx: Math.cos(a) * Math.cos(el2) * v, vy: Math.sin(el2) * v + 1.2,
        vz: Math.sin(a) * Math.cos(el2) * v, life: 0.28 + Math.random() * 0.2, damp: 0.88,
      });
    }
  }
  const tracerMat = new THREE.LineBasicMaterial({
    color: 0xffe0a0, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  function tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, tracerMat.clone());
    scene.add(line);
    tracers.push({ line, age: 0, life: 0.09 });
  }
  function explosionAt(pos) {
    // fireball core
    for (let i = 0; i < 14; i++)
      puff(pos.x + (Math.random() - 0.5) * 1.6, pos.y + Math.random() * 1.4, pos.z + (Math.random() - 0.5) * 1.6, {
        color: [0xffc23c, 0xff8a2a, 0xff5a1e][i % 3], size: 1.6 + Math.random() * 2.4,
        opacity: 0.95, add: true, vy: 2.2 + Math.random() * 3.5,
        vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3,
        life: 0.5 + Math.random() * 0.4, grow: 3.2, damp: 0.92,
      });
    // smoke column
    for (let i = 0; i < 10; i++)
      puff(pos.x + (Math.random() - 0.5) * 2, pos.y + 0.5 + Math.random() * 2, pos.z + (Math.random() - 0.5) * 2, {
        color: 0x1c1c1e, size: 1.8 + Math.random() * 2, opacity: 0.55,
        vy: 1.4 + Math.random() * 1.8, vx: (Math.random() - 0.5) * 1.2, vz: (Math.random() - 0.5) * 1.2,
        life: 1.6 + Math.random() * 1.2, grow: 2.4, damp: 0.97,
      });
    sparks(pos, 16, 0xffd060, 14);
    const l = new THREE.PointLight(0xff9030, 30 * CD_M, 60, 2);
    l.position.copy(pos);
    scene.add(l);
    let age = 0;
    const fade = () => {
      age += 0.05;
      l.intensity = CD_M * Math.max(0, 30 * (1 - age / 0.45));
      if (l.intensity <= 0) scene.remove(l);
      else setTimeout(fade, 50);
    };
    setTimeout(fade, 50);
    noise(0.9, 420, 0.9);
    thump(120, 26, 0.7, 0.7);
    noise(0.4, 3000, 0.25); // initial crack
  }

  // ---- firing --------------------------------------------------------------
  const rc = new THREE.Raycaster();
  rc.far = 420;
  const _dir = new THREE.Vector3(),
    _muzzle = new THREE.Vector3();
  function resolveRoot(obj, roots) {
    while (obj) {
      for (let i = 0; i < roots.length; i++) if (roots[i].root === obj) return roots[i];
      obj = obj.parent;
    }
    return null;
  }
  function fireOnce(now) {
    const def = DEFS[curKey],
      w = inv[curKey];
    w.mag--;
    nextFire = now + 60000 / def.rpm;
    bloom = Math.min(0.08, bloom + def.bloom);
    recoil = 1;
    flashT = 0.05;
    guns[curKey].userData.muzzle.getWorldPosition(_muzzle);
    flash.position.copy(guns[curKey].userData.muzzle.position);
    flash.position.z -= 0.02;
    flash.material.opacity = 0.9;
    flash.material.rotation = Math.random() * Math.PI;
    flashLight.intensity = CD_M * 6;
    ctx.kick(def.kick * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * def.kick * 0.5);
    shotSound(def, 0);
    const roots = ctx.targets();
    const rootObjs = roots.map((r) => r.root);
    const sp = (def.spread + bloom) * (ads ? 0.45 : 1);
    let sentDir = null;
    for (let p = 0; p < def.pellets; p++) {
      camera.getWorldDirection(_dir);
      _dir.x += (Math.random() - 0.5) * 2 * sp;
      _dir.y += (Math.random() - 0.5) * 2 * sp;
      _dir.z += (Math.random() - 0.5) * 2 * sp;
      _dir.normalize();
      if (!sentDir) sentDir = _dir.clone();
      rc.set(camera.getWorldPosition(new THREE.Vector3()), _dir);
      const hits = rc.intersectObjects(rootObjs, true);
      const h = hits.length ? hits[0] : null;
      const end = h
        ? h.point.clone()
        : rc.ray.origin.clone().addScaledVector(_dir, 380);
      tracer(_muzzle.clone(), end);
      if (!h) continue;
      const src = resolveRoot(h.object, roots);
      if (!src) continue;
      if (src.kind === "world") {
        sparks(h.point, 4, 0xd8c8a8, 5);
        puff(h.point.x, h.point.y, h.point.z, {
          color: 0x8a8378, size: 0.35, opacity: 0.4, vy: 0.5, life: 0.5, grow: 0.6,
        });
      } else {
        ctx.onHit(src.kind, src.ref, def.dmg, h.point, _dir.clone());
        sparks(h.point, 6, 0xffc860, 8);
        hitmark();
        click(1600, 0.08);
      }
    }
    if (sentDir) {
      const o = rc.ray.origin;
      ctx.onShot([o.x, o.y, o.z], [sentDir.x, sentDir.y, sentDir.z], curKey);
    }
    ammoHUD();
  }
  function tryFire(now) {
    if (!active || dead || reloadUntil || switchAnim > 0.35) return;
    if (now < nextFire) return;
    const w = inv[curKey];
    if (w.mag <= 0) {
      click(700, 0.12);
      nextFire = now + 280;
      if (w.reserve > 0) startReload(now); // auto-reload on dry fire
      return;
    }
    fireOnce(now);
  }
  function hitmark() {
    hitEl.classList.remove("on");
    void hitEl.offsetWidth;
    hitEl.classList.add("on");
  }
  function startReload(now) {
    const def = DEFS[curKey],
      w = inv[curKey];
    if (reloadUntil || w.reserve <= 0 || w.mag >= def.mag || dead) return;
    reloadUntil = now + def.reloadS * 1000;
    click(900, 0.1);
    click(600, 0.12, def.reloadS * 0.55);
    click(1100, 0.14, def.reloadS * 0.92);
    ammoHUD();
  }
  function finishReload() {
    const def = DEFS[curKey],
      w = inv[curKey];
    const need = def.mag - w.mag,
      take = Math.min(need, w.reserve);
    w.mag += take;
    w.reserve -= take;
    reloadUntil = 0;
    ammoHUD();
  }
  function select(key, now) {
    if (key === curKey || !DEFS[key]) return;
    guns[curKey].visible = false;
    curKey = key;
    guns[curKey].visible = true;
    reloadUntil = 0;
    switchAnim = 1;
    firing = false;
    click(1200, 0.08);
    nextFire = now + 220;
    ammoHUD();
  }

  // ---- damage / death ------------------------------------------------------
  function damage(dmg) {
    // applies in the car too (explosions, peers shooting the driver)
    if (dead) return;
    hp -= dmg;
    lastDmg = performance.now();
    dmgEl.classList.remove("on");
    void dmgEl.offsetWidth;
    dmgEl.classList.add("on");
    noise(0.12, 900, 0.25);
    thump(220, 90, 0.12, 0.2);
    if (hp <= 0) {
      hp = 0;
      dead = true;
      deadUntil = lastDmg + 3800;
      firing = false;
      wastedEl.classList.add("on");
      thump(160, 32, 1.4, 0.5);
    }
    healthHUD();
  }

  // ---- per-frame -----------------------------------------------------------
  const _v = new THREE.Vector3();
  function tick(dt, now, moveSpeed, onGround) {
    // FX pools run regardless of mode (car explosions, peer tracers)
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        scene.remove(p.sp);
        p.sp.material.dispose();
        parts.splice(i, 1);
        continue;
      }
      p.vx *= p.damp;
      p.vz *= p.damp;
      p.vy = p.vy * p.damp + (p.grow ? dt * 1.2 : -dt * 2.2);
      p.sp.position.x += p.vx * dt;
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += p.vz * dt;
      const k = p.age / p.life;
      p.sp.material.opacity *= 1 - k * dt * 4;
      if (p.grow) {
        const s = p.sp.scale.x + p.grow * dt;
        p.sp.scale.set(s, s, 1);
      }
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i];
      tr.age += dt;
      if (tr.age >= tr.life) {
        scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        tracers.splice(i, 1);
      } else tr.line.material.opacity = 0.85 * (1 - tr.age / tr.life);
    }
    if (flashT > 0) {
      flashT -= dt;
      if (flashT <= 0) {
        flash.material.opacity = 0;
        flashLight.intensity = 0;
      }
    }
    // death/regen run in the car too (you can die at the wheel)
    if (dead && now >= deadUntil) {
      dead = false;
      hp = 100;
      wastedEl.classList.remove("on");
      healthHUD();
      ctx.onDeath();
    }
    // regen after 4 s without damage
    if (!dead && hp < 100 && now - lastDmg > 4000) {
      hp = Math.min(100, hp + 9 * dt);
      healthHUD();
    }
    if (!active) return;
    if (reloadUntil && now >= reloadUntil) finishReload();
    if (firing && DEFS[curKey].auto) tryFire(now);
    bloom = Math.max(0, bloom - dt * 0.09);
    recoil = Math.max(0, recoil - dt * 7);
    switchAnim = Math.max(0, switchAnim - dt * 3.2);

    // viewmodel pose: base + ADS + bob + recoil + reload/switch dip
    const adsK = ads && !reloadUntil ? 1 : 0;
    vm.userData.adsCur = vm.userData.adsCur == null ? 0 : vm.userData.adsCur;
    vm.userData.adsCur += (adsK - vm.userData.adsCur) * Math.min(1, 12 * dt);
    const a = vm.userData.adsCur;
    bobPhase += dt * (2 + moveSpeed * 1.35) * (onGround && moveSpeed > 0.3 ? 1 : 0);
    const bobA = (onGround ? Math.min(1, moveSpeed / 4) : 0) * (1 - a);
    const rl = reloadUntil ? 1 : 0;
    vm.userData.rlCur = vm.userData.rlCur == null ? 0 : vm.userData.rlCur;
    vm.userData.rlCur += (rl - vm.userData.rlCur) * Math.min(1, 8 * dt);
    const r = vm.userData.rlCur,
      sw = switchAnim;
    vm.position.set(
      (0.24 + Math.sin(bobPhase) * 0.007 * bobA) * (1 - a),
      -0.225 * (1 - a) - 0.148 * a + Math.abs(Math.sin(bobPhase * 2)) * 0.006 * bobA -
        r * 0.16 - sw * 0.22,
      -0.5 + recoil * 0.055 + a * 0.07,
    );
    vm.rotation.set(recoil * 0.1 + r * 0.9 + sw * 0.7, (1 - a) * 0.02, 0);
    // crosshair spread readout
    const spPx = 6 + ((DEFS[curKey].spread + bloom) * (ads ? 0.45 : 1)) * 900 + moveSpeed * 1.4;
    crossEl.style.setProperty("--gap", spPx.toFixed(1) + "px");
    crossEl.style.opacity = a > 0.5 ? 0.55 : 1;
  }

  // ---- public API ----------------------------------------------------------
  return {
    // session on/off: health bar + damage/wasted layers live for the whole
    // drive session; crosshair/ammo/viewmodel only while on foot (setActive)
    setSession(on) {
      hud.classList.toggle("sess", on);
      if (!on) {
        hud.classList.remove("on");
        wastedEl.classList.remove("on");
        dmgEl.classList.remove("on");
      }
    },
    setActive(on) {
      active = on;
      vm.visible = on;
      hud.classList.toggle("on", on);
      firing = false;
      ads = false;
      if (on) {
        audio(); // user gesture — safe to create/resume
        if (ac && ac.state === "suspended") ac.resume().catch(() => {});
        ammoHUD();
        healthHUD();
      }
    },
    tick,
    mouse(btn, down, now) {
      if (!active || dead) return;
      if (btn === 2) {
        ads = down;
        return;
      }
      if (btn !== 0) return;
      firing = down;
      if (down) tryFire(now);
    },
    wheel(dy, now) {
      if (!active) return;
      const i = ORDER.indexOf(curKey);
      select(ORDER[(i + (dy > 0 ? 1 : ORDER.length - 1)) % ORDER.length], now);
    },
    key(code, now) {
      if (!active) return false;
      if (code === "KeyR") {
        startReload(now);
        return true;
      }
      const n = { Digit1: 0, Digit2: 1, Digit3: 2 }[code];
      if (n != null) {
        select(ORDER[n], now);
        return true;
      }
      return false;
    },
    damage,
    isDead: () => dead,
    getHp: () => hp,
    adsFactor: () => (vm.userData.adsCur || 0),
    // peer fired: tracer + distant crack from their muzzle
    remoteShot(o, d, key, distM) {
      const from = new THREE.Vector3(o[0], o[1], o[2]);
      const to = from.clone().addScaledVector(new THREE.Vector3(d[0], d[1], d[2]), 120);
      tracer(from, to);
      shotSound(DEFS[key] || DEFS.pistol, Math.max(1, distM || 60));
    },
    puff,
    sparks,
    explosionAt,
    reset() {
      hp = 100;
      dead = false;
      reloadUntil = 0;
      bloom = 0;
      wastedEl.classList.remove("on");
      ORDER.forEach((k) => {
        inv[k].mag = DEFS[k].mag;
        inv[k].reserve = DEFS[k].reserve;
      });
      ammoHUD();
      healthHUD();
    },
  };
}
