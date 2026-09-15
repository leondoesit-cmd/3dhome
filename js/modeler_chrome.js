// Viewport chrome that keeps modelling in the graphics area: confirmation
// corner, context toolbar, S-key shortcut bar, Spacebar views, RMB gestures,
// selection filters and breadcrumbs.

export const SELECTION_FILTERS = ["all", "face", "edge", "vertex", "sketch", "body"];

export const VIEW_PRESETS = [
  { id: "front", az: 0, el: 0.05, shortcut: "5" },
  { id: "top", az: 0, el: 1.5, shortcut: "4" },
  { id: "right", az: Math.PI / 2, el: 0.05, shortcut: "6" },
  // The far sides of Front and Right: a part's back or left face (LENSCAP's
  // ThreadPlane face) is otherwise reachable only by hand orbit.
  { id: "back", az: Math.PI, el: 0.05, shortcut: "" },
  { id: "left", az: -Math.PI / 2, el: 0.05, shortcut: "" },
  { id: "iso", az: 0.8, el: 0.5, shortcut: "" },
  { id: "normalTo", az: null, el: null, shortcut: "Ctrl+8" },
];

export function confirmationCornerState(input) {
  input = input || {};
  if (input.drawing) {
    return { visible: true, mode: "draw", label: input.toolLabel || "Sketch", canAccept: !!input.canAccept };
  }
  if (input.featureType) {
    return { visible: true, mode: "feature", label: input.featureLabel || input.featureType, canAccept: input.featureReady !== false };
  }
  if (input.sketchPhase) {
    return { visible: true, mode: "sketch", label: input.finishSketchLabel || "Finish sketch", canAccept: true };
  }
  return { visible: false, mode: null, label: "", canAccept: false };
}

export function contextToolbarItems(input) {
  input = input || {};
  var items = [];
  var push = function (id, icon) {
    if (!items.some(function (item) { return item.id === id; })) items.push({ id: id, icon: icon });
  };
  if (input.face) {
    push("newsketch", "ph-pencil-line");
    push("extrude", "ph-cube");
    push("filletfeature", "ph-corners-out");
    push("chamferfeature", "ph-corners-in");
    push("holefeature", "ph-circle-dashed");
    push("threadfeature", "threadfeature");
    push("knurlfeature", "knurlfeature");
    push("insertfeature", "insertfeature");
    push("shellfeature", "ph-bowl-food");
  }
  if (input.edge) {
    push("filletfeature", "ph-corners-out");
    push("chamferfeature", "ph-corners-in");
  }
  if (input.closedSketch && (input.sketchEntity || input.face)) {
    push("finishsketch", "ph-check");
    push("extrude", "ph-cube");
    push("extrudecut", "ph-scissors");
  }
  if (input.sketchEntity) {
    push("dim", "ph-ruler");
    push("trim", "ph-scissors");
  }
  if (input.featureSelected) {
    push("editfeature", "ph-pencil-simple");
    push("rollbackhere", "ph-arrow-line-down");
  }
  if (input.assembly && input.twoComponents) {
    push("mates", "ph-link");
    push("isolate", "ph-eye");
  }
  if (input.assembly && input.oneComponent) push("isolate", "ph-eye");
  return items;
}

export function shortcutBarItems(input) {
  input = input || {};
  if (input.sketchPhase) {
    return [
      { id: "select", icon: "ph-cursor", shortcut: "V" },
      { id: "wall", icon: "ph-line-segment", shortcut: "L" },
      { id: "srect", icon: "ph-rectangle", shortcut: "Q" },
      { id: "scirc", icon: "ph-circle-dashed", shortcut: "G" },
      { id: "dim", icon: "ph-ruler", shortcut: "D" },
      { id: "trim", icon: "ph-scissors", shortcut: "T" },
      { id: "finishsketch", icon: "ph-check" },
      { id: "extrude", icon: "ph-cube" },
    ];
  }
  if (input.assembly) {
    return [
      { id: "components", icon: "ph-cube" },
      { id: "mates", icon: "ph-link" },
      { id: "isolate", icon: "ph-eye" },
      { id: "explode", icon: "ph-arrows-out" },
      { id: "interference", icon: "ph-intersect" },
      { id: "fit", icon: "ph-crosshair-simple", shortcut: "F" },
    ];
  }
  return [
    { id: "newsketch", icon: "ph-pencil-line" },
    { id: "extrude", icon: "ph-cube" },
    { id: "filletfeature", icon: "ph-corners-out" },
    { id: "chamferfeature", icon: "ph-corners-in" },
      { id: "holefeature", icon: "ph-circle-dashed" },
      { id: "helixfeature", icon: "helixfeature" },
      { id: "threadfeature", icon: "threadfeature" },
      { id: "knurlfeature", icon: "knurlfeature" },
    { id: "patternfeature", icon: "ph-dots-nine" },
    { id: "fit", icon: "ph-crosshair-simple", shortcut: "F" },
    { id: "regen", icon: "ph-arrows-clockwise", shortcut: "Ctrl+B" },
  ];
}

