/* The 2D plan's background grid: the styles offered in Settings → Grid, the
   saved choice, and the spacing / colour maths and painting behind them.
   plan2d.js calls paintGrid(); js/plan_grid_ui.js builds the picker. Nothing
   here touches the DOM except through the canvas context and storage passed
   in, so Node tests the maths directly.

   The default ("soft") replaced one fixed net of 1px beige lines every 50 cm,
   which on the dark themes read as a bright mesh over the whole drawing. It
   draws faint minor lines that fade in with zoom under firmer round-metre
   lines, tinted for the canvas it sits on. Snapping (F9) is unaffected: it
   never read the drawn grid. */

export var GRID_STYLES = ["soft", "lines", "dots", "crosses", "blueprint", "none"];
export var DEFAULT_GRID = { style: "soft", opacity: 0.6 };
var KEY = "home3d_plan_grid";

export function normalizeGridPrefs(raw) {
  var p = raw && typeof raw === "object" ? raw : {};
  var opacity = Number(p.opacity);
  return {
    style: GRID_STYLES.indexOf(p.style) >= 0 ? p.style : DEFAULT_GRID.style,
    opacity: isFinite(opacity) && p.opacity !== null && p.opacity !== "" ? Math.max(0.1, Math.min(1, opacity)) : DEFAULT_GRID.opacity,
  };
}

function store(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (_) { return null; }
}

var cached = null;
var listeners = [];

export function getGridPrefs(storage) {
  if (cached && !storage) return cached;
  var raw = null, s = store(storage);
  try { raw = s ? JSON.parse(s.getItem(KEY) || "null") : null; } catch (_) { raw = null; }
  var prefs = normalizeGridPrefs(raw);
  if (!storage) cached = prefs;
  return prefs;
}

export function setGridPrefs(next, storage) {
  var prefs = normalizeGridPrefs(Object.assign({}, getGridPrefs(storage), next || {}));
  var s = store(storage);
  try { if (s) s.setItem(KEY, JSON.stringify(prefs)); } catch (_) {}
  if (!storage) cached = prefs;
  listeners.slice().forEach(function (fn) { try { fn(prefs); } catch (_) {} });
  return prefs;
}

/* Another tab changed the grid: drop the cache and repaint. A stale cache
   was also MERGED into this tab's next change, so moving the opacity here put
   back the style the other tab had just replaced. */
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY && e.key !== null) return;
    cached = null;
    var prefs = getGridPrefs();
    listeners.slice().forEach(function (fn) { try { fn(prefs); } catch (_) {} });
  });
}

/** Called with the new prefs after every change (the plan repaints). */
export function onGridChange(fn) {
  listeners.push(fn);
  return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
}

/* Spacing for a zoom of `sc` screen px per cm. Majors are round lengths
   (1, 5, 10, 50, 100 m) at least 56px apart; minors split a major into 10, 5
   or 2 at least 9px apart and fade in over their next 12px, so zooming never
   pops a dense net on or off. */
var MAJORS = [100, 500, 1000, 5000, 10000];
export function gridSteps(sc) {
  var s = Number(sc) > 0 && isFinite(sc) ? Number(sc) : 1;
  var major = MAJORS[MAJORS.length - 1];
  for (var i = 0; i < MAJORS.length; i++) if (MAJORS[i] * s >= 56) { major = MAJORS[i]; break; }
  var divs = [10, 5, 2];
  for (var j = 0; j < divs.length; j++) {
    var px = (major / divs[j]) * s;
    if (px >= 9) return { major: major, minor: major / divs[j], minorFade: Math.min(1, (px - 9) / 12) };
  }
  return { major: major, minor: null, minorFade: 0 };
}

/* Is a CSS colour (#rgb, #rrggbb, rgb()/rgba()) dark? Unknown → dark, the
   default theme. */
