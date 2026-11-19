/* Inspector wall types, elevation, joins, finish and takeoff panes, split out
   of js/ui_props.js. It shares the editor's state through live imports from
   ../ui_props.js. */
import { fmtLen, parseLen, unitLabel } from "../display_units.js";
import { wallClearLength } from "../geometry.js";
import { pushHistory } from "../history.js";
import { t } from "../i18n.js";
import { previewUrlFor } from "../material_library.js";
import { render2D } from "../plan2d.js";
import { S } from "../state.js";
import { fillProps } from "../ui_props/cons.js";
import { fillWallHead, fillWallSection, fillWallStats, fmtCm, focusOpening, m2, matLabel, openingFocused, openingTypeKey, wallOpeningArea, wallOpeningsOf, wallSolidHeight } from "../ui_props/wall_tabs.js";
import { refreshTree } from "../ui_tree.js";
import { renderWarnPanel, setConstraintHover } from "../ui_warn.js";
import { flash } from "../ui.js";
import { CON_TOL_A, CON_TOL_L, anchorLabel, conError, conSatisfied, flipConDirection, removeCon, setConFaces, setConSuppressed, setConValue, solveWallCons } from "../wall_constraints.js";
import { normalizeWallKind, normalizeWallProfile, verticalSegments, wallProfileHeight } from "../wall_curves.js";
import { wallLayerBands, wallLayers, wallTypeById } from "../wall_types.js";
import {
  conCanFlip, conHasValue, conIsAngular, conRowLabel, inspectorLen, select,
  set_wallDiagramBound, wallDiagramBound,
} from "../ui_props.js";

function openWallTypes() {
  var btn = document.querySelector('#wallProps [data-act="wallTypeEditor"]');
  if (btn) btn.click();
}

