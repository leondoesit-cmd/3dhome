/* Inspector wall end/side/location sync, variants and marker readouts, split
   out of js/ui_props.js. It shares the editor's state through live imports from
   ../ui_props.js. */
import { fmtLen, writeLen } from "../display_units.js";
import { ceilingHeight } from "../elevation.js";
import { flabel, itemVSpan, variantList, variantOf, vlabel } from "../furniture.js";
import { jointInfo, wallDimSide, wallGeom, wallSideNormal } from "../geometry.js";
import { t } from "../i18n.js";
import { squarableArm } from "../joint_square.js";
import { markerInfo, markerLabel } from "../markers.js";
import { render2D } from "../plan2d.js";
import { S } from "../state.js";
import { syncPinBtn } from "../ui_props/cons.js";
import { angleSectorAtNode } from "../wall_constraints.js";
import { select, showPanel, writeInspectorLen } from "../ui_props.js";

/* Mirror S.wallEditEnd onto the segmented picker. Called on selection and again
   whenever a half is picked by clicking it in the plan. */
export function syncWallEnd() {
  var box = document.getElementById("w_end");
  if (!box) return;
  var cur = S.wallEditEnd || "";
  Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) {
    b.classList.toggle("active", b.dataset.end === cur);
  });
}

/* Which FACE the wall's length is measured along. The two side buttons are
   named by where that face actually IS on screen for THIS wall — "top/bottom"
   for a wall running across the plan, "left/right" for one running down it —
   because "side +1 of the a→b direction" is not a thing anyone can picture,
   and the drawing direction is invisible once the wall is drawn. */
export function syncWallSide(w) {
  var box = document.getElementById("w_side");
  if (!box || !w) return;
  var g = wallGeom(w),
    n = wallSideNormal(g),
    horiz = Math.abs(g.ux) >= Math.abs(g.uz);
  function nameFor(sign) {
    var x = n.x * sign,
      z = n.z * sign;
    return horiz ? t(z > 0 ? "side_down" : "side_up") : t(x > 0 ? "side_right" : "side_left");
  }
  var pos = document.getElementById("w_sidePos"),
    neg = document.getElementById("w_sideNeg");
  if (pos) pos.textContent = nameFor(1);
  if (neg) neg.textContent = nameFor(-1);
  // an explicit choice highlights itself; "auto" highlights auto AND shows
  // which face it resolved to, so the number on the plan is never a mystery
  var explicit = w.dimSide === 1 || w.dimSide === -1 || w.dimSide === 0,
    cur = explicit ? String(w.dimSide) : "",
    resolved = String(wallDimSide(w));
  Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) {
    var v = b.dataset.side;
    b.classList.toggle("active", v === cur);
    b.classList.toggle("resolved", !explicit && v === resolved);
  });
  syncWallLoc(w);
}
/* Which line of the wall the MODEL stores. "The measured face" is only
   offerable once that face exists, so it is disabled on a centreline dimension
   and on a curved wall (an offset changes an arc's radius, it cannot translate
   it). "Whole run" hangs every collinear member on that same face; a 90°
   branch sharing the T-node stays welded. Thickness edits of a run do this
   automatically so the interior stays flush. */
function syncWallLoc(w) {
  var box = document.getElementById("w_loc"),
    row = document.getElementById("w_locRow");
  if (!box || !row || !w) return;
  var curved = wallGeom(w).kind === "arc",
    centreline = wallDimSide(w) === 0,
    on = w.loc === "face";
  row.classList.toggle("dim", curved || centreline);
  Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) {
    var v = b.dataset.loc;
    b.classList.toggle("active", v === (on ? "face" : "center"));
    b.disabled = (curved || centreline) && v !== "center";
  });
}

// style/finish picker for the selected piece — hidden for models with no variants
function fillVariants(it) {
  var box = document.getElementById("i_variant_box"),
    sel = document.getElementById("i_variant");
  if (!box || !sel) return;
  var vs = variantList(it.type);
  if (!vs) {
    box.style.display = "none";
    return;
  }
  box.style.display = "";
  sel.innerHTML = "";
  vs.forEach(function (v) {
    var o = document.createElement("option");
    o.value = v.id;
    o.textContent = vlabel(v);
    sel.appendChild(o);
  });
  var cur = variantOf(it);
  sel.value = cur ? cur.id : vs[0].id;
}

