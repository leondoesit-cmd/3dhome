import test from 'node:test';
import assert from 'node:assert/strict';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {revolvePreviewAxis} from '../js/core/revolve_geometry.js';
import {sketchWorldPoint} from '../js/core/swept_sources.js';

test('live Right Plane thin revolve uses the chosen Z axis before Finish',()=>{
 const sketch={plane:'side',referenceId:'plane:right'};
 const axis=revolvePreviewAxis({axis:'y',thinFeature:true},{axis:'axis:z'});
 assert.equal(axis,'z');
 const connector=sketchWorldPoint(sketch,-2.3,.4);
 const preview={u:Math.hypot(connector.x,connector.y),v:connector[axis]};
 assert.ok(Math.abs(preview.u-.4)<1e-10);
 assert.ok(Math.abs(preview.v+2.3)<1e-10,
  'The connector preview stays at the rear neck rather than jumping to z=0');
});

test('Right Plane revolve keeps horizontal Z as axial distance and vertical Y as radius',async()=>{
 const sketch={id:'profile',plane:'side',referenceId:'plane:right',points:[{id:'a',x:0,y:0},{id:'b',x:5,y:0},{id:'c',x:5,y:1},{id:'d',x:0,y:4}],
  entities:[{id:'ab',type:'line',a:'a',b:'b'},{id:'bc',type:'line',a:'b',b:'c'},{id:'cd',type:'line',a:'c',b:'d'},{id:'da',type:'line',a:'d',b:'a'}],constraints:[]};
 const run=await regenerateFeatures({sketches:[sketch],features:[{id:'lens',type:'revolve',params:{axis:'z',angle:360,useSketchPlane:true,radialProfile:true,sketchId:sketch.id,profileEntityIds:sketch.entities.map(e=>e.id)}}]});
 try{
  assert.equal(run.ok,true,JSON.stringify(run.issues));
  const faces=run.results.get('lens').topology.filter(t=>t.kind==='face'&&t.descriptor.surface==='plane');
  assert.equal(faces.length,2);
  const front=faces.find(f=>Math.abs(f.descriptor.origin.z)<1e-6);
  const back=faces.find(f=>Math.abs(f.descriptor.origin.z-5)<1e-6);
  assert.ok(front&&back);
  assert.ok(Math.abs(front.descriptor.measure-16*Math.PI)<1e-6);
  assert.ok(Math.abs(back.descriptor.measure-Math.PI)<1e-6);
 }finally{releaseRegeneration(run);}
});