function fillWallElevation(w) {
  var host = document.getElementById("w_elev");
  if (!host) return;
  var L = Math.max(1, wallClearLength(w)),
    H = Math.max(1, Number(w.height) || 260);
  var kind = normalizeWallKind(w),
    segs = verticalSegments(w, function (id) { return wallTypeById(S, id); }),
    prof = normalizeWallProfile(w);
  /* Text inside the elevation is sized in wall centimetres, so a tall wall in a
     narrow panel would render its dimensions at two or three pixels. Work out
     the scale the drawing will settle at — width-bound or height-capped — and
     size the labels back up to a readable number of screen pixels, then place
     them knowing how tall they will be. */
  var availW = Math.max(80, (host.clientWidth || 240) - 14),
    vbW = L + 28,
    vbH = H + 34,
    scale = 1,
    FS = 10,
    TFS = 9;
  // label height feeds back into the box height, which feeds back into the
  // scale — two passes is enough to settle it
  for (var pass = 0; pass < 2; pass++) {
    scale = Math.min(availW / vbW, 150 / vbH);
    // ...but a very long wall in a narrow panel would need labels taller than
    // the wall itself, so legibility gives way rather than squash the drawing
    FS = Math.min(9.5 / scale, H * 0.18);
    TFS = FS * 0.95;
    vbH = H + 24 + FS * 2.9;
  }
  function Y(v) {
    return H - v;
  }
  var parts = ['<line class="w-elev-ground" x1="-8" y1="' + H + '" x2="' + (L + 8) + '" y2="' + H + '"/>'];
  if (kind === "roomDivider" || !segs.length) {
    parts.push('<rect class="w-elev-divider" x="0" y="0" width="' + L + '" height="' + H + '"/>');
  } else {
    segs.forEach(function (sg) {
      if (sg.role === "railing") {
        var n = Math.max(2, Math.round(L / 28)),
          i;
        for (i = 0; i <= n; i++) {
          var bx = (L * i) / n;
          parts.push('<line class="w-elev-rail" x1="' + bx + '" y1="' + Y(sg.top) + '" x2="' + bx + '" y2="' + Y(sg.bottom) + '"/>');
        }
        parts.push('<line class="w-elev-railtop" x1="0" y1="' + Y(sg.top) + '" x2="' + L + '" y2="' + Y(sg.top) + '"/>');
      } else if (prof.length && kind === "normal" && sg === segs[segs.length - 1]) {
        var pts = ["0," + Y(sg.bottom)],
          N = 20,
          i2;
        for (i2 = 0; i2 <= N; i2++) {
          var sx = (L * i2) / N;
          pts.push(sx + "," + Y(Math.max(sg.bottom, wallProfileHeight(w, sx, H))));
        }
        pts.push(L + "," + Y(sg.bottom));
        parts.push('<polygon class="w-elev-solid" points="' + pts.join(" ") + '"/>');
      } else {
        parts.push(
          '<rect class="w-elev-solid w-elev-' + sg.role + '" x="0" y="' + Y(sg.top) + '" width="' + L + '" height="' + (sg.top - sg.bottom) + '"/>',
        );
      }
      if (sg.role === "upper")
        parts.push('<line class="w-elev-split" x1="0" y1="' + Y(sg.bottom) + '" x2="' + L + '" y2="' + Y(sg.bottom) + '"/>');
    });
  }
  var ops = (S.openings || []).filter(function (o) {
    return o.wall === w.id;
  });
  var tags = [];
  ops.forEach(function (o) {
    var ox = Math.max(0, Math.min(L, o.s)) - o.width / 2,
      oy = Y((o.sill || 0) + o.height);
    var sel = openingFocused(o);
    var label =
      t(openingTypeKey(o.type)) + " " + fmtLen(o.width, { domain: "openings", suffix: false }) + "×" + fmtLen(o.height, { domain: "openings" }) + " · " + fmtLen(o.s, { domain: "rooms" }) +
      " · " + t("wi_openDblHint");
    parts.push(
      '<g class="w-open-hit w-open-' + (o.type === "door" ? "d" : o.type === "window" ? "w" : "p") + (sel ? " sel" : "") + '" data-oid="' + o.id + '">' +
        "<title>" + label + "</title>" +
        '<rect x="' + ox + '" y="' + oy + '" width="' + o.width + '" height="' + o.height + '"/>' +
        (o.type === "window"
          ? '<line x1="' + ox + '" y1="' + (oy + o.height / 2) + '" x2="' + (ox + o.width) + '" y2="' + (oy + o.height / 2) + '"/>'
          : o.type === "door"
            ? '<line x1="' + ox + '" y1="' + oy + '" x2="' + (ox + o.width) + '" y2="' + (oy + o.height) + '"/>'
            : "") +
        "</g>",
    );
    /* The selected opening carries its own dimensions: width, height, and the
       clear distance to BOTH corners — the two numbers that decide whether it
       can stay where it is. Drawn after every opening so the tags of the one
       being edited are never covered by a neighbour. */
    if (!sel) return;
    var right = ox + o.width,
      // above the head when there is room for the label, inside it when not
      tagY = oy > TFS * 1.4 ? oy - TFS * 0.4 : oy + TFS * 1.2;
    tags.push(
      '<line class="w-elev-tick" x1="0" y1="' + (H + 5) + '" x2="0" y2="' + Y(0) + '"/>' +
        '<line class="w-elev-tick" x1="' + ox + '" y1="' + oy + '" x2="' + ox + '" y2="' + (H + 5) + '"/>' +
        '<line class="w-elev-tick" x1="' + right + '" y1="' + oy + '" x2="' + right + '" y2="' + (H + 5) + '"/>' +
        '<text class="w-elev-tag" x="' + (ox + o.width / 2) + '" y="' + tagY + '">' + inspectorLen(o.width, { suffix: false }) + " × " + inspectorLen(o.height, { suffix: false }) + "</text>" +
        '<text class="w-elev-tag" x="' + ox / 2 + '" y="' + (H + 4 + TFS) + '">A ' + inspectorLen(Math.max(0, ox), { suffix: false }) + "</text>" +
        '<text class="w-elev-tag" x="' + ((right + L) / 2) + '" y="' + (H + 4 + TFS) + '">B ' + inspectorLen(Math.max(0, L - right), { suffix: false }) + "</text>",
    );
  });
  parts = parts.concat(tags);
  var dimY = H + 8 + FS * (tags.length ? 1.9 : 0.9);
  parts.push('<text class="w-elev-dim" x="' + L / 2 + '" y="' + dimY + '">' + inspectorLen(L, { suffix: false }) + "</text>");
  parts.push(
    '<text class="w-elev-dim" transform="translate(' + -FS * 0.7 + " " + H / 2 + ') rotate(-90)" text-anchor="middle">' + inspectorLen(H, { suffix: false }) + "</text>",
  );
  host.innerHTML =
    '<svg style="--elev-fs:' + FS + "px;--elev-tag-fs:" + TFS + "px;--elev-sw:" + 1 / scale +
    'px" viewBox="' + -(FS + 6) + " -8 " + (vbW + FS) + " " + (dimY + FS + 8) + '" preserveAspectRatio="xMidYMid meet">' +
    parts.join("") + "</svg>";
  host.querySelectorAll("[data-oid]").forEach(function (el) {
    function opening() {
      return (S.openings || []).find(function (x) {
        return String(x.id) === el.getAttribute("data-oid");
      });
    }
    el.addEventListener("click", function () {
      var o = opening();
      if (o) focusOpening(w, o);
    });
    el.addEventListener("dblclick", function (e) {
      e.stopPropagation();
      var o = opening();
      if (!o) return;
      select({ kind: "opening", ref: o });
      render2D();
    });
  });
}

