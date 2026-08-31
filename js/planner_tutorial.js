// Planner wall guide: a reference (topology, openings, constraints) plus a
// non-modal practice coach that uses the real plan, tools and inspector.
import { t, getLang, onLangChange } from "./i18n.js";
import { openModal } from "./ui.js";
import { S } from "./state.js";
import { wallClearLength, nodeDegree } from "./geometry.js";
import { onAfterRender } from "./plan2d.js";
import { entryOpen } from "./cad_hud.js";
import { stopSpeaking, bindSpeakButton } from "./speech.js";
import { openVideoStudio } from "./video_studio.js";
import { getTopicVideoFrames } from "./video_presets.js";

var activeGuide = null;
var adaptiveSpotlight = null;
var tour = {
  active: false,
  track: null,
  step: 0,
  completed: {},
  baseline: null,
  typed: false,
  position: null,
  drag: null,
  moved: false,
  target: null,
};

const TOPICS = [
  {
    id: "basic", icon: "ph-wall", title: "planner_guide_basic",
    body: "planner_guide_basic_body",
    steps: ["planner_basic_1", "planner_basic_2", "planner_basic_3", "planner_basic_4"],
    tip: "planner_basic_tip", mistake: "planner_basic_dont", track: "basic",
  },
  {
    id: "wall_types", icon: "ph-stack", title: "planner_guide_wall_types",
    body: "planner_guide_wall_types_body",
    steps: ["planner_wall_types_1", "planner_wall_types_2", "planner_wall_types_3", "planner_wall_types_4"],
    tip: "planner_wall_types_tip", mistake: "planner_wall_types_dont", track: "edit",
  },
  {
    id: "precision", icon: "ph-ruler", title: "planner_guide_precision",
    body: "planner_guide_precision_body",
    steps: ["planner_prec_1", "planner_prec_2", "planner_prec_3", "planner_prec_4"],
    tip: "planner_prec_tip", mistake: "planner_prec_dont", track: "precision",
  },
  {
    id: "angle", icon: "ph-angle", title: "planner_guide_angles",
    body: "planner_guide_angles_body",
    steps: ["planner_angle_1", "planner_angle_2", "planner_angle_3", "planner_angle_4"],
    tip: "planner_angle_tip", mistake: "planner_angle_dont", track: "angle",
  },
  {
    id: "opening", icon: "ph-door-open", title: "planner_guide_openings",
    body: "planner_guide_openings_body",
    steps: ["planner_open_1", "planner_open_2", "planner_open_3", "planner_open_4"],
    tip: "planner_open_tip", mistake: "planner_open_dont", track: "opening",
  },
  {
    id: "profiles", icon: "ph-frame-corners", title: "planner_guide_profiles",
    body: "planner_guide_profiles_body",
    steps: ["planner_profiles_1", "planner_profiles_2", "planner_profiles_3", "planner_profiles_4"],
    tip: "planner_profiles_tip", mistake: "planner_profiles_dont", track: "edit",
  },
  {
    id: "sym", icon: "ph-arrows-left-right", title: "planner_guide_symmetry",
    body: "planner_guide_symmetry_body",
    steps: ["planner_sym_1", "planner_sym_2", "planner_sym_3", "planner_sym_4"],
    tip: "planner_sym_tip", mistake: "planner_sym_dont", track: "edit",
  },
  {
    id: "asym", icon: "ph-path", title: "planner_guide_asymmetry",
    body: "planner_guide_asymmetry_body",
    steps: ["planner_asym_1", "planner_asym_2", "planner_asym_3", "planner_asym_4"],
    tip: "planner_asym_tip", mistake: "planner_asym_dont", track: "edit",
  },
  {
    id: "quick_videos", icon: "ph-film-strip", title: "planner_guide_quick_videos",
    body: "planner_guide_quick_videos_body",
    steps: ["planner_video_1", "planner_video_2", "planner_video_3", "planner_video_4"],
    tip: "planner_video_tip", mistake: "planner_video_dont", track: "video",
  },
];

const TOUR_TRACKS = [
  { id: "basic", icon: "ph-wall", title: "planner_tour_basic_track", desc: "planner_tour_basic_track_desc" },
  { id: "precision", icon: "ph-ruler", title: "planner_tour_prec_track", desc: "planner_tour_prec_track_desc" },
  { id: "angle", icon: "ph-angle", title: "planner_tour_angle_track", desc: "planner_tour_angle_track_desc" },
  { id: "opening", icon: "ph-door-open", title: "planner_tour_open_track", desc: "planner_tour_open_track_desc" },
  { id: "edit", icon: "ph-sliders-horizontal", title: "planner_tour_edit_track", desc: "planner_tour_edit_track_desc" },
  { id: "video", icon: "ph-film-strip", title: "planner_tour_video_track", desc: "planner_tour_video_track_desc" },
];

/* ---- practice progress ------------------------------------------------- */
/* Which practice tracks this browser has finished. Kept out of the plan file:
   it is about the person, not the project. */
const PROGRESS_KEY = "bp_planner_practice_done";

function loadProgress() {
  try {
    var raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "[]");
    if (!Array.isArray(raw)) return {};
    var out = {};
    raw.forEach(function (id) { if (typeof id === "string") out[id] = true; });
    return out;
  } catch (_) { return {}; }
}

function saveProgress(done) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(Object.keys(done))); } catch (_) {}
}

function markTrackDone(track) {
  if (!track) return;
  var done = loadProgress();
  if (done[track]) return;
  done[track] = true;
  saveProgress(done);
}

function resetProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch (_) {}
}

function progressCount() {
  var done = loadProgress(), n = 0;
  TOUR_TRACKS.forEach(function (item) { if (done[item.id]) n++; });
  return { done: n, total: TOUR_TRACKS.length };
}

export function plannerTutorialProgress() {
  var done = loadProgress();
  return {
    completedTracks: Object.keys(done).sort(),
    totalTracks: TOUR_TRACKS.length,
    active: !!tour.active,
    activeTrack: tour.track || null,
    activeStep: tour.active ? tour.step : null,
    nextTrack: nextTrack(),
  };
}

export function spotlightPlannerTarget(selector, duration = 5000) {
  if (tour.active || typeof document === "undefined") return false;
  if (adaptiveSpotlight) {
    clearTimeout(adaptiveSpotlight.timer);
    adaptiveSpotlight.target.classList.remove("planner-tour-target");
  }
  var target = document.querySelector(selector);
  if (!target) { adaptiveSpotlight = null; return false; }
  target.classList.add("planner-tour-target");
  adaptiveSpotlight = {
    target: target,
    timer: setTimeout(function () {
      target.classList.remove("planner-tour-target");
      adaptiveSpotlight = null;
    }, Math.max(1000, Number(duration) || 5000)),
  };
  return true;
}

/* The first track the user has not finished — highlighted as "start here". */
function nextTrack() {
  var done = loadProgress();
  for (var i = 0; i < TOUR_TRACKS.length; i++) if (!done[TOUR_TRACKS[i].id]) return TOUR_TRACKS[i].id;
  return null;
}

function reducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; }
}

/* Closing the guide hands focus back to the top-bar cap button rather than
   dropping it on <body>, so keyboard users keep their place. */
function restoreLaunchFocus() {
  var btn = document.getElementById("plannerTutorialBtn");
  if (btn && btn.isConnected && typeof btn.focus === "function") {
    try { btn.focus({ preventScroll: true }); } catch (_) { btn.focus(); }
  }
}

