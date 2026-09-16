// Session-only drafting preferences; changing these never edits existing openings.
const defaults = {
  door: { width: 90, height: 205, sill: 0 },
  window: { width: 120, height: 120, sill: 90 },
  passage: { width: 120, height: 210, sill: 0 },
};
export function openingDrawDefaults(type) {
  return defaults[type] ? { ...defaults[type] } : null;
}
export function setOpeningDrawDefault(type, field, value) {
  if (!defaults[type] || !['width', 'height', 'sill'].includes(field) ||
      !Number.isFinite(value) || (field === 'sill' ? value < 0 : value <= 0)) return false;
  defaults[type][field] = value;
  return true;
}
