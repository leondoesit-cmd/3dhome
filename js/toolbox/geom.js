// Shared millimetre/centimetre geometry helpers for toolbox parts.
// Document solids stay in centimetres; every standard table is millimetres.

export function mmToCm(mm) { return Number(mm) / 10; }
export function cmToMm(cm) { return Number(cm) * 10; }
export function inchToMm(inch) { return Number(inch) * 25.4; }

export function near(a, b, t = 1e-4) {
  return Math.abs(Number(a) - Number(b)) <= t;
}

export function freezeMap(obj) {
  const out = {};
  for (const key of Object.keys(obj)) out[key] = Object.freeze(obj[key]);
  return Object.freeze(out);
}

export function normalizeLod(value) {
  if (value === "coarse" || value === 0 || value === "0") return 0;
  if (value === "fine" || value === 2 || value === "2" || value === "high") return 2;
  return 1;
}

export function lodSegments(lod, fine = 32) {
  if (lod <= 0) return 8;
  if (lod === 1) return 16;
  return fine;
}

export function hexPoints(acrossFlatsCm) {
  const r = acrossFlatsCm / Math.sqrt(3);
  return Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + i * Math.PI / 3;
    return { u: Math.cos(a) * r, v: Math.sin(a) * r };
  });
}

export function circleLoop(u, v, r, segments = 24) {
  const n = Math.max(8, Math.round(Number(segments) || 24));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { u: u + Math.cos(a) * r, v: v + Math.sin(a) * r };
  });
}

export function annulusProfile(centerU, outerR, innerR, segments = 16) {
  const n = Math.max(8, Math.round(Number(segments) || 16));
  const outer = [];
  const inner = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    outer.push({ u: centerU + Math.cos(a) * outerR, v: Math.sin(a) * outerR });
  }
  for (let i = n; i >= 0; i--) {
    const a = (i / n) * Math.PI * 2;
    inner.push({ u: centerU + Math.cos(a) * innerR, v: Math.sin(a) * innerR });
  }
  return outer.concat(inner);
}

export function rectLoop(width, height, cx = 0, cy = 0) {
  const hx = width / 2, hy = height / 2;
  return [
    { u: cx - hx, v: cy - hy },
    { u: cx + hx, v: cy - hy },
    { u: cx + hx, v: cy + hy },
    { u: cx - hx, v: cy + hy },
  ];
}

export function roundedRectLoop(width, height, radius, cx = 0, cy = 0, segments = 3) {
  const hx = width / 2, hy = height / 2;
  const r = Math.max(0, Math.min(radius, hx, hy));
  if (r <= 1e-6) return rectLoop(width, height, cx, cy);
  const pts = [];
  const corners = [
    [cx + hx - r, cy + hy - r, 0],
    [cx - hx + r, cy + hy - r, Math.PI / 2],
    [cx - hx + r, cy - hy + r, Math.PI],
    [cx + hx - r, cy - hy + r, Math.PI * 1.5],
  ];
  corners.forEach(([x, y, start]) => {
    for (let i = 0; i <= segments; i++) {
      const a = start + (i / segments) * (Math.PI / 2);
      pts.push({ u: x + Math.cos(a) * r, v: y + Math.sin(a) * r });
    }
  });
  return pts;
}

function rowMatchesQuery(row, raw, upper, tagged) {
  if (!row) return false;
  const label = String(row.size || "").toUpperCase().replace(/\s+/g, "");
  if (label && (label === upper || label === tagged || String(row.size) === raw)) return true;
  if (row.dn != null && (String(row.dn) === raw || ("DN" + row.dn) === tagged || ("DN" + row.dn) === upper)) return true;
  return false;
}

export function lookupSize(table, size, fallback) {
  if (!table) return null;
  const key = lookupSizeKey(table, size);
  if (key) return table[key];
  if (fallback && table[fallback]) return table[fallback];
  return null;
}

export function lookupSizeKey(table, size) {
  if (!table) return null;
  const raw = String(size == null ? "" : size).trim();
  if (!raw) return null;
  if (table[raw]) return raw;
  const upper = raw.toUpperCase().replace(/\s+/g, "");
  if (table[upper]) return upper;
  const tagged = upper.startsWith("M") || upper.startsWith("#") ? upper : "M" + upper;
  if (table[tagged]) return tagged;
  const dotted = tagged.replace("_", ".");
  if (table[dotted]) return dotted;
  const keys = Object.keys(table).filter((key) => {
    const row = table[key];
    return rowMatchesQuery(row, raw, upper, tagged);
  });
  return keys.length === 1 ? keys[0] : null;
}
