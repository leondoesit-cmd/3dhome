// Real-world site / mapping integration — the geo core (no DOM here; UI lives in
// js/ui_site.js). Hybrid provider model:
//   * Free/open stack is always on: Esri World Imagery tiles for aerial, OSM
//     Nominatim for geocoding, OSM Overpass for building footprints. No API key.
//   * An OPTIONAL Google Maps key (localStorage `home3d_gkey`) unlocks Google
//     Static Maps aerial, Google geocoding, and Street View backdrops.
//
// Units in the app are CENTIMETERS. Web-Mercator meters-per-pixel converts a
// fetched tile image into a real-world-scaled ground rectangle. See applySite()
// in view3d.js and the underlay in plan2d.js for the consumers.
//
// ToS / rate-limit notes (honored via debounce + caching in the callers):
//   Nominatim: max ~1 req/s, needs a valid Referer (the browser supplies it).
//   Overpass:  throttled shared endpoint — cache results, don't hammer.
//   Esri/Google imagery: review provider ToS before public/production use.
import { S } from "./state.js";

const TILE_PX = 256;
const EARTH_C = 40075016.686; // equatorial circumference (m)

// ---- API key (user's own Google key; entered in the UI, never by the app) ----
export function gkey() {
  try {
    return (localStorage.getItem("home3d_gkey") || "").trim();
  } catch (_) {
    return "";
  }
}
export function setGkey(k) {
  try {
    if (k) localStorage.setItem("home3d_gkey", k.trim());
    else localStorage.removeItem("home3d_gkey");
  } catch (_) {}
}

// ---- Web-Mercator math ----
// meters-per-pixel at a given latitude + zoom (256px tiles).
export function mppAt(lat, zoom) {
  return (EARTH_C * Math.cos((lat * Math.PI) / 180)) / (TILE_PX * Math.pow(2, zoom));
}
// lon/lat -> global pixel coords at a zoom (256px tiles).
function llToGlobalPx(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n * TILE_PX;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n * TILE_PX;
  return { x, y };
}
// lat/lon -> local scene centimeters relative to an anchor lat0/lon0.
// +x = east, +z = south (screen-down / three -Z is north when northAngle=0).
export function llToLocalCm(lat, lon, lat0, lon0) {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return {
    x: (lon - lon0) * mPerDegLon * 100,
    z: -(lat - lat0) * mPerDegLat * 100,
  };
}

// ---- image loading (crossOrigin so canvases stay untainted for PNG export) ----
function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img load failed: " + url));
    img.src = url;
  });
}

// ---- in-memory aerial cache (params -> {canvas,wcm,hcm,mpp}) ----
let aerialCache = {};
function aerialKey(lat, lon, zoom) {
  return lat.toFixed(6) + "," + lon.toFixed(6) + "@" + zoom;
}
// The current aerial the renderers draw. { canvas, wcm, hcm, mpp } or null.
export const SITE = { aerial: null };

// ---- geocoding -------------------------------------------------------------
// The search here returns a RANKED LIST of candidates so the UI can offer
// autocomplete instead of committing to a single blind guess. Provider tiers:
//   1. Google Geocoding — only if the user supplied their own key.
//   2. Photon (photon.komoot.io) — free, CORS-enabled OSM geocoder tuned for
//      typeahead. Much better than Nominatim at ranking partial / fuzzy input,
//      and it accepts rapid keystroke queries without Nominatim's 1 req/s cap.
//   3. Nominatim — final fallback (structured street/city params when we have
//      them, else free text).
// Each candidate is { lat, lon, label }.

function flattenQuery(query) {
  const isObj = typeof query === "object" && query !== null;
  return isObj
    ? [query.street, query.number, query.city].filter(Boolean).join(" ")
    : query;
}

// Did the user ask for a specific house number? (structured field, or a bare
// number token in free text). Used to decide whether a street-level hit is good
// enough or we should keep looking for the exact building.
function wantsHouseNumber(query) {
  if (typeof query === "object" && query !== null)
    return !!(query.number && String(query.number).trim());
  return /(^|\s)\d+[a-zA-Z]?(\s|$)/.test(query || "");
}

