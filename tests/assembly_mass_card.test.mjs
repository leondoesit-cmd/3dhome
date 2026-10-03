import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('assembly Mass Properties opens native aggregate values and invalidates when the assembly changes',async()=>{
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const start=source.indexOf('var massDisplayUnits = "si";'),end=source.indexOf('\n/* ---- Measure ----',start);
  assert.ok(start>=0&&end>start);
  let history=1,calls=0;
  const E={docType:'assembly',def:{parts:[]},assembly:{key:'assembly',components:[{id:'one'}]},evalCard:null};
  const body={isConnected:true,rows:[],children:[],appendChild(item){this.children.push(item);},set textContent(value){this.rows=[];this.children=[];this.text=value;}};
  const mass={accuracy:'exact',volumeCm3:4,massKg:.0314,density:null,
    bounds:{min:{x:0,y:0,z:0},max:{x:11,y:1,z:1}},centerOfMass:{x:5.5,y:0,z:-.5},
    bodies:[{componentName:'Bar 1',materialName:'Steel',volume:2,massKg:.0157,density:7.85}]};
  const context={E,Map,Math,Number,cloneData:structuredClone,activeParts:def=>def.parts||[],componentDef:()=>null,
    currentHistoryNode:()=>history,t:key=>key,
    openEvalCard:owner=>{E.evalCard=owner;body.textContent='';return body;},
    el:()=>({children:[],appendChild(item){this.children.push(item);},setAttribute(){}}),
    btn:(label,action)=>({label,action,setAttribute(){}}),
    massDisplaySystem:()=>({mass:1,volume:1,density:1,length:1,massUnit:'kg',volumeUnit:'cm3',densityUnit:'g/cm3',lengthUnit:'cm'}),
    evalRow:(_body,label,value)=>body.rows.push({label,value}),
    evaluateAssemblyMassProperties:async snapshot=>{calls++;assert.equal(snapshot.components.length,1);return mass;},
    evaluateMassProperties:()=>{throw new Error('assembly must not measure the inactive part document');},
  };
  runInNewContext(source.slice(start,end)+'\nthis.show=showMassProperties;this.sync=syncMassPropertiesEvaluation;',context);
  await context.show();
  assert.equal(calls,1);
  assert.ok(body.rows.some(row=>row.label==='massMass'&&row.value.includes('.0314')));
  assert.ok(body.rows.some(row=>row.label==='massCentre'&&row.value.includes('5.5')));
  assert.ok(body.rows.some(row=>row.label.includes('Bar 1 · Steel')));
  E.assembly=structuredClone(E.assembly);history++;
  context.sync();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,2,'a different assembly document recomputes instead of showing stale mass');
});
