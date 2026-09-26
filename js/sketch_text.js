// Convert a small monochrome text raster into closed sketch contours. The
// result is ordinary editable line geometry, so extrude and cut consume it.
export function bitmapContours(pixels, width, height) {
  const filled = (x, y) => x >= 0 && y >= 0 && x < width && y < height && !!pixels[y * width + x];
  const edges = new Map();
  const add = (x0, y0, x1, y1) => {
    const key = `${x0},${y0}`;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push({ x0, y0, x1, y1, used: false });
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (filled(x, y)) {
    if (!filled(x, y - 1)) add(x, y, x + 1, y);
    if (!filled(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!filled(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!filled(x - 1, y)) add(x, y + 1, x, y);
  }
  const direction = e => e.x1 > e.x0 ? 0 : e.y1 > e.y0 ? 1 : e.x1 < e.x0 ? 2 : 3;
  const loops = [];
  for (const starts of edges.values()) for (const start of starts) {
    if (start.used) continue;
    let edge = start;
    const loop = [];
    let closed = false;
    for (let guard = 0; edge && guard < width * height * 4 + 1; guard++) {
      edge.used = true; loop.push({ x: edge.x0, y: edge.y0 });
      if (edge.x1 === start.x0 && edge.y1 === start.y0) { closed = true; break; }
      const candidates = (edges.get(`${edge.x1},${edge.y1}`) || []).filter(e => !e.used);
      const incoming = direction(edge);
      const rank = candidate => [1, 0, 3, 2].indexOf((direction(candidate) - incoming + 4) % 4);
      candidates.sort((a, b) => rank(a) - rank(b));
      edge = candidates[0];
    }
    if (!closed || loop.length < 4) continue;
    const reduced = loop.filter((point, i) => {
      const prev = loop[(i + loop.length - 1) % loop.length], next = loop[(i + 1) % loop.length];
      return (point.x - prev.x) * (next.y - point.y) !== (point.y - prev.y) * (next.x - point.x);
    });
    if (reduced.length >= 4) loops.push(reduced);
  }
  return loops;
}

export function rasterTextContours(text, font = "Arial, sans-serif") {
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Text rasterization is unavailable in this browser.");
  const content = String(text || "").trim().slice(0, 24);
  if (!content) return [];
  context.font = `bold 36px ${font}`;
  const advance = Math.ceil(context.measureText(content).width);
  canvas.width = Math.min(1200, advance + 8); canvas.height = 48;
  context.font = `bold 36px ${font}`; context.textBaseline = "top"; context.fillStyle = "#000";
  context.fillText(content, 4, 1);
  const stride = 3, width = Math.ceil(canvas.width / stride), height = Math.ceil(canvas.height / stride);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let alpha = 0;
    for (let dy = 0; dy < stride; dy++) for (let dx = 0; dx < stride; dx++) {
      const px = x * stride + dx, py = y * stride + dy;
      if (px < canvas.width && py < canvas.height) alpha += data[(py * canvas.width + px) * 4 + 3];
    }
    pixels[y * width + x] = alpha > stride * stride * 255 * .35 ? 1 : 0;
  }
  return bitmapContours(pixels, width, height);
}