function diagram(kind) {
  var svg = {
    basic:
      '<g data-mark="1">' +
        '<path class="guide-face" d="M34 94V38H146"/>' +
        '<path class="guide-cl" d="M34 94V38H146"/>' +
      "</g>" +
      '<g data-mark="2">' +
        '<circle class="guide-node" cx="34" cy="94" r="5"/>' +
        '<circle class="guide-node" cx="34" cy="38" r="5"/>' +
        '<circle class="guide-node" cx="146" cy="38" r="5"/>' +
        '<text x="16" y="98">A</text><text x="16" y="42">B</text>' +
      "</g>" +
      '<g data-mark="4">' +
        '<path class="guide-dash" d="M34 38V16M146 38V16"/>' +
        '<path class="guide-accent" d="M34 16H50M130 16H146"/>' +
      '</g>' +
      '<g data-mark="3">' +
        '<rect class="guide-chip" x="52" y="6" width="76" height="20" rx="5"/>' +
        '<text class="guide-hud" x="90" y="20" text-anchor="middle">360 · 0°</text>' +
      '</g>',
    wall_types:
      '<g data-mark="1">' +
        '<path class="guide-face" d="M24 60H156"/>' +
        '<rect class="guide-chip" x="52" y="8" width="76" height="18" rx="4"/>' +
        '<text class="guide-hud" x="90" y="21" text-anchor="middle">ASSEMBLY</text>' +
      '</g>' +
      '<g data-mark="2">' +
        '<path class="guide-dash" d="M24 44H156M24 76H156"/>' +
        '<path class="guide-measure" d="M24 36H156M24 84H156"/>' +
        '<rect class="guide-chip" x="18" y="92" width="46" height="18" rx="4"/>' +
        '<text x="41" y="105" text-anchor="middle">FINISH</text>' +
        '<rect class="guide-chip" x="68" y="92" width="44" height="18" rx="4"/>' +
        '<text x="90" y="105" text-anchor="middle">CORE</text>' +
        '<rect class="guide-chip" x="116" y="92" width="46" height="18" rx="4"/>' +
        '<text x="139" y="105" text-anchor="middle">INSUL</text>' +
      '</g>' +
      '<g data-mark="3">' +
        '<path class="guide-cl" d="M24 60H156"/>' +
        '<circle class="guide-node on" cx="24" cy="60" r="5"/>' +
        '<circle class="guide-node on" cx="156" cy="60" r="5"/>' +
        '<rect class="guide-chip" x="56" y="32" width="68" height="18" rx="4"/>' +
        '<text class="guide-hud" x="90" y="45" text-anchor="middle">DATUM LINE</text>' +
      '</g>' +
      '<g data-mark="4">' +
        '<path class="guide-accent" d="M70 60L80 50M80 50L90 60M110 60L100 70M100 70L90 60"/>' +
        '<rect class="guide-chip" x="66" y="52" width="48" height="18" rx="4"/>' +
        '<text class="guide-hud" x="90" y="65" text-anchor="middle">FLIP ⇄</text>' +
      '</g>',
    precision:
      '<g data-mark="1">' +
        '<path class="guide-face" d="M24 78H156"/>' +
        '<path class="guide-cl" d="M24 78H156"/>' +
        '<path class="guide-measure" d="M90 78V36M24 44H156"/>' +
      "</g>" +
      '<g data-mark="2">' +
        '<rect class="guide-chip" x="42" y="8" width="96" height="22" rx="6"/>' +
        '<text x="90" y="23" text-anchor="middle">360  Tab  0°</text>' +
      "</g>" +
      '<g data-mark="3">' +
        '<circle class="guide-node on" cx="24" cy="78" r="5"/>' +
        '<text x="10" y="82">A</text>' +
      '</g>' +
      '<g data-mark="4">' +
        '<rect class="guide-chip" x="66" y="94" width="48" height="18" rx="4"/>' +
        '<text class="guide-hud" x="90" y="107" text-anchor="middle">FACE</text>' +
      '</g>',
    angle:
      '<g data-mark="1">' +
        '<path class="guide-dash" d="M28 96H152M28 96V20"/>' +
      '</g>' +
      '<g data-mark="2">' +
        '<path class="guide-face" d="M28 96L80 34L152 80"/>' +
        '<path class="guide-cl" d="M28 96L80 34L152 80"/>' +
        '<circle class="guide-node" cx="80" cy="34" r="5"/>' +
      "</g>" +
      '<g data-mark="3">' +
        '<path class="guide-arc" d="M50 82A32 32 0 0 1 66 56"/>' +
        '<rect class="guide-chip" x="52" y="66" width="30" height="18" rx="4"/>' +
        '<text x="67" y="79" text-anchor="middle">37°</text>' +
      '</g>' +
      '<g data-mark="4">' +
        '<rect class="guide-chip" x="56" y="8" width="48" height="18" rx="4"/>' +
        '<text class="guide-hud" x="80" y="21" text-anchor="middle">MITRE</text>' +
      '</g>',
    opening:
      '<g data-mark="1">' +
        '<path class="guide-face" d="M16 42H58M122 42H164"/>' +
        '<path class="guide-cl" d="M16 42H58M122 42H164"/>' +
        '<rect class="guide-chip" x="66" y="14" width="48" height="18" rx="4"/>' +
        '<text class="guide-hud" x="90" y="27" text-anchor="middle">SILL: 90</text>' +
      '</g>' +
      '<g data-mark="2">' +
        '<path class="guide-jamb" d="M58 26V58M122 26V58"/>' +
        '<path class="guide-dash" d="M90 26V58"/>' +
        '<rect class="guide-chip" x="68" y="70" width="44" height="18" rx="4"/>' +
        '<text class="guide-hud" x="90" y="83" text-anchor="middle">MULLION</text>' +
      '</g>' +
      '<g data-mark="3">' +
        '<path class="guide-accent" d="M58 42V98"/>' +
        '<path class="guide-arc" d="M58 98A36 36 0 0 0 94 62"/>' +
      '</g>' +
      '<g data-mark="4">' +
        '<path class="guide-bad" d="M90 42V98"/>' +
        '<rect class="guide-chip" x="81" y="88" width="18" height="18" rx="4"/>' +
        '<text class="guide-bad" x="90" y="101" text-anchor="middle">✕</text>' +
      '</g>',
    profiles:
      '<g data-mark="1">' +
        '<rect class="guide-chip" x="24" y="24" width="132" height="72" rx="4"/>' +
        '<path class="guide-face" d="M36 36H144V84H36Z"/>' +
        '<text class="guide-hud" x="90" y="18" text-anchor="middle">JAMB / HEAD</text>' +
      '</g>' +
      '<g data-mark="2">' +
        '<path class="guide-cl" d="M90 36V84M36 60H144"/>' +
        '<rect class="guide-chip" x="66" y="50" width="48" height="20" rx="4"/>' +
        '<text class="guide-hud" x="90" y="64" text-anchor="middle">MULL V/H</text>' +
      '</g>' +
      '<g data-mark="3">' +
        '<path class="guide-dash" d="M48 24V96M76 24V96M104 24V96M132 24V96"/>' +
        '<text class="guide-hud" x="90" y="108" text-anchor="middle">STUDS (60cm)</text>' +
      '</g>' +
      '<g data-mark="4">' +
        '<circle class="guide-node on" cx="36" cy="36" r="4"/>' +
        '<circle class="guide-node on" cx="144" cy="36" r="4"/>' +
        '<circle class="guide-node on" cx="144" cy="84" r="4"/>' +
        '<circle class="guide-node on" cx="36" cy="84" r="4"/>' +
      '</g>',
    sym:
      '<g data-mark="1">' +
        '<path class="guide-dash" d="M90 8V112"/>' +
      '</g>' +
      '<g data-mark="2">' +
        '<path class="guide-face" d="M22 96H68V34M158 96H112V34"/>' +
        '<path class="guide-cl" d="M22 96H68V34M158 96H112V34"/>' +
      '</g>' +
      '<g data-mark="3">' +
        '<path class="guide-accent" d="M38 72H72M108 72H142"/>' +
        '<rect class="guide-chip" x="72" y="62" width="36" height="20" rx="4"/>' +
        '<text x="90" y="76" text-anchor="middle">= L</text>' +
      '</g>' +
      '<g data-mark="4">' +
        '<circle class="guide-node" cx="68" cy="34" r="5"/>' +
        '<circle class="guide-node" cx="112" cy="34" r="5"/>' +
      '</g>',
    asym:
      '<g data-mark="1">' +
        '<circle class="guide-node on" cx="24" cy="96" r="5"/>' +
        '<rect class="guide-chip" x="4" y="102" width="40" height="16" rx="4"/>' +
        '<text class="guide-hud" x="24" y="114" text-anchor="middle">PIN</text>' +
      '</g>' +
      '<g data-mark="2">' +
        '<path class="guide-face" d="M24 96L58 34L104 64L156 22"/>' +
        '<path class="guide-cl" d="M24 96L58 34L104 64L156 22"/>' +
      '</g>' +
      '<g data-mark="3">' +
        '<rect class="guide-chip" x="48" y="76" width="28" height="18" rx="4"/>' +
        '<text x="62" y="89" text-anchor="middle">L₁</text>' +
        '<rect class="guide-chip" x="106" y="76" width="28" height="18" rx="4"/>' +
        '<text x="120" y="89" text-anchor="middle">∠₂</text>' +
      '</g>' +
      '<g data-mark="4">' +
        '<circle class="guide-node" cx="58" cy="34" r="5"/>' +
        '<circle class="guide-node" cx="104" cy="64" r="5"/>' +
      '</g>',
    quick_videos:
      '<g data-mark="1">' +
        '<ellipse cx="90" cy="60" rx="64" ry="28" class="guide-dash"/>' +
        '<circle class="guide-node" cx="26" cy="60" r="4"/>' +
        '<circle class="guide-node" cx="90" cy="32" r="4"/>' +
        '<circle class="guide-node" cx="154" cy="60" r="4"/>' +
        '<circle class="guide-node on" cx="90" cy="88" r="5"/>' +
        '<rect class="guide-chip" x="52" y="6" width="76" height="18" rx="4"/>' +
        '<text class="guide-hud" x="90" y="19" text-anchor="middle">360° ORBIT</text>' +
      '</g>' +
      '<g data-mark="2">' +
        '<rect class="guide-chip" x="18" y="44" width="30" height="22" rx="3"/>' +
        '<rect class="guide-chip" x="54" y="44" width="30" height="22" rx="3"/>' +
        '<rect class="guide-chip" x="90" y="44" width="30" height="22" rx="3"/>' +
        '<rect class="guide-chip" x="126" y="44" width="30" height="22" rx="3"/>' +
        '<text x="33" y="58" text-anchor="middle">#1</text>' +
        '<text x="69" y="58" text-anchor="middle">#2</text>' +
        '<text x="105" y="58" text-anchor="middle">#3</text>' +
        '<text x="141" y="58" text-anchor="middle">#4</text>' +
      '</g>' +
      '<g data-mark="3">' +
        '<path class="guide-accent" d="M34 82C48 74 60 86 74 80C88 74 100 86 114 80C128 74 140 86 154 80"/>' +
        '<rect class="guide-chip" x="46" y="94" width="88" height="18" rx="4"/>' +
        '<text class="guide-hud" x="90" y="107" text-anchor="middle">CROSSFADE / FPS</text>' +
      '</g>' +
      '<g data-mark="4">' +
        '<path class="guide-accent" d="M84 56L98 65L84 74Z"/>' +
        '<rect class="guide-chip" x="114" y="10" width="58" height="18" rx="4"/>' +
        '<text class="guide-hud" x="143" y="23" text-anchor="middle">WEBM/MP4</text>' +
      '</g>',
  };
  return '<svg viewBox="0 0 180 120" role="img" aria-hidden="true">' + (svg[kind] || "") + "</svg>";
}

function kbdify(text) {
  return String(text || "").replace(
    /\b(Ctrl\/Cmd|Shift|Enter|Esc|Tab|OSNAP|ORTHO|F3|F8|F9|Del)\b/g,
    "<kbd>$1</kbd>",
  );
}

function closeGuide() {
  stopSpeaking();
  if (!activeGuide) return;
  var m = activeGuide;
  activeGuide = null;
  try { m.close(); } catch (_) {}
}

/* Esc and the overlay close the modal behind our back, so let openModal tell us
   when the dialog is really gone instead of guessing from click targets. */
function trackGuide(m) {
  activeGuide = m;
  m.onClose(function () { if (activeGuide === m) activeGuide = null; });
  m.onClose(function () { stopSpeaking(); });
}

