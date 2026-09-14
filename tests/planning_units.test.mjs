import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PLANNING_UNITS,toDisplayLength,fromDisplayLength,parseLength,formatLength} from '../js/planning_units.js';
import {normalizePlanningGuide,planningDisplayUnit} from '../js/planning_guide.js';
test('display units round-trip model centimeters without changing dimensions',()=>{
 for(const unit of Object.keys(PLANNING_UNITS))assert.ok(Math.abs(fromDisplayLength(toDisplayLength(181.25,unit),unit)-181.25)<1e-10);
 assert.equal(toDisplayLength(350,'m'),3.5);assert.equal(fromDisplayLength(10,'in'),25.4);
 assert.equal(normalizePlanningGuide({details:{displayUnit:'ft'}}).details.displayUnit,'ft');
 assert.equal(normalizePlanningGuide({details:{displayUnit:'invalid'}}).details.displayUnit,undefined);
});
test('architectural length entry accepts feet-inches and metric suffixes',()=>{
 assert.equal(parseLength("17'-4\"", "ft"), 17 * 30.48 + 4 * 2.54);
 assert.equal(parseLength("8'-6\"", "cm"), 8 * 30.48 + 6 * 2.54);
 assert.equal(parseLength("3'-3\"", "ft"), 3 * 30.48 + 3 * 2.54);
 assert.equal(parseLength("2.74m", "cm"), 274);
 assert.equal(parseLength("528", "cm"), 528);
 assert.equal(formatLength(17 * 30.48 + 4 * 2.54, "ft", { suffix: false }), "17'-4\"");
 assert.equal(formatLength(884, "cm"), "884 cm");
 assert.equal(formatLength(884, "ft", { suffix: false }), "29'-0\"");
 assert.equal(planningDisplayUnit({workspace:{guidance:{details:{displayUnit:'ft'}}}}), 'ft');
 assert.equal(planningDisplayUnit({workspace:{guidance:{details:{}}}}), 'cm');
});
test('HUD and inspector follow the project display unit, including a mid-entry switch', async () => {
 const hud = await readFile(new URL('../js/cad_hud.js', import.meta.url), 'utf8');
 const props = await readFile(new URL('../js/ui_props.js', import.meta.url), 'utf8');
 const ui = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
 assert.match(hud, /window\.addEventListener\("planner-units", applyLangLabels\)/);
 assert.match(hud, /inLen\.value = hudFmt\(shown, \{ suffix: false \}\)/);
 assert.match(props, /function writeInspectorLen\(/);
 assert.match(ui, /function bindLength\(/);
 const plan = await readFile(new URL('../js/plan2d.js', import.meta.url), 'utf8');
 assert.match(plan, /planLen\(wallClearLength\(w\), \{ suffix: false \}\)/);
});
