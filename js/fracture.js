import * as THREE from "three";

// Geometry fracture: recursively slice a mesh with random planes through the
// impact point, capping each cut so shards look solid. Units are cm.

const MIN_SHARD_DIM = 6;    // don't produce slivers smaller than this
const MIN_FRACTURE_DIM = 15; // meshes smaller than this aren't worth fracturing

export function canFracture(mesh) {
  if (!mesh.isMesh || !mesh.geometry) return false;
  mesh.geometry.computeBoundingBox();
  const s = new THREE.Vector3();
  mesh.geometry.boundingBox.getSize(s);
  const scale = mesh.getWorldScale(new THREE.Vector3());
  s.multiply(new THREE.Vector3(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)));
  return Math.max(s.x, s.y, s.z) >= MIN_FRACTURE_DIM;
}

// Returns an array of THREE.Mesh shards positioned in world space
// (position/quaternion set; geometry centered on its own bbox center).
// impactPointWorld: THREE.Vector3. targetCount: desired shard count.
export function fractureMesh(mesh, impactPointWorld, targetCount = 5) {
  const soup = toWorldTriangles(mesh);
  if (!soup || soup.positions.length < 9) return null;

  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

  let pieces = [soup];
  let guard = 0;
  while (pieces.length < targetCount && guard++ < 24) {
    // Cut the largest piece
    pieces.sort((a, b) => trisSize(b) - trisSize(a));
    const piece = pieces.shift();
    const box = pieceBounds(piece);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (Math.max(size.x, size.y, size.z) < MIN_SHARD_DIM * 2) {
      pieces.push(piece); // too small to split further
      break;
    }

    // Plane through a point jittered around the impact, clamped inside this
    // piece's bounds so the cut actually intersects it.
    const center = box.getCenter(new THREE.Vector3());
    const p = new THREE.Vector3(
      THREE.MathUtils.clamp(impactPointWorld.x + (Math.random() - 0.5) * size.x, box.min.x + size.x * 0.2, box.max.x - size.x * 0.2),
      THREE.MathUtils.clamp(impactPointWorld.y + (Math.random() - 0.5) * size.y, box.min.y + size.y * 0.2, box.max.y - size.y * 0.2),
      THREE.MathUtils.clamp(impactPointWorld.z + (Math.random() - 0.5) * size.z, box.min.z + size.z * 0.2, box.max.z - size.z * 0.2)
    );
    // Random-ish normal biased away from the thinnest axis so we cut across
    // the slab, not along it (cutting a tabletop edge-on makes slivers).
    const n = randomCutNormal(size);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, p);

    const { above, below } = cutTriangleSoup(piece, plane);
    if (above.positions.length >= 9 && below.positions.length >= 9) {
      pieces.push(above, below);
    } else {
      // Degenerate cut — keep the piece and stop trying on it
      pieces.push(piece);
      break;
    }
  }

  if (pieces.length < 2) return null;

  return pieces.map(piece => {
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(piece.positions);
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    // Shards must carry the parent's UVs. Without them the `uv` attribute is
    // missing, WebGL feeds the shader a constant (0,0), and every fragment of
    // the shard samples the map's corner texel — a plastered wall breaks into
    // flat white slabs instead of plastered chunks.
    if (piece.uvs && piece.uvs.length * 3 === piece.positions.length * 2)
      geom.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(piece.uvs), 2));
    geom.computeBoundingBox();
    const c = geom.boundingBox.getCenter(new THREE.Vector3());
    geom.translate(-c.x, -c.y, -c.z);
    geom.computeVertexNormals();
    const shard = new THREE.Mesh(geom, material);
    if (mesh.userData?.physicsProps) shard.userData.physicsProps = mesh.userData.physicsProps;
    shard.position.copy(c);
    shard.castShadow = mesh.castShadow;
    shard.receiveShadow = mesh.receiveShadow;
    return shard;
  });
}

function randomCutNormal(size) {
  const n = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
  // Bias: suppress the component along the thinnest axis
  const dims = [size.x, size.y, size.z];
  const thin = dims.indexOf(Math.min(...dims));
  if (thin === 0) n.x *= 0.2;
  else if (thin === 1) n.y *= 0.2;
  else n.z *= 0.2;
  if (n.lengthSq() < 1e-6) n.set(1, 0, 0.3);
  return n.normalize();
}

// Flatten a mesh to a world-space non-indexed triangle soup
// {positions: number[], uvs: number[]|null}
function toWorldTriangles(mesh) {
  let g = mesh.geometry;
  if (g.index) g = g.toNonIndexed();
  const attr = g.getAttribute("position");
  if (!attr) return null;
  const uvAttr = g.getAttribute("uv");
  mesh.updateMatrixWorld(true);
  const m = mesh.matrixWorld;
  const positions = new Array(attr.count * 3);
  const uvs = uvAttr ? new Array(attr.count * 2) : null;
  const v = new THREE.Vector3();
  for (let i = 0; i < attr.count; i++) {
    v.fromBufferAttribute(attr, i).applyMatrix4(m);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
    if (uvs) {
      uvs[i * 2] = uvAttr.getX(i);
      uvs[i * 2 + 1] = uvAttr.getY(i);
    }
  }
  return { positions, uvs };
}

function pieceBounds(piece) {
  const box = new THREE.Box3();
  const p = piece.positions;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 3) box.expandByPoint(v.set(p[i], p[i + 1], p[i + 2]));
  return box;
}

function trisSize(piece) {
  const box = pieceBounds(piece);
  const s = new THREE.Vector3();
  box.getSize(s);
  return s.x * s.y + s.y * s.z + s.x * s.z; // surface-ish proxy for "biggest"
}

