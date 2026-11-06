import { modelerSource } from "./helpers/modeler_source.mjs";
import { sourceFunctionText, withSetters } from "./helpers/source_function.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {evaluateMassProperties} from '../js/cad_mass_properties.js';

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
const result=y=>({volumeCm3:2,massKg:.0146,density:7.3,accuracy:'exact',centerOfMass:{x:4.223753,y,z:0},bodies:[]});
function fixture(){
  const source=modelerSource();
  const massCard=withSetters(['var massDisplayUnits = "si";','var massCoordinateSystemId = "";',...['massEvaluationChanged','syncMassPropertiesEvaluation','showMassProperties'].map(name=>sourceFunctionText(source,name))].join('\n'));
  let node=1;const E={def:{parts:[{id:'rib-body'}]},docType:'part',evalCard:null},jobs=[],painted=[],historyCalls=[];
  const body={isConnected:true,rows:[],children:[],appendChild(item){this.children.push(item);},set textContent(value){this.rows=[];this.children=[];this.text=value;}};
  const context={E,Map,Math,Number,H:{push(...args){historyCalls.push(args);}},scheduleModelerDraft(){},currentHistoryNode:()=>node,
    cloneData:structuredClone,activeParts:doc=>doc.parts,t:key=>key,
    openEvalCard:owner=>{E.evalCard=owner;body.textContent='';return body;},
    el:()=>({children:[],appendChild(item){this.children.push(item);},setAttribute(){}}),btn:(label,action)=>({label,action,setAttribute(){}}),
    massDisplaySystem:()=>({mass:1,volume:1,density:1,length:1,massUnit:'kg',volumeUnit:'cm3',densityUnit:'g/cm3',lengthUnit:'cm'}),
    evalRow:(_body,label,value)=>{body.rows.push({label,value});painted.push({label,value});},
    evaluateMassProperties:snapshot=>{const pending=deferred();jobs.push({...pending,snapshot});return pending.promise;}};
  runInNewContext(massCard+'\nthis.show=showMassProperties;this.sync=syncMassPropertiesEvaluation;',context);
  runInNewContext(sourceFunctionText(source,'pushUndo')+'\nthis.push=pushUndo;',context);
  return {context,E,body,jobs,painted,historyCalls,setNode:value=>{node=value;}};
}

test('translating a sketch in the same document immediately replaces old mass values and refreshes the new history node once',async()=>{
  const f=fixture(),first=f.context.show();f.jobs[0].resolve(result(.6256488));await first;
  assert.match(f.body.rows.find(row=>row.label==='massCentre').value,/Y 0\.6256488/);
  f.setNode(2);f.context.sync();assert.equal(f.jobs.length,2);assert.equal(f.body.text,'liveExactCalc');
  assert.equal(f.body.rows.length,0,'old mass/COM must not remain visible during recalculation');
  f.context.sync();f.context.sync();assert.equal(f.jobs.length,2,'render refreshes cannot duplicate the current mass job');
  f.jobs[1].resolve(result(.4567475231));await new Promise(resolve=>setImmediate(resolve));
  assert.match(f.body.rows.find(row=>row.label==='massCentre').value,/Y 0\.4567475/);
});

test('an old async mass calculation cannot overwrite a newer geometry result',async()=>{
  const f=fixture(),old=f.context.show();f.setNode(2);const current=f.context.show();
  f.jobs[1].resolve(result(.4567475231));await current;
  f.jobs[0].resolve(result(.6256488));await old;
  assert.match(f.body.rows.find(row=>row.label==='massCentre').value,/Y 0\.4567475/);
  assert.ok(!f.painted.some(row=>row.label==='massCentre' && /0\.6256488/.test(row.value)));
});

test('coalesced property edits invalidate mass even when the undo node stays the same; a closed card stays closed',async()=>{
  const f=fixture(),first=f.context.show();f.jobs[0].resolve(result(0));await first;
  const scope={parts:['rib-body']};
  f.context.push('Offset','prop:offset',scope);f.context.sync();assert.equal(f.jobs.length,2);
  assert.deepEqual(f.historyCalls,[['Offset','prop:offset',scope]],'the edit scope reaches history');
  assert.equal(f.E.massEvaluation.node,1,'coalescing keeps the same undo node');
  assert.equal(f.E.massEditRevision,1,'the mass revision still advances');
  f.E.evalCard=null;f.jobs[1].resolve(result(3.9));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.E.evalCard,null);assert.ok(!f.painted.some(row=>row.label==='massCentre' && /Y 3\.9/.test(row.value)));
});

test('unit buttons captured by an old card cannot repaint stale mass after document replacement',async()=>{
  const f=fixture(),first=f.context.show();f.jobs[0].resolve(result(.6256488));await first;
  const staleUnitButton=f.body.children[0].children[0];f.E.def=structuredClone(f.E.def);
  staleUnitButton.action();assert.equal(f.jobs.length,2);assert.equal(f.body.text,'liveExactCalc');
  f.jobs[1].resolve(result(.4567475231));await new Promise(resolve=>setImmediate(resolve));
  assert.match(f.body.rows.find(row=>row.label==='massCentre').value,/Y 0\.4567475/);
});

test('actual part Mass card consumes worker-native mass proof without restoring a UI-thread BREP and recomputes density',async()=>{
 const f=fixture(),options=[];let released=0;
 f.E.def.parts[0].density=7.8;f.context.evaluateMassProperties=evaluateMassProperties;
 const proof={verifiedSerializedExact:true,workerMassProperties:{volume:2,centerOfMass:{x:1,y:2,z:3},inertia:[[1,0,0],[0,1,0],[0,0,1]],solidCount:1,bounds:{min:{x:0,y:1,z:2},max:{x:2,y:3,z:4}}}};
 f.context.exactDisplayBody=async(part,snapshot,head,settings)=>{options.push(settings);return {brep:proof,release:()=>released++};};
 await f.context.show();assert.equal(released,1);assert.equal(options[0].massProperties,true);assert.equal(options[0].restoreMode,'mesh');
 assert.ok(f.body.rows.some(row=>row.label==='massMass'&&row.value.includes('0.0156')));
 f.E.def.parts[0].density=4.6;f.setNode(2);await f.context.show();
 assert.equal(released,2);assert.ok(f.body.rows.some(row=>row.label==='massMass'&&row.value.includes('0.0092')));
 assert.ok(f.body.rows.some(row=>row.label==='massCentre'&&row.value.includes('Y 2')));
 assert.equal(proof.shape,undefined,'only verified native worker integrals are needed for part mass');
});