// A Google result pins the exact building only when it's rooftop/interpolated
// or typed as a street address / premise. "route", "locality", partial_match →
// street-or-coarser, which for a numbered query is the wrong (centroid) point.
function googleIsPrecise(g) {
  const lt = g.geometry && g.geometry.location_type;
  if (lt === "ROOFTOP" || lt === "RANGE_INTERPOLATED") return true;
  const types = g.types || [];
  return types.indexOf("street_address") >= 0 || types.indexOf("premise") >= 0;
}

// Google Geocoding → up to `limit` candidates, precise (building-level) first.
// Each carries an internal `_precise` flag; returns [] on any failure.
async function googleGeocode(qStr, limit) {
  const k = gkey();
  if (!k) return [];
  try {
    const u =
      "https://maps.googleapis.com/maps/api/geocode/json?address=" +
      encodeURIComponent(qStr) +
      "&key=" +
      encodeURIComponent(k);
    const j = await (await fetch(u)).json();
    if (j.status !== "OK" || !j.results) return [];
    return j.results
      .map((g) => ({
        lat: g.geometry.location.lat,
        lon: g.geometry.location.lng,
        label: g.formatted_address,
        _precise: googleIsPrecise(g),
      }))
      .sort((a, b) => (b._precise ? 1 : 0) - (a._precise ? 1 : 0))
      .slice(0, limit);
  } catch (_) {
    return [];
  }
}

// Photon only understands a handful of UI languages; anything else makes it
// return HTTP 400. For unsupported languages we omit the param entirely, which
// makes Photon fall back to local/default names (and still resolves house
// numbers) instead of failing the whole request.
const PHOTON_LANGS = { en: 1, de: 1, fr: 1 };

