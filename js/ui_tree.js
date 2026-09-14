import { S } from "./state.js";
import {
  roomName,
  roomHidden,
  reconcileRoomMeta,
  normalizeStructure,
  detectRoomCycles,
  roomDeclined,
  itemsInRoom,
} from "./geometry.js";
import { openModal, flash } from "./ui.js";
import { weldCoincidentNodes } from "./interaction.js";
import { deleteRoom } from "./interaction.js";
import { PRICE, itemPrice, flabel } from "./furniture.js";
import { t } from "./i18n.js";
import { fmtLen, fmtAreaM2 } from "./display_units.js";
import { render2D, frameBounds } from "./plan2d.js";
import { select, fillProps } from "./ui_props.js";
import { pushHistory } from "./history.js";
import { orphanChildren } from "./stack.js";
import {
  ensureMEP, MEP_SYS, MEP_SYS_ORDER, sysLabel, nodeLabel, runLabel,
  nodeKindDef, computeMEPStatus, mepBOM, runLength, deleteMEP,
} from "./mep.js";
import { markers, markerDesc, deleteMarker } from "./markers.js";
import { slabOpenings, removeSlabOpening } from "./slab_openings.js";
import { broadcastPlanOp } from "./plan_sync.js";
import { syncLocks, syncClears, pruneIgnored } from "./constraint_engine.js";
import { renderWarnPanel } from "./ui_warn.js";

function treeRow(label, locked, isSel, onSel, onLock, onDelete, onFrame) {
  var row = document.createElement("div");
  row.className = "trItem" + (isSel ? " sel" : "");
  var lk = document.createElement("span");
  lk.className = "trLk";
  lk.textContent = locked ? "🔒" : "🔓";
  lk.title = t("tr_lock");
  lk.onclick = function (ev) {
    ev.stopPropagation();
    onLock();
  };
  row.appendChild(lk);
  var nm = document.createElement("span");
  nm.className = "trName";
  nm.textContent = label;
  row.appendChild(nm);
  if (onDelete) {
    var del = document.createElement("span");
    del.className = "trDel";
    del.textContent = "✕";
    del.title = t("tr_del");
    del.onclick = function (ev) {
      ev.stopPropagation();
      onDelete();
    };
    row.appendChild(del);
  }
  row.onclick = onSel;
  if (onFrame) row.ondblclick = function (ev) {
    ev.preventDefault();
    onFrame();
  };
  return row;
}

function itemBounds(it) {
  var a = ((Number(it.rot) || 0) * Math.PI) / 180,
    hw = Math.max(1, Number(it.w) || 1) / 2,
    hd = Math.max(1, Number(it.d) || 1) / 2,
    ex = Math.abs(Math.cos(a)) * hw + Math.abs(Math.sin(a)) * hd,
    ez = Math.abs(Math.sin(a)) * hw + Math.abs(Math.cos(a)) * hd;
  return { minx: it.x - ex, maxx: it.x + ex, minz: it.z - ez, maxz: it.z + ez };
}
function roomBounds(room) {
  var pts = (room && room.nidx || []).map(function (i) { return S.nodes[i]; }).filter(Boolean);
  if (!pts.length) return null;
  return {
    minx: Math.min.apply(null, pts.map(function (p) { return p.x; })),
    maxx: Math.max.apply(null, pts.map(function (p) { return p.x; })),
    minz: Math.min.apply(null, pts.map(function (p) { return p.z; })),
    maxz: Math.max.apply(null, pts.map(function (p) { return p.z; })),
  };
}
function frameTreeTarget(sel, bounds) {
  select(sel);
  if (frameBounds(bounds, 84)) render2D();
}

// remove a single item (shared by every item row's ✕ button)
function deleteItem(it) {
  pushHistory();
  S.items = S.items.filter(function (x) {
    return x !== it;
  });
  // anything that was standing on it comes down to the floor
  orphanChildren(null);
  if (S.sel && S.sel.kind === "item" && S.sel.ref === it) select(null);
  S.dirty3D = true;
  refreshTree();
  render2D();
}

