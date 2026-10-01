import test from 'node:test';
import assert from 'node:assert/strict';
import {recordExpectedContact,removeExpectedContact,expectedContactFor,contactAuditSummary} from '../js/core/assembly_contact_audit.js';
const hit={a:'12/4',b:9,exact:true,volume:.002184,bounds:{x0:0,x1:1,y0:2,y1:3,z0:4,z1:5}};
test('declared threaded contact survives reopening while native raw clashes remain counted',()=>{
  const assembly={};
  recordExpectedContact(assembly,hit,'Cosmetic 5/16-18 UNC thread engagement; helical surfaces are not modeled');
  const reopened=JSON.parse(JSON.stringify(assembly));
  assert.ok(expectedContactFor(reopened,{...hit,a:9,b:'12/4'}));
  assert.deepEqual(contactAuditSummary(reopened,[hit,{a:1,b:2,exact:true,volume:.3}]),{rawExact:2,declared:1,unreviewed:1,boundsOnly:0});
  removeExpectedContact(reopened,hit);
  assert.equal(expectedContactFor(reopened,hit),null);
});
test('changed geometry and bounds-only evidence require a new contact review',()=>{
  const assembly={};
  assert.throws(()=>recordExpectedContact(assembly,hit,''),/Describe/);
  assert.throws(()=>recordExpectedContact(assembly,{...hit,exact:false},'thread'),/native/);
  recordExpectedContact(assembly,hit,'thread');
  assert.equal(expectedContactFor(assembly,{...hit,volume:.004}),null);
  assert.equal(expectedContactFor(assembly,{...hit,bounds:{...hit.bounds,z1:5.1}}),null);
  assert.equal(expectedContactFor(assembly,{...hit,b:'12/5'}),null);
  assert.deepEqual(contactAuditSummary(assembly,[{...hit,exact:false}]),{rawExact:0,declared:0,unreviewed:0,boundsOnly:1});
});
