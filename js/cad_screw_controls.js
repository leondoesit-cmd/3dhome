// Changing thread direction preserves the authored helical zero and winding.
// Set it at the intended home pose before adding a motor or requesting travel.
export function setScrewMateHandedness(mate, handedness) {
  if (mate?.type !== 'screw' || !['rh', 'lh'].includes(handedness)) return false;
  mate.handedness = handedness;
  return true;
}