/* ---- end joins, as a segmented picker -----------------------------------
   Three ways two walls can meet, drawn rather than named: the select that used
   to hold them read as a fourth dropdown in a panel that already had several,
   and the choice is small enough to be one row. */
function fillWallJoins(w) {
  ["a", "b"].forEach(function (end) {
    var box = document.getElementById("w_join_" + end);
    if (!box) return;
    var mode = (w.join && w.join[end]) || "auto";
    box.querySelectorAll("button[data-join]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.join === mode);
      b.setAttribute("aria-pressed", b.dataset.join === mode ? "true" : "false");
    });
  });
}

/* ---- finishes and per-wall take-off -------------------------------------
   The two faces of the wall as the assembly actually builds them, plus the
   custom texture if one has been dropped on it; then the quantities that come
   off THIS wall, which the project-wide schedule could only give as a total. */
function fillWallFinish(w) {
  var host = document.getElementById("w_swatches");
  var clear = document.getElementById("w_clearTex");
  if (clear) clear.hidden = !w.tex;
  if (!host) return;
  host.innerHTML = "";
  var bands = wallLayerBands(w, S);
  var faces = [];
  if (bands.length) {
    faces.push({ label: t("wi_faceOut"), band: bands[0] });
    if (bands.length > 1) faces.push({ label: t("wi_faceIn"), band: bands[bands.length - 1] });
  }
  faces.forEach(function (f) {
    var el = document.createElement("div");
    el.className = "wi-sw";
    var chip = document.createElement("span");
    chip.className = "wi-sw-chip";
    chip.style.background = f.band.color || "#c8c5bb";
    var txt = document.createElement("span");
    txt.className = "wi-sw-txt";
    txt.innerHTML = "<b></b><span></span>";
    txt.querySelector("b").textContent = f.label;
    txt.querySelector("span").textContent = matLabel(f.band.material) + " · " + fmtCm(f.band.end - f.band.start);
    el.appendChild(chip);
    el.appendChild(txt);
    el.title = f.label + ": " + matLabel(f.band.material);
    host.appendChild(el);
  });
  if (w.tex) {
    var el2 = document.createElement("div");
    el2.className = "wi-sw";
    var chip2 = document.createElement("span");
    chip2.className = "wi-sw-chip";
    chip2.style.backgroundImage = 'url("' + previewUrlFor(w.tex) + '")';
    var txt2 = document.createElement("span");
    txt2.className = "wi-sw-txt";
    txt2.innerHTML = "<b></b><span></span>";
    txt2.querySelector("b").textContent = t("wi_customTex");
    txt2.querySelector("span").textContent = t("wi_texOverride");
    el2.appendChild(chip2);
    el2.appendChild(txt2);
    host.appendChild(el2);
  }
}

/* Quantities for the selected wall alone: net surface per face-finish, and the
   volume of every layer the assembly builds. Same arithmetic the project
   schedule uses, scoped to one wall so it can be read while the wall is being
   designed rather than exported and searched for. */
export function wallTakeoffRows(w) {
  var L = Math.max(0, wallClearLength(w)),
    H = wallSolidHeight(w),
    gross = L * H,
    openings = wallOpeningArea(w, L, H),
    net = Math.max(0, gross - openings);
  var rows = [
    { k: t("wi_toGross"), s: "", v: m2(gross) },
    { k: t("wi_toOpenings"), s: wallOpeningsOf(w).length ? String(wallOpeningsOf(w).length) : "", v: "−" + m2(openings) },
    { k: t("wi_toNet"), s: "", v: m2(net) },
  ];
  if (normalizeWallKind(w) === "roomDivider") return [{ k: t("wallKindDivider"), s: "", v: "—" }];
  wallLayers(w, S).forEach(function (layer) {
    var vol = (net * layer.thickness) / 1000000;
    rows.push({
      k: matLabel(layer.material),
      s: matLabel(layer.role || "") + " · " + fmtCm(layer.thickness),
      v: (Math.round(vol * 1000) / 1000).toFixed(3) + " " + t("cbm"),
    });
  });
  return rows;
}

