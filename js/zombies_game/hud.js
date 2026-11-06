/* Night Shift HUD, grain, damage direction, blood and visor overlays, split out
   of js/zombies_game.js. It shares the editor's state through live imports from
   ../zombies_game.js. */
import { t } from "../i18n.js";
import { isPhysicsEnabled, moveKinematicCapsule } from "../physics_facade.js";
import { dampingFactor } from "../physics_runtime.js";
import { clamp } from "../state.js";
import { sndDoor, sndFootstep, sndHeartbeat, sndHurt, sndStinger } from "../zombies_game/audio.js";
import { pauseGame, syncResponsiveHud, touchPulse, unlockPointer } from "../zombies_game/input.js";
import { finishReload, fire, flame } from "../zombies_game/weapons.js";
import { buyIntermission, objectiveCount, objectiveLabel, objectiveProgress, updateInteractPrompt } from "../zombies_game/world_spawns.js";
import { ACCEL, EYE, GRAV, MAX_ARMOR, MAX_HP, P_CLEAR, P_RAD, REST_LEN, RUN_WAVES, SPD_CROUCH, SPD_SPRINT, SPD_WALK, STEP, Z, rnd, rr } from "../zombies_state.js";
import { collideCircle, freeSpot, groundAt, interiorBounds, liveRooms, losClear, makeNoise, moveCircle, shake } from "../zombies_world.js";
import {
  BLOOD_SRC, BLOOD_TINTS, INTERMISSION_OFFERS, PAUSE_CONTROLS, W, W_ORDER,
  _movePoint2D, applyGameSettings, bloodImgs, gameSettings, hudNeedsUpdate,
  restart, saveGameSettings, set_bloodImgs, set_hudNeedsUpdate,
  syncSettingsUi, toggleZombies,
} from "../zombies_game.js";

function audioClose() {
  Z.sndTOs.forEach(clearTimeout);
  Z.sndTOs = [];
  if (Z.audio) {
    try {
      Z.audio.ctx.close();
    } catch (e) {}
    Z.audio = null;
  }
}

/* ===========================================================================
   9. HUD + SCREEN FX (DOM layer over the 3D canvas)
   =========================================================================== */
