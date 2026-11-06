/* Night Shift synthesized sound effects, split out of js/zombies_game.js. It
   shares the editor's state through live imports from ../zombies_game.js. */
import { audio, distGain, noiseSrc, panFor } from "../zombies_game/weapons.js";
import { Z, rr } from "../zombies_state.js";
import { isNearBloodDecal, isNearGlassDebris } from "../zombies_world.js";
import { W, ambT, set_ambT } from "../zombies_game.js";

function sndShot(def) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "lowpass";
  f.frequency.setValueAtTime(def.snd.cut * 2.4, now);
  f.frequency.exponentialRampToValueAtTime(def.snd.cut * 0.35, now + def.snd.dur);
  g.gain.setValueAtTime(def.snd.gain, now);
  g.gain.exponentialRampToValueAtTime(0.0008, now + def.snd.dur);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + def.snd.dur + 0.03);
  // body thump
  var o = A.ctx.createOscillator(),
    og = A.ctx.createGain();
  o.frequency.setValueAtTime(160, now);
  o.frequency.exponentialRampToValueAtTime(42, now + 0.16);
  og.gain.setValueAtTime(def.snd.gain * 0.8, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  o.connect(og);
  og.connect(A.master);
  o.start(now);
  o.stop(now + 0.22);
}
function sndClick() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "highpass";
  f.frequency.value = 2600;
  g.gain.setValueAtTime(0.22, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.06);
}
function sndReload() {
  var A = audio();
  if (!A) return;
  // Deferred clicks must not outlive the session: firing after audioClose()
  // would lazily build a fresh AudioContext (and its permanent ambient bed).
  [0.18, 0.42].forEach(function (d) {
    var id = setTimeout(function () {
      var i = Z.sndTOs.indexOf(id);
      if (i >= 0) Z.sndTOs.splice(i, 1);
      if (Z.active && Z.audio) sndClick();
    }, d * 1000);
    Z.sndTOs.push(id);
  });
  sndClick();
}
function sndWhoosh(def) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "bandpass";
  f.frequency.setValueAtTime(320, now);
  f.frequency.exponentialRampToValueAtTime(1400, now + 0.2);
  f.Q.value = 1.6;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.3, now + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0008, now + 0.28);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.3);
}
// Zombie claw/swipe — air whoosh, plus a wet hit if the strike connects.
function sndSwipe(zd, hit) {
  sndWhoosh(W.pan);
  if (hit && zd) sndFlesh({ x: zd.x, y: (Z.p && Z.p.y) || 100, z: zd.z }, false);
}
function sndFlesh(pt, head) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain(),
    p = panFor(pt.x, pt.z);
  f.type = "lowpass";
  f.frequency.setValueAtTime(head ? 1600 : 900, now);
  f.frequency.exponentialRampToValueAtTime(180, now + 0.14);
  g.gain.setValueAtTime((head ? 0.5 : 0.3) * distGain(pt.x, pt.z), now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  s.connect(f);
  f.connect(g);
  (p ? (g.connect(p), p) : g).connect(A.master);
  s.start(now);
  s.stop(now + 0.2);
}
function sndImpact(pt) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain(),
    p = panFor(pt.x, pt.z);
  f.type = "bandpass";
  f.frequency.value = rr(900, 2600);
  f.Q.value = 2;
  g.gain.setValueAtTime(0.22 * distGain(pt.x, pt.z), now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  s.connect(f);
  f.connect(g);
  (p ? (g.connect(p), p) : g).connect(A.master);
  s.start(now);
  s.stop(now + 0.12);
}
function sndGrowl(zd, alert) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    dur = alert ? 0.9 : rr(0.5, 1.1),
    o = A.ctx.createOscillator(),
    o2 = A.ctx.createOscillator(),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain(),
    p = panFor(zd.x, zd.z);
  o.type = "sawtooth";
  o2.type = "square";
  var base = zd.type === "brute" ? 48 : zd.type === "runner" ? 116 : 74;
  o.frequency.setValueAtTime(base * rr(0.85, 1.15), now);
  o.frequency.linearRampToValueAtTime(base * (alert ? 1.7 : 0.75), now + dur);
  o2.frequency.setValueAtTime(base * 1.51, now);
  o2.frequency.linearRampToValueAtTime(base * 0.9, now + dur);
  f.type = "lowpass";
  f.frequency.value = alert ? 1500 : 700;
  f.Q.value = 6;
  var gain = (alert ? 0.5 : 0.28) * distGain(zd.x, zd.z, 1500);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(gain, now + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
  o.connect(f);
  o2.connect(f);
  f.connect(g);
  (p ? (g.connect(p), p) : g).connect(A.master);
  o.start(now);
  o2.start(now);
  o.stop(now + dur + 0.05);
  o2.stop(now + dur + 0.05);
}
function sndScream(zd) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    o = A.ctx.createOscillator(),
    g = A.ctx.createGain(),
    f = A.ctx.createBiquadFilter();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(320, now);
  o.frequency.exponentialRampToValueAtTime(1750, now + 0.35);
  o.frequency.exponentialRampToValueAtTime(420, now + 1.5);
  f.type = "bandpass";
  f.frequency.value = 1400;
  f.Q.value = 3;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.5, now + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
  o.connect(f);
  f.connect(g);
  g.connect(A.master);
  o.start(now);
  o.stop(now + 1.7);
}
function sndDeath(zd) {
  sndGrowl({ x: zd.x, z: zd.z, type: "walker" }, false);
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "lowpass";
  f.frequency.setValueAtTime(700, now);
  f.frequency.exponentialRampToValueAtTime(120, now + 0.5);
  g.gain.setValueAtTime(0.3 * distGain(zd.x, zd.z), now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.6);
}
function sndDoor(x, z) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    o = A.ctx.createOscillator(),
    g = A.ctx.createGain(),
    p = panFor(x, z);
  o.type = "sawtooth";
  o.frequency.setValueAtTime(220, now);
  o.frequency.linearRampToValueAtTime(90, now + 0.8);
  g.gain.setValueAtTime(0.06 * distGain(x, z), now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
  o.connect(g);
  (p ? (g.connect(p), p) : g).connect(A.master);
  o.start(now);
  o.stop(now + 0.9);
}
// Flamethrower: filtered noise roar with a low rumble under it, looped in
// short overlapping grains so holding the trigger sounds continuous.
function sndFlame() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "bandpass";
  f.frequency.setValueAtTime(rr(420, 700), now);
  f.frequency.linearRampToValueAtTime(rr(900, 1500), now + 0.2);
  f.Q.value = 0.9;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.24, now + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.26);
}

