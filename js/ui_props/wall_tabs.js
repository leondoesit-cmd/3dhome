/* Inspector wall tabs, phases, solid heights and opening areas, split out of
   js/ui_props.js. It shares the editor's state through live imports from
   ../ui_props.js. */
import { fmtLen } from "../display_units.js";
import { wallClearLength, wallGeom } from "../geometry.js";
import { pushHistory } from "../history.js";
import { t } from "../i18n.js";
import { render2D } from "../plan2d.js";
import { S } from "../state.js";
import { fillProps } from "../ui_props/cons.js";
import { fillWallElevation, openWallTypes } from "../ui_props/wall_panels.js";
import { normalizeWallKind, verticalSegments } from "../wall_curves.js";
import { wallLayerBands, wallLayers, wallPhase, wallThickness, wallTypeById } from "../wall_types.js";
import {
  inspectorLen, select, set_wallTabsBound, wallKindLabel, wallTab,
  wallTabsBound,
} from "../ui_props.js";

function bindWallTabs() {
  if (wallTabsBound) return;
  var strip = document.getElementById("w_tabs");
  if (!strip) return;
  set_wallTabsBound(true);
  strip.setAttribute("aria-orientation", "horizontal");
  var tabs = Array.from(strip.querySelectorAll("button[data-wtab]"));
  tabs.forEach(function (tab) {
    var name = tab.dataset.wtab;
    var pane = document.querySelector('#wallProps .wi-pane[data-wpane="' + name + '"]');
    tab.id = tab.id || "w_tab_" + name;
    if (pane) {
      pane.id = pane.id || "w_pane_" + name;
      tab.setAttribute("aria-controls", pane.id);
      pane.setAttribute("aria-labelledby", tab.id);
    }
  });
  strip.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-wtab]");
    if (b) wallTab(b.dataset.wtab);
  });
  strip.addEventListener("keydown", function (e) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    var current = e.target.closest("button[data-wtab]");
    var index = tabs.indexOf(current);
    if (index < 0) return;
    e.preventDefault();
    if (e.key === "Home") index = 0;
    else if (e.key === "End") index = tabs.length - 1;
    else {
      var rtl = getComputedStyle(strip).direction === "rtl";
      var forward = e.key === "ArrowRight" ? !rtl : rtl;
      index = (index + (forward ? 1 : -1) + tabs.length) % tabs.length;
    }
    tabs[index].focus();
    wallTab(tabs[index].dataset.wtab);
  });
}

function phaseKey(phase) {
  return phase === "new" ? "wallPhaseNew" : phase === "demolition" ? "wallPhaseDemolish" : "wallPhaseExisting";
}

/* The solid height of the wall, taken the way the schedule takes it: the
   vertical segments a type actually builds, not the nominal storey height. A
   railing or a half wall is shorter than w.height and its area must say so. */
function wallSolidHeight(w) {
  var segs = verticalSegments(w, function (id) { return wallTypeById(S, id); });
  var h = segs.reduce(function (sum, sg) {
    return sum + (sg.solid === false ? 0 : Math.max(0, sg.top - sg.bottom));
  }, 0);
  return h > 0 ? h : Math.max(0, Number(w.height) || 0);
}

function wallOpeningsOf(w) {
  return (S.openings || []).filter(function (o) {
    return o.wall === w.id;
  }).sort(function (a, b) {
    return (a.s || 0) - (b.s || 0);
  });
}

function wallOpeningArea(w, L, H) {
  return wallOpeningsOf(w).reduce(function (sum, o) {
    var width = Math.max(0, Math.min(L, Number(o.width) || 0));
    var sill = Math.max(0, Number(o.sill) || 0);
    var top = Math.min(H, sill + Math.max(0, Number(o.height) || 0));
    return sum + width * Math.max(0, top - Math.min(H, sill));
  }, 0);
}

function m2(v) {
  return (Math.round(v / 100) / 100).toFixed(2) + " " + t("sqm");
}

/* The architectural summary line, as chips: the three dimensions plus the one
   number that is always asked for next and never shown — the surface actually
   left to build, plaster and paint once the openings are cut out. */
