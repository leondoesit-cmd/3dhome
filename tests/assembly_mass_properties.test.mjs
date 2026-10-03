import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateAssemblyMassProperties} from '../js/cad_assembly_mass_properties.js';
import {buildCommandCatalog,commandUnavailableReason} from '../js/modeler_commands.js';
import {makeBrepPrimitive,shapeMassProperties,placedBrepBounds,disposeBrep} from '../js/cad_kernel.js';

const near=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);

test('rotated native cylinder bounds follow the placed surface, while source mass is measured once',async()=>{
  const def={key:'wheel',parts:[{id:'wheel-body',density:7.7}]};
  const assembly={components:[{id:'a',def,transform:{rz:22.5}},{id:'b',def:structuredClone(def),transform:{x:10,rz:-22.5}}]};
  let evaluations=0,placements=0,releases=0;
  const mass=await evaluateAssemblyMassProperties(assembly,{evaluateDefinition:async()=>{
    evaluations++;
    const solid=await makeBrepPrimitive({type:'cylinder',axis:'z',r:3.3,h:1.2});
    const props=await shapeMassProperties(solid);
    return {bodies:[{partId:'wheel-body',accuracy:'exact',...props,density:7.7,massKg:props.volume*7.7/1000}],
      boundsAtPlacement:async(_row,p)=>{placements++;return placedBrepBounds(solid,{matrix:[p.x.x,p.y.x,p.z.x,p.x.y,p.y.y,p.z.y,p.x.z,p.y.z,p.z.z],translation:p.origin});},
      release:()=>{releases++;disposeBrep(solid);}};
  }});
  assert.equal(evaluations,1);assert.equal(placements,2);assert.equal(releases,1);
  near(mass.bounds.min.x,-3.3,1e-6);near(mass.bounds.max.x,13.3,1e-6);
  near(mass.bounds.min.y,-3.3,1e-6);near(mass.bounds.max.y,3.3,1e-6);
  near(mass.volumeCm3,2*Math.PI*3.3**2*1.2,1e-6);
});

test('placed bounds failure releases every retained source without publishing misleading bounds',async()=>{
  let released=0;
  const def={key:'same',parts:[]};
  await assert.rejects(evaluateAssemblyMassProperties({components:[{id:1,def,transform:{}}]}, {
    evaluateDefinition:async()=>({bodies:[{accuracy:'exact',volume:1}],boundsAtPlacement:async()=>{throw new Error('Placement failed');},release:()=>released++}),
  }),/Placement failed/);
  assert.equal(released,1);
});

test('assembly mass places native part centres, tensors and bounds and measures identical definitions once',async()=>{
  const def={key:'bar',parts:[{id:'solid',density:7.85}]};
  const assembly={components:[
    {id:'one',name:'Bar 1',visible:true,def,transform:{x:0,y:0,z:0}},
    {id:'two',name:'Bar 2',visible:true,def:structuredClone(def),transform:{x:10,y:0,z:0,ry:90}},
    {id:'hidden',name:'Hidden',visible:false,def,transform:{x:100}},
  ]};
  let evaluations=0;
  const mass=await evaluateAssemblyMassProperties(assembly,{evaluateDefinition:async()=>{
    evaluations++;
    return {bodies:[{partId:'solid',accuracy:'exact',volume:2,massKg:.0157,density:7.85,
      centerOfMass:{x:1,y:0,z:0},inertia:[[2,0,0],[0,3,0],[0,0,4]],
      bounds:{min:{x:0,y:0,z:0},max:{x:2,y:1,z:1}}}]};
  }});
  assert.equal(evaluations,1);
  assert.equal(mass.bodies.length,2);
  assert.equal(mass.accuracy,'exact');
  near(mass.volumeCm3,4);near(mass.massKg,.0314);
  near(mass.centerOfMass.x,5.5);near(mass.centerOfMass.y,0);near(mass.centerOfMass.z,-.5);
  near(mass.bounds.min.x,0);near(mass.bounds.max.x,11);
  near(mass.bounds.min.z,-2);near(mass.bounds.max.z,1);
  near(mass.inertiaKgM2[0][0],7*7.85e-7);
  near(mass.inertiaKgM2[1][1],88*7.85e-7);
  near(mass.inertiaKgM2[2][2],87*7.85e-7);
  near(mass.inertiaKgM2[0][2],9*7.85e-7);
});

test('fresh Drill Guide 17 placements aggregate nine measured source definitions',async()=>{
  const bundle=JSON.parse(readFileSync(new URL('../artifacts/planchard/DG-assembly-physical-mates-browser-2026-10-03.mforge',import.meta.url),'utf8'));
  const perPart=new Map([
    ['cm_mus2lpus',318.4292144422],['cm_mus317rg',231.7565964346],['cm_mus3ugoe',105.4029468021],
    ['cm_mus3yqgy',213.8306705436],['cm_mus454h8',7.8022125859],['cm_mus48g1p',15.4093513676],
    ['cm_mus4erzs',.3447398473],['cm_mus4kdou',77.8317013556],['cm_mus4o9iq',4.04360232235],
  ]);
  let evaluations=0;
  const mass=await evaluateAssemblyMassProperties(bundle.assemblies[0],{evaluateDefinition:async def=>{
    evaluations++;
    const massKg=perPart.get(def.key)/1000,density=def.parts[0].density;
    return {bodies:[{partId:def.parts[0].id,accuracy:'exact',volume:massKg*1000/density,massKg,density,
      centerOfMass:{x:0,y:0,z:0},inertia:[[0,0,0],[0,0,0],[0,0,0]],
      bounds:{min:{x:0,y:0,z:0},max:{x:0,y:0,z:0}}}]};
  }});
  assert.equal(evaluations,9);
  assert.equal(mass.bodies.length,17);
  near(mass.massG,1347.6976897058,1e-7);
  assert.equal(mass.density,null,'mixed materials must not acquire a fictitious common density');
});

test('Mass Properties command is available for a populated assembly and keeps its part gate',()=>{
  const editor={docType:'assembly',assembly:{components:[]},def:{parts:[]}};
  const catalog=()=>buildCommandCatalog({t:key=>key,editor,closedSketchProfile:()=>null,activeParts:def=>def.parts||[]});
  assert.equal(commandUnavailableReason('mass',catalog(),'fallback'),'cmdNeedOneComponent');
  editor.assembly.components.push({id:'part'});
  assert.equal(commandUnavailableReason('mass',catalog(),'fallback'),'');
  editor.docType='part';
  assert.equal(commandUnavailableReason('mass',catalog(),'fallback'),'cmdNeedSolid');
  editor.def.parts.push({id:'solid'});
  assert.equal(commandUnavailableReason('mass',catalog(),'fallback'),'');
});
