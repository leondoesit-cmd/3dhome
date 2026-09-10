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
    const points = holeLayoutPoints(feature.params);
    rows.push({
      id: feature.id,
      item: rows.length + 1,
      callout: holeCallout(feature.params || {}),
      quantity: points.length,
      points,
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
