import test from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeExtrusionProjections} from '../js/core/extrusion_projection.js';
const frame=y=>({origin:{x:0,y,z:0},normal:{x:0,y:1,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:0,z:-1}});
test('blind pocket follows rebuilt support while through holes retain coverage',()=>{
 const support={persistentId:'base:end'};
 const pocket={featureId:'pocket',frame:frame(10),from:0,to:-.508};
 const hole={featureId:'hole',frame:frame(10),from:-11,to:1};
 const doc={parts:[{id:1,cuts3d:[pocket,hole],meshData:{positions:[0]}}]};
 const features=['pocket','hole'].map(id=>({id:id+':tool',type:'extrude',params:{axis:'frame',frame:frame(10),support,depth:.508,direction:'reverse',endCondition:id==='hole'?'through-all':'blind'}}));
 const run={results:new Map(features.map(f=>[f.id,{}])),topologyBindings:[{reference:support,topology:{descriptor:{origin:{x:0,y:1.016,z:0},normal:{x:0,y:1,z:0}}}}]};
 assert.deepEqual(synchronizeExtrusionProjections(doc,features,run),[1]);
 assert.equal(pocket.frame.origin.y,1.016);assert.equal(pocket.to,-.508);
 assert.ok(Math.abs(hole.frame.origin.y+hole.from+1)<1e-9);
 assert.equal(doc.parts[0].meshData,undefined);
 assert.deepEqual(synchronizeExtrusionProjections(doc,features,run),[]);
});

test('shared persistent face names use the binding for the specific feature context',()=>{
 const original={persistentId:'base:face:end',ownerFeatureId:'base'};
 const floor={persistentId:'base:face:end',ownerFeatureId:'pocket'};
 const frame=y=>({origin:{x:0,y,z:0},normal:{x:0,y:1,z:0},u:{x:1,y:0,z:0},v:{x:0,y:0,z:1}});
 const document={parts:[{id:'plate',merges3d:[{featureId:'holder',axis:'frame',frame:frame(1.016),from:0,to:1.016}]}]};
 const compiled=[{id:'holder:tool',type:'extrude',params:{support:floor,axis:'frame',frame:frame(1.016),depth:1.016,from:0,to:1.016}}];
 const run={results:new Map([['holder:tool',{}]]),topologyBindings:[{reference:original,topology:{descriptor:{origin:frame(1.016).origin,normal:frame(0).normal}}},{reference:floor,topology:{descriptor:{origin:frame(.508).origin,normal:frame(0).normal}}}]};
 synchronizeExtrusionProjections(document,compiled,run);
 assert.equal(document.parts[0].merges3d[0].frame.origin.y,.508);
});
