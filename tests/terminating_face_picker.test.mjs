import { modelerSource } from "./helpers/modeler_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {planarMateFaceChoices} from '../js/cad_mate_reference_choices.js';
import {createTopologyReference} from '../js/core/topology.js';
import {isUpToFace,resolveExtrudeExtent} from '../js/core/extrude_extent.js';
import {canonicalFeatureTopologyReferences} from '../js/core/feature_input_stage.js';

function node(tag){return {tag,children:[],listeners:{},attributes:{},value:'',appendChild(child){this.children.push(child);return child;},setAttribute(key,value){this.attributes[key]=value;},addEventListener(key,handler){this.listeners[key]=handler;}};}
function plane(id,owner,x){return {persistentId:id,ownerFeatureId:owner,kind:'face',semantic:id,descriptor:{surface:'plane',origin:{x,y:0,z:0},normal:{x:1,y:0,z:0}}};}
function fixture(type='extrude',unit='cm',actualTarget=null){
  const source=modelerSource();
  const code=sourceFunctionText(source,'addTerminatingFaceChoices');
  const target=actualTarget || plane('inner-wall','shell:cut:cavity',11.6),outside=plane('outer-wall','shell',12),suppressed=plane('suppressed-face','suppressed',13),future=plane('future-face','future',14);
  const E={def:{activeSketch:'boss-profile',features:[{id:'shell',name:'Cavity shell'},{id:'suppressed',suppressed:true},{id:'future'}],history:[{targetId:'shell'},{targetId:'suppressed',suppressed:true},{targetId:'future'}],parts:[{entries:[target,outside,suppressed,future]}]},topologySelection:[],collectingFeature:true};
  if(actualTarget)E.def.features.push({id:actualTarget.ownerFeatureId.replace(/:tool$/, ''),name:'Extrude / Boss 2',params:{endCondition:'blind'}});
  const host=node('div'),control=node('select'),state={params:{endCondition:'blind'}},calls=[];
  const context={E,Set,document:{createElement:node},el:(tag,cls,label)=>Object.assign(node(tag),{textContent:label}),t:key=>key,
    activeParts:doc=>doc.parts,topologyEntriesForPart:part=>part.entries,historyEntryRolled:(_doc,index)=>index===2,
    planarMateFaceChoices,modelLengthUnit:()=>unit,isUpToFace,canonicalFeatureTopologyReferences,topologyReferenceFromEntry:entry=>createTopologyReference(entry.ownerFeatureId,entry.kind,entry.persistentId,entry.descriptor),
    syncActiveFeatureSelectionFeedback:()=>state.syncTerminatingFace(),queueNewFeaturePreview:(...args)=>calls.push(args)};
  runInNewContext(code+'\nthis.add=addTerminatingFaceChoices;',context);
  const row=context.add(host,type,state,'badge',[{field:{key:'endCondition'},input:control}]);
  return {context,E,host,row,state,control,calls,target,select:row?.children[1]};
}

test('both extrusion commands expose exact hidden wall choices only for Up To Surface, excluding suppressed and rolled faces',()=>{
  for(const type of ['extrude','extrudeCut']){
    const f=fixture(type);
    assert.equal(f.row.hidden,true);assert.equal(f.select.attributes['aria-label'],'terminatingFace');
    assert.deepEqual(Array.from(f.select.children,option=>option.value),['','inner-wall','outer-wall']);
    assert.match(f.select.children[1].textContent,/Cavity shell.*X 11\.600 cm/);
    f.state.params.endCondition='up-to-surface';f.control.listeners.change();assert.equal(f.row.hidden,false);
    f.state.params.endCondition='blind';f.control.listeners.change();assert.equal(f.row.hidden,true);
  }
  assert.equal(fixture('revolve').row,null);
});

test('new extrusion face labels follow document millimetres and inches without rescaling geometry',()=>{
  for(const type of ['extrude','extrudeCut'])for(const [unit,text] of [['mm','X 116.000 mm'],['in','X 4.567 in']]){
    const f=fixture(type,unit);
    assert.ok(f.select.children[1].textContent.includes(text));
    f.select.value='inner-wall';f.select.listeners.change();
    assert.equal(f.E.topologySelection[0].descriptor.origin.x,11.6);
    assert.deepEqual(f.E.topologySelection[0].descriptor,f.target.descriptor);
  }
});

test('selecting the exact X116 wall keeps the active sketch and terminates the X39 extrusion at that plane',()=>{
  const f=fixture();f.state.params.endCondition='up-to-face';f.select.value='inner-wall';f.select.listeners.change();
  assert.equal(f.E.def.activeSketch,'boss-profile');assert.equal(f.E.collectingFeature,false);
  assert.equal(f.E.topologySelection.length,1);const reference=f.E.topologySelection[0];
  assert.equal(reference.persistentId,'inner-wall');assert.equal(reference.ownerFeatureId,'shell');
  assert.deepEqual(reference.descriptor,f.target.descriptor);assert.equal(f.calls.length,1);
  assert.equal(f.calls[0][1],f.state);assert.equal(f.calls[0][2],'badge');
  const restored=JSON.parse(JSON.stringify(reference));
  const extent=resolveExtrudeExtent({endCondition:'up-to-surface',from:0,frame:{origin:{x:3.9,y:0,z:0},normal:{x:1,y:0,z:0},xAxis:{x:0,y:0,z:1},yAxis:{x:0,y:1,z:0}},points:[{u:0,v:0}]},{endFace:restored});
  assert.ok(Math.abs(extent.to-7.7)<1e-9,'39 mm start to 116 mm face gives a 77 mm extent');
});

test('actual Q2 Boss2 generated tool end face keeps its native identity but records the authored owner without altering Boss2',()=>{
  // Reference descriptor copied from ADVANCED-Q2-thin-up-to-face-failed-browser-2026-10-09.mforge.
  const target={ownerFeatureId:'feature_munnngt6_2:tool',persistentId:'feature_munnngt6_2:tool:face:end',kind:'face',semantic:'end',descriptor:{surface:'plane',origin:{x:3.383529869379736,y:3.7674542700022977,z:2.4904609726931543e-17},normal:{x:-.8660254037844385,y:-.5,z:-6.5556157328276255e-18},measure:51.00973668265468,bounds:{min:{x:1.8410766733407455,y:1.2699998499999996,z:-4.44500015},max:{x:4.825435914454344,y:6.439061464031206,z:4.44500015}}}};
  const f=fixture('extrude','in',target),before=JSON.stringify(f.E.def),entryBefore=JSON.stringify(target);
  f.state.params.endCondition='up-to-surface';f.select.value=target.persistentId;f.select.listeners.change();
  const saved=f.E.topologySelection[0];assert.equal(saved.ownerFeatureId,'feature_munnngt6_2');assert.equal(saved.persistentId,target.persistentId);assert.deepEqual(saved.descriptor,target.descriptor);
  assert.equal(JSON.stringify(f.E.def),before);assert.equal(JSON.stringify(target),entryBefore);assert.equal(f.E.def.activeSketch,'boss-profile');
});

test('viewport face changes synchronize the chooser and clearing it removes the terminating reference without modifying sketch intent',()=>{
  const f=fixture('extrudeCut');f.E.topologySelection=[createTopologyReference('shell','face','outer-wall',f.target.descriptor)];
  f.state.syncTerminatingFace();assert.equal(f.select.value,'outer-wall');
  f.select.value='';f.select.listeners.change();assert.equal(f.E.topologySelection.length,0);
  assert.equal(f.E.def.activeSketch,'boss-profile');assert.equal(f.calls.length,1);
});
