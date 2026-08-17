// Cabinet designer inspector panes: composition, technical, finishes, hardware, checks, BOM and presets.

import { S } from "./state.js";
import {
  STD, FAM, SEC, DOORS, HW, PRESETS, makeSpec, normalizeSpec, makeBlankSpec, layoutCab, columnFill,
  cutList, hardwareList, cabPrice, bandMeters, famOf, secLabel, doorLabel, famLabel, presetLabel, presetNote, hwLabel,
  famShort, FRONTS, FINISH, COLKIND, CARCASS, frontLabel, finishLabel, kindLabel, carcassLabel,
  checkCab, presetById, roleLabelHe, secFit, doorFit, kindFit, carcassFit, frontFit, fitCtx,
  secRelevant, doorRelevant,
} from "./cabinet.js";
import { ceilingHeight } from "./elevation.js";
import { BANDING, PROFILES, sheetsFor, sheetById, sheetPrice, bandById, bandPPM, profilePPM, sheetLabel, bandLabel, profileLabel } from "./stock.js";
import { cabinetPresets, saveCabinetPreset, deleteCabinetPreset } from "./cabinet_presets.js";
import { api, E, T, isEn, el, btn, sp, row, numInput, select, checkbox, formatCm } from "./ui_cabinet_ctx.js";

export function matches(str) {
  return !E.q || String(str || "").toLowerCase().indexOf(E.q) >= 0;
}

/* The search covers the catalogue on the left AND the things that are normally
   buried in the inspector: type "safe" and the compartment type comes to you
   as a button that applies itself to whatever is selected. */
export function fillHits() {
  var box = E.host.querySelector("#cbActs");
  box.innerHTML = "";
  if (!E.q || !sp() || !E.sel) return;
  var L = layoutCab(E.it),
    col = L.cols[E.sel.col] || L.cols[0],
    fc = fitCtx(L, col),
    n = 0;
  Object.keys(SEC).forEach(function (k) {
    if (!matches(secLabel(k)) || n > 7) return;
    var fit = secFit(k, fc.w, fc.colH, fc.d),
      b = btn('<i class="ph ' + SEC[k].icon + '"></i><span>' + secLabel(k) + "</span>", function () {
        applySecType(k);
      }, "cb-hit" + (fit.ok ? "" : " cb-off"));
    b.disabled = !fit.ok || E.sel.sec == null;
    b.title = fit.ok ? T("section") + " · " + secLabel(k) : fit.why;
    box.appendChild(b);
    n++;
  });
  Object.keys(DOORS).forEach(function (k) {
    if (!matches(doorLabel(k)) || n > 11) return;
    var fit = doorFit(k, fc),
      b = btn('<i class="ph ph-door"></i><span>' + doorLabel(k) + "</span>", function () {
        var c = sp().cols[E.sel.col];
        c.door = c.door || {};
        c.door.t = k;
        api.touch();
        api.changed();
      }, "cb-hit" + (fit.ok ? "" : " cb-off"));
    b.disabled = !fit.ok;
    b.title = fit.ok ? T("door") + " · " + doorLabel(k) : fit.why;
    box.appendChild(b);
    n++;
  });
}

export function applySecType(k) {
  var col = sp().cols[E.sel.col],
    s = col && col.secs[E.sel.sec];
  if (!s) return;
  var m = SEC[k];
  s.t = k;
  delete s.n;
  delete s.heights;
  delete s.space;
  if (s.h < m.min) s.h = Math.max(s.h, Math.min(m.min, m.def));
  api.touch();
  api.changed();
}

export function applySearch() {
  fillFamilies();
  fillPresets();
  fillMine();
  fillHits();
  var hits = E.host.querySelectorAll("#cbPresets .cb-preset, #cbActs .cb-hit").length;
  E.host.querySelector("#cbNoHits").style.display = E.q && !hits ? "" : "none";
  /* Searching shows the results pane, but the icon that was pressed keeps its
     light — clearing the box puts you back where you were. */
  if (E.q) {
    E.tabBeforeQ = E.tabBeforeQ || E.tabL;
    api.setTab("presets", false);
  } else if (E.tabBeforeQ) {
    api.setTab(E.tabBeforeQ, false);
    E.tabBeforeQ = null;
  }
}

/* ================= left panel ================= */

