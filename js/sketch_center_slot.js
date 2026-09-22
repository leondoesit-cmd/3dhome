// A dimensioned straight slot whose midpoint stays fixed while its length
// changes. The perimeter remains ordinary editable lines and tangent arcs.
export function addCenterSlot(sketch, { length, width, x = 0, y = 0 }, id) {
  if (![length, width, x, y].every(Number.isFinite) || length <= 0 || width <= 0) {
    throw new Error("Slot dimensions must be positive finite lengths");
  }
  const point = (u, v) => ({ id: id(), x: x + u, y: y + v });
  const a = point(-length / 2, 0), b = point(length / 2, 0), center = point(0, 0);
  const a0 = point(-length / 2, width / 2), a1 = point(-length / 2, -width / 2);
  const b0 = point(length / 2, width / 2), b1 = point(length / 2, -width / 2);
  const side1 = { id: id(), type: "line", name: "Slot side", a: a1.id, b: b1.id };
  const capB = { id: id(), type: "arc", name: "Slot cap", c: b.id, a: b1.id, b: b0.id };
  const side0 = { id: id(), type: "line", name: "Slot side", a: b0.id, b: a0.id };
  const capA = { id: id(), type: "arc", name: "Slot cap", c: a.id, a: a0.id, b: a1.id };
  const axis = { id: id(), type: "line", name: "Slot centreline", a: a.id, b: b.id, construction: true };
  const made = [side1, capB, side0, capA, axis];
  sketch.points.push(a, b, center, a0, a1, b0, b1);
  sketch.entities.push(...made);
  for (const side of [side0, side1]) {
    sketch.constraints.push(
      { id: id(), type: "parallel", a: side.id, b: axis.id },
      { id: id(), type: "tangent", a: side.id, b: capA.id },
      { id: id(), type: "tangent", a: side.id, b: capB.id },
    );
  }
  sketch.constraints.push(
    { id: id(), type: "horizontal", entity: axis.id },
    { id: id(), type: "fixed", point: center.id, x, y },
    { id: id(), type: "midpoint", point: center.id, entity: axis.id },
    { id: id(), type: "distance", entity: axis.id, value: length, driven: false },
    { id: id(), type: "radius", entity: capA.id, value: width / 2, driven: false },
  );
  return made;
}
