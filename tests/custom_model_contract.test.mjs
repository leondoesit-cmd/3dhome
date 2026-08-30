/* Registering a saved model, and keeping its design intent.
 *
 * Three separate defects lived on this path. All three were silent, and two of
 * them destroyed work:
 *
 *  1. registerCustomModel() ran the render-part projection over EVERY document,
 *     canonical ones included. The projection can only describe steps that left
 *     geometry behind, so a suppressed step or one past the rollback bar was
 *     erased. saveModel() preserved the tree; the next load flattened it.
 *
 *  2. renderedParts() read E.def, but the saved library registers into FURN at
 *     module scope and `var E` is declared AFTER that line — so E was undefined
 *     and every registration threw. `catch (_) { return false; }` ate it, so NO
 *     custom model registered at all: none placeable, and reopening one found
 *     no definition and produced a blank document.
 *
 *  3. the "does this project need the builder" check looked only at the top
 *     level, but each storey carries its own definitions under
 *     workspace.floors[].scene.customModels. switchFloor() is synchronous and
 *     cannot await, so a storey's custom furniture was filtered out and lost.
 *
 * Every one of these was invisible in the test suite and in the UI. They are
 * pinned at the source because the failure mode is silence.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
const modeler = await read("js/modeler.js");
const launch = await read("js/modeler_launch.js");

test("a canonical document keeps the feature tree it arrived with", () => {
  const register = modeler.slice(
    modeler.indexOf("export function registerCustomModel"),
    modeler.indexOf("FURN[def.key] = {"),
  );
  // the projection is skipped for documents that own an authored history...
  assert.match(register, /authoringSystem === "parametric-v1"/);
  assert.match(register, /if \(!cabinetDoc && !recognizedImport && \(!canonicalDoc \|\| !hasAuthoredTree\)\)/);
  // ...but "canonical" is a provenance claim, not proof a tree came with it:
  // an import whose recognition failed carries the flag and no features, and
  // skipping the projection there just hands the editor an empty tree.
  assert.match(register, /var hasAuthoredTree = Array\.isArray\(def\.features\) && def\.features\.length > 0;/);
});

test("registration survives running before the editor state exists", () => {
  // `var E` is declared after the module-scope registration below it; reading
  // E.def there threw for every saved model and the catch swallowed it.
  assert.match(modeler, /if\(E && E\.open && def===E\.def\) parts=parts\.filter/);
  assert.ok(
    modeler.indexOf("loadLib().forEach(registerCustomModel);") < modeler.indexOf("\nvar E = {"),
    "registration runs before `var E` is initialised — the guard above is what makes that safe",
  );
});

test("the builder check reaches definitions nested in every storey", () => {
  const fn = launch.slice(
    launch.indexOf("export function projectNeedsBuilder"),
    launch.indexOf("export function libraryLooksNonEmpty") + 1 || undefined,
  );
  assert.match(fn, /d\.workspace && d\.workspace\.floors/);
  assert.match(fn, /f\.scene && f\.scene\.customModels/);
  // a shallow top-level-only check is what lost a storey's furniture
  assert.match(fn, /Array\.isArray\(d\.customModels\) && d\.customModels\.length/);
});

test("boot loads the library when anything reachable needs it", () => {
  // the localStorage index is a cache written AFTER the IDB load, so it can lie
  assert.match(launch, /var PROJECT_KEYS = \["home3d", "home3d_auto"\]/);
  assert.match(launch, /if \(projectNeedsBuilder\(saved\)\) return true;/);
  // and an item whose type FURN does not know is a custom model that has not
  // registered yet — the signal that survives a cleared localStorage
  assert.match(launch, /!FURN\[it\.type\]/);
});
