// Drive-mode audio: procedural engine + one-shot blips.
// Shared mutable state (the AudioContext, the mute flag) lives on `D` in
// drive_state.js — see the note there about why nothing rebindable lives here.
import { D } from "./drive_state.js";

// ---- audio: procedural engine + one-shot blips -----------------------------
// The engine is a stack of oscillators locked to the cylinder firing frequency,
// plus a bandpass-noise exhaust layer. Pitch follows a *gear-based* RPM curve
// (revs climb through each gear, then drop on the upshift) instead of rising
// forever with speed, and throttle opens up the brightness and volume — the
// two cues the ear reads as "a real car working."
// top speed (km/h) of each gear; RPM sweeps idle→redline across each band
export const GEARS = [38, 72, 112, 158, 223];
export const IDLE_RPM = 850;
export const REDLINE_RPM = 6400;
export function gearRpm(kmh) {
  let lo = 0;
  for (let i = 0; i < GEARS.length; i++) {
    const top = GEARS[i];
    if (kmh <= top || i === GEARS.length - 1) {
      const span = top - lo || 1;
      const frac = Math.max(0, Math.min(1, (kmh - lo) / span));
      return IDLE_RPM + frac * (REDLINE_RPM - IDLE_RPM);
    }
    lo = top;
  }
  return IDLE_RPM;
}
export function audioStart() {
  if (D.audio) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);

    // harmonics of the firing order: a sub thrum, the dominant firing tone,
    // and two upper edges give the sound body without turning to a pure whine
    const HARM = [
      { mult: 0.5, type: "sine", gain: 0.55 },
      { mult: 1.0, type: "sawtooth", gain: 0.9 },
      { mult: 2.0, type: "square", gain: 0.22 },
      { mult: 3.0, type: "sawtooth", gain: 0.12 },
    ];
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    lp.Q.value = 0.6;
    const oscBus = ac.createGain();
    oscBus.gain.value = 0.1;
    lp.connect(oscBus).connect(master);
    const oscs = HARM.map((h) => {
      const o = ac.createOscillator();
      o.type = h.type;
      const g = ac.createGain();
      g.gain.value = h.gain;
      o.connect(g).connect(lp);
      o.start();
      return { o, mult: h.mult };
    });

    // exhaust/intake roughness: 2 s of looping noise through a bandpass that
    // tracks RPM, so the texture rises in pitch with the revs
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = nb;
    noise.loop = true;
    const nbp = ac.createBiquadFilter();
    nbp.type = "bandpass";
    nbp.frequency.value = 200;
    nbp.Q.value = 0.7;
    const nGain = ac.createGain();
    nGain.gain.value = 0;
    noise.connect(nbp).connect(nGain).connect(master);
    noise.start();

    D.audio = { ac, master, oscs, lp, nbp, nGain, rpm: IDLE_RPM, load: 0 };
  } catch (_) {}
}
export function engineUpdate(speedKmh, throttle, dt) {
  if (!D.audio) return;
  const a = D.audio,
    now = a.ac.currentTime,
    k = dt || 0.016;
  // engine off on foot / when stopped or muted
  const on = speedKmh >= 0 && D.running && !D.muted;
  a.master.gain.setTargetAtTime(on ? 1 : 0, now, 0.06);
  if (!on) return;
  // smooth the load (throttle) so lifting off eases the brightness back down
  a.load += ((throttle || 0) - a.load) * Math.min(1, 7 * k);
  // idle flutter: a little wobble when barely moving so it doesn't sit dead
  const flutter =
    speedKmh < 2 ? Math.sin(now * 31) * 22 + Math.sin(now * 11) * 14 : 0;
  const targetRpm = gearRpm(Math.max(0, speedKmh)) + flutter;
  a.rpm += (targetRpm - a.rpm) * Math.min(1, 6 * k);
  // 4-cylinder 4-stroke fires twice per crank revolution
  const fire = (a.rpm / 60) * 2;
  for (const osc of a.oscs)
    osc.o.frequency.setTargetAtTime(fire * osc.mult, now, 0.03);
  // brightness opens with revs and load; overall level lifts a touch on throttle
  a.lp.frequency.setTargetAtTime(360 + a.rpm * 0.16 + a.load * 900, now, 0.06);
  // lean on the gas → engine leans into it (volume swells with load)
  a.master.gain.setTargetAtTime(0.7 + a.load * 0.3, now, 0.06);
  a.nbp.frequency.setTargetAtTime(130 + a.rpm * 0.05, now, 0.06);
  a.nGain.gain.setTargetAtTime(0.012 + a.load * 0.03 + a.rpm * 5e-6, now, 0.06);
}
export function audioStop() {
  if (D.audio) {
    try {
      D.audio.oscs.forEach((o) => o.o.stop());
      D.audio.ac.close();
    } catch (_) {}
    D.audio = null;
  }
}
// short blip: checkpoint chime, countdown beep, cash ka-ching
export function sfx(freq, durMs, delayMs, type) {
  if (!D.audio || D.muted) return;
  try {
    const ac = D.audio.ac;
    const o = ac.createOscillator();
    o.type = type || "sine";
    o.frequency.value = freq;
    const g = ac.createGain();
    const t0 = ac.currentTime + (delayMs || 0) / 1000;
    g.gain.setValueAtTime(0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + durMs / 1000);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + durMs / 1000 + 0.02);
  } catch (_) {}
}

