// Load the app's vendored pdf.js (vendor/pdfjs, the modern browser build) in
// Node for the floor-plan bench and tests. That build assumes a current
// browser: it touches DOMMatrix at import time and uses ES2025+ helpers Node
// does not ship yet. Only operator lists and text content are needed here —
// no rendering — so small shims for exactly those gaps are enough, and the
// bench exercises the same pdf.js code the browser runs.
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function shim() {
  globalThis.DOMMatrix ??= class DOMMatrix {
    constructor(m) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = m || [1, 0, 0, 1, 0, 0];
    }
  };
  const getOrInsertComputed = function (key, make) {
    if (!this.has(key)) this.set(key, make(key));
    return this.get(key);
  };
  const getOrInsert = function (key, value) {
    if (!this.has(key)) this.set(key, value);
    return this.get(key);
  };
  for (const C of [Map, WeakMap]) {
    C.prototype.getOrInsertComputed ??= getOrInsertComputed;
    C.prototype.getOrInsert ??= getOrInsert;
  }
  Math.sumPrecise ??= (values) => {
    let sum = 0;
    for (const v of values) sum += v;
    return sum;
  };
  Uint8Array.prototype.toHex ??= function () {
    return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString("hex");
  };
  Uint8Array.prototype.toBase64 ??= function () {
    return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString("base64");
  };
  Uint8Array.fromBase64 ??= (s) => new Uint8Array(Buffer.from(s, "base64"));
}

let loaded = null;
export function loadPdfjs() {
  if (!loaded) {
    shim();
    // the browser build warns (on every document) that Node should use the
    // legacy build; the shims above are the point, so keep output quiet
    const warn = console.warn;
    console.warn = (...a) => { if (!/use the .legacy. build/.test(String(a[0]))) warn(...a); };
    loaded = (async () => {
      const pdfjs = await import(pathToFileURL(join(root, "vendor/pdfjs/pdf.min.mjs")).href);
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(root, "vendor/pdfjs/pdf.worker.min.mjs")).href;
      return pdfjs;
    })();
  }
  return loaded;
}