/* Where the point sits, as plain rows: the room it falls in, the wall it is
   mounted on (or simply the nearest one), the closest other piece, and — when
   something stands here — that piece's real size and how high it ends up. Every
   line is derived on read (markerInfo), and a line with nothing to say is left
   out entirely rather than printed as a dash. */
function fillMarkerInfo(info) {
  var box = document.getElementById("mk_info");
  if (!box) return;
  box.innerHTML = "";
  function row(icon, lbl, val) {
    if (val == null || val === "") return;
    var d = document.createElement("div");
    d.className = "mk-info-row";
    d.innerHTML = '<i class="ph ph-' + icon + '"></i>';
    var a = document.createElement("span");
    a.className = "mk-info-lbl";
    a.textContent = lbl;
    var b = document.createElement("b");
    b.textContent = val;
    d.appendChild(a);
    d.appendChild(b);
    box.appendChild(d);
  }
  row("polygon", t("room"), info.room ? info.roomName || t("room") : t("mk_outside"));
  if (info.wall)
    row(
      "wall",
      t("mk_sf_wall"),
      "#" + info.wall.id + (info.wallIsMount ? " · " + fmtLen(info.wallDist) : ""),
    );
  else if (info.wallDist != null)
    row("wall", t("mk_nearWall"), fmtLen(info.wallDist));
  if (info.near)
    row("cube", t("mk_nearObj"), flabel(info.near.item.type) + " · " + fmtLen(info.near.dist));
  var h = info.held;
  if (h) {
    row(
      "ruler",
      t("mk_size"),
      fmtLen(h.w, { suffix: false }) + "×" + fmtLen(h.d, { suffix: false }) + "×" + fmtLen(h.h),
    );
    // where the piece actually ends up in the room's height, which is the whole
    // question a wall or ceiling point is asked
    var sp = itemVSpan(h);
    row("arrows-vertical", t("mk_span"), fmtLen(sp.lo, { suffix: false }) + " → " + fmtLen(sp.hi));
  }
}

/* Everything on the point panel EXCEPT the text inputs. Kept separate so a
   coordinate typed into mk_x/mk_z can refresh the clearances live without
   fillProps writing a rounded value back into the field being typed in. */
export function refreshMarkerReadout() {
  if (!S.sel || S.sel.kind !== "marker") return;
  var m = S.sel.ref,
    info = markerInfo(m, ceilingHeight()),
    held = info.held;
  // the same clearances the plan and the elevations draw: from the point while
  // it is free, and from its object's outer edges once something stands there
  var dm = info.dm;
  ["n", "s", "e", "w"].forEach(function (k) {
    document.getElementById("mk_d_" + k).textContent =
      dm[k] == null ? "—" : fmtLen(dm[k], { suffix: false });
    // a side that falls short of the point's own required clearance is called
    // out here rather than silently printed — the number alone reads fine
    document
      .getElementById("mk_c_" + k)
      .classList.toggle("warn", info.tight.indexOf(k) !== -1);
  });
  var tightEl = document.getElementById("mk_tight");
  tightEl.style.display = info.tight.length ? "" : "none";
  tightEl.textContent = info.tight.length
    ? t("mk_tight", {
        req: fmtLen(m.req),
        sides: info.tight
          .map(function (k) {
            return t("mk_dir_" + k);
          })
          .join(", "),
      })
    : "";
  document.getElementById("mk_d_up").textContent = fmtLen(info.y, { suffix: false });
  document.getElementById("mk_d_ceil").textContent =
    info.toCeil == null ? "—" : fmtLen(info.toCeil, { suffix: false });
  fillMarkerInfo(info);
  document.getElementById("mk_surface").value = m.surface || "floor";
  document.getElementById("selname_mk").textContent = markerLabel(m);
  document.getElementById("mk_holds").textContent = held
    ? t("mk_holds", { name: flabel(held.type) })
    : t("mk_free");
  document.getElementById("mk_place_lbl").textContent = t(held ? "mk_swap" : "mk_place");
  document.getElementById("mk_go_btn").disabled = !held;
  document.getElementById("mk_release_btn").disabled = !held;
}