function fillWallStats(w) {
  var host = document.getElementById("w_stats");
  if (!host) return;
  var L = Math.max(0, wallClearLength(w)),
    Lraw = Math.max(0, wallGeom(w).L),
    H = wallSolidHeight(w),
    T = wallThickness(w, S),
    nOpen = wallOpeningsOf(w).length,
    net = Math.max(0, L * H - wallOpeningArea(w, L, H));
  var chips = [
    { k: t("len"), v: inspectorLen(L), sub: Math.abs(Lraw - L) > 0.6 ? t("wi_axis", { v: inspectorLen(Lraw) }) : "" },
    { k: t("height"), v: inspectorLen(H), sub: "" },
    { k: t("th"), v: fmtLen(T, { domain: "details" }), sub: "" },
    { k: t("wi_netArea"), v: m2(net), sub: nOpen ? t(nOpen === 1 ? "wi_netOf1" : "wi_netOf", { n: nOpen }) : "" },
  ];
  host.innerHTML = "";
  chips.forEach(function (c) {
    var el = document.createElement("div");
    el.className = "wi-chip";
    el.title = c.k + ": " + c.v;
    var v = document.createElement("span");
    v.className = "wi-chip-v";
    v.textContent = c.v;
    var k = document.createElement("span");
    k.className = "wi-chip-k";
    k.textContent = c.k;
    el.appendChild(v);
    el.appendChild(k);
    if (c.sub) {
      var s = document.createElement("span");
      s.className = "wi-chip-sub";
      s.textContent = c.sub;
      el.appendChild(s);
    }
    host.appendChild(el);
  });
}

/* Flipping the assembly mirrors the layer stack. On a wall whose stack reads
   the same in both directions — a single layer, or a symmetric sandwich — there
   is nothing to mirror, and the button used to accept the click and change
   nothing at all. Ask first, and say so in the panel. */
export function wallFlipSymmetric(w) {
  var layers = wallLayers(w, S);
  if (layers.length < 2) return true;
  return layers.every(function (layer, i) {
    var other = layers[layers.length - 1 - i];
    return (
      layer.material === other.material &&
      Math.abs(layer.thickness - other.thickness) < 0.01 &&
      (layer.color || "") === (other.color || "")
    );
  });
}

/* The two faces the flip swaps, named — the assembly's outermost and innermost
   materials. Also what the finish swatches show. */
export function wallFaceMaterials(w) {
  var layers = wallLayers(w, S);
  if (!layers.length) return { out: "", in: "" };
  return {
    out: matLabel(layers[0].material),
    in: matLabel(layers[layers.length - 1].material),
  };
}

function fillWallFlip(w) {
  var symmetric = wallFlipSymmetric(w);
  var faces = wallFaceMaterials(w);
  var why = symmetric
    ? t("wallReverseNA")
    : t("wallReverseWhat", { out: faces.out, in: faces.in });
  [document.getElementById("w_reverse"), document.getElementById("w_flipQuick")].forEach(function (btn) {
    if (!btn) return;
    btn.disabled = symmetric;
    btn.title = why;
  });
  var hint = document.getElementById("w_reverseHint");
  if (hint) {
    hint.hidden = false;
    hint.textContent = why;
  }
}

function fillWallHead(w) {
  var name = document.getElementById("selname");
  var meta = document.getElementById("w_meta");
  if (name) name.textContent = t("wallId", { id: w.id });
  var phase = wallPhase(w);
  var pill = document.getElementById("w_phasePill");
  if (pill) {
    pill.textContent = t(phaseKey(phase));
    pill.className = "wi-phase ph-" + phase;
  }
  var flip = document.getElementById("w_flipQuick");
  if (flip) {
    flip.classList.toggle("active", !!w.layersReversed);
    flip.setAttribute("aria-pressed", w.layersReversed ? "true" : "false");
  }
  if (!meta) return;
  var type = wallTypeById(S, w.wallTypeId);
  var bits = [];
  if (type && type.name) bits.push(type.name);
  var kind = normalizeWallKind(w);
  if (kind && kind !== "normal") bits.push(wallKindLabel(kind));
  var layers = wallLayers(w, S);
  if (layers.length > 1) bits.push(t("wi_layers", { n: layers.length }));
  meta.textContent = bits.join(" · ");
}

