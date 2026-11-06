/* The CAD editor's 3D notes, markups and painting, split out of js/modeler.js.
   It shares the editor's state through live imports from ../modeler.js. */
import { selectionFilterAllows } from "../modeler_chrome.js";
import { NOTE_CATEGORIES, deleteNoteFromDef } from "../modeler_notes_paint.js";
import { t } from "../modeler_strings.js";
import { commandSelectionPrefer } from "../modeler/command_manager.js";
import { refreshParts } from "../modeler/component_mates.js";
import { el } from "../modeler/editor_dom.js";
import { syncHint } from "../modeler/sketch_entities.js";
import { closeNoteEditor, hitInstant3d, openNoteEditor, stampComponentRef } from "../modeler/viewport_input.js";
import {
  E, SVG_NS, drawMarkupsOverlay, noteScratch, pushUndo, refreshDecorations,
  resolveTopologyPick, root, scheduleModelerDraft,
} from "../modeler.js";

/* Hover feedback. Nothing here changes the model or the selection — it only
   says "this is what a click would take", which is the whole difference
   between a viewport you can pick in and one you cannot. */
function hoverAssemblyTopology(event, view, precomputedHandle) {
  if (!view || !view.grp) return;
  if (E.docType !== "part" && E.docType !== "assembly") return;
  /* Instant-3D drag handles belong to part authoring; an assembly has none. */
  var handle = precomputedHandle !== undefined ? precomputedHandle : (E.docType === "part" ? hitInstant3d(event, view) : null);
  if (view.rr && view.rr.domElement) view.rr.domElement.style.cursor = handle ? "grab" : "";
  if (handle) {
    if (E.hoverTopology) { E.hoverTopology = null; refreshDecorations(); }
    return;
  }
  var found = resolveTopologyPick(event, view, { prefer: commandSelectionPrefer() });
  var next = stampComponentRef(found && found.reference || null, found && found.component, found);
  if (E.facePick && next && next.kind !== "face") next = null;
  /* Hover used to pre-highlight references the filter would then refuse to
     select, so the model lit up under the cursor and the click did nothing.
     Highlight only what is actually acquirable, and say so in the cursor. */
  var hoverFilter = commandSelectionPrefer();
  var filterBlocked = !!(next && !selectionFilterAllows(next.kind, hoverFilter));
  if (filterBlocked) next = null;
  /* Which instance, not just which face. Two components off the same library
     model share every persistent id, so comparing ids alone called the move
     from one instance's face to the matching face on the other "no change" and
     left the highlight behind on the component the pointer had left. In a part
     document both sides are undefined, which compares equal as before. */
  var same = (!next && !E.hoverTopology)
    || (next && E.hoverTopology
      && next.persistentId === E.hoverTopology.persistentId
      && next.componentId === E.hoverTopology.componentId);
  if (view.rr && view.rr.domElement && !handle) {
    var draggable = E.docType === "assembly" && found && found.component && E.tool === "select";
    view.rr.domElement.style.cursor = E.facePick ? "crosshair"
      : draggable ? (found.component.grounded ? "not-allowed" : "grab")
      : next ? "pointer" : filterBlocked ? "not-allowed" : "";
    /* "pointer" says something is there; it does not say what. A CAD cursor
       has to distinguish a face from the edge that bounds it, because the two
       sit within a few pixels of each other and picking the wrong one is the
       most common way a click goes astray. */
    view.rr.domElement.dataset.hoverKind = next ? next.kind : filterBlocked ? "blocked" : "";
  }
  // Where the ray met the model, so an armed Measure can read out live.
  E.hoverPoint = found && found.pickPoint ? found.pickPoint : null;
  if (same) { syncHint(); return; }
  E.hoverTopology = next;
  refreshDecorations();
  // The readout above is about the cursor, so it updates when the cursor does.
  syncHint();
}

/* ================= 3D Notes, Annotations & Painting ================= */
function syncViewsToolbarNotes() {
  var b = root && root.querySelector("#mdToggleNotesView");
  if (!b) return;
  var vis = E.notesVisible !== false;
  b.classList.toggle("on", vis);
  b.setAttribute("aria-pressed", vis ? "true" : "false");
}