function fillWallTakeoff(w) {
  var host = document.getElementById("w_takeoff");
  if (!host) return;
  host.innerHTML = "";
  var rows = wallTakeoffRows(w);
  if (!rows.length) {
    host.innerHTML = '<span class="wi-to-empty">—</span>';
    return;
  }
  rows.forEach(function (r) {
    var el = document.createElement("div");
    el.className = "wi-to-row";
    var k = document.createElement("span");
    k.className = "k";
    k.textContent = r.k;
    el.appendChild(k);
    if (r.s) {
      var s = document.createElement("span");
      s.className = "s";
      s.textContent = r.s;
      el.appendChild(s);
    }
    var v = document.createElement("span");
    v.className = "v";
    v.textContent = r.v;
    el.appendChild(v);
    host.appendChild(el);
  });
}

function fillWallDiagrams(w) {
  fillWallSection(w);
  fillWallElevation(w);
  fillWallStats(w);
  bindWallDiagramPanel();
}

function bindWallDiagramPanel() {
  if (wallDiagramBound) return;
  var panel = document.getElementById("wallProps");
  if (!panel) return;
  set_wallDiagramBound(true);
  var raf = 0;
  function again() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      if (!S.sel || S.sel.kind !== "wall") return;
      /* Everything downstream of a number in this panel: the drawings, the
         chips, and the take-off all read the same wall, so none of them may
         lag a keystroke behind the others. */
      fillWallDiagrams(S.sel.ref);
      fillWallHead(S.sel.ref);
      fillWallTakeoff(S.sel.ref);
      fillWallFinish(S.sel.ref);
    });
  }
  panel.addEventListener("input", again);
  panel.addEventListener("change", again);
}

/* One dimension, as a row: what it measures, the number it holds (editable in
   place), how far out it is, and the verbs that change it. Extracted from
   fillWallCons so the OPENING inspector renders its position dimensions with
   exactly the same row — two hand-written row builders would have drifted the
   first time one of them learned a new control. */