function openingTypeKey(type) {
  return type === "door" ? "door" : type === "window" ? "window" : "passage";
}

/* An opening can be looked at without leaving the wall. Selecting one swaps
   the whole inspector for the opening's own panel, which is right when it is
   being edited and wrong when the question is "where does this window sit on
   this wall" — so the elevation and the cards focus first and select second
   (the pencil, or a double-click on the drawing). */
function openingFocused(o) {
  return (
    S.wallOpenFocus === o.id ||
    (S.sel && S.sel.kind === "opening" && S.sel.ref === o)
  );
}

function focusOpening(w, o) {
  S.wallOpenFocus = S.wallOpenFocus === o.id ? null : o.id;
  fillWallOpenings(w);
  fillWallElevation(w);
}

/* One opening, as a card: what it is, how big, and where it sits measured from
   BOTH corners — "1.10 m from A" alone is useless when the question is whether
   it clears the corner at the other end. The card is the selection gesture;
   the two tools are the ones a list like this is reached for. */
function fillWallOpenings(w) {
  var list = document.getElementById("w_openList");
  var empty = document.getElementById("w_openEmpty");
  if (!list) return;
  list.innerHTML = "";
  var L = Math.max(1, wallClearLength(w));
  var ops = wallOpeningsOf(w);
  if (empty) empty.hidden = ops.length > 0;
  var counts = { door: 0, window: 0, passage: 0 };
  ops.forEach(function (o) {
    counts[openingTypeKey(o.type)]++;
  });
  [["w_cntDoor", counts.door], ["w_cntWin", counts.window], ["w_cntPass", counts.passage]].forEach(function (pair) {
    var el = document.getElementById(pair[0]);
    if (!el) return;
    el.hidden = !pair[1];
    el.textContent = String(pair[1]);
  });
  var tabBadge = document.getElementById("w_tabBadgeOpen");
  if (tabBadge) {
    tabBadge.hidden = !ops.length;
    tabBadge.textContent = String(ops.length);
  }

  ops.forEach(function (o) {
    var card = document.createElement("div");
    card.className = "w-open-card" + (openingFocused(o) ? " sel" : "");
    var fromA = Math.max(0, (o.s || 0) - o.width / 2),
      fromB = Math.max(0, L - ((o.s || 0) + o.width / 2));

    var ico = document.createElement("span");
    ico.className = "ico";
    ico.innerHTML = '<i class="ph ' +
      (o.type === "door" ? "ph-door" : o.type === "window" ? "ph-square" : "ph-door-open") + '"></i>';

    var nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = t(openingTypeKey(o.type)) + " · " + fmtLen(o.width, { domain: "openings", suffix: false }) + "×" + fmtLen(o.height, { domain: "openings" });

    var sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = "A " + Math.round(fromA) + " · B " + Math.round(fromB) +
      (o.sill ? " · " + t("sill") + " " + Math.round(o.sill) : "");

    var tools = document.createElement("span");
    tools.className = "tools";
    var edit = document.createElement("button");
    edit.type = "button";
    edit.title = t("wi_editOpening");
    edit.innerHTML = '<i class="ph ph-pencil-simple"></i>';
    edit.addEventListener("click", function (e) {
      e.stopPropagation();
      select({ kind: "opening", ref: o });
      render2D();
    });

    var del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.title = t("del");
    del.innerHTML = '<i class="ph ph-trash"></i>';
    del.addEventListener("click", function (e) {
      e.stopPropagation();
      /* deleteSel owns the constraint pruning an opening drags with it, so the
         card borrows it rather than filtering S.openings by hand — and hands
         the wall back, because deleting one of its openings is not a reason to
         lose the wall you were editing. */
      var wall = w;
      select({ kind: "opening", ref: o });
      import("../interaction.js").then(function (m) {
        m.deleteSel();
        select({ kind: "wall", ref: wall });
        wallTab("openings");
        render2D();
      });
    });
    tools.appendChild(edit);
    tools.appendChild(del);

    card.appendChild(ico);
    card.appendChild(nm);
    card.appendChild(sub);
    card.appendChild(tools);
    card.title = t("wi_openFocusHint");
    card.addEventListener("click", function () {
      focusOpening(w, o);
    });
    list.appendChild(card);
  });
}