export function fillFamilies() {
  var wrap = E.host.querySelector("#cbFams"),
    title = E.host.querySelector("#cbFamsTitle");
  wrap.innerHTML = "";
  /* Fourteen named chips were five rows of the panel. They are icons now, and
     the one in force is spelled out on the section title instead. */
  if (title)
    title.childNodes[0].nodeValue = T("family") + (sp() ? " · " + famShort(sp().fam) : "");
  Object.keys(FAM).forEach(function (k) {
    if (!matches(famLabel(k) + " " + famShort(k))) return;
    var f = FAM[k],
      b = btn('<i class="ph ' + f.icon + '"></i><span class="cb-chip-name">' + famShort(k) + "</span>", function () {
        var it = E.it;
        it.d = f.d;
        it.h = f.h;
        if (it.w < STD.minCol) it.w = f.w;
        // a blank stays blank when the family changes — only its proportions
        // and its carcass follow the new family; and the free-form "family"
        // has no preset to fall back on, so it is always a blank
        api.act(T("opFamily") + " · " + famLabel(f));
        it.cab = k === "free" || (sp() && sp().preset === "blank")
          ? makeBlankSpec(k, it.w, it.h, it.d, it.cab)
          : makeSpec(f.preset, it.w, it.h, it.d, it.cab);
        api.syncDimInputs();
        E.sel = { col: 0, sec: 0 };
        fillPresets();
        fillFamilies();
        api.changed(true);
      }, "cb-chip cb-chip-ico" + (sp() && sp().fam === k ? " on" : ""));
    b.title = famLabel(k);
    b.setAttribute("aria-label", famLabel(k));
    wrap.appendChild(b);
  });
}

export function fillPresets() {
  var wrap = E.host.querySelector("#cbPresets"),
    fam = sp() ? sp().fam : "wardrobe";
  wrap.innerHTML = "";
  // the family's own presets first, then the rest — a wardrobe preset is still
  // a legitimate thing to try on a walk-in
  fillPresetCards(wrap, fam);
  var blankIco = E.host.querySelector('.cb-icons button[data-act="blank"]');
  if (blankIco) blankIco.classList.toggle("on", !!sp() && sp().preset === "blank");
}

/* The bare carcass: a preset answers the size for you, this hands you an empty
   box and the wall tools instead. */
export function startBlank() {
  var it = E.it;
  if (!it) return;
  it.cab = makeBlankSpec(sp() ? sp().fam : famOf(it), it.w, it.h, it.d, it.cab);
  E.sel = { col: 0, sec: 0 };
  fillPresets();
  fillFamilies();
  api.setTool("vwall"); // straight into drawing, which is the point of a blank
  api.changed(true);
}

export function fillPresetCards(wrap, fam) {
  var list = PRESETS.slice().sort(function (a, b) {
    return (a.fam === fam ? 0 : 1) - (b.fam === fam ? 0 : 1);
  });
  list.forEach(function (p) {
    if (!matches(presetLabel(p) + " " + presetNote(p) + " " + famLabel(p.fam))) return;
    var card = el("div", "cb-preset" + (sp() && sp().preset === p.id ? " on" : ""));
    card.innerHTML =
      '<div class="cb-p-top"><i class="ph ' + (FAM[p.fam] || {}).icon + '"></i><b>' + presetLabel(p) + "</b></div>" +
      '<div class="cb-p-note">' + presetNote(p) + "</div>" +
      '<div class="cb-p-fam">' + famLabel(p.fam) + "</div>";
    card.addEventListener("click", function () {
      var it = E.it,
        f = FAM[p.fam];
      // a preset from another family brings that family's proportions with it
      if (sp().fam !== p.fam) {
        it.d = f.d;
        it.h = f.h;
        api.syncDimInputs();
      }
      api.act(T("opPreset") + " · " + presetLabel(p));
      it.cab = makeSpec(p.id, it.w, it.h, it.d, it.cab);
      E.sel = { col: 0, sec: 0 };
      api.setTool(null);
      fillPresets();
      fillFamilies();
      api.changed(true);
    });
    wrap.appendChild(card);
  });
}