function fmtILS(n) {
  return "₪" + Math.round(n).toLocaleString("en-US");
}

export function updateCost() {
  var listEl = document.getElementById("costList"),
    totEl = document.getElementById("costTotal");
  if (!listEl || !totEl) return;
  var groups = {},
    order = [];
  S.items.forEach(function (it) {
    if (!PRICE[it.type]) return;
    // Modular cabinets are priced per piece, so two of them only share a line
    // when they cost the same — a plain type key would price them all alike.
    var key = it.cab ? it.type + "@" + itemPrice(it) : it.type;
    if (!groups[key]) {
      groups[key] = { type: it.type, qty: 0, unit: itemPrice(it) };
      order.push(key);
    }
    groups[key].qty++;
  });
  var total = 0;
  order.forEach(function (ty) {
    total += groups[ty].qty * groups[ty].unit;
  });
  var bom = mepBOM();
  total += bom.total;
  totEl.textContent = fmtILS(total);
  listEl.innerHTML = "";
  if (!order.length && !bom.total) {
    var e = document.createElement("div");
    e.className = "cost-empty";
    e.textContent = t("cost_empty");
    listEl.appendChild(e);
    return;
  }
  function costRow(nameTxt, valNum, cls) {
    var row = document.createElement("div");
    row.className = "cost-row" + (cls ? " " + cls : "");
    var name = document.createElement("span");
    name.className = "cost-name";
    name.textContent = nameTxt;
    var val = document.createElement("span");
    val.className = "cost-val";
    val.textContent = fmtILS(valNum);
    row.appendChild(name);
    row.appendChild(val);
    listEl.appendChild(row);
  }
  order
    .map(function (ty) { return groups[ty]; })
    .sort(function (a, b) { return b.qty * b.unit - a.qty * a.unit; })
    .forEach(function (g) {
      costRow(flabel(g.type) + (g.qty > 1 ? " ×" + g.qty : ""), g.qty * g.unit);
    });
  // Infrastructure (MEP) materials — devices then runs (by length)
  if (bom.total) {
    var hdr = document.createElement("div");
    hdr.className = "cost-subhead";
    hdr.textContent = t("cost_infra");
    listEl.appendChild(hdr);
    bom.devices
      .sort(function (a, b) { return b.cost - a.cost; })
      .forEach(function (g) {
        costRow(sysLabel(g.sys) + " · " + nodeLabel(g.sys, g.k) + (g.qty > 1 ? " ×" + g.qty : ""), g.cost);
      });
    bom.runs
      .sort(function (a, b) { return b.cost - a.cost; })
      .forEach(function (g) {
        costRow(sysLabel(g.sys) + " · " + runLabel(g.sys, g.k) + " · " + g.meters.toFixed(1) + t("m"), g.cost);
      });
  }
}

