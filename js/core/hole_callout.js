import { viewBasis } from "./hidden_line.js";
import { sketchWorldPoint } from "./swept_sources.js";
import { cylinderAxis } from "./cylinder_axis.js";
import { linearPatternOffsets, linearPatternAxisDefinitions, parseSkippedPatternInstances } from "./pattern_geometry.js";
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
import { resolveDimAnchor } from "../cad_sheet.js";

export { holeCallout, holeLayoutPoints };

/* Every live hole in a feature tree, as a drawing would call it out. A
   suppressed hole is not in the model, so it is not on the paper either. */
export function holeCallouts(def, sheet = def?.drawing || {}) {
  const features = def?.features || [];
  const rows = [];
  features.forEach((feature) => {
    if (!feature || feature.type !== "hole" || feature.suppressed) return;
    const params=feature.params || {}, sketchId=params.sketchId || params.sketch || feature.sketch;
    const sketch=(def.sketches || []).find(s=>s.id===sketchId) || (!sketchId ? def.sketch : null);
    if(sketchId && !sketch && (!params.layout || params.layout==="sketch"))return;
    const points = holeLayoutPoints(params,sketch);
    const plane=sketch?.plane || (params.axis==="x"?"side":params.axis==="z"?"front":"top");
    const placement={...sketch,plane,offset:(sketch?.frame?0:Number(sketch?.offset)||0)+(Number(params.offset)||0)};
    if(params.frame){placement.frameSpace="local";placement.frame=params.frame;}
    const axis=cylinderAxis(placement.frame?.normal || (plane==="side"?"x":plane==="front"?"z":"y"));
    const worldPoints=points.map(p=>{const q=sketchWorldPoint(placement,p.u,p.v);if(placement.frame)for(const key of ["x","y","z"])q[key]+=axis[key]*(Number(params.offset)||0);return q;});
    // Feature patterns repeat the seed cut. Reuse their instance semantics,
    // including disabled axes and skipped copies, instead of reporting only
    // the seed sketch's hole count.
    const patterns = features.filter(item => item?.type === "pattern" && !item.suppressed
      && item.params?.scope === "feature" && item.params.seedFeatureId === feature.id
      && item.params.mode === "linear");
    let quantity = points.length;
    for (const pattern of patterns) quantity += points.length * linearPatternOffsets(pattern.params).length;
    // A circular layout is a bolt circle: its holes are equally spaced by construction.
    const circularLayout=params.layout==="circular" && points.length>1 && !patterns.length;
    const equalSpacing=circularLayout || patterns.length===1 && quantity>1
      && parseSkippedPatternInstances(patterns[0].params.skipInstances).size===0
      && linearPatternAxisDefinitions(patterns[0].params).length===1
      && linearPatternAxisDefinitions(patterns[0].params).every(axis=>axis.spacing!==0 && axis.spacingIncrement===0);
    rows.push({
      id: feature.id,
      item: rows.length + 1,
      callout: holeCallout({...params, displayUnit:sheet.units || params.displayUnit || def?.context?.units?.length},sheet),
      quantity,
      equalSpacing,
      points,worldPoints,axis,
    });
  });
  return rows;
}

/* The text on the paper: the callout, and the count when a pattern of holes is
   called out once rather than one leader per hole. */
export function calloutText(row) {
  if (!row) return "";
  return row.callout + (row.quantity > 1 ? "  ×" + row.quantity : "") + (row.equalSpacing ? " EQ SP." : "");
}

/* featureId -> text, which is what a sheet needs to re-read a bound callout on
   every build without knowing anything about holes. */
export function calloutTextById(def, sheet) {
  const out = new Map();
  for (const row of holeCallouts(def,sheet)) out.set(row.id, calloutText(row));
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

// Bind a callout to the circular rim at its feature's actual placement. A
// feature prefix can also name inherited edges from older holes, so the first
// lexicographic topology id is not necessarily this hole's edge.
export function holeTopologyAnchor(index, basis, featureId, projected) {
  if (!index || !basis || !featureId) return null;
  const prefix = featureId + ":";
  let best = null, cylinderFaces = [];
  for (const [pid, entry] of index) {
    const descriptor = entry?.descriptor || {};
    if (!pid.startsWith(prefix)) continue;
    const circle = entry.kind === "edge" && descriptor.curve === "circle";
    const cylinder = entry.kind === "face" && descriptor.surface === "cylinder";
    if (!circle && !cylinder) continue;
    const at = resolveDimAnchor({pid,kind:entry.kind,at:"centre"},index,basis);
    if (!at) continue;
    if (cylinder) cylinderFaces.push({pid,kind:entry.kind,at:"centre",u:at.u,v:at.v});
    if (!projected) continue;
    const distance = Math.hypot(at.u-projected.u,at.v-projected.v);
    const tolerance = Math.max(0.05,Math.min((Number(descriptor.radius)||0)*0.2,0.25));
    if (distance > tolerance) continue;
    const rank = circle ? 0 : 1;
    if (!best || distance < best.distance-1e-9 || (Math.abs(distance-best.distance)<1e-9 && (rank < best.rank || (rank===best.rank && pid < best.pid))))
      best = {pid,kind:entry.kind,at:"centre",u:at.u,v:at.v,distance,rank};
  }
  // Older analytic documents expose one named bore wall and no circular edge
  // or placement sketch. That unique wall is still a valid bound reference.
  const chosen = best || (cylinderFaces.length === 1 ? cylinderFaces[0] : null);
  return chosen && {pid:chosen.pid,kind:chosen.kind,at:chosen.at,u:chosen.u,v:chosen.v};
}