function buildHud() {
  if (Z.hud) return;
  var host = document.getElementById("view-3d") || document.body;
  var el = document.createElement("div");
  el.id = "zHud";
  el.innerHTML =
    '<canvas id="zGrain"></canvas>' +
    '<div id="zVig"></div>' +
    '<canvas id="zBlood"></canvas>' +
    '<div id="zFlashCol"></div>' +
    '<div id="zChrom"></div>' +
    '<div id="zCross"><i></i><i></i><i></i><i></i><b></b></div>' +
    '<div id="zHitMark"></div>' +
    '<div id="zDamage"><i></i></div>' +
    '<div id="zTop"><span id="zWave"></span><span id="zKills"></span><span id="zScore"></span></div>' +
    '<div id="zBossBar"><div class="z-boss-hdr"><span id="zBossName"></span><b id="zBossHpText"></b></div><div class="z-boss-track"><i id="zBossFill"></i></div></div>' +
    '<div id="zReadouts"><div id="zMission"><div><span id="zMissionLabel"></span><strong id="zMissionCount"></strong></div><b><i></i></b></div>' +
    '<div id="zThreat"><i></i><span></span></div></div>' +
    '<div id="zCombo"></div>' +
    '<div id="zMsg"></div>' +
    '<div id="zIntermission"><span></span><div>' +
    '<button type="button" data-buy="ammo"></button>' +
    '<button type="button" data-buy="fortify"></button>' +
    '<button type="button" data-buy="recover"></button>' +
    '</div></div>' +
    '<div id="zInteractPrompt"></div>' +
    '<div id="zPerkBadges"><span id="zPerkSpeed" class="z-perk-badge">⚡</span><span id="zPerkJugg" class="z-perk-badge">🛡️</span><span id="zPerkDamage" class="z-perk-badge">💥</span></div>' +
    '<div id="zRadarWrap"><canvas id="zRadar" width="110" height="110"></canvas></div>' +
    '<div id="zBottom">' +
    '<div id="zVitals"><div id="zHpBar"><i></i></div><div id="zArmorBar"><i></i></div><div id="zStamBar"><i></i></div>' +
    '<div id="zDistractBar"><i></i></div>' +
    '<div id="zBatt"><span>🔦</span><div id="zBattBar"><i></i></div></div></div>' +
    '<div id="zDistractFx"></div>' +
    '<div id="zAmmo"><span id="zFrags"></span><span id="zWName"></span><span id="zAmmoN"></span></div>' +
    "</div>" +
    '<div id="zWheel"></div>' +
    '<div id="zTutorial" role="status"></div>' +
    '<div id="zHint"></div>' +
    '<button type="button" id="zPauseBtn" aria-label=""></button>' +
    '<div id="zTouch" aria-label="">' +
    '<div id="zStick" class="z-touch-stick"><i></i></div>' +
    '<div class="z-touch-actions">' +
    '<button type="button" data-act="reload"></button>' +
    '<button type="button" data-act="flash"></button>' +
    '<button type="button" data-act="shove"></button>' +
    '<button type="button" data-act="jump"></button>' +
    '<button type="button" data-act="weapon"></button>' +
    '<button type="button" data-act="interact" id="zTouchInteract"></button>' +
    '<button type="button" data-hold="fire" class="z-touch-fire"></button>' +
    "</div></div>" +
    '<div id="zPause"><div class="z-pause-card"><span class="z-eyebrow"></span><h2></h2><p></p>' +
    '<div class="z-controls">' +
    PAUSE_CONTROLS.map(function (c) {
      return "<span><kbd>" + c.kbd + "</kbd><small></small></span>";
    }).join("") +
    "</div>" +
    '<div class="z-game-settings"><h3></h3>' +
    '<label><span><b id="zQualityLabel"></b><output id="zQualityValue"></output></span><input id="zQualitySlider" type="range" min="0" max="2" step="1"></label>' +
    '<label><span><b id="zDestructLabel"></b><output id="zDestructValue"></output></span><input id="zDestructSlider" type="range" min="0" max="2" step="1"></label>' +
    '<label><span><b id="zHordeLabel"></b><output id="zHordeValue"></output></span><input id="zHordeSlider" type="range" min="8" max="16" step="2"></label>' +
    '<label><span><b id="zFxLabel"></b><output id="zFxValue"></output></span><input id="zFxSlider" type="range" min="25" max="100" step="25"></label>' +
    '<h3 id="zControlsH"></h3>' +
    '<label><span><b id="zSensLabel"></b><output id="zSensValue"></output></span><input id="zSensSlider" type="range" min="35" max="240" step="5"></label>' +
    '<label class="z-check"><input id="zInvertY" type="checkbox"><span id="zInvertLabel"></span></label>' +
    '<label><span><b id="zVolLabel"></b><output id="zVolValue"></output></span><input id="zVolSlider" type="range" min="0" max="100" step="5"></label></div>' +
    '<button id="zResume"></button><button id="zExit"></button></div></div>' +
    '<div id="zDead"><h2></h2><p></p><button id="zAgain"></button><button id="zDeadExit"></button></div>' +
    '<div id="zVictory"><h2></h2><p></p><button id="zVictoryAgain"></button><button id="zVictoryExit"></button></div>';
  var extra = document.createElement("div");
  extra.className = "z-extra-settings";
  var controls = [
    ["difficulty", "select", ["easy", "normal", "hard"]], ["sandbox", "checkbox"],
    ["bodycam", "checkbox"], ["fov", "range", 60, 95, 1],
    ["shake", "range", 0, 1, 0.05], ["bob", "range", 0, 1, 0.05],
    ["lens", "range", 0, 1, 0.05], ["flashes", "range", 0, 1, 0.05], ["blood", "checkbox"]
  ];
  controls.forEach(function (spec) {
    var label = document.createElement("label"), title = document.createElement("span");
    title.textContent = t("z_option_" + spec[0]);
    var input = document.createElement(spec[1] === "select" ? "select" : "input");
    input.dataset.setting = spec[0];
    input.setAttribute("aria-label", title.textContent);
    if (spec[1] === "select") spec[2].forEach(function (value) {
      var option = document.createElement("option"); option.value = value; option.textContent = t("z_difficulty_" + value); input.appendChild(option);
    });
    else input.type = spec[1];
    if (spec[1] === "range") { input.min = spec[2]; input.max = spec[3]; input.step = spec[4]; }
    if (spec[1] === "checkbox") input.checked = gameSettings()[spec[0]];
    else input.value = gameSettings()[spec[0]];
    input.addEventListener("change", function () {
      gameSettings()[spec[0]] = spec[1] === "checkbox" ? input.checked : spec[1] === "range" ? Number(input.value) : input.value;
      saveGameSettings(); applyGameSettings();
    });
    label.append(title, input); extra.appendChild(label);
  });
  el.querySelector(".z-game-settings").appendChild(extra);
  host.appendChild(el);
  Z.hud = {
    root: el,
    grain: el.querySelector("#zGrain"),
    vig: el.querySelector("#zVig"),
    blood: el.querySelector("#zBlood"),
    flash: el.querySelector("#zFlashCol"),
    chrom: el.querySelector("#zChrom"),
    cross: el.querySelector("#zCross"),
    hit: el.querySelector("#zHitMark"),
    damage: el.querySelector("#zDamage"),
    wave: el.querySelector("#zWave"),
    kills: el.querySelector("#zKills"),
    score: el.querySelector("#zScore"),
    combo: el.querySelector("#zCombo"),
    mission: el.querySelector("#zMission"),
    missionLabel: el.querySelector("#zMissionLabel"),
    missionCount: el.querySelector("#zMissionCount"),
    missionBar: el.querySelector("#zMission b i"),
    threat: el.querySelector("#zThreat"),
    threatText: el.querySelector("#zThreat span"),
    msg: el.querySelector("#zMsg"),
    intermission: el.querySelector("#zIntermission"),
    intermissionTitle: el.querySelector("#zIntermission > span"),
    bossBar: el.querySelector("#zBossBar"),
    bossName: el.querySelector("#zBossName"),
    bossHpText: el.querySelector("#zBossHpText"),
    bossFill: el.querySelector("#zBossFill"),
    interact: el.querySelector("#zInteractPrompt"),
    perkSpeed: el.querySelector("#zPerkSpeed"),
    perkJugg: el.querySelector("#zPerkJugg"),
    perkDamage: el.querySelector("#zPerkDamage"),
    radar: el.querySelector("#zRadar"),
    hp: el.querySelector("#zHpBar i"),
    armor: el.querySelector("#zArmorBar i"),
    stam: el.querySelector("#zStamBar i"),
    distract: el.querySelector("#zDistractBar i"),
    distractFx: el.querySelector("#zDistractFx"),
    batt: el.querySelector("#zBattBar i"),
    wname: el.querySelector("#zWName"),
    ammo: el.querySelector("#zAmmoN"),
    frags: el.querySelector("#zFrags"),
    wheel: el.querySelector("#zWheel"),
    hint: el.querySelector("#zHint"),
    pause: el.querySelector("#zPause"),
    pauseEye: el.querySelector("#zPause .z-eyebrow"),
    pauseH: el.querySelector("#zPause h2"),
    pauseP: el.querySelector("#zPause p"),
    resume: el.querySelector("#zResume"),
    exit: el.querySelector("#zExit"),
    settingsH: el.querySelector("#zPause .z-game-settings h3"),
    qualityLabel: el.querySelector("#zQualityLabel"),
    qualityValue: el.querySelector("#zQualityValue"),
    qualitySlider: el.querySelector("#zQualitySlider"),
    destructLabel: el.querySelector("#zDestructLabel"),
    destructValue: el.querySelector("#zDestructValue"),
    destructSlider: el.querySelector("#zDestructSlider"),
    hordeLabel: el.querySelector("#zHordeLabel"),
    hordeValue: el.querySelector("#zHordeValue"),
    hordeSlider: el.querySelector("#zHordeSlider"),
    fxLabel: el.querySelector("#zFxLabel"),
    fxValue: el.querySelector("#zFxValue"),
    fxSlider: el.querySelector("#zFxSlider"),
    controlsH: el.querySelector("#zControlsH"),
    sensLabel: el.querySelector("#zSensLabel"),
    sensValue: el.querySelector("#zSensValue"),
    sensSlider: el.querySelector("#zSensSlider"),
    invertY: el.querySelector("#zInvertY"),
    invertLabel: el.querySelector("#zInvertLabel"),
    volLabel: el.querySelector("#zVolLabel"),
    volValue: el.querySelector("#zVolValue"),
    volSlider: el.querySelector("#zVolSlider"),
    pauseBtn: el.querySelector("#zPauseBtn"),
    touch: el.querySelector("#zTouch"),
    touchInteract: el.querySelector("#zTouchInteract"),
    stick: el.querySelector("#zStick"),
    dead: el.querySelector("#zDead"),
    deadH: el.querySelector("#zDead h2"),
    deadP: el.querySelector("#zDead p"),
    again: el.querySelector("#zAgain"),
    deadExit: el.querySelector("#zDeadExit"),
    victory: el.querySelector("#zVictory"),
    victoryH: el.querySelector("#zVictory h2"),
    victoryP: el.querySelector("#zVictory p"),
    victoryAgain: el.querySelector("#zVictoryAgain"),
    victoryExit: el.querySelector("#zVictoryExit"),
  };
  Z.hud.again.addEventListener("click", function (e) {
    e.stopPropagation();
    restart();
  });
  Z.hud.deadExit.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleZombies(false);
  });
  Z.hud.victoryAgain.addEventListener("click", function (e) {
    e.stopPropagation();
    restart();
  });
  Z.hud.victoryExit.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleZombies(false);
  });
  Z.hud.intermission.querySelectorAll("[data-buy]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      buyIntermission(this.getAttribute("data-buy"));
    });
  });
  var controlLabels = el.querySelectorAll("#zPause .z-controls small");
  PAUSE_CONTROLS.forEach(function (c, i) {
    if (controlLabels[i]) controlLabels[i].textContent = t(c.key);
  });
  Z.hud.settingsH.textContent = t("z_settings");
  Z.hud.controlsH.textContent = t("z_controls");
  Z.hud.qualityLabel.textContent = t("z_setting_quality");
  if (Z.hud.destructLabel) Z.hud.destructLabel.textContent = t("z_setting_destruct");
  Z.hud.hordeLabel.textContent = t("z_setting_horde");
  Z.hud.fxLabel.textContent = t("z_setting_fx");
  Z.hud.sensLabel.textContent = t("z_setting_look");
  Z.hud.invertLabel.textContent = t("z_setting_invert");
  Z.hud.volLabel.textContent = t("z_setting_volume");
  Z.hud.touch.setAttribute("aria-label", t("z_touch_controls"));
  Z.hud.pauseBtn.setAttribute("aria-label", t("z_touch_pause"));
  Z.hud.pauseBtn.textContent = "II";
  var touchBtns = {
    reload: { icon: "↻", key: "z_control_reload" },
    flash: { icon: "🔦", key: "z_control_flash" },
    shove: { icon: "↯", key: "z_control_shove" },
    jump: { icon: "▲", key: "z_touch_jump" },
    weapon: { icon: "⇄", key: "z_touch_weapon" },
    interact: { icon: "◎", key: "z_touch_interact" },
    fire: { icon: "●", key: "z_touch_fire" },
  };
  el.querySelectorAll("#zTouch [data-act], #zTouch [data-hold]").forEach(function (btn) {
    var act = btn.getAttribute("data-act") || btn.getAttribute("data-hold");
    var touchDef = touchBtns[act];
    btn.innerHTML = "<b></b><small></small>";
    btn.querySelector("b").textContent = touchDef ? touchDef.icon : "";
    btn.querySelector("small").textContent = touchDef ? t(touchDef.key) : "";
    btn.setAttribute("aria-label", touchDef ? t(touchDef.key) : act);
  });
  Z.hud.qualitySlider.addEventListener("input", function () {
    gameSettings().quality = Number(this.value);
    saveGameSettings();
    applyGameSettings();
    syncSettingsUi();
  });
  if (Z.hud.destructSlider) {
    Z.hud.destructSlider.addEventListener("input", function () {
      gameSettings().destruct = Number(this.value);
      saveGameSettings();
      applyGameSettings();
      syncSettingsUi();
    });
  }
  Z.hud.hordeSlider.addEventListener("input", function () {
    gameSettings().maxAlive = Number(this.value);
    saveGameSettings();
    syncSettingsUi();
  });
  Z.hud.fxSlider.addEventListener("input", function () {
    gameSettings().fx = Number(this.value);
    saveGameSettings();
    applyGameSettings();
    syncSettingsUi();
  });
  Z.hud.sensSlider.addEventListener("input", function () {
    gameSettings().sens = Number(this.value) / 100;
    saveGameSettings();
    applyGameSettings();
    syncSettingsUi();
  });
  Z.hud.volSlider.addEventListener("input", function () {
    gameSettings().volume = Number(this.value);
    saveGameSettings();
    applyGameSettings();
    syncSettingsUi();
  });
  Z.hud.invertY.addEventListener("change", function () {
    gameSettings().invertY = !!this.checked;
    saveGameSettings();
  });
  Z.hud.pauseBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (Z.p && Z.p.dead) return;
    touchPulse(10);
    pauseGame(!Z.paused);
  });
  syncSettingsUi();
  Z.hud.resume.addEventListener("click", function (e) {
    e.stopPropagation();
    pauseGame(false);
  });
  Z.hud.exit.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleZombies(false);
  });
  initGrain();
  syncResponsiveHud();
}

