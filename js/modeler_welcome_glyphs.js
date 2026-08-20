// Purpose-built isometric marks for the modeler start gallery and guide hub.
// Phosphor is too generic here (a cube for both "blank part" and "box", a
// screwdriver for a screw, and ph-cubes-three is missing from the vendored
// font — which left the assembly tile blank). Each art key is a silhouette
// of the actual starting point.

function pt(x, y) {
  return Number(x).toFixed(1) + "," + Number(y).toFixed(1);
}
function polar(cx, cy, r, deg) {
  var a = deg * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function path(pts, op, extra) {
  return '<path d="M' + pts.map(function (p) { return pt(p[0], p[1]); }).join("L") + 'Z" fill="currentColor" fill-opacity="' + (op == null ? 0 : op) + '" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"' + (extra || "") + "/>";
}
function line(d, sw, extra) {
  return '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.3) + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || "") + "/>";
}
function cube(cx, cy, hw, hd, h, mode) {
  var n = [cx, cy], e = [cx + hw, cy + hd], s = [cx, cy + hd * 2], w = [cx - hw, cy + hd];
  var ed = [e[0], e[1] + h], sd = [s[0], s[1] + h], wd = [w[0], w[1] + h];
  var dash = mode === "dash" ? ' stroke-dasharray="2.6 2.1"' : "";
  var wire = mode === "wire" || mode === "dash";
  return path([w, s, sd, wd], wire ? 0 : 0.22, dash) +
    path([e, s, sd, ed], wire ? 0 : 0.4, dash) +
    path([n, e, s, w], wire ? 0.08 : 0.58, dash);
}
function dim(x1, y1, x2, y2) {
  var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  var ux = dx / len, uy = dy / len, px = -uy * 3, py = ux * 3;
  return line(
    "M" + pt(x1 + px, y1 + py) + "L" + pt(x1 - px, y1 - py) +
    "M" + pt(x2 + px, y2 + py) + "L" + pt(x2 - px, y2 - py) +
    "M" + pt(x1, y1) + "L" + pt(x2, y2),
    1.15,
    ' opacity=".9"'
  );
}
function cylinder(cx, top, rx, ry, h) {
  var bot = top + h;
  return '<ellipse cx="' + cx + '" cy="' + bot + '" rx="' + rx + '" ry="' + ry + '" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.35"/>' +
    '<path d="M' + pt(cx - rx, top) + "L" + pt(cx - rx, bot) + "A" + rx + "," + ry + " 0 0 0 " + pt(cx + rx, bot) + "L" + pt(cx + rx, top) + '" fill="currentColor" fill-opacity=".32" stroke="currentColor" stroke-width="1.35"/>' +
    '<ellipse cx="' + cx + '" cy="' + top + '" rx="' + rx + '" ry="' + ry + '" fill="currentColor" fill-opacity=".55" stroke="currentColor" stroke-width="1.35"/>';
}
function sphere(cx, cy, r) {
  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.4"/>' +
    '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + r + '" ry="' + (r * 0.38).toFixed(1) + '" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".9"/>' +
    '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (r * 0.38).toFixed(1) + '" ry="' + r + '" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".9"/>' +
    '<ellipse cx="' + cx + '" cy="' + (cy - r * 0.42).toFixed(1) + '" rx="' + (r * 0.78).toFixed(1) + '" ry="' + (r * 0.22).toFixed(1) + '" fill="none" stroke="currentColor" stroke-width="1.05" opacity=".55"/>';
}
function gear(cx, cy, teeth, rTip, rRoot, rHole) {
  var d = "", i, step = 360 / teeth, a, p;
  function P(r, deg) {
    p = polar(cx, cy, r, deg);
    return pt(p[0], p[1]);
  }
  for (i = 0; i < teeth; i++) {
    a = i * step - 90;
    d += (i ? "L" : "M") + P(rRoot, a - step * 0.38);
    d += "L" + P(rTip, a - step * 0.16);
    d += "L" + P(rTip, a + step * 0.16);
    d += "L" + P(rRoot, a + step * 0.38);
  }
  return '<path d="' + d + 'Z" fill="currentColor" fill-opacity=".32" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + rHole + '" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + (rHole * 0.42).toFixed(1) + '" fill="currentColor" fill-opacity=".55"/>';
}

function hole(cx, cy, rx, ry) {
  return '<ellipse cx="' + (cx + 1.1).toFixed(1) + '" cy="' + (cy + 1.5).toFixed(1) + '" rx="' + rx + '" ry="' + ry + '" fill="rgba(0,0,0,.5)" stroke="currentColor" stroke-width="1.05"/>' +
    '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="rgba(0,0,0,.22)" stroke="currentColor" stroke-width="1.3"/>';
}
function stud(cx, cy, r) {
  return '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r + '" fill="currentColor" fill-opacity=".38" stroke="currentColor" stroke-width="1.25"/>' +
    '<ellipse cx="' + cx.toFixed(1) + '" cy="' + (cy - r * 0.2).toFixed(1) + '" rx="' + (r * 0.55).toFixed(1) + '" ry="' + (r * 0.28).toFixed(1) + '" fill="currentColor" fill-opacity=".2" stroke="none"/>';
}

var GLYPHS = {
  // Blank part: a 2D sketch becomes an extruded solid.
  blank: function () {
    return '<rect x="8" y="16" width="22" height="22" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-width="1.45"/>' +
      line("M34,27 L44,27 M40.5,23.5 L45.5,27 L40.5,30.5", 1.55) +
      cube(62, 10, 12, 6.8, 14);
  },
  // Blank assembly: two empty components waiting to be joined.
  assembly: function () {
    return cube(22, 14, 12, 7, 14, "wire") +
      cube(60, 10, 10, 5.6, 12, "wire") +
      line("M38,28 L50,22 M44,19 L44,31", 1.7);
  },
  box: function () {
    return cube(40, 6, 18, 10, 18) + dim(22, 50, 58, 50) + dim(64, 16, 64, 34);
  },
  cyl: function () {
    return cylinder(38, 8, 16, 7, 28) + dim(22, 50, 54, 50) + dim(60, 15, 60, 36);
  },
  sph: function () {
    return sphere(40, 24, 16.5) + dim(22, 50, 58, 50);
  },
  // Sketch basics: rectangle, circle, driving dimension, coincident vertex.
  sketch: function () {
    return '<rect x="8" y="8" width="34" height="22" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-width="1.45"/>' +
      '<circle cx="58" cy="28" r="13" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-width="1.45"/>' +
      dim(8, 40, 42, 40) +
      '<rect x="38" y="25" width="6" height="6" fill="currentColor" stroke="currentColor" stroke-width="1"/>' +
      '<circle cx="8" cy="8" r="1.8" fill="currentColor"/>' +
      '<circle cx="42" cy="8" r="1.8" fill="currentColor"/>' +
      '<circle cx="8" cy="30" r="1.8" fill="currentColor"/>' +
      '<circle cx="42" cy="30" r="1.8" fill="currentColor"/>';
  },
  // CAD cube project: one extruded box with three top-face bores — not dice pips.
  cube: function () {
    return cube(40, 6, 18, 10, 18) +
      hole(31, 16, 4.2, 2.35) +
      hole(40, 16, 4.2, 2.35) +
      hole(49, 16, 4.2, 2.35);
  },
  // Flower from spheres (petals) + a box stem.
  flower: function () {
    var html = cube(40, 40, 6.5, 3.6, 7), i, p;
    for (i = 0; i < 5; i++) {
      p = polar(40, 20, 11.5, -90 + i * 72);
      html += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="7.8" fill="currentColor" fill-opacity=".3" stroke="currentColor" stroke-width="1.3"/>';
    }
    return html +
      '<circle cx="40" cy="20" r="6.8" fill="currentColor" fill-opacity=".58" stroke="currentColor" stroke-width="1.4"/>' +
      '<ellipse cx="40" cy="20" rx="6.8" ry="2.4" fill="none" stroke="currentColor" stroke-width="1.05" opacity=".75"/>';
  },
  // Assembly tutorial: unlike solids joined by a mate (chain link, not a third body).
  mates: function () {
    return cube(16, 12, 11, 6.4, 14) +
      cylinder(66, 12, 9, 4, 22) +
      '<rect x="37" y="25" width="12" height="7" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
      '<rect x="39.5" y="22" width="7" height="13" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/>';
  },
  // Machine screw: hex head, unthreaded shank, thread, point.
  screw: function () {
    return path([[28, 5], [52, 5], [58, 14], [52, 23], [28, 23], [22, 14]], 0.42) +
      path([[32, 10], [48, 10], [51, 14], [48, 18], [32, 18], [29, 14]], 0.12) +
      path([[33, 23], [47, 23], [47, 29], [33, 29]], 0.26) +
      path([[31, 29], [49, 29], [49, 46], [40, 53], [31, 46]], 0.2) +
      line("M31,33 L49,36.5 M31,38 L49,41.5 M31,43 L49,46.5", 1.2);
  },
  gear: function () {
    return gear(40, 28, 10, 22, 15.5, 6.5);
  },
  // Sphere core with spherical studs sitting on the surface.
  studball: function () {
    var cx = 40, cy = 28, core = 13.5, bump = 5.2, html = "", i, p;
    var back = [-90, -25, 205], front = [25, 90, 155];
    for (i = 0; i < back.length; i++) {
      p = polar(cx, cy, core - 4, back[i]);
      html += stud(p[0], p[1], bump);
    }
    html += sphere(cx, cy, core);
    for (i = 0; i < front.length; i++) {
      p = polar(cx, cy, core - 4, front[i]);
      html += stud(p[0], p[1], bump);
    }
    return html;
  },
  // Dreidel: stem, body, point, revolve motion.
  dreidel: function () {
    return line("M12,22 A30,17 0 0 1 70,22", 1.4) +
      line("M65,16 L72,22 L65,27", 1.4) +
      path([[36, 4], [44, 4], [44, 13], [36, 13]], 0.45) +
      path([[24, 13], [56, 13], [56, 32], [24, 32]], 0.3) +
      path([[24, 32], [40, 52], [56, 32]], 0.36);
  },
  // Linear copies across the top, circular copies around the bottom.
  pattern: function () {
    var html = "", i, p;
    for (i = 0; i < 4; i++) html += cube(12 + i * 18.5, 2, 6, 3.4, 7, i ? "wire" : undefined);
    html += '<circle cx="40" cy="40" r="13.5" fill="none" stroke="currentColor" stroke-width="1.15" stroke-dasharray="2.6 2.1" opacity=".7"/>';
    for (i = 0; i < 6; i++) {
      p = polar(40, 40, 13.5, -90 + i * 60);
      html += cube(p[0], p[1] - 3.6, 3.6, 2.05, 4.6, i ? "wire" : undefined);
    }
    return html;
  },
};

export function welcomeGlyph(kind) {
  var make = GLYPHS[kind] || GLYPHS.blank;
  return '<svg class="md-cad-glyph" viewBox="0 0 80 56" fill="none" aria-hidden="true">' + make() + "</svg>";
}

export var WELCOME_GLYPH_KEYS = Object.keys(GLYPHS);
