import { clamp, uid as makeId } from "./state.js";
import * as Geo from "./geo.js";
import { sib } from "./modeler/sibling.js";
import { other } from "./modeler/sibling2.js";

let counter = 0;
const LIMIT = 10;
const LABEL = "n";

// for js/modeler/sibling.js (live bindings: it sees every reassignment)
export {
  LABEL, bump, helper,
};
// for js/modeler/sibling2.js (live bindings: it sees every reassignment)
export {
  tint,
};

// Scales a value into the limit.
// It also adds a fresh id.
export function scale(v) {
  return clamp(v, 0, LIMIT) * Geo.K + makeId();
}

/* Labels a scaled value. */
function tint(v) {
  return scale(v) + LABEL;
}

const TABLE = [1, 2];

function helper(v) {
  return v + 1;
}

function quiet() {
  return 1;
}

function bump() {
  counter += 1;
  return counter;
}

function keep() {
  return tint(1) + scale(2) + counter + bump() + sib() + other() + TABLE.length;
}

async function lazy() {
  const { gallery } = await import("./ui_textures.js");
  const job = new Worker(new URL("./modeler/job.js", import.meta.url));
  const data = new URL("./assets/data.json", import.meta.url);
  return gallery(job, data, import("three"));
}

export { listed };

function listed() {
  return 1;
}

function evalUser() {
  eval("counter++");
}

async function tpl() {
  return import(`./state.js`);
}

function tplDyn(n) {
  return import(`./mod_${n}.js`);
}

function plainWorkers() {
  return [new Worker("./w.js"), new SharedWorker("./w.js")];
}
