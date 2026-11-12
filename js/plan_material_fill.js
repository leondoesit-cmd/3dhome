/* Image-backed floor fills for the presentation plan (plan2d.js).

   The presentation plan used to fill every room from its floor TYPE's
   procedural painter, so a room given a library material or an uploaded
   texture still showed plain oak in 2D. floorImageSource() answers the
   patternFill() contract — a canvas `level` px square, or null while the
   image is still loading (patternFill then uses the flat colour and does not
   cache) — and asks for one repaint when the bitmap arrives. */
import { materialFromRef, materialUrl } from "./material_library.js";

var images = new Map(); // url → HTMLImageElement
var canvases = new Map(); // url@level → canvas

function imageFor(url, onReady) {
  var img = images.get(url);
  if (img) return img.complete && img.naturalWidth ? img : null;
  if (typeof Image !== "function") return null;
  img = new Image();
  img.decoding = "async";
  img.onload = function () { if (onReady) onReady(); };
  img.src = url;
  images.set(url, img);
  return null;
}

/**
 * The image a room's custom floor shows in 2D, and its tile size.
 * @param {string} floorTex  roomMeta.floorTex ("mat:<id>", data URL, http URL)
 * @param {number} [floorScale] roomMeta.floorScale (cm)
 * @returns {{url: string, tileCm: number}|null}
 */
export function floorImageFor(floorTex, floorScale) {
  if (!floorTex || typeof floorTex !== "string") return null;
  var m = materialFromRef(floorTex);
  // 2D never needs more than the 1k colour map: a tile on screen is rarely
  // even 512 device px across.
  if (m) return { url: materialUrl(m.id, "color", "1k"), tileCm: floorScale || m.sizeCm };
  return { url: floorTex, tileCm: floorScale || 200 };
}

/** patternFill() source: canvas of `level` px, or null until loaded. */
export function floorImageSource(url, level, onReady) {
  var key = url + "@" + level;
  var c = canvases.get(key);
  if (c) return c;
  var img = imageFor(url, onReady);
  if (!img || typeof document === "undefined") return null;
  c = document.createElement("canvas");
  c.width = c.height = level;
  var x = c.getContext("2d");
  if (!x) return null;
  x.imageSmoothingQuality = "high";
  x.drawImage(img, 0, 0, level, level);
  canvases.set(key, c);
  return c;
}
