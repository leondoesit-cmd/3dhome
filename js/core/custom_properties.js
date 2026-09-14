/* Named document properties — the SOLIDWORKS "Custom Properties" a drawing's
 * title block and a BOM read by name ($PRP:"Description").
 *
 * Stored as def.customProperties = { Description: "…" } on parts and
 * assemblies. Kept out of modeler.js so drawings, the BOM and Node tests share
 * one reading of it. See docs/planchard/document-units.md.
 */

export function documentProperty(doc, key) {
  const props = doc && doc.customProperties;
  const value = props && typeof props === "object" ? props[key] : "";
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function setDocumentProperty(doc, key, value) {
  if (!doc) return;
  const text = String(value == null ? "" : value).trim();
  if (!text) {
    if (doc.customProperties) {
      delete doc.customProperties[key];
      if (!Object.keys(doc.customProperties).length) delete doc.customProperties;
    }
    return;
  }
  if (!doc.customProperties || typeof doc.customProperties !== "object") doc.customProperties = {};
  doc.customProperties[key] = text;
}

export const documentDescription = (doc) => documentProperty(doc, "Description");
export const setDocumentDescription = (doc, value) => setDocumentProperty(doc, "Description", value);

/* The title block's TITLE, linked to Description the way a SOLIDWORKS sheet
   format links $PRP:"Description". A stored title that is empty or still the
   model name is the link, so editing Description updates every sheet; any other
   stored text is a deliberate override and wins. */
export function sheetTitleText(sheet, def) {
  const stored = sheet && sheet.title && typeof sheet.title.title === "string" ? sheet.title.title : "";
  const name = def && def.name ? String(def.name) : "";
  if (stored && stored !== name) return stored;
  return documentDescription(def) || name;
}
