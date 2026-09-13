// Library dimensions must preserve engineering-sized parts; UI display
// rounding must not become geometry scaling when the model is placed.
export function modelDimensions(bounds) {
  const extent = (low, high) => {
    const value = high - low;
    if (!Number.isFinite(value) || value < 0) throw new Error("Invalid model bounds");
    return Math.max(1e-6, value);
  };
  return {w:extent(bounds.x0,bounds.x1),d:extent(bounds.z0,bounds.z1),h:extent(bounds.y0,bounds.y1)};
}

export function formatModelLength(value) {
  return Number.isFinite(value) ? String(Number(value.toPrecision(10))) : "—";
}