// Grenade: a hard crack, a body-hitting thump, and a tail of debris hiss.
function sndBlast(pt) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    p = panFor(pt.x, pt.z),
    gain = 0.55 + 0.45 * distGain(pt.x, pt.z, 2200);
  var s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "lowpass";
  f.frequency.setValueAtTime(4200, now);
  f.frequency.exponentialRampToValueAtTime(220, now + 0.7);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
  s.connect(f);
  f.connect(g);
  (p ? (g.connect(p), p) : g).connect(A.master);
  s.start(now);
  s.stop(now + 0.95);
  var o = A.ctx.createOscillator(),
    og = A.ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(120, now);
  o.frequency.exponentialRampToValueAtTime(28, now + 0.4);
  og.gain.setValueAtTime(gain, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  o.connect(og);
  og.connect(A.master);
  o.start(now);
  o.stop(now + 0.55);
}

function sndHurt() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "lowpass";
  f.frequency.value = 500;
  g.gain.setValueAtTime(0.55, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.32);
}
function sndPickup() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime;
  [660, 990].forEach(function (fr, i) {
    var o = A.ctx.createOscillator(),
      g = A.ctx.createGain();
    o.type = "triangle";
    o.frequency.value = fr;
    g.gain.setValueAtTime(0.0001, now + i * 0.07);
    g.gain.linearRampToValueAtTime(0.18, now + i * 0.07 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.2);
    o.connect(g);
    g.connect(A.master);
    o.start(now + i * 0.07);
    o.stop(now + i * 0.07 + 0.22);
  });
}
function sndStinger() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime;
  [180, 191, 268, 372].forEach(function (fr) {
    var o = A.ctx.createOscillator(),
      g = A.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = fr;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.13, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
    o.connect(g);
    g.connect(A.master);
    o.start(now);
    o.stop(now + 1.5);
  });
}
function sndHeartbeat() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime;
  [0, 0.19].forEach(function (d, i) {
    var o = A.ctx.createOscillator(),
      g = A.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(66, now + d);
    o.frequency.exponentialRampToValueAtTime(34, now + d + 0.14);
    g.gain.setValueAtTime(0.0001, now + d);
    g.gain.linearRampToValueAtTime(i ? 0.2 : 0.3, now + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + d + 0.2);
    o.connect(g);
    g.connect(A.master);
    o.start(now + d);
    o.stop(now + d + 0.22);
  });
}
function sndFootstep(sprint) {
  var A = audio();
  if (!A || !Z.p) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();

  var isBlood = isNearBloodDecal(Z.p.x, Z.p.z);
  var isGlass = isNearGlassDebris(Z.p.x, Z.p.z);

  if (isBlood) {
    f.type = "bandpass";
    f.frequency.value = rr(1100, 2000);
    g.gain.setValueAtTime((sprint ? 0.2 : 0.12), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  } else if (isGlass) {
    f.type = "highpass";
    f.frequency.value = rr(2800, 4800);
    g.gain.setValueAtTime((sprint ? 0.16 : 0.09), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  } else {
    f.type = "lowpass";
    f.frequency.value = rr(400, 800);
    g.gain.setValueAtTime((sprint ? 0.13 : 0.07), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  }

  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.13);
}

function stepHorrorAmbience(dt) {
  if (!Z.active || Z.paused) return;
  set_ambT(ambT - (dt));
  if (ambT <= 0) {
    set_ambT(rr(14, 30));
    playHouseCreak();
  }
}

function playHouseCreak() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime;
  var osc = A.ctx.createOscillator();
  var gain = A.ctx.createGain();

  osc.type = "sine";
  var f0 = rr(85, 140);
  osc.frequency.setValueAtTime(f0, now);
  osc.frequency.linearRampToValueAtTime(f0 * rr(0.75, 1.25), now + 0.6);

  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

  osc.connect(gain);
  gain.connect(A.master);
  osc.start(now);
  osc.stop(now + 0.68);
}

function sndHammer() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime;
  var s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "bandpass";
  f.frequency.setValueAtTime(1400, now);
  f.Q.value = 4;
  g.gain.setValueAtTime(0.4, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.14);
  var o = A.ctx.createOscillator(), og = A.ctx.createGain();
  o.frequency.setValueAtTime(320, now);
  o.frequency.exponentialRampToValueAtTime(110, now + 0.15);
  og.gain.setValueAtTime(0.3, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  o.connect(og);
  og.connect(A.master);
  o.start(now);
  o.stop(now + 0.17);
}

function sndPower() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime;
  var o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(50, now);
  o.frequency.exponentialRampToValueAtTime(340, now + 0.8);
  g.gain.setValueAtTime(0.001, now);
  g.gain.linearRampToValueAtTime(0.35, now + 0.2);
  g.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
  o.connect(g);
  g.connect(A.master);
  o.start(now);
  o.stop(now + 1.2);
}