function fillMarker(m) {
  showPanel("marker");
  document.getElementById("mk_name").value = m.name || "";
  writeInspectorLen("mk_x", m.x);
  writeInspectorLen("mk_y", m.y || 0);
  writeInspectorLen("mk_z", m.z);
  document.getElementById("mk_req").value = m.req != null ? fmtLen(m.req, { suffix: false }) : "";
  document.getElementById("mk_note").value = m.note || "";
  refreshMarkerReadout();
}

function fillSlabVoid(o) {
  showPanel("slabvoid");
  document.getElementById("selname_sv").textContent = o.name || t("sv_title");
  document.getElementById("sv_name").value = o.name || "";
  writeInspectorLen("sv_x", o.x);
  writeInspectorLen("sv_z", o.z);
  writeInspectorLen("sv_w", o.w);
  writeInspectorLen("sv_d", o.d);
  document.getElementById("sv_rot").value = Math.round(o.rot || 0);
}

/* The corner inspector. A joint had no panel at all — selecting one showed
   whatever the last selection left on screen — yet it is the one thing in the
   plan whose numbers you cannot read off the drawing: which walls actually meet
   here (as opposed to merely crossing), and at what angles. Each arm row picks
   its wall, so the corner is also a way to get at the walls around it. */
export function fillJoint(ni) {
  showPanel("node");
  var info = jointInfo(ni);
  if (!info) return;
  writeLen(document.getElementById("nd_x"), info.x);
  writeLen(document.getElementById("nd_z"), info.z);
  document.getElementById("selname_nd").textContent =
    t("nd_title") + (info.open ? " · " + t("nd_open") : "");
  document.getElementById("nd_state").textContent = t("nd_walls", {
    n: info.arms.length,
  });
  var box = document.getElementById("nd_arms");
  box.innerHTML = "";
  info.arms.forEach(function (arm) {
    var row = document.createElement("div");
    row.className = "mk-info-row nd-arm";
    row.innerHTML = '<i class="ph ph-wall"></i>';
    var nm = document.createElement("span");
    nm.className = "mk-info-lbl";
    nm.textContent = t("wall") + " " + arm.wall.id;
    var v = document.createElement("b");
    v.textContent = fmtLen(arm.len) + " · " + Math.round(arm.ang) + "°";
    row.appendChild(nm);
    row.appendChild(v);
    row.onclick = function () {
      select({ kind: "wall", ref: arm.wall });
      render2D();
    };
    box.appendChild(row);
  });
  /* The angle BETWEEN the arms is the number the corner exists to answer, so a
     corner that is neither square nor a straight run says so in red — the same
     complaint the warning list makes, at the place you are looking. */
  info.gaps.forEach(function (g) {
    var row = document.createElement("div");
    row.className = "mk-info-row";
    row.innerHTML = '<i class="ph ph-angle"></i>';
    var nm = document.createElement("span");
    nm.className = "mk-info-lbl";
    nm.textContent = t("wall") + " " + g.a.id + " ↔ " + g.b.id;
    var v = document.createElement("b");
    var deg = Math.round(g.deg * 10) / 10;
    v.textContent = deg + "°";
    var square = Math.abs(deg - 90) < 0.5 || Math.abs(deg - 270) < 0.5,
      straight = Math.abs(deg - 180) < 0.5;
    if (!square && !straight) row.classList.add("warn");
    row.appendChild(nm);
    row.appendChild(v);
    box.appendChild(row);
  });
  document.getElementById("nd_square_btn").disabled = !squarableArm(info);
  var setAngle = document.getElementById("nd_set_angle_btn");
  if (setAngle) setAngle.disabled = !angleSectorAtNode(ni);
  var pairTools = document.getElementById("nd_pair_tools");
  if (pairTools) pairTools.hidden = true;
  syncPinBtn([ni]);
}

export { fillMarker, fillSlabVoid, fillVariants };