export function showPlannerHub() {
  closeGuide();
  stopTour();
  var m = openModal(t("planner_guide_title"));
  trackGuide(m);
  m.overlay.querySelector(".bp-modal").classList.add("planner-guide-modal");
  var intro = document.createElement("p");
  intro.className = "planner-guide-intro";
  intro.textContent = t("planner_guide_intro");
  var cards = document.createElement("div");
  cards.className = "planner-guide-hub";
  cards.innerHTML =
    '<button type="button" data-hub="ref">' +
      '<i class="ph ph-book-open"></i><span><b></b><small></small></span>' +
      '<i class="ph ph-arrow-right"></i>' +
    "</button>" +
    '<button type="button" data-hub="practice">' +
      '<i class="ph ph-hand-tap"></i><span><b></b><small></small></span>' +
      '<i class="ph ph-arrow-right"></i>' +
    "</button>" +
    '<button type="button" data-hub="video">' +
      '<i class="ph ph-film-strip"></i><span><b></b><small></small></span>' +
      '<i class="ph ph-arrow-right"></i>' +
    "</button>";
  var refBtn = cards.querySelector('[data-hub="ref"]');
  refBtn.querySelector("b").textContent = t("planner_hub_ref");
  refBtn.querySelector("small").textContent = t("planner_hub_ref_desc");
  var prBtn = cards.querySelector('[data-hub="practice"]');
  prBtn.querySelector("b").textContent = t("planner_hub_practice");
  prBtn.querySelector("small").textContent = t("planner_hub_practice_desc");
  var vidBtn = cards.querySelector('[data-hub="video"]');
  if (vidBtn) {
    vidBtn.querySelector("b").textContent = t("planner_hub_video");
    vidBtn.querySelector("small").textContent = t("planner_hub_video_desc");
    vidBtn.addEventListener("click", function () {
      closeGuide();
      openVideoStudio();
    });
  }
  var count = progressCount();
  if (count.done) {
    var badge = document.createElement("em");
    badge.className = "planner-guide-badge" + (count.done >= count.total ? " is-all" : "");
    badge.innerHTML = '<i class="ph ph-check-circle"></i>';
    badge.appendChild(document.createTextNode(count.done + "/" + count.total));
    prBtn.querySelector("b").appendChild(badge);
  }
  refBtn.addEventListener("click", function () { showPlannerTutorial(); });
  prBtn.addEventListener("click", function () { showPlannerTourHub(); });
  m.body.appendChild(intro);
  m.body.appendChild(cards);
  var order = document.createElement("div");
  order.className = "planner-guide-order";
  order.innerHTML = '<i class="ph ph-check-circle"></i><span></span>';
  order.querySelector("span").textContent = t("planner_guide_order");
  m.body.appendChild(order);
  var speakBtn = document.createElement("button");
  speakBtn.type = "button";
  speakBtn.className = "planner-guide-speak-btn";
  speakBtn.innerHTML = '<i class="ph ph-speaker-high"></i><span></span>';
  speakBtn.querySelector("span").textContent = t("planner_guide_speak");
  bindSpeakButton(
    speakBtn,
    function () {
      return [
        t("planner_guide_title"),
        t("planner_guide_intro"),
        t("planner_hub_ref") + ": " + t("planner_hub_ref_desc"),
        t("planner_hub_practice") + ": " + t("planner_hub_practice_desc"),
        t("planner_guide_order"),
      ];
    },
    getLang,
    { showLabel: true, labelPlay: t("planner_guide_speak"), labelStop: t("planner_tour_speak_stop") }
  );
  var close = document.createElement("button");
  close.className = "btn-accent";
  close.textContent = t("keys_close");
  close.addEventListener("click", function () { closeGuide(); restoreLaunchFocus(); });
  m.actions.appendChild(speakBtn);
  m.actions.appendChild(close);
  refBtn.focus();
}

