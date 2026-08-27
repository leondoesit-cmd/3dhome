// Drive-mode HUD + the three session modes (goto / race / taxi).
//
// The only thing it needs back from drive.js is stopDrive(), which arrives
// through setModeHooks() rather than an import — drive.js imports this module,
// so importing back would close a cycle. Peer state is read off D.ses.peers,
// which drive_mp.js fills from the pose packets (importing drive_mp would
// close a cycle the other way).
import { t } from "./i18n.js";
import { flash } from "./ui.js";
import * as net from "./net.js";
import { escapeHTML } from "./safe.js";
import { mToLL } from "./drive_geo.js";
import { D, car, fmtMs, HUD_ARC } from "./drive_state.js";
import { gearRpm, sfx, GEARS, IDLE_RPM, REDLINE_RPM } from "./drive_audio.js";
import { fetchRoute, fetchRouteData, insideBuilding, setRouteRibbon } from "./drive_world.js";
import { cinemaFor } from "./drive_camera.js";

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
// Floating score/bonus pop — the "+$120" and CRAZY DRIFT callouts stack up the
// right edge and fade themselves out, so they never block the driving view.
export function hudPop(text, kind) {
  const host = D.overlay && D.overlay.querySelector("#driveBonus");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "dr-pop" + (kind ? " dr-pop-" + kind : "");
  el.textContent = text;
  host.appendChild(el);
  while (host.children.length > 5) host.firstChild.remove();
  setTimeout(() => el.remove(), 1600);
}
export function showResults(title, rowsHTML, subtitle) {
  D.ses.resultsShown = true;
  const r = D.overlay.querySelector("#driveResults");
  r.querySelector("h2").textContent = title;
  r.querySelector(".dr-res-sub").textContent = subtitle || "";
  r.querySelector(".dr-res-rows").innerHTML = rowsHTML;
  r.style.display = "flex";
}

// ---- live standings (multiplayer) ------------------------------------------
// Peers publish their progress on the pose packet drive_mp.js already sends
// (checkpoint index + distance to their next gate in a race, cash in taxi), so
// the board costs no extra traffic and updates between packets.
function standingRows(distToTarget) {
  const me =
    D.ses.mode === "race"
      ? { cp: D.ses.cpIndex, dn: distToTarget, fin: D.ses.myMs || 0 }
      : { cash: D.ses.cash || 0 };
  const rows = [{ code: net.NET.code, name: net.NET.name || t("fr_me"), me: true, ...me }];
  const peers = D.ses.peers || {};
  for (const code in peers)
    rows.push({ code, name: net.peerName(code), ...peers[code] });
  if (D.ses.mode === "race")
    rows.sort(
      (a, b) =>
        (a.fin ? 0 : 1) - (b.fin ? 0 : 1) ||
        (a.fin && b.fin ? a.fin - b.fin : 0) ||
        (b.cp || 0) - (a.cp || 0) ||
        (a.dn == null ? 1e9 : a.dn) - (b.dn == null ? 1e9 : b.dn),
    );
  else rows.sort((a, b) => (b.cash || 0) - (a.cash || 0));
  return rows;
}
export function boardTick(now, distToTarget) {
  const el = D.overlay && D.overlay.querySelector("#driveBoard");
  if (!el) return;
  if (!D.ses.mp || D.ses.mode === "goto") {
    el.style.display = "none";
    return;
  }
  if (now - (D.ses.boardAt || 0) < 400) return;
  D.ses.boardAt = now;
  const rows = standingRows(distToTarget);
  D.ses.myRank = rows.findIndex((r) => r.me) + 1;
  if (rows.length < 2) {
    el.style.display = "none";
    return;
  }
  el.style.display = "block";
  // peer display names come off the relay — build the rows with textContent,
  // never by concatenating into innerHTML
  el.replaceChildren(
    ...rows.slice(0, 6).map((r, i) => {
      const row = document.createElement("div");
      row.className = "dr-bd-row" + (r.me ? " me" : "");
      const pos = document.createElement("i");
      pos.textContent = i + 1;
      const nm = document.createElement("span");
      nm.textContent = r.name;
      const val = document.createElement("b");
      val.textContent =
        D.ses.mode === "race"
          ? r.fin
            ? fmtMs(r.fin)
            : t("mr_cpShort", { n: Math.min((r.cp || 0) + 1, D.ses.cps.length) })
          : "$" + (r.cash || 0);
      row.append(pos, nm, val);
      return row;
    }),
  );
}

