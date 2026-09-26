import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCabinetProductionJobs,cabinetRevisionDiffHTML,cabinetRevisionDiffCSV} from '../js/cabinet_revision_diff.js';
const job=()=>({schema:'modelforge-cabinet-production-job',version:1,jobId:'job',revision:'r1',hardwareEvidence:[],manifest:{units:'mm',parts:[{id:'a',finished:{length:100.123,width:60,thickness:18},substrate:null,rough:null,topologyBinding:'t1',material:'wood',grain:true}],sourceItems:[{id:'cab',cab:{setting:1}}],joinery:{plans:[]}}});
test('comparison is deterministic, immutable and records precise dimensions, additions and removals',()=>{
 const a=job(),b=job();b.manifest.parts[0].finished.length+=0.001;b.manifest.parts.push({id:'b'});const before=JSON.stringify(a),r=compareCabinetProductionJobs(a,b);
 assert.equal(r.summary.changed,1);assert.equal(r.summary.added,1);assert.equal(r.parts[0].dimensionDeltas.finished.length,0.001);assert.ok(Object.isFrozen(r.parts[0]));assert.equal(JSON.stringify(a),before);assert.deepEqual(r,compareCabinetProductionJobs(a,b));assert.equal(compareCabinetProductionJobs(b,a).summary.removed,1);
});
test('topology changes disallow claiming physical identity continuity and unknown allowances remain null deltas',()=>{
 const a=job(),b=job();b.manifest.parts[0].topologyBinding='t2';b.manifest.parts[0].substrate={length:98,width:60,thickness:18};const r=compareCabinetProductionJobs(a,b);assert.equal(r.parts[0].physicalContinuity,'unverified-topology-replacement');assert.equal(r.parts[0].dimensionDeltas.substrate.length,null);assert.equal(r.summary.topologyReplacements,1);
});
test('review evidence and source-only changes are not hidden by identical board sizes',()=>{
 const a=job(),b=job();b.hardwareEvidence=[{partId:'a',sku:'new'}];b.manifest.joinery.plans=[{ownerItemId:'cab',id:'j1'}];b.manifest.sourceItems[0].cab.setting=2;const r=compareCabinetProductionJobs(a,b);assert.equal(r.parts.length,0);assert.equal(r.joineryChanges.length,1);assert.equal(r.hardwareEvidenceChanges.length,1);assert.ok(r.issues.some(i=>i.code==='source-only-change'));
});
test('documents escape imported strings; invalid schema and ambiguous IDs reject comparison',()=>{
 const a=job(),b=job();b.manifest.parts[0].material='<script>alert("x")</script>';assert.ok(!cabinetRevisionDiffHTML(a,b).includes('<script>'));assert.match(cabinetRevisionDiffHTML(a,b),/&lt;script&gt;/);assert.match(cabinetRevisionDiffCSV(a,b),/REVIEW ONLY/);
 assert.throws(()=>compareCabinetProductionJobs({},b));b.manifest.parts.push(b.manifest.parts[0]);assert.throws(()=>compareCabinetProductionJobs(a,b),/unique/);
});
test('CSV neutralizes formula-prefixed imported IDs while preserving textual evidence',()=>{
 const a=job(),b=job();b.manifest.parts.push({id:'=HYPERLINK("bad")',material:'wood'});
 b.manifest.sourceItems.push({id:'+cmd',cab:{}});
 const csv=cabinetRevisionDiffCSV(a,b);assert.match(csv,/"'=HYPERLINK\(""bad""\)"/);assert.match(csv,/"'\+cmd"/);
});
