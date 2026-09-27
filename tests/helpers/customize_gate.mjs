// UI Customize mode is switched off for now (js/uikit_host/index.js,
// CUSTOMIZE_DISABLED — owner, 2026-09-27). Tests of the app's Customize mode
// and of layouts it mounts import `test` from here instead of node:test: while
// the flag is set they are reported as skipped, with the reason; the moment it
// is cleared they run again unchanged. Tests of the uikit library itself (its
// demo, its source rules) do not depend on the host and keep node:test.
import { readFileSync } from "node:fs";
import nodeTest from "node:test";

export const CUSTOMIZE_OFF = /export const CUSTOMIZE_DISABLED = true;/.test(
  readFileSync(new URL("../../js/uikit_host/index.js", import.meta.url), "utf8"));
const REASON = "UI Customize mode is switched off (js/uikit_host/index.js CUSTOMIZE_DISABLED)";

function gated(name, options, fn) {
  if (typeof options === "function") { fn = options; options = {}; }
  return nodeTest(name, Object.assign({}, options || {}, CUSTOMIZE_OFF ? { skip: REASON } : {}), fn);
}
// hooks set up a browser for the tests; with every test skipped there is nothing to set up
for (const hook of ["before", "after", "beforeEach", "afterEach"])
  gated[hook] = CUSTOMIZE_OFF ? function () {} : nodeTest[hook].bind(nodeTest);
gated.skip = nodeTest.skip.bind(nodeTest);
gated.todo = nodeTest.todo.bind(nodeTest);
gated.describe = nodeTest.describe;
export default gated;
export { gated as test };
