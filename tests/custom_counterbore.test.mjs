import test from 'node:test';
import assert from 'node:assert/strict';
import {holeWizardSolids} from '../js/cad_hole_wizard.js';
import {evaluateFeatureNumber} from '../js/modeler_feature_form.js';
test('custom inch counterbore retains textbook dimensions through serialization',()=>{
 const length={unit:'length',min:1e-6};
 const params={standardSize:'custom',holeType:'counterbore',endCondition:'through-all',
 diameter:evaluateFeatureNumber('.5312 in',length),cboreDiameter:evaluateFeatureNumber('.600 in',length),cboreDepth:evaluateFeatureNumber('.200 in',length)};
 const result=holeWizardSolids(JSON.parse(JSON.stringify(params)));
 assert.equal(result.hole.standard,'Custom');
 assert.ok(Math.abs(result.hole.diameterMm-13.49248)<1e-9);
 assert.ok(Math.abs(result.solids[1].diameter-1.524)<1e-9);
 assert.ok(Math.abs(result.solids[1].depth-.508)<1e-9);
 assert.equal(result.solids[0].endCondition,'through-all');
});
