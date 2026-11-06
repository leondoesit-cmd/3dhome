/* Cabinet planning (planCab) and the section/door/family labels, split out of
   js/cabinet.js. It shares the editor's state through live imports from
   ../cabinet.js. */
import { layoutCab } from "../cabinet/layout.js";
import { cabinetDoorSwings } from "../cabinet/pricing.js";
import {
  CARCASS, COLKIND, DOORS, FAM, FINISH, FRONTS, HW, SEC, cabRun, cornerPoly,
  he, isCorner, isFloat, planMemo,
} from "../cabinet.js";

export function planCab(it) {
  var key = null;
  if (planMemo) {
    // the run is part of what the symbol depends on: dragging a unit against its
    // neighbour changes where the plinth returns and the worktop go
    key = it.w + "|" + it.h + "|" + it.d + "|" + cabRun(it).key + "|" + JSON.stringify(it.cab);
    var hit = planMemo.get(it);
    if (hit && hit.key === key) return hit.val;
  }
  var val = planCabFresh(it);
  if (planMemo) planMemo.set(it, { key: key, val: val });
  return val;
}
function planCabFresh(it) {
  var L = layoutCab(it);
  return {
    w: L.w, d: L.d, t: L.t, zc: L.zc, zb: L.zb, sliding: L.sliding, float: isFloat(L.sp) ? 1 : 0,
    // a corner unit is not a rectangle, so the plan draws its footprint instead
    poly: isCorner(L.sp) ? cornerPoly(L.sp, L.w, L.d) : null,
    cornerFront: L.cornerFront || 0,
    swings: cabinetDoorSwings(it,L),
    cols: L.cols.map(function (c) {
      var dr = c.ref.door || { t: "none" };
      return {
        x0: c.x0, x1: c.x1, kind: c.kind || "normal",
        door: dr.t, leaves: c.doorLeaves || 0, hinge: dr.hinge || "R",
        drawers: c.secs.some(function (s) { return !!s.drawers; }),
      };
    }),
  };
}

export function secLabel(t) {
  var s = SEC[t] || SEC.shelves;
  return he(s.he, s.en);
}
export function doorLabel(t) {
  var d = DOORS[t] || DOORS.none;
  return he(d.he, d.en);
}
export function famLabel(f) {
  var x = FAM[f] || FAM.wardrobe;
  return he(x.he, x.en);
}
// short form, for the type chips where the full name does not fit
export function famShort(f) {
  var x = FAM[f] || FAM.wardrobe;
  return he(x.sHe || x.he, x.sEn || x.en);
}
export function presetLabel(p) {
  return he(p.he, p.en);
}
export function presetNote(p) {
  return he(p.note[0], p.note[1]);
}
export function hwLabel(group, id) {
  var x = HW[group] && HW[group][id];
  return x ? he(x.he, x.en) : id;
}
export function frontLabel(id) {
  var x = FRONTS[id] || FRONTS.flat;
  return he(x.he, x.en);
}
export function finishLabel(id) {
  var x = FINISH[id] || FINISH.auto;
  return he(x.he, x.en);
}
export function kindLabel(id) {
  var x = COLKIND[id] || COLKIND.normal;
  return he(x.he, x.en);
}
export function carcassLabel(id) {
  var x = CARCASS[id] || CARCASS.full;
  return he(x.he, x.en);
}
export function roleLabelHe(role) {
  var R = {
    plinth: ["סוקל", "Plinth"], side: ["דופן", "Side"], bottom: ["תחתית", "Bottom"],
    top: ["גג", "Top"], back: ["גב", "Back"], worktop: ["משטח עבודה", "Worktop"],
    divider: ["מחיצה", "Divider"], fixedShelf: ["מדף קבוע", "Fixed shelf"],
    shelf: ["מדף", "Shelf"], door: ["דלת", "Door"], doorPanel: ["פנל דלת", "Door panel"],
    batten: ["סרגל", "Batten"], glazing: ["זיגוג", "Glazing"], filler: ["פנל מילוי", "Filler"],
    drawerFront: ["חזית מגירה", "Drawer front"], drawerBox: ["דופן מגירה", "Drawer box"],
    drawerBottom: ["תחתית מגירה", "Drawer bottom"],
    tvPanel: ["לוח תלייה לטלוויזיה", "TV mounting board"],
  };
  var x = R[role];
  return x ? he(x[0], x[1]) : role;
}

/* A short human summary — used in the tree and the designer header
   ("3 עמודות · 6 דלתות · 9 מגירות · 12 מדפים"). */
export function cabSummary(it) {
  var L = layoutCab(it),
    dcount = 0,
    dr = 0,
    sh = 0,
    rails = 0;
  L.cols.forEach(function (c) {
    dcount += c.doorLeaves || 0;
    c.secs.forEach(function (s) {
      if (s.drawers) dr += s.drawers.length;
      if (s.shelves) sh += s.shelves;
      if (s.rails) rails += s.rails;
    });
  });
  var p = [];
  p.push(L.cols.length + " " + he("עמודות", "columns"));
  if (dcount) p.push(dcount + " " + he("דלתות", "doors"));
  if (dr) p.push(dr + " " + he("מגירות", "drawers"));
  if (sh) p.push(sh + " " + he("מדפים", "shelves"));
  if (rails) p.push(rails + " " + he("מוטות", "rails"));
  return p.join(" · ");
}
