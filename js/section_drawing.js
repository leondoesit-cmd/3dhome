/* Orthographic wall cuts along a section line. The SVG is deliberately built
   from the saved wall/opening geometry, not a screenshot of the 3D viewport. */
function crossing(a, b, c, d) {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-8) return null;
  const qx = c.x - a.x, qz = c.z - a.z;
  const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}
const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

export function sectionDrawingSVG(state, line) {
  if (!line || !Number.isFinite(line.x2) || !Number.isFinite(line.z2)) throw new Error("A section needs two points.");
  const a = { x: line.x, z: line.z }, b = { x: line.x2, z: line.z2 };
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  if (!(span > 0)) throw new Error("The section line is too short.");
  const walls = (state.walls || []).flatMap(wall => {
    const c = state.nodes?.[wall.a], d = state.nodes?.[wall.b];
    if (!c || !d) return [];
    const hit = crossing(a, b, c, d);
    if (!hit) return [];
    const wallLength = Math.hypot(d.x - c.x, d.z - c.z);
    const opening = (state.openings || []).find(o => String(o.wall) === String(wall.id) && Math.abs((o.s || 0) - hit.u * wallLength) <= (o.width || 0) / 2);
    return [{ distance: hit.t * span, width: Math.max(5, Number(wall.thickness) || 10), height: Math.max(30, Number(wall.h) || 270), opening }];
  });
  const scale = 2, pad = 55, width = Math.max(500, span * scale + pad * 2), height = 720, baseline = height - 85;
  const shapes = [`<line x1="${pad}" y1="${baseline}" x2="${width - pad}" y2="${baseline}" stroke="#283949" stroke-width="3"/>`];
  for (const wall of walls) {
    const x = pad + wall.distance * scale - wall.width * scale / 2, y = baseline - wall.height * scale;
    shapes.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(wall.width * scale).toFixed(2)}" height="${(wall.height * scale).toFixed(2)}" fill="#8c9aa6" stroke="#283949"/>`);
    if (wall.opening) {
      const sill = Math.max(0, Number(wall.opening.sill) || 0), top = Math.min(wall.height, sill + (Number(wall.opening.height) || 0));
      if (top > sill) shapes.push(`<rect x="${x.toFixed(2)}" y="${(baseline - top * scale).toFixed(2)}" width="${(wall.width * scale).toFixed(2)}" height="${((top - sill) * scale).toFixed(2)}" fill="white" stroke="#283949"/>`);
    }
  }
  const title = `Section ${line.text || "A"}–${line.text || "A"}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><text x="${pad}" y="32" font-family="sans-serif" font-size="20" fill="#233b50">${esc(title)}</text>${shapes.join("")}<text x="${pad}" y="${height - 28}" font-family="sans-serif" font-size="12" fill="#566">Wall section · dimensions in centimetres · ${walls.length} wall cuts</text></svg>`;
}
