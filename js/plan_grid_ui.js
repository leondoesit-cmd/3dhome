/* Settings → Grid: one card per plan-grid style, each with a live swatch
   drawn by the same painter the plan uses (js/plan_grid.js), and an opacity
   slider that repaints the swatches and the plan as it moves. */
import { t } from "./i18n.js";
import { DEFAULT_GRID, GRID_STYLES, getGridPrefs, isDarkColor, paintGrid, setGridPrefs } from "./plan_grid.js";

/* Swatch zoom per style (px per cm), each where the style shows its
   character: close enough for the soft minors and the dots, far enough for
   several crosses and the classic 50 cm net. */
var SWATCH_SCALE = { soft: 1.4, lines: 0.6, dots: 1.4, crosses: 0.6, blueprint: 1.4, none: 1 };

function node(tag, cls, text) {
  var el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function canvasBg() {
  var host = document.getElementById("plan") || document.body;
  return getComputedStyle(host).getPropertyValue("--bg-canvas-2d").trim() || "#0e1219";
}

/* A corner of a plan: the grid, then a room over part of it, as in 2D.
   Drawn at the size it is shown (a stretched bitmap blurred 1px lines). */
function drawSwatch(canvas, style, opacity) {
  var w = Math.round(canvas.clientWidth), h = Math.round(canvas.clientHeight);
  if (!(w > 0) || !(h > 0)) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  var ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var bg = canvasBg();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  paintGrid(ctx, {
    ext: { bxmin: 0, bxmax: w, bymin: 0, bymax: h },
    sc: SWATCH_SCALE[style] || 1, ox: 40, oy: 30, dark: isDarkColor(bg),
    prefs: { style: style, opacity: opacity },
  });
  var rx = Math.round(w * 0.66), ry = Math.round(h * 0.44);
  ctx.fillStyle = "#dcc9a6";
  ctx.fillRect(rx, ry, w - rx + 4, h - ry + 4);
  ctx.strokeStyle = "#4b453d";
  ctx.lineWidth = 3;
  ctx.strokeRect(rx + 1.5, ry + 1.5, w - rx + 4, h - ry + 4);
}

export function buildGridSettings() {
  var prefs = getGridPrefs();
  var root = node("div", "grid-settings");
  var intro = node("div", "touch-settings-intro");
  intro.innerHTML = '<i class="ph ph-grid-four"></i><div><strong>' + t("grid_title") +
    "</strong><p>" + t("grid_intro") + "</p></div>";
  root.appendChild(intro);

  var cards = node("div", "grid-style-grid");
  cards.setAttribute("role", "radiogroup");
  cards.setAttribute("aria-label", t("grid_title"));
  var swatches = [];
  GRID_STYLES.forEach(function (style) {
    var card = node("label", "grid-style-card" + (prefs.style === style ? " active" : ""));
    var input = node("input");
    input.type = "radio";
    input.name = "plan-grid-style";
    input.value = style;
    input.checked = prefs.style === style;
    card.appendChild(input);
    var canvas = node("canvas", "grid-style-swatch");
    canvas.setAttribute("aria-hidden", "true");
    card.appendChild(canvas);
    swatches.push({ canvas: canvas, style: style });
    var copy = node("span", "grid-style-copy");
    copy.appendChild(node("strong", null, t("grid_style_" + style)));
    copy.appendChild(node("small", null, t("grid_style_" + style + "_d")));
    card.appendChild(copy);
    input.onchange = function () {
      prefs = setGridPrefs({ style: style });
      sync();
    };
    cards.appendChild(card);
  });
  root.appendChild(cards);

  var row = node("div", "grid-opacity-row");
  var lab = node("label", null, t("grid_opacity"));
  var range = node("input");
  range.type = "range";
  range.min = "10";
  range.max = "100";
  range.step = "5";
  range.id = "gridOpacityRange";
  lab.htmlFor = range.id;
  var out = node("output", "grid-opacity-value");
  out.htmlFor = range.id;
  var reset = node("button", "grid-reset", t("grid_reset"));
  reset.type = "button";
  range.oninput = function () {
    prefs = setGridPrefs({ opacity: Number(range.value) / 100 });
    sync();
  };
  reset.onclick = function () {
    prefs = setGridPrefs(DEFAULT_GRID);
    sync();
  };
  row.appendChild(lab);
  row.appendChild(range);
  row.appendChild(out);
  row.appendChild(reset);
  root.appendChild(row);

  function sync() {
    cards.querySelectorAll(".grid-style-card").forEach(function (card) {
      var input = card.querySelector("input");
      input.checked = input.value === prefs.style;
      card.classList.toggle("active", input.checked);
    });
    range.value = String(Math.round(prefs.opacity * 100));
    out.textContent = Math.round(prefs.opacity * 100) + "%";
    range.disabled = prefs.style === "none";
    row.classList.toggle("is-off", prefs.style === "none");
    swatches.forEach(function (s) { drawSwatch(s.canvas, s.style, prefs.opacity); });
  }
  sync();
  /* The swatches have no size until the pane is shown (it is built hidden),
     and change size with the dialog: redraw whenever they are laid out. */
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(function () {
      swatches.forEach(function (s) { drawSwatch(s.canvas, s.style, prefs.opacity); });
    }).observe(cards);
  }
  return root;
}
