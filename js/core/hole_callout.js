import { viewBasis } from "./hidden_line.js";
import { sketchWorldPoint } from "./swept_sources.js";
import { cylinderAxis } from "./cylinder_axis.js";
/* One spelling of "M6×1 6H ↓12".
 *
 * A hole callout is written in two places — the sheet you draft on
 * (modeler_drawing.js) and the sheet an unopened model exports
 * (cad_drawings.js) — and a drawing where those two disagree is worse than one
 * that carries no callouts at all. So the reading of a hole feature lives here
 * once: which holes a document has, what each one is called, and how many.
 * cad_hole_wizard.js still owns the FORMAT (holeCallout), because that is the
 * same string the wizard's own preview shows; this module owns the walk over
 * the feature tree that turns a document into rows a sheet can annotate.
 *
 * The rows are read on every rebuild, never stored: a callout that still says
 * M6 after the wizard was changed to M8 is the same lie as a dimension frozen
 * at its placed value.
 */

import { holeCallout, holeLayoutPoints } from "../cad_hole_wizard.js";

export { holeCallout, holeLayoutPoints };

/* Every live hole in a feature tree, as a drawing would call it out. A
   suppressed hole is not in the model, so it is not on the paper either. */
export function holeCallouts(def) {
  const features = def?.features || [];
  const rows = [];
  features.forEach((feature) => {
    if (!feature || feature.type !== "hole" || feature.suppressed) return;
    const params=feature.params || {}, sketchId=params.sketchId || params.sketch || feature.sketch;
    const sketch=(def.sketches || []).find(s=>s.id===sketchId) || (!sketchId ? def.sketch : null);
    if(sketchId && !sketch && (!params.layout || params.layout==="sketch"))return;
    const points = holeLayoutPoints(params,sketch);
    const plane=sketch?.plane || (params.axis==="x"?"side":params.axis==="z"?"front":"top");
    const placement={...sketch,plane,offset:Number(params.offset ?? sketch?.offset)||0};
    if(params.frame){placement.frameSpace="local";placement.frame=params.frame;}
    const axis=cylinderAxis(placement.frame?.normal || (plane==="side"?"x":plane==="front"?"z":"y"));
    const worldPoints=points.map(p=>{const q=sketchWorldPoint(placement,p.u,p.v);if(placement.frame)for(const key of ["x","y","z"])q[key]+=axis[key]*(Number(params.offset)||0);return q;});
    rows.push({
      id: feature.id,
      item: rows.length + 1,
      callout: holeCallout(feature.params || {}),
      quantity: points.length,
      points,worldPoints,axis,
    });
  });
  return rows;
}

/* The text on the paper: the callout, and the count when a pattern of holes is
   called out once rather than one leader per hole. */
export function calloutText(row) {
  if (!row) return "";
  return row.callout + (row.quantity > 1 ? "  ×" + row.quantity : "");
}

/* featureId -> text, which is what a sheet needs to re-read a bound callout on
   every build without knowing anything about holes. */
export function calloutTextById(def) {
  const out = new Map();
  for (const row of holeCallouts(def)) out.set(row.id, calloutText(row));
  return out;
}

// Pick a face-on view and project the current entry point into its basis.
export function holeLeaderForViews(row, views) {
  const world=row.worldPoints?.[0];if(!world||!row.axis)return null;
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const candidates=views.map(view=>({view,basis:viewBasis(view.dir || view.view?.dir)}));
  const chosen=candidates.find(item=>dot(item.basis.forward,row.axis)>.95) || candidates.find(item=>Math.abs(dot(item.basis.forward,row.axis))>.95);
  return chosen?{viewId:chosen.view.id,u:dot(world,chosen.basis.right),v:dot(world,chosen.basis.up)}:null;
}
