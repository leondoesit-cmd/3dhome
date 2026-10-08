// Model geometry is stored in centimetres. A document unit changes only
// authoring input and display; it must never rescale saved geometry.
const FACTORS = Object.freeze({ mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 });

export function documentLengthUnit(value) {
  return Object.hasOwn(FACTORS, value) ? value : 'cm';
}

export function lengthToDocument(cm, unit) {
  return Number(cm) / FACTORS[documentLengthUnit(unit)];
}

export function lengthFromDocument(value, unit) {
  return Number(value) * FACTORS[documentLengthUnit(unit)];
}

export function formatDocumentLength(cm, unit, digits = 10) {
  const value = lengthToDocument(cm, unit);
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(Number(cm)) < 1e-12) return '0';
  return String(Number(value.toPrecision(digits)));
}

// The sketch projection supplies CSS pixels per canonical centimetre.
export function formatDocumentScreenScale(pixelsPerCm, unit) {
  const documentUnit=documentLengthUnit(unit);
  const scale=Number(pixelsPerCm)/lengthToDocument(1,documentUnit);
  if(!Number.isFinite(scale)||scale<=0)return '—';
  return String(Number(scale.toPrecision(4)))+' px/'+documentUnit;
}
