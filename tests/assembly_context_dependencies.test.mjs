import test from "node:test";
import assert from "node:assert/strict";
import {solveAssemblyMates} from "../js/cad_mate_solver.js";
import {formSubassembly} from "../js/core/assembly_form_subassembly.js";
import {setTopologyMateValue} from "../js/cad_mate_value_controls.js";

const part=(id,x=0,grounded=false)=>({id,grounded,transform:{x},def:{parts:[]}});
const group=(id,components,x=0)=>({...part(id,x),kind:"assembly",asm:{components,mates:[],topologyMates:[]}});
const align=(id,a,b)=>({id,a,b,type:"alignX"});
const lock=(id,a,b)=>({id,type:"lock",a:{componentId:a,kind:"body"},b:{componentId:b,kind:"body"}});
function vanity(){
  const stem=part("stem",2,true),faucet=group("faucet",[stem],10);
  const sleeve=part("sleeve",12,true),pipe=part("pipe",12),anchor=part("anchor",10,true);
  sleeve.inContext={parentId:"faucet",occurrencePath:["faucet","stem"],reference:{componentId:"stem",persistentId:"plane:right"}};
  const assembly={components:[pipe,sleeve,faucet,anchor],mates:[align("pipe connection","sleeve","pipe"),align("faucet mounting","anchor","faucet")]};
  return {assembly,stem,faucet,sleeve,pipe,anchor};
}
test("one native solve places a mate-driven faucet, then its contextual sleeve, then the connected pipe",()=>{
  const {assembly,sleeve,pipe,anchor,faucet}=vanity();
  const right=componentId=>({componentId,persistentId:"plane:right",kind:"face"});
  assembly.mates=assembly.mates.filter(m=>m.id==="faucet mounting");
  assembly.topologyMates=[{id:"pipe connection",type:"coincident",aligned:true,a:right("sleeve"),b:right("pipe")}];
  anchor.transform.x=13;
  const result=solveAssemblyMates(assembly);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(faucet.transform.x,13);
  assert.equal(sleeve.transform.x,15);
  assert.ok(Math.abs(pipe.transform.x-15)<1e-7);
  assert.deepEqual(result.unsatisfied,[]);
});

test("feedback from a mated pipe to its own support reports a cycle before moving either",()=>{
  const {assembly,sleeve,pipe,faucet}=vanity();
  assembly.mates=[align("pipe connection","sleeve","pipe"),align("feedback","pipe","faucet")];
  const result=solveAssemblyMates(assembly);
  assert.equal(result.ok,false);
  assert.equal(result.settled,false);
  assert.deepEqual(result.issues.find(i=>i.code==="context-reference").componentPath,["sleeve"]);
  assert.match(sleeve.contextIssue,/Cyclic/);
  assert.equal(pipe.transform.x,12);
  assert.equal(faucet.transform.x,10);
});

test("nested broken links with duplicate leaf IDs have distinct paths, including on cold reopen",()=>{
  const groups=["left","right"].map(id=>{
    const {assembly}=vanity();
    assembly.components.find(c=>c.id==="faucet").asm.components=[];
    return {...group(id,assembly.components),asm:assembly};
  });
  const cold=JSON.parse(JSON.stringify({components:groups}));
  const result=solveAssemblyMates(cold);
  const issues=result.issues.filter(i=>i.code==="context-reference");
  assert.equal(result.ok,false);
  assert.deepEqual(issues.map(i=>i.componentPath),[["left","sleeve"],["right","sleeve"]]);
  assert.equal(new Set(issues.map(i=>i.component)).size,2);
  for(const g of cold.components)assert.match(g.asm.components.find(c=>c.id==="sleeve").contextIssue,/occurrence/);
});

test("a saved reference into a pattern-generated occurrence cannot publish a stale pose",()=>{
  const {assembly,faucet,sleeve,pipe}=vanity();
  faucet.componentPattern={id:"generated"};
  const result=solveAssemblyMates(assembly);
  assert.equal(result.ok,false);
  assert.match(sleeve.contextIssue,/Pattern-generated/);
  assert.equal(pipe.transform.x,12);
});

