// Cylinders use a base point and a unit axis in CAD; cabinet layout uses a centre.
export function cylinderAxis(value) {
  const axis = typeof value === "object" && value ? value : value === "x" ? { x: 1, y: 0, z: 0 } : value === "z" ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const length = Math.hypot(axis.x || 0, axis.y || 0, axis.z || 0) || 1;
  return { x: (axis.x || 0) / length, y: (axis.y || 0) / length, z: (axis.z || 0) / length };
}
export function cylinderBounds(part) {
  const axis = cylinderAxis(part.axis), radius = Math.max(Math.abs(Number(part.r)||0), Math.abs(Number(part.r2 ?? part.r)||0)), bounds = {};
  for (const key of ["x", "y", "z"]) {
    const base=Number(part[key])||0, end = base + axis[key] * (Number(part.h)||0), extent = radius * Math.sqrt(Math.max(0, 1 - axis[key] ** 2));
    bounds[key + "0"] = Math.min(base, end) - extent;
    bounds[key + "1"] = Math.max(base, end) + extent;
  }
  return bounds;
}
