import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchRoadRoute,
  parseRoadRoute,
  roadRouteUrl,
} from "../js/road_route.js";

const requested = [
  { lat: 32.08, lon: 34.78 },
  { lat: 32.09, lon: 34.8 },
];
const response = {
  routes: [{
    distance: 2450.4,
    duration: 312.2,
    geometry: { coordinates: [[34.7801, 32.0802], [34.79, 32.085], [34.7998, 32.0899]] },
  }],
  waypoints: [
    { location: [34.7801, 32.0802] },
    { location: [34.7998, 32.0899] },
  ],
};

test("road route URL keeps ordered checkpoints and requests full geometry", () => {
  const url = roadRouteUrl(requested);
  assert.match(url, /34\.78,32\.08;34\.8,32\.09/);
  assert.match(url, /overview=full/);
  assert.match(url, /geometries=geojson/);
  assert.equal(roadRouteUrl([requested[0]]), "");
});

test("road route parser returns road geometry, metrics, and snapped race points", () => {
  const route = parseRoadRoute(response, requested);
  assert.deepEqual(route.points[1], { lat: 32.085, lon: 34.79 });
  assert.deepEqual(route.waypoints[0], { lat: 32.0802, lon: 34.7801 });
  assert.deepEqual(route.waypoints[1], { lat: 32.0899, lon: 34.7998 });
  assert.equal(route.distanceM, 2450.4);
  assert.equal(route.durationS, 312.2);
  assert.equal(parseRoadRoute({ routes: [] }, requested), null);
});

test("road route fetch is injectable and fails closed", async () => {
  let requestedUrl = "";
  const route = await fetchRoadRoute(requested, {
    fetch: async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => response };
    },
  });
  assert.ok(requestedUrl.startsWith("https://router.project-osrm.org/"));
  assert.equal(route.points.length, 3);
  assert.equal(await fetchRoadRoute(requested, { fetch: async () => ({ ok: false }) }), null);
});