export function exportCostCSV() {
  var groups = {},
    order = [];
  S.items.forEach(function (it) {
    if (!PRICE[it.type]) return;
    var key = it.cab ? it.type + "@" + itemPrice(it) : it.type;
    if (!groups[key]) {
      groups[key] = { type: it.type, qty: 0, unit: itemPrice(it) };
      order.push(key);
    }
    groups[key].qty++;
  });
  var rows = [["Item", "Qty", "Unit (ILS)", "Total (ILS)"]],
    total = 0;
  order.forEach(function (ty) {
    var g = groups[ty],
      line = g.qty * g.unit;
    total += line;
    rows.push([flabel(g.type), g.qty, g.unit, line]);
  });
  // Infrastructure (MEP) materials
  var bom = mepBOM();
  bom.devices.forEach(function (g) {
    total += g.cost;
    rows.push([sysLabel(g.sys) + " · " + nodeLabel(g.sys, g.k), g.qty, g.price, g.cost]);
  });
  bom.runs.forEach(function (g) {
    total += g.cost;
    rows.push([sysLabel(g.sys) + " · " + runLabel(g.sys, g.k) + " (" + g.meters.toFixed(1) + "m)", g.meters.toFixed(1), g.ppm, Math.round(g.cost)]);
  });
  rows.push(["", "", t("cost_total"), Math.round(total)]);
  var csv = rows
    .map(function (r) {
      return r
        .map(function (c) {
          return '"' + String(c).replace(/"/g, '""') + '"';
        })
        .join(",");
    })
    .join("\r\n");
  var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "shopping-list.csv";
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

/* ---- auto-detected rooms --------------------------------------------------
   A space becomes a room the moment walls close around it. Enclosures are
   tracked by CENTROID rather than by room key: the key is the sorted list of
   bounding wall ids, so it changes on any wall edit, and keying off it would
   re-announce the same room every time the user touched one of its walls.

   `roomsKnown` is the set of enclosures we have already seen (and therefore
   already asked about, or inherited from a loaded file). */
var roomsKnown = null; // null = not yet seeded
var promptsOn = true;
function seedKnownRooms(cycles) {
  roomsKnown = (cycles || detectRoomCycles()).map(function (r) {
    return { cx: r.cx, cz: r.cz };
  });
}
function wasKnown(r) {
  return roomsKnown.some(function (k) {
    return Math.hypot(k.cx - r.cx, k.cz - r.cz) < 40; // same space, maybe resized
  });
}
/* Load / undo / reset / auto-generate legitimately materialise many rooms at
   once; those must not fire a prompt each. Run them through here — the new
   enclosures are absorbed silently. */
export function withoutRoomPrompts(fn) {
  var prev = promptsOn;
  promptsOn = false;
  try {
    fn();
  } finally {
    promptsOn = prev;
    seedKnownRooms();
  }
}

// "Room 3" — first number not already taken by an existing room name
function autoRoomName() {
  var taken = {};
  Object.keys(S.roomMeta).forEach(function (k) {
    var nm = S.roomMeta[k] && S.roomMeta[k].name;
    if (nm) taken[nm] = 1;
  });
  var base = t("room_auto_name");
  for (var i = 1; i < 500; i++) if (!taken[base + " " + i]) return base + " " + i;
  return base;
}

/* Ask about each new enclosure, one at a time. The room already exists as far
   as the geometry is concerned — this decides whether it is *treated* as one,
   and under what name. */
function offerNewRooms(list) {
  if (!list.length) return;
  var r = list[0],
    rest = list.slice(1);
  var suggested = autoRoomName();
  var decided = false;

  var m = openModal(t("room_new_title"));
  var p = document.createElement("p");
  p.textContent = t("room_new_body", { area: fmtAreaM2(r.area / 10000) });
  m.body.appendChild(p);

  var input = document.createElement("input");
  input.type = "text";
  input.className = "w-full";
  input.placeholder = t("room_new_ph");
  input.value = suggested; // untouched = the automatic name, as asked
  m.body.appendChild(input);
  /* Naming the room is the whole point of the dialog, so put the caret in the
     field and select the suggestion — typing replaces it, Enter accepts it.
     Focus has to wait a frame: the overlay is appended in the same tick. */
  requestAnimationFrame(function () {
    try { input.focus(); input.select(); } catch (e) {}
  });

  function accept() {
    if (decided) return;
    decided = true;
    var nm = input.value.trim() || suggested;
    var mm = (S.roomMeta[r.key] = S.roomMeta[r.key] || {});
    mm.name = nm;
    // give the room a concrete floor of its own rather than only inheriting
    // the global default, so it can be restyled independently right away
    if (!mm.floor) mm.floor = S.floorTex;
    mm.cx = r.cx;
    mm.cz = r.cz;
    S.dirty3D = true;
    m.close();
    flash(t("f_roomCreated", { name: nm }), "success");
    finish();
  }
  function decline() {
    if (decided) return;
    decided = true;
    var mm = (S.roomMeta[r.key] = S.roomMeta[r.key] || {});
    mm.noRoom = true; // drops out of detectRooms() → no floor, no label, no cost
    mm.cx = r.cx;
    mm.cz = r.cz;
    S.dirty3D = true;
    m.close();
    flash(t("f_roomDeclined"));
    finish();
  }
  function finish() {
    render2D();
    refreshTree();
    if (rest.length) offerNewRooms(rest);
  }

  var no = document.createElement("button");
  no.textContent = t("room_new_cancel");
  no.addEventListener("click", decline);
  var yes = document.createElement("button");
  yes.className = "btn-primary";
  yes.textContent = t("room_new_ok");
  yes.addEventListener("click", accept);
  m.actions.appendChild(no);
  m.actions.appendChild(yes);

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") accept();
  });
  /* Esc/backdrop is cancellation too. A modal that says "Create room" must not
     silently take that action when it is dismissed.

     This has to be an onClose HANDLER, not an override of m.close: openModal's
     own Escape and backdrop listeners call its internal close() directly and
     never look at the property, so reassigning it left BOTH dismissals doing
     nothing at all — no name, no decline, no metadata written, while the
     enclosure went on being drawn as a room. It also skipped finish(), which is
     what offers the next enclosure, so dismissing the first prompt of several
     silently dropped the rest. */
  m.onClose(function () {
    if (decided) return;
    decided = true;
    var mm = (S.roomMeta[r.key] = S.roomMeta[r.key] || {});
    mm.noRoom = true;
    mm.cx = r.cx;
    mm.cz = r.cz;
    S.dirty3D = true;
    flash(t("f_roomDeclined"));
    finish();
  });
  input.focus();
  input.select();
}

