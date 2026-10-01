import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectBundleUrl,readProjectBundleUrl} from '../js/core/project_bundle_url.js';
const base='http://localhost:8765/';
test('project links resolve protected exports on the same server',()=>{
  assert.equal(projectBundleUrl('/artifacts/planchard/HOUSING-final-browser-2026-09-28.mforge',base).origin,new URL(base).origin);
});
test('project links reject foreign origins, credentials, executable schemes and other file types',()=>{
  for(const value of ['https://example.com/a.mforge','http://user:password@localhost:8765/a.mforge','file:///C:/a.mforge','javascript:alert(1)','/index.html']) assert.throws(()=>projectBundleUrl(value,base));
});
test('project read refuses redirects and uses existing same-origin access',async()=>{
  let options;
  assert.equal(await readProjectBundleUrl('/a.mforge',base,async(url,opts)=>{options=opts;assert.equal(url,base+'a.mforge');return {ok:true,text:async()=>'saved project'};}),'saved project');
  assert.equal(options.redirect,'error');assert.equal(options.credentials,'same-origin');
  await assert.rejects(readProjectBundleUrl('/missing.mforge',base,async()=>({ok:false,status:404})),/404/);
});
