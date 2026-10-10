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

/* The component inspector writes PartNo.  Imported and browser-authored book
 * parts also use BookPartNumber or the human label Part number.  Keep the
 * established component/source PartNo priority before reading those aliases. */
export function assemblyPartNumber(component, source = component?.def || component?.asm) {
  const canonical = (doc) => documentProperty(doc, "PartNo") || documentProperty(doc, "PartNumber") ||
    documentProperty(doc, "Number") || doc?.partNumber || "";
  const alternate = (doc) => documentProperty(doc, "BookPartNumber") || documentProperty(doc, "Part number");
  return canonical(component) || canonical(source) || alternate(component) || alternate(source) || "";
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
  const source = sheet?.title?.sources?.title;
  if (source !== undefined) return boundSheetField(sheet, def, 'title', source);
  const stored = sheet && sheet.title && typeof sheet.title.title === "string" ? sheet.title.title : "";
  const name = def && def.name ? String(def.name) : "";
  if (stored && stored !== name) return stored;
  return documentDescription(def) || name;
}

/* Explicit links survive renaming and reuse: absent sources keep legacy sheets
   unchanged. A missing chosen source is blank (rendered as an em dash), never
   substituted with a stale manual string or another document property. */
export function validateSheetTitleSources(sources) {
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) throw new Error('Invalid title field sources');
  for (const [field, source] of Object.entries(sources)) {
    if (!['title','number'].includes(field) || !['manual','name',...(field === 'title' ? ['description'] : [])].includes(source)) throw new Error('Invalid title field source');
  }
  return sources;
}

function boundSheetField(sheet, def, field, source) {
  try { validateSheetTitleSources({[field]:source}); } catch { return ''; }
  if (source === 'manual') return typeof sheet?.title?.[field] === 'string' ? sheet.title[field] : '';
  if (source === 'description') return documentDescription(def);
  return typeof def?.name === 'string' ? def.name : '';
}

export function setSheetTitleSource(sheet, field, source) {
  validateSheetTitleSources({[field]:source});
  if (!sheet?.title) throw new Error('Drawing title block is missing');
  sheet.title.sources = {...sheet.title.sources, [field]:source};
}

export function sheetTitleMeta(sheet, def) {
  const source = sheet?.title?.sources?.number;
  return {
    title: sheetTitleText(sheet, def),
    number: source === undefined ? (sheet?.title?.number || '') : boundSheetField(sheet, def, 'number', source),
  };
}
