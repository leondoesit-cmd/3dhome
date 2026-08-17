// Drive-mode HUD + the three session modes (goto / race / taxi).
//
// The only thing it needs back from drive.js is stopDrive(), which arrives
// through setModeHooks() rather than an import — drive.js imports this module,
// so importing back would close a cycle.
import { t } from "./i18n.js";
import { flash } from "./ui.js";
import * as net from "./net.js";
import { escapeHTML } from "./safe.js";
import { mToLL } from "./drive_geo.js";
import { D, car, fmtMs, HUD_ARC } from "./drive_state.js";
import { gearRpm, sfx, GEARS, IDLE_RPM, REDLINE_RPM } from "./drive_audio.js";
import { fetchRoute, insideBuilding, setRouteRibbon } from "./drive_world.js";

const hooks = { stopDrive: () => {} };
export function setModeHooks(h) {
  Object.assign(hooks, h);
}

// ---- HUD helpers -----------------------------------------------------------
// Dashboard: a sweeping speed arc, a rev bar and a gear read-out driven by the
// same gear table the engine audio uses, plus a speed haze that closes in as
// the numbers climb. Built once, then only attributes are touched per frame.
export function hudUpdate(kmh, fwd, distM) {
  if (!D.hudEls) return;
  const frac = Math.min(1, kmh / 235);
  D.hudEls.arc.style.strokeDashoffset = (HUD_ARC * (1 - frac)).toFixed(1);
  D.hudEls.arc.style.stroke = kmh > 195 ? "#ff5a3c" : kmh > 140 ? "#ffc828" : "#5ad2ff";
  D.hudEls.num.textContent = Math.round(kmh);
  let gi = 0;
  while (gi < GEARS.length - 1 && kmh > GEARS[gi]) gi++;
  D.hudEls.gear.textContent = fwd < -0.4 ? "R" : kmh < 1 ? "N" : String(gi + 1);
  const rpm = Math.max(0, Math.min(1, (gearRpm(kmh) - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM)));
  D.hudEls.rev.style.width = Math.round(rpm * 100) + "%";
  D.hudEls.rev.style.background = rpm > 0.88 ? "#ff4a30" : "#9fe870";
  if (distM >= 0) {
    D.hudEls.dist.style.display = "";
    D.hudEls.dist.textContent =
      distM > 950 ? (distM / 1000).toFixed(1) + " km" : Math.round(distM) + " m";
  } else D.hudEls.dist.style.display = "none";
  D.hudEls.fx.style.opacity = Math.min(0.85, Math.max(0, (kmh - 65) / 190)).toFixed(3);
}
export function hudMsg(text, ms) {
  const el = D.overlay.querySelector("#driveMsg");
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(el._t);
  if (ms) el._t = setTimeout(() => el.classList.remove("on"), ms);
}
export function hudMsgOff() {
  const el = D.overlay.querySelector("#driveMsg");
  clearTimeout(el._t);
  el.classList.remove("on");
}
export function showResults(title, rowsHTML, subtitle) {
  D.ses.resultsShown = true;
  const r = D.overlay.querySelector("#driveResults");
  r.querySelector("h2").textContent = title;
  r.querySelector(".dr-res-sub").textContent = subtitle || "";
  r.querySelector(".dr-res-rows").innerHTML = rowsHTML;
  r.style.display = "flex";
}

// ---- mode: goto ------------------------------------------------------------
export function finishGoto() {
  const f = D.ses.friend,
    cb = D.ses.onArrive;
  hooks.stopDrive();
  flash(t("dr_arrived", { name: f.name }), "success");
  if (cb) cb(f);
}