export function refreshTree() {
  // A structural edit can change a room's key, so hand metadata over to the
  // room that inherited the space BEFORE anything reads it (cost totals, floor
  // lookups, the rows below).
  // Merge corners that were dragged on top of each other BEFORE detecting
  // rooms — a coincident pair reads as an open shape and yields no room.
  weldCoincidentNodes();
  normalizeStructure();
  /* Constraint engine: every wall that arrived without one gets the
     measurements it is holding, acknowledgements for walls that no longer exist
     are dropped, and the warning list is resynced with the new geometry. */
  syncLocks();
  syncClears(); // ...including the interior span each wall now holds
  pruneIgnored();
  renderWarnPanel();
  var cycles = reconcileRoomMeta();
  if (roomsKnown === null) seedKnownRooms(cycles);
  else {
    // Anything already named or already declined is not a new enclosure — that
    // covers rooms whose metadata reconcileRoomMeta just carried across.
    var fresh = cycles.filter(function (r) {
      var mm = S.roomMeta[r.key];
      return !wasKnown(r) && !(mm && (mm.name || mm.noRoom));
    });
    seedKnownRooms(cycles);
    if (promptsOn && fresh.length && !S.workspace?.guidance?.enabled) offerNewRooms(fresh);
  }
  var rs = cycles.filter(function (r) {
    return !roomDeclined(r.key);
  });
  updateCost();
  var body = document.getElementById("treeBody");
  if (!body) return;
  body.innerHTML = "";
  var assigned = {};
  rs.forEach(function (r) {
    var lockedR = !!(S.roomMeta[r.key] && S.roomMeta[r.key].locked);
    var hiddenR = roomHidden(r.key);
    var inR = itemsInRoom(r);
    var head = document.createElement("div");
    head.className =
      "trRoom" +
      (S.sel && S.sel.kind === "room" && S.sel.ref === r.key ? " sel" : "") +
      (hiddenR ? " hid" : "");
    var lk = document.createElement("span");
    lk.className = "trLk";
    lk.textContent = lockedR ? "🔒" : "🔓";
    lk.title = t("tr_lockRoom");
    lk.onclick = function (ev) {
      ev.stopPropagation();
      var m = (S.roomMeta[r.key] = S.roomMeta[r.key] || {});
      m.locked = !m.locked;
      refreshTree();
      render2D();
    };
    head.appendChild(lk);
    var nm = document.createElement("span");
    nm.className = "trRoomName";
    nm.textContent = roomName(r.key) || t("room");
    nm.title = t("tr_rename");
    // double-click the name → inline rename (persists to roomMeta.name)
    nm.ondblclick = function (ev) {
      ev.stopPropagation();
      var inp = document.createElement("input");
      inp.className = "trRename";
      inp.value = roomName(r.key);
      inp.onclick = function (e) {
        e.stopPropagation();
      };
      var done = false;
      function commit(save) {
        if (done) return;
        done = true;
        if (save) {
          var m = (S.roomMeta[r.key] = S.roomMeta[r.key] || {});
          m.name = inp.value.trim();
        }
        refreshTree();
        fillProps();
        render2D();
      }
      inp.onkeydown = function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          commit(false);
        }
      };
      inp.onblur = function () {
        commit(true);
      };
      nm.replaceWith(inp);
      inp.focus();
      inp.select();
    };
    head.appendChild(nm);
    var meta = document.createElement("span");
    meta.className = "trMeta";
    meta.textContent =
      (r.area / 10000).toFixed(1) + " " + t("sqm") + " · " + inR.length;
    meta.title = inR.length + " " + t("tr_items");
    head.appendChild(meta);
    // hide: drop the room out of both views (its own walls, floor, contents)
    // without touching the model — the row stays here to bring it back
    var eye = document.createElement("span");
    eye.className = "trEye" + (hiddenR ? " on" : "");
    eye.innerHTML = '<i class="ph ph-eye' + (hiddenR ? "-slash" : "") + '"></i>';
    eye.title = t(hiddenR ? "tr_showRoom" : "tr_hideRoom");
    eye.onclick = function (ev) {
      ev.stopPropagation();
      pushHistory();
      var m = (S.roomMeta[r.key] = S.roomMeta[r.key] || {});
      m.hidden = !m.hidden;
      S.dirty3D = true;
      refreshTree();
      render2D();
    };
    head.appendChild(eye);
    var rdel = document.createElement("span");
    rdel.className = "trDel";
    rdel.textContent = "✕";
    rdel.title = t("tr_delRoom");
    rdel.onclick = function (ev) {
      ev.stopPropagation();
      deleteRoom(r.key);
    };
    head.appendChild(rdel);
    head.onclick = function () {
      select({ kind: "room", ref: r.key });
      render2D();
    };
    head.ondblclick = function (ev) {
      // The name itself owns double-click-to-rename and stops propagation.
      if (ev.target === nm) return;
      frameTreeTarget({ kind: "room", ref: r.key }, roomBounds(r));
    };
    body.appendChild(head);
    inR.forEach(function (it) {
      assigned[it.id] = 1;
      var row = treeRow(
        flabel(it.type),
        !!it.locked,
        S.sel && S.sel.kind === "item" && S.sel.ref === it,
        function () {
          select({ kind: "item", ref: it });
          render2D();
        },
        function () {
          it.locked = !it.locked;
          refreshTree();
          render2D();
        },
        function () {
          deleteItem(it);
        },
        function () {
          frameTreeTarget({ kind: "item", ref: it }, itemBounds(it));
        },
      );
      if (hiddenR) row.classList.add("hid"); // hidden with its room
      body.appendChild(row);
    });
    if (!inR.length) {
      var e = document.createElement("div");
      e.className = "trEmpty";
      e.textContent = t("tr_empty");
      body.appendChild(e);
    }
  });
  var outside = S.items.filter(function (it) {
    return !assigned[it.id];
  });
  if (outside.length) {
    var h = document.createElement("div");
    h.className = "trRoom";
    h.textContent = t("tr_outside");
    body.appendChild(h);
    outside.forEach(function (it) {
      body.appendChild(
        treeRow(
          flabel(it.type),
          !!it.locked,
          S.sel && S.sel.kind === "item" && S.sel.ref === it,
          function () {
            select({ kind: "item", ref: it });
            render2D();
          },
          function () {
            it.locked = !it.locked;
            refreshTree();
            render2D();
          },
          function () {
            deleteItem(it);
          },
          function () {
            frameTreeTarget({ kind: "item", ref: it }, itemBounds(it));
          },
        ),
      );
    });
  }
  var mkCount = appendPointsGroup(body);
  var voidCount = appendVoidsGroup(body);
  var mepCount = appendSystemsGroup(body);
  if (!rs.length && !outside.length && !mepCount && !mkCount && !voidCount)
    body.innerHTML = '<div class="trEmpty">' + t("tr_none") + "</div>";
}

