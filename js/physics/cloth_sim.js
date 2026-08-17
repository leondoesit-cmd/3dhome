export function createClothState(opts) {
  const width = opts.width || 80;
  const height = opts.height || 120;
  const cols = opts.cols || 8;
  const rows = opts.rows || 10;
  const nx = opts.nx || 0;
  const nz = opts.nz || 1;
  const nlen = Math.hypot(nx, nz) || 1;
  const ux = -nz / nlen, uz = nx / nlen;
  const points = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u = cols === 1 ? 0 : col / (cols - 1);
      const v = rows === 1 ? 0 : row / (rows - 1);
      const x = opts.x + (u - 0.5) * width * ux;
      const y = opts.y - v * height;
      const z = opts.z + (u - 0.5) * width * uz;
      points.push({
        x, y, z,
        px: x, py: y, pz: z,
        pinned: row === 0,
      });
    }
  }
  const restW = width / Math.max(1, cols - 1);
  const restH = height / Math.max(1, rows - 1);
  const links = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (col + 1 < cols) links.push({ a: i, b: i + 1, rest: restW });
      if (row + 1 < rows) links.push({ a: i, b: i + cols, rest: restH });
    }
  }
  return { points, links, cols, rows, width, height };
}

export function stepClothState(cloth, dt) {
  if (!cloth || !dt) return cloth;
  const g = 981;
  const damp = Math.exp(-1.8 * dt);
  const pts = cloth.points;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.pinned) continue;
    const vx = (p.x - p.px) * damp;
    const vy = (p.y - p.py) * damp;
    const vz = (p.z - p.pz) * damp;
    p.px = p.x;
    p.py = p.y;
    p.pz = p.z;
    p.x += vx;
    p.y += vy - g * dt * dt;
    p.z += vz;
    if (p.y < 2) {
      p.y = 2;
      p.py = p.y;
    }
  }
  const links = cloth.links;
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const a = pts[link.a], b = pts[link.b];
      let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const dist = Math.hypot(dx, dy, dz) || 0.0001;
      const shift = (dist - link.rest) / dist * 0.5;
      dx *= shift;
      dy *= shift;
      dz *= shift;
      if (!a.pinned) {
        a.x += dx;
        a.y += dy;
        a.z += dz;
      }
      if (!b.pinned) {
        b.x -= dx;
        b.y -= dy;
        b.z -= dz;
      }
    }
  }
  return cloth;
}