// ---- mode: race ------------------------------------------------------------
export function raceCpColor(i) {
  if (i < D.ses.cpIndex) return 0x34c759;
  if (i === D.ses.cpIndex) return 0xffc828;
  return 0x9aa0a6;
}
export function raceSyncBeacons() {
  D.ses.cps.forEach((cp, i) => cp.mesh.userData.setColor(raceCpColor(i)));
}
export function raceTarget() {
  return D.ses.cps[Math.min(D.ses.cpIndex, D.ses.cps.length - 1)];
}
export function bestKey(points) {
  return (
    "home3d_best_" +
    points.map((p) => p.lat.toFixed(4) + "," + p.lon.toFixed(4)).join(";")
  );
}
export function raceFinish(now) {
  const ms = now - D.ses.t0;
  D.ses.finished = true;
  D.ses.locked = true;
  sfx(880, 200); sfx(1175, 300, 180);
  // local best time per course
  let best = null;
  try {
    const k = bestKey(D.ses.def.points);
    best = parseInt(localStorage.getItem(k), 10) || null;
    if (!best || ms < best) {
      localStorage.setItem(k, String(ms));
      best = ms;
    }
  } catch (_) {}
  D.ses.myMs = ms;
  if (D.ses.mp) {
    net.sendData({ k: "race_fin", id: D.ses.def.id, ms });
    D.ses.board[net.NET.code] = { name: net.NET.name || t("fr_me"), ms };
  }
  renderRaceResults(best);
}
export function renderRaceResults(best) {
  const splits = D.ses.splits
    .map(
      (s, i) =>
        '<div class="dr-res-row"><span>CP ' + (i + 1) + "</span><b>" + fmtMs(s) + "</b></div>",
    )
    .join("");
  let rows =
    '<div class="dr-res-row dr-res-big"><span>' + t("mr_yourTime") + "</span><b>" +
    fmtMs(D.ses.myMs) + "</b></div>" + splits;
  if (best != null)
    rows +=
      '<div class="dr-res-row"><span>' + t("mr_best") + "</span><b>" +
      fmtMs(best) + "</b></div>";
  if (D.ses.mp) {
    const codes = Object.keys(D.ses.board).sort((a, b) => D.ses.board[a].ms - D.ses.board[b].ms);
    rows +=
      '<div class="dr-res-head">' + t("mr_leaderboard") + "</div>" +
      codes
        .map(
          (c, i) =>
            '<div class="dr-res-row"><span>' + (i + 1) + ". " +
            escapeHTML(D.ses.board[c].name) + "</span><b>" + fmtMs(D.ses.board[c].ms) + "</b></div>",
        )
        .join("") +
      (Object.keys(D.ses.board).length < D.ses.mp.players.length
        ? '<div class="dr-res-row dr-res-wait">' + t("mr_waiting") + "</div>"
        : "");
  }
  showResults(t("mr_finish"), rows, D.ses.def.name || "");
}
export function raceTick(now, distToTarget) {
  if (D.ses.finished) return;
  // countdown
  if (D.ses.countdownEnd) {
    const left = D.ses.countdownEnd - now;
    if (left > 0) {
      const n = Math.ceil(left / 1000);
      if (n !== D.ses.cdShown) {
        D.ses.cdShown = n;
        hudMsg(String(n), 900);
        sfx(440, 120);
      }
      return;
    }
    D.ses.countdownEnd = null;
    D.ses.locked = false;
    D.ses.t0 = now;
    hudMsg(t("mr_go"), 800);
    sfx(880, 250);
  }
  D.overlay.querySelector("#driveTimer").textContent =
    fmtMs(now - D.ses.t0) + " · CP " + Math.min(D.ses.cpIndex + 1, D.ses.cps.length) + "/" + D.ses.cps.length;
  if (distToTarget < 20 && D.ses.cpIndex < D.ses.cps.length) {
    D.ses.splits.push(now - D.ses.t0);
    D.ses.cpIndex++;
    if (D.ses.cpIndex >= D.ses.cps.length) raceFinish(now);
    else {
      sfx(660, 150);
      hudMsg(t("mr_cp", { n: D.ses.cpIndex, total: D.ses.cps.length }), 900);
      raceSyncBeacons();
      // re-route the guide from here to the remaining checkpoints
      const from = mToLL(car.x, car.z);
      const rest = D.ses.def.points.slice(D.ses.cpIndex);
      fetchRoute([from].concat(rest)).then((r) => D.running && r && setRouteRibbon(r));
    }
  }
}

