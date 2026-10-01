import test from 'node:test';
import assert from 'node:assert/strict';
import {cylindricalHolePlacement,cylindricalHoleSource} from '../js/core/cylindrical_hole_placement.js';
import {holeCutRecords,holeToolPlacements,syncHoleCutPlacement} from '../js/core/hole_geometry.js';
const model=()=>({features:[{id:'base',type:'extrude',params:{sketchId:'s',profileEntityIds:[2],holeProfileEntityIds:[],from:0,to:3.81,depth:3.81,axis:'y'}}],sketches:[{id:'s',plane:'top',points:[{id:1,x:0,y:0}],entities:[{id:2,type:'circle',c:1,r:1.27}]}]});
const params={cylindricalSource:{featureId:'base',circleId:2},cylinderTopDistance:.635,cylinderAngle:0,holeType:'counterbore',standard:'ANSI Inch',standardSize:'1/4-20',fit:'normal',endCondition:'through-all',direction:'forward',cboreDepth:.889};
test('radial position retains exact source circle and measured top distance',()=>{
 const doc=model(),placement=cylindricalHolePlacement(params,doc);
 assert.deepEqual(placement.frame.origin,{x:0,y:3.175,z:1.27});
 const records=holeCutRecords(params,null,[],doc),tools=holeToolPlacements(records[0].params,{min:{x:-1.27,y:0,z:-1.27},max:{x:1.27,y:3.81,z:1.27}});
 assert.equal(tools[0].axis.z,-1);assert.ok(tools[0].depth>2.54);
 assert.equal(records.length,2);
});
test('upstream radius and height edits update position while its dimensions remain fixed',()=>{
 const doc=model();doc.sketches[0].entities[0].r=2;doc.features[0].params.depth=5;
 const p=cylindricalHolePlacement({...params,cylinderAngle:90},doc);
 assert.ok(Math.abs(p.frame.origin.x-2)<1e-12);assert.equal(p.frame.origin.y,4.365);
 assert.equal(cylindricalHoleSource(doc,{ownerFeatureId:'base',kind:'face',persistentId:'side',descriptor:{surface:'cylinder'}}).circleId,2);
});
test('reverse and symmetric cylinders measure from their physical upper end',()=>{
 const doc=model();doc.features[0].params.direction='reverse';
 assert.equal(cylindricalHolePlacement(params,doc).frame.origin.y,-.635);
 doc.features[0].params.symmetric=true;
 assert.equal(cylindricalHolePlacement(params,doc).frame.origin.y,1.27);
 doc.features[0].params.depth=NaN;
 assert.throws(()=>cylindricalHolePlacement(params,doc),/between/);
});
test('unsupported faces and impossible positions fail explicitly',()=>{
 const doc=model();assert.equal(cylindricalHoleSource(doc,{featureId:'base',descriptor:{surface:'plane'}}),null);
 assert.throws(()=>cylindricalHolePlacement({...params,cylinderTopDistance:5},doc),/between/);
 doc.features[0].params.draftAngle=3;assert.throws(()=>cylindricalHolePlacement(params,doc),/undrafted/);
});
test('compatibility cutters re-anchor without a placement sketch after height edits',()=>{
 const doc=model(),feature={id:'radial',type:'hole',params};
 const part={cuts3d:holeCutRecords(params,null,[],doc).map(record=>({...record,featureId:feature.id}))};
 doc.features[0].params.depth=4.445;
 assert.equal(syncHoleCutPlacement(part,feature,null,doc),true);
 for(const record of part.cuts3d)assert.ok(Math.abs(record.params.frame.origin.y-3.81)<1e-12);
 assert.equal(syncHoleCutPlacement(part,feature,null,doc),false);
});
test('bore faces and upstream hollow profile changes cannot become solid cylinders',()=>{
 const face={ownerFeatureId:'base',descriptor:{surface:'cylinder'}};
 const rectangle=model();rectangle.sketches[0].entities.push({id:3,type:'rect'});
 rectangle.features[0].params.profileEntityIds=[3];rectangle.features[0].params.holeProfileEntityIds=[[2]];
 assert.equal(cylindricalHoleSource(rectangle,face),null);
 assert.throws(()=>cylindricalHolePlacement(params,rectangle),/circular extrusion/);
 const annular=model();annular.sketches[0].entities.push({id:3,type:'circle',c:1,r:.4});
 annular.features[0].params.holeProfileEntityIds=[[3]];
 assert.equal(cylindricalHoleSource(annular,face),null);
 assert.throws(()=>cylindricalHolePlacement(params,annular),/circular extrusion/);
 const changed=model();changed.features[0].params.profileEntityIds=[2,3];
 assert.throws(()=>cylindricalHolePlacement(params,changed),/circular extrusion/);
});
