// Assembly SmartMates: infer a mate from two topology references the way
// SolidWorks does when you Alt-drag a component onto another.

function surfaceOf(ref) {
  return ref && (ref.descriptor && ref.descriptor.surface || ref.frame && ref.frame.surface) || "";
}

export function inferSmartMate(a, b) {
  if (!a || !b || a.componentId === b.componentId) return null;
  var ak = a.kind, bk = b.kind;
  if (ak === "face" && bk === "face") {
    if (surfaceOf(a) === "cylinder" && surfaceOf(b) === "cylinder") {
      return { type: "concentric", a: a, b: b };
    }
    return { type: "coincident", a: a, b: b, aligned: false };
  }
  if ((ak === "edge" || ak === "axis") && (bk === "edge" || bk === "axis")) {
    return { type: "concentric", a: a, b: b };
  }
  if ((ak === "face" && (bk === "edge" || bk === "axis")) || (bk === "face" && (ak === "edge" || ak === "axis"))) {
    return { type: "concentric", a: a, b: b };
  }
  return null;
}

export function isolateVisibility(components, selectedIds) {
  var set = new Set(selectedIds || []);
  return (components || []).map(function (component) {
    return { id: component.id, visible: !set.size || set.has(component.id) };
  });
}

export function hiddenAfterIsolate(components, selectedIds) {
  return isolateVisibility(components, selectedIds).filter(function (row) { return !row.visible; }).map(function (row) { return row.id; });
}
