/* Drawing sheet centre marks, axis centrelines, section/detail markers,
   balloons and notes, split out of js/cad_sheet.js. It shares the editor's
   state through live imports from ../cad_sheet.js. */
import { arrowHead } from "../cad_sheet/dims.js";
import { balloonRadius } from "../core/balloon_layout.js";
import {
  LINE_STYLES, TEXT_SIZES, circle, line, num, poly, text,
} from "../cad_sheet.js";

function centreMark(round, toSheet, k, viewId) {
  const centre = toSheet(round);
  const radius = round.radius * k, reach = Math.min(Math.max(radius + 2.5, 3), radius + 5);
  return [
    line(centre.x - reach, centre.y, centre.x + reach, centre.y, "center", { viewId }),
    line(centre.x, centre.y - reach, centre.x, centre.y + reach, "center", { viewId }),
  ];
}

/* A cylinder seen from the side is two rims sharing one axis. Drawing a stub
   through each rim leaves two chain lines sticking out of the body at both
   ends; a machinist expects ONE axis, running the length of the feature and a
   few millimetres past it. So co-axial rims are merged before anything is
   inked. */
function axisCentrelines(circles, toSheet, k, viewId, showHidden = false) {
  const groups = new Map();
  for (const round of circles) {
    // Hidden hole rims still define the side-view axis when hidden geometry
    // is displayed. Hide their axis together with that geometry otherwise.
    if (round.kind !== "edge" || (!round.visible && !showHidden)) continue;
    let du = round.axis.u, dv = -round.axis.v;
    const length = Math.hypot(du, dv);
    if (!(length > 1e-6)) continue;
    du /= length; dv /= length;
    if (du < -1e-9 || (Math.abs(du) < 1e-9 && dv < 0)) { du = -du; dv = -dv; }
    const centre = toSheet(round);
    const offset = du * centre.y - dv * centre.x;             // distance to the axis line
    const key = Math.round(Math.atan2(dv, du) / 0.02) + ":" + Math.round(offset / 0.5);
    const along = centre.x * du + centre.y * dv;
    const group = groups.get(key);
    const reach = round.radius * k;
    if (group) {
      group.min = Math.min(group.min, along);
      group.max = Math.max(group.max, along);
      group.reach = Math.max(group.reach, reach);
    } else groups.set(key, { du, dv, centre, min: along, max: along, reach });
  }
  const items = [];
  groups.forEach((group) => {
    const base = group.centre;
    const anchor = base.x * group.du + base.y * group.dv;
    const overshoot = Math.min(group.reach + 3, 12);
    const at = (t) => ({
      x: base.x + group.du * (t - anchor),
      y: base.y + group.dv * (t - anchor),
    });
    const a = at(group.min - overshoot), b = at(group.max + overshoot);
    items.push(line(a.x, a.y, b.x, b.y, "center", { viewId }));
  });
  return items;
}

function sectionMarker(view, placements, doc) {
  const parent = placements.find((place) => place.id === view.parent);
  if (!parent) return [];
  const tag = view.section.tag || "A";
  const items = [];
  const box = parent.box;
  const vertical = view.section.axis === "vertical";
  const at = num(view.section.at, 0);
  const point = parent.toSheet(vertical ? { u: at, v: parent.centre.v } : { u: parent.centre.u, v: at });
  const reach = 6;
  if (vertical) {
    items.push(line(point.x, box.y - reach, point.x, box.y + box.h + reach, "cutline", { viewId: parent.id }));
    for (const y of [box.y - reach, box.y + box.h + reach]) {
      const towards = view.section.flip ? -1 : 1;
      items.push(arrowHead(point.x + towards * 7, y, towards, 0));
      items.push(line(point.x, y, point.x + towards * 7, y, "cutline"));
      items.push(text(point.x - towards * 3, y - 1, tag, { size: TEXT_SIZES.view, anchor: "middle", weight: "bold" }));
    }
  } else {
    items.push(line(box.x - reach, point.y, box.x + box.w + reach, point.y, "cutline", { viewId: parent.id }));
    for (const x of [box.x - reach, box.x + box.w + reach]) {
      const towards = view.section.flip ? 1 : -1;
      items.push(arrowHead(x, point.y + towards * 7, 0, towards));
      items.push(line(x, point.y, x, point.y + towards * 7, "cutline"));
      items.push(text(x, point.y - towards * 3, tag, { size: TEXT_SIZES.view, anchor: "middle", weight: "bold" }));
    }
  }
  void doc;
  return items;
}

