// Drive map math: lat/lon frame + terrain elevation sampling.
export const Z = 18; // tile zoom the ground streams at
export const TILE_PX = 256;
export const EARTH_C = 40075016.686;

let _anchor = null; // {lat, lon} — local-frame origin for the session
export function getAnchor() { return _anchor; }
export function setAnchor(a) { _anchor = a; }

export function llToM(lat, lon) {
  const mLat = 111320,
    mLon = 111320 * Math.cos((getAnchor().lat * Math.PI) / 180);
  return { x: (lon - getAnchor().lon) * mLon, z: -(lat - getAnchor().lat) * mLat };
}
export function mToLL(x, z) {
  const mLat = 111320,
    mLon = 111320 * Math.cos((getAnchor().lat * Math.PI) / 180);
  return { lat: getAnchor().lat - z / mLat, lon: getAnchor().lon + x / mLon };
}
export function llToTile(lat, lon) {
  const n = Math.pow(2, Z);
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    tx: Math.floor(((lon + 180) / 360) * n),
    ty: Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n),
  };
}
export function tileNW(tx, ty) {
  const n = Math.pow(2, Z);
  return {
    lon: (tx / n) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI,
  };
}
// ---- terrain elevation (AWS Terrain Tiles, terrarium PNG, no key) ---------
// height(m) = R*256 + G + B/256 - 32768. Session heights are RELATIVE to the
// getAnchor()'s elevation (elev0) so the start line is always y=0; everything that
// touches the ground samples through sampleElevM.
export const ELEV_Z = 13;
const elevTiles = new Map(); // "tx_ty" -> {data: Float32Array(256*256)|null}
let elevReady = false,
  elev0 = 0,
  lastElev = 0,
  sesStart = 0;
// drive.js owns the session lifecycle but the elevation state lives here, so
// it drives these accessors rather than the (module-local, unwritable) vars.
export function elevIsReady() {
  return elevReady;
}
export function elevRef() {
  return elev0;
}
export function elevSessionAge(tNow) {
  return tNow - sesStart;
}
// new anchor = new reference elevation: back to "not ready", clock restarted
export function elevReset(tNow) {
  elevReady = false;
  elev0 = 0;
  lastElev = 0;
  sesStart = tNow;
}
// called once the anchor tile decodes (e != null) or the 5 s wait expires
export function elevPromote(e) {
  if (e != null) elev0 = e;
  elevReady = true;
}
export function loadElevTile(tx, ty) {
  const key = tx + "_" + ty;
  if (elevTiles.has(key)) return;
  const entry = { data: null };
  elevTiles.set(key, entry);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, 256, 256).data;
    const out = new Float32Array(256 * 256);
    for (let i = 0; i < 65536; i++)
      out[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
    entry.data = out;
  };
  // failed tile (ocean gap / offline) → flat zeros, never refetched
  img.onerror = () => (entry.data = new Float32Array(65536));
  img.src =
    "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/" +
    ELEV_Z + "/" + tx + "/" + ty + ".png";
}
export function elevPx(x, y) {
  const tx = Math.floor(x / 256),
    ty = Math.floor(y / 256);
  const t = elevTiles.get(tx + "_" + ty);
  if (!t) {
    loadElevTile(tx, ty);
    return null;
  }
  if (!t.data) return null;
  return t.data[(y - ty * 256) * 256 + (x - tx * 256)];
}
// bilinear sample in ABSOLUTE meters, or null while tiles load
export function elevAtLL(lat, lon) {
  const n = Math.pow(2, ELEV_Z) * 256;
  const s = Math.sin((lat * Math.PI) / 180);
  const px = ((lon + 180) / 360) * n - 0.5,
    py = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n - 0.5;
  const x0 = Math.floor(px),
    y0 = Math.floor(py),
    fx = px - x0,
    fy = py - y0;
  const h00 = elevPx(x0, y0);
  if (h00 == null) return null;
  const h10 = elevPx(x0 + 1, y0),
    h01 = elevPx(x0, y0 + 1),
    h11 = elevPx(x0 + 1, y0 + 1);
  if (h10 == null || h01 == null || h11 == null) return h00;
  return (
    h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) +
    h01 * (1 - fx) * fy + h11 * fx * fy
  );
}
// local meters → relative ground height (0 until the getAnchor() tile is in)
export function sampleElevM(x, z) {
  if (!elevReady) return 0;
  const ll = mToLL(x, z);
  const e = elevAtLL(ll.lat, ll.lon);
  if (e == null) return lastElev;
  lastElev = e - elev0;
  return lastElev;
}