export function showPlannerTutorial(startTopic) {
  closeGuide();
  var m = openModal(t("planner_guide_title"));
  trackGuide(m);
  m.overlay.querySelector(".bp-modal").classList.add("planner-guide-modal");

  var intro = document.createElement("p");
  intro.className = "planner-guide-intro";
  intro.textContent = t("planner_guide_intro");
  var tabs = document.createElement("div");
  tabs.className = "planner-guide-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", t("planner_guide_title"));
  var panel = document.createElement("section");
  panel.className = "planner-guide-panel";
  panel.id = "plannerGuidePanel";
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("tabindex", "0");
  m.body.appendChild(intro);
  m.body.appendChild(tabs);
  m.body.appendChild(panel);

  var playTimer = 0;
  var currentTopic = null;
  var activePlayer = null;
  function highlight(visual, index) {
    visual.classList.toggle("is-all", index == null);
    visual.querySelectorAll("[data-mark]").forEach(function (g) {
      g.classList.toggle("on", index == null || g.getAttribute("data-mark") === String(index + 1));
    });
    if (index != null && activePlayer && activePlayer.seekToStep) {
      activePlayer.seekToStep(index);
    }
  }

  function setupTopicVisual(topic, visual, onStepChange) {
    visual.innerHTML = "";
    var frames = getTopicVideoFrames(topic.id);
    var currentMode = "video";
    var currentFrameIdx = 0;
    var isPlaying = true;
    var speedMultiplier = 1.0;
    var timer = null;

    var modeBar = document.createElement("div");
    modeBar.className = "planner-guide-mode-bar";
    modeBar.innerHTML =
      '<div class="planner-guide-mode-switch">' +
        '<button type="button" data-mode="video" class="active"><i class="ph ph-play-circle"></i> <span>' + t("planner_guide_view_video") + '</span></button>' +
        '<button type="button" data-mode="diagram"><i class="ph ph-ruler"></i> <span>' + t("planner_guide_view_diagram") + '</span></button>' +
      '</div>' +
      '<button type="button" class="planner-guide-open-studio-btn" title="' + t("planner_guide_open_studio") + '">' +
        '<i class="ph ph-arrow-square-out"></i>' +
      '</button>';

    var videoWrap = document.createElement("div");
    videoWrap.className = "planner-guide-video-wrap";

    // Pixel-perfect ModelForge DOM Simulator Viewport
    var simViewport = document.createElement("div");
    simViewport.className = "planner-sim-viewport planner-guide-video-canvas";
    simViewport.innerHTML =
      '<div class="planner-sim-topbar">' +
        '<div class="brand"><i class="ph ph-cube-focus"></i> <span>ModelForge</span></div>' +
        '<div class="planner-sim-viewmode">' +
          '<button type="button" class="sim-btn-2d active"><i class="ph ph-blueprint"></i> <span>' + (t("view_plan") || "תוכנית") + '</span></button>' +
          '<button type="button" class="sim-btn-3d"><i class="ph ph-cube"></i> <span>' + (t("view_3d") || "תלת-ממד") + '</span></button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;color:var(--text-muted);font-size:12px;">' +
          '<i class="ph ph-sliders"></i>' +
          '<i class="ph ph-gear"></i>' +
        '</div>' +
      '</div>' +
      '<div class="planner-sim-workspace">' +
        '<div class="planner-sim-canvas">' +
          '<svg class="sim-svg-stage" viewBox="0 0 340 200" xmlns="http://www.w3.org/2000/svg"></svg>' +
          '<div class="planner-sim-toolbar">' +
            '<button type="button" class="tool active" data-sim-tool="select"><i class="ph ph-cursor"></i><kbd>1</kbd></button>' +
            '<button type="button" class="tool" data-sim-tool="wall"><i class="ph ph-wall"></i><kbd>2</kbd></button>' +
            '<button type="button" class="tool" data-sim-tool="rect"><i class="ph ph-rectangle"></i><kbd>8</kbd></button>' +
            '<button type="button" class="tool" data-sim-tool="door"><i class="ph ph-door"></i><kbd>3</kbd></button>' +
            '<button type="button" class="tool" data-sim-tool="window"><i class="ph ph-frame-corners"></i><kbd>4</kbd></button>' +
          '</div>' +
          '<div class="planner-sim-cad-entry" style="display:none;">' +
            '<i class="ph ph-brackets-square"></i>' +
            '<span class="sim-cad-text">L: 360.0 cm  Tab  ∠: 0.0°</span>' +
          '</div>' +
          '<div class="planner-sim-cursor" style="top:50%;left:50%;">' +
            '<div class="planner-sim-pulse" style="display:none;"></div>' +
            '<svg class="planner-sim-cursor-icon" viewBox="0 0 24 24"><path fill="#ffffff" stroke="#0f172a" stroke-width="1.5" d="M3 2l6 17 3-6 6 3-2-5 5-2z"/></svg>' +
            '<div class="planner-sim-tooltip" style="display:none;"></div>' +
          '</div>' +
        '</div>' +
        '<div class="planner-sim-inspector">' +
          '<div class="planner-sim-insp-head">' +
            '<span class="sim-insp-title">' + (t("inspector") || "מאפיינים") + '</span>' +
            '<i class="ph ph-sliders"></i>' +
          '</div>' +
          '<div class="planner-sim-insp-tabs">' +
            '<span class="active">' + (t("wtab_dims") || "מידות") + '</span>' +
            '<span>' + (t("wtab_assembly") || "מבנה") + '</span>' +
          '</div>' +
          '<div class="planner-sim-insp-row sim-row-len">' +
            '<span>' + (t("len") || "אורך") + ' (cm):</span>' +
            '<input type="text" class="sim-inp-len" value="360.0" readonly />' +
          '</div>' +
          '<div class="planner-sim-insp-row sim-row-ang">' +
            '<span>' + (t("ang") || "זווית") + ' (°):</span>' +
            '<input type="text" class="sim-inp-ang" value="0.0°" readonly />' +
          '</div>' +
          '<div class="planner-sim-insp-row sim-row-th">' +
            '<span>' + (t("th") || "עובי") + ' (cm):</span>' +
            '<input type="text" class="sim-inp-th" value="20.0" readonly />' +
          '</div>' +
        '</div>' +
      '</div>';

    var btn2D = simViewport.querySelector(".sim-btn-2d");
    var btn3D = simViewport.querySelector(".sim-btn-3d");
    var simSvg = simViewport.querySelector(".sim-svg-stage");
    var simTools = simViewport.querySelectorAll("[data-sim-tool]");
    var simCadEntry = simViewport.querySelector(".planner-sim-cad-entry");
    var simCadText = simViewport.querySelector(".sim-cad-text");
    var simCursor = simViewport.querySelector(".planner-sim-cursor");
    var simCursorPulse = simViewport.querySelector(".planner-sim-pulse");
    var simTooltip = simViewport.querySelector(".planner-sim-tooltip");
    var simInpLen = simViewport.querySelector(".sim-inp-len");
    var simInpAng = simViewport.querySelector(".sim-inp-ang");
    var simInpTh = simViewport.querySelector(".sim-inp-th");
    var simRowLen = simViewport.querySelector(".sim-row-len");
    var simRowAng = simViewport.querySelector(".sim-row-ang");
    var simRowTh = simViewport.querySelector(".sim-row-th");

    var ctrlBar = document.createElement("div");
    ctrlBar.className = "planner-guide-video-ctrls";

    var playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "guide-vid-btn";
    playBtn.innerHTML = '<i class="ph ph-pause"></i>';
    playBtn.title = t("video_studio_pause");

    var prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "guide-vid-btn";
    prevBtn.innerHTML = '<i class="ph ph-skip-back"></i>';
    prevBtn.title = t("video_studio_prev_frame");

    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "guide-vid-btn";
    nextBtn.innerHTML = '<i class="ph ph-skip-forward"></i>';
    nextBtn.title = t("video_studio_next_frame");

    var scrub = document.createElement("input");
    scrub.type = "range";
    scrub.className = "planner-guide-video-scrub";
    scrub.min = "0";
    scrub.max = String(Math.max(0, frames.length - 1));
    scrub.value = "0";

    var badge = document.createElement("span");
    badge.className = "planner-guide-video-badge";
    badge.textContent = "1 / " + frames.length;

    var speedBtn = document.createElement("button");
    speedBtn.type = "button";
    speedBtn.className = "guide-vid-btn guide-vid-speed";
    speedBtn.textContent = "1x";

    ctrlBar.appendChild(playBtn);
    ctrlBar.appendChild(prevBtn);
    ctrlBar.appendChild(nextBtn);
    ctrlBar.appendChild(scrub);
    ctrlBar.appendChild(badge);
    ctrlBar.appendChild(speedBtn);

    videoWrap.appendChild(simViewport);
    videoWrap.appendChild(ctrlBar);

    var diagWrap = document.createElement("div");
    diagWrap.className = "planner-guide-diagram-wrap";
    diagWrap.innerHTML = diagram(topic.id);
    diagWrap.style.display = "none";

    visual.appendChild(modeBar);
    visual.appendChild(videoWrap);
    visual.appendChild(diagWrap);

    function getTopicSceneSVG(topicId, stepIdx) {
      if (topicId === "basic") {
        if (stepIdx === 0) {
          return '<defs><pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.8"/></pattern></defs>' +
            '<rect width="100%" height="100%" fill="url(#cadGrid)"/>' +
            '<line x1="40" y1="100" x2="300" y2="100" stroke="rgba(59,130,246,0.2)" stroke-width="1"/>' +
            '<line x1="170" y1="20" x2="170" y2="180" stroke="rgba(59,130,246,0.2)" stroke-width="1"/>';
        }
        if (stepIdx === 1) {
          return '<defs><pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.8"/></pattern></defs>' +
            '<rect width="100%" height="100%" fill="url(#cadGrid)"/>' +
            '<circle cx="80" cy="120" r="5" fill="#3b82f6"/>' +
            '<rect x="73" y="113" width="14" height="14" fill="none" stroke="#fff" stroke-width="1.5"/>';
        }
        if (stepIdx === 2) {
          return '<defs><pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.8"/></pattern></defs>' +
            '<rect width="100%" height="100%" fill="url(#cadGrid)"/>' +
            '<rect x="80" y="112" width="180" height="16" fill="rgba(59,130,246,0.35)" stroke="#3b82f6" stroke-width="2"/>' +
            '<line x1="80" y1="95" x2="260" y2="95" stroke="#3b82f6" stroke-width="1.2" stroke-dasharray="3 3"/>' +
            '<rect x="145" y="86" width="50" height="16" rx="4" fill="#0f172a" stroke="#3b82f6" stroke-width="1"/>' +
            '<text x="170" y="98" fill="#3b82f6" font-size="9" font-weight="bold" font-family="monospace" text-anchor="middle">360.0 cm</text>';
        }
        if (stepIdx === 3) {
          return '<defs><pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.8"/></pattern></defs>' +
            '<rect width="100%" height="100%" fill="url(#cadGrid)"/>' +
            '<rect x="80" y="112" width="180" height="16" fill="rgba(59,130,246,0.35)" stroke="#3b82f6" stroke-width="2"/>' +
            '<rect x="244" y="32" width="16" height="96" fill="rgba(59,130,246,0.35)" stroke="#3b82f6" stroke-width="2"/>' +
            '<rect x="270" y="70" width="50" height="16" rx="4" fill="#0f172a" stroke="#3b82f6" stroke-width="1"/>' +
            '<text x="295" y="82" fill="#3b82f6" font-size="9" font-weight="bold" font-family="monospace" text-anchor="middle">240.0 cm</text>';
        }
        if (stepIdx === 4) {
          return '<defs><pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.8"/></pattern></defs>' +
            '<rect width="100%" height="100%" fill="url(#cadGrid)"/>' +
            '<rect x="80" y="112" width="180" height="16" fill="rgba(59,130,246,0.35)" stroke="#3b82f6" stroke-width="2"/>' +
            '<rect x="244" y="32" width="16" height="96" fill="rgba(59,130,246,0.35)" stroke="#3b82f6" stroke-width="2"/>' +
            '<rect x="80" y="32" width="180" height="16" fill="rgba(59,130,246,0.35)" stroke="#3b82f6" stroke-width="2"/>' +
            '<rect x="80" y="32" width="16" height="96" fill="rgba(59,130,246,0.35)" stroke="#3b82f6" stroke-width="2"/>' +
            '<rect x="160" y="48" width="12" height="64" fill="rgba(16,185,129,0.45)" stroke="#10b981" stroke-width="2"/>' +
            '<circle cx="166" cy="112" r="5" fill="#10b981"/>';
        }
        return '<rect width="100%" height="100%" fill="#07080c"/>' +
          '<polygon points="170,40 270,95 170,150 70,95" fill="#78350f" stroke="#92400e" stroke-width="1.5"/>' +
          '<polygon points="70,95 70,45 170,0 170,40" fill="rgba(59,130,246,0.55)" stroke="#3b82f6" stroke-width="1.5"/>' +
          '<polygon points="170,40 170,0 270,45 270,95" fill="rgba(37,99,235,0.75)" stroke="#2563eb" stroke-width="1.5"/>' +
          '<polygon points="120,68 120,28 170,45 170,95" fill="rgba(16,185,129,0.6)" stroke="#10b981" stroke-width="1.5"/>';
      }
      if (topicId === "wall_types") {
        var fills = ["#3b82f6", "#f59e0b", "#64748b", "#06b6d4", "#f59e0b", "#3b82f6"];
        var fill = fills[stepIdx] || "#3b82f6";
        var th = stepIdx === 2 ? 10 : stepIdx === 1 || stepIdx === 4 ? 24 : 16;
        return '<defs><pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.8"/></pattern></defs>' +
          '<rect width="100%" height="100%" fill="url(#cadGrid)"/>' +
          '<rect x="70" y="90" width="200" height="' + th + '" fill="' + fill + '" fill-opacity="0.4" stroke="' + fill + '" stroke-width="2"/>' +
          '<line x1="70" y1="' + (90 + th / 2) + '" x2="270" y2="' + (90 + th / 2) + '" stroke="#fff" stroke-width="1" stroke-dasharray="4 2"/>';
      }
      if (topicId === "angle") {
        var ang = 30 + stepIdx * 5;
        return '<defs><pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.8"/></pattern></defs>' +
          '<rect width="100%" height="100%" fill="url(#cadGrid)"/>' +
          '<path d="M 60 140 L 170 ' + (70 + stepIdx * 6) + ' L 280 140" fill="none" stroke="#3b82f6" stroke-width="16" stroke-linejoin="miter"/>' +
          '<text x="170" y="170" fill="#f59e0b" font-size="10" font-weight="bold" font-family="monospace" text-anchor="middle">' + ang + '.0° Mitre</text>';
      }
      if (topicId === "opening") {
        return '<defs><pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.8"/></pattern></defs>' +
          '<rect width="100%" height="100%" fill="url(#cadGrid)"/>' +
          '<rect x="50" y="90" width="240" height="16" fill="rgba(59,130,246,0.35)" stroke="#3b82f6" stroke-width="2"/>' +
          (stepIdx >= 1 ? '<path d="M 100 90 A 40 40 0 0 1 140 130 L 100 90 Z" fill="none" stroke="#10b981" stroke-width="1.5" stroke-dasharray="3 3"/><line x1="100" y1="90" x2="100" y2="130" stroke="#10b981" stroke-width="2"/>' : '') +
          (stepIdx >= 3 ? '<rect x="170" y="92" width="60" height="12" fill="rgba(6,182,212,0.4)" stroke="#06b6d4" stroke-width="1.5"/><line x1="200" y1="92" x2="200" y2="104" stroke="#06b6d4" stroke-width="1"/>' : '');
      }
      var rad = stepIdx * (Math.PI * 2 / 16);
      var cx = 170 + Math.cos(rad) * 90;
      var cy = 100 + Math.sin(rad) * 35;
      return '<rect width="100%" height="100%" fill="#07080c"/>' +
        '<ellipse cx="170" cy="100" rx="90" ry="35" fill="none" stroke="rgba(59,130,246,0.25)" stroke-dasharray="3 3"/>' +
        '<polygon points="170,50 240,90 170,130 100,90" fill="#78350f" stroke="#92400e" stroke-width="1.5"/>' +
        '<polygon points="100,90 100,50 170,10 170,50" fill="rgba(59,130,246,0.5)" stroke="#3b82f6" stroke-width="1.5"/>' +
        '<polygon points="170,50 170,10 240,50 240,90" fill="rgba(37,99,235,0.7)" stroke="#2563eb" stroke-width="1.5"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="#3b82f6"/>' +
        '<line x1="' + cx + '" y1="' + cy + '" x2="170" y2="90" stroke="rgba(59,130,246,0.6)" stroke-width="1.5"/>';
    }

    function drawFrame(idx) {
      currentFrameIdx = idx;
      var f = frames[idx] || {};
      var is3D = (topic.id === "quick_videos") || (idx === frames.length - 1 && (topic.id === "basic" || topic.id === "wall_types" || topic.id === "opening"));
      btn2D.classList.toggle("active", !is3D);
      btn3D.classList.toggle("active", is3D);
      var actTool = "select";
      if (topic.id === "basic" && idx < 5) actTool = "wall";
      else if (topic.id === "wall_types") actTool = "wall";
      else if (topic.id === "opening") actTool = idx < 2 ? "door" : idx < 5 ? "window" : "select";
      simTools.forEach(function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-sim-tool") === actTool);
      });
      simSvg.innerHTML = getTopicSceneSVG(topic.id, idx);
      if (topic.id === "basic" && idx === 2) {
        simCadEntry.style.display = "inline-flex";
        simCadText.textContent = "L: 360.0 cm  Tab  ∠: 0.0°";
      } else if (topic.id === "precision" && idx === 1) {
        simCadEntry.style.display = "inline-flex";
        simCadText.textContent = "L: 360.0 cm  Tab  ∠: 0.0°";
      } else {
        simCadEntry.style.display = "none";
      }
      var curX = "50%";
      var curY = "50%";
      var tipText = f.label || "";
      if (idx === 0) { curX = "25%"; curY = "82%"; }
      else if (idx === 1) { curX = "28%"; curY = "58%"; }
      else if (idx === 2) { curX = "72%"; curY = "58%"; }
      else if (idx === 3) { curX = "72%"; curY = "25%"; }
      else if (idx === 4) { curX = "50%"; curY = "58%"; }
      else { curX = "50%"; curY = "8%"; }
      simCursor.style.left = curX;
      simCursor.style.top = curY;
      simCursorPulse.style.display = "block";
      simTooltip.style.display = tipText ? "block" : "none";
      simTooltip.textContent = tipText;
      if (topic.id === "basic") {
        simInpLen.value = idx >= 2 ? "360.0" : "0.0";
        simInpAng.value = idx === 3 ? "90.0°" : "0.0°";
        simInpTh.value = "20.0";
        simRowLen.classList.toggle("highlight", idx === 2);
        simRowAng.classList.toggle("highlight", idx === 3);
      } else if (topic.id === "wall_types") {
        simInpTh.value = idx === 1 || idx === 4 ? "28.0" : idx === 2 ? "10.0" : "20.0";
        simRowTh.classList.toggle("highlight", true);
      } else if (topic.id === "angle") {
        simInpAng.value = (30 + idx * 5) + ".0°";
        simRowAng.classList.toggle("highlight", true);
      }
      scrub.value = String(idx);
      badge.textContent = (idx + 1) + " / " + frames.length;
      if (onStepChange && f.stepIndex != null) {
        onStepChange(f.stepIndex);
      }
    }

    function tick() {
      clearTimeout(timer);
      if (!visual.isConnected) return;
      if (isPlaying && currentMode === "video" && frames.length > 0) {
        var nextIdx = (currentFrameIdx + 1) % frames.length;
        drawFrame(nextIdx);
        timer = setTimeout(tick, (frames[nextIdx].durationMs || 1600) / speedMultiplier);
      }
    }

    playBtn.addEventListener("click", function () {
      isPlaying = !isPlaying;
      playBtn.innerHTML = isPlaying ? '<i class="ph ph-pause"></i>' : '<i class="ph ph-play"></i>';
      if (isPlaying) tick();
    });

    prevBtn.addEventListener("click", function () {
      isPlaying = false;
      playBtn.innerHTML = '<i class="ph ph-play"></i>';
      var prev = (currentFrameIdx - 1 + frames.length) % frames.length;
      drawFrame(prev);
    });

    nextBtn.addEventListener("click", function () {
      isPlaying = false;
      playBtn.innerHTML = '<i class="ph ph-play"></i>';
      var next = (currentFrameIdx + 1) % frames.length;
      drawFrame(next);
    });

    speedBtn.addEventListener("click", function () {
      if (speedMultiplier === 1.0) speedMultiplier = 1.5;
      else if (speedMultiplier === 1.5) speedMultiplier = 0.5;
      else speedMultiplier = 1.0;
      speedBtn.textContent = speedMultiplier + "x";
    });

    scrub.addEventListener("input", function () {
      isPlaying = false;
      playBtn.innerHTML = '<i class="ph ph-play"></i>';
      drawFrame(Number(scrub.value));
    });

    var vidSwitchBtn = modeBar.querySelector('[data-mode="video"]');
    var diagSwitchBtn = modeBar.querySelector('[data-mode="diagram"]');

    vidSwitchBtn.addEventListener("click", function () {
      currentMode = "video";
      vidSwitchBtn.classList.add("active");
      diagSwitchBtn.classList.remove("active");
      videoWrap.style.display = "flex";
      diagWrap.style.display = "none";
      drawFrame(currentFrameIdx);
      if (isPlaying) tick();
    });

    diagSwitchBtn.addEventListener("click", function () {
      currentMode = "diagram";
      vidSwitchBtn.classList.remove("active");
      diagSwitchBtn.classList.add("active");
      videoWrap.style.display = "none";
      diagWrap.style.display = "block";
      clearTimeout(timer);
    });

    var studioBtn = modeBar.querySelector(".planner-guide-open-studio-btn");
    if (studioBtn) {
      studioBtn.addEventListener("click", function () {
        if (typeof window.__openVideoStudio === "function") {
          window.__openVideoStudio({ frames: frames });
        }
      });
    }

    drawFrame(0);
    if (isPlaying) {
      timer = setTimeout(tick, ((frames[0] ? frames[0].durationMs : 1600) || 1600) / speedMultiplier);
    }

    return {
      seekToStep: function (sIdx) {
        for (var i = 0; i < frames.length; i++) {
          if (frames[i].stepIndex === sIdx) {
            isPlaying = false;
            playBtn.innerHTML = '<i class="ph ph-play"></i>';
            drawFrame(i);
            break;
          }
        }
      },
      destroy: function () {
        clearTimeout(timer);
      },
    };
  }

  function render(topic) {
    clearInterval(playTimer);
    if (activePlayer && activePlayer.destroy) activePlayer.destroy();
    stopSpeaking();
    currentTopic = topic.id;
    tabs.querySelectorAll("button").forEach(function (b) {
      var on = b.dataset.topic === topic.id;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute("aria-label", t(topic.title));
    panel.innerHTML = "";
    var visual = document.createElement("div");
    visual.className = "planner-guide-visual is-all";
    var copy = document.createElement("div");
    var head = document.createElement("div");
    head.className = "planner-guide-panel-head";
    var h = document.createElement("h4");
    h.textContent = t(topic.title);
    var topicSpeakBtn = document.createElement("button");
    topicSpeakBtn.type = "button";
    topicSpeakBtn.className = "planner-guide-speak-btn";
    topicSpeakBtn.innerHTML = '<i class="ph ph-speaker-high"></i><span></span>';
    topicSpeakBtn.querySelector("span").textContent = t("planner_guide_speak");
    bindSpeakButton(
      topicSpeakBtn,
      function () {
        var stepsText = topic.steps.map(function (key, idx) {
          return (idx + 1) + ". " + t(key);
        }).join(". ");
        return [
          t(topic.title),
          t(topic.body),
          stepsText,
          t(topic.tip),
          t(topic.mistake),
        ];
      },
      getLang,
      { showLabel: true, labelPlay: t("planner_guide_speak"), labelStop: t("planner_tour_speak_stop") }
    );
    head.appendChild(h);
    head.appendChild(topicSpeakBtn);
    var p = document.createElement("p");
    p.textContent = t(topic.body);
    var ol = document.createElement("ol");
    var isPaused = false;
    var step = 0;

    ol.addEventListener("pointerenter", function () { isPaused = true; });
    ol.addEventListener("pointerleave", function () {
      isPaused = false;
      highlight(visual, null);
    });

    topic.steps.forEach(function (key, i) {
      var li = document.createElement("li");
      li.innerHTML = kbdify(t(key));
      li.dataset.step = String(i);
      li.addEventListener("pointerenter", function () {
        isPaused = true;
        highlight(visual, i);
        step = (i + 1) % topic.steps.length;
      });
      li.addEventListener("pointerleave", function () {
        highlight(visual, null);
      });
      li.addEventListener("click", function () {
        isPaused = true;
        highlight(visual, i);
        step = (i + 1) % topic.steps.length;
      });
      ol.appendChild(li);
    });

    activePlayer = setupTopicVisual(topic, visual, function (stepIdx) {
      ol.querySelectorAll("li").forEach(function (li, idx) {
        li.classList.toggle("is-active-step", idx === stepIdx);
      });
    });

    var tip = document.createElement("div");
    tip.className = "planner-guide-tip";
    tip.innerHTML = '<i class="ph ph-lightbulb"></i><span></span>';
    tip.querySelector("span").innerHTML = kbdify(t(topic.tip));
    var mistake = document.createElement("div");
    mistake.className = "planner-guide-dont";
    mistake.innerHTML = '<i class="ph ph-warning"></i><span></span>';
    mistake.querySelector("span").innerHTML = kbdify(t(topic.mistake));
    var practice = document.createElement("button");
    practice.type = "button";
    practice.className = "planner-guide-practice";
    if (topic.id === "quick_videos") {
      practice.innerHTML = '<i class="ph ph-film-strip"></i><span></span>';
      practice.querySelector("span").textContent = t("planner_guide_launch_video_studio");
      practice.addEventListener("click", function () {
        closeGuide();
        openVideoStudio({ frames: getTopicVideoFrames(topic.id) });
      });
    } else {
      practice.innerHTML = '<i class="ph ph-hand-tap"></i><span></span>';
      practice.querySelector("span").textContent = t("planner_guide_practice_this");
      practice.addEventListener("click", function () {
        closeGuide();
        startPlannerTour(topic.track);
      });
    }
    copy.appendChild(head);
    copy.appendChild(p);
    copy.appendChild(ol);
    copy.appendChild(tip);
    copy.appendChild(mistake);
    copy.appendChild(practice);
    panel.appendChild(visual);
    panel.appendChild(copy);
    if (reducedMotion()) return;
    playTimer = setInterval(function () {
      if (!panel.isConnected) { clearInterval(playTimer); return; }
      if (isPaused) return;
      highlight(visual, step);
      step = (step + 1) % topic.steps.length;
    }, 2400);
  }

  TOPICS.forEach(function (topic) {
    var b = document.createElement("button");
    b.type = "button";
    b.dataset.topic = topic.id;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", panel.id);
    b.tabIndex = -1;
    b.innerHTML = '<i class="ph ' + topic.icon + '"></i><span></span>';
    b.querySelector("span").textContent = t(topic.title);
    b.addEventListener("click", function () { render(topic); });
    tabs.appendChild(b);
  });
  /* A tablist is one stop in the tab order; the arrows move inside it. */
  tabs.addEventListener("keydown", function (e) {
    var keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (keys.indexOf(e.key) < 0) return;
    var index = TOPICS.findIndex(function (q) { return q.id === currentTopic; });
    if (index < 0) index = 0;
    var forward = "ArrowRight";
    var next = e.key === "Home" ? 0
      : e.key === "End" ? TOPICS.length - 1
      : e.key === forward ? (index + 1) % TOPICS.length
      : (index - 1 + TOPICS.length) % TOPICS.length;
    e.preventDefault();
    render(TOPICS[next]);
    var btn = tabs.querySelector('[data-topic="' + TOPICS[next].id + '"]');
    if (btn) btn.focus();
  });

  var order = document.createElement("div");
  order.className = "planner-guide-order";
  order.innerHTML = '<i class="ph ph-check-circle"></i><span></span>';
  order.querySelector("span").textContent = t("planner_guide_order");
  m.body.appendChild(order);
  var back = document.createElement("button");
  back.textContent = t("planner_tour_tracks_back");
  back.addEventListener("click", function () { showPlannerHub(); });
  var close = document.createElement("button");
  close.className = "btn-accent";
  close.textContent = t("keys_close");
  close.addEventListener("click", function () { closeGuide(); restoreLaunchFocus(); });
  m.actions.appendChild(back);
  m.actions.appendChild(close);
  var first = TOPICS.find(function (q) { return q.id === startTopic; }) || TOPICS[0];
  render(first);
  close.focus();
}

/* ---- interactive practice ---------------------------------------------- */

function ensurePlanView() {
  var cc = document.getElementById("center-canvas");
  if (cc && cc.classList.contains("max-view-3d") && typeof window.__setViewMode === "function")
    window.__setViewMode("plan");
}

function maxNodeDegree() {
  var max = 0;
  for (var i = 0; i < S.nodes.length; i++) max = Math.max(max, nodeDegree(i));
  return max;
}

function angledWallCount() {
  var n = 0;
  (S.walls || []).forEach(function (w) {
    var a = S.nodes[w.a], b = S.nodes[w.b];
    if (!a || !b) return;
    var deg = Math.atan2(b.z - a.z, b.x - a.x) * 180 / Math.PI;
    var r = ((deg % 90) + 90) % 90;
    if (r > 4 && r < 86) n++;
  });
  return n;
}

function selectedWall() {
  return S.sel && S.sel.kind === "wall" ? S.sel.ref : null;
}

function tourSteps(track) {
  if (track === "precision") return [
    { title: "planner_tour_prec_intro_t", body: "planner_tour_prec_intro_b", tip: "planner_tour_prec_intro_tip", target: '[data-tool="wall"]', manual: true },
    { title: "planner_tour_prec_arm_t", body: "planner_tour_prec_arm_b", tip: "planner_tour_prec_arm_tip", target: '[data-tool="wall"]',
      done: function () { return S.tool === "wall"; } },
    { title: "planner_tour_prec_draw_t", body: "planner_tour_prec_draw_b", tip: "planner_tour_prec_draw_tip", target: "#plan",
      baseline: function () { return S.drawing ? 1 : 0; },
      done: function () { return S.tool === "wall" && S.drawing; } },
    { title: "planner_tour_prec_type_t", body: "planner_tour_prec_type_b", tip: "planner_tour_prec_type_tip", target: "#cad-entry",
      done: function () { return tour.typed || entryOpen(); } },
    { title: "planner_tour_prec_place_t", body: "planner_tour_prec_place_b", tip: "planner_tour_prec_place_tip", target: "#plan",
      baseline: function () { return (S.walls || []).length; },
      done: function () { return (S.walls || []).length > Number(tour.baseline || 0); } },
    { title: "planner_tour_finish_t", body: "planner_tour_prec_done_b", tip: "planner_tour_finish_tip", target: "#plannerTutorialBtn", manual: true },
  ];
  if (track === "angle") return [
    { title: "planner_tour_ang_intro_t", body: "planner_tour_ang_intro_b", tip: "planner_tour_ang_intro_tip", target: '[data-aid="ortho"]', manual: true },
    { title: "planner_tour_ang_ortho_t", body: "planner_tour_ang_ortho_b", tip: "planner_tour_ang_ortho_tip", target: '[data-aid="ortho"]',
      done: function () { return S.ortho === false; } },
    { title: "planner_tour_ang_arm_t", body: "planner_tour_ang_arm_b", tip: "planner_tour_ang_arm_tip", target: '[data-tool="wall"]',
      done: function () { return S.tool === "wall"; } },
    { title: "planner_tour_ang_draw_t", body: "planner_tour_ang_draw_b", tip: "planner_tour_ang_draw_tip", target: "#plan",
      baseline: function () { return angledWallCount(); },
      done: function () { return angledWallCount() > Number(tour.baseline || 0); } },
    { title: "planner_tour_finish_t", body: "planner_tour_ang_done_b", tip: "planner_tour_finish_tip", target: "#plannerTutorialBtn", manual: true },
  ];
  if (track === "opening") return [
    { title: "planner_tour_open_intro_t", body: "planner_tour_open_intro_b", tip: "planner_tour_open_intro_tip", target: '[data-tool="door"]', manual: true },
    { title: "planner_tour_open_wall_t", body: "planner_tour_open_wall_b", tip: "planner_tour_open_wall_tip", target: '[data-tool="wall"]',
      done: function () { return (S.walls || []).length > 0; } },
    { title: "planner_tour_open_arm_t", body: "planner_tour_open_arm_b", tip: "planner_tour_open_arm_tip", target: '[data-tool="door"]',
      done: function () { return S.tool === "door"; } },
    { title: "planner_tour_open_place_t", body: "planner_tour_open_place_b", tip: "planner_tour_open_place_tip", target: "#plan",
      baseline: function () { return (S.openings || []).length; },
      done: function () { return (S.openings || []).length > Number(tour.baseline || 0); } },
    { title: "planner_tour_finish_t", body: "planner_tour_open_done_b", tip: "planner_tour_finish_tip", target: "#plannerTutorialBtn", manual: true },
  ];
  if (track === "edit") return [
    { title: "planner_tour_edit_intro_t", body: "planner_tour_edit_intro_b", tip: "planner_tour_edit_intro_tip", target: "#wallProps", manual: true },
    { title: "planner_tour_edit_sel_t", body: "planner_tour_edit_sel_b", tip: "planner_tour_edit_sel_tip", target: '[data-tool="select"]',
      done: function () { return !!selectedWall(); } },
    { title: "planner_tour_edit_len_t", body: "planner_tour_edit_len_b", tip: "planner_tour_edit_len_tip", target: "#w_len",
      baseline: function () { var w = selectedWall(); return w ? wallClearLength(w) : null; },
      done: function () {
        var w = selectedWall();
        return w && tour.baseline != null && Math.abs(wallClearLength(w) - Number(tour.baseline)) > 0.4;
      } },
    { title: "planner_tour_edit_ang_t", body: "planner_tour_edit_ang_b", tip: "planner_tour_edit_ang_tip", target: "#w_ang",
      done: function () { return !!selectedWall(); }, manual: true },
    { title: "planner_tour_finish_t", body: "planner_tour_edit_done_b", tip: "planner_tour_finish_tip", target: "#plannerTutorialBtn", manual: true },
  ];
  if (track === "video") return [
    { title: "planner_tour_vid_intro_t", body: "planner_tour_vid_intro_b", tip: "planner_tour_vid_intro_tip", target: "#plannerTutorialBtn", manual: true },
    { title: "planner_tour_vid_capture_t", body: "planner_tour_vid_capture_b", tip: "planner_tour_vid_capture_tip", target: "#plannerTutorialBtn", manual: true },
    { title: "planner_tour_vid_trans_t", body: "planner_tour_vid_trans_b", tip: "planner_tour_vid_trans_tip", target: "#plannerTutorialBtn", manual: true },
    { title: "planner_tour_finish_t", body: "planner_tour_vid_done_b", tip: "planner_tour_finish_tip", target: "#plannerTutorialBtn", manual: true },
  ];
  return [
    { title: "planner_tour_basic_intro_t", body: "planner_tour_basic_intro_b", tip: "planner_tour_basic_intro_tip", target: '[data-tool="wall"]', manual: true },
    { title: "planner_tour_basic_arm_t", body: "planner_tour_basic_arm_b", tip: "planner_tour_basic_arm_tip", target: '[data-tool="wall"]',
      done: function () { return S.tool === "wall"; } },
    { title: "planner_tour_basic_draw_t", body: "planner_tour_basic_draw_b", tip: "planner_tour_basic_draw_tip", target: "#plan",
      baseline: function () { return (S.walls || []).length; },
      done: function () { return (S.walls || []).length > Number(tour.baseline || 0); } },
    { title: "planner_tour_basic_run_t", body: "planner_tour_basic_run_b", tip: "planner_tour_basic_run_tip", target: "#plan",
      baseline: function () { return maxNodeDegree(); },
      done: function () { return maxNodeDegree() >= 2 && (S.walls || []).length >= 2; } },
    { title: "planner_tour_basic_tee_t", body: "planner_tour_basic_tee_b", tip: "planner_tour_basic_tee_tip", target: "#plan",
      baseline: function () { return maxNodeDegree(); },
      done: function () { return maxNodeDegree() >= 3; } },
    { title: "planner_tour_finish_t", body: "planner_tour_basic_done_b", tip: "planner_tour_finish_tip", target: "#plannerTutorialBtn", manual: true },
  ];
}

function tourLayer() {
  var layer = document.getElementById("plannerTour");
  if (layer) return layer;
  layer = document.createElement("div");
  layer.id = "plannerTour";
  layer.className = "planner-tour-layer";
  layer.hidden = true;
  layer.innerHTML =
    '<section class="planner-tour-card" role="dialog" aria-modal="false" aria-labelledby="plannerTourTitle">' +
      '<div class="planner-tour-head">' +
        '<div><span id="plannerTourCount"></span><h3 id="plannerTourTitle"></h3></div>' +
        '<div class="planner-tour-head-actions">' +
          '<button type="button" id="plannerTourSpeak" aria-label="' + t("planner_tour_speak") + '" title="' + t("planner_tour_speak") + '"><i class="ph ph-speaker-high"></i></button>' +
          '<button type="button" id="plannerTourClose" aria-label=""><i class="ph ph-x"></i></button>' +
        "</div>" +
      "</div>" +
      '<div class="planner-tour-progress" aria-hidden="true"><span id="plannerTourProgress"></span></div>' +
      '<p id="plannerTourBody"></p>' +
      '<div class="planner-tour-tracks" id="plannerTourTracks" hidden></div>' +
      '<div class="planner-tour-progress-note" id="plannerTourProgressNote" hidden></div>' +
      '<div class="planner-tour-tip"><i class="ph ph-lightbulb"></i><span id="plannerTourTip"></span></div>' +
      '<div class="planner-tour-status" id="plannerTourStatus" role="status"></div>' +
      '<div class="planner-tour-actions">' +
        '<button type="button" id="plannerTourBack"></button>' +
        '<button type="button" id="plannerTourSkip" class="planner-tour-skip"></button>' +
        '<button type="button" id="plannerTourNext" class="btn-accent"></button>' +
      "</div>" +
      '<p class="planner-tour-keys" id="plannerTourKeys"></p>' +
    "</section>";
  document.body.appendChild(layer);
  layer.querySelector("#plannerTourClose").addEventListener("click", function () { stopTour(true); });
  layer.querySelector("#plannerTourBack").addEventListener("click", function () { goTourStep(-1); });
  layer.querySelector("#plannerTourSkip").addEventListener("click", function () { goTourStep(1, true); });
  layer.querySelector("#plannerTourNext").addEventListener("click", function () {
    var steps = tourSteps(tour.track);
    if (tour.step >= steps.length - 1) finishTour();
    else goTourStep(1);
  });
  /* Arrows only steer the card while it holds focus: the planner itself uses
     them to nudge the selection, and a practice run must not eat that. */
  layer.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    if (!tour.active || !tour.track) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var forward = "ArrowRight";
    var steps = tourSteps(tour.track);
    if (e.key === forward && !tourStepDone(steps[tour.step], tour.step)) return;
    e.preventDefault();
    goTourStep(e.key === forward ? 1 : -1);
  });
  installTourDragging(layer);
  return layer;
}