// animated film grain: one small tiled canvas redrawn a few times a second
function initGrain() {
  var c = Z.hud.grain;
  c.width = 96;
  c.height = 96;
  Z.grainCtx = c.getContext("2d");
  Z.grainT = 0;
}
function stepGrain(dt) {
  if (Z.settings && Z.settings.quality === 0) return;
  Z.grainT -= dt;
  if (Z.grainT > 0 || !Z.grainCtx) return;
  Z.grainT = 0.12;
  var x = Z.grainCtx,
    img = x.createImageData(96, 96),
    d = img.data;
  for (var i = 0; i < d.length; i += 4) {
    var v = 128 + (Math.random() - 0.5) * 190;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 26;
  }
  x.putImageData(img, 0, 0);
}

function hudDirty() {
  set_hudNeedsUpdate(true);
}
function hudSync() {
  if (!Z.hud || !Z.p) return;
  var P = Z.p,
    def = W[P.weapon];
  // DOM/compositing does not need to run at render frequency. Combat events
  // still set hudNeedsUpdate, while smooth bars remain clear at ~12 Hz.
  if (!hudNeedsUpdate && Z.t < (Z.hudNext || 0)) return;
  Z.hudNext = Z.t + 0.08;
  Z.hud.hp.style.width = clamp((P.hp / MAX_HP) * 100, 0, 100) + "%";
  Z.hud.hp.style.background =
    P.hp > 55 ? "#c8202a" : P.hp > 25 ? "#e0611a" : "#ff2020";
  if (Z.hud.armor) {
    Z.hud.armor.style.width = clamp(((P.armor || 0) / MAX_ARMOR) * 100, 0, 100) + "%";
    Z.hud.armor.parentElement.style.opacity = (P.armor || 0) > 0 ? "1" : "0.25";
  }
  Z.hud.stam.style.width = clamp(P.stam, 0, 100) + "%";
  if (Z.hud.distract) {
    var dk = clamp((P.distract || 0) * 100, 0, 100);
    Z.hud.distract.style.width = dk + "%";
    Z.hud.distract.parentElement.style.opacity = dk > 4 ? "1" : "0.2";
  }
  if (Z.flash) Z.hud.batt.style.width = clamp(Z.flash.batt, 0, 100) + "%";
  if (Z.hud.combo) {
    if (Z.combo >= 2 && Z.comboT > 0) {
      Z.hud.combo.textContent = t("z_combo", { n: Z.combo });
      Z.hud.combo.classList.add("on");
    } else Z.hud.combo.classList.remove("on");
  }
  var live = 0,
    nearest = Infinity;
  for (var zi = 0; zi < Z.zeds.length; zi++) {
    if (Z.zeds[zi].dead) continue;
    live++;
    nearest = Math.min(nearest, Math.hypot(Z.zeds[zi].x - P.x, Z.zeds[zi].z - P.z));
  }
  var tutorial = Z.hud.root.querySelector("#zTutorial");
  if (tutorial) {
    var lesson = Z.stats.shots === 0 ? "fire" : Z.tutorialStage < 2 ? "reload" : "objective";
    tutorial.textContent = Z.wave && Z.wave.n === 1 && Z.wave.state === "fight" ? t("z_tutorial_" + lesson) : "";
  }
  if (Z.wave && Z.hud.mission) {
    if (Z.wave.state === "extract" && Z.extraction) {
      Z.hud.missionLabel.textContent = t("z_objective_extract") + " · " + Z.extraction.name + " · " + Math.ceil(Math.hypot(P.x - Z.extraction.x, P.z - Z.extraction.z) / 100) + " m";
      Z.hud.missionCount.textContent = t("z_extract_count", {
        p: Math.round((Z.extraction.progress / Z.extraction.need) * 100),
        n: Math.max(0, Math.ceil(Z.extraction.time)),
      });
      Z.hud.missionBar.style.width = clamp((Z.extraction.progress / Z.extraction.need) * 100, 0, 100) + "%";
    } else if (Z.wave.state === "fight") {
      var remaining = Math.max(0, (Z.wave.pending || 0) + live),
        total = Math.max(1, Z.wave.total || remaining || 1);
      var obj = Z.objective;
      if (obj && !obj.completed) {
        Z.hud.missionLabel.textContent = objectiveLabel(obj);
        Z.hud.missionCount.textContent = objectiveCount(obj) + "  ·  " + t("z_remaining", { n: remaining });
        Z.hud.missionBar.style.width = clamp(objectiveProgress(obj) * 100, 0, 100) + "%";
      } else {
        Z.hud.missionLabel.textContent = Z.wave.event
          ? t("z_objective_event", { event: Z.wave.event.toUpperCase() })
          : t("z_objective_survive");
        Z.hud.missionCount.textContent = t("z_remaining", { n: remaining });
        Z.hud.missionBar.style.width = clamp((1 - remaining / total) * 100, 0, 100) + "%";
      }
    } else {
      var nextIn = Math.max(0, Math.ceil(REST_LEN - Z.wave.timer));
      Z.hud.missionLabel.textContent = t("z_objective_resupply");
      Z.hud.missionCount.textContent = t("z_next_in", { n: nextIn });
      Z.hud.missionBar.style.width = clamp((Z.wave.timer / REST_LEN) * 100, 0, 100) + "%";
    }
  }
  if (Z.hud.threat) {
    var level = nearest < 190 ? "danger" : nearest < 430 ? "near" : "clear";
    Z.hud.threat.className = level;
    Z.hud.threatText.textContent = t("z_threat_" + level);
  }
  if (Z.hud.intermission) {
    var choosing = !!(Z.wave && Z.wave.state === "rest" && Z.intermission && !Z.intermission.chosen);
    Z.hud.intermission.classList.toggle("on", choosing);
    if (choosing) {
      Z.hud.intermissionTitle.textContent = t("z_intermission_title");
      Z.hud.intermission.querySelectorAll("[data-buy]").forEach(function (btn) {
        var kind = btn.getAttribute("data-buy"), offer = INTERMISSION_OFFERS[kind];
        btn.textContent = t(offer.key) + " · " + offer.cost + " — " + t("z_supply_" + kind);
        btn.disabled = (Z.credits || 0) < offer.cost;
      });
    }
  }
  if (Z.hud.bossBar) {
    if (Z.boss && Z.boss.zed && !Z.boss.zed.dead) {
      Z.hud.bossBar.classList.add("on");
      Z.hud.bossName.textContent = Z.boss.name || t("z_boss_titan");
      Z.hud.bossHpText.textContent = Math.max(0, Math.round(Z.boss.zed.hp)) + " / " + Math.round(Z.boss.maxHp);
      Z.hud.bossFill.style.width = clamp((Z.boss.zed.hp / Z.boss.maxHp) * 100, 0, 100) + "%";
    } else {
      Z.hud.bossBar.classList.remove("on");
    }
  }
  if (Z.hud.perkSpeed) Z.hud.perkSpeed.classList.toggle("on", !!(Z.perks && Z.perks.speed));
  if (Z.hud.perkJugg) Z.hud.perkJugg.classList.toggle("on", !!(Z.perks && Z.perks.jugg));
  if (Z.hud.perkDamage) Z.hud.perkDamage.classList.toggle("on", !!(Z.perks && Z.perks.damage));
  if (Z.hud.interact) {
    var prompt = P.dead ? "" : (Z.interactPrompt || "");
    Z.hud.interact.textContent = Z.touchMode ? prompt.replace(/^\[E\]\s*/i, "") : prompt;
    Z.hud.interact.classList.toggle("on", !!prompt);
    if (Z.hud.touchInteract) Z.hud.touchInteract.classList.toggle("available", !!prompt);
  }
  if (!hudNeedsUpdate) return;
  set_hudNeedsUpdate(false);
  Z.hud.wname.textContent = W[P.weapon].icon + " " + t(def.key);
  Z.hud.ammo.textContent = def.melee
    ? "∞"
    : P.reloading > 0 ? t("z_reloading") : P.ammo[P.weapon] + " / " + P.reserve[P.weapon];
  Z.hud.ammo.classList.toggle("low", !def.melee && P.ammo[P.weapon] <= def.mag * 0.25);
  if (Z.hud.frags) {
    Z.hud.frags.textContent = "💣 " + (P.frags || 0);
    Z.hud.frags.classList.toggle("low", !P.frags);
  }
  Z.hud.wave.textContent = t("z_wave_run", { n: Z.wave.n, max: RUN_WAVES });
  Z.hud.kills.textContent = "☠ " + Z.stats.kills;
  if (Z.hud.score) Z.hud.score.textContent = "★ " + (Z.score || 0) + " · " + t("z_credits", { n: Z.credits || 0 });
  var html = "";
  W_ORDER.forEach(function (k, i) {
    if (!P.owned[k]) return;
    html +=
      '<span class="' +
      (k === P.weapon ? "on" : "") +
      '">' +
      (i + 1) +
      " " +
      W[k].icon +
      "</span>";
  });
  Z.hud.wheel.innerHTML = html;
}