/* ================= elevation ================= */
export function fillInspector() {
  // the history panel is scoped to the selection, so it follows every pick —
  // and the inspector is the one thing every pick refreshes
  if (E.histPanel) E.histPanel.refresh();
  var wrap = E.host.querySelector("#cbInsp"),
    title = E.host.querySelector("#cbInspTitle");
  wrap.innerHTML = "";
  if (!E.sel || !sp()) {
    title.textContent = T("section");
    wrap.appendChild(el("div", "cb-note", T("nothing")));
    return;
  }
  var col = sp().cols[E.sel.col];
  if (!col) {
    E.sel = { col: 0, sec: 0 };
    col = sp().cols[0];
  }

  if (E.sel.sec != null && !(col.kind && col.kind !== "normal")) {
    var s = col.secs[E.sel.sec];
    if (!s) {
      E.sel.sec = 0;
      s = col.secs[0];
    }
    title.textContent = T("section") + " " + (E.sel.col + 1) + "." + (E.sel.sec + 1);
    /* Type picker. Anything this cabinet cannot physically hold is greyed out
       with the reason on it — a television niche in a 40 cm column, hanging in a
       35 cm deep carcass, a drawer wider than any runner. Width and depth are
       set by the cabinet, so they are hard limits; the required height is
       measured against the whole column rather than this compartment, because a
       compartment grows when you pick something that needs the room. */
    var L0 = layoutCab(E.it),
      fc = fitCtx(L0, L0.cols[E.sel.col]),
      grid = el("div", "cb-typegrid"),
      fam = sp().fam,
      dimmed = 0;
    /* Three tiers, in this order: what this kind of unit is for, what it could
       hold but nobody orders, and what will not physically fit. Only the last is
       unclickable — a bedroom television in a wardrobe is a real request, an
       80 cm hanging rail is not. */
    Object.keys(SEC)
      .map(function (k) {
        var fit = secFit(k, fc.w, fc.colH, fc.d),
          rel = secRelevant(k, fam);
        return { k: k, fit: fit, rel: rel, rank: fit.ok ? (rel ? 0 : 1) : 2 };
      })
      .sort(function (a, b) {
        return a.rank - b.rank;
      })
      .forEach(function (o) {
        var k = o.k,
          m = SEC[k],
          cur = s.t === k;
        if (o.rank > 0) dimmed++;
        // fourteen buttons for what is usually a choice of five: the odd ones
        // are behind "more options" until they are asked for
        if (o.rank > 0 && !E.allTypes && !cur) return;
        var b = btn('<i class="ph ' + m.icon + '"></i><span>' + secLabel(k) + "</span>", function () {
          s.t = k;
          delete s.n;
          delete s.heights;
          delete s.space;
          if (s.h < m.min) s.h = Math.max(s.h, Math.min(m.min, m.def));
          api.touch();
          api.changed();
        }, "cb-type" + (cur ? " on" : "") + (o.rank === 1 ? " cb-dim" : o.rank === 2 ? " cb-off" : ""));
        b.style.borderInlineStartColor = m.col;
        if (o.rank === 2) {
          // the current type stays clickable even when it no longer fits, so a
          // design loaded from a file can be inspected and moved off
          b.disabled = !cur;
          b.title = secLabel(k) + " — " + o.fit.why;
        } else if (o.rank === 1) b.title = secLabel(k) + " — " + T("unusualFor") + " " + famLabel(fam);
        grid.appendChild(b);
      });
    wrap.appendChild(grid);
    if (dimmed)
      wrap.appendChild(btn(
        E.allTypes ? T("lessOpts") : T("moreOpts").replace("$1", dimmed),
        function () {
          E.allTypes = !E.allTypes;
          fillInspector();
        },
        "cb-more"
      ));
    if (dimmed && E.allTypes) wrap.appendChild(el("div", "cb-note", T("fitNote")));
    wrap.appendChild(row(T("secH"), numInput(s.h, function (v) {
      s.h = v;
      s.fixed = true;
      api.touch();
      api.changed();
    }, 8)));
    if (s.t === "drawers")
      wrap.appendChild(row(T("count"), numInput(s.n || Math.max(1, Math.round(s.h / STD.drawerH)), function (v) {
        s.n = Math.max(1, Math.round(v));
        delete s.heights;
        api.touch();
        api.changed();
      }, 1, 8)));
    if (s.t === "shelves" || s.t === "shoe") {
      wrap.appendChild(row(T("count"), numInput(s.n != null ? s.n : Math.max(0, Math.round(s.h / (s.space || STD.shelfSpace)) - 1), function (v) {
        s.n = Math.max(0, Math.round(v));
        api.touch();
        api.changed();
      }, 0, 20)));
      wrap.appendChild(row(T("spacing"), numInput(s.space || (s.t === "shoe" ? STD.shoeSpace : STD.shelfSpace), function (v) {
        s.space = v;
        delete s.n;
        api.touch();
        api.changed();
      }, 12, 80)));
    }
    if (s.t === "pullout")
      wrap.appendChild(row(T("count"), numInput(s.n || Math.max(1, Math.round(s.h / 24)), function (v) {
        s.n = Math.max(1, Math.round(v));
        api.touch();
        api.changed();
      }, 1, 8)));
    var br = el("div", "cb-btnrow");
    br.appendChild(btn('<i class="ph ph-rows-plus-bottom"></i> ' + T("splitSec"), splitSection));
    br.appendChild(btn('<i class="ph ph-trash"></i> ' + T("delSec"), delSection, "btn-danger"));
    wrap.appendChild(br);
  } else {
    title.textContent = T("column") + " " + (E.sel.col + 1);
  }

  /* column block — always shown, since a compartment always belongs to one */
  var head = el("h5", "cb-h5", T("column") + " " + (E.sel.col + 1));
  wrap.appendChild(head);
  wrap.appendChild(row(T("colW"), numInput(col.w, function (v) {
    col.w = v;
    col.fixed = true;
    api.touch();
    api.changed();
  }, 12)));
  // the same fit table drives every picker below
  var Lc = layoutCab(E.it),
    cfc = fitCtx(Lc, Lc.cols[E.sel.col]);
  wrap.appendChild(row(T("colKind"), select(Object.keys(COLKIND).map(function (k) {
    return [k, kindLabel(k), kindFit(k, cfc)];
  }), col.kind || "normal", function (v) {
    col.kind = v === "normal" ? undefined : v;
    // a filler is a strip of board, not a cabinet — give it a sane width
    if (v === "filler" && col.w > 15) {
      col.w = 6;
      col.fixed = true;
    }
    api.touch();
    api.changed();
  })));
  // a filler or a blind corner has no front and no division to speak of
  var plain = !col.kind || col.kind === "normal";
  // fronts this kind of unit is normally given first, then the rest, then the
  // ones this column cannot take at all
  if (plain) wrap.appendChild(row(T("door"), select(Object.keys(DOORS)
    .map(function (k) {
      var fit = doorFit(k, cfc),
        rel = doorRelevant(k, sp().fam);
      return { k: k, fit: fit, rank: fit.ok ? (rel ? 0 : 1) : 2, rel: rel };
    })
    .sort(function (a, b) { return a.rank - b.rank; })
    .map(function (o) {
      return [o.k, doorLabel(o.k) + (o.rank === 1 ? " ·" : ""), o.fit];
    }), (col.door || {}).t || "none", function (v) {
    col.door = col.door || {};
    col.door.t = v;
    api.touch();
    api.changed();
  })));
  if (plain && col.door && ["hinged", "glass", "mirror", "folding"].indexOf(col.door.t) >= 0) {
    // "auto" is the default: one leaf up to a comfortable width, a pair above
    var laid = E.view && E.view.L.cols[E.sel.col],
      autoN = laid ? laid.doorLeaves : 1;
    wrap.appendChild(row(T("leaves"), select(
      [["", T("auto") + " (" + autoN + ")"], ["1", "1"], ["2", "2"]],
      col.door.leaves ? String(col.door.leaves) : "",
      function (v) {
        col.door.leaves = v ? +v : null;
        api.touch();
        api.changed();
      })));
    if ((col.door.leaves || autoN) === 1)
      wrap.appendChild(row(T("hinge"), select([["L", T("hingeL")], ["R", T("hingeR")]], col.door.hinge || "R", function (v) {
        col.door.hinge = v;
        api.touch();
        api.changed();
      })));
  }
  if (plain) {
    var fill = el("div", "cb-btnrow cb-wrap");
    /* A one-click layout is only offered when its own compartments would fit:
       "hanging" in a 35 cm deep bookcase builds a rail nobody can hang on. */
    [["fillHang", "hang", "hangS"], ["fillMix", "mix", "drawers"], ["fillShelf", "shelf", "shelves"], ["fillDraw", "draw", "drawers"]].forEach(function (f) {
      var fit = secFit(f[2], cfc.w, cfc.colH, cfc.d),
        b = btn(T(f[0]), function () {
          refillColumn(col, f[1]);
        }, "cb-sm" + (fit.ok ? "" : " cb-off"));
      if (!fit.ok) {
        b.disabled = true;
        b.title = fit.why;
      }
      fill.appendChild(b);
    });
    wrap.appendChild(el("div", "cb-note", T("fillCol")));
    wrap.appendChild(fill);
  }
  var br2 = el("div", "cb-btnrow");
  br2.appendChild(btn('<i class="ph ph-columns-plus-right"></i> ' + T("splitCol"), splitColumn, "cb-sm"));
  br2.appendChild(btn('<i class="ph ph-copy"></i> ' + T("dupCol"), dupColumn, "cb-sm"));
  br2.appendChild(btn('<i class="ph ph-trash"></i> ' + T("delCol"), delColumn, "cb-sm btn-danger"));
  wrap.appendChild(br2);

  /* carcass block */
  var ch = el("h5", "cb-h5", T("carcass"));
  wrap.appendChild(ch);
  /* How much carcass there is at all — a closed box, the same box with no back,
     or no box: bare shelves on concealed brackets. */
  wrap.appendChild(row(T("carcassMode"), select(Object.keys(CARCASS).map(function (k) {
    return [k, carcassLabel(k), carcassFit(k, cfc)];
  }), sp().carcass || "full", function (v) {
    var s2 = sp(),
      was = s2.carcass || "full",
      f2 = FAM[s2.fam] || FAM.wardrobe;
    s2.carcass = v;
    if (v === "float") {
      // bare shelves are a slab, not carcass board; they hang on the wall and
      // there is nothing on them to open
      if (s2.panel < 3) s2.panel = STD.floatT;
      if (!s2.elev) s2.elev = 90;
      s2.cols.forEach(function (c2) {
        c2.door = { t: "none", leaves: null, hinge: "R" };
      });
    } else {
      /* Back to being a box. Undo what floating did — a 38 mm carcass hung 90 cm
         off the floor with no plinth is nobody's idea of a cabinet. */
      if (was === "float") {
        if (s2.panel >= 3) s2.panel = STD.panel;
        s2.elev = f2.elev || 0;
        s2.plinthType = f2.plinth ? "recessed" : "none";
        s2.plinth = f2.plinth || 0;
      }
      s2.back = v === "open" ? 0 : s2.back || STD.back;
    }
    api.touch();
    api.changed(true);
  })));
  wrap.appendChild(row(T("elev"), numInput(sp().elev || 0, function (v) {
    sp().elev = v;
    api.changed(true);
  }, 0, 250)));
  wrap.appendChild(el("div", "cb-note", T("techHint")));
  wrap.appendChild(btn(T("levelTechnical"), function () { api.setLevel("technical"); }, "cb-more"));
}