export function isDarkColor(str) {
  var c = String(str || "").trim(), r, g, b, m;
  if ((m = c.match(/^#([0-9a-f]{3})$/i))) {
    r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16);
  } else if ((m = c.match(/^#([0-9a-f]{6})/i))) {
    r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16);
  } else if ((m = c.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i))) {
    r = +m[1]; g = +m[2]; b = +m[3];
  } else return true;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/* The plan canvas's tone, which the theme paints (--bg-canvas-2d): read
   once per theme and body layout rather than on every frame. */
var tone = { key: null, dark: true };
export function canvasToneIsDark(el) {
  if (typeof document === "undefined" || !el) return true;
  var key = (document.documentElement.getAttribute("data-theme") || "") + "|" + document.body.className;
  if (tone.key !== key) {
    tone.key = key;
    tone.dark = isDarkColor(getComputedStyle(el).getPropertyValue("--bg-canvas-2d"));
  }
  return tone.dark;
}

/* Colours per style at a given opacity (0.1-1) on a dark or light canvas.
   Alphas are the style's full strength; the default 0.6 is the calm one. */
var STRENGTH = {
  soft: { minor: 0.16, major: 0.34 },
  lines: { minor: 0, major: 0.5 },
  dots: { minor: 0.5, major: 0.85 },
  crosses: { minor: 0.32, major: 0.8 },
  blueprint: { minor: 0.24, major: 0.55 },
};
export function gridPalette(style, dark, opacity) {
  var k = STRENGTH[style] || STRENGTH.soft, o = normalizeGridPrefs({ style: "soft", opacity: opacity }).opacity;
  var ink = style === "blueprint" ? (dark ? "96,165,250" : "37,99,235")
    : style === "lines" ? (dark ? "228,220,201" : "120,110,95")
      : dark ? "226,232,240" : "30,41,59";
  var a = function (v) { return "rgba(" + ink + "," + Math.round(v * o * 1000) / 1000 + ")"; };
  return { minor: a(k.minor), major: a(k.major) };
}

function on(v, step) { return Math.abs(v / step - Math.round(v / step)) < 1e-6; }
function crisp(px) { return Math.round(px) + 0.5; }

/* Paint the chosen grid. o = { ext: {bxmin,bxmax,bymin,bymax} screen box in
   the plan's base frame, sc, ox, oy: the view transform, dark, prefs }. */
export function paintGrid(ctx, o) {
  var prefs = normalizeGridPrefs(o.prefs), style = prefs.style;
  if (style === "none" || !ctx) return;
  var sc = o.sc, ox = o.ox, oy = o.oy, ext = o.ext;
  if (!(sc > 0) || !isFinite(sc) || !isFinite(ox) || !isFinite(oy)) return;
  var x0 = (ext.bxmin - ox) / sc, x1 = (ext.bxmax - ox) / sc,
    z0 = (ext.bymin - oy) / sc, z1 = (ext.bymax - oy) / sc;
  var st = gridSteps(sc), pal = gridPalette(style, o.dark, prefs.opacity);
  var X = function (x) { return ox + x * sc; }, Z = function (z) { return oy + z * sc; };
  var span = Math.max(x1 - x0, z1 - z0);
  var minor = st.minor && span / st.minor <= 400 ? st.minor : null;
  ctx.save();
  if (style === "soft" || style === "blueprint") {
    if (minor && st.minorFade > 0) {
      ctx.globalAlpha = st.minorFade;
      strokeLines(ctx, minor, st.major, x0, x1, z0, z1, ext, X, Z, pal.minor);
      ctx.globalAlpha = 1;
    }
    strokeLines(ctx, st.major, null, x0, x1, z0, z1, ext, X, Z, pal.major);
  } else if (style === "lines") {
    // the original even net (plan2d.js draws it in the plan; this is the swatch)
    var even = sc < 0.45 ? 100 : 50;
    if (span / even > 240) even = Math.ceil(span / 240 / 100) * 100;
    strokeLines(ctx, even, null, x0, x1, z0, z1, ext, X, Z, pal.major);
  } else if (style === "dots") {
    // a dot per minor crossing only while they are 14px apart: a painted
    // rectangle each, and the plan repaints on every pan frame
    var step = minor && minor * sc >= 14 ? minor : st.major;
    dots(ctx, step, st.major, x0, x1, z0, z1, X, Z, pal, step === minor ? st.minorFade : 1);
  } else if (style === "crosses") {
    if (minor && minor * sc >= 18) dots(ctx, minor, st.major, x0, x1, z0, z1, X, Z, { minor: pal.minor, major: "transparent" }, st.minorFade);
    crosses(ctx, st.major, x0, x1, z0, z1, X, Z, pal.major);
  }
  ctx.restore();
}

function strokeLines(ctx, step, skip, x0, x1, z0, z1, ext, X, Z, color) {
  ctx.beginPath();
  for (var gx = Math.floor(x0 / step) * step; gx <= x1; gx += step) {
    if (skip && on(gx, skip)) continue;
    var px = crisp(X(gx));
    ctx.moveTo(px, ext.bymin); ctx.lineTo(px, ext.bymax);
  }
  for (var gz = Math.floor(z0 / step) * step; gz <= z1; gz += step) {
    if (skip && on(gz, skip)) continue;
    var py = crisp(Z(gz));
    ctx.moveTo(ext.bxmin, py); ctx.lineTo(ext.bxmax, py);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function dots(ctx, step, major, x0, x1, z0, z1, X, Z, pal, fade) {
  for (var gx = Math.floor(x0 / step) * step; gx <= x1; gx += step) {
    var mx = on(gx, major), px = Math.round(X(gx));
    for (var gz = Math.floor(z0 / step) * step; gz <= z1; gz += step) {
      var big = mx && on(gz, major), r = big ? 1.5 : 1;
      ctx.globalAlpha = big ? 1 : fade;
      ctx.fillStyle = big ? pal.major : pal.minor;
      ctx.fillRect(px - r, Math.round(Z(gz)) - r, r * 2, r * 2);
    }
  }
  ctx.globalAlpha = 1;
}

function crosses(ctx, step, x0, x1, z0, z1, X, Z, color) {
  var arm = 5;
  ctx.beginPath();
  for (var gx = Math.floor(x0 / step) * step; gx <= x1; gx += step) {
    var px = crisp(X(gx));
    for (var gz = Math.floor(z0 / step) * step; gz <= z1; gz += step) {
      var py = crisp(Z(gz));
      ctx.moveTo(px - arm, py); ctx.lineTo(px + arm, py);
      ctx.moveTo(px, py - arm); ctx.lineTo(px, py + arm);
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
}
