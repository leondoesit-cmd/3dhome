/* Axial clearance above a fastener head. Increasing a countersink by h moves
   its cone down by h; its opening grows by 2*h*tan(includedAngle/2). */
export function holeHeadClearance(params, type, countersinkDiameterMm, counterboreDepthMm, angle) {
  const value = params.headClearanceMm != null ? Number(params.headClearanceMm) : Number(params.headClearance || 0)*10;
  if (!Number.isFinite(value) || value < 0) throw new Error('Head clearance must be finite and nonnegative');
  const enabled = params.headClearanceEnabled === true;
  const mode = params.headClearanceMode || 'increased-countersink';
  if (!['increased-countersink','added-counterbore'].includes(mode)) throw new Error('Unsupported head clearance mode');
  const amount = enabled ? value : 0;
  const counterbore = ['counterbore','tap-counterbore'].includes(type);
  const countersink = ['countersink','tap-countersink'].includes(type);
  if (amount && !counterbore && !countersink) throw new Error('Head clearance requires a counterbore or countersink');
  if (amount && countersink && (!Number.isFinite(angle) || angle<=0 || angle>=180)) throw new Error('Head clearance requires a valid countersink angle');
  return {headClearanceEnabled:enabled,headClearanceMode:mode,headClearanceMm:value,
    cboreDepthMm:counterboreDepthMm+(counterbore?amount:0),
    csinkDiameterMm:countersinkDiameterMm+(countersink && mode==='increased-countersink'?2*amount*Math.tan(angle*Math.PI/360):0),
    csinkStartDepthMm:countersink && mode==='added-counterbore'?amount:0};
}