/* --- drawing partitions ---
   The blueprint tool draws a wall and the room appears; here a partition is
   drawn on the elevation and the zone appears. A vertical one splits the
   column it lands in (the two halves keep the contents), a horizontal one
   splits the compartment under the pointer — with Shift, the same height in
   every column. */

export function refillColumn(col, mode) {
  api.act(T("fillCol"));
  api.touch();
  col.secs = columnFill(mode, E.view.L.yt - E.view.L.yb, sp().panel);
  E.sel = { col: E.sel.col, sec: 0 };
  api.changed();
}
export function splitSection() {
  api.act(T("splitSec"));
  api.touch();
  var col = sp().cols[E.sel.col],
    i = E.sel.sec,
    s = col.secs[i],
    half = (s.h - sp().panel) / 2;
  if (half < 10) return;
  s.h = half;
  delete s.fixed;
  col.secs.splice(i + 1, 0, { t: "shelves", h: half });
  api.changed();
}
export function delSection() {
  api.act(T("delSec"));
  api.touch();
  var col = sp().cols[E.sel.col];
  if (!col || col.secs.length <= 1) return;
  col.secs.splice(E.sel.sec, 1);
  E.sel.sec = Math.min(E.sel.sec, col.secs.length - 1);
  api.changed();
}
export function splitColumn() {
  api.act(T("splitCol"));
  api.touch();
  var cols = sp().cols,
    i = E.sel.col,
    c = cols[i],
    half = (c.w - sp().panel) / 2;
  if (half < 15) return;
  c.w = half;
  delete c.fixed;
  var copy = JSON.parse(JSON.stringify(c));
  copy.w = half;
  cols.splice(i + 1, 0, copy);
  api.changed();
}
export function dupColumn() {
  api.act(T("dupCol"));
  api.touch();
  var cols = sp().cols,
    copy = JSON.parse(JSON.stringify(cols[E.sel.col]));
  delete copy.fixed;
  cols.splice(E.sel.col + 1, 0, copy);
  api.changed();
}
export function delColumn() {
  api.act(T("delCol"));
  api.touch();
  var cols = sp().cols;
  if (cols.length <= 1) return;
  cols.splice(E.sel.col, 1);
  E.sel = { col: Math.max(0, E.sel.col - 1), sec: 0 };
  api.changed();
}

