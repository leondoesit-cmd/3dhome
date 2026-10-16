// Minimal single-page PDF writer for the floor-plan bench: the synthetic
// generator draws plans as real vector content streams so the vector-PDF
// import path can be measured against exact ground truth. Only what plan
// sheets use: paths (m/l/c/re, fill/stroke), line widths, RGB colours and
// Helvetica text. Coordinates are PDF points with y up.

const num = (v) => {
  const s = (Math.round(v * 1000) / 1000).toString();
  return s === "-0" ? "0" : s;
};

export class PdfCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.ops = [];
  }
  // y-down convenience: callers think in sheet coordinates like an image
  Y(y) { return this.height - y; }
  stroke(rgb) { this.ops.push(`${rgb.map((c) => num(c / 255)).join(" ")} RG`); return this; }
  fill(rgb) { this.ops.push(`${rgb.map((c) => num(c / 255)).join(" ")} rg`); return this; }
  lineWidth(w) { this.ops.push(`${num(w)} w`); return this; }
  dash(pattern) { this.ops.push(`[${pattern.map(num).join(" ")}] 0 d`); return this; }
  moveTo(x, y) { this.ops.push(`${num(x)} ${num(this.Y(y))} m`); return this; }
  lineTo(x, y) { this.ops.push(`${num(x)} ${num(this.Y(y))} l`); return this; }
  curveTo(x1, y1, x2, y2, x, y) {
    this.ops.push(`${num(x1)} ${num(this.Y(y1))} ${num(x2)} ${num(this.Y(y2))} ${num(x)} ${num(this.Y(y))} c`);
    return this;
  }
  close() { this.ops.push("h"); return this; }
  doStroke() { this.ops.push("S"); return this; }
  doFill() { this.ops.push("f"); return this; }
  doFillStroke() { this.ops.push("B"); return this; }
  polygon(pts) {
    pts.forEach((p, i) => (i ? this.lineTo(p.x, p.y) : this.moveTo(p.x, p.y)));
    return this.close();
  }
  line(a, b) { return this.moveTo(a.x, a.y).lineTo(b.x, b.y); }
  // circular arc as cubic Béziers (≤ 90° each), y-down angles
  arc(c, r, a0, a1) {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2)));
    const step = (a1 - a0) / n, k = (4 / 3) * Math.tan(step / 4);
    let x = c.x + Math.cos(a0) * r, y = c.y + Math.sin(a0) * r;
    this.moveTo(x, y);
    for (let i = 0; i < n; i++) {
      const s = a0 + step * i, e = s + step;
      const ex = c.x + Math.cos(e) * r, ey = c.y + Math.sin(e) * r;
      this.curveTo(
        x - k * r * Math.sin(s), y + k * r * Math.cos(s),
        ex + k * r * Math.sin(e), ey - k * r * Math.cos(e),
        ex, ey,
      );
      x = ex;
      y = ey;
    }
    return this;
  }
  // Helvetica text with its baseline origin at sheet (x, y); `angle` turns
  // the baseline counter-clockwise on the page (90° reads bottom-to-top).
  text(str, x, y, size, rgb = [0, 0, 0], angle = 0) {
    const safe = String(str).replace(/[\\()]/g, (m) => "\\" + m);
    const c = Math.cos(angle), s = Math.sin(angle);
    this.ops.push(`BT /F1 ${num(size)} Tf ${rgb.map((v) => num(v / 255)).join(" ")} rg ` +
      `${num(c)} ${num(s)} ${num(-s)} ${num(c)} ${num(x)} ${num(this.Y(y))} Tm (${safe}) Tj ET`);
    return this;
  }
  save() { this.ops.push("q"); return this; }
  restore() { this.ops.push("Q"); return this; }
}

export function writePdf(canvas) {
  const content = Buffer.from(canvas.ops.join("\n"), "latin1");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(canvas.width)} ${num(canvas.height)}] ` +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    null, // content stream
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  const parts = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets = [];
  let length = parts[0].length;
  objects.forEach((body, i) => {
    offsets.push(length);
    const chunk = body === null
      ? Buffer.concat([
          Buffer.from(`${i + 1} 0 obj\n<< /Length ${content.length} >>\nstream\n`, "latin1"),
          content,
          Buffer.from("\nendstream\nendobj\n", "latin1"),
        ])
      : Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, "latin1");
    parts.push(chunk);
    length += chunk.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`]
    .concat(offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)).join("");
  parts.push(Buffer.from(
    `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`, "latin1"));
  return Buffer.concat(parts);
}
