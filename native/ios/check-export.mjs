// Validate the fixture produced by the native storage test with the real importer.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseSurveyExchange} from '../../js/survey_exchange.js';
const file=process.argv[2];
if(!file)throw new Error('Pass the xcodebuild test log containing MFSURVEY_FIXTURE.');
const fixture=fs.readFileSync(file,'utf8').match(/MFSURVEY_FIXTURE:([A-Za-z0-9+/=]+)/);
assert.ok(fixture,'The native export test must emit its fixture.');
const survey=parseSurveyExchange(Buffer.from(fixture[1],'base64').toString('utf8'));
assert.equal(survey.survey.observations[0].value,273.5);
assert.equal(survey.survey.observations[0].status,'entered');
assert.equal(survey.attachments.length,1);
assert.equal(survey.survey.photos[0].attachmentId,survey.attachments[0].id);
console.log('Swift survey export retains its measurement and photo through the planner importer.');
