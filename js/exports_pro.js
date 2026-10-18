import {drawingSnapshot, sheetSnapshot} from "./drawing_snapshot.js";
import { constructionSheetSVG, sheetBounds } from "./drawing_sheet.js";
import { sheetLayout } from "./sheet_print.js";
import { fmtLen, fmtAreaM2, displayUnit } from "./display_units.js";
import { t } from "./i18n.js";
import {drawingSVG,drawingDXF,drawingBounds} from "./drawing_export.js";
import { S } from "./state.js";
import { contentBounds } from "./geometry.js";
import { wrapPlanSVG } from "./sheet_print.js";

function esc(value) { return String(value == null ? "" : value).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
function csv(value) {
  let s = String(value == null ? "" : value);
  if (typeof value !== "number" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[\",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function step(value) { return String(value == null ? "" : value).replace(/'/g, "''").replace(/[\r\n]/g, " "); }
function ifcGuid(value) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  let seed = 2166136261;
  for (const char of String(value)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  let out = "";
  // 22 base-64 digits carry 128 bits, so the leading digit holds only the top
  // two: IfcGloballyUniqueId must start with 0-3 or readers reject the file.
  for (let i = 0; i < 22; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; out += alphabet[seed & (i ? 63 : 3)]; }
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
  const snapshot=drawingSnapshot(),bounds=drawingBounds(snapshot,opts)||contentBounds();
  return wrapPlanSVG(drawingSVG(snapshot,bounds,opts),bounds,Object.assign({name:S.workspace?.name||"Untitled"},opts||{}));
}

/* The construction floor plan (js/drawing_sheet.js) on paper. The paper
   scale decides how many model centimetres a millimetre of margin is, and
   the margins decide the scale, so the layout is settled in two passes. */
export function toConstructionSVG(opts) {
  const o = opts || {};
  const snap = sheetSnapshot();
  if (snap.area && snap.area.m2 != null)
    snap.area.text = t("sheet_living_area", { floor: snap.floorName || t("floor_ground_name"), area: fmtAreaM2(snap.area.m2, { digits: 0 }) });
  let k = 5, bounds = null;
  for (let pass = 0; pass < 3; pass++) {
    bounds = sheetBounds(snap, k);
    if (!bounds) break;
    const next = sheetLayout(bounds, o).cmPerMm;
    if (next === k) break;
    k = next;
  }
  if (!bounds) return wrapPlanSVG("", contentBounds(), o);
  const fmt = (cm) => fmtLen(cm, { domain: "plan", suffix: false });
  const inner = constructionSheetSVG(snap, { cmPerMm: k, bounds, fmt, t });
  return wrapPlanSVG(inner, bounds, Object.assign({
    name: (S.workspace && S.workspace.name ? S.workspace.name + " — " : "") + t("sheet_floor_plan"),
    sheet: "A-101",
    note: t("sheet_note", { unit: t("guide_unit_" + displayUnit("plan")) }),
  }, o));
}

export function toDXF(opts) {
  return drawingDXF(drawingSnapshot(),Object.assign({ fmt: (cm) => fmtLen(cm, { domain: "plan", suffix: false }) }, opts || {}));
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