function say(msg, dur) {
  if (!Z.hud) return;
  Z.hud.msg.textContent = msg;
  Z.hud.msg.classList.add("on");
  Z.msgT = dur || 1.5;
}
function hitMarker(kind) {
  if (!Z.hud) return;
  Z.hud.hit.classList.remove("on", "head", "kill");
  void Z.hud.hit.offsetWidth;
  Z.hud.hit.classList.add("on");
  if (kind === true || kind === "head") Z.hud.hit.classList.add("head");
  if (kind === "kill") Z.hud.hit.classList.add("kill");
  Z.hitT = 0.18;
}
function flashScreen(color, alpha) {
  if (!Z.hud) return;
  Z.hud.flash.style.background = color;
  Z.hud.flash.style.opacity = alpha * gameSettings().flashes;
  Z.flashT = 0.12;
}
function showDamageDirection(src) {
  if (!Z.hud || !Z.hud.damage || !src || !Z.p) return;
  var bearing = Math.atan2(src.x - Z.p.x, src.z - Z.p.z),
    relative = bearing - Z.p.yaw;
  Z.hud.damage.style.transform = "translate(-50%, -50%) rotate(" + relative + "rad)";
  Z.hud.damage.classList.remove("on");
  void Z.hud.damage.offsetWidth;
  Z.hud.damage.classList.add("on");
  clearTimeout(Z.damageTO);
  Z.damageTO = setTimeout(function () {
    if (Z.hud && Z.hud.damage) Z.hud.damage.classList.remove("on");
  }, 720);
}

