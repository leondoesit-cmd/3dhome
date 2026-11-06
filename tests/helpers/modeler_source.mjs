// The CAD editor's source, as the tests that read it expect: js/modeler.js
// followed by the sections split out of it into js/modeler/*.js (sorted).
// See module_source.mjs for what is stripped so it reads as one module.
import { moduleFiles, moduleSource } from "./module_source.mjs";

// paths relative to js/, as before
export const modelerFiles = () => moduleFiles("js/modeler.js").map((f) => f.slice("js/".length));
export const modelerSource = () => moduleSource("js/modeler.js");
