import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSpec } from '../js/cabinet.js';
import { createCabinetProductionJob, cabinetProductionStaleness, transitionCabinetProductionJob, recordCabinetStation, cabinetProductionCSV, cabinetProductionHTML, importCabinetProductionJob, validateCabinetHardwareEvidence } from '../js/cabinet_production_workflow.js';
const items = () => [{id:'cab-1',type:'cabsys',w:80,h:160,d:60,cab:makeSpec('w_classic',80,160,60)}];
test('stale structural allowance bindings cannot become checked documents',()=>{
 const live=items(),part=createCabinetProductionJob(live).manifest.parts[0];
 live[0].cab.productionOverrides={[part.partId]:{datum:part.datum,topologyBinding:'old-structure',edges:{}}};
 let job=createCabinetProductionJob(live);
 assert.throws(()=>transitionCabinetProductionJob(job,'checked',{items:live,reviewer:'QA',evidence:'review',acknowledgedIssues:job.manifest.issues.map(i=>i.code)}),/topology/);
 live[0].cab.productionOverrides={'removed-board':{}};job=createCabinetProductionJob(live);
 assert.throws(()=>transitionCabinetProductionJob(job,'checked',{items:live,reviewer:'QA',evidence:'review',acknowledgedIssues:job.manifest.issues.map(i=>i.code)}),/no longer present/);
});
test('snapshots are immutable and changes require a new revision even for non-size design settings',()=>{
 const live=items(),job=createCabinetProductionJob(live);assert.ok(job.manifest.parts.length);
 assert.equal(cabinetProductionStaleness(job,live).stale,false);
 assert.throws(()=>job.manifest.parts.push({}),TypeError);
 live[0].cab.productionTest='changed';assert.equal(cabinetProductionStaleness(job,live).stale,true);
 assert.notEqual(createCabinetProductionJob(live).revision,job.revision);
});
test('review evidence gates never qualify machine production',()=>{
 const live=items(),job=createCabinetProductionJob(live),options={items:live,reviewer:'Reviewer',evidence:'Compared drawings and measurements',acknowledgedIssues:job.manifest.issues.map(i=>i.code)};
 assert.throws(()=>transitionCabinetProductionJob(job,'released',options),/Check/);
 assert.throws(()=>transitionCabinetProductionJob(job,'checked',{items:live,acknowledgedIssues:job.manifest.issues.map(i=>i.code)}),/reviewer/);
 const checked=transitionCabinetProductionJob(job,'checked',options),released=transitionCabinetProductionJob(checked,'released',options);
 assert.equal(released.status,'released');assert.equal(released.productionRelease,false);assert.equal(released.machineReady,false);assert.equal(job.status,'draft');
 live[0].w=90;assert.throws(()=>transitionCabinetProductionJob(checked,'released',options),/differs/);
});
test('station records enforce revision, live freshness and sequence',()=>{
 const live=items(),job=createCabinetProductionJob(live),record={items:live,revision:job.revision,partId:job.manifest.parts[0].id,operator:'Operator'};
 assert.throws(()=>recordCabinetStation(job,{...record,station:'drill'}),/order/);
 assert.throws(()=>recordCabinetStation(job,{...record,station:'cut',revision:'old'}),/revision/);
 let next=job;for(const station of ['cut','band','drill','assemble','inspect']) next=recordCabinetStation(next,{...record,station});
 assert.equal(next.stationRecords.length,5);assert.equal(job.stationRecords.length,0);
 assert.throws(()=>recordCabinetStation(next,{...record,station:'inspect'}),/order/);
});
test('exports escape untrusted HTML, spreadsheet formulas and preserve review markings',()=>{
 const job=createCabinetProductionJob(items(),{jobId:'=HYPERLINK("evil")<script>alert(1)</script>'});
 const csv=cabinetProductionCSV(job),html=cabinetProductionHTML(job,{document:'traveler'});
 assert.ok(csv.includes("\"'=HYPERLINK"));assert.ok(csv.includes('NOT PRODUCTION RELEASED'));
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('Datum:'));assert.ok(html.includes('length:'));assert.ok(html.includes('inspect'));
});
test('import resets claimed release and detects manifest tampering',()=>{
 const job=createCabinetProductionJob(items()),saved=JSON.parse(JSON.stringify(job));saved.status='released';saved.productionRelease=true;saved.stationRecords=[];
 const imported=importCabinetProductionJob(saved);assert.equal(imported.status,'draft');assert.equal(imported.productionRelease,false);assert.deepEqual(imported.stationRecords,[]);
 saved.manifest.parts[0].finished.length++;assert.throws(()=>importCabinetProductionJob(saved),/revision/);
});
test('hardware evidence needs exact user supplied references',()=>{
 assert.ok(validateCabinetHardwareEvidence([{partId:'p',sku:'generic'}]).length);
 assert.deepEqual(validateCabinetHardwareEvidence([{partId:'p',manufacturer:'Supplier',sku:'ABC123',reference:'Drawing 123',revision:'B',verifiedBy:'Reviewer'}]),[]);
});