function fmtCm(v) {
  return fmtLen(v);
}

/* Layer materials are authored as slugs ("concrete-block"). Translate the ones
   worth naming and prettify the rest rather than showing the slug. */
function matLabel(material) {
  var key = "mat_" + String(material || "").replace(/-/g, "_");
  var s = t(key);
  if (s && s !== key) return s;
  return String(material || "")
    .replace(/[-_]+/g, " ")
    .replace(/^./, function (c) { return c.toUpperCase(); });
}

function sectionReadout(html) {
  var el = document.getElementById("w_secRead");
  if (el) el.innerHTML = html;
}

function sectionSummary(w, bands) {
  var T = bands.reduce(function (s, b) { return s + Math.max(0, b.end - b.start); }, 0);
  var r = bands.reduce(function (s, b) { return s + (Number(b.rValue) || 0); }, 0);
  return '<b>' + t(bands.length === 1 ? "wi_assemblyOne" : "wi_assemblyTotal", { n: bands.length }) + "</b>" +
    (r > 0 ? '<span>· R ' + (Math.round(r * 100) / 100) + "</span>" : "") +
    '<span class="num">' + fmtCm(T) + "</span>";
}

/* The five faces a wall's thickness can be measured from, in the coordinates
   the section is drawn in. Clicking one is the same edit as the dropdown —
   picking it on the drawing is just the gesture that does not require knowing
   what "main layer exterior" is called. */
function datumFaces(bands) {
  var main = bands.filter(function (b) { return b.main; })[0] || bands[0];
  var tMin = bands[0].start,
    tMax = bands[bands.length - 1].end;
  /* Priority order, not drawing order: on a single-layer wall the outer face
     and the main layer's outer face are the same line, and the useful name for
     it is the plain face. Dedupe first, then sort into the order they are
     actually stacked. */
  var out = [
    { y: tMin, datum: "exterior", key: "wallDatumOuter" },
    { y: tMax, datum: "interior", key: "wallDatumInner" },
    { y: (tMin + tMax) / 2, datum: "center", key: "wallDatumCenter" },
    { y: main.start, datum: "main-exterior", key: "wallDatumMainOutside" },
    { y: main.end, datum: "main-interior", key: "wallDatumMainInside" },
  ];
  return out
    .filter(function (f, i) {
      return out.findIndex(function (g) { return Math.abs(g.y - f.y) < 0.05; }) === i;
    })
    .sort(function (a, b) { return a.y - b.y; });
}