/* ================= appearance ================= */

export function swatch(id, cur, cb) {
  var f = FINISH[id],
    b = el("button", "cb-sw" + (cur === id ? " on" : ""));
  b.title = finishLabel(id);
  if (f.col == null) b.classList.add("cb-sw-auto");
  else b.style.background = "#" + f.col.toString(16).padStart(6, "0");
  b.addEventListener("click", function () {
    cb(id);
  });
  return b;
}

export function fillLook() {
  var wrap = E.host.querySelector("#cbLook");
  if (!sp()) return;
  wrap.innerHTML = "";
  var s = sp();
  // front style — a framed or reeded front needs a leaf wide enough to frame
  var Lf = layoutCab(E.it),
    ffc = fitCtx(Lf, null),
    styles = el("div", "cb-typegrid");
  Object.keys(FRONTS).forEach(function (k) {
    var fit = frontFit(k, ffc),
      cur = s.front === k,
      b = btn("<span>" + frontLabel(k) + "</span>", function () {
        api.act(T("opLook"));
        s.front = k;
        api.changed();
      }, "cb-type" + (cur ? " on" : "") + (fit.ok ? "" : " cb-off"));
    if (!fit.ok) {
      b.disabled = !cur;
      b.title = frontLabel(k) + " — " + fit.why;
    }
    styles.appendChild(b);
  });
  wrap.appendChild(styles);
  // two independent colour rows: fronts and carcass
  [["finFront", T("finFront")], ["finCarcass", T("finCarcass")]].forEach(function (row2) {
    var lab = el("div", "cb-note", row2[1]),
      strip = el("div", "cb-swatches");
    Object.keys(FINISH).forEach(function (k) {
      strip.appendChild(swatch(k, s[row2[0]], function (v) {
        api.act(T("opLook"));
        s[row2[0]] = v;
        api.changed();
      }));
    });
    wrap.appendChild(lab);
    wrap.appendChild(strip);
  });

  /* --- what it is actually made of ---
     A finish is what the piece looks like; this is which sheet it is cut from,
     and therefore what it costs and how it nests. Picking a carcass board also
     sets the board thickness, because those are not two separate decisions. */
  wrap.appendChild(el("h5", "cb-h5", T("stock")));
  [["carcass", "stCarcass", null], ["front", "stFront", STD.doorT], ["back", "stBack", null]]
    .concat(s.top ? [["top", "stTop", null]] : [])
    .forEach(function (r) {
      var pool = sheetsFor(r[0]).filter(function (sh) {
        return r[2] == null || Math.abs(sh.t - r[2]) < 0.35;
      });
      if (!pool.length) return;
      wrap.appendChild(row(T(r[1]), select(
        pool.map(function (sh) {
          return [sh.id, sheetLabel(sh, isEn()) + " · ₪" + sheetPrice(sh)];
        }),
        (s.stock || {})[r[0]],
        function (v) {
          var sh = sheetById(v);
          s.stock = s.stock || {};
          s.stock[r[0]] = v;
          if (sh) {
            if (r[0] === "carcass") s.panel = sh.t;
            else if (r[0] === "back" && s.back > 0) s.back = sh.t;
            else if (r[0] === "top" && s.top > 0) s.top = sh.t;
          }
          api.changed(true);
        },
      )));
    });
  wrap.appendChild(row(T("stBand"), select(
    BANDING.map(function (b) {
      return [b.id, bandLabel(b, isEn()) + " · ₪" + bandPPM(b) + "/m"];
    }),
    s.band,
    function (v) {
      s.band = v;
      api.changed();
    },
  )));
  if (s.top)
    wrap.appendChild(row(T("stProfile"), select(
      PROFILES.map(function (p) {
        return [p.id, profileLabel(p, isEn()) + (p.ppm ? " · ₪" + profilePPM(p) + "/m" : "")];
      }),
      s.profile,
      function (v) {
        s.profile = v;
        api.changed();
      },
    )));
}