function installTourDragging(layer) {
  var card = layer.querySelector(".planner-tour-card");
  var handle = layer.querySelector(".planner-tour-head");
  handle.addEventListener("pointerdown", function (event) {
    if (event.button !== 0 || event.target.closest("button")) return;
    applyTourPosition();
    tour.drag = {
      pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      originX: tour.position.x, originY: tour.position.y,
    };
    tour.moved = true;
    handle.setPointerCapture(event.pointerId);
    card.classList.add("is-dragging");
    event.preventDefault();
  });
  handle.addEventListener("pointermove", function (event) {
    if (!tour.drag || tour.drag.pointerId !== event.pointerId) return;
    tour.position = clampTourPosition({
      x: tour.drag.originX + event.clientX - tour.drag.startX,
      y: tour.drag.originY + event.clientY - tour.drag.startY,
    });
    applyTourPosition();
  });
  function finish(event) {
    if (!tour.drag || tour.drag.pointerId !== event.pointerId) return;
    tour.drag = null;
    card.classList.remove("is-dragging");
  }
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
}

function clampTourPosition(position) {
  var card = document.querySelector(".planner-tour-card");
  if (!card) return position;
  var margin = 12;
  var maxX = Math.max(margin, window.innerWidth - card.offsetWidth - margin);
  var maxY = Math.max(margin, window.innerHeight - card.offsetHeight - margin);
  return { x: Math.min(maxX, Math.max(margin, position.x)), y: Math.min(maxY, Math.max(margin, position.y)) };
}

