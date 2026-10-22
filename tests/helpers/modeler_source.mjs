// The CAD editor's source, as the tests that read it expect: js/modeler.js
// followed by the sections split out of it into js/modeler/*.js (sorted), so
// a test keeps finding a function whichever of those files it now lives in.
// Line endings are normalised to \n.
import { readFileSync, readdirSync } from "node:fs";

const JS = new URL("../../js/", import.meta.url);
let cached = null;

export function modelerFiles() {
  let parts = [];
  try {
    parts = readdirSync(new URL("modeler/", JS)).filter((f) => f.endsWith(".js")).sort();
  } catch {}
  return ["modeler.js", ...parts.map((f) => "modeler/" + f)];
}

export function modelerSource() {
  if (cached == null)
    cached = modelerFiles()
      .map((f) => readFileSync(new URL(f, JS), "utf8").replace(/\r\n/g, "\n"))
      .join("\n");
  return cached;
}
