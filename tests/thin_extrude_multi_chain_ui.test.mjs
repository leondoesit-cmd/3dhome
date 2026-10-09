import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {thinExtrudeAreas,thinExtrudeChainKey} from '../js/modeler_thin_extrude_profiles.js';
import {analyzeSketchChains,healSketchEndpoints} from '../js/sketch_profiles.js';
import {featureDefaults} from '../js/core/feature_catalog.js';
import {createFeatureDefinition,createPartDocument} from '../js/core/parametric_document.js';
import {createHistory} from '../js/edit_history.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {canonicalFeatureTopologyReferences} from '../js/core/feature_input_stage.js';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function sketch(){return {id:'guides',plane:'top',offset:.5,points:[{id:'a',x:.5,y:-1},{id:'b',x:2.5,y:-1},{id:'c',x:.5,y:1},{id:'d',x:2.5,y:1}],entities:[{id:'lower',type:'line',a:'a',b:'b'},{id:'upper',type:'line',a:'c',b:'d'}],constraints:[]};}
const params={thinFeature:true,thickness:.3,thinMode:'forward',thinChainModes:{lower:'reverse',upper:'forward'}};
const load=(name,context)=>new Function(...Object.keys(context),sourceFunctionText(source,name)+';return '+name+';')(...Object.values(context));

test('independent Thin Extrude chains retain explicit sides, selected subsets and legacy single-chain geometry',()=>{
 const s=sketch(),areas=thinExtrudeAreas(s,params);
 assert.equal(areas.length,2);assert.deepEqual(areas.map(a=>a.entityIds),[['lower'],['upper']]);
 assert.equal(Math.min(...areas[0].points.map(p=>p.v)),-1.3);assert.equal(Math.max(...areas[1].points.map(p=>p.v)),1.3);
 assert.equal(thinExtrudeAreas(s,params,{selectedIds:['upper']}).length,1);
 assert.equal(thinExtrudeAreas(s,params,{chainKeys:['lower']})[0].thinMode,'reverse');
 const single={...s,entities:s.entities.slice(0,1)};assert.deepEqual(thinExtrudeAreas(single,params),areas.slice(0,1));
 assert.throws(()=>thinExtrudeAreas(s,params,{chainKeys:['missing']}),/Select an open/);
 assert.throws(()=>thinExtrudeAreas(s,{...params,thinChainModes:{upper:'invalid'}}),/Unsupported/);
 assert.equal(thinExtrudeChainKey(['z','a']),'a|z');
});

test('actual multi-chain form initializes explicit selection and preserves side overrides across toggles',()=>{
 const nodes=[],s=sketch(),state={params:{...params,thinChainModes:{}}};let previews=0;
 const el=(tag,cls='',text='')=>{const n={tag,cls,text,children:[],listeners:{},attrs:{},appendChild(child){this.children.push(child);},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,v){this.listeners[k]=v;}};nodes.push(n);return n;};
 const E={def:{},sselAuto:false};
 const context={E,ensureSketch:()=>s,analyzeSketchChains,selEntities:()=>[s.entities[0]],thinExtrudeChainKey,el,btn:(label,callback,cls)=>{const n=el('button',cls,label);n.listeners.click=callback;return n;},t:k=>k,document:{createElement:tag=>el(tag)},queueNewFeaturePreview:()=>previews++};
 load('addThinExtrudeChainChoices',context)(el('div'),'extrude',state,{},[]);
 assert.deepEqual(state.thinChainKeys,['lower']);
 const sides=nodes.filter(n=>n.tag==='select');sides[0].value='reverse';sides[0].listeners.change();
 nodes.find(n=>n.tag==='button'&&n.text==='featureAllContours').listeners.click();assert.deepEqual(state.thinChainKeys,[]);
 assert.equal(state.params.thinChainModes.lower,'reverse');assert.equal(previews,2);
 const rows=nodes.filter(n=>n.tag==='button'&&n.text.startsWith('thinChain '));rows[1].listeners.click();assert.deepEqual(state.thinChainKeys,['upper']);assert.equal(state.params.thinChainModes.lower,'reverse');
});