function applyTourPosition() {
  var card = document.querySelector(".planner-tour-card");
  if (!card) return;
  if (document.body.classList.contains("compact-nav") && !tour.moved) {
    card.style.left = "";
    card.style.top = "";
    return;
  }
  if (!tour.position) {
    tour.position = {
      x: Math.max(12, window.innerWidth - card.offsetWidth - 24),
      y: Math.max(12, window.innerHeight - card.offsetHeight - 36),
    };
  }
  tour.position = clampTourPosition(tour.position);
  card.style.left = tour.position.x + "px";
  card.style.top = tour.position.y + "px";
}

function avoidTourTargetOverlap(target) {
  if (!target || tour.moved || document.body.classList.contains("compact-nav")) return;
  var card = document.querySelector(".planner-tour-card");
  if (!card) return;
  var tr = target.getBoundingClientRect(), cr = card.getBoundingClientRect();
  if (tr.width > window.innerWidth * 0.5 && tr.height > window.innerHeight * 0.5) return;
  if (cr.right < tr.left || cr.left > tr.right || cr.bottom < tr.top || cr.top > tr.bottom) return;
  var margin = 16, w = card.offsetWidth, h = card.offsetHeight;
  var options = [
    { x: tr.right + margin, y: tour.position.y },
    { x: tr.left - w - margin, y: tour.position.y },
    { x: tour.position.x, y: tr.bottom + margin },
    { x: tour.position.x, y: tr.top - h - margin },
  ];
  for (var i = 0; i < options.length; i++) {
    var o = options[i];
    if (o.x < margin || o.y < margin || o.x + w > window.innerWidth - margin || o.y + h > window.innerHeight - margin) continue;
    var left = o.x, top = o.y;
    if (left + w < tr.left || left > tr.right || top + h < tr.top || top > tr.bottom) {
      tour.position = o;
      applyTourPosition();
      return;
    }
  }
}

