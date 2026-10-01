import { lengthFromDocument } from './document_length_units.js';
import { dimensionUnit, evaluateExpression, expandUnitLiterals } from '../sketch_equations.js';

// Constraint rows accept both a document-unit number and persistent equations.
// A numeric calculation is a one-time value, like a feature field; equations
// containing names or explicit unit literals retain their source for rebuilds.
export function parseSketchDimensionEntry(text, constraint, documentUnit, lookup) {
  const source = String(text).trim();
  if (!source) throw new Error('Empty expression');
  const kind = dimensionUnit(constraint);
  const plainNumber = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(source);
  const numericCalculation = /^[\d\s().+\-*/%^]+$/.test(source);
  if (plainNumber || numericCalculation) {
    const numeric = plainNumber ? Number(source) : evaluateExpression(source);
    if (!Number.isFinite(numeric)) throw new Error('Result is not a number');
    return { value: kind === 'angle' ? numeric : lengthFromDocument(numeric, documentUnit), expr: null };
  }
  return { value: evaluateExpression(expandUnitLiterals(source, kind), lookup), expr: source };
}