test("forming a rigid group migrates an external nested face path; grouping a sleeve without its support is atomic",()=>{
  const {assembly,faucet,anchor}=vanity();
  assembly.mates=assembly.mates.filter(m=>m.id==="pipe connection");
  assembly.topologyMates=[lock("mount",anchor.id,faucet.id)];
  assert.ok(solveAssemblyMates(assembly).ok);
  const fields={id:"group",key:"group-doc",name:"Group"};
  const formed=formSubassembly(assembly,["faucet","anchor"],fields);
  assert.ok(formed.ok,JSON.stringify(formed));
  const cold=JSON.parse(JSON.stringify(assembly));
  const sleeve=cold.components.find(c=>c.id==="sleeve");
  assert.deepEqual(sleeve.inContext.occurrencePath,["group","faucet","stem"]);
  assert.equal(sleeve.inContext.parentId,"group");
  cold.components.find(c=>c.id==="group").transform.x=3;
  assert.ok(solveAssemblyMates(cold).ok);
  assert.equal(sleeve.transform.x,15);
  assert.equal(cold.components.find(c=>c.id==="pipe").transform.x,15);
  const before=JSON.stringify(cold);
  const r=formSubassembly(cold,["sleeve","pipe"],{...fields,id:"other"},()=>assert.fail("unexpected undo"));
  assert.equal(r.issues[0].code,"unsupported-subassembly-context-reference");
  assert.equal(JSON.stringify(cold),before);
});

test("a failed mate edit does not leak nested context poses or diagnostics from its trial",()=>{
  const {assembly}=vanity();
  const outer={components:[{...group("Nested",assembly.components),asm:assembly}],
    topologyMates:[{id:"broken",type:"distance",a:{componentId:"missing"},b:{componentId:"Nested"},value:1}]};
  assembly.components.find(c=>c.id==="anchor").transform.x=30;
  const before=JSON.stringify(outer);
  assert.equal(setTopologyMateValue(outer,"broken",2,()=>assert.fail("unexpected undo")).ok,false);
  assert.equal(JSON.stringify(outer),before);
});

function matedStem() {
  const f=vanity();
  const seat=part("seat",0,true);
  seat.topology=[{persistentId:"seat-end",kind:"face",descriptor:{surface:"plane",origin:{x:2,y:0,z:0},normal:{x:1,y:0,z:0}}}];
  delete seat.def;
  f.stem.grounded=false;
  f.faucet.asm.components.push(seat);
  f.faucet.asm.topologyMates=[{id:"stem-seat",type:"coincident",aligned:true,
    a:{componentId:"seat",persistentId:"seat-end",kind:"face"},b:{componentId:"stem",persistentId:"plane:right",kind:"face"}}];
  return {...f,seat};
}

test("an external sleeve follows a face-driven internal stem on the first solve and after reopen",()=>{
  const {assembly,stem,seat,sleeve,pipe}=matedStem();
  assert.ok(solveAssemblyMates(assembly).ok);
  seat.topology[0].descriptor.origin.x=5;
  assert.ok(solveAssemblyMates(assembly).ok);
  assert.ok(Math.abs(stem.transform.x-5)<1e-7);
  assert.ok(Math.abs(sleeve.transform.x-15)<1e-7);
  assert.ok(Math.abs(pipe.transform.x-15)<1e-7);
  const cold=JSON.parse(JSON.stringify(assembly));
  assert.ok(solveAssemblyMates(cold).ok);
  assert.ok(Math.abs(cold.components.find(c=>c.id==="sleeve").transform.x-15)<1e-7);
});

test("grounded faucet, contextual sleeve and locked pipe form a rigid group and keep their local links",()=>{
  const {assembly,faucet}=matedStem();
  assembly.components=assembly.components.filter(c=>c.id!=="anchor");
  faucet.grounded=true;
  assembly.mates=[];
  assembly.topologyMates=[lock("pipe lock","sleeve","pipe")];
  assert.ok(solveAssemblyMates(assembly).ok);
  let undo=0;
  const result=formSubassembly(assembly,["faucet","sleeve","pipe"],{id:"group",key:"g",name:"Vanity group"},()=>undo++);
  assert.ok(result.ok,JSON.stringify(result.issues));
  assert.equal(undo,1);
  const cold=JSON.parse(JSON.stringify(assembly));
  const owner=cold.components[0].asm;
  const source=owner.components.find(c=>c.id==="faucet");
  source.asm.components.find(c=>c.id==="seat").topology[0].descriptor.origin.x=5;
  assert.ok(solveAssemblyMates(cold).ok);
  assert.deepEqual(owner.components.find(c=>c.id==="sleeve").inContext.occurrencePath,["faucet","stem"]);
  assert.ok(Math.abs(owner.components.find(c=>c.id==="pipe").transform.x-15)<1e-7);
});