// Split a triangle soup by a plane; caps both open cross-sections.
// UVs ride along with the positions so the shards keep the parent's texturing.
function cutTriangleSoup(piece, plane) {
  const above = [];
  const below = [];
  const hasUV = !!piece.uvs;
  const aboveUV = hasUV ? [] : null;
  const belowUV = hasUV ? [] : null;
  const crossEdges = []; // [Vector3, Vector3, Vector2|null, Vector2|null] on the cut plane
  const p = piece.positions, q = piece.uvs;
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const ta = new THREE.Vector2(), tb = new THREE.Vector2(), tc = new THREE.Vector2();

  for (let i = 0, j = 0; i < p.length; i += 9, j += 6) {
    va.set(p[i], p[i + 1], p[i + 2]);
    vb.set(p[i + 3], p[i + 4], p[i + 5]);
    vc.set(p[i + 6], p[i + 7], p[i + 8]);
    if (hasUV) {
      ta.set(q[j], q[j + 1]);
      tb.set(q[j + 2], q[j + 3]);
      tc.set(q[j + 4], q[j + 5]);
    }
    splitTriangle(va, vb, vc, ta, tb, tc, plane, above, aboveUV, below, belowUV, crossEdges);
  }

  capSection(crossEdges, plane, above, aboveUV, below, belowUV);
  return {
    above: { positions: above, uvs: aboveUV },
    below: { positions: below, uvs: belowUV },
  };
}

function splitTriangle(a, b, c, ua, ub, uc, plane, above, aboveUV, below, belowUV, crossEdges) {
  const EPS = 1e-4;
  const verts = [a, b, c];
  const tex = [ua, ub, uc];
  const d = verts.map(v => plane.distanceToPoint(v));
  const side = d.map(x => (x > EPS ? 1 : x < -EPS ? -1 : 0));

  const pushTri = (arr, uvArr, v0, v1, v2, t0, t1, t2) => {
    arr.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
    if (uvArr) uvArr.push(t0.x, t0.y, t1.x, t1.y, t2.x, t2.y);
  };

  // All on one side (treat on-plane verts as belonging to that side)
  if (side.every(s => s >= 0)) { pushTri(above, aboveUV, a, b, c, ua, ub, uc); return; }
  if (side.every(s => s <= 0)) { pushTri(below, belowUV, a, b, c, ua, ub, uc); return; }

  // Mixed: clip. Walk edges, build polygons for each side.
  const abovePoly = [], belowPoly = [], cross = [];
  const abovePolyUV = [], belowPolyUV = [], crossUV = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const vi = verts[i], vj = verts[j];
    const ti = tex[i], tj = tex[j];
    if (side[i] >= 0) { abovePoly.push(vi); abovePolyUV.push(ti); }
    if (side[i] <= 0) { belowPoly.push(vi); belowPolyUV.push(ti); }
    if ((side[i] > 0 && side[j] < 0) || (side[i] < 0 && side[j] > 0)) {
      const t = d[i] / (d[i] - d[j]);
      const x = vi.clone().lerp(vj, t);
      const xu = ti.clone().lerp(tj, t);
      abovePoly.push(x); abovePolyUV.push(xu);
      belowPoly.push(x); belowPolyUV.push(xu);
      cross.push(x); crossUV.push(xu);
    }
  }
  if (cross.length === 2)
    crossEdges.push([
      cross[0].clone(), cross[1].clone(),
      aboveUV ? crossUV[0].clone() : null,
      aboveUV ? crossUV[1].clone() : null,
    ]);

  const fan = (poly, polyUV, arr, uvArr) => {
    for (let i = 1; i + 1 < poly.length; i++)
      pushTri(arr, uvArr, poly[0], poly[i], poly[i + 1], polyUV[0], polyUV[i], polyUV[i + 1]);
  };
  fan(abovePoly, abovePolyUV, above, aboveUV);
  fan(belowPoly, belowPolyUV, below, belowUV);
}

// Cap the cut: fan-triangulate the cross-section points around their centroid.
// Not a perfect polygon triangulation, but for convex-ish furniture parts the
// cross-section is convex-ish and this reads as a solid interior.
// The cut face has no UVs of its own; it inherits the ones interpolated along
// the cross-section, so a broken edge reads as the same material as the skin
// rather than as the map's corner texel.
function capSection(crossEdges, plane, above, aboveUV, below, belowUV) {
  if (crossEdges.length < 2) return;
  const centroid = new THREE.Vector3();
  const centroidUV = new THREE.Vector2();
  let n = 0;
  crossEdges.forEach(([u, v, tu, tv]) => {
    centroid.add(u).add(v);
    if (aboveUV && tu && tv) centroidUV.add(tu).add(tv);
    n += 2;
  });
  centroid.divideScalar(n);
  centroidUV.divideScalar(n);

  const pushTri = (arr, uvArr, v0, v1, v2, t0, t1, t2) => {
    arr.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
    if (uvArr) uvArr.push(t0.x, t0.y, t1.x, t1.y, t2.x, t2.y);
  };

  crossEdges.forEach(([u, v, tu, tv]) => {
    const t0 = tu || centroidUV, t1 = tv || centroidUV;
    // Wind the cap so its normal faces away from each side's volume
    const norm = new THREE.Vector3().subVectors(v, u).cross(new THREE.Vector3().subVectors(centroid, u));
    if (norm.dot(plane.normal) > 0) {
      pushTri(below, belowUV, u, v, centroid, t0, t1, centroidUV); // +normal → outward for below
      pushTri(above, aboveUV, v, u, centroid, t1, t0, centroidUV);
    } else {
      pushTri(above, aboveUV, u, v, centroid, t0, t1, centroidUV);
      pushTri(below, belowUV, v, u, centroid, t1, t0, centroidUV);
    }
  });
}
