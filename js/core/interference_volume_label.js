// Keep measured positive intersections visible even below the report's usual
// three-decimal cm³ precision. This changes display only, never classification.
export function interferenceVolumeLabel(volume) {
  if (!Number.isFinite(volume) || volume < 0) throw new Error('Invalid interference volume');
  return (volume > 0 && volume < 0.001 ? volume.toPrecision(3) : volume.toFixed(3)) + ' cm³';
}