// Photon (Komoot) → up to `limit` candidates. GeoJSON: coordinates are [lon,lat].
async function photonGeocode(qStr, limit, lang) {
  try {
    const u =
      "https://photon.komoot.io/api/?limit=" +
      limit +
      (PHOTON_LANGS[lang] ? "&lang=" + lang : "") +
      "&q=" +
      encodeURIComponent(qStr);
    const j = await (await fetch(u)).json();
    if (!j || !j.features) return [];
    return j.features
      .map((f) => {
        const c = f.geometry && f.geometry.coordinates;
        if (!c) return null;
        return {
          lat: c[1],
          lon: c[0],
          label: photonLabel(f.properties),
        };
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

// Esri World Geocoding → up to `limit` candidates.
async function esriGeocode(qStr, limit) {
  try {
    const u =
      "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&maxLocations=" +
      limit +
      "&SingleLine=" +
      encodeURIComponent(qStr);
    const j = await (await fetch(u)).json();
    if (!j || !j.candidates) return [];
    return j.candidates.map((c) => ({
      lat: c.location.y,
      lon: c.location.x,
      label: c.address,
      _precise: c.score >= 90
    }));
  } catch (_) {
    return [];
  }
}

// Nominatim → up to `limit` candidates (structured params when available).
async function nominatimGeocode(query, qStr, limit) {
  const isObj = typeof query === "object" && query !== null;
  let u =
    "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=" +
    limit;
  if (isObj) {
    const streetQ = [query.street, query.number].filter(Boolean).join(" ");
    if (streetQ) u += "&street=" + encodeURIComponent(streetQ);
    if (query.city) u += "&city=" + encodeURIComponent(query.city);
  } else {
    u += "&q=" + encodeURIComponent(qStr);
  }
  let j = await (await fetch(u, { headers: { Accept: "application/json" } })).json();
  // structured miss (e.g. street name spelled slightly off) → free-text retry
  if ((!j || !j.length) && isObj && qStr) {
    j = await (
      await fetch(
        "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=" +
          limit +
          "&q=" +
          encodeURIComponent(qStr),
        { headers: { Accept: "application/json" } },
      )
    ).json();
  }
  if (!j || !j.length) return [];
  return j.map((res) => ({
    lat: parseFloat(res.lat),
    lon: parseFloat(res.lon),
    label: shortAddrLabel(res.address, res.display_name),
  }));
}

// Collapse candidates that share a label (a single street often comes back as
// many OSM segments with the same name) — keep the first of each.
function dedupeByLabel(list) {
  const seen = {};
  return list.filter((c) => {
    const key = (c.label || "").toLowerCase();
    if (!key || seen[key]) return false;
    seen[key] = 1;
    return true;
  });
}

// Ranked candidate list for a query (string or {street,number,city}).
// `lang` biases Photon's result names to the UI language when available.
export async function geocodeSuggest(query, limit, lang) {
  limit = limit || 6;
  const qStr = flattenQuery(query);
  if (!qStr) return [];

  // Over-fetch a little so dedup still leaves a useful number of choices.
  const fetchN = Math.min(limit + 4, 12);
  const needHouse = wantsHouseNumber(query);

  // Google first (user opted in with a key); then Esri; then Photon; then Nominatim.
  let out = await googleGeocode(qStr, fetchN);
  // A numbered query that Google only resolved to street level is the wrong
  // (centroid) point — same spot with or without the number. Esri has far
  // better house-number coverage (esp. outside the US), so prefer its
  // building-level hit when Google couldn't pin the house.
  if (out.length && needHouse && !out.some((g) => g._precise)) {
    const es = await esriGeocode(qStr, fetchN);
    if (es.length && es.some((g) => g._precise)) out = es;
  }
  if (!out.length) out = await esriGeocode(qStr, fetchN);
  if (!out.length) out = await photonGeocode(qStr, fetchN, lang);
  if (!out.length) out = await nominatimGeocode(query, qStr, fetchN);
  // strip the internal precision flag before handing results to the UI
  return dedupeByLabel(out)
    .slice(0, limit)
    .map((c) => ({ lat: c.lat, lon: c.lon, label: c.label }));
}

// address -> {lat,lon,label}. Best single match; throws "no_results" if none.
export async function geocode(query, lang) {
  const list = await geocodeSuggest(query, 1, lang);
  if (!list.length) throw new Error("no_results");
  return list[0];
}

// Compact "street house, city" label from a Nominatim address object.
function shortAddrLabel(a, fallback) {
  if (a) {
    const parts = [
      a.road || a.pedestrian || a.street,
      a.house_number,
      a.city || a.town || a.village || a.municipality,
    ].filter(Boolean);
    if (parts.length >= 2) return parts.join(", ");
  }
  return fallback;
}

// Compact label from a Photon feature's properties.
function photonLabel(p) {
  if (!p) return "";
  const line1 = [p.street || p.name, p.housenumber].filter(Boolean).join(" ");
  const parts = [
    line1 || p.name,
    p.city || p.town || p.village || p.district,
    p.state,
    p.country,
  ].filter(Boolean);
  // de-dupe consecutive repeats (name === city for a city-level hit)
  return parts.filter((v, i) => v !== parts[i - 1]).join(", ");
}

// lat/lon -> human-readable address (Nominatim reverse). Throws on no result.
export async function reverseGeocode(lat, lon) {
  const r = await fetch(
    "https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=" +
      lat +
      "&lon=" +
      lon,
    { headers: { Accept: "application/json" } },
  );
  const j = await r.json();
  if (!j || !j.display_name) throw new Error("no_results");
  return shortAddrLabel(j.address, j.display_name);
}

// ---- Google Map Tiles session (for the interactive Leaflet picker) --------
// The Map Tiles API hands out standard XYZ satellite tiles once you trade the
// key for a short-lived session token — so Leaflet's L.tileLayer can consume
// Google imagery with no Maps JS SDK. Session is cached per key until it fails.
let _gTileSession = null; // { key, session }
export async function googleTileSession() {
  const k = gkey();
  if (!k) return null;
  if (_gTileSession && _gTileSession.key === k) return _gTileSession.session;
  const r = await fetch(
    "https://tile.googleapis.com/v1/createSession?key=" + encodeURIComponent(k),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapType: "satellite", language: "en-US", region: "US" }),
    },
  );
  const j = await r.json();
  if (!j || !j.session) throw new Error("google_tiles_failed");
  _gTileSession = { key: k, session: j.session };
  return j.session;
}
// XYZ URL template Leaflet can use once we have a session token.
export function googleTileUrl(session) {
  return (
    "https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=" +
    session +
    "&key=" +
    encodeURIComponent(gkey())
  );
}

// ---- aerial imagery: returns {canvas,wcm,hcm,mpp} centered on lat/lon ----
// sizePx is the target square image size in CSS pixels.
export async function fetchAerial(lat, lon, zoom, sizePx) {
  sizePx = sizePx || 640;
  const key = aerialKey(lat, lon, zoom) + "x" + sizePx;
  if (aerialCache[key]) {
    SITE.aerial = aerialCache[key];
    return SITE.aerial;
  }
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext("2d");
  const mpp = mppAt(lat, zoom);
  const gk = gkey();

  let usedGoogle = false;
  if (gk) {
    // Google Static Maps — single request (scale=2 for retina sharpness).
    // Google returns the same 256px-tile projection, so mpp is unchanged.
    try {
      const half = sizePx / 2;
      const u =
        "https://maps.googleapis.com/maps/api/staticmap?center=" +
        lat +
        "," +
        lon +
        "&zoom=" +
        zoom +
        "&size=" +
        half +
        "x" +
        half +
        "&scale=2&maptype=satellite&key=" +
        encodeURIComponent(gk);
      const img = await loadImg(u);
      ctx.drawImage(img, 0, 0, sizePx, sizePx);
      usedGoogle = true;
    } catch (e) {
      console.warn("Google Maps aerial failed, falling back to Esri", e);
    }
  }
  
  if (!usedGoogle) {
    // Esri World Imagery XYZ tiles (CORS: *) stitched around the pin.
    const center = llToGlobalPx(lat, lon, zoom);
    const originX = center.x - sizePx / 2;
    const originY = center.y - sizePx / 2;
    const tx0 = Math.floor(originX / TILE_PX);
    const ty0 = Math.floor(originY / TILE_PX);
    const tx1 = Math.floor((originX + sizePx) / TILE_PX);
    const ty1 = Math.floor((originY + sizePx) / TILE_PX);
    const jobs = [];
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const url =
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" +
          zoom +
          "/" +
          ty +
          "/" +
          tx;
        const dx = tx * TILE_PX - originX;
        const dy = ty * TILE_PX - originY;
        jobs.push(
          loadImg(url)
            .then((img) => ctx.drawImage(img, dx, dy))
            .catch(() => {}),
        );
      }
    }
    await Promise.all(jobs);
  }

  const wcm = sizePx * mpp * 100;
  const out = { canvas, wcm: wcm, hcm: wcm, mpp: mpp };
  // each cached aerial holds a ~1280px canvas (~6.5MB) — cap the cache so
  // zoom/pan exploration doesn't accumulate them indefinitely
  const keys = Object.keys(aerialCache);
  if (keys.length >= 4) delete aerialCache[keys[0]];
  aerialCache[key] = out;
  SITE.aerial = out;
  return out;
}