function syncPaintToolbar() {
  var bar = root && root.querySelector("#mdPaintToolbar");
  if (!bar) return;
  bar.querySelectorAll("[data-paint-mode]").forEach(function (btn) {
    var mode = btn.getAttribute("data-paint-mode");
    var on = mode === (E.paintMode || "face");
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  var eyedropperBtn = bar.querySelector("#mdPaintEyedropper");
  if (eyedropperBtn) {
    eyedropperBtn.classList.toggle("on", !!E.paintEyedropper);
    eyedropperBtn.setAttribute("aria-pressed", E.paintEyedropper ? "true" : "false");
  }
  var colorInp = bar.querySelector("#mdPaintColorInput");
  if (colorInp && colorInp.value !== E.paintColor) {
    colorInp.value = E.paintColor || "#3b82f6";
  }
  bar.querySelectorAll(".md-paint-swatch").forEach(function (swatch) {
    var col = swatch.getAttribute("data-swatch-color");
    swatch.classList.toggle("on", col === E.paintColor);
  });
}

function syncNotesToolbar() {
  var bar = root && root.querySelector("#mdNotesToolbar");
  if (!bar) return;
  bar.querySelectorAll("[data-note-mode]").forEach(function (btn) {
    var mode = btn.getAttribute("data-note-mode");
    var on = mode === (E.noteMode || "callout");
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  bar.querySelectorAll("[data-markup-color]").forEach(function (btn) {
    var col = btn.getAttribute("data-markup-color");
    var on = col === (E.markupColor || "#ef4444");
    btn.classList.toggle("on", on);
  });
  var visBtn = bar.querySelector("#mdToggleNotesVisibility");
  if (visBtn) {
    var vis = E.notesVisible !== false;
    visBtn.classList.toggle("on", vis);
    visBtn.innerHTML = '<i class="ph ' + (vis ? "ph-eye" : "ph-eye-closed") + '"></i>';
  }
}

function syncNotesAndMarkups(view) {
  if (!view || !view.rr || !view.cam) return;
  var canvas = view.rr.domElement;
  var wrap = canvas && canvas.parentElement;
  if (!wrap) return;
  var svg = wrap.querySelector("#mdNotesSvg");
  var host = wrap.querySelector("#mdNotesHost");
  var mcv = wrap.querySelector("#mdMarkupCanvas");
  if (!svg || !host || !mcv) return;

  var w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;

  if (svg.getAttribute("width") !== String(w) || svg.getAttribute("height") !== String(h)) {
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.style.width = w + "px";
    svg.style.height = h + "px";
  }
  var dpr = window.devicePixelRatio || 1;
  var rw = Math.round(w * dpr), rh = Math.round(h * dpr);
  if (mcv.width !== rw || mcv.height !== rh) {
    mcv.width = rw;
    mcv.height = rh;
    mcv.style.width = w + "px";
    mcv.style.height = h + "px";
  }

  drawMarkupsOverlay(mcv, dpr);
  syncNotesCards(svg, host, view, canvas);
}

function markupsSignature() {
  var list = E.def && Array.isArray(E.def.markups) ? E.def.markups : [];
  var last = list[list.length - 1];
  return list.length + ":" + (last && last.points ? last.points.length : 0);
}

function svgEl(tag) {
  return document.createElementNS(SVG_NS, tag);
}

/* The connector: an anchor dot on the surface, a leader line, and a dot at the
   card. Created once per note and then only re-pointed. */
function noteConnector(svg, id) {
  if (!svg._connectors) svg._connectors = new Map();
  var g = svg._connectors.get(id);
  if (g && g.parentElement === svg) return g;
  g = svg.querySelector('[data-note-id="' + id + '"]');
  if (g) { svg._connectors.set(id, g); return g; }
  g = svgEl("g");
  g.setAttribute("data-note-id", id);
  var anchor = svgEl("circle");
  anchor.setAttribute("r", "4");
  anchor.setAttribute("stroke", "#ffffff");
  anchor.setAttribute("stroke-width", "1.5");
  var leader = svgEl("line");
  leader.setAttribute("stroke-width", "1.8");
  leader.setAttribute("stroke-dasharray", "3 2");
  var tip = svgEl("circle");
  tip.setAttribute("r", "2.5");
  g.append(anchor, leader, tip);
  svg.appendChild(g);
  svg._connectors.set(id, g);
  return g;
}

function setAttrIfChanged(node, name, value) {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

/* The parts of a card that depend on the note rather than on the camera. */
function noteCardParts(card) {
  if (card._parts) return card._parts;
  var badge = el("span", "md-note-card-badge");
  var text = el("span", "md-note-card-text");
  var del = document.createElement("button");
  del.type = "button";
  del.className = "md-note-card-del";
  del.appendChild(el("i", "ph ph-x"));
  card.append(badge, text, del);
  card._parts = { badge: badge, text: text, del: del };
  return card._parts;
}

function noteCardElement(host, note) {
  if (!host._cards) host._cards = new Map();
  var card = host._cards.get(note.id);
  if (card && card.parentElement === host) return card;
  card = host.querySelector('[data-note-id="' + note.id + '"]');
  if (!card) {
    card = el("div", "md-note-card");
    card.setAttribute("data-note-id", note.id);
    host.appendChild(card);
    bindNoteCardEvents(card, note);
  }
  host._cards.set(note.id, card);
  return card;
}

function syncNotesCards(svg, host, view, canvas) {
  var notes = E.def && Array.isArray(E.def.notes) ? E.def.notes : [];
  if (E.notesVisible === false || !notes.length) {
    if (svg.firstChild) svg.replaceChildren();
    if (host.firstChild) host.replaceChildren();
    if (svg._connectors) svg._connectors.clear();
    if (host._cards) host._cards.clear();
    return;
  }

  view.cam.updateMatrixWorld();
  var camProj = noteScratch();
  var cw = canvas.clientWidth, ch = canvas.clientHeight;
  var renderedIds = new Set();

  for (var i = 0; i < notes.length; i++) {
    var note = notes[i];
    if (!note || !note.point) continue;
    renderedIds.add(note.id);

    var color = note.color || (NOTE_CATEGORIES[note.category] && NOTE_CATEGORIES[note.category].color) || "#2563eb";
    var card = noteCardElement(host, note);
    var connector = noteConnector(svg, note.id);

    camProj.set(note.point.x, note.point.y, note.point.z).project(view.cam);
    if (camProj.z > 1) {
      // behind the camera: the card and its leader go away together
      if (card.style.display !== "none") card.style.display = "none";
      if (connector.style.display !== "none") connector.style.display = "none";
      continue;
    }
    if (connector.style.display === "none") connector.style.display = "";

    var sx = (camProj.x * 0.5 + 0.5) * cw;
    var sy = (-camProj.y * 0.5 + 0.5) * ch;
    var offX = Number(note.offset && note.offset.x) || 40;
    var offY = Number(note.offset && note.offset.y) || -40;
    var cardX = sx + offX;
    var cardY = sy + offY;

    var anchor = connector.firstChild, leader = anchor.nextSibling, tip = leader.nextSibling;
    setAttrIfChanged(anchor, "cx", sx.toFixed(1));
    setAttrIfChanged(anchor, "cy", sy.toFixed(1));
    setAttrIfChanged(anchor, "fill", color);
    setAttrIfChanged(leader, "x1", sx.toFixed(1));
    setAttrIfChanged(leader, "y1", sy.toFixed(1));
    setAttrIfChanged(leader, "x2", cardX.toFixed(1));
    setAttrIfChanged(leader, "y2", cardY.toFixed(1));
    setAttrIfChanged(leader, "stroke", color);
    setAttrIfChanged(tip, "cx", cardX.toFixed(1));
    setAttrIfChanged(tip, "cy", cardY.toFixed(1));
    setAttrIfChanged(tip, "fill", color);

    if (card.style.display !== "flex") card.style.display = "flex";
    var left = Math.round(cardX) + "px", top = Math.round(cardY) + "px";
    if (card.style.left !== left) card.style.left = left;
    if (card.style.top !== top) card.style.top = top;
    card.classList.toggle("selected", E.activeNoteId === note.id);

    /* Content, only when the note itself changed. The camera moving is not a
       reason to touch any of this. */
    var parts = noteCardParts(card);
    var label = String(i + 1);
    var body = note.text || "Note";
    if (card._noteIndex !== label) { parts.badge.textContent = label; card._noteIndex = label; }
    if (card._noteColor !== color) { parts.badge.style.background = color; card._noteColor = color; }
    if (card._noteText !== body) { parts.text.textContent = body; card._noteText = body; }
    var delTitle = t("deleteNote");
    if (card._delTitle !== delTitle) { parts.del.title = delTitle; card._delTitle = delTitle; }
  }

  if (host._cards) {
    host._cards.forEach(function (cNode, cid) {
      if (!renderedIds.has(cid)) {
        cNode.remove();
        host._cards.delete(cid);
      }
    });
  }
  if (svg._connectors) {
    svg._connectors.forEach(function (gNode, gid) {
      if (!renderedIds.has(gid)) {
        gNode.remove();
        svg._connectors.delete(gid);
      }
    });
  }
}

function bindNoteCardEvents(card, note) {
  card.addEventListener("click", function (e) {
    if (e.target.closest(".md-note-card-del")) {
      e.stopPropagation();
      pushUndo(t("deleteNote"));
      deleteNoteFromDef(E.def, note.id);
      if (E.activeNoteId === note.id) closeNoteEditor();
      if (E.pv) syncNotesAndMarkups(E.pv);
      refreshParts();
      return;
    }
    openNoteEditor(note);
  });

  card.addEventListener("pointerdown", function (e) {
    if (e.target.closest(".md-note-card-del")) return;
    e.stopPropagation();
    try { card.setPointerCapture(e.pointerId); } catch (_) {}
    var startX = e.clientX, startY = e.clientY;
    var initOffX = Number(note.offset && note.offset.x) || 40;
    var initOffY = Number(note.offset && note.offset.y) || -40;
    var moved = false;

    function onMove(ev) {
      var dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!moved) {
        if (Math.hypot(dx, dy) <= 3) return;
        pushUndo(t("editNote"));
        moved = true;
      }
      note.offset = { x: initOffX + dx, y: initOffY + dy };
      if (E.pv) syncNotesAndMarkups(E.pv);
    }

    function onUp(ev) {
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerup", onUp);
      try { card.releasePointerCapture(ev.pointerId); } catch (_) {}
      if (moved) scheduleModelerDraft();
    }

    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerup", onUp);
  });
}

export {
  hoverAssemblyTopology, markupsSignature, syncNotesAndMarkups,
  syncNotesToolbar, syncPaintToolbar, syncViewsToolbarNotes,
};