export function fillTechnical() {
  var wrap = E.host && E.host.querySelector("#cbTechnical");
  if (!wrap || !sp()) return;
  wrap.innerHTML = "";
  var s = sp();
  wrap.appendChild(el("div", "cb-note", T("techHint")));
  wrap.appendChild(row(T("panel"), numInput(s.panel, function (v) {
    api.act(T("panel")); s.panel = v; api.changed(true);
  }, 0.8, 4)));
  wrap.appendChild(row(T("shelfBoard"), numInput(s.shelf || s.panel, function (v) {
    api.act(T("shelfBoard")); s.shelf = v; api.changed(true);
  }, 0.8, 4)));
  wrap.appendChild(row(T("back"), numInput(s.back, function (v) {
    api.act(T("back")); s.back = v; api.changed(true);
  }, 0.3, 3)));
  wrap.appendChild(row(T("plinthType"), select([
    ["recessed", T("plinthRecessed")],
    ["flush", T("plinthFlush")],
    ["legs", T("plinthLegs")],
    ["none", T("plinthNone")],
  ], s.plinthType || "none", function (v) {
    s.plinthType = v;
    if (v === "none") s.plinth = 0;
    else if (!s.plinth) s.plinth = (FAM[s.fam] || FAM.wardrobe).plinth || 8;
    api.act(T("plinthType"));
    api.changed(true);
  })));
  wrap.appendChild(row(T("plinth"), numInput(s.plinth || 0, function (v) {
    api.act(T("plinth")); s.plinth = v; s.plinthType = v > 0 ? (s.plinthType === "none" ? "recessed" : s.plinthType) : "none"; api.changed(true);
  }, 0, 30)));
  wrap.appendChild(row(T("gap"), numInput(s.gap, function (v) {
    api.act(T("gap")); s.gap = v; api.changed();
  }, 0, 2)));
  wrap.appendChild(row(T("spacing"), numInput(s.space || STD.shelfSpace, function (v) {
    api.act(T("spacing")); s.space = v; api.changed();
  }, 12, 80)));
  wrap.appendChild(el("h5", "cb-h5", T("stock")));
  [["carcass", "stCarcass"], ["back", "stBack"]].forEach(function (entry) {
    var pool = sheetsFor(entry[0]);
    if (!pool.length) return;
    wrap.appendChild(row(T(entry[1]), select(pool.map(function (sheet) {
      return [sheet.id, sheetLabel(sheet, isEn()) + " · ₪" + sheetPrice(sheet)];
    }), (s.stock || {})[entry[0]], function (value) {
      var sheet = sheetById(value);
      s.stock = s.stock || {};
      s.stock[entry[0]] = value;
      if (sheet && entry[0] === "carcass") { s.panel = sheet.t; s.shelf = sheet.t; }
      if (sheet && entry[0] === "back" && s.back > 0) s.back = sheet.t;
      api.act(T(entry[1])); api.changed(true);
    })));
  });
  var price = el("div", "cb-technical-price");
  price.textContent = T("total") + " · ₪" + cabPrice(E.it).toLocaleString("en-US");
  wrap.appendChild(price);
}

/* ================= checks ================= */

