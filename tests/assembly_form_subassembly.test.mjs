import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {formSubassembly} from '../js/core/assembly_form_subassembly.js';
import {flattenAssembly,resolveComponentPath} from '../js/core/assembly_structure.js';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';
import {setRackPinionMateDrive} from '../js/cad_rack_pinion_controls.js';
import {createMotionStudy,addRackPinionMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {createExplodedView,addExplodeStep,applyExplodedView,explodedOccurrenceOffset,explodeTargets} from '../js/cad_exploded_view.js';
import {generateBOM} from '../js/cad_interference.js';
const fixture=JSON.parse(await readFile(new URL('./fixtures/arbor-press-browser-native-mates.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(fixture),selected=a=>a.components.filter(c=>['AP01','AP02','AP03'].includes(c.def?.customProperties?.PartNo)).map(c=>c.id),fields={id:'column-group',key:'column-group-document',name:'Column / cover / screws'};
test('actual browser native mate fixture forms rigid six-part column without changing 11 leaf poses or definitions',()=>{
 const a=clone(),before=flattenAssembly(a),defs=before.map(l=>JSON.stringify(l.component.def));let undo=0;
 const r=formSubassembly(a,selected(a),fields,()=>undo++);assert.equal(r.ok,true,JSON.stringify(r.issues));assert.equal(undo,1);assert.equal(r.degreesOfFreedom,1);
 assert.equal(a.components.length,6);assert.equal(r.component.grounded,true);assert.equal(r.component.asm.components.length,6);assert.equal(r.component.asm.topologyMates.length,5);assert.equal(a.topologyMates.length,9);
 const after=flattenAssembly(a);assert.equal(after.length,11);
 for(const leaf of before){const next=after.find(l=>l.component.id===leaf.component.id);assert.deepEqual(next.placement,leaf.placement);assert.equal(JSON.stringify(next.component.def),defs[before.indexOf(leaf)]);}
 assert.equal(new Set(after.map(l=>l.component.def.customProperties.PartNo)).size,8);
 assert.equal(after.filter(l=>l.component.def.customProperties.PartNo==='AP03').length,4);
 for(const mate of a.topologyMates)for(const side of ['a','b','c'])if(mate[side]?.componentId===fields.id&&mate[side].kind!=='body')assert.match(mate[side].persistentId,/^4796\//);
 assert.equal(resolveComponentPath(r.component,'4796/plane:front').component.id,4796);
 const cold=solveAssemblyMates(a);assert.equal(cold.ok,true);assert.equal(cold.settled,true);assert.equal(cold.degreesOfFreedom,1);assert.deepEqual(cold.issues,[]);assert.deepEqual(cold.rebindings,[]);
});
test('nested column retains actual rack Drive, limit stops and same motor mate ID',()=>{
 const a=clone(),rack=a.topologyMates.find(m=>m.type==='rackpinion'),study=createMotionStudy(a,'Fullstroke'),motor=addRackPinionMotor(study,rack.id,-18/Math.PI);
 assert.equal(formSubassembly(a,selected(a),fields).ok,true);assert.equal(motor.mateId,rack.id);
 for(const turns of [-.25,-.5,-.954929658551372,0]){const result=setRackPinionMateDrive(a,rack.id,turns);assert.equal(result.ok,true,JSON.stringify(result));const ram=a.components.find(c=>c.def?.customProperties?.PartNo==='AP06');assert.ok(Math.abs(ram.transform.y-(9+2*Math.PI*turns))<1e-7);}
 setRackPinionMateDrive(a,rack.id,null);assert.equal(evaluateMotionStudy(a,study.id,10).ok,true);assert.ok(Math.abs(a.components.find(c=>c.def?.customProperties?.PartNo==='AP06').transform.y-3)<1e-7);
 const before=JSON.stringify(a);assert.equal(setRackPinionMateDrive(a,rack.id,-1).ok,false);assert.equal(JSON.stringify(a),before);
});
test('forming a nonrigid or mechanically referenced selection fails with no Undo or mutation',()=>{
 for(const select of [a=>[a.components[0].id,a.components.find(c=>c.def?.customProperties?.PartNo==='AP06').id],a=>[a.components.find(c=>c.def?.customProperties?.PartNo==='AP05').id,a.components.find(c=>c.def?.customProperties?.PartNo==='AP07').id],a=>[a.components[0].id],()=>['missing','missing2']]){
  const a=clone(),before=JSON.stringify(a);let undo=0;assert.equal(formSubassembly(a,select(a),fields,()=>undo++).ok,false);assert.equal(undo,0);assert.equal(JSON.stringify(a),before);
 }
});
test('duplicate group identity rejects before touching native mate data',()=>{const a=clone(),before=JSON.stringify(a);assert.equal(formSubassembly(a,selected(a),{...fields,id:a.components[0].id}).ok,false);assert.equal(JSON.stringify(a),before);});
test('existing explosion targets survive grouping, with 11 independent leaves and eight parts-only BOM roles',()=>{
 const a=clone(),view=createExplodedView(a,'Existing exploded view');a.components.forEach((c,i)=>addExplodeStep(view,[c.id],{x:i,y:i*2,z:i*3}));
 applyExplodedView(a,view.id);const before=new Map(flattenAssembly(a).map(l=>[l.component.id,explodedOccurrenceOffset(l)]));
 assert.equal(formSubassembly(a,selected(a),fields).ok,true);applyExplodedView(a,view.id);
 const leaves=flattenAssembly(a);for(const l of leaves)assert.deepEqual(explodedOccurrenceOffset(l),before.get(l.component.id));
 assert.equal(explodeTargets(a).filter(t=>t.component.kind!=='assembly').length,11);
 const rows=generateBOM({components:leaves.map(l=>l.component)});assert.equal(rows.length,8);assert.equal(rows.reduce((sum,row)=>sum+row.quantity,0),11);
});
test('study baseline is migrated deliberately; unsupported selected-body motion rejects atomically',()=>{
 const a=clone(),ids=selected(a),study=createMotionStudy(a,'Preserved baseline');assert.equal(formSubassembly(a,ids,fields).ok,true);
 const poses=a.motionStudies.find(s=>s.id===study.id).baseRotations.__assemblyPoses;assert.equal(poses.length,6);assert.ok(poses.some(p=>p.id===fields.id));assert.ok(!poses.some(p=>ids.includes(p.id)));
 for(const kind of ['motor','gear','baseline']){const trial=clone(),s=createMotionStudy(trial,'Unsupported');if(kind==='motor')s.motors.push({type:'rotary',componentId:trial.components[0].id,rpm:1});if(kind==='gear')s.gearRelations=[{driverId:trial.components[0].id,followerId:4803}];if(kind==='baseline')s.baseRotations.__assemblyPoses[0].transform.x=1;
  const before=JSON.stringify(trial);let undo=0;assert.equal(formSubassembly(trial,selected(trial),fields,()=>undo++).ok,false);assert.equal(JSON.stringify(trial),before);assert.equal(undo,0);
 }
});

