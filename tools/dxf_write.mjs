// Minimal ASCII DXF writer for the floor-plan bench. DxfCanvas has the same
// drawing API as PdfCanvas (tools/pdf_write.mjs), so tools/plan_synth_pdf.mjs
// can draw one synthetic plan both ways and the DXF import path
// (js/dxf_import.js) is measured against the same ground truth as the PDF
// one. Callers draw in sheet points, y down; the canvas writes model space
// in real drawing units, y up, on the layer last named with layer().
//
// Paths become what a CAD export holds: two-point paths LINE, longer ones
// LWPOLYLINE, arc() calls ARC (or CIRCLE), fills a solid HATCH, text TEXT.

const DXF_UNIT_CODE = { in: 1, ft: 2, mm: 4, cm: 5, m: 6 };
const CM = { in: 2.54, ft: 30.48, mm: 0.1, cm: 1, m: 100 };
// the lineweights AutoCAD accepts, hundredths of a millimetre
const WEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];

const num = (v) => {
  const s = (Math.round(v * 1e6) / 1e6).toString();
  return s === "-0" ? "0" : s;
};

export class DxfCanvas {
  /**
   * cmPerPt: centimetres of building per sheet point; unit: drawing unit
   * (mm, cm, m, in, ft); offset: world position of the sheet origin in
   * drawing units (to test plans drawn in survey coordinates).
   */
  constructor(width, height, { cmPerPt = 1, unit = "mm", offset = { x: 0, y: 0 }, writeUnits = true } = {}) {
    this.width = width;
    this.height = height;
    this.k = cmPerPt / CM[unit];
    this.unit = unit;
    this.offset = offset;
    this.writeUnits = writeUnits;
    this.layers = new Map([["0", 7]]);
    this.current = "0";
    this.entities = [];
    this.blocks = [];
    this.target = this.entities;
    this.strokeRgb = [0, 0, 0];
    this.fillRgb = [0, 0, 0];
    this.width_ = 1;
    this.path = [];
    this.sub = null;
  }
  W(p) { return { x: p.x * this.k + this.offset.x, y: -p.y * this.k + this.offset.y }; }
  layer(name) { if (!this.layers.has(name)) this.layers.set(name, 7); this.current = name; return this; }
  stroke(rgb) { this.strokeRgb = rgb; return this; }
  fill(rgb) { this.fillRgb = rgb; return this; }
  lineWidth(w) { this.width_ = w; return this; }
  dash() { return this; }
  moveTo(x, y) { this.sub = { pts: [{ x, y }], closed: false, arc: null }; this.path.push(this.sub); return this; }
  lineTo(x, y) { if (!this.sub) return this.moveTo(x, y); this.sub.pts.push({ x, y }); this.sub.arc = null; return this; }
  curveTo(x1, y1, x2, y2, x, y) { return this.lineTo(x, y); }
  close() { if (this.sub) this.sub.closed = true; return this; }
  polygon(pts) {
    pts.forEach((p, i) => (i ? this.lineTo(p.x, p.y) : this.moveTo(p.x, p.y)));
    return this.close();
  }
  line(a, b) { return this.moveTo(a.x, a.y).lineTo(b.x, b.y); }
  // the same y-down angles PdfCanvas.arc takes, kept as a true arc
  arc(c, r, a0, a1) {
    this.moveTo(c.x + Math.cos(a0) * r, c.y + Math.sin(a0) * r);
    this.sub.pts.push({ x: c.x + Math.cos(a1) * r, y: c.y + Math.sin(a1) * r });
    this.sub.arc = { c, r, a0, a1 };
    return this;
  }
  common(rgb) {
    const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    const lw = Math.round(this.width_ * 35.28);
    const weight = WEIGHTS.reduce((best, w) => (Math.abs(w - lw) < Math.abs(best - lw) ? w : best), 0);
    return [[8, this.current], [62, lum < 64 ? 7 : 8], [420, (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]], [370, weight]];
  }
  doStroke() {
    for (const sp of this.path) {
      const base = this.common(this.strokeRgb);
      if (sp.arc) {
        const { c, r, a0, a1 } = sp.arc, C = this.W(c), R = r * this.k;
        if (Math.abs(a1 - a0) >= 2 * Math.PI - 1e-9) {
          this.target.push(["CIRCLE", [...base, [10, C.x], [20, C.y], [30, 0], [40, R]]]);
          continue;
        }
        // y-down sheet angles turn the other way in y-up model space
        const s = Math.min(-a0, -a1), e = Math.max(-a0, -a1);
        this.target.push(["ARC", [...base, [10, C.x], [20, C.y], [30, 0], [40, R], [50, (s * 180) / Math.PI], [51, (e * 180) / Math.PI]]]);
        continue;
      }
      const pts = sp.pts.map((p) => this.W(p));
      if (pts.length === 2 && !sp.closed) {
        this.target.push(["LINE", [...base, [10, pts[0].x], [20, pts[0].y], [30, 0], [11, pts[1].x], [21, pts[1].y], [31, 0]]]);
      } else if (pts.length >= 2) {
        this.target.push(["LWPOLYLINE", [...base, [90, pts.length], [70, sp.closed ? 1 : 0], ...pts.flatMap((p) => [[10, p.x], [20, p.y]])]]);
      }
    }
    this.path = [];
    this.sub = null;
    return this;
  }
  doFill() {
    const rings = this.path.filter((sp) => sp.pts.length >= 3).map((sp) => sp.pts.map((p) => this.W(p)));
    if (rings.length) {
      const g = [...this.common(this.fillRgb), [10, 0], [20, 0], [30, 0], [210, 0], [220, 0], [230, 1], [2, "SOLID"], [70, 1], [71, 0], [91, rings.length]];
      for (const ring of rings) g.push([92, 2], [72, 0], [73, 1], [93, ring.length], ...ring.flatMap((p) => [[10, p.x], [20, p.y]]), [97, 0]);
      g.push([75, 0], [76, 1], [98, 0]);
      this.target.push(["HATCH", g]);
    }
    this.path = [];
    this.sub = null;
    return this;
  }
  doFillStroke() {
    const path = this.path;
    this.doFill();
    this.path = path;
    return this.doStroke();
  }
  // baseline origin at sheet (x, y), `angle` counter-clockwise on the page
  text(str, x, y, size, rgb = [0, 0, 0], angle = 0) {
    const p = this.W({ x, y });
    this.target.push(["TEXT", [...this.common(rgb), [10, p.x], [20, p.y], [30, 0], [40, size * this.k], [1, String(str)], [50, (angle * 180) / Math.PI]]]);
    return this;
  }
  save() { return this; }
  restore() { return this; }
  // blocks, for fixtures that test INSERT: draw between beginBlock and endBlock
  beginBlock(name, base = { x: 0, y: 0 }) {
    const block = { name, base, entities: [] };
    this.blocks.push(block);
    this.target = block.entities;
    return this;
  }
  endBlock() { this.target = this.entities; return this; }
  // insert in drawing units (not sheet points): x, y, scale, rotation (deg)
  insert(name, x, y, { sx = 1, sy = 1, rotation = 0, layer = this.current } = {}) {
    this.target.push(["INSERT", [[8, layer], [2, name], [10, x], [20, y], [30, 0], [41, sx], [42, sy], [43, 1], [50, rotation]]]);
    return this;
  }
}