// Placeholder points, listed so a reserved spot is as findable as a room or a
// device — and so the one you dropped behind a wardrobe can still be deleted.
function appendPointsGroup(body) {
  var ms = markers();
  if (!ms.length) return 0;
  var head = document.createElement("div");
  head.className = "trRoom";
  var nm = document.createElement("span");
  nm.className = "trRoomName";
  nm.textContent = t("mk_points");
  head.appendChild(nm);
  var meta = document.createElement("span");
  meta.className = "trMeta";
  meta.textContent = String(ms.length);
  head.appendChild(meta);
  body.appendChild(head);
  ms.forEach(function (m) {
    var row = document.createElement("div");
    row.className =
      "trItem" + (S.sel && S.sel.kind === "marker" && S.sel.ref === m ? " sel" : "");
    var lbl = document.createElement("span");
    lbl.className = "trName";
    lbl.textContent = markerDesc(m);
    row.appendChild(lbl);
    var del = document.createElement("span");
    del.className = "trDel";
    del.textContent = "✕";
    del.title = t("tr_del");
    del.onclick = function (ev) {
      ev.stopPropagation();
      pushHistory();
      deleteMarker(m);
      if (S.sel && S.sel.kind === "marker" && S.sel.ref === m) select(null);
      refreshTree();
      render2D();
    };
    row.appendChild(del);
    row.onclick = function () {
      select({ kind: "marker", ref: m });
      render2D();
    };
    body.appendChild(row);
  });
  return ms.length;
}

