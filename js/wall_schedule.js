import { wallCurveGeom, wallProfileHeight, normalizeWallKind, verticalSegments } from "./wall_curves.js";
import { ensureWallTypes, wallPhase, wallThickness } from "./wall_types.js";

function baseAt(w, s, length) {
  const p = w && w.profile || {};
  const controls = Array.isArray(p.base) ? p.base : Array.isArray(w && w.baseProfile) ? w.baseProfile : [];
  if (!controls.length) {
    const a = Number.isFinite(+p.baseA) ? +p.baseA : 0, b = Number.isFinite(+p.baseB) ? +p.baseB : a;
    return Math.max(0, a + (b - a) * (length ? s / length : 0));
  }
  const pts = controls.map((entry) => Array.isArray(entry)
    ? { s: +entry[0] || 0, h: +entry[1] || 0 }
    : { s: +(entry.s ?? entry.distance) || 0, h: +(entry.height ?? entry.h) || 0 })
    .sort((a, b) => a.s - b.s);
  if (s <= pts[0].s) return Math.max(0, pts[0].h);
  for (let i = 1; i < pts.length; i++) if (s <= pts[i].s) {
    const a = pts[i - 1], b = pts[i], f = (s - a.s) / (b.s - a.s || 1);
    return Math.max(0, a.h + (b.h - a.h) * f);
  }
  return Math.max(0, pts.at(-1).h);
}

function wallArea(w, length, maxHeight) {
  if (normalizeWallKind(w) === "roomDivider") return { height: 0, area: 0 };
  const probe = { ...w, length }, steps = Math.max(2, Math.ceil(length / 50));
  let area = 0;
  const span = (s) => {
    const p = probe.profile && !Array.isArray(probe.profile) ? probe.profile : {};
    const compactTop = Number.isFinite(+p.topA) || Number.isFinite(+p.topB)
      ? (Number.isFinite(+p.topA) ? +p.topA : maxHeight) +
        ((Number.isFinite(+p.topB) ? +p.topB : maxHeight) - (Number.isFinite(+p.topA) ? +p.topA : maxHeight)) * (length ? s / length : 0)
      : wallProfileHeight(probe, s, maxHeight);
    return Math.max(0, Math.min(maxHeight, compactTop) - baseAt(probe, s, length));
  };
  let previous = span(0);
  for (let i = 1; i <= steps; i++) {
    const current = span(length * i / steps);
    area += (previous + current) / 2 * (length / steps); previous = current;
  }
  return { height: length ? area / length : 0, area };
}

export function wallSchedule(state, options = {}) {
  ensureWallTypes(state);
  const typeById = new Map((state.wallTypes || []).map((type) => [type.id, type]));
  const openings = state.openings || [];
  const rows = (state.walls || []).map((w) => {
    const type = typeById.get(w.wallTypeId) || null;
    const geometry = wallCurveGeom(w, state.nodes);
    const length = typeof options.lengthOf === "function" ? options.lengthOf(w) : geometry ? geometry.length : 0;
    const vertical = verticalSegments(w, typeById), maxHeight = vertical.reduce((sum, segment) => sum + Math.max(0, segment.top - segment.bottom), 0) || +(w.height || 270);
    const measured = wallArea(w, length, maxHeight), height = measured.height;
    const openingArea = openings
      .filter((o) => o.wall === w.id)
      .reduce((sum, o) => {
        const width = Math.min(length, Math.max(0, +o.width || 0)), s = Math.max(0, Math.min(length, +o.s || 0));
        const availableTop = Math.min(maxHeight, wallProfileHeight({ ...w, length }, s, maxHeight));
        const availableBottom = baseAt(w, s, length), bottom = Math.max(availableBottom, +o.sill || 0), top = Math.min(availableTop, (+o.sill || 0) + Math.max(0, +o.height || 0));
        return sum + width * Math.max(0, top - bottom);
      }, 0);
    return {
      id: w.id,
      typeId: w.wallTypeId || "generic",
      typeName: type && type.name || w.wallTypeId || "Generic wall",
      kind: w.kind || "normal",
      phase: wallPhase(w),
      lengthCm: length,
      heightCm: height,
      thicknessCm: wallThickness(w, state),
      grossAreaM2: measured.area / 10000,
      netAreaM2: Math.max(0, measured.area - openingArea) / 10000,
      openingAreaM2: openingArea / 10000,
      layerCount: type && Array.isArray(type.layers) ? type.layers.length : 1,
    };
  });
  const totals = rows.reduce((out, row) => {
    const key = [row.phase, row.typeId, row.kind].join("|");
    const g = out[key] || (out[key] = {
      phase: row.phase, typeId: row.typeId, typeName: row.typeName, kind: row.kind,
      count: 0, lengthM: 0, grossAreaM2: 0, netAreaM2: 0,
    });
    g.count++;
    g.lengthM += row.lengthCm / 100;
    g.grossAreaM2 += row.grossAreaM2;
    g.netAreaM2 += row.netAreaM2;
    return out;
  }, {});
  return { rows, groups: Object.values(totals) };
}

/* One quoted CSV cell. Wall-type and material names are typed by the user (or
   arrive inside a shared project), and a spreadsheet runs a cell that starts
   with = + - @ as a formula — "=HYPERLINK(...)" in a type name executed when
   the schedule was opened. Such text is prefixed with ' so it stays text;
   numbers are written as they are, so a negative quantity keeps its sign. */
export function csvCell(value) {
  let text = typeof value === "number" ? String(value) : String(value == null ? "" : value);
  if (typeof value !== "number" && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function wallScheduleCSV(schedule) {
  const rows = [["Wall", "Type", "Kind", "Phase", "Length (m)", "Height (m)", "Thickness (cm)", "Net area (m²)"]];
  (schedule.rows || []).forEach((r) => rows.push([
    r.id, r.typeName, r.kind, r.phase, (r.lengthCm / 100).toFixed(2),
    (r.heightCm / 100).toFixed(2), r.thicknessCm.toFixed(1), r.netAreaM2.toFixed(2),
  ]));
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