export function writeDxf(canvas) {
  const out = [];
  const pair = (c, v) => out.push(String(c), typeof v === "number" ? num(v) : String(v));
  const entity = ([type, g]) => {
    pair(0, type);
    for (const [c, v] of g) pair(c, v);
  };
  pair(0, "SECTION"); pair(2, "HEADER");
  pair(9, "$ACADVER"); pair(1, "AC1015");
  if (canvas.writeUnits) { pair(9, "$INSUNITS"); pair(70, DXF_UNIT_CODE[canvas.unit]); }
  pair(9, "$MEASUREMENT"); pair(70, canvas.unit === "in" || canvas.unit === "ft" ? 0 : 1);
  pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "TABLES");
  pair(0, "TABLE"); pair(2, "LAYER"); pair(70, canvas.layers.size);
  for (const [name, color] of canvas.layers) {
    pair(0, "LAYER"); pair(2, name); pair(70, 0); pair(62, color); pair(6, "CONTINUOUS");
  }
  pair(0, "ENDTAB");
  pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "BLOCKS");
  for (const b of canvas.blocks) {
    pair(0, "BLOCK"); pair(8, "0"); pair(2, b.name); pair(70, 0); pair(10, b.base.x); pair(20, b.base.y); pair(30, 0); pair(3, b.name);
    b.entities.forEach(entity);
    pair(0, "ENDBLK"); pair(8, "0");
  }
  pair(0, "ENDSEC");
  pair(0, "SECTION"); pair(2, "ENTITIES");
  canvas.entities.forEach(entity);
  pair(0, "ENDSEC");
  pair(0, "EOF");
  return out.join("\n") + "\n";
}