function appendVoidsGroup(body) {
  var vs = slabOpenings();
  if (!vs.length) return 0;
  var head = document.createElement("div");
  head.className = "trRoom";
  var nm = document.createElement("span");
  nm.className = "trRoomName";
  nm.textContent = t("tr_voids");
  head.appendChild(nm);
  var meta = document.createElement("span");
  meta.className = "trMeta";
  meta.textContent = String(vs.length);
  head.appendChild(meta);
  body.appendChild(head);
  vs.forEach(function (o) {
    var row = document.createElement("div");
    row.className =
      "trItem" + (S.sel && S.sel.kind === "slabvoid" && S.sel.ref === o ? " sel" : "");
    var lbl = document.createElement("span");
    lbl.className = "trName";
    lbl.textContent = (o.name || t("sv_void")) + " · " + Math.round(o.w) + "×" + Math.round(o.d);
    row.appendChild(lbl);
    var del = document.createElement("span");
    del.className = "trDel";
    del.textContent = "✕";
    del.title = t("tr_del");
    del.onclick = function (ev) {
      ev.stopPropagation();
      pushHistory();
      broadcastPlanOp({ type: "slabRemove", id: o.id });
      removeSlabOpening(o);
      if (S.sel && S.sel.kind === "slabvoid" && S.sel.ref === o) select(null);
      S.dirty3D = true;
      refreshTree();
      render2D();
    };
    row.appendChild(del);
    row.onclick = function () {
      select({ kind: "slabvoid", ref: o });
      render2D();
    };
    body.appendChild(row);
  });
  return vs.length;
}