function detailMarker(view, placements) {
  const parent = placements.find((place) => place.id === view.parent);
  if (!parent) return [];
  const centre = parent.toSheet({ u: num(view.detail.u), v: num(view.detail.v) });
  const radius = num(view.detail.radius, 5) * parent.k;
  return [
    circle(centre.x, centre.y, radius, "detail", { viewId: parent.id }),
    text(centre.x, centre.y - radius - 2, view.detail.tag || "A", { size: TEXT_SIZES.view, anchor: "middle", weight: "bold" }),
  ];
}

/* A balloon is a circled BOM item number, with a leader dot on its component.
   Automatic offsets are distributed by the shared scene layout above; manually
   placed balloons retain the offsets authored in the sheet. */
function balloonItems(note, byId) {
  const place = note.leader ? byId.get(note.leader.viewId) : null;
  if (!place) return [];
  const target = place.toSheet(note.leader);
  const cx = target.x + num(note.dx, 14), cy = target.y + num(note.dy, -12), radius = balloonRadius(note.text,TEXT_SIZES.dim);
  const dx = target.x - cx, dy = target.y - cy, distance = Math.hypot(dx, dy) || 1;
  const edge = { x: cx + dx / distance * radius, y: cy + dy / distance * radius };
  const dot = [];
  const metadata = { noteId: note.id, viewId: place.id, balloon: true };
  for (let i = 0; i < 8; i++) dot.push({ x: target.x + Math.cos(i * Math.PI / 4) * 0.9, y: target.y + Math.sin(i * Math.PI / 4) * 0.9 });
  return [
    line(edge.x, edge.y, target.x, target.y, "dim", metadata),
    poly(dot, "fill", { fill: LINE_STYLES.dim.color, closed: true, ...metadata }),
    circle(cx, cy, radius, "dim", metadata),
    text(cx, cy + 1.3, note.text, { size: TEXT_SIZES.dim, anchor: "middle", ...metadata, weight: "bold", color: LINE_STYLES.dim.color }),
  ];
}

function noteItems(note, byId, doc, options = {}) {
  if (note.balloon) return balloonItems(note, byId);
  const items = [];
  const x = num(note.x), y = num(note.y);
  /* A callout whose hole is gone reads as the LAST thing that hole was called,
     bracketed and flagged — the same contract a dangling dimension keeps. */
  const style = options.dangling ? "dimLost" : "dim";
  const body = options.dangling ? "⚠ (" + String(note.text || "") + ")" : String(note.text || "");
  const lines = body.split(/\r\n?|\n/);
  const size = Number(note.size)>0 ? Number(note.size) : TEXT_SIZES.dim;
  lines.forEach((row, index) => {
    items.push(text(x, y + index * (size * 1.35), row, {
      size, anchor: "start", noteId: note.id,
      color: LINE_STYLES[style].color,
    }));
  });
  if (note.leader) {
    const place = byId.get(note.leader.viewId);
    if (place) {
      const target = place.toSheet(note.leader);
      const elbow = { x: x - 3, y: y + 1 };
      if (note.leader.rimRadius > 0) {
        const rim = place.toSheet({ u: note.leader.u + note.leader.rimRadius, v: note.leader.v });
        const radius = Math.hypot(rim.x - target.x, rim.y - target.y);
        const dx = elbow.x - target.x, dy = elbow.y - target.y, distance = Math.hypot(dx, dy);
        if (distance > radius) {
          target.x += dx * radius / distance;
          target.y += dy * radius / distance;
        }
      }
      items.push(line(elbow.x, elbow.y, x + 1, elbow.y, style, { noteId: note.id }));
      items.push(line(target.x, target.y, elbow.x, elbow.y, style, { noteId: note.id }));
      items.push(arrowHead(target.x, target.y, target.x - elbow.x, target.y - elbow.y));
    }
  }
  void doc;
  return items;
}

export { axisCentrelines, centreMark, detailMarker, noteItems, sectionMarker };