export function fillChecks() {
  var wrap = E.host.querySelector("#cbChecks"),
    badge = E.host.querySelector("#cbChkBadge");
  if (!sp()) return;
  var list = checkCab(E.it, ceilingHeight()),
    bad = list.filter(function (c) {
      return c.level !== "info";
    }).length;
  badge.textContent = bad ? String(bad) : "";
  badge.className = "cb-badge" + (bad ? " on" : "");
  // a real fault lights its icon red wherever you happen to be looking
  var ib = E.host.querySelector('.cb-icons button[data-tab="checks"]');
  if (ib) ib.classList.toggle("cb-alert", list.some(function (c) { return c.level === "err"; }));
  wrap.innerHTML = "";
  if (!list.length) {
    wrap.appendChild(el("div", "cb-note cb-ok", "✓ " + T("checksOk")));
    return;
  }
  var order = { err: 0, warn: 1, info: 2 };
  list
    .slice()
    .sort(function (a, b) {
      return order[a.level] - order[b.level];
    })
    .forEach(function (c) {
      var row2 = el("div", "cb-check cb-" + c.level, c.msg);
      if (c.col != null)
        row2.addEventListener("click", function () {
          E.sel = { col: c.col, sec: 0 };
          api.draw();
          fillInspector();
        });
      wrap.appendChild(row2);
    });
}

/* ================= my presets ================= */

export function saveUserPreset() {
  var name = prompt(T("presetName"), presetLabel(presetById(sp().preset) || { he: "", en: "" }) || "");
  if (!name) return;
  // prompt text is free-form: cap length and strip control chars so a pasted
  // name cannot blow up the list or become an accidental HTML injection vector
  // when older code paths still concatenate into innerHTML.
  name = String(name).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
  if (!name) return;
  var list = cabinetPresets();
  var safeId = name.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 20) || "preset";
  saveCabinetPreset({
    id: "u" + list.length + "_" + safeId,
    name: name,
    cab: JSON.parse(JSON.stringify(sp())),
    w: E.it.w, h: E.it.h, d: E.it.d,
  });
  fillMine();
  api.flashHint(T("savePreset") + " ✓");
}
export function fillMine() {
  var wrap = E.host.querySelector("#cbMine");
  wrap.innerHTML = "";
  var list = cabinetPresets();
  if (!list.length) {
    wrap.appendChild(el("div", "cb-note", "—"));
    return;
  }
  list.forEach(function (u, i) {
    if (!matches(u && u.name)) return;
    var card = el("div", "cb-preset cb-mine");
    // Build with textContent — preset names come from prompt() and must never
    // be interpolated into innerHTML (stored XSS if a name contains markup).
    var top = el("div", "cb-p-top");
    top.appendChild(el("i", "ph ph-bookmark-simple"));
    var title = document.createElement("b");
    title.textContent = u && u.name != null ? String(u.name) : "";
    top.appendChild(title);
    var note = el("div", "cb-p-note");
    note.textContent =
      Math.round(Number(u.w) || 0) + "×" + Math.round(Number(u.d) || 0) + "×" + Math.round(Number(u.h) || 0);
    card.appendChild(top);
    card.appendChild(note);
    var del = btn('<i class="ph ph-x"></i>', function (ev) {
      ev.stopPropagation();
      deleteCabinetPreset(i);
      fillMine();
    }, "cb-mine-del");
    del.title = T("delPreset");
    card.appendChild(del);
    card.addEventListener("click", function () {
      // a saved design is a design, not a rule — it is re-fitted to whatever
      // size this cabinet is, and never re-planned behind the user's back
      var cab = JSON.parse(JSON.stringify(u.cab));
      cab.auto = false;
      E.it.cab = cab;
      normalizeSpec(cab, E.it.w, E.it.h, E.it.d);
      E.sel = { col: 0, sec: 0 };
      fillPresets();
      fillFamilies();
      api.changed(true);
    });
    wrap.appendChild(card);
  });
}

/* ================= hardware ================= */

export function fillHardware() {
  var wrap = E.host.querySelector("#cbHw");
  if (!sp()) return;
  wrap.innerHTML = "";
  var hw = sp().hw;
  function pick(key, group, label) {
    wrap.appendChild(row(label, select(Object.keys(HW[group]).map(function (k) {
      return [k, hwLabel(group, k)];
    }), hw[key], function (v) {
      api.act(T("opHw") + " · " + label);
      hw[key] = v;
      api.changed();
    })));
  }
  pick("handle", "handle", T("handle"));
  pick("finish", "finish", T("finish"));
  pick("hinge", "hinge", T("hingeHw"));
  pick("slide", "slide", T("slide"));
  pick("rail", "rail", T("rail"));
  var cbs = el("div", "cb-btnrow cb-wrap");
  cbs.appendChild(checkbox(T("led"), hw.led, function (v) {
    api.act(T("opHw")); hw.led = v; api.changed();
  }));
  cbs.appendChild(checkbox(T("mirrorIn"), hw.mirrorInside, function (v) {
    api.act(T("opHw")); hw.mirrorInside = v; api.changed();
  }));
  cbs.appendChild(checkbox(T("lock"), hw.lock, function (v) {
    api.act(T("opHw")); hw.lock = v; api.changed();
  }));
  wrap.appendChild(cbs);
}