// Fifth tree group: the MEP "Systems" section — devices + runs grouped by
// network, with orphan-device flags. Returns the number of entities listed.
function appendSystemsGroup(body) {
  var m = ensureMEP();
  var total = m.nodes.length + m.runs.length;
  if (!total) return 0;
  var status = computeMEPStatus();

  var head = document.createElement("div");
  head.className = "trRoom trSystems";
  var nm = document.createElement("span");
  nm.className = "trRoomName";
  nm.textContent = t("mep_systems");
  head.appendChild(nm);
  var meta = document.createElement("span");
  meta.className = "trMeta";
  meta.textContent = String(total);
  head.appendChild(meta);
  body.appendChild(head);

  MEP_SYS_ORDER.forEach(function (sys) {
    var nodes = m.nodes.filter(function (n) { return n.sys === sys; });
    var runs = m.runs.filter(function (r) { return r.sys === sys; });
    if (!nodes.length && !runs.length) return;
    var sub = document.createElement("div");
    sub.className = "trSub";
    var dot = document.createElement("span");
    dot.className = "trSysDot";
    dot.style.background = MEP_SYS[sys].color;
    sub.appendChild(dot);
    var st = document.createElement("span");
    st.textContent = sysLabel(sys);
    sub.appendChild(st);
    body.appendChild(sub);
    nodes.forEach(function (n) {
      var issue = status.node[n.id];
      body.appendChild(
        mepRow(
          nodeLabel(n.sys, n.k) + (n.layer !== "wall" ? " · " + t("mep_" + n.layer) : "") + (n.label ? " · " + n.label : ""),
          MEP_SYS[sys].color,
          issue,
          S.sel && S.sel.kind === "mepNode" && S.sel.ref === n,
          function () { select({ kind: "mepNode", ref: n }); render2D(); },
          function () { delMEPRow({ kind: "mepNode", ref: n }); },
        ),
      );
    });
    runs.forEach(function (r) {
      body.appendChild(
        mepRow(
          runLabel(r.sys, r.k) + (r.layer !== "wall" ? " · " + t("mep_" + r.layer) : "") + " · " + fmtLen(runLength(r)),
          MEP_SYS[sys].color,
          status.run[r.id],
          S.sel && S.sel.kind === "mepRun" && S.sel.ref === r,
          function () { select({ kind: "mepRun", ref: r }); render2D(); },
          function () { delMEPRow({ kind: "mepRun", ref: r }); },
        ),
      );
    });
  });
  // header shows a warning tally for unconnected/unsupplied devices
  if (status.deviceIssues) meta.textContent = total + " · ⚠" + status.deviceIssues;
  return total;
}

function mepRow(label, color, issue, isSel, onSel, onDelete) {
  var row = document.createElement("div");
  row.className = "trItem" + (isSel ? " sel" : "");
  var dot = document.createElement("span");
  dot.className = "trSysDot";
  dot.style.background = color;
  row.appendChild(dot);
  var nm = document.createElement("span");
  nm.className = "trName";
  nm.textContent = label;
  row.appendChild(nm);
  if (issue) {
    var w = document.createElement("span");
    w.className = "trWarn" + (issue === "unsupplied" ? " amber" : "");
    w.textContent = "⚠";
    w.title = t(issue === "unsupplied" ? "mep_unsupplied" : "mep_orphan");
    row.appendChild(w);
  }
  var del = document.createElement("span");
  del.className = "trDel";
  del.textContent = "✕";
  del.title = t("tr_del");
  del.onclick = function (ev) { ev.stopPropagation(); onDelete(); };
  row.appendChild(del);
  row.onclick = onSel;
  return row;
}

function delMEPRow(sel) {
  pushHistory();
  deleteMEP(sel);
  if (S.sel && S.sel.kind === sel.kind && S.sel.ref === sel.ref) select(null);
  S.dirty3D = true;
  refreshTree();
  render2D();
}
