// Straight-wall joins depend on all arms at either endpoint, including their
// far endpoints and openings. Preserve full values and array order; no rounded
// coordinates or lossy hashes are used. Unsupported builders bypass reuse.
export function wallBuildKey(state, wall, options) {
  return createWallBuildKeys(state)(wall, options);
}

/* An uploaded finish (wall.tex: a base64 data URL, a megabyte for a photo)
   enters a key as a token, not as itself. Textured walls are never reused, but
   their untextured neighbours are, and stringifying every wall up front put
   each photo through JSON.stringify on every rebuild: 8 walls under one
   1.1 MB photo took 7.9 ms against 0.1 ms. The token is the wall's own and
   lasts exactly as long as its finish does (a new string, even with the same
   bytes, is a new token: a miss, never a false match). Reuse already needs
   the same wall object, so keying by it loses nothing. */
const texTokens = new WeakMap();
let texSeq = 0;
function texToken(wall) {
  let entry = texTokens.get(wall);
  if (!entry || entry.tex !== wall.tex) texTokens.set(wall, entry = { tex: wall.tex, token: '@tex:' + ++texSeq });
  return entry.token;
}

export function createWallBuildKeys(state) {
  // Everything below is built on demand: only reuse candidates ask for a key,
  // and a key reads only the candidate's own arms.
  let types = null;
  const data = new Map();
  const dataOf = wall => {
    let json = data.get(wall);
    if (json === undefined) {
      const value = typeof wall.tex === 'string' ? { ...wall, tex: texToken(wall) } : wall;
      data.set(wall, json = JSON.stringify([value, state.nodes[wall.a], state.nodes[wall.b]]));
    }
    return json;
  };
  const incident = new Map();
  state.walls.forEach((wall, index) => {
    for (const node of new Set([wall.a, wall.b])) {
      if (!incident.has(node)) incident.set(node, []);
      incident.get(node).push(index);
    }
  });
  return function key(wall, options) {
    if (types === null) types = JSON.stringify(state.wallTypes);
    const indexes = [...new Set([...(incident.get(wall.a) || []), ...(incident.get(wall.b) || [])])].sort((a,b)=>a-b);
    const neighbors = indexes.map(index => state.walls[index]);
    const ids = new Set(neighbors.map(other => String(other.id)));
    return JSON.stringify([neighbors.map(dataOf),
      state.openings.filter(opening => ids.has(String(opening.wall))), types, options]);
  };
}