function sndThunder() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime;
  var s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "lowpass";
  f.frequency.setValueAtTime(320, now);
  f.frequency.linearRampToValueAtTime(110, now + 1.8);
  g.gain.setValueAtTime(0.65, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 2.3);
  var o = A.ctx.createOscillator(), og = A.ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(55, now);
  o.frequency.exponentialRampToValueAtTime(24, now + 1.5);
  og.gain.setValueAtTime(0.5, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
  o.connect(og);
  og.connect(A.master);
  o.start(now);
  o.stop(now + 1.9);
}

function sndPerk() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.50].forEach(function (fr, i) {
    var o = A.ctx.createOscillator(),
      g = A.ctx.createGain();
    o.type = "sine";
    o.frequency.value = fr;
    g.gain.setValueAtTime(0.0001, now + i * 0.08);
    g.gain.linearRampToValueAtTime(0.22, now + i * 0.08 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.35);
    o.connect(g);
    g.connect(A.master);
    o.start(now + i * 0.08);
    o.stop(now + i * 0.08 + 0.38);
  });
}

export {
  sndBlast, sndClick, sndDeath, sndDoor, sndFlame, sndFlesh, sndFootstep,
  sndGrowl, sndHammer, sndHeartbeat, sndHurt, sndImpact, sndPerk, sndPickup,
  sndPower, sndReload, sndScream, sndShot, sndStinger, sndSwipe, sndThunder,
  sndWhoosh, stepHorrorAmbience,
};