/* Selection operations, ahead of the modelling commands. The menu used to be
   nothing but "what can I build from this?", so growing a selection — the
   thing a CAD user reaches for far more often — had no home at all and every
   fillet was clicked edge by edge. */
export function selectionMenuItems(input) {
  input = input || {};
  var items = [];
  if (input.face || input.edge) {
    items.push({ id: "selectloop", icon: "ph-circle-notch", group: "select" });
    items.push({ id: "selecttangency", icon: "ph-flow-arrow", group: "select" });
    items.push({ id: "selectconnected", icon: "ph-graph", group: "select" });
  }
  if (input.topologyCount) {
    items.push({ id: "selectgrow", icon: "ph-arrows-out", group: "select" });
    if (input.topologyCount > 1) items.push({ id: "selectshrink", icon: "ph-arrows-in", group: "select" });
    items.push({ id: "selectinvert", icon: "ph-selection-inverse", group: "select" });
    items.push({ id: "selectsave", icon: "ph-bookmark-simple", group: "select" });
  }
  if (input.namedSelections) items.push({ id: "selectrecall", icon: "ph-bookmarks-simple", group: "select" });
  return items;
}

export function contextMenuItems(input) {
  input = input || {};
  var items = selectionMenuItems(input).concat(contextToolbarItems(input).map(function (item) {
    return Object.assign({ group: "action" }, item);
  }));
  items.push({ id: "normalTo", icon: "ph-arrows-in-cardinal", group: "view" });
  items.push({ id: "fit", icon: "ph-crosshair-simple", group: "view" });
  if (input.hideable) items.push({ id: "hide", icon: "ph-eye-slash", group: "display" });
  if (input.hidden) items.push({ id: "showall", icon: "ph-eye", group: "display" });
  return items;
}

export function gestureFromSwipe(dx, dy, threshold) {
  var dist = Math.hypot(dx || 0, dy || 0);
  if (dist < (threshold || 40)) return null;
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "extrude" : "dim";
  return dx > 0 ? "normalTo" : "wall";
}

export function selectionFilterAllows(kind, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "body") return kind === "body" || kind === "part";
  if (filter === "sketch") return kind === "sketch" || kind === "point" || kind === "line" || kind === "circle" || kind === "arc";
  return kind === filter;
}

export function selectionBreadcrumb(pick) {
  pick = pick || {};
  var crumbs = [];
  if (pick.reference) {
    crumbs.push({
      kind: pick.reference.kind || "face",
      id: pick.reference.persistentId,
      label: pick.reference.semantic || pick.reference.kind || "Face",
    });
  }
  if (pick.part) {
    crumbs.push({
      kind: "feature",
      id: pick.part.featureId || pick.part.id,
      label: pick.part.name || "Feature",
    });
    crumbs.push({
      kind: "body",
      id: pick.part.id,
      label: pick.part.name || "Body",
    });
  }
  if (pick.component) {
    crumbs.push({
      kind: "component",
      id: pick.component.id,
      label: pick.component.name || pick.component.modelKey || "Component",
    });
  }
  return crumbs;
}

export function boxSelectMode(x0, x1) {
  return (x1 || 0) >= (x0 || 0) ? "enclosed" : "crossing";
}

export function boundsHitBox(bounds, box, mode) {
  if (!bounds || !box) return false;
  var left = Math.min(box.x0, box.x1), right = Math.max(box.x0, box.x1);
  var top = Math.min(box.y0, box.y1), bottom = Math.max(box.y0, box.y1);
  var inside = bounds.x0 >= left && bounds.x1 <= right && bounds.y0 >= top && bounds.y1 <= bottom;
  if (mode === "enclosed") return inside;
  return !(bounds.x1 < left || bounds.x0 > right || bounds.y1 < top || bounds.y0 > bottom);
}

export function cycleOverlappingHits(hits, currentId) {
  var list = hits || [];
  if (!list.length) return null;
  var at = list.findIndex(function (hit) { return (hit.persistentId || hit.id) === currentId; });
  return list[(at + 1) % list.length];
}

export function featureHistoryIndex(history, featureId) {
  return (history || []).findIndex(function (entry) {
    return entry && entry.kind === "feature" && entry.targetId === featureId;
  });
}