test('actual Add command merges both thin chains through current body heads, one Undo, and cold native rebuild',async()=>{
 const document=createPartDocument({id:'multi-thin'}),s=sketch();document.sketches=[s];document.activeSketch=s.id;
 const base=createFeatureDefinition(document,'box',{params:{x:0,y:0,z:-2,w:3,h:.5,d:4}});
 const host={id:'body',kind:'box',featureId:base.id};document.parts=[host];
 const E={def:document,depth:2,baseOff:0,sselAuto:true,authoring:{}};let pushes=0,rebuilds=0;
 const H=createHistory({get:()=>JSON.stringify(E.def),set:value=>{E.def=JSON.parse(value);}});H.clear();
 const noop=()=>{},context={E,featureDefaults,sketchProfileAnalysis:()=>({branchPoints:[],openEnds:[],tolerance:1e-6}),ensureSketch:()=>s,selEntities:()=>[],thinExtrudeAreas,
  selectedSolid:()=>host,activeParts:()=>document.parts,isUpToFace:()=>false,planeAxis:()=> 'y',resolveExtrudeExtent:p=>p,
  flash:noop,t:k=>k,pushUndo:label=>{pushes++;H.push(label);},healSketchEndpoints,recordSketchInHistory:noop,isCanonicalAuthoring:()=>true,createFeatureDefinition,cloneData:structuredClone,uid:()=> 'projection',
  partBounds:()=>({}),mergeTargetBody:()=>host,H,invalidatePartMeshAfterEdit:noop,refreshAll:noop,regenerateExactModel:async()=>rebuilds++,featureTypeLabel:k=>k,historyEntryRolled:()=>false};
 context.extrusionSketchAreas=load('extrusionSketchAreas',context);context.cutTargetFeatureId=load('cutTargetFeatureId',context);
 assert.equal(await load('extrudeClosedSketch',context)({type:'extrude',...params,depth:2}),true);
 assert.equal(pushes,1);assert.equal(rebuilds,1);assert.equal(document.parts.length,1);assert.equal(document.features.length,3);assert.equal(host.merges3d.length,2);
 const first=document.features[1],second=document.features[2];assert.deepEqual(first.inputs,[base.id]);assert.deepEqual(second.inputs,[first.id]);assert.equal(first.params.thinMode,'reverse');assert.equal(second.params.thinMode,'forward');assert.equal(first.params.thinChainModes,undefined);
 const cold=JSON.parse(JSON.stringify(document)),compiled=compileKernelFeatureTree(cold);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});try{assert.equal(run.ok,true,JSON.stringify(run.issues));assert.ok(Math.abs((await shapeMassProperties(run.finalShape)).volume-8.4)<1e-7);}finally{releaseRegeneration(run);}
 H.undo();assert.equal(E.def.features.length,1);assert.equal(E.def.parts[0].merges3d,undefined);H.redo();assert.equal(E.def.features.length,3);
});

test('actual Cut command serializes both chain references and independent sides into one cold native feature',async()=>{
 const document=createPartDocument({id:'multi-thin-cut'}),s=sketch();s.offset=0;document.sketches=[s];document.activeSketch=s.id;
 const base=createFeatureDefinition(document,'box',{params:{x:0,y:0,z:-2,w:3,h:3,d:4}}),host={id:'body',kind:'box',featureId:base.id};document.parts=[host];
 const E={def:document,depth:3,baseOff:0,sselAuto:true,authoring:{}};let pushes=0;const projected=[];
 const noop=()=>{},context={E,featureDefaults,sketchProfileAnalysis:()=>({branchPoints:[],openEnds:[],tolerance:1e-6}),ensureSketch:()=>s,selEntities:()=>[],thinExtrudeAreas,
  selectedSolid:()=>host,activeParts:()=>document.parts,isUpToFace:()=>false,planeAxis:()=> 'y',resolveExtrudeExtent:p=>p,cutTargetFeatureId:()=>base.id,
  flash:noop,t:k=>k,pushUndo:()=>pushes++,healSketchEndpoints,recordSketchInHistory:noop,isCanonicalAuthoring:()=>true,createFeatureDefinition,cloneData:structuredClone,authoritativeFinishTopology:()=>[],partBounds:()=>({}),aabbFromBox:()=>null,
  applyCut:async(points,id)=>{projected.push({points,id});return 1;},H:{discard:noop},refreshAll:noop,cutSkipNote:()=>''};
 context.extrusionSketchAreas=load('extrusionSketchAreas',context);
 assert.equal(await load('extrudeClosedSketch',context)({type:'extrudeCut',...params,depth:3}),true);
 assert.equal(pushes,1);assert.equal(document.features.length,2);const cut=document.features[1];
 assert.deepEqual(cut.params.profileEntityIds,['lower']);assert.deepEqual(cut.params.regionProfileEntityIds,[['upper']]);assert.equal(cut.params.thinMode,'reverse');assert.deepEqual(cut.params.thinRegionModes,['forward']);assert.equal(cut.params.thinChainModes,undefined);
 assert.equal(projected.length,2);assert.ok(projected.every(item=>item.id===cut.id));
 const cold=JSON.parse(JSON.stringify(document)),compiled=compileKernelFeatureTree(cold);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});try{assert.equal(run.ok,true,JSON.stringify(run.issues));assert.ok(Math.abs((await shapeMassProperties(run.finalShape)).volume-32.4)<1e-7);}finally{releaseRegeneration(run);}
});

