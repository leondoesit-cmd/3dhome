// The native uniform Shell operation treats an absent override list and the
// catalog's default empty list identically. Preview and committed recipes must
// use the same cache key, while every actual per-face override stays distinct.
export function finishCacheParameters(type,params={}) {
  return type==='shell' && params.faceThicknesses===undefined
    ? {...params,faceThicknesses:[]}
    : params;
}