// ---- footprint providers (pluggable) --------------------------------------
// Each returns { polygonLL:[[lat,lon]...], levels?, heightM? } or throws.
async function footprintOSM(lat, lon) {
  const q =
    "[out:json][timeout:25];way(around:35," +
    lat +
    "," +
    lon +
    ")[building];out geom tags;";
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(q),
  });
  const j = await r.json();
  const ways = (j.elements || []).filter((e) => e.type === "way" && e.geometry);
  if (!ways.length) throw new Error("no_building");
  // prefer a way whose polygon contains the point, else the nearest.
  let best = null,
    bestD = Infinity;
  for (const w of ways) {
    const poly = w.geometry.map((g) => [g.lat, g.lon]);
    if (pointInPolyLL(lat, lon, poly)) {
      best = w;
      break;
    }
    const c = poly.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
    const cy = c[0] / poly.length,
      cx = c[1] / poly.length;
    const d = (cy - lat) * (cy - lat) + (cx - lon) * (cx - lon);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  const tags = best.tags || {};
  return {
    polygonLL: best.geometry.map((g) => [g.lat, g.lon]),
    levels: tags["building:levels"] ? parseFloat(tags["building:levels"]) : null,
    heightM: tags.height ? parseFloat(tags.height) : null,
  };
}

