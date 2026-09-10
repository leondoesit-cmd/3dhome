/* Exporting a sheet: the same drawing, on paper.
 *
 * This used to be a second, weaker drawing engine — three rectangles, one line
 * weight and a caption — so an exported sheet had nothing to do with the sheet
 * on screen. Now it builds the SAME document (cad_sheet.js) from the SAME
 * projections (core/hidden_line.js) and hands it to the SAME SVG writer. A
 * model that has never been opened in Drawing mode still exports: it gets a
 * standard three-view sheet built here, with the overall sizes dimensioned and
 * any hole callouts the feature tree knows about.
 *
 * Pure: no DOM outside downloadDrawing(), so tests drive the whole pipeline.
 */

import {
  buildSheetScene, createProjector, createSheetDoc, createView, sceneToSvg,
} from "./cad_sheet.js";
import { tessellateParts } from "./core/part_tessellate.js";
import { projectionBounds, viewBasis, viewForSight } from "./core/hidden_line.js";
import { calloutText, calloutTextById, holeCallouts } from "./core/hole_callout.js";

/* Kept as the name this module has always exported; the walk itself is shared
   with the interactive sheet (see core/hole_callout.js) so both engines spell a
   callout the same way. */
export const collectHoleCallouts = holeCallouts;

export function collectBalloons(def) {
  const parts = def?.parts || [];
  return parts.map((part, index) => ({
    item: index + 1,
    name: part.name || part.kind || "Part",
    material: part.materialName || "",
    qty: 1,
  }));
}

const uid = (prefix) => prefix + Math.random().toString(36).slice(2, 9);

/* The middle of the model along one direction, so a cut asked for in passing
   goes through the part instead of grazing its edge. */
function centreAlong(bodies, direction) {
  let low = Infinity, high = -Infinity;
  for (const body of bodies || []) {
    const positions = body.positions || [];
    for (let i = 0; i + 2 < positions.length; i += 3) {
      const along = Number(positions[i]) * direction.x + Number(positions[i + 1]) * direction.y + Number(positions[i + 2]) * direction.z;
      if (!Number.isFinite(along)) continue;
      if (along < low) low = along;
      if (along > high) high = along;
    }
  }
  return Number.isFinite(low) ? (low + high) / 2 : 0;
}

/* The sheet an unopened model exports: three principal views in third angle
   plus a pictorial, at whatever standard scale fits the paper. */
function standardSheet(def, options, bodies) {
  const doc = createSheetDoc({
    size: options.size || "A3",
    units: options.units || def?.context?.units?.length || "cm",
    projection: options.projection,
    views: options.views || ["front", "top", "right", "iso"],
    title: {
      title: options.title || def?.name || "Untitled part",
      number: options.number || def?.partNumber || "",
      revision: options.revision || def?.revision || "A",
      author: options.author || "",
      company: options.company || "",
      material: options.material || def?.material || "",
      date: options.date || "",
    },
  });
  if (options.section) {
    /* A cut down the middle of the primary view, seen from the side the arrows
       point at — the same rule the interactive sheet applies, so exporting a
       section and drawing one produce the same view. */
    const primary = doc.views.find((view) => view.primary) || doc.views[0];
    const basis = viewBasis(primary.dir);
    doc.views.push(createView(viewForSight(basis.right), {
      label: "SECTION A-A",
      parent: primary.id,
      section: { axis: "vertical", at: centreAlong(bodies, basis.right), from: primary.id, flip: false, tag: "A" },
    }));
  }
  return doc;
}

/* The two sizes every drawing carries. Placed from the projection itself, so an
   exported sheet is dimensioned even when nobody has drafted on it. */
function autoOverallDims(doc, project) {
  const primary = doc.views.find((view) => view.primary) || doc.views[0];
  if (!primary) return;
  const bounds = projectionBounds(project(primary));
  if (!bounds) return;
  doc.dims.push({
    id: uid("d"), auto: true, viewId: primary.id, type: "horizontal",
    refs: [{ u: bounds.u0, v: bounds.v0 }, { u: bounds.u1, v: bounds.v0 }], offset: -12,
  });
  doc.dims.push({
    id: uid("d"), auto: true, viewId: primary.id, type: "vertical",
    refs: [{ u: bounds.u1, v: bounds.v0 }, { u: bounds.u1, v: bounds.v1 }], offset: 12,
  });
}

/* Hole callouts become leader notes on the primary view — the same place a
   draughtsman would put them, rather than a list beside the drawing. */
function calloutNotes(doc, callouts) {
  const primary = doc.views.find((view) => view.primary) || doc.views[0];
  if (!primary) return;
  callouts.forEach((row, index) => {
    const point = row.points[0] || { u: 0, v: 0 };
    doc.notes.push({
      id: uid("n"),
      x: 30 + index * 4, y: 34 + index * 8,
      /* feature names WHICH hole this is; the text beside it is the last known
         reading, re-derived from the feature on every build. */
      feature: row.id,
      text: calloutText(row),
      leader: { viewId: primary.id, u: point.u, v: point.v },
    });
  });
}

export function buildDrawingScene(def, options = {}) {
  const bodies = tessellateParts(def?.parts);
  const doc = options.doc || (def?.drawing && options.useStored !== false ? def.drawing : standardSheet(def, options, bodies));
  const project = createProjector(doc, bodies);
  if (!doc.dims?.length) autoOverallDims(doc, project);
  if (options.holeCallouts !== false && !doc.notes?.length) calloutNotes(doc, collectHoleCallouts(def));
  const balloons = Array.isArray(options.balloons) ? options.balloons
    : options.balloons === false ? []
      : (options.balloons === true || def?.kind === "assembly" ? collectBalloons(def) : []);
  return buildSheetScene(doc, {
    projection: project,
    callouts: calloutTextById(def),
    meta: { title: options.title || doc.title.title || def?.name || "Untitled part" },
    bom: balloons.map((row) => ({ item: row.item, qty: row.qty, name: row.name, material: row.material })),
  });
}

export function createDrawingSvg(def, options = {}) {
  return sceneToSvg(buildDrawingScene(def, options));
}

export function downloadDrawing(def, options) {
  const svg = createDrawingSvg(def, options), blob = new Blob([svg], { type: "image/svg+xml" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = (def.name || "drawing").replace(/[^a-z0-9_-]+/gi, "_") + ".svg"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