function fillWallSection(w) {
  var host = document.getElementById("w_section");
  if (!host) return;
  var bands = wallLayerBands(w, S);
  if (!bands.length) {
    host.innerHTML = "";
    sectionReadout("");
    return;
  }
  var tMin = Infinity,
    tMax = -Infinity;
  bands.forEach(function (b) {
    tMin = Math.min(tMin, b.start);
    tMax = Math.max(tMax, b.end);
  });
  var T = Math.max(0.1, tMax - tMin),
    padY = Math.max(2, T * 0.18),
    W = 100;
  var parts = [
    '<defs><pattern id="wSecHatch" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<line x1="0" y1="0" x2="0" y2="3.2" class="w-sec-hatch-line"/>' +
      "</pattern></defs>",
  ];
  bands.forEach(function (b, i) {
    var bw = b.end - b.start;
    if (bw <= 0.01) return;
    var tip = matLabel(b.material) + " · " + fmtCm(bw);
    parts.push(
      '<rect class="w-sec-layer" data-band="' + i + '" x="0" y="' + b.start + '" width="' + W + '" height="' + bw + '" fill="' + (b.color || "#c8c5bb") + '">' +
        "<title>" + tip + "</title></rect>",
    );
    if (b.airGap && b.framing)
      parts.push(
        '<rect class="w-sec-layer" data-band="' + i + '" x="0" y="' + b.start + '" width="' + W + '" height="' + bw + '" fill="url(#wSecHatch)"><title>' + tip + "</title></rect>",
      );
    if (b.main)
      parts.push(
        '<rect class="w-sec-main" x="0.5" y="' + (b.start + 0.5) + '" width="' + (W - 1) + '" height="' + Math.max(0.3, bw - 1) + '"/>',
      );
    if (bw / T > 0.14)
      parts.push('<text class="w-sec-num" x="' + W / 2 + '" y="' + (b.start + bw / 2) + '">' + Math.round(bw * 10) / 10 + "</text>");
  });
  // assembly centreline, then the datum face this wall's snapping hangs on
  var mid = (tMin + tMax) / 2;
  if (Math.abs(mid) > 0.05)
    parts.push('<line class="w-sec-center" x1="-4" y1="' + mid + '" x2="' + (W + 4) + '" y2="' + mid + '"/>');
  parts.push('<line class="w-sec-datum" x1="-4" y1="0" x2="' + (W + 4) + '" y2="0"/>');
  parts.push('<path class="w-sec-datum" d="M ' + (W + 4) + ' 0 l 3 -1.8 l 0 3.6 z"/>');
  // the faces the datum can move to, as click targets over the whole width
  datumFaces(bands).forEach(function (f) {
    parts.push(
      '<g class="w-sec-face" data-datum="' + f.datum + '" data-face="' + f.key + '">' +
        "<title>" + t("wi_setDatum", { face: t(f.key) }) + "</title>" +
        '<rect class="w-sec-dim" x="-4" y="' + (f.y - Math.min(1.2, T * 0.09)) + '" width="' + (W + 8) + '" height="' + 2 * Math.min(1.2, T * 0.09) + '"/>' +
        '<line class="w-sec-dim-line" x1="-4" y1="' + f.y + '" x2="' + (W + 4) + '" y2="' + f.y + '"/>' +
        "</g>",
    );
  });
  parts.push('<text class="w-sec-total" x="' + W / 2 + '" y="' + (tMax + padY * 0.9 + 4) + '">' + fmtCm(T) + "</text>");
  host.innerHTML =
    '<svg viewBox="-4 ' + (tMin - padY) + " " + (W + 8) + " " + (T + padY * 2 + 6) + '" preserveAspectRatio="xMidYMid meet">' +
    parts.join("") +
    "</svg>";
  sectionReadout(sectionSummary(w, bands));

  host.querySelectorAll("[data-band]").forEach(function (el) {
    el.addEventListener("mouseenter", function () {
      var b = bands[+el.getAttribute("data-band")];
      if (!b) return;
      host.querySelectorAll('[data-band="' + el.getAttribute("data-band") + '"]').forEach(function (x) {
        x.classList.add("hot");
      });
      sectionReadout(
        '<span class="sw" style="background:' + (b.color || "#c8c5bb") + '"></span>' +
          "<b>" + matLabel(b.material) + "</b>" +
          (b.role ? "<span>· " + matLabel(b.role) + "</span>" : "") +
          '<span class="num">' + fmtCm(b.end - b.start) + "</span>",
      );
    });
    el.addEventListener("mouseleave", function () {
      host.querySelectorAll(".hot").forEach(function (x) { x.classList.remove("hot"); });
      sectionReadout(sectionSummary(w, bands));
    });
  });
  host.querySelectorAll("[data-datum]").forEach(function (el) {
    el.addEventListener("mouseenter", function () {
      sectionReadout("<b>" + t(el.getAttribute("data-face")) + "</b><span>· " + t("wi_clickDatum") + "</span>");
    });
    el.addEventListener("click", function () {
      if (!S.sel || S.sel.kind !== "wall") return;
      pushHistory();
      S.sel.ref.datum = el.getAttribute("data-datum");
      S.dirty3D = true;
      fillProps();
      render2D();
    });
  });
  // the assembly itself is one gesture away from the drawing of it.
  // Property assignment, not addEventListener: this runs on every re-render.
  host.ondblclick = openWallTypes;
}

export {
  bindWallTabs, fillWallFlip, fillWallHead, fillWallOpenings, fillWallSection,
  fillWallStats, fmtCm, focusOpening, m2, matLabel, openingFocused,
  openingTypeKey, wallOpeningArea, wallOpeningsOf, wallSolidHeight,
};