test("a failed external mate trial isolates the source assembly; an unrelated rigid occurrence stays closed",()=>{
  const {assembly,seat,stem}=matedStem();
  seat.topology[0].descriptor.origin.x=5;
  const unused=group("other",[part("fixed",0,true)]);
  unused.asm.mates=[align("unrelated","missing","fixed")];
  assembly.components.push(unused);
  assembly.topologyMates=[{id:"bad",type:"distance",a:{componentId:"missing"},b:{componentId:"pipe"},value:1}];
  const before=JSON.stringify(assembly);
  assert.equal(setTopologyMateValue(assembly,"bad",2,()=>assert.fail("unexpected undo")).ok,false);
  assert.equal(JSON.stringify(assembly),before);
  assembly.topologyMates=[];
  assert.ok(solveAssemblyMates(assembly).ok);
  assert.ok(Math.abs(stem.transform.x-5)<1e-7);
  assert.deepEqual(unused.asm.components[0].transform,{x:0});
});

test("invalid internal source mates block the external sleeve and pipe across reopen",()=>{
  const {assembly,faucet}=matedStem();
  faucet.asm.topologyMates[0].a.componentId="missing";
  const cold=JSON.parse(JSON.stringify(assembly));
  const result=solveAssemblyMates(cold);
  assert.equal(result.ok,false);
  assert.ok(result.issues.some(i=>i.mate==="stem-seat" && i.componentPath[0]==="faucet"));
  assert.match(cold.components.find(c=>c.id==="sleeve").contextIssue,/Invalid parent context/);
  assert.equal(cold.components.find(c=>c.id==="pipe").transform.x,12);
});

test("a movable support reads an internally mated face on a sibling, and blocks if that source fails",()=>{
  const {assembly,seat,sleeve,anchor,faucet,pipe}=matedStem();
  anchor.grounded=false;
  faucet.grounded=true;
  assembly.mates=[align("pipe connection","sleeve","pipe")];
  assembly.topologyMates=[{id:"mount",type:"coincident",aligned:true,
    a:{componentId:"faucet",kind:"face",persistentId:"stem/plane:right"},
    b:{componentId:"anchor",kind:"face",persistentId:"plane:right"}}];
  sleeve.inContext={parentId:"anchor",reference:{componentId:"anchor",persistentId:"plane:right"}};
  seat.topology[0].descriptor.origin.x=5;
  assert.ok(solveAssemblyMates(assembly).ok);
  for(const body of [anchor,sleeve,pipe])assert.ok(Math.abs(body.transform.x-15)<1e-7);
  faucet.asm.topologyMates[0].a.componentId="missing";
  anchor.transform.x=20;
  assert.equal(solveAssemblyMates(assembly).ok,false);
  assert.match(sleeve.contextIssue,/Invalid parent context/);
  assert.ok(Math.abs(pipe.transform.x-15)<1e-7);
});

test("context connectivity cannot conceal a free support or a feedback cycle when grouping",()=>{
  for(const cycle of [false,true]){
    const {assembly}=vanity();
    assembly.mates=[];
    assembly.topologyMates=[lock("pipe lock","sleeve","pipe")];
    if(cycle)assembly.mates.push(align("feedback","pipe","faucet"));
    // The independent grounded anchor must not make the free faucet rigid.
    assembly.components.push({...part("cap",10,true),inContext:{parentId:"anchor",reference:{componentId:"anchor",persistentId:"plane:right"}}});
    const before=JSON.stringify(assembly);
    const result=formSubassembly(assembly,assembly.components.map(c=>c.id),{id:"g",key:"group",name:"Group"},()=>assert.fail("unexpected undo"));
    assert.equal(result.ok,false);
    if(cycle)assert.ok(result.issues.some(i=>/Cyclic/.test(i.message)));
    assert.equal(JSON.stringify(assembly),before);
  }
});