function tintMask(img, tint) {
  var c = document.createElement("canvas");
  c.width = c.height = 256; // quarter pixel area (50% scale) for low memory footprint
  var x = c.getContext("2d");
  x.drawImage(img, 0, 0, 256, 256);
  var g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, tint[0]);
  g.addColorStop(1, tint[1]);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return c;
}

function loadBloodImgs() {
  if (bloodImgs) return bloodImgs;
  set_bloodImgs([]);
  BLOOD_SRC.forEach(function (n) {
    var im = new Image();
    im.onload = function () {
      BLOOD_TINTS.forEach(function (tint) {
        try { bloodImgs.push(tintMask(im, tint)); } catch (e) {}
      });
    };
    im.src = "assets/textures/" + n;
  });
  return bloodImgs;
}

// The overlay canvas is sized in CSS pixels (not DPR-scaled): it is a smeared
// grime layer, so resolution buys nothing and a full-DPR canvas on a 4K screen
// would cost real time every wipe frame.
function bloodCtx() {
  var c = Z.hud && Z.hud.blood;
  if (!c || !c.getContext) return null;
  var w = c.clientWidth | 0,
    h = c.clientHeight | 0;
  if (!w || !h) return null;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c.getContext("2d");
}

function bloodSplat(intensity) {
  if (!gameSettings().blood) return;
  var ctx = bloodCtx();
  if (!ctx) return;
  var imgs = loadBloodImgs(),
    c = Z.hud.blood;
  // the tinted sprites arrive asynchronously; nothing to stamp until they do
  if (!imgs.length) return;
  var n = Math.round(2 + intensity * 3);
  for (var i = 0; i < n; i++) {
    var im = imgs[(Math.random() * imgs.length) | 0];
    // bias toward the edges: a splatter across the middle of the view is the
    // one thing that actually stops you playing
    var edge = Math.random() < 0.62;
    var x = edge ? (Math.random() < 0.5 ? rr(-0.05, 0.3) : rr(0.7, 1.05)) : rr(0.15, 0.85);
    var y = edge ? (Math.random() < 0.5 ? rr(-0.05, 0.35) : rr(0.65, 1.05)) : rr(0.1, 0.9);
    var s = rr(0.18, 0.5) * (0.7 + intensity * 0.5) * Math.min(c.width, c.height);
    ctx.save();
    ctx.translate(x * c.width, y * c.height);
    ctx.rotate(Math.random() * Math.PI * 2);
    ctx.globalAlpha = rr(0.45, 0.9);
    ctx.drawImage(im, -s / 2, -s / 2, s, s * rr(0.75, 1.3));
    ctx.restore();
  }
  Z.bloodDirty = true;
  c.classList.add("on");
}

