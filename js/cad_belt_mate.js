import {lengthFromDocument,lengthToDocument} from './core/document_length_units.js';

// Effective diameters are lengths in canonical centimetres, not tooth counts.
// This is ideal angular coupling only; no belt path or contact is generated.
export function beltMateSpec(diameterA,diameterB,direction='open',unit='cm') {
  const a=lengthFromDocument(diameterA,unit),b=lengthFromDocument(diameterB,unit);
  if(!Number.isFinite(a)||!(a>0)||!Number.isFinite(b)||!(b>0)||!Number.isFinite(a/b)||!(a/b>0)||!['open','crossed'].includes(direction))return null;
  return {diameterA:a,diameterB:b,beltDirection:direction};
}
export function beltRatio(mate) {
  const spec=beltMateSpec(mate?.diameterA,mate?.diameterB,mate?.beltDirection);
  return spec ? spec.diameterA/spec.diameterB : null;
}
export function beltDiameterValue(mate,side,unit='cm') {
  return lengthToDocument(mate?.[side==='a'?'diameterA':'diameterB'],unit);
}
