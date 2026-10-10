/* Normal To is a drafting view: depth must not magnify a model edge relative
   to the sketch plane. Match the perspective view's scale at its target. */
export function normalToFrustum(distance, fov, aspect) {
  const halfHeight = Math.max(1e-6, distance) * Math.tan(fov * Math.PI / 360);
  const halfWidth = halfHeight * Math.max(1e-6, aspect);
  return { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight };
}

// Orbit projection changes keep the same target-plane scale and camera pose.
export function switchEditorCamera(current, perspective, orthographic, mode, distance) {
  if (!['perspective','orthographic'].includes(mode)) throw new Error('Choose perspective or orthographic projection');
  const next=mode==='orthographic'?orthographic:perspective;
  next.aspect=current.aspect;next.fov=current.fov;next.zoom=current.zoom;
  next.near=current.near;next.far=current.far;
  next.position.copy(current.position);next.quaternion.copy(current.quaternion);next.up.copy(current.up);
  if(next.isOrthographicCamera)Object.assign(next,normalToFrustum(distance,next.fov,next.aspect));
  next.updateProjectionMatrix();next.updateMatrixWorld(true);
  return next;
}

export function pointerCameraRay(camera, ndcX, ndcY, origin, direction) {
  if (camera.isOrthographicCamera) {
    origin.set(ndcX, ndcY, -1).unproject(camera);
    direction.set(0, 0, -1).transformDirection(camera.matrixWorld);
  } else {
    origin.copy(camera.position);
    direction.set(ndcX, ndcY, .5).unproject(camera).sub(origin).normalize();
  }
  return { origin, direction };
}

export function orbitTargetFromFrame(frame, target, centerY = 0) {
  return { x: frame.origin.x + target.x,
    y: frame.origin.y + target.y - centerY,
    z: frame.origin.z + target.z };
}

export function frameTargetFromOrbit(frame, target, centerY = 0) {
  return { x: target.x - frame.origin.x,
    y: target.y + centerY - frame.origin.y,
    z: target.z - frame.origin.z };
}