// ---- mode: taxi ------------------------------------------------------------
// random reachable-ish point: ring between rMin..rMax meters around (x,z),
// nudged out of buildings by retry
export function taxiRandomPoint(cx, cz, rMin, rMax) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2,
      r = rMin + Math.random() * (rMax - rMin);
    const x = cx + Math.sin(a) * r,
      z = cz + Math.cos(a) * r;
    if (!insideBuilding(x, z)) return { x, z };
  }
  return { x: cx + rMin, z: cz };
}
export function taxiNewFare() {
  const p = taxiRandomPoint(car.x, car.z, 150, 550);
  D.ses.fare = { state: "pickup", x: p.x, z: p.z };
  D.ses.pax.position.set(p.x, 0, p.z);
  D.ses.pax.visible = true;
  D.ses.pickupRing.position.set(p.x, 0, p.z);
  D.ses.pickupRing.visible = true;
  D.ses.dropBeacon.visible = false;
  const from = mToLL(car.x, car.z);
  fetchRoute([from, mToLL(p.x, p.z)]).then((r) => D.running && r && setRouteRibbon(r));
  hudMsg(t("tx_newFare"), 1600);
  sfx(587, 140); sfx(784, 200, 130);
}
export function taxiPickup(now) {
  const f = D.ses.fare;
  f.state = "drop";
  D.ses.pax.visible = false;
  D.ses.pickupRing.visible = false;
  const d = taxiRandomPoint(f.x, f.z, 300, 1100);
  f.dx = d.x;
  f.dz = d.z;
  const dist = Math.hypot(d.x - f.x, d.z - f.z);
  f.reward = Math.round(8 + dist * 0.05);
  f.deadline = now + (14 + dist / 9) * 1000; // ~32 km/h average pace required
  D.ses.dropBeacon.position.set(d.x, 0, d.z);
  D.ses.dropBeacon.visible = true;
  fetchRoute([mToLL(f.x, f.z), mToLL(d.x, d.z)]).then(
    (r) => D.running && r && setRouteRibbon(r),
  );
  hudMsg(t("tx_pickup"), 1600);
  sfx(660, 120); sfx(880, 180, 110);
}
export function taxiDeliver(now) {
  const f = D.ses.fare;
  const left = Math.max(0, f.deadline - now);
  const tip = Math.round((left / 1000) * 0.8);
  D.ses.cash += f.reward + tip;
  D.ses.fares++;
  hudMsg("+$" + (f.reward + tip), 1600);
  sfx(988, 120); sfx(1319, 260, 110);
  taxiNewFare();
}
export function taxiOver() {
  D.ses.finished = true;
  D.ses.locked = true;
  const rows =
    '<div class="dr-res-row dr-res-big"><span>' + t("tx_total") + "</span><b>$" +
    D.ses.cash + "</b></div>" +
    '<div class="dr-res-row"><span>' + t("tx_fares") + "</span><b>" + D.ses.fares + "</b></div>";
  showResults(t("tx_timeUp"), rows, "");
  if (D.ses.mp) net.sendData({ k: "race_fin", id: D.ses.def.id, cash: D.ses.cash });
  sfx(392, 400); sfx(294, 500, 350);
}
export function taxiTick(now) {
  if (D.ses.finished) return;
  if (D.ses.countdownEnd) {
    const left = D.ses.countdownEnd - now;
    if (left > 0) {
      const n = Math.ceil(left / 1000);
      if (n !== D.ses.cdShown) {
        D.ses.cdShown = n;
        hudMsg(String(n), 900);
        sfx(440, 120);
      }
      return;
    }
    D.ses.countdownEnd = null;
    D.ses.locked = false;
    D.ses.endAt = now + D.ses.def.durS * 1000;
    taxiNewFare();
  }
  const left = Math.max(0, D.ses.endAt - now);
  if (left <= 0) return taxiOver();
  const f = D.ses.fare;
  let line = "⏱ " + fmtMs(left) + " · $" + D.ses.cash;
  if (f && f.state === "drop") {
    const fl = Math.max(0, f.deadline - now);
    line += " · " + t("tx_fareIn") + " " + Math.ceil(fl / 1000) + "s";
    if (fl <= 0) {
      // fare bailed — no pay, next customer
      hudMsg(t("tx_missed"), 1600);
      sfx(220, 400, 0, "square");
      taxiNewFare();
    }
  }
  D.overlay.querySelector("#driveTimer").textContent = line;
  const speedMs = Math.hypot(car.vx, car.vz);
  if (f && f.state === "pickup") {
    if (Math.hypot(f.x - car.x, f.z - car.z) < 12 && speedMs < 3) taxiPickup(now);
    D.ses.pax.userData.arrow.position.y = 4.2 + Math.sin(now / 220) * 0.5;
    D.ses.pax.userData.arrow.rotation.y += 0.03;
  } else if (f && f.state === "drop") {
    if (Math.hypot(f.dx - car.x, f.dz - car.z) < 14 && speedMs < 3) taxiDeliver(now);
  }
}

