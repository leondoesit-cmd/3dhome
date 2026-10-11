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
  buildSheetScene, createProjector, createSheetDoc, createView, ensureSheetDoc, sceneToSvg,
  sheetFrame, titleBlockBox, TEXT_SIZES,
} from "./cad_sheet.js";
import { tessellateParts } from "./core/part_tessellate.js";
import { projectionBounds, viewBasis, viewForSight } from "./core/hidden_line.js";
import { calloutText, calloutTextById, holeCallouts, holeLeaderForViews } from "./core/hole_callout.js";
import { sheetTitleText } from "./core/custom_properties.js";
import { drawingMaterialName } from "./cad_appearances.js";
import { configuredBodiesForView } from "./cad_configured_drawing.js";
import {nativeConfiguredEligibility,configuredViewId} from "./core/native_configured_drawing.js";

/* The title block's TITLE is the Description property, as a SOLIDWORKS sheet
   format links it; the model name is only the fallback. */
const sheetTitle = (def, doc) => sheetTitleText(doc, def) || "Untitled part";

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
    scale: options.scale,
    draftingStandard: options.draftingStandard,
    orientation: options.orientation,
    views: options.views || ["front", "top", "right", "iso"],
    title: {
      title: options.title || sheetTitle(def),
      number: options.number || def?.partNumber || "",
      revision: options.revision || def?.revision || "A",
      author: options.author || "",
      company: options.company || "",
      material: options.material || drawingMaterialName(def),
      finish: options.finish || "",
      mass: options.mass || "",
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

/* Hole callouts attach to a face-on view of the entry axis. A drawing without
   such a view receives the callout text without a misleading leader. */
function calloutNotes(doc, callouts) {
  const primary = doc.views.find((view) => view.primary) || doc.views[0];
  if (!primary) return;
  callouts.forEach((row, index) => {
    const leader=holeLeaderForViews(row,doc.views);
    doc.notes.push({
      id: uid("n"),
      x: 30 + index * 4, y: 34 + index * 8,
      /* feature names WHICH hole this is; the text beside it is the last known
         reading, re-derived from the feature on every build. */
      feature: row.id,
      text: calloutText(row),
      leader,
    });
  });
}

/* Item balloons for an assembly sheet: each numbered target point is projected
   into the pictorial view and gets a leader that ends on it. */
function balloonNotes(doc, targets) {
  const view = doc.views.find((item) => /^iso/.test(item.dir || item.view?.dir || "")) || doc.views[doc.views.length - 1];
  if (!view) return;
  const basis = viewBasis(view.dir || view.view?.dir);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  targets.forEach((target, index) => {
    doc.notes.push({
      id: uid("n"), balloon: true, autoBalloon: true, text: String(target.item),
      dx: index % 2 ? -16 : 16, dy: -10 - (index % 3) * 6,
      leader: { viewId: view.id, u: dot(target.point, basis.right), v: dot(target.point, basis.up) },
    });
  });
}

function sheetNotes(doc,value) {
  if(typeof value!=='string')return;
  doc.notes=doc.notes.filter(note=>note.id!=='sheet-user-notes');
  delete doc.notesBandHeight;
  if(!value.trim())return;
  const frame=sheetFrame(doc),title=titleBlockBox(doc),x=frame.x0+6;
  const maxChars=Math.max(12,Math.floor((title.x-x-8)/(TEXT_SIZES.dim*.55)));
  const lines=['NOTES'];
  for(const paragraph of value.trim().replace(/\r\n?/g,'\n').split('\n')){
    let line='';
    for(const word of paragraph.split(/\s+/).filter(Boolean)){
      if(line && line.length+word.length+1>maxChars){lines.push(line);line='';}
      let remainder=word;
      while(remainder.length>maxChars){if(line){lines.push(line);line='';}lines.push(remainder.slice(0,maxChars));remainder=remainder.slice(maxChars);}
      line+=(line?' ':'')+remainder;
    }
    lines.push(line);
  }
  doc.notesBandHeight=Math.max(title.h,lines.length*TEXT_SIZES.dim*1.35+12);
  doc.notes.push({id:'sheet-user-notes',x,y:frame.y1-doc.notesBandHeight+6,text:lines.join('\n')});
}

export function buildDrawingScene(def, options = {}) {
  const bodies = tessellateParts(def?.parts);
  const doc = options.doc || (def?.drawing && options.useStored !== false ? ensureSheetDoc(def) : standardSheet(def, options, bodies));
  doc.assemblyLayout=def?.kind==="assembly";
  doc.enforceFit=options.requireFit===true;
  const namedNative=doc.views.some(view=>nativeConfiguredEligibility(def,configuredViewId(def,view)).eligible);
  if(namedNative && (doc.dims||[]).some(d=>d.modelItem||d.coneAngle||d.refs?.some(r=>r.pid||r.pid2)))throw new Error("Native configuration geometry requires per-view topology for associative dimensions");
  const topology=namedNative?null:options.topology || (def?.parts || []).map(part=>part.meshData?.topology || []);
  const provider=view=>{
    if(options.configuredBodiesForView)return options.configuredBodiesForView(view,bodies);
    const id=configuredViewId(def,view);
    const eligible=nativeConfiguredEligibility(def,id);
    if(id && def?.designTable?.kind==="circular-sweep" && def?.history?.some(e=>e.kind==="feature")) {
      if(!eligible.eligible)throw new Error(eligible.reason);
      throw new Error("Native configured drawing requires a prepared native body provider");
    }
    return configuredBodiesForView(def,view,bodies);
  };
  const project = createProjector(doc, bodies, { bodiesForView: provider,topology });
  if (options.overallDimensions !== false && !doc.dims?.length) autoOverallDims(doc, project);
  if (options.holeCallouts !== false && !doc.notes?.length) calloutNotes(doc, collectHoleCallouts(def,doc));
  sheetNotes(doc,options.notes);
  if (options.balloonTargets?.length) balloonNotes(doc, options.balloonTargets);
  const balloons = Array.isArray(options.balloons) ? options.balloons
    : options.balloons === false ? []
      : (options.balloons === true || def?.kind === "assembly" ? collectBalloons(def) : []);
  return buildSheetScene(doc, {
    projection: project,
    model: def,
    topology,
    callouts: calloutTextById(def,doc),
    meta: { title: options.title || sheetTitle(def, doc) },
    properties: def?.customProperties || {},
    explodeLines: options.explodeLines,
    bom: balloons.map((row) => ({ item: row.item, qty: row.qty, name: row.name, description: row.description, partNumber: row.partNumber, material: row.material })),
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
