import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHelixSpec,normalizeHelixRegions,helixRegionState,helixPoint,helixLength,sampleHelix,circularHelixSweepProfile} from '../js/cad_helix.js';
import {helixFromSketch,synchronizeSketchHelices} from '../js/core/sketch_helix.js';
import {createPartDocument,createSketchDefinition,createFeatureDefinition} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
import {resolveSketchSources} from '../js/core/swept_sources.js';

const inch=2.54,rows=[.021,.021,.080,.080,.021,.021,.021].map((pitch,revolution)=>({revolution,pitch:pitch*inch,diameter:.235*inch}));
const spec={pitchMode:'variable',pitchRegions:rows,axis:{x:0,y:0,z:1},radius:.235*inch/2,pitch:.021*inch,turns:6,height:.244*inch,handedness:'rh'};
test('book 7.10 variable pitch integrates to the printed seven heights, with correct pitch inside each transition',()=>{
  const normalized=normalizeHelixSpec(spec),heights=[0,.021,.0715,.1515,.202,.223,.244];
  assert.equal(normalized.turns,6);assert.ok(Math.abs(normalized.height-.244*inch)<1e-12);
  heights.forEach((height,rev)=>{assert.ok(Math.abs(helixPoint(spec,rev/6).z-height*inch)<1e-12);});
  assert.ok(Math.abs(helixRegionState(rows,1.5).pitch-.0505*inch)<1e-12);
  assert.ok(Math.abs(helixRegionState(rows,1.5).height-.038875*inch)<1e-12);
  const samples=sampleHelix(spec).points;assert.ok(samples.some(p=>p.t===2/6 && Math.abs(p.z-.0715*inch)<1e-12));
  const diameter=.235*inch;for(const point of samples)assert.ok(Math.abs(Math.hypot(point.x,point.y)-diameter/2)<1e-12);
  const left=helixPoint({...spec,handedness:'lh'},.125),right=helixPoint(spec,.125);assert.ok(Math.abs(left.z-right.z)<1e-12);assert.ok(Math.abs(left.y+right.y)<1e-12);
});

test('variable diameter interpolates by revolutions; invalid regions fail explicitly instead of falling back to constant pitch',()=>{
  const varied=[{revolution:0,pitch:.1,diameter:1},{revolution:2,pitch:.3,diameter:2}];
  const p=helixPoint({...spec,pitchRegions:varied},.5);assert.ok(Math.abs(Math.hypot(p.x,p.y)-.75)<1e-12);assert.ok(Math.abs(p.z-.15)<1e-12);
  assert.throws(()=>normalizeHelixRegions([{revolution:1,pitch:.1,diameter:1},{revolution:2,pitch:.1,diameter:1}]),/start at 0/);
  assert.throws(()=>normalizeHelixRegions([rows[0],rows[0]]),/increase/);
  assert.throws(()=>normalizeHelixSpec({...spec,pitchRegions:[rows[0],{...rows[1],pitch:0}]}),/positive/);
});

function documentFixture(){
  const document=createPartDocument();
  const sketch=createSketchDefinition(document,{id:'spring-circle',referenceId:'plane:top',points:[{id:'center',x:0,y:0,fixed:true}],entities:[{id:'circle',type:'circle',c:'center',r:.235*inch/2,fixed:true}],constraints:[]});sketch.plane='top';
  const params={...spec,sketchId:sketch.id,circleId:'circle',definition:'pitch-turns',taperMode:'delta',taper:0};
  const feature=createFeatureDefinition(document,'helix',{id:'spring-helix',references:{sketches:[sketch.id]},params});
  document.referenceGeometry=[{id:'helix-reference',featureId:feature.id,type:'reference_helix',...normalizeHelixSpec(helixFromSketch(document,params))}];
  const sources={kind:'circular-helix-sweep',diameter:.015*inch,helixId:'helix-reference',helixFeatureId:feature.id};
  const recipe=circularHelixSweepProfile(document.referenceGeometry[0],sources.diameter);
  createFeatureDefinition(document,'sweep',{id:'spring-wire',inputs:[],references:{sketches:[],features:[feature.id],references:['helix-reference']},params:{profileMode:'circular',profileDiameter:sources.diameter,sweepPathMode:'helix',helixId:'helix-reference',sketchSources:sources,...recipe}});
  return {document,sources,feature};
}

test('saved helix rows drive reference projection and dependent exact sweep after edits, including circular profiles without another sketch',async()=>{
  const {document,sources,feature}=documentFixture();
  const reopened=JSON.parse(JSON.stringify(document)),compiled=compileKernelFeatureTree(reopened);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));const mass=await shapeMassProperties(run.finalShape);
    const expected=Math.PI*(.015*inch/2)**2*helixLength(spec);
    assert.ok(Math.abs(mass.volume-expected)/expected<.005,`native spring volume ${mass.volume} vs independent tube-area/path-length estimate ${expected}`);
    assert.ok(mass.bounds.max.y-mass.bounds.min.y>.244*inch && mass.bounds.max.y-mass.bounds.min.y<.26*inch);
  }finally{releaseRegeneration(run);}
  feature.params.pitchRegions[3].pitch+=.01*inch;synchronizeSketchHelices(document);
  const moved=resolveSketchSources(document,sources);assert.ok(Math.abs(moved.path.at(-1).y-.254*inch)<1e-10,'editing one interior pitch adds .01 inch to integrated height');
  assert.ok(Math.abs(document.referenceGeometry[0].height-.254*inch)<1e-10);
  feature.params.pitchMode='constant';feature.params.pitch=.021*inch;feature.params.turns=6;
  synchronizeSketchHelices(document);
  assert.equal(document.referenceGeometry[0].pitchMode,'constant');assert.deepEqual(document.referenceGeometry[0].pitchRegions,[]);
  assert.ok(Math.abs(resolveSketchSources(document,sources).path.at(-1).y-.126*inch)<1e-10,'switching back to constant pitch must clear the old variable projection');
});
