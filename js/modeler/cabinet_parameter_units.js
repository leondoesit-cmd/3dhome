/* The model editor's "Cabinet parameters" panel in the document's length unit.
   The cabinet stores centimetres; this only converts for display and back
   for the typed value, so the stored numbers never change with the unit. */
import { documentLengthUnit, lengthFromDocument, lengthToDocument } from "../core/document_length_units.js";
import { getLang, t as tPlanner } from "../i18n.js";

// one sensible keyboard/spinner step per unit (about a millimetre)
var CAB_PARAM_STEP = { mm: 1, cm: 0.1, m: 0.001, in: 0.05, ft: 0.005 };

export function cabinetParameterStep(unit) {
  return CAB_PARAM_STEP[documentLengthUnit(unit)];
}

// centimetres -> the number shown in the field
export function cabinetParameterValue(cm, unit) {
  return Number(lengthToDocument(cm, unit).toPrecision(10));
}

// the number typed in the field -> centimetres
export function cabinetParameterCm(value, unit) {
  return lengthFromDocument(value, unit);
}

export function cabinetParametersHeading(unit) {
  var u = tPlanner("guide_unit_" + documentLengthUnit(unit));
  return (getLang() === "en" ? "Cabinet parameters" : "פרמטרי ארון") + " (" + u + ")";
}