test('visual opening does not stale a revision',()=>{const live=items(),job=createCabinetProductionJob(live);live[0].cab.open=75;assert.equal(cabinetProductionStaleness(job,live).stale,false);});
test('runtime cabinet animation does not change a manufacturing revision',()=>{const live=items(),job=createCabinetProductionJob(live);live[0].runtimeState={cabinetOpen:90};assert.equal(cabinetProductionStaleness(job,live).stale,false);});

test('reordering cabinet selection preserves revision',()=>{const a=items()[0],b=items()[0];b.id='cab-2';b.x=200;const job=createCabinetProductionJob([a,b]);assert.equal(cabinetProductionStaleness(job,[b,a]).stale,false);});
test('known invalid geometry and missing issue acknowledgment block review release',()=>{const live=items(),job=createCabinetProductionJob(live);assert.throws(()=>transitionCabinetProductionJob(job,'checked',{items:live,reviewer:'R',evidence:'E'}),/acknowledge/);const invalid=items();delete invalid[0].id;const bad=createCabinetProductionJob(invalid);assert.throws(()=>transitionCabinetProductionJob(bad,'checked',{items:invalid,reviewer:'R',evidence:'E',acknowledgedIssues:bad.manifest.issues.map(i=>i.code)}),/unique/);});

test('modified evidence cannot reuse a previous revision and malformed evidence stays controlled',()=>{const live=items(),job=createCabinetProductionJob(live),changed=JSON.parse(JSON.stringify(job));changed.hardwareEvidence=[{partId:'p'}];assert.equal(cabinetProductionStaleness(changed,live).stale,true);assert.throws(()=>createCabinetProductionJob(live,{hardwareEvidence:null}),/array/);const invalid=createCabinetProductionJob(live,{hardwareEvidence:[null]});assert.throws(()=>transitionCabinetProductionJob(invalid,'checked',{items:live,reviewer:'R',evidence:'E'}),/invalid/);});

test('import preserves ordered operator history marked unverified and rejects forged sequence',()=>{const live=items(),job=createCabinetProductionJob(live),recorded=recordCabinetStation(job,{items:live,revision:job.revision,partId:job.manifest.parts[0].id,operator:'Op',station:'cut'});const imported=importCabinetProductionJob(JSON.stringify(recorded));assert.equal(imported.stationRecords.length,1);assert.equal(imported.stationRecords[0].imported,true);assert.equal(imported.stationRecords[0].scope,'imported-operator-record-unverified');assert.equal(imported.status,'draft');assert.equal(imported.productionRelease,false);assert.ok(cabinetProductionHTML(imported,{document:'traveler'}).includes('IMPORTED, UNVERIFIED'));const forged=JSON.parse(JSON.stringify(recorded));forged.stationRecords[0].station='inspect';assert.throws(()=>importCabinetProductionJob(forged),/sequence/);});