test('actual creation canonicalizes a viewport-generated terminating face at the persistence boundary',async()=>{
 const document=createPartDocument({id:'terminating-owner'}),s=sketch();s.entities=s.entities.slice(0,1);document.sketches=[s];document.activeSketch=s.id;
 const base=createFeatureDefinition(document,'box',{id:'feature_munnngt6_2',params:{x:0,y:0,z:-2,w:3,h:3,d:4}}),host={id:'body',kind:'box',featureId:base.id};document.parts=[host];
 const face={type:'topology-reference',kind:'face',ownerFeatureId:base.id+':tool',persistentId:base.id+':tool:face:end',descriptor:{surface:'plane',origin:{x:3.383529869379736,y:3.7674542700022977,z:0},normal:{x:-.8660254037844385,y:-.5,z:0}}};
 const E={def:document,depth:2,baseOff:0,sselAuto:true,authoring:{},topologySelection:[face]},before=JSON.stringify(base),originalFace=JSON.stringify(face);let captured=null;
 const noop=()=>{},context={E,featureDefaults,sketchProfileAnalysis:()=>({branchPoints:[],openEnds:[],tolerance:1e-6}),ensureSketch:()=>s,selEntities:()=>[],thinExtrudeAreas,canonicalFeatureTopologyReferences,
  selectedSolid:()=>host,activeParts:()=>document.parts,isUpToFace:()=>true,planeAxis:()=> 'y',resolveExtrudeExtent:(p,options)=>{captured=options.endFace;return p;},
  flash:noop,t:k=>k,pushUndo:noop,healSketchEndpoints,recordSketchInHistory:noop,isCanonicalAuthoring:()=>true,createFeatureDefinition,cloneData:structuredClone,uid:()=> 'projection',
  partBounds:()=>({}),mergeTargetBody:()=>host,H:{discard:noop},invalidatePartMeshAfterEdit:noop,refreshAll:noop,regenerateExactModel:async()=>{},featureTypeLabel:k=>k,historyEntryRolled:()=>false,authoritativeFinishTopology:()=>[],aabbFromBox:()=>null};
 context.extrusionSketchAreas=load('extrusionSketchAreas',context);context.cutTargetFeatureId=load('cutTargetFeatureId',context);
 assert.equal(await load('extrudeClosedSketch',context)({type:'extrude',...params,depth:2,endCondition:'up-to-face'}),true);
 const feature=document.features[1];assert.equal(captured.ownerFeatureId,base.id);assert.equal(feature.params.endFace.ownerFeatureId,base.id);assert.equal(feature.references.topology[0].ownerFeatureId,base.id);assert.equal(feature.params.endFace.persistentId,face.persistentId);
 assert.equal(JSON.stringify(base),before);assert.equal(JSON.stringify(face),originalFace);assert.deepEqual(feature.params.endFace.descriptor,face.descriptor);
 const compiled=compileKernelFeatureTree(JSON.parse(JSON.stringify(document)));assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
});