// ---- mode: goto ------------------------------------------------------------
// Nearest point on the guide + how much of it is left. Called on a timer, not
// per frame: an OSRM line across town is a couple of thousand points.
export function routeProgress(x, z) {
  const r = D.ses && D.ses.route;
  if (!r || r.length < 2) return null;
  let bi = 0,
    bd = Infinity;
  for (let i = 0; i < r.length; i++) {
    const d = Math.hypot(r[i].x - x, r[i].z - z);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  let rem = bd;
  for (let i = bi; i < r.length - 1; i++)
    rem += Math.hypot(r[i + 1].x - r[i].x, r[i + 1].z - r[i].z);
  return { idx: bi, off: bd, remM: rem };
}
export function gotoTick(now, distM) {
  const arrive = D.overlay.querySelector("#driveArrive");
  if (!D.ses.arrived && distM < 28) {
    D.ses.arrived = true;
    arrive.style.display = "flex";
  } else if (D.ses.arrived && distM >= 40) {
    D.ses.arrived = false;
    arrive.style.display = "none";
  }
  if (now - (D.ses.navAt || 0) < 400) return;
  D.ses.navAt = now;
  const p = routeProgress(car.x, car.z);
  const remM = p ? Math.max(p.remM, distM * 0.9) : distM;
  // ETA off your own recent pace so it tracks how you actually drive; floored
  // so idling at a kerb doesn't read "two hours away"
  const kmh = Math.hypot(car.vx, car.vz) * 3.6;
  D.ses.paceKmh = D.ses.paceKmh == null ? kmh : D.ses.paceKmh + (kmh - D.ses.paceKmh) * 0.25;
  const mins = Math.max(1, Math.round((remM / 1000 / Math.max(20, D.ses.paceKmh)) * 60));
  D.overlay.querySelector("#driveTimer").textContent =
    (remM > 950 ? (remM / 1000).toFixed(1) + " km" : Math.round(remM) + " m") +
    " · " +
    t("dr_eta", { min: mins }) +
    (D.ses.mp && Object.keys(D.ses.ghosts || {}).length
      ? " · " + t("dr_convoy", { n: Object.keys(D.ses.ghosts).length })
      : "");
  // strayed off the guide? ask for a fresh line from where we actually are —
  // the old one used to hang around pointing at a road two blocks over
  if (
    p &&
    p.off > 70 &&
    !D.ses.rerouting &&
    !D.ses.arrived &&
    now - (D.ses.rerouteAt || 0) > 12000
  ) {
    const f = D.ses.friend;
    if (!f || f.lat == null) return;
    D.ses.rerouting = true;
    D.ses.rerouteAt = now;
    hudMsg(t("dr_reroute"), 1400);
    fetchRouteData([mToLL(car.x, car.z), { lat: f.lat, lon: f.lon }]).then((r) => {
      if (!D.running || !D.ses || D.ses.mode !== "goto") return;
      D.ses.rerouting = false;
      if (!r) return;
      D.ses.route = r.points;
      setRouteRibbon(r.points);
    });
  }
}
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
  cinemaFor(90000, "orbit"); // hold the car in frame behind the results card
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
    // a time that failed the sanity check drops to the bottom and says so —
    // silently trusting it, or silently binning it, are both worse
    const codes = Object.keys(D.ses.board).sort(
      (a, b) =>
        (D.ses.board[a].suspect ? 1 : 0) - (D.ses.board[b].suspect ? 1 : 0) ||
        D.ses.board[a].ms - D.ses.board[b].ms,
    );
    rows +=
      '<div class="dr-res-head">' + t("mr_leaderboard") + "</div>" +
      codes
        .map(
          (c, i) =>
            '<div class="dr-res-row' + (D.ses.board[c].suspect ? " dr-res-suspect" : "") +
            '"><span>' + (D.ses.board[c].suspect ? "⚠ " : (i + 1) + ". ") +
            escapeHTML(D.ses.board[c].name) +
            (D.ses.board[c].suspect ? " · " + t("mr_unverified") : "") +
            "</span><b>" + fmtMs(D.ses.board[c].ms) + "</b></div>",
        )
        .join("") +
      (Object.keys(D.ses.board).length < D.ses.mp.players.length
        ? '<div class="dr-res-row dr-res-wait">' + t("mr_waiting") + "</div>"
        : "");
  }
  showResults(t("mr_finish"), rows, D.ses.def.name || "");
}
export function raceTick(now, distToTarget) {
  if (D.ses.finished) {
    boardTick(now, distToTarget);
    return;
  }
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
  boardTick(now, distToTarget);
  D.overlay.querySelector("#driveTimer").textContent =
    fmtMs(now - D.ses.t0) +
    " · CP " + Math.min(D.ses.cpIndex + 1, D.ses.cps.length) + "/" + D.ses.cps.length +
    (D.ses.mp && D.ses.myRank ? " · P" + D.ses.myRank : "");
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
// Three kinds of customer, picked by weight. `pace` is the average speed (m/s)
// the drop-off deadline assumes, so a VIP in a hurry is genuinely harder than
// a short hop; `bonusS` is the session time a delivery buys back — the Crazy
// Taxi loop is "drive well, play longer", not "watch a fixed clock die".
export const FARE_KINDS = [
  { key: "short", w: 4, rMin: 140, rMax: 420, pace: 8.5, pay: 1, bonusS: 6, color: 0xffc828 },
  { key: "long", w: 3, rMin: 480, rMax: 1150, pace: 11, pay: 1.35, bonusS: 13, color: 0x34c759 },
  { key: "vip", w: 2, rMin: 300, rMax: 780, pace: 14, pay: 2.1, bonusS: 9, color: 0xa06bff },
];
export function pickFareKind() {
  const total = FARE_KINDS.reduce((n, k) => n + k.w, 0);
  let r = Math.random() * total;
  for (const k of FARE_KINDS) if ((r -= k.w) <= 0) return k;
  return FARE_KINDS[0];
}
// multiplier ladder: every delivery without a bailed fare is worth more
export function comboMult(combo) {
  return Math.min(3, 1 + 0.25 * Math.max(0, combo));
}
export function taxiGrade(cash, durS) {
  const perMin = cash / Math.max(1, durS / 60);
  return perMin >= 220 ? "S" : perMin >= 150 ? "A" : perMin >= 95 ? "B" : perMin >= 50 ? "C" : "D";
}
export function taxiBestKey(points) {
  const p = points[0];
  return "home3d_taxi_best_" + p.lat.toFixed(3) + "," + p.lon.toFixed(3);
}
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
// Route to the fare AND snap it to the street. A ring point routinely lands in
// a back garden or on a roof; OSRM's snapped waypoint is where a passenger
// could actually stand, so the marker moves onto the kerb the route ends at.
function routeToFare(fromX, fromZ, seq, apply) {
  fetchRouteData([mToLL(fromX, fromZ), mToLL(apply.x, apply.z)]).then((r) => {
    if (!D.running || !D.ses || D.ses.mode !== "taxi" || D.ses.fareSeq !== seq || !r) return;
    const snapped = r.waypoints && r.waypoints[1];
    if (snapped && Math.hypot(snapped.x - apply.x, snapped.z - apply.z) < 140)
      apply.move(snapped.x, snapped.z);
    setRouteRibbon(r.points);
  });
}
export function taxiNewFare() {
  const kind = pickFareKind();
  const p = taxiRandomPoint(car.x, car.z, kind.rMin, kind.rMax);
  const seq = (D.ses.fareSeq = (D.ses.fareSeq || 0) + 1);
  const f = (D.ses.fare = { state: "pickup", kind, x: p.x, z: p.z });
  const place = (x, z) => {
    f.x = x;
    f.z = z;
    D.ses.pax.position.set(x, 0, z);
    D.ses.pickupRing.position.set(x, 0, z);
  };
  place(p.x, p.z);
  D.ses.pax.visible = true;
  D.ses.pickupRing.visible = true;
  D.ses.pickupRing.userData.setColor(kind.color);
  D.ses.dropBeacon.visible = false;
  routeToFare(car.x, car.z, seq, { x: p.x, z: p.z, move: place });
  hudMsg(t("tx_newFare") + " · " + t("tx_kind_" + kind.key), 1600);
  sfx(587, 140); sfx(784, 200, 130);
}
export function taxiPickup(now) {
  const f = D.ses.fare;
  const kind = f.kind || FARE_KINDS[0];
  f.state = "drop";
  D.ses.pax.visible = false;
  D.ses.pickupRing.visible = false;
  const d = taxiRandomPoint(f.x, f.z, kind.rMin * 1.4, kind.rMax * 1.4);
  const seq = (D.ses.fareSeq = (D.ses.fareSeq || 0) + 1);
  const place = (x, z) => {
    f.dx = x;
    f.dz = z;
    D.ses.dropBeacon.position.set(x, 0, z);
    const dist = Math.hypot(x - f.x, z - f.z);
    f.dist = dist;
    f.reward = Math.round((8 + dist * 0.05) * kind.pay);
    f.deadline = now + (12 + dist / kind.pace) * 1000;
    f.span = f.deadline - now;
  };
  place(d.x, d.z);
  D.ses.dropBeacon.visible = true;
  D.ses.dropBeacon.userData.setColor(kind.color);
  routeToFare(f.x, f.z, seq, { x: d.x, z: d.z, move: place });
  hudMsg(t("tx_pickup"), 1600);
  sfx(660, 120); sfx(880, 180, 110);
}
export function taxiDeliver(now) {
  const f = D.ses.fare;
  const kind = f.kind || FARE_KINDS[0];
  const left = Math.max(0, f.deadline - now);
  const tip = Math.round((left / 1000) * 0.8 * kind.pay);
  const mult = comboMult(D.ses.combo);
  const pay = Math.round((f.reward + tip) * mult);
  D.ses.cash += pay;
  D.ses.fares++;
  D.ses.combo++;
  D.ses.bestCombo = Math.max(D.ses.bestCombo || 0, D.ses.combo);
  // classic Crazy Taxi: a good delivery buys more session time
  const bonusS = kind.bonusS + (left > f.span * 0.5 ? 3 : 0);
  D.ses.endAt += bonusS * 1000;
  D.ses.extraS = (D.ses.extraS || 0) + bonusS;
  hudPop("+$" + pay + (mult > 1 ? " ×" + mult.toFixed(2) : ""), "cash");
  hudPop("+" + bonusS + "s", "time");
  hudMsg(t("tx_delivered", { n: D.ses.fares }), 1200);
  sfx(988, 120); sfx(1319, 260, 110);
  taxiNewFare();
}
export function taxiOver() {
  D.ses.finished = true;
  D.ses.locked = true;
  cinemaFor(90000, "orbit");
  const def = D.ses.def;
  const grade = taxiGrade(D.ses.cash, (def.durS || 300) + (D.ses.extraS || 0));
  let best = null;
  try {
    const k = taxiBestKey(def.points);
    best = parseInt(localStorage.getItem(k), 10) || 0;
    if (D.ses.cash > best) {
      localStorage.setItem(k, String(D.ses.cash));
      best = D.ses.cash;
    }
  } catch (_) {}
  D.ses.myCash = D.ses.cash;
  D.ses.bestCash = best;
  D.ses.grade = grade;
  if (D.ses.mp) {
    net.sendData({ k: "race_fin", id: def.id, cash: D.ses.cash });
    D.ses.board[net.NET.code] = { name: net.NET.name || t("fr_me"), cash: D.ses.cash };
  }
  renderTaxiResults(best, grade);
  sfx(392, 400); sfx(294, 500, 350);
}
export function renderTaxiResults(best, grade) {
  // a peer finishing after you re-renders the card — keep your own numbers
  if (best == null) best = D.ses.bestCash;
  if (!grade) grade = D.ses.grade;
  let rows =
    '<div class="dr-res-row dr-res-big"><span>' + t("tx_total") + "</span><b>$" +
    D.ses.cash + "</b></div>" +
    '<div class="dr-res-row dr-res-grade"><span>' + t("tx_grade") + '</span><b>' +
    escapeHTML(grade || "") + "</b></div>" +
    '<div class="dr-res-row"><span>' + t("tx_fares") + "</span><b>" + D.ses.fares + "</b></div>" +
    '<div class="dr-res-row"><span>' + t("tx_bestCombo") + "</span><b>×" +
    comboMult(D.ses.bestCombo || 0).toFixed(2) + "</b></div>" +
    '<div class="dr-res-row"><span>' + t("tx_stunts") + "</span><b>$" +
    (D.ses.stuntCash || 0) + "</b></div>" +
    '<div class="dr-res-row"><span>' + t("tx_extra") + "</span><b>+" +
    (D.ses.extraS || 0) + "s</b></div>";
  if (best) rows += '<div class="dr-res-row"><span>' + t("tx_best") + "</span><b>$" + best + "</b></div>";
  if (D.ses.mp) {
    const codes = Object.keys(D.ses.board).sort(
      (a, b) => (D.ses.board[b].cash || 0) - (D.ses.board[a].cash || 0),
    );
    rows +=
      '<div class="dr-res-head">' + t("mr_leaderboard") + "</div>" +
      codes
        .map(
          (c, i) =>
            '<div class="dr-res-row"><span>' + (i + 1) + ". " +
            escapeHTML(D.ses.board[c].name) + "</span><b>$" +
            (D.ses.board[c].cash || 0) + "</b></div>",
        )
        .join("") +
      (codes.length < D.ses.mp.players.length
        ? '<div class="dr-res-row dr-res-wait">' + t("mr_waiting") + "</div>"
        : "");
  }
  showResults(t("tx_timeUp"), rows, D.ses.def.name || "");
}
// Stunt cash: the driving itself pays. A near miss at speed and a held drift
// are the two cues the player already produces without being told to.
export function taxiStunts(now) {
  const speed = Math.hypot(car.vx, car.vz);
  const mult = comboMult(D.ses.combo);
  if (speed > 12) {
    for (const v of D.vehicles) {
      if (v === D.activeV || v.wrecked) continue;
      const d = Math.hypot(v.x - car.x, v.z - car.z);
      if (d < 3.4 && now - (v.nearMissAt || 0) > 4000) {
        v.nearMissAt = now;
        const pay = Math.round(25 * mult);
        D.ses.cash += pay;
        D.ses.stuntCash = (D.ses.stuntCash || 0) + pay;
        hudPop(t("tx_through") + " +$" + pay, "stunt");
        sfx(1046, 90);
        break; // one call-out per pass, however tight the gap
      }
    }
  }
  const drifting = Math.abs(car.slip || 0) > 0.42 && speed > 8;
  D.ses.driftT = drifting ? (D.ses.driftT || 0) + (now - (D.ses.stuntAt || now)) : 0;
  D.ses.stuntAt = now;
  if (D.ses.driftT > 900) {
    D.ses.driftT = 0;
    const pay = Math.round(14 * mult);
    D.ses.cash += pay;
    D.ses.stuntCash = (D.ses.stuntCash || 0) + pay;
    hudPop(t("tx_drift") + " +$" + pay, "stunt");
    sfx(880, 80);
  }
}
export function taxiTick(now) {
  if (D.ses.finished) {
    boardTick(now, 0);
    return;
  }
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
  taxiStunts(now);
  boardTick(now, 0);
  const f = D.ses.fare;
  const timer = D.overlay.querySelector("#driveTimer");
  let line = "⏱ " + fmtMs(left) + " · $" + D.ses.cash;
  if (D.ses.combo > 0) line += " · ×" + comboMult(D.ses.combo).toFixed(2);
  let urgent = left < 15000;
  if (f && f.state === "drop") {
    const fl = Math.max(0, f.deadline - now);
    line += " · " + t("tx_fareIn") + " " + Math.ceil(fl / 1000) + "s";
    const frac = fl / Math.max(1, f.span || 1);
    if (frac < 0.3) urgent = true;
    // the drop beacon turns red as the passenger's patience runs out
    D.ses.dropBeacon.userData.setColor(
      frac < 0.3 ? 0xff4a30 : frac < 0.6 ? 0xffc828 : (f.kind || FARE_KINDS[0]).color,
    );
    if (fl <= 0) {
      // fare bailed — no pay, combo gone, next customer
      D.ses.combo = 0;
      hudMsg(t("tx_missed"), 1600);
      hudPop(t("tx_comboLost"), "miss");
      sfx(220, 400, 0, "square");
      taxiNewFare();
    }
  }
  timer.textContent = line;
  timer.classList.toggle("dr-urgent", urgent);
  const speedMs = Math.hypot(car.vx, car.vz);
  if (f && f.state === "pickup") {
    if (Math.hypot(f.x - car.x, f.z - car.z) < 12 && speedMs < 3) taxiPickup(now);
    D.ses.pax.userData.arrow.position.y = 4.2 + Math.sin(now / 220) * 0.5;
    D.ses.pax.userData.arrow.rotation.y += 0.03;
  } else if (f && f.state === "drop") {
    if (Math.hypot(f.dx - car.x, f.dz - car.z) < 14 && speedMs < 3) taxiDeliver(now);
  }
}
