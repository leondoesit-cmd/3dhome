// CAD Evaluation & Geometry Analysis Tools (Measure, Draft, Curvature, Section Clipping).

export function measureDistance(p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
  const distance = Math.hypot(dx, dy, dz);
  return {distance, dx, dy, dz};
}

export function measureAngleBetweenNormals(n1, n2) {
  const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
  const l1 = Math.hypot(n1.x, n1.y, n1.z) || 1;
  const l2 = Math.hypot(n2.x, n2.y, n2.z) || 1;
  const cos = Math.max(-1, Math.min(1, dot / (l1 * l2)));
  const angleRad = Math.acos(cos);
  return Math.round(((angleRad * 180) / Math.PI) * 100) / 100;
}

export function evaluateDraftAngle(normal, pullDirection = { x: 0, y: 1, z: 0 }) {
  const angleDeg = measureAngleBetweenNormals(normal, pullDirection);
  const draftDeg = 90 - angleDeg;
  return {
    draftDeg: Math.round(draftDeg * 10) / 10,
    isSufficient: draftDeg >= 1.5, // Configured pull direction; opposite-facing surfaces are undercuts.
    classification: draftDeg < 0 ? "undercut" : draftDeg >= 1.5 ? "sufficient" : "insufficient",
  };
}

export function createSectionClipPlane(planeOrigin = { x: 0, y: 0, z: 0 }, planeNormal = { x: 0, y: 1, z: 0 }) {
  return {
    origin: planeOrigin,
    normal: planeNormal,
    active: true,
  };
}
