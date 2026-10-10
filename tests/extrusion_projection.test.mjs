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

test('principal-plane dimension rebuild refreshes both sampled and analytic cut recipes',()=>{
 const circle=r=>Array.from({length:16},(_,i)=>({u:3+r*Math.cos(i*Math.PI/8),v:2+r*Math.sin(i*Math.PI/8)}));
 const cut={featureId:'roof',axis:'y',from:3,to:1.5,loop:circle(.6),segments:[{type:'circle',center:{u:3,v:2},radius:.6}],holes:[{points:[{u:0,v:0}]}]};
 const untouched={featureId:'other',axis:'z',loop:[{u:0,v:0}]};
 const doc={parts:[{id:'bridge',cuts3d:[cut,untouched],meshData:{positions:[0]}}]};
 const params={axis:'y',from:3,to:1.5,points:circle(.65),segments:[{type:'circle',center:{u:3,v:2},radius:.65}],holes:[]};
 const compiled=[{id:'roof:tool',type:'extrude',params}];
 // No face support: a fully defined principal-plane circle changed D12→13mm.
 const run={ok:true,results:new Map([['roof:tool',{}]]),resolvedExtrusions:new Map([['roof:tool',params]])};
 assert.deepEqual(synchronizeExtrusionProjections(doc,compiled,run),['bridge']);
 assert.deepEqual(cut.loop,circle(.65));assert.equal(cut.segments[0].radius,.65);
 assert.deepEqual(cut.holes,[]);assert.equal(doc.parts[0].meshData,undefined);
 assert.deepEqual(untouched,{featureId:'other',axis:'z',loop:[{u:0,v:0}]});
 assert.deepEqual(synchronizeExtrusionProjections(doc,compiled,run),[]);
 // An unsuccessful/unbuilt tool must retain its last successful recipe.
 const failed={results:new Map(),resolvedExtrusions:new Map([['roof:tool',{...params,points:circle(.7)}]])};
 assert.deepEqual(synchronizeExtrusionProjections(doc,compiled,failed),[]);
 assert.deepEqual(cut.loop,circle(.65));
});

test('rebuilt polygon removes obsolete analytic curve metadata',()=>{
 const cut={featureId:'cut',axis:'z',from:0,to:1,segments:[{type:'circle',radius:1}],holes:[{points:[{u:0,v:0}]}]};
 const params={axis:'z',from:0,to:1,points:[{u:0,v:0},{u:2,v:0},{u:0,v:2}]};
 const document={parts:[{id:1,cuts3d:[cut]}]};
 synchronizeExtrusionProjections(document,[{id:'cut:tool',type:'extrude',params}],{results:new Map([['cut:tool',{}]]),resolvedExtrusions:new Map([['cut:tool',params]])});
 assert.deepEqual(cut.loop,params.points);assert.equal('segments' in cut,false);assert.equal('holes' in cut,false);
});