/* V — drag a forearm across the visor. Real smear: the canvas is repeatedly
   drawn back onto itself, offset and slightly scaled, while a destination-out
   wedge eats it from one side. That streaks the existing pixels instead of
   cross-fading them, which is what makes it read as wiping rather than as the
   blood politely disappearing. */
function wipeVisor() {
  var ctx = bloodCtx();
  if (!ctx || Z.wiping) return;
  var c = Z.hud.blood;
  Z.wiping = true;
  var t0 = performance.now(),
    DUR = 620,
    dir = Math.random() < 0.5 ? 1 : -1;
  sndFootstep(false); // cloth-on-glass scuff; no dedicated sample
  (function step() {
    var k = Math.min(1, (performance.now() - t0) / DUR);
    // smear: redraw offset along the wipe direction, fading as it goes
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.55;
    ctx.drawImage(c, dir * 9, 2);
    ctx.globalAlpha = 1;
    // erase a soft-edged band that sweeps across, leaving thinning streaks
    var band = c.width * 0.55,
      lead = (dir > 0 ? -band + k * (c.width + band * 2) : c.width + band - k * (c.width + band * 2));
    var grd = ctx.createLinearGradient(lead - dir * band, 0, lead + dir * band, 0);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.5, "rgba(0,0,0,0.72)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "source-over";
    if (k < 1) requestAnimationFrame(step);
    else {
      // whatever survived the sweep goes with a final clean pass
      ctx.clearRect(0, 0, c.width, c.height);
      c.classList.remove("on");
      Z.wiping = false;
      Z.bloodDirty = false;
    }
  })();
}

// Safety bleed-off: a very slow erase so blood cannot accumulate to the point
// of blindness if the player never presses V. Called from the game tick.
function fadeVisor(dt) {
  if (!Z.bloodDirty || Z.wiping) return;
  Z.bloodFadeT = (Z.bloodFadeT || 0) + dt;
  if (Z.bloodFadeT < 0.25) return; // ~4Hz, not every frame
  Z.bloodFadeT = 0;
  var ctx = bloodCtx();
  if (!ctx) return;
  var c = Z.hud.blood;
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,0.012)";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "source-over";
}

/* ===========================================================================
   10. PLAYER
   =========================================================================== */
function newPlayer() {
  var b = interiorBounds(),
    rooms = liveRooms(),
    start = rooms.length
      ? rooms.sort(function (a, c) {
          return c.area - a.area;
        })[0]
      : null;
  var sx = start ? start.cx : b ? (b.minx + b.maxx) / 2 : 0,
    sz = start ? start.cz : b ? (b.minz + b.maxz) / 2 : 0;
  var f = freeSpot(sx, sz, P_RAD);
  return {
    x: f.x,
    z: f.z,
    y: 0,
    vy: 0,
    yaw: Math.PI,
    pitch: 0,
    hp: MAX_HP,
    armor: 0,
    stam: 100,
    crouch: false,
    sprint: false,
    aim: false,
    vx: 0,
    vz: 0,
    bob: 0,
    speedK: 0,
    dead: false,
    deadT: 0,
    airborne: false,
    hurtT: 0,
    regenT: 0,
    adrenalT: 0,
    dodgeT: 0,
    weapon: "knife",
    owned: (function () {
      var o = {};
      W_ORDER.forEach(function (k) { o[k] = gameSettings().sandbox || k === "knife" || k === "pistol"; });
      return o;
    })(),
    ammo: (function () {
      var a = {};
      W_ORDER.forEach(function (k) { if (!W[k].melee) a[k] = gameSettings().sandbox || k === "pistol" ? W[k].mag : 0; });
      return a;
    })(),
    reserve: (function () {
      var r = {};
      W_ORDER.forEach(function (k) { if (!W[k].melee) r[k] = gameSettings().sandbox || k === "pistol" ? W[k].reserve : 0; });
      return r;
    })(),
    nextShot: 0,
    reloading: 0,
    swing: 0,
    swingMax: 0,
    swingHit: false,
    bloom: 0,
    vmKick: 0,
    swayX: 0,
    swayY: 0,
    lookDX: 0,
    lookDY: 0,
    stepD: 0,
    firing: false,
    shoveT: 0,
    frags: 3,
    nextFrag: 0,
    flameFuel: 0,
    flameTick: 0,
    hitStop: 0,
    distract: 0,
    distractLook: 0,
  };
}

