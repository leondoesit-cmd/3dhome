/* A split file that already imports from the source. */
import { cell } from "../geo.js";
import { zoom } from "../zoom.js";
import { LABEL, bump, helper, scale } from "../modeler.js";

export function sib() {
  return LABEL + bump() + helper(scale(2)) + cell + zoom;
}
