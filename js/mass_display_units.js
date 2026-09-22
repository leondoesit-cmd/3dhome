// Factors from the evaluator's cm, cm³, kg, g/cm³ and kg·m² quantities.
// Pound means pound mass, never pound force.
export function massDisplaySystem(mode) {
  if (mode === 'ips') return {
    length: 1 / 2.54, lengthUnit: 'in', volume: 1 / 16.387064, volumeUnit: 'in³',
    mass: 1 / .45359237, massUnit: 'lb', density: 16.387064 / 453.59237, densityUnit: 'lb/in³',
    inertia: 1 / (.45359237 * .0254 ** 2), inertiaUnit: 'lb·in²',
  };
  if (mode === 'mmg') return {
    length: 10, lengthUnit: 'mm', volume: 1000, volumeUnit: 'mm³',
    mass: 1000, massUnit: 'g', density: 1, densityUnit: 'g/cm³',
    inertia: 1e9, inertiaUnit: 'g·mm²',
  };
  return {
    length: 1, lengthUnit: 'cm', volume: 1, volumeUnit: 'cm³',
    mass: 1, massUnit: 'kg', density: 1, densityUnit: 'g/cm³',
    inertia: 1, inertiaUnit: 'kg·m²',
  };
}