function hurtPlayer(dmg, src) {
  var P = Z.p;
  if (P.dead) return;
  // i-frames during dodge
  if (P.dodgeT > 0.12) return;
  var raw = dmg;
  // armor absorbs 60% until depleted
  var hadArmor = P.armor > 0;
  if (hadArmor) {
    var absorbed = Math.min(P.armor, raw * 0.6);
    P.armor -= absorbed;
    raw -= absorbed;
  }
  if (hadArmor && P.armor <= 0) {
    say(t("z_armor_broken"), 1.2);
    flashScreen("#5ec8ff", 0.18);
  }
  // adrenaline reduces damage slightly
  if (P.adrenalT > 0) raw *= 0.75;
  P.hp -= raw;
  Z.stats.dmgTaken = (Z.stats.dmgTaken || 0) + raw;
  P.hurtT = 0.55;
  P.regenT = 6.5;
  bloodSplat(clamp(raw / 22, 0.3, 1.7));
  showDamageDirection(src);
  shake(0.55 + Math.min(0.4, raw * 0.02));
  sndHurt();
  if (Z.flash) Z.flash.dip = 0.28 * gameSettings().flashes;
  // break combo on damage
  Z.combo = 0;
  Z.comboT = 0;
  if (Z.director) Z.director.lastHurt = Z.t;
  // knocked back a step
  if (src) {
    var dx = P.x - src.x,
      dz = P.z - src.z,
      d = Math.hypot(dx, dz) || 1;
    _movePoint2D.x = P.x + (dx / d) * 30;
    _movePoint2D.z = P.z + (dz / d) * 30;
    collideCircle(_movePoint2D, P_RAD, P.y, P_CLEAR, STEP);
    P.x = _movePoint2D.x;
    P.z = _movePoint2D.z;
  }
  if (P.hp <= 0) {
    P.hp = 0;
    P.dead = true;
    P.deadT = 0;
    Z.interactPrompt = "";
    Z.stats.best = Math.max(Z.stats.best, Z.wave.n);
    sndStinger();
    if (Z.hud) {
      Z.hud.deadH.textContent = t("z_dead");
      Z.hud.deadP.textContent = t("z_dead_stats", {
        w: Z.wave.n,
        k: Z.stats.kills,
        h: Z.stats.heads,
        s: Z.score || 0,
      });
      Z.hud.again.textContent = t("z_again");
      Z.hud.deadExit.textContent = t("z_exit");
      Z.hud.dead.classList.add("on");
      if (Z.hud.interact) {
        Z.hud.interact.textContent = "";
        Z.hud.interact.classList.remove("on");
      }
    }
    unlockPointer();
  }
  hudDirty();
}

function stepPlayer(dt) {
  var P = Z.p,
    K = Z.keys;
  if (P.dead) {
    P.deadT += dt;
    return;
  }
  if (P.hitStop > 0) {
    P.hitStop -= dt;
    return; // freeze player briefly on meaty hits
  }
  if (P.dodgeT > 0) P.dodgeT -= dt;
  if (P.adrenalT > 0) P.adrenalT -= dt;

  // stamina
  var stickX = Z.stick ? Z.stick.x : 0,
    stickY = Z.stick ? Z.stick.y : 0,
    stickMag = Math.hypot(stickX, stickY);
  var moving = K.fwd || K.back || K.left || K.right || stickMag > 0.12;
  P.sprint = (!!K.sprint || stickMag > 0.82) && P.stam > 2 && !P.crouch && moving;
  if (P.sprint) P.stam = Math.max(0, P.stam - dt * (P.adrenalT > 0 ? 14 : 24));
  else P.stam = Math.min(100, P.stam + dt * (P.crouch ? 26 : 16) * (P.adrenalT > 0 ? 1.4 : 1));

  var spd = P.crouch ? SPD_CROUCH : P.sprint ? SPD_SPRINT : SPD_WALK;
  if (Z.perks && Z.perks.speed) spd *= 1.25;
  // low-HP adrenaline surge + pickup boost
  if (P.hp < 30) spd *= 1.08;
  if (P.adrenalT > 0) spd *= 1.22;
  if (P.aim) spd *= 0.55;
  if (P.swing > 0) spd *= 0.78;
  if (P.dodgeT > 0) spd *= 1.85;
  var fx = Math.sin(P.yaw),
    fz = Math.cos(P.yaw),
    rx = -fz,
    rz = fx,
    mx = 0,
    mz = 0;
  if (K.fwd) { mx += fx; mz += fz; }
  if (K.back) { mx -= fx; mz -= fz; }
  if (K.right) { mx += rx; mz += rz; }
  if (K.left) { mx -= rx; mz -= rz; }
  if (stickMag > 0.04) {
    mx += fx * stickY + rx * stickX;
    mz += fz * stickY + rz * stickX;
  }
  var l = Math.hypot(mx, mz);
  if (l > 0.001) {
    mx /= l;
    mz /= l;
  }
  var k = dampingFactor(ACCEL, dt);
  P.vx += (mx * spd - P.vx) * k;
  P.vz += (mz * spd - P.vz) * k;
  _movePoint2D.x = P.x;
  _movePoint2D.z = P.z;
  if (isPhysicsEnabled()) {
    var next = moveKinematicCapsule(P.x, P.y, P.z, P.vx * dt, 0, P.vz * dt, P_RAD, P.crouch ? 100 : P_CLEAR);
    P.x = next.x;
    P.z = next.z;
  } else {
    moveCircle(_movePoint2D, P.vx * dt, P.vz * dt, P_RAD, P.y, P.crouch ? 100 : P_CLEAR, STEP);
    P.x = _movePoint2D.x;
    P.z = _movePoint2D.z;
  }
  // vertical: step up onto furniture, fall off it, thud only after a real drop
  var g = groundAt(P.x, P.z, P.y, STEP);
  var wasAir = P.airborne;
  var impactVy = P.vy;
  if (g > P.y) P.y = Math.min(g, P.y + 280 * dt);
  else {
    P.vy -= GRAV * dt;
    P.y += P.vy * dt;
    if (P.y <= g) {
      impactVy = P.vy;
      P.y = g;
      P.vy = 0;
    }
  }
  P.airborne = P.y > g + 2 || P.vy > 0;
  if (wasAir && !P.airborne && impactVy < -140) {
    sndFootstep(true);
    makeNoise(P.x, P.z, 260);
  }
  // head bob + footsteps
  var sp2 = Math.hypot(P.vx, P.vz);
  P.speedK = clamp(sp2 / SPD_WALK, 0, 2.4);
  P.bob += dt * sp2 * (P.sprint ? 0.052 : 0.042);
  P.stepD += sp2 * dt;
  var stride = P.sprint ? 145 : P.crouch ? 210 : 170;
  if (P.stepD > stride) {
    P.stepD = 0;
    sndFootstep(P.sprint);
    if (P.sprint) makeNoise(P.x, P.z, 400);
  }
  // recovery
  if (P.regenT > 0) P.regenT -= dt;
  else if (P.hp < MAX_HP) P.hp = Math.min(MAX_HP, P.hp + dt * 2.6);
  if (P.hurtT > 0) P.hurtT -= dt;
  P.bloom = Math.max(0, P.bloom - dt * (P.aim ? 0.14 : 0.1));
  if (P.reloading > 0) {
    P.reloading -= dt * (P.adrenalT > 0 ? 1.25 : 1);
    if (P.reloading <= 0) finishReload();
  }
  // auto weapons keep firing while held; the flamer is a continuous stream
  if (P.firing && W[P.weapon].flame) flame(dt);
  else if (P.firing && W[P.weapon].auto) fire();

  // doors creak open as you approach (and stay open), unless blocked by barricade
  if (Z.col)
    Z.col.doorSegs.forEach(function (ds) {
      if (!ds.pivot || ds.pivot.userData.open) return;
      var mx2 = (ds.ax + ds.bx) / 2,
        mz2 = (ds.az + ds.bz) / 2;
      if (Z.barricades && Z.barricades.some(function (b) { return Math.hypot(b.mx - mx2, b.mz - mz2) < 40; })) return;
      if (Math.hypot(P.x - mx2, P.z - mz2) < 95) {
        ds.pivot.userData.open = true;
        Z.doorsOpened.push(ds.pivot);
        sndDoor(mx2, mz2);
      }
    });

  updateInteractPrompt();

  // --- distraction: looking at pretty / siren undead softens aim and focus
  stepDistract(dt, P);
  fadeVisor(dt); // slow bleed-off of visor blood (V wipes it properly)

  // heartbeat when hurt, close, distracted, or adrenal
  var near = 1e9;
  for (var i = 0; i < Z.zeds.length; i++)
    if (!Z.zeds[i].dead) near = Math.min(near, Z.zeds[i].dist);
  var panic = P.hp < 40 || near < 220 || P.adrenalT > 0 || P.distract > 0.45;
  Z.hbT = (Z.hbT || 0) - dt;
  if (panic && Z.hbT <= 0) {
    Z.hbT = P.distract > 0.6 ? 0.48 : P.hp < 25 ? 0.55 : P.adrenalT > 0 ? 0.5 : 0.82;
    sndHeartbeat();
  }
}