/* ================= BOM ================= */

// one table of part names, in cabinet.js, so the BOM here, the cut plan and the
// CSV all call a divider a divider
var roleLabel = roleLabelHe;

export function fillBOM() {
  var wrap = E.host.querySelector("#cbBom");
  if (!sp()) return;
  wrap.innerHTML = "";
  var L = layoutCab(E.it),
    boards = cutList(E.it, L),
    hwl = hardwareList(E.it, L);
  var tb = el("table", "cb-bom");
  tb.innerHTML = "<thead><tr><th>" + T("boards") + "</th><th>" + T("qty") + "</th></tr></thead>";
  var body = el("tbody");
  boards.forEach(function (r) {
    var tr = el("tr"),
      sh = r.sheet ? sheetById(r.sheet) : null;
    // the banded edge is part of the part: a shelf 900 long with 0.9 m of edge
    // on it is a different item to order than the same shelf with none
    tr.innerHTML =
      "<td>" + roleLabel(r.role) +
      ' <span class="cb-dim">' + Math.round(r.l * 10) + "×" + Math.round(r.w * 10) + "×" + Math.round(r.t * 10) +
      (r.bandEach ? " · " + T("bandTotal") + " " + r.bandEach.toFixed(2) + "m" : "") +
      (sh ? "<br>" + sheetLabel(sh, isEn()) : "") +
      "</span></td><td>" + r.qty + "</td>";
    body.appendChild(tr);
  });
  var hdr = el("tr", "cb-bom-head");
  hdr.innerHTML = "<td colspan=2>" + T("hwList") + "</td>";
  body.appendChild(hdr);
  hwl.forEach(function (r) {
    var tr = el("tr");
    tr.innerHTML = "<td>" + r.label + "</td><td>" + r.qty + "</td>";
    body.appendChild(tr);
  });
  tb.appendChild(body);
  wrap.appendChild(tb);
  var tot = el("div", "cb-total"),
    price = cabPrice(E.it, L);
  tot.innerHTML = "<span>" + T("total") + "</span><b>₪" + price.toLocaleString("en-US") + "</b>";
  wrap.appendChild(tot);
  // folded away, the section still has to carry the one number people want
  var bb = E.host.querySelector("#cbBomBadge");
  if (bb) bb.textContent = "₪" + price.toLocaleString("en-US");
}

/* The cut list as a workshop would want it: millimetres, the sheet each part
   comes off, and the metres of banding per part. */
export function exportBOM() {
  var rows = [[
    isEn() ? "Part" : "פריט",
    isEn() ? "Length (mm)" : 'אורך (מ"מ)',
    isEn() ? "Width (mm)" : 'רוחב (מ"מ)',
    isEn() ? "Thk (mm)" : 'עובי (מ"מ)',
    T("qty"),
    isEn() ? "Sheet material" : "חומר גלם",
    isEn() ? "Banding (m each)" : "קנט (מ׳ ליחידה)",
  ]];
  cutList(E.it).forEach(function (r) {
    var sh = r.sheet ? sheetById(r.sheet) : null;
    rows.push([
      roleLabel(r.role), Math.round(r.l * 10), Math.round(r.w * 10), Math.round(r.t * 10), r.qty,
      sh ? sheetLabel(sh, isEn()) : "", r.bandEach || "",
    ]);
  });
  rows.push([]);
  rows.push([T("hwList"), "", "", "", T("qty")]);
  hardwareList(E.it).forEach(function (r) {
    rows.push([r.label, "", "", "", r.qty]);
  });
  rows.push([]);
  var band = bandById(sp().band);
  rows.push([T("bandTotal") + (band ? " · " + bandLabel(band, isEn()) : ""), "", "", "", bandMeters(E.it) + " m"]);
  rows.push([T("total"), "", "", "", cabPrice(E.it)]);
  var csv = rows
    .map(function (r) {
      return r
        .map(function (c) {
          return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"';
        })
        .join(",");
    })
    .join("\r\n");
  var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "cabinet-bom.csv";
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

/* ================= 3D preview ================= */

api.fillHits = fillHits;
api.applySearch = applySearch;
api.fillFamilies = fillFamilies;
api.fillPresets = fillPresets;
api.startBlank = startBlank;
api.fillInspector = fillInspector;
api.splitSection = splitSection;
api.delSection = delSection;
api.splitColumn = splitColumn;
api.dupColumn = dupColumn;
api.delColumn = delColumn;
api.fillLook = fillLook;
api.fillTechnical = fillTechnical;
api.fillChecks = fillChecks;
api.saveUserPreset = saveUserPreset;
api.fillMine = fillMine;
api.fillHardware = fillHardware;
api.fillBOM = fillBOM;
api.exportBOM = exportBOM;
