/* The technical plan's wall fills and wall ink (js/wall_ink.js decides which
   lines are drawn). The structure band fills every wall first and inks them
   after, so a neighbour's fill can never cover a line (drawWall in
   ./overlays.js, passes "fill" and "ink"). It shares the editor's state through
   live imports from ../plan2d.js. */
import { wallOutline } from "../geometry.js";
import { sx, sz } from "../plan_view.js";
import { wallInkAll, wallInkPass } from "../wall_ink.js";
import { S } from "../state.js";
import { pc } from "../plan2d.js";
import { wallBandPolygon } from "./walls.js";
import { drawWall } from "./overlays.js";

const DEMOLITION_FILL = "rgba(194,76,67,.25)";
const LAYER_INK = "rgba(80,73,64,.35)";
const WALL_INK = "#635b50";
const DEMOLITION_INK = "#b43d35";

function tracePoly(pts) {
  pc.beginPath();
  pts.forEach(function (p, i) {
    if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z));
  });
  pc.closePath();
}

/* Each layer band filled to its colour, with no outline of its own. An opaque
   fill is also traced with a hairline in its own colour, which closes the
   antialiased seam two equal fills would otherwise show along a hidden joint
   (a wrap corner's diagonal). A translucent fill is not: the doubled edge
   would read as a line. */
function fillWallBands(w, bands, demolish, col) {
  bands.forEach(function (band) {
    var out = wallBandPolygon(w, band.start, band.end), fill = demolish ? DEMOLITION_FILL : (band.color || col);
    if (!out || out.length < 3) return;
    pc.fillStyle = fill;
    tracePoly(out);
    pc.fill();
    if (!demolish && opaque(fill)) {
      pc.strokeStyle = fill;
      pc.lineWidth = 0.75;
      pc.stroke();
    }
  });
}
function opaque(c) {
  return typeof c === "string" && (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) || /^rgb\(/i.test(c));
}

/* The plan's walls: every fill first, then every wall's ink, so no fill
   covers a neighbour's line. `pool` holds the walls a wall may merge its ink
   with (the ones on screen). */
function drawPlanWalls(walls, pool) {
  var inks = wallInkAll(walls, { pool: pool });
  walls.forEach(function (w) { drawWall(w, "fill"); });
  walls.forEach(function (w) { drawWall(w, "ink", inks.get(w)); });
}

/* Ink only the walls drawWall actually strokes, after its normalization,
   retaining the HUD's fill/ink order and the full default neighbour pool. */
function drawHUDWalls(walls, hidden) {
  let pass;
  function inkFor(w) {
    if (!pass) pass = wallInkPass();
    return pass(w);
  }
  for (const w of walls) {
    if (S.walls.indexOf(w) !== -1 && !hidden[w.id]) drawWall(w, undefined, inkFor);
  }
}

/* A wall's lines: the layer boundaries along it, then the perimeter segments
   the ink rule keeps — or, for a selected / erase-hovered wall, its whole
   closed outline in `markColour` (selection chrome keeps the full shape). */
function inkWall(w, ink, bands, demolish, markColour) {
  if (typeof ink === "function") ink = ink(w);
  ink = ink || wallInkAll([w]).get(w);
  if (!ink) return;
  pc.save();
  pc.strokeStyle = LAYER_INK;
  pc.lineWidth = 0.65;
  if (ink.arc) {
    // curved walls are drawn as before: every band closed
    bands.forEach(function (band) {
      var poly = wallBandPolygon(w, band.start, band.end);
      if (poly && poly.length > 2) { tracePoly(poly); pc.stroke(); }
    });
  } else {
    pc.beginPath();
    ink.layers.forEach(function (s) {
      pc.moveTo(sx(s[0].x), sz(s[0].z));
      pc.lineTo(sx(s[1].x), sz(s[1].z));
    });
    pc.stroke();
  }
  pc.strokeStyle = markColour || (demolish ? DEMOLITION_INK : WALL_INK);
  pc.lineWidth = markColour ? 2.3 : 1.1;
  if (demolish) pc.setLineDash([8, 5]);
  if (markColour || ink.arc) {
    var outline = ink.outline || wallOutline(w);
    if (outline && outline.length > 2) { tracePoly(outline); pc.stroke(); }
  } else {
    // square caps close the corner where one wall's line meets the next one's
    pc.lineCap = "square";
    pc.lineJoin = "miter";
    pc.beginPath();
    ink.paths.forEach(function (path) {
      path.pts.forEach(function (p, i) {
        if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z));
      });
      if (path.closed) pc.closePath();
    });
    pc.stroke();
  }
  pc.restore();
}

export { drawHUDWalls, drawPlanWalls, fillWallBands, inkWall };
