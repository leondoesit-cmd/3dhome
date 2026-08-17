// Furniture & light-fixture catalog + scene-data helpers.
// Each FURN entry: {label,w,d,h,col,build(g,it)[,lamp]}.  Local frame: x=width, z=depth, front=+z.
//
// Implementation is split for maintainability:
//   furniture_helpers.js  — shared procedural shapes
//   furniture_models.js   — core FURN catalog + variant accessors
//   furniture_extra.js    — computers, humans, extended models
//   furniture_variants.js — finish/shape variant tables
//   furniture_meta.js     — labels, prices, CATALOG tree
//   furniture_api.js      — buildItem, spans, mkItem, defaultScene
// This file is the stable public entry used by the rest of the app.

export { FURN, variantList, variantOf, vspec, vlabel } from "./furniture_models.js";
export {
  buildItem,
  fcolor,
  clearVSpanCache,
  elevOffset,
  itemVSpan,
  isLamp,
  lampColor,
  mkItem,
  defaultScene,
  emptyScene,
} from "./furniture_api.js";
export { flabel, clabel, PRICE, itemPrice, CATALOG } from "./furniture_meta.js";

// Register extended models and variant tables (side effects).
import "./furniture_extra.js";
import "./furniture_variants.js";
