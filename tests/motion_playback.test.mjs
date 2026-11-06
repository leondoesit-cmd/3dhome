import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMotionPlayback,motionPreviewDuration,motionPlaybackStepSeconds} from '../js/core/motion_playback.js';
import {createMotionPlaybackExecutor} from '../js/core/motion_playback_executor.js';
import {createMotionStudy,addRotaryMotor,addRackPinionMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {captureAssemblySolverState,restoreAssemblySolverState} from '../js/core/assembly_solver_state.js';
import vm from 'node:vm';
import {sourceFunctionText} from './helpers/source_function.mjs';
const original=JSON.parse(readFileSync(new URL('./fixtures/welder_arm_23_mate_motion.json',import.meta.url)));
function fixture(evaluate=evaluateMotionStudy){
  const assembly=structuredClone(original);assembly.topologyMates.find(m=>m.type==='gear').reverse=false;
  const study=createMotionStudy(assembly,'Native yaw');addRotaryMotor(study,3389,12,{x:0,y:1,z:0},{x:0,y:0,z:0});
  const frames=new Map(),states=[];let seq=0,commitPose;
  const playback=createMotionPlayback(assembly,study.id,{evaluate,requestFrame:fn=>{frames.set(++seq,fn);return seq;},cancelFrame:id=>frames.delete(id),
    onState:state=>states.push(state),beforeCommit:()=>commitPose=assembly.components.map(c=>structuredClone(c.transform))});
  return {assembly,study,playback,frames,states,get commitPose(){return commitPose;}};
}
test('native playback seeks the real 23-mate mechanism, Reset restores study zero and Cancel restores opening whole pose',async()=>{
  const f=fixture(),home=f.assembly.components.map(c=>structuredClone(c.transform));
  assert.equal(f.playback.state.duration,5,'12 RPM defaults to a full motor period');
  assert.equal(await f.playback.seek(1.25),true);
  assert.ok(Math.abs(f.assembly.components.find(c=>c.id===3389).transform.ry-90)<1e-4);
  assert.equal(f.states.at(-1).result.unsatisfied.length,0);
  assert.equal(await f.playback.reset(),true);
  f.assembly.components.forEach((c,i)=>['x','y','z','rx','ry','rz'].forEach(key=>assert.ok(Math.abs((c.transform[key]||0)-(home[i][key]||0))<1e-5)));
  await f.playback.seek(.5);f.playback.cancel();
  assert.deepEqual(f.assembly.components.map(c=>c.transform),home);
  assert.equal(f.assembly.motionStudies[0].time,undefined,'Cancel restores saved study state too');
});
test('Keep commits only an accepted pose with original whole pose available for Undo and duration cold persistence',async()=>{
  const f=fixture(),home=f.assembly.components.map(c=>structuredClone(c.transform));
  f.playback.setDuration(7);await f.playback.seek(.25);const kept=f.assembly.components.map(c=>structuredClone(c.transform));
  assert.equal(f.playback.keep(),true);assert.deepEqual(f.commitPose,home);assert.deepEqual(f.assembly.components.map(c=>c.transform),kept);
  assert.equal(motionPreviewDuration(JSON.parse(JSON.stringify(f.assembly.motionStudies[0]))),7);
  f.playback.cancel();assert.deepEqual(f.assembly.components.map(c=>c.transform),kept,'closed committed preview cannot restore old pose');
});
test('Play is paced, Pause cancels pending frames, and no overlapping native solve is requested',async()=>{
  let finish,calls=0;
  const f=fixture((assembly,id,time)=>{calls++;return new Promise(resolve=>finish=()=>resolve(evaluateMotionStudy(assembly,id,time)));});
  await f.playback.play();let frame=f.frames.entries().next().value;f.frames.delete(frame[0]);await frame[1](1000);
  frame=f.frames.entries().next().value;f.frames.delete(frame[0]);const pending=frame[1](1100);
  assert.equal(calls,1);assert.equal(f.playback.state.busy,true);assert.equal(await f.playback.seek(.2),false);assert.equal(calls,1);
  f.playback.pause();finish();await pending;assert.equal(f.frames.size,0);assert.equal(f.playback.state.running,false);
});

test('slow coupled playback advances by at most a quarter turn per request and reaches the exact endpoint',async()=>{
 const rpm=-61.289674428888,duration=10,calls=[],frames=new Map();let serial=0;
 const assembly={components:[{id:'shaft',transform:{}}],topologyMates:[],motionStudies:[{id:'study',time:0,previewDurationSeconds:duration,motors:[{type:'screw',rpm}]}]};
 const playback=createMotionPlayback(assembly,'study',{evaluate:async(trial,id,time,options)=>{calls.push({time,options});trial.motionStudies[0].time=time;return {ok:true};},
  requestFrame:fn=>{frames.set(++serial,fn);return serial;},cancelFrame:id=>frames.delete(id)});
 await playback.play();let now=1000;
 while(frames.size){const [id,fn]=frames.entries().next().value;frames.delete(id);await fn(now);now+=2500;}
 assert.equal(playback.state.time,duration);assert.equal(playback.state.running,false);
 assert.equal(calls.length,41,'10.2149457 revolutions need 41 bounded requests instead of 100');
 let prior=0;
 for(const call of calls){assert.equal(call.options.incremental,true);assert.ok(Math.abs(rpm*(call.time-prior)/60)<=.250000001);prior=call.time;}
 assert.equal(calls.at(-1).time,duration);
 assert.equal(motionPlaybackStepSeconds({motors:[{type:'screw',rpm:600}]}),.025);
 assert.equal(motionPlaybackStepSeconds({motors:[{type:'screw',rpm:1}]}),.5);
 assert.equal(motionPlaybackStepSeconds({motors:[{type:'rotary',rpm:12}]}),.1);
 assert.equal(motionPlaybackStepSeconds({motors:[{type:'rackpinion',rpm:60}]}),.25);
});
test('cancel during an asynchronous solve prevents its late result from moving the assembly',async()=>{
  let finish;const f=fixture((assembly,id,time)=>new Promise(resolve=>finish=()=>resolve(evaluateMotionStudy(assembly,id,time))));
  const before=JSON.stringify(f.assembly.components.map(c=>c.transform)),pending=f.playback.seek(1);
  f.playback.cancel();finish();assert.equal(await pending,false);assert.equal(JSON.stringify(f.assembly.components.map(c=>c.transform)),before);
});
test('failed native mate evaluation pauses playback and publishes no partial pose',async()=>{
  const f=fixture(async assembly=>{assembly.components[0].transform.x=999;return {ok:false,unsatisfied:[{code:'conflicting-mates'}]};});
  const before=JSON.stringify(f.assembly.components.map(c=>c.transform));assert.equal(await f.playback.seek(.25),false);
  assert.equal(JSON.stringify(f.assembly.components.map(c=>c.transform)),before);assert.match(f.states.at(-1).message,/conflicting-mates/);
});
test('replacing the active document during a solve disposes playback and rejects its late pose',async()=>{
  const assembly={components:[{id:'shaft',transform:{rz:0}}],motionStudies:[{id:'study',motors:[{type:'rotary',rpm:12}]}],topologyMates:[]};
  let current=true,finish,disposed=0;
  const playback=createMotionPlayback(assembly,'study',{evaluate:trial=>new Promise(resolve=>finish=()=>{trial.components[0].transform.rz=90;resolve({ok:true});}),
    requestFrame:()=>1,cancelFrame:()=>{},isCurrent:()=>current,onClose:()=>disposed++});
  const pending=playback.seek(1.25);current=false;finish();assert.equal(await pending,false);
  assert.equal(assembly.components[0].transform.rz,0);assert.equal(disposed,1);assert.equal(playback.state.closed,true);
});
test('dedicated worker initializes definitions once and later requests carry only poses and mate/study state',async()=>{
  const f=fixture(),messages=[];let worker;
  const source=readFileSync(new URL('../js/motion_playback_worker.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'');
  const executor=createMotionPlaybackExecutor(f.assembly,{createWorker:()=>{
    const scope={postMessage:message=>queueMicrotask(()=>worker.onmessage({data:structuredClone(message)}))};
    new Function('self','evaluateMotionStudy','captureAssemblySolverState','restoreAssemblySolverState',source)(
      scope,evaluateMotionStudy,captureAssemblySolverState,restoreAssemblySolverState);
    worker={postMessage:message=>{messages.push(message);queueMicrotask(()=>scope.onmessage({data:structuredClone(message)}));},terminate(){this.terminated=true;}};return worker;
  }});
  assert.equal((await executor.evaluate(f.assembly,f.study.id,.25,{incremental:true})).ok,true);
  const next=await executor.evaluate(f.assembly,f.study.id,.35,{incremental:true});
  assert.equal(next.ok,true);assert.equal(next.motionSubsteps,2,'worker retains guarded cursor: 7.2° forward delta uses two ≤5° solves');
  assert.equal((await executor.evaluate(f.assembly,f.study.id,0)).ok,true);
  assert.equal(messages.filter(m=>m.assembly).length,1);assert.equal(messages[1].assembly,undefined);
  assert.equal(messages[1].poses.length,18);executor.dispose();assert.equal(worker.terminated,true);
});

test('motion preview assembles nested explode offsets and restores presentation on Cancel and Keep without changing recipes',async()=>{
  for(const keep of [false,true]){
    const def={featureHistory:[{id:'native'}]},child={id:'child',def,explodedOffset:{x:2,y:3,z:4}};
    const assembly={exploded:true,activeExplodedView:'saved',explodedViews:[{id:'saved',steps:[{direction:{x:10}}]}],
      components:[{id:'shaft',def,transform:{rz:0},explodedOffset:{x:10,y:0,z:0},asm:{components:[child]}},{id:'plain',transform:{}}],
      motionStudies:[{id:'study',motors:[{rpm:12}]}],topologyMates:[]};
    const before=JSON.stringify(assembly.explodedViews);let undoPresentation;
    const playback=createMotionPlayback(assembly,'study',{evaluate:async trial=>{trial.components[0].transform.rz=90;return {ok:true};},
      requestFrame:()=>1,cancelFrame:()=>{},beforeCommit:()=>undoPresentation=assembly.components[0].explodedOffset.x});
    assert.equal(assembly.exploded,false);assert.equal(child.explodedOffset,null);assert.equal(assembly.components[0].explodedOffset,null);
    await playback.seek(1.25);if(keep)playback.keep();else playback.cancel();
    assert.equal(assembly.exploded,true);assert.deepEqual(child.explodedOffset,{x:2,y:3,z:4});
    assert.deepEqual(assembly.components[0].explodedOffset,{x:10,y:0,z:0});assert.equal(Object.hasOwn(assembly.components[1],'explodedOffset'),false);
    assert.equal(assembly.components[0].transform.rz,keep?90:0);assert.equal(assembly.components[0].def,def);
    assert.equal(JSON.stringify(assembly.explodedViews),before);assert.equal(assembly.activeExplodedView,'saved');
    if(keep)assert.equal(undoPresentation,10,'Undo snapshots opening presentation, not the temporary assembled preview');
  }
});

test('browser playback frame callbacks avoid an illegal options receiver and close without rebuilding or solving',()=>{
  const source=modelerSource();
  const body=source.slice(source.indexOf('function openMotionPlayback('),source.indexOf('function createDefaultMotionStudy('));
  const callbacks=body.match(/requestFrame:(callback=>requestAnimationFrame\(callback\)),cancelFrame:(id=>cancelAnimationFrame\(id\))/);
  assert.ok(callbacks,'Platform animation APIs must be wrapped, not called as options methods');
  let requested=false,cancelled=false;
  const factory=new Function('requestAnimationFrame','cancelAnimationFrame','return {requestFrame:'+callbacks[1]+',cancelFrame:'+callbacks[2]+'};');
  const options=factory(function(callback){assert.notEqual(this,options);requested=true;callback();return 7;},function(id){assert.notEqual(this,options);assert.equal(id,7);cancelled=true;});
  const id=options.requestFrame(()=>{});options.cancelFrame(id);assert.ok(requested&&cancelled);
  assert.equal((body.match(/closeFeaturePanel\(\{assemblyPoseOnly:true\}\)/g)||[]).length,2);
  assert.equal((body.match(/refreshAll\(\{assemblyPoseOnly:true,skipAssemblySolve:true\}\)/g)||[]).length,2);
});

test('preview duration honors the authored endpoint while preserving an explicit saved duration',()=>{
  assert.equal(motionPreviewDuration({time:10,motors:[{type:'screw',rpm:-75}]}),10);
  assert.equal(motionPreviewDuration({time:0,motors:[{type:'screw',rpm:-75}]}),.8);
  assert.equal(motionPreviewDuration({time:10,previewDurationSeconds:12,motors:[{rpm:-75}]}),12);
  assert.equal(motionPreviewDuration({time:Infinity,motors:[{rpm:12}]}),5);
  assert.equal(motionPreviewDuration({time:10,motors:[{type:'rackpinion',rpm:-5.72957795130823}]}),10);
  assert.equal(motionPreviewDuration({time:2,motors:[{type:'linear',duration:5,reciprocate:true}]}),2);
});

test('browser-authored Arbor press full stroke preview ends at saved ten seconds before the native rack stop',async()=>{
 const bundle=JSON.parse(readFileSync(new URL('../artifacts/planchard/AP-assembly-free-home-browser-2026-10-08.mforge',import.meta.url)));
 const assembly=structuredClone(bundle.assemblies[0]),rack=assembly.topologyMates.find(mate=>mate.type==='rackpinion');
 const study=createMotionStudy(assembly,'Test saved browser endpoint');addRackPinionMotor(study,rack.id,-5.72957795130823);study.time=10;
 const playback=createMotionPlayback(assembly,study.id,{evaluate:evaluateMotionStudy,requestFrame:()=>1,cancelFrame(){}});
 assert.equal(playback.state.duration,10);assert.equal(await playback.reset(),true);assert.equal(await playback.seek(10),true);
 assert.ok(Math.abs(assembly.components.find(component=>component.id===rack.b.componentId).transform.y-3)<1e-9,'native full stroke reaches the30mm stop');
 const accepted=JSON.stringify(assembly.components.map(component=>component.transform));
 assert.equal(await playback.seek(60/5.72957795130823),false,'one whole turn must fall outside the default preview');
 assert.equal(JSON.stringify(assembly.components.map(component=>component.transform)),accepted);playback.cancel();
});

test('actual preview UI commits duration on Enter, Play, Reset and Keep without depending on blur',async()=>{
  const assembly={components:[{id:'shaft',transform:{x:0}}],topologyMates:[],motionStudies:[{id:'study',name:'Arbor press full stroke',time:10,motors:[{type:'rackpinion',rpm:-5.72957795130823}]}]};
  const buttons=[],node=()=>({children:[],listeners:{},appendChild(child){this.children.push(child);},append(...children){this.children.push(...children);},setAttribute(){},addEventListener(name,callback){this.listeners[name]=callback;}});
  const actions=node(),host=node();host.querySelector=()=>actions;
  let inputs,playback,undos=0;
  const context={E:{assembly,docType:'assembly'},root:{querySelector:()=>host},motionPreviewDuration,
    openQuickForm:spec=>{inputs={duration:Object.assign(node(),{value:String(spec.fields[0].value)})};return inputs;},
    el:()=>node(),btn:(label,action)=>{const button={label,action};buttons.push(button);return button;},
    createMotionPlayback:(...args)=>playback=createMotionPlayback(...args),
    createMotionPlaybackExecutor:()=>({dispose(){},evaluate:async(trial,id,time)=>{trial.motionStudies[0].time=time;return{ok:true};}}),
    requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},invalidateInterference:()=>{},refreshAssemblyPosePreview:()=>true,
    renderPreview:()=>{},syncDirty:()=>{},pushUndo:()=>undos++,closeFeaturePanel:()=>{},refreshAll:()=>{}};
  const source=modelerSource();
  vm.runInNewContext('var motionPlaybackCancel=null;'+sourceFunctionText(source,'openMotionPlayback')+';openMotionPlayback("study");',context);
  assert.equal(inputs.duration.value,'10');assert.equal(playback.state.duration,10);
  inputs.duration.value='12';let prevented=false,stopped=false;
  inputs.duration.listeners.keydown({key:'Enter',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  assert.equal(playback.state.duration,12);assert.ok(prevented&&stopped);
  inputs.duration.value='10';await buttons.find(button=>button.label==='Reset').action();
  assert.equal(playback.state.duration,10);assert.equal(playback.state.time,0);
  inputs.duration.value='20';await buttons.find(button=>button.label==='Play').action();
  assert.equal(playback.state.duration,20);assert.equal(playback.state.running,true);
  buttons.find(button=>button.label==='Pause').action();inputs.duration.value='0';
  await buttons.find(button=>button.label==='Play').action();
  assert.equal(inputs.duration.value,'20');assert.equal(playback.state.running,false,'invalid duration cannot start playback');
  inputs.duration.value='14';buttons.find(button=>button.label==='Keep current pose').action();
  assert.equal(assembly.motionStudies[0].previewDurationSeconds,14);assert.equal(undos,1);
});
