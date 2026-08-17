// Planner-specific wall guide. Kept separate from the solid modeler's tour:
// this teaches architectural topology, openings and plan constraints.
import { t } from "./i18n.js";
import { openModal } from "./ui.js";

var activeGuide = null;

const TOPICS = [
  { id: "basic", icon: "ph-wall", title: "planner_guide_basic", body: "planner_guide_basic_body", steps: ["planner_basic_1", "planner_basic_2", "planner_basic_3", "planner_basic_4"], tip: "planner_basic_tip" },
  { id: "angle", icon: "ph-angle", title: "planner_guide_angles", body: "planner_guide_angles_body", steps: ["planner_angle_1", "planner_angle_2", "planner_angle_3", "planner_angle_4"], tip: "planner_angle_tip" },
  { id: "opening", icon: "ph-door-open", title: "planner_guide_openings", body: "planner_guide_openings_body", steps: ["planner_open_1", "planner_open_2", "planner_open_3", "planner_open_4"], tip: "planner_open_tip" },
  { id: "sym", icon: "ph-arrows-left-right", title: "planner_guide_symmetry", body: "planner_guide_symmetry_body", steps: ["planner_sym_1", "planner_sym_2", "planner_sym_3", "planner_sym_4"], tip: "planner_sym_tip" },
  { id: "asym", icon: "ph-path", title: "planner_guide_asymmetry", body: "planner_guide_asymmetry_body", steps: ["planner_asym_1", "planner_asym_2", "planner_asym_3", "planner_asym_4"], tip: "planner_asym_tip" },
];

function diagram(kind) {
  var shapes = {
    basic: '<path d="M18 76V26H108V76"/><circle cx="18" cy="76" r="4"/><circle cx="108" cy="76" r="4"/>',
    angle: '<path d="M14 76L61 24L116 61"/><path class="guide-dash" d="M61 24V78"/><text x="66" y="47">37°</text>',
    opening: '<path d="M12 30H50M82 30H118"/><path d="M45 26V34M87 26V34"/><path class="guide-accent" d="M45 30V78"/><text x="54" y="19">JAMB</text>',
    sym: '<path d="M15 72H52V24M115 72H78V24"/><path class="guide-dash" d="M65 12V84"/><path class="guide-accent" d="M30 58H100"/>',
    asym: '<path d="M12 76L42 25L74 47L118 18"/><circle cx="42" cy="25" r="4"/><circle cx="74" cy="47" r="4"/><text x="79" y="67">L / ∠</text>',
  };
  return '<svg viewBox="0 0 130 92" role="img" aria-hidden="true">' + shapes[kind] + "</svg>";
}

export function showPlannerTutorial(startTopic) {
  if (activeGuide) activeGuide.close();
  var m = openModal(t("planner_guide_title"));
  activeGuide = m;
  m.overlay.querySelector(".bp-modal").classList.add("planner-guide-modal");

  var intro = document.createElement("p");
  intro.className = "planner-guide-intro";
  intro.textContent = t("planner_guide_intro");
  var tabs = document.createElement("div");
  tabs.className = "planner-guide-tabs";
  tabs.setAttribute("role", "tablist");
  var panel = document.createElement("section");
  panel.className = "planner-guide-panel";
  m.body.appendChild(intro);
  m.body.appendChild(tabs);
  m.body.appendChild(panel);

  function render(topic) {
    tabs.querySelectorAll("button").forEach(function (b) {
      var on = b.dataset.topic === topic.id;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    panel.innerHTML = "";
    var visual = document.createElement("div");
    visual.className = "planner-guide-visual";
    visual.innerHTML = diagram(topic.id);
    var copy = document.createElement("div");
    var h = document.createElement("h4");
    h.textContent = t(topic.title);
    var p = document.createElement("p");
    p.textContent = t(topic.body);
    var ol = document.createElement("ol");
    topic.steps.forEach(function (key) {
      var li = document.createElement("li");
      li.textContent = t(key);
      ol.appendChild(li);
    });
    var tip = document.createElement("div");
    tip.className = "planner-guide-tip";
    tip.innerHTML = '<i class="ph ph-lightbulb"></i><span></span>';
    tip.querySelector("span").textContent = t(topic.tip);
    copy.appendChild(h); copy.appendChild(p); copy.appendChild(ol); copy.appendChild(tip);
    panel.appendChild(visual); panel.appendChild(copy);
  }

  TOPICS.forEach(function (topic) {
    var b = document.createElement("button");
    b.type = "button";
    b.dataset.topic = topic.id;
    b.setAttribute("role", "tab");
    b.innerHTML = '<i class="ph ' + topic.icon + '"></i><span></span>';
    b.querySelector("span").textContent = t(topic.title);
    b.addEventListener("click", function () { render(topic); });
    tabs.appendChild(b);
  });

  var order = document.createElement("div");
  order.className = "planner-guide-order";
  order.innerHTML = '<i class="ph ph-check-circle"></i><span></span>';
  order.querySelector("span").textContent = t("planner_guide_order");
  m.body.appendChild(order);
  var close = document.createElement("button");
  close.className = "btn-accent";
  close.textContent = t("keys_close");
  close.addEventListener("click", function () { m.close(); activeGuide = null; });
  m.actions.appendChild(close);
  m.overlay.addEventListener("click", function (e) { if (e.target === m.overlay) activeGuide = null; });
  var first = TOPICS.find(function (q) { return q.id === startTopic; }) || TOPICS[0];
  render(first);
  close.focus();
}

var launch = typeof document !== "undefined" && document.getElementById("plannerTutorialBtn");
if (launch) launch.addEventListener("click", function () { showPlannerTutorial(); });
