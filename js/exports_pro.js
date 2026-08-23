import { S } from "./state.js";
import { wallGeom, contentBounds } from "./geometry.js";
import { wrapPlanSVG } from "./sheet_print.js";
import { doorSwingPoly } from "./swing_clearance.js";
import { openingCorners, slabOpenings } from "./slab_openings.js";

function esc(value) { return String(value == null ? "" : value).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
function csv(value) { const s = String(value == null ? "" : value); return /[\",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function step(value) { return String(value == null ? "" : value).replace(/'/g, "''").replace(/[\r\n]/g, " "); }
function ifcGuid(value) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  let seed = 2166136261;
  for (const char of String(value)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  let out = "";
  for (let i = 0; i < 22; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; out += alphabet[seed & 63]; }
  return out;
}
export function downloadText(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type || "text/plain;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Content is emitted with its own origin at (0,0) in model centimetres;
   js/sheet_print.js owns the paper, the margins and the print scale. */
export function toSVG(opts) {
  const b = contentBounds();
  const x = (v) => v - b.minx, y = (v) => b.maxz - v;
  const walls = S.walls.map((w) => { const g = wallGeom(w); return `<line x1="${x(g.a.x)}" y1="${y(g.a.z)}" x2="${x(g.b.x)}" y2="${y(g.b.z)}" stroke="#20242a" stroke-width="${w.thickness || 10}"/>`; }).join("");
  const items = S.items.map((it) => `<g transform="translate(${x(it.x)} ${y(it.z)}) rotate(${-it.rot || 0})"><rect x="${-it.w / 2}" y="${-it.d / 2}" width="${it.w}" height="${it.d}" fill="#d8c8a8" stroke="#564c3f"/><title>${esc(it.type)}</title></g>`).join("");
  const voids = slabOpenings().map((o) => {
    const pts = openingCorners(o).map((p) => `${x(p.x)},${y(p.z)}`).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="#6a6560" stroke-dasharray="8 5" stroke-width="1.5"><title>${esc(o.name || "void")}</title></polygon>`;
  }).join("");
  const swings = (S.openings || []).map((o) => {
    const poly = doorSwingPoly(o);
    if (!poly) return "";
    return `<polygon points="${poly.map((p) => `${x(p.x)},${y(p.z)}`).join(" ")}" fill="none" stroke="#5b7a86" stroke-width="1"/>`;
  }).join("");
  const inner = `${walls}${voids}${swings}${items}`;
  return wrapPlanSVG(inner, b, Object.assign({
    name: (S.workspace && S.workspace.name) || "Untitled",
  }, opts || {}));
}

export function toDXF() {
  let out = "0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n5\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";
  S.walls.forEach((w) => { const g = wallGeom(w); out += `0\nLINE\n8\nWALLS\n10\n${g.a.x}\n20\n${g.a.z}\n30\n0\n11\n${g.b.x}\n21\n${g.b.z}\n31\n0\n`; });
  return out + "0\nENDSEC\n0\nEOF\n";
}

export function toIFC() {
  const rows = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');", "FILE_NAME('home3d.ifc','','',('Home Planner'),('Home Planner'),'','','');", "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;"];
  S.walls.forEach((w, i) => rows.push(`#${i + 1}=IFCBUILDINGELEMENTPROXY('${ifcGuid("wall-" + w.id)}',$,'Wall ${i + 1}',$,$,$,$,$,$);`));
  S.items.forEach((it, i) => rows.push(`#${S.walls.length + i + 1}=IFCFURNISHINGELEMENT('${ifcGuid("item-" + it.id)}',$,'${step(it.type)}',$,$,$,$,$,$);`));
  return rows.concat(["ENDSEC;", "END-ISO-10303-21;"]).join("\n");
}

export function toScheduleCSV() {
  const rows = [["category", "type", "id", "width_cm", "depth_cm", "height_cm", "x_cm", "z_cm"]];
  S.openings.forEach((o) => rows.push(["opening", o.type || o.kind || "opening", o.id, o.width, "", o.height || "", "", ""]));
  S.items.forEach((it) => rows.push(["furniture", it.type, it.id, it.w, it.d, it.h, it.x, it.z]));
  (S.mep?.nodes || []).forEach((n) => rows.push(["mep-node", n.sys + "." + n.k, n.id, "", "", n.elev, n.x, n.z]));
  return rows.map((r) => r.map(csv).join(",")).join("\n");
}
