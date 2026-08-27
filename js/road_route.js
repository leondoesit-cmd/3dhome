// Shared road-route client for the map builder and the 3D driving world.
// Keeping the OSRM response in lat/lon here lets the picker preview exactly the
// same route that the race later turns into local Three.js coordinates.

var DEFAULT_ENDPOINT = "https://router.project-osrm.org/route/v1/driving/";

function finitePoint(p) {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
}

export function roadRouteUrl(points, endpoint) {
  if (!Array.isArray(points) || points.length < 2 || !points.every(finitePoint)) return "";
  var coords = points.map(function (p) {
    return p.lon + "," + p.lat;
  }).join(";");
  return (endpoint || DEFAULT_ENDPOINT) + coords +
    "?overview=full&geometries=geojson&steps=false&alternatives=false";
}

export function parseRoadRoute(payload, requested) {
  var route = payload && payload.routes && payload.routes[0];
  var coords = route && route.geometry && route.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  var points = coords.map(function (c) {
    return { lat: Number(c[1]), lon: Number(c[0]) };
  }).filter(finitePoint);
  if (points.length < 2) return null;

  // OSRM waypoints are snapped to the routable road network. Use them for the
  // actual start/checkpoints too; otherwise the ribbon can be on the street
  // while the finish beacon remains inside a building or back garden.
  var rawWaypoints = payload.waypoints || [];
  var waypoints = (requested || []).map(function (fallback, i) {
    var loc = rawWaypoints[i] && rawWaypoints[i].location;
    var snapped = loc && { lat: Number(loc[1]), lon: Number(loc[0]) };
    return finitePoint(snapped) ? snapped : { lat: fallback.lat, lon: fallback.lon };
  });
  return {
    points: points,
    waypoints: waypoints,
    distanceM: Number.isFinite(route.distance) ? route.distance : 0,
    durationS: Number.isFinite(route.duration) ? route.duration : 0,
  };
}

export async function fetchRoadRoute(points, options) {
  options = options || {};
  var url = roadRouteUrl(points, options.endpoint);
  if (!url) return null;
  var fetcher = options.fetch || fetch;
  try {
    var response = await fetcher(url, { signal: options.signal });
    if (!response || response.ok === false) return null;
    return parseRoadRoute(await response.json(), points);
  } catch (_) {
    return null;
  }
}
