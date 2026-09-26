import test from 'node:test';
import assert from 'node:assert/strict';
import {partNeedsExactMesh,partSupportsExactMesh} from '../js/modeler_part_geometry.js';

test('revolved bodies expose exact faces before downstream shell selection',()=>{
 const lens={kind:'rev',axis:'z',angle:360,pts:[{u:0,v:0},{u:5.08,v:0},{u:1.016,v:5.08},{u:0,v:5.08}]};
 assert.equal(partSupportsExactMesh(lens),true);
 assert.equal(partNeedsExactMesh(lens),true);
 assert.equal(partNeedsExactMesh({...lens,angle:180}),true);
 assert.equal(partNeedsExactMesh({kind:'ext',draftAngle:0}),false);
});
