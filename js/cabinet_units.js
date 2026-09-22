// Cabinet dimensions enter as display units; the existing model remains in cm.
export function parseCabinetDimension(text, unit = 'mm') {
  if (!['mm', 'cm', 'm', 'in', 'ft'].includes(unit)) throw new Error('Choose a supported length unit.');
  let input = String(text).trim();
  const suffix = input.match(/\s*(mm|cm|m|in|ft|\")$/i);
  if (suffix) { unit = suffix[1] === '"' ? 'in' : suffix[1].toLowerCase(); input = input.slice(0, -suffix[0].length).trim(); }
  let value;
  if (unit === 'in' && /^\d+\s+\d+\/\d+$/.test(input)) {
    const [whole, numerator, denominator] = input.split(/[\s/]+/).map(Number);
    if (!denominator || numerator >= denominator) throw new Error('Use a proper inch fraction, for example 23 5/8.');
    value = whole + numerator / denominator;
  } else if (unit === 'in' && /^\d+\/\d+$/.test(input)) {
    const [numerator, denominator] = input.split('/').map(Number);
    if (!denominator) throw new Error('Fraction denominator must be positive.');
    value = numerator / denominator;
  } else {
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(input)) throw new Error('Enter a positive dimension using a decimal point. Inches also accept fractions.');
    value = Number(input);
  }
  const cm = value * ({mm:0.1,cm:1,m:100,in:2.54,ft:30.48}[unit]);
  if (!Number.isFinite(cm) || cm <= 0) throw new Error('Dimension must be finite and greater than zero.');
  return cm;
}

export function formatCabinetDimension(cm, unit = 'mm') {
  if (!['mm', 'cm', 'm', 'in', 'ft'].includes(unit) || !Number.isFinite(cm)) throw new Error('Invalid dimension or unit.');
  return String(Number((cm / ({mm:0.1,cm:1,m:100,in:2.54,ft:30.48}[unit])).toFixed(6)));
}