function positionTourMarker() {
  var marker = document.querySelector(".planner-tour-click-marker");
  var target = tour.target;
  if (!marker) return;
  if (!target || !target.isConnected) { marker.remove(); return; }
  var tr = target.getBoundingClientRect();
  if (!tr.width && !tr.height) { marker.hidden = true; return; }
  marker.hidden = false;
  marker.style.left = (tr.left + tr.width / 2) + "px";
  marker.style.top = (tr.top + tr.height / 2) + "px";
}

/* Targets live in panels that scroll and collapse, so the marker is re-pinned
   each frame instead of being placed once and left behind. */
var markerFrame = 0;
function trackTourTarget() {
  markerFrame = 0;
  if (!tour.active || !document.querySelector(".planner-tour-click-marker")) return;
  positionTourMarker();
  markerFrame = requestAnimationFrame(trackTourTarget);
}

function startTourTracking() {
  if (!markerFrame) markerFrame = requestAnimationFrame(trackTourTarget);
}

function stopTourTracking() {
  if (markerFrame) cancelAnimationFrame(markerFrame);
  markerFrame = 0;
}

function clearTourTarget() {
  stopTourTracking();
  document.querySelectorAll(".planner-tour-target").forEach(function (node) {
    node.classList.remove("planner-tour-target");
  });
  document.querySelectorAll(".planner-tour-click-marker").forEach(function (node) { node.remove(); });
  tour.target = null;
}

function showTourClickMarker(target) {
  var layer = document.getElementById("plannerTour");
  if (!layer || !target) return;
  var marker = document.createElement("span");
  marker.className = "planner-tour-click-marker";
  marker.innerHTML = '<i class="ph ph-cursor-click"></i>';
  layer.appendChild(marker);
  positionTourMarker();
  startTourTracking();
}

function tourStepDone(step, index) {
  if (!step || step.manual) return true;
  if (tour.completed[index]) return true;
  try {
    var done = !!step.done();
    if (done) tour.completed[index] = true;
    return done;
  } catch (_) { return false; }
}

function renderTourHub() {
  stopSpeaking();
  closeGuide();
  ensurePlanView();
  var layer = tourLayer();
  tour.active = true;
  tour.track = null;
  tour.step = 0;
  layer.hidden = false;
  document.body.classList.add("planner-tour-open");
  clearTourTarget();
  layer.querySelector("#plannerTourCount").textContent = t("planner_tour_title");
  layer.querySelector("#plannerTourTitle").textContent = t("planner_tour_hub_title");
  layer.querySelector("#plannerTourBody").textContent = t("planner_tour_hub_body");
  layer.querySelector(".planner-tour-progress").hidden = true;
  layer.querySelector(".planner-tour-tip").hidden = true;
  layer.querySelector("#plannerTourStatus").hidden = true;
  layer.querySelector(".planner-tour-actions").hidden = true;
  var speakBtn = layer.querySelector("#plannerTourSpeak");
  if (speakBtn) {
    bindSpeakButton(
      speakBtn,
      function () {
        var trackList = TOUR_TRACKS.map(function (item) {
          return t(item.title) + ": " + t(item.desc);
        }).join(". ");
        return [
          t("planner_tour_title"),
          t("planner_tour_hub_title"),
          t("planner_tour_hub_body"),
          trackList,
        ];
      },
      getLang,
      { labelPlay: t("planner_tour_speak"), labelStop: t("planner_tour_speak_stop") }
    );
  }
  var tracks = layer.querySelector("#plannerTourTracks");
  tracks.hidden = false;
  var arrow = "ph-arrow-right";
  var finished = loadProgress();
  var upNext = nextTrack();
  tracks.innerHTML = TOUR_TRACKS.map(function (item) {
    var done = !!finished[item.id];
    var hint = done ? '<em class="planner-tour-track-done">' + t("planner_tour_track_done") + "</em>"
      : item.id === upNext ? '<em class="planner-tour-track-next">' + t("planner_tour_track_next") + "</em>"
      : "";
    return '<button type="button" data-tour-track="' + item.id + '"' + (done ? ' data-done="1"' : "") + ">" +
      '<i class="ph ' + (done ? "ph-check-circle" : item.icon) + '"></i>' +
      "<span><b>" + t(item.title) + hint + "</b><small>" + t(item.desc) + "</small></span>" +
      '<i class="ph ' + arrow + '"></i></button>';
  }).join("");
  tracks.querySelectorAll("[data-tour-track]").forEach(function (button) {
    button.addEventListener("click", function () { startPlannerTour(button.getAttribute("data-tour-track")); });
  });
  renderTourProgressFooter(layer);
  layer.querySelector("#plannerTourClose").setAttribute("aria-label", t("planner_tour_close"));
  layer.querySelector("#plannerTourClose").title = t("planner_tour_close");
  layer.querySelector("#plannerTourKeys").textContent = t("planner_tour_keys");
  requestAnimationFrame(applyTourPosition);
}