// Israel national GIS (GovMap / MAPI) — BEST EFFORT. The public endpoints are
// undocumented and may change; any failure falls back to OSM in fetchFootprint.
async function footprintGovmap(lat, lon) {
  // MAPI (Survey of Israel) buildings layer via its ArcGIS FeatureServer.
  // Query by point (WGS84) and take the returned building polygon.
  const url =
    "https://open.govmap.gov.il/arcgis/rest/services/Hosted/BUILDINGS/FeatureServer/0/query" +
    "?f=geojson&geometryType=esriGeometryPoint&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects" +
    "&outFields=*&geometry=" +
    encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
  const r = await fetch(url);
  const j = await r.json();
  const f = j && j.features && j.features[0];
  if (!f || !f.geometry) throw new Error("govmap_none");
  const ring = f.geometry.coordinates[0]; // [lon,lat] pairs
  const props = f.properties || {};
  return {
    polygonLL: ring.map((c) => [c[1], c[0]]),
    levels: props.floors || props.FLOORS || props["building:levels"] || null,
    heightM: props.height || props.HEIGHT || null,
  };
}

const FOOTPRINT_PROVIDERS = { osm: footprintOSM, govmap: footprintGovmap };

export async function fetchFootprint(lat, lon, provider) {
  const fn = FOOTPRINT_PROVIDERS[provider] || footprintOSM;
  try {
    return await fn(lat, lon);
  } catch (e) {
    if (fn !== footprintOSM) return footprintOSM(lat, lon); // graceful fallback
    throw e;
  }
}

// point-in-polygon on [lat,lon] rings (ray cast).
function pointInPolyLL(lat, lon, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0],
      xi = poly[i][1],
      yj = poly[j][0],
      xj = poly[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// ---- Street View backdrop (Google key required) ---------------------------
// Returns 6 cube-face images {px,nx,py,ny,pz,nz} or null if unavailable.
// A 90°-fov Street View perspective IS exactly a cube face, so 4 sides + up +
// down form a geometrically correct skybox. view3d.js maps these to an inverted
// box around the scene.
export async function fetchStreetViewCube(lat, lon, headingDeg) {
  const k = gkey();
  if (!k) return null;
  
  const locStr = lat + "," + lon;

  let meta;
  try {
    meta = await fetch(
      "https://maps.googleapis.com/maps/api/streetview/metadata?location=" +
        locStr +
        "&key=" +
        encodeURIComponent(k),
    ).then((r) => r.json());
    
    if (meta.status !== "OK") {
      if (meta.status === "REQUEST_DENIED") throw new Error("invalid_key");
      return null;
    }
  } catch (e) {
    if (e.message === "invalid_key") throw e;
    return null;
  }
  const h0 = headingDeg || 0;
  const sv = (heading, pitch) =>
    "https://maps.googleapis.com/maps/api/streetview?size=640x640&location=" +
    locStr +
    "&fov=90&heading=" +
    ((heading % 360) + 360) % 360 +
    "&pitch=" +
    pitch +
    "&key=" +
    encodeURIComponent(k);
  // three CubeTexture face order: px, nx, py, ny, pz, nz (right, left, up, down, front, back)
  const faces = {
    nz: sv(h0, 0),         // North (-Z)
    nx: sv(h0 + 90, 0),    // East (+X physical after scale.x = -1)
    pz: sv(h0 + 180, 0),   // South (+Z)
    px: sv(h0 + 270, 0),   // West (-X physical after scale.x = -1)
    py: sv(h0, 90),        // Up
    ny: sv(h0, -90),       // Down
  };
  const out = {
    _panoLat: meta.location.lat,
    _panoLon: meta.location.lng
  };
  await Promise.all(
    Object.keys(faces).map((f) =>
      loadImg(faces[f])
        .then((img) => (out[f] = img))
        .catch(() => (out[f] = null)),
    ),
  );
  return out;
}

// Reset caches (e.g. when the site changes location).
export function clearAerialCache() {
  aerialCache = {};
  SITE.aerial = null;
}