function stepDistract(dt, P) {
  var fx = Math.sin(P.yaw) * Math.cos(P.pitch),
    fy = Math.sin(P.pitch),
    fz = Math.cos(P.yaw) * Math.cos(P.pitch);
  var gain = 0,
    bestLook = null,
    bestDot = 0.55;
  for (var i = 0; i < Z.zeds.length; i++) {
    var zd = Z.zeds[i];
    if (zd.dead) continue;
    var dx = zd.x - P.x,
      dy = (zd.y + (zd.female ? 120 : 110)) - (P.y + EYE),
      dz = zd.z - P.z,
      d = Math.hypot(dx, dy, dz) || 1;
    if (d > 900) continue;
    var dot = (dx * fx + dy * fy + dz * fz) / d;
    if (dot < 0.55) continue;
    // body center bias: looking at torso (not headshots) is more distracting
    var torsoDot = dot;
    if (P.pitch < -0.05 && P.pitch > -0.55) torsoDot += 0.12;
    var power = (zd.distract || 0.2) * (0.4 + torsoDot) * (1 - d / 1000);
    if (zd.state === "tease") power *= 2.1;
    if (zd.grabbing) power *= 1.8;
    if (zd.siren) power *= 1.35;
    if (!losClear(P.x, P.z, zd.x, zd.z) && d > 200) power *= 0.25;
    gain += power;
    if (torsoDot > bestDot) {
      bestDot = torsoDot;
      bestLook = zd;
    }
  }
  // accumulate / decay
  if (gain > 0.08) {
    P.distract = Math.min(1, P.distract + gain * dt * 0.85);
    P.distractLook = bestLook;
  } else {
    P.distract = Math.max(0, P.distract - dt * (P.sprint ? 0.55 : 0.28));
    if (P.distract < 0.05) P.distractLook = null;
  }
  Z.distract = P.distract;
  // combat penalties
  if (P.distract > 0.15) {
    P.bloom = Math.min(0.09, P.bloom + P.distract * dt * 0.06);
    // slight mouse drift toward the body they're ogling
    if (bestLook && P.distract > 0.35) {
      var wantPitch = Math.atan2(
        bestLook.y + 105 - (P.y + EYE),
        Math.hypot(bestLook.x - P.x, bestLook.z - P.z)
      );
      P.pitch += (wantPitch - P.pitch) * dt * P.distract * 0.55;
    }
  }
  // whisper cue at peaks
  if (P.distract > 0.72 && rnd() < dt * 0.4) {
    say(t("z_distract_heavy"), 0.9);
    flashScreen("#ff6699", 0.06);
  }
}

export {
  audioClose, buildHud, flashScreen, hitMarker, hudDirty, hudSync, hurtPlayer,
  loadBloodImgs, newPlayer, say, stepGrain, stepPlayer, wipeVisor,
};