function conRow(c) {
  {
    var row = document.createElement("div");
    row.className = "con-row" + (conSatisfied(c) ? "" : " con-bad") +
      (c.off ? " con-off" : "") + (S.conHover === c.id ? " hot" : "");
    row.dataset.conId = String(c.id);
    row.addEventListener("mouseenter", function () {
      setConstraintHover(c);
      render2D();
    });
    row.addEventListener("mouseleave", function () {
      if (S.conHover === c.id) setConstraintHover(null);
      render2D();
    });

    var ic = document.createElement("i");
    ic.className =
      "ph " +
      (c.type === "dist" || c.type === "pointWallDist" || c.type === "axisDistX" || c.type === "axisDistZ"
        ? "ph-ruler"
        : conIsAngular(c)
          ? "ph-angle"
          : "ph-arrows-out-line-vertical");
    row.appendChild(ic);

    var name = document.createElement("span");
    name.className = "con-name";
    name.textContent = conRowLabel(c);
    name.title = name.textContent;
    row.appendChild(name);

    if (conHasValue(c)) {
      var inp = document.createElement("input");
      inp.type = "text";
      inp.inputMode = "decimal";
      inp.className = "con-val";
      inp.value = c.type === "angle"
        ? String(Math.round(c.value * 10) / 10)
        : fmtLen(c.value, { suffix: false, domain: "plan" });
      inp.title = t(c.type === "angle" ? "cad_ang" : "cad_len");
      inp.disabled = !!c.off;
      inp.addEventListener("change", function () {
        var v = c.type === "angle" ? parseFloat(inp.value) : parseLen(inp.value, "plan");
        if (!isFinite(v)) return;
        pushHistory();
        setConValue(c.id, v);
        var result = solveWallCons();
        S.dirty3D = true;
        render2D();
        fillProps();
        refreshTree();
        renderWarnPanel(true);
        if (result.unresolved) flash(t("wc_unresolved", { n: result.unresolved }), "error");
      });
      row.appendChild(inp);
      var unit = document.createElement("span");
      unit.className = "con-unit";
      unit.textContent = c.type === "angle" ? "°" : unitLabel("plan");
      row.appendChild(unit);
    }

    // how far out, only when it IS out — a satisfied row stays quiet
    var err = conError(c);
    if (err != null && !conSatisfied(c)) {
      var e = document.createElement("span");
      e.className = "con-err";
      e.textContent = "Δ" + (Math.round(err * 10) / 10);
      e.title = t("wc_outBy", {
        v: Math.round(err * 10) / 10,
        tol: conIsAngular(c) ? CON_TOL_A : CON_TOL_L,
      });
      row.appendChild(e);
    }

    // which side stays put — available on every asymmetric relation
    if (conCanFlip(c)) {
      var fl = document.createElement("button");
      fl.className = "con-btn";
      fl.innerHTML = '<i class="ph ph-arrows-left-right"></i>';
      fl.title = c.a && c.b
        ? t("wc_flip", { a: anchorLabel(c.hold === "b" ? c.b : c.a) })
        : "Swap reference and driven geometry";
      fl.addEventListener("click", function () {
        pushHistory();
        if (!flipConDirection(c.id)) return flash(t("wc_flipFail"), "error");
        var result = solveWallCons();
        S.dirty3D = true;
        render2D();
        fillProps();
        renderWarnPanel(true);
        if (result.unresolved) flash(t("wc_unresolved", { n: result.unresolved }), "error");
      });
      row.appendChild(fl);
    }

    var off = document.createElement("button");
    off.className = "con-btn";
    off.innerHTML = '<i class="ph ' + (c.off ? "ph-play" : "ph-pause") + '"></i>';
    off.title = c.off ? "Enable relation" : "Suppress relation";
    off.addEventListener("click", function () {
      pushHistory();
      setConSuppressed(c.id, !c.off);
      var result = !c.off ? solveWallCons() : { unresolved: 0 };
      S.dirty3D = true;
      render2D(); fillProps(); renderWarnPanel(true);
      if (result.unresolved) flash(t("wc_unresolved", { n: result.unresolved }), "error");
    });
    row.appendChild(off);

    if (c.type === "offset") {
      ["wallFace", "refFace"].forEach(function (key) {
        var face = document.createElement("select");
        face.className = "con-face-select";
        [[0, "Axis"], [-1, "Face −"], [1, "Face +"]].forEach(function (entry) {
          var opt = document.createElement("option");
          opt.value = entry[0]; opt.textContent = entry[1]; face.appendChild(opt);
        });
        face.value = String(c[key] || 0);
        face.title = key === "wallFace" ? "Driven wall measurement face" : "Reference wall measurement face";
        face.addEventListener("change", function () {
          pushHistory();
          setConFaces(c.id,
            key === "wallFace" ? Number(face.value) : c.wallFace,
            key === "refFace" ? Number(face.value) : c.refFace);
          var result = solveWallCons();
          render2D(); fillProps(); renderWarnPanel(true);
          if (result.unresolved) flash(t("wc_unresolved", { n: result.unresolved }), "error");
        });
        row.appendChild(face);
      });
    }
    if (c.type === "pointWallDist") {
      var refFace = document.createElement("select");
      refFace.className = "con-face-select";
      [[0, "Axis"], [-1, "Face −"], [1, "Face +"]].forEach(function (entry) {
        var opt = document.createElement("option"); opt.value = entry[0]; opt.textContent = entry[1]; refFace.appendChild(opt);
      });
      refFace.value = String(c.refFace || 0);
      refFace.title = "Reference wall measurement face";
      refFace.addEventListener("change", function () {
        pushHistory(); setConFaces(c.id, 0, Number(refFace.value));
        var result = solveWallCons();
        render2D(); fillProps(); renderWarnPanel(true);
        if (result.unresolved) flash(t("wc_unresolved", { n: result.unresolved }), "error");
      });
      row.appendChild(refFace);
    }

    var del = document.createElement("button");
    del.className = "con-btn con-del";
    del.innerHTML = '<i class="ph ph-x"></i>';
    del.title = t("del");
    del.addEventListener("click", function () {
      pushHistory();
      removeCon(c.id);
      render2D();
      fillProps();
      renderWarnPanel(true);
    });
    row.appendChild(del);

    return row;
  }
}

export {
  conRow, fillWallDiagrams, fillWallElevation, fillWallFinish, fillWallJoins,
  fillWallTakeoff, openWallTypes,
};
