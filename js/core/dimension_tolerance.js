const factors = {mm:10,cm:1,in:1/2.54,ft:1/30.48,m:.01,deg:1};

/** Signed deviations, never a solver equation or a nominal geometry change. */
export function makeDimensionTolerance(upper, lower, unit='mm') {
  if (!(unit in factors)) throw new Error('Unsupported tolerance unit');
  const a=Number(upper),b=Number(lower);
  if (!String(upper).trim() || !String(lower).trim() || !Number.isFinite(a) || !Number.isFinite(b) || a<b)
    throw new Error('Enter finite signed deviations; upper must be at least lower');
  const precision=Math.max(...[upper,lower].map(s=>{const [mantissa,exponent]=String(s).toLowerCase().split('e');return Math.max(0,(mantissa.split('.')[1] || '').length-(Number(exponent)||0));}));
  if(precision>8)throw new Error('Tolerance supports up to eight decimal places');
  return {version:1,kind:'deviation',upper:a/factors[unit],lower:b/factors[unit],unit,precision};
}

export function toleranceFields(tolerance, unit='mm') {
  if (!tolerance) return {upper:'0',lower:'0'};
  const precision=tolerance.unit===unit?tolerance.precision:Math.max(3,tolerance.precision || 0);
  return {upper:(tolerance.upper*factors[unit]).toFixed(precision),lower:(tolerance.lower*factors[unit]).toFixed(precision)};
}

export function formatDimensionTolerance(tolerance, unit='mm') {
  if (tolerance?.kind!=='deviation' || !Number.isFinite(tolerance.upper) || !Number.isFinite(tolerance.lower) || tolerance.upper<tolerance.lower) return '';
  const fields=toleranceFields(tolerance, tolerance.unit==='deg'?'deg':unit);
  const signed=s=>Number(s)<0?'−'+s.slice(1):'+'+s;
  return signed(fields.upper)+'/'+signed(fields.lower)+(tolerance.unit==='deg'?'°':'');
}

export function modelItemTolerance(def, key) {
  if (!key) return null;
  for (const sketch of def?.sketches || []) for (const constraint of sketch.constraints || [])
    if (key===`sketch:${sketch.id}:constraint:${constraint.id}` && !constraint.driven) return constraint.tolerance || null;
  for (const feature of def?.features || []) for (const param of ['depth','radius'])
    if (key===`feature:${feature.id}:${param}`) return feature.dimensionTolerances?.[param] || null;
  return null;
}

export function resolveDimensionTolerance(dim, def, doc) {
  // Legacy nonempty sheet tolerances remain explicit overrides. Empty may
  // explicitly suppress a source tolerance when toleranceOverride is true.
  if (dim.toleranceOverride || dim.tolerance) return {...dim};
  return {...dim,tolerance:formatDimensionTolerance(modelItemTolerance(def,dim.modelItem),doc?.units || 'mm')};
}