/* "3/5 completed · Reset" under the track list, so a returning user can see
   what is left without starting a track to find out. */
function renderTourProgressFooter(layer) {
  var foot = layer.querySelector("#plannerTourProgressNote");
  var count = progressCount();
  foot.hidden = false;
  foot.innerHTML = "<span></span>";
  foot.querySelector("span").textContent = count.done + "/" + count.total + " " + t("planner_tour_progress_note");
  if (!count.done) return;
  var reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = t("planner_tour_reset");
  reset.addEventListener("click", function () { resetProgress(); renderTourHub(); });
  foot.appendChild(reset);
}

export function showPlannerTourHub() {
  renderTourHub();
}

export function startPlannerTour(track) {
  stopSpeaking();
  closeGuide();
  ensurePlanView();
  tour.active = true;
  tour.track = track || "basic";
  tour.step = 0;
  tour.completed = {};
  tour.typed = false;
  tour.moved = false;
  tour.position = null;
  prepareTourStep();
}

function prepareTourStep() {
  var steps = tourSteps(tour.track);
  var step = steps[tour.step];
  if (!step) return;
  tour.typed = false;
  tour.baseline = step.baseline ? step.baseline() : null;
  renderTour();
}

function renderTour() {
  if (!tour.active) return;
  if (!tour.track) { renderTourHub(); return; }
  var steps = tourSteps(tour.track);
  var index = Math.max(0, Math.min(tour.step, steps.length - 1));
  var step = steps[index];
  var layer = tourLayer();
  var done = tourStepDone(step, index);
  layer.hidden = false;
  document.body.classList.add("planner-tour-open");
  layer.querySelector("#plannerTourTracks").hidden = true;
  layer.querySelector("#plannerTourProgressNote").hidden = true;
  layer.querySelector("#plannerTourKeys").textContent = t("planner_tour_keys");
  layer.querySelector(".planner-tour-progress").hidden = false;
  layer.querySelector(".planner-tour-tip").hidden = false;
  layer.querySelector(".planner-tour-actions").hidden = false;
  layer.querySelector("#plannerTourTitle").textContent = t(step.title);
  layer.querySelector("#plannerTourBody").innerHTML = kbdify(t(step.body));
  layer.querySelector("#plannerTourTip").innerHTML = kbdify(t(step.tip));
  layer.querySelector("#plannerTourCount").textContent = index === 0
    ? t("planner_tour_title")
    : index === steps.length - 1
      ? t("planner_tour_done")
      : t("planner_tour_step") + " " + (index + 1) + " " + t("planner_tour_of") + " " + steps.length;
  layer.querySelector("#plannerTourProgress").style.width =
    Math.round((index / Math.max(1, steps.length - 1)) * 100) + "%";
  var status = layer.querySelector("#plannerTourStatus");
  status.hidden = !!step.manual;
  status.classList.toggle("done", done);
  status.innerHTML = done
    ? '<i class="ph ph-check-circle"></i> ' + t("planner_tour_done")
    : '<i class="ph ph-hand-tap"></i> ' + t("planner_tour_waiting");
  var speakBtn = layer.querySelector("#plannerTourSpeak");
  if (speakBtn) {
    bindSpeakButton(
      speakBtn,
      function () {
        var countStr = layer.querySelector("#plannerTourCount").textContent;
        return [
          countStr + ". " + t(step.title),
          t(step.body),
          t(step.tip),
          !step.manual ? (done ? t("planner_tour_done") : t("planner_tour_waiting")) : "",
        ];
      },
      getLang,
      { labelPlay: t("planner_tour_speak"), labelStop: t("planner_tour_speak_stop") }
    );
  }
  var back = layer.querySelector("#plannerTourBack");
  var next = layer.querySelector("#plannerTourNext");
  var skip = layer.querySelector("#plannerTourSkip");
  var en = getLang() === "en";
  back.disabled = false;
  back.innerHTML = '<i class="ph ' + (en ? "ph-arrow-left" : "ph-arrow-right") + '"></i>' +
    (index === 0 ? t("planner_tour_tracks_back") : t("planner_tour_back"));
  skip.hidden = !!step.manual;
  skip.textContent = t("planner_tour_skip");
  next.hidden = false;
  next.disabled = !done;
  /* A step the user just satisfied gets a nudge, so the next move is obvious
     without the tour stealing focus from the canvas they are working on. */
  next.classList.toggle("is-ready", done && !step.manual);
  next.innerHTML = index === steps.length - 1
    ? '<i class="ph ph-check"></i>' + t("planner_tour_finish")
    : t("planner_tour_next") + '<i class="ph ' + (en ? "ph-arrow-right" : "ph-arrow-left") + '"></i>';
  layer.querySelector("#plannerTourClose").setAttribute("aria-label", t("planner_tour_close"));
  clearTourTarget();
  var target = step.target ? document.querySelector(step.target) : null;
  if (target && (target.hidden || target.getAttribute("hidden") != null))
    target = document.querySelector("#plan");
  if (target) {
    target.classList.add("planner-tour-target");
    tour.target = target;
    showTourClickMarker(target);
  }
  lastTourSig = tourSignature();
  requestAnimationFrame(function () {
    applyTourPosition();
    avoidTourTargetOverlap(target);
  });
}

/* Reaching the last step is what counts as finishing a track; closing early
   leaves it open so the hub still shows it as the next thing to do. */
function finishTour() {
  var track = tour.track;
  stopTour();
  markTrackDone(track);
  showPlannerTourHub();
}

function goTourStep(delta, skip) {
  stopSpeaking();
  if (!tour.active) return;
  if (!tour.track) {
    if (delta < 0) { stopTour(); showPlannerHub(); }
    return;
  }
  var steps = tourSteps(tour.track);
  if (delta < 0 && tour.step === 0) {
    renderTourHub();
    return;
  }
  var next = tour.step + delta;
  if (next < 0) next = 0;
  if (next >= steps.length) { finishTour(); return; }
  if (delta > 0 && skip) tour.completed[tour.step] = true;
  tour.step = next;
  prepareTourStep();
}

function stopTour(restoreFocus) {
  stopSpeaking();
  var wasActive = tour.active;
  tour.active = false;
  tour.track = null;
  tour.step = 0;
  tour.completed = {};
  tour.typed = false;
  clearTourTarget();
  document.body.classList.remove("planner-tour-open");
  var layer = document.getElementById("plannerTour");
  if (layer) layer.hidden = true;
  if (wasActive && restoreFocus) restoreLaunchFocus();
}

var lastTourSig = "";
function tourSignature() {
  if (!tour.active || !tour.track) return "";
  var steps = tourSteps(tour.track);
  var step = steps[tour.step];
  var done = tourStepDone(step, tour.step);
  return tour.track + ":" + tour.step + ":" + (done ? "1" : "0") + ":" + (tour.typed ? "1" : "0");
}

function onTourActivity() {
  if (!tour.active || !tour.track) return;
  if (entryOpen()) tour.typed = true;
  var sig = tourSignature();
  if (sig === lastTourSig) return;
  lastTourSig = sig;
  renderTour();
}

onAfterRender(function () {
  if (tour.active && tour.track) onTourActivity();
});
if (typeof window !== "undefined") {
  window.addEventListener("planner-tool", onTourActivity);
  window.addEventListener("planner-place", onTourActivity);
  window.addEventListener("input", function (e) {
    if (!tour.active || !tour.track) return;
    var id = e.target && e.target.id;
    if (id === "cadLen" || id === "cadAng") tour.typed = true;
    onTourActivity();
  }, true);
  window.addEventListener("keydown", function (e) {
    if (!tour.active) return;
    /* Esc belongs to the planner first: it cancels a typed value or ends a wall
       run. Only an otherwise idle Esc closes the practice. */
    if (e.key === "Escape" && !entryOpen() && !S.drawing && !document.querySelector(".bp-overlay")) {
      stopTour(true);
      return;
    }
    if (!tour.track) return;
    if (/^[0-9.]$/.test(e.key) || e.key === "Tab" || e.key === "Enter") {
      tour.typed = tour.typed || entryOpen();
    }
    onTourActivity();
  }, true);
  window.addEventListener("resize", function () {
    if (!tour.active) return;
    /* The card re-wraps as the viewport narrows, so measure it after the
       browser has laid it out again — otherwise it clamps to a stale height
       and hangs off the bottom edge. */
    requestAnimationFrame(function () {
      if (!tour.active) return;
      if (!tour.moved) tour.position = null;
      applyTourPosition();
      positionTourMarker();
    });
  });
}

onLangChange(function () {
  if (activeGuide) return;
  if (tour.active) {
    if (tour.track) renderTour();
    else renderTourHub();
  }
});

export function showPlannerTutorialHub() { showPlannerHub(); }

var launch = typeof document !== "undefined" && document.getElementById("plannerTutorialBtn");
if (launch) launch.addEventListener("click", function () { showPlannerHub(); });
