import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';
import {applyDrivenAssemblyPlacement} from '../js/core/assembly_placement.js';
import {createMotionStudy,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {createMotionPlayback} from '../js/core/motion_playback.js';
import {createMotionPlaybackExecutor} from '../js/core/motion_playback_executor.js';
import {putAssemblyLibraryRecord,loadAssemblyLibrary} from '../js/core/model_library_store.js';

const body=(id,x,grounded=false)=>({id,transform:{x},grounded});
const group=(id,components)=>({...body(id,0),kind:'assembly',asm:{components}});
function fixture(){
  const branch=(id,x,target)=>{
    const stem=body('stem',x),seat=body('seat',target,true),follower=body('follower',x);
    const sleeve=body('sleeve',x);
    delete sleeve.grounded;
    sleeve.contextIssue='old diagnostic';
    sleeve.inContext={parentId:'stem',reference:{componentId:'stem',persistentId:'plane:right'}};
    const parent=group(id,[stem,seat,follower,sleeve]);
    parent.asm.mates=[{id:'seat-stem',type:'alignX',a:'seat',b:'stem'}];
    parent.asm.topologyMates=[{id:'lock',type:'lock',a:{componentId:'stem',kind:'body'},b:{componentId:'follower',kind:'body'}}];
    return parent;
  };
  const left=branch('left',2,5),right=branch('right',3,9),outer=group('outer',[left,right]);
  outer.grounded=true;
  const sleeve=body('sleeve',2);
  sleeve.inContext={parentId:'outer',occurrencePath:['outer','left','stem'],reference:{componentId:'stem',persistentId:'plane:right'}};
  const driver=body('driver',0);
  const assembly={components:[outer,sleeve,body('anchor',0,true),driver],
    mates:[{id:'hold',type:'alignX',a:'anchor',b:'driver'}],topologyMates:[]};
  const study=createMotionStudy(assembly);
  return {assembly,study,left,right,driver,sleeve};
}
const near=(actual,want)=>assert.ok(Math.abs(actual-want)<1e-7,`${actual} versus ${want}`);
function assertSolved(assembly){
  const branches=assembly.components.find(c=>c.id==='outer').asm.components;
  const left=branches.find(c=>c.id==='left'),right=branches.find(c=>c.id==='right');
  for(const [branch,x] of [[left,5],[right,9]]){
    for(const id of ['stem','follower','sleeve'])near(branch.asm.components.find(c=>c.id===id).transform.x,x);
    assert.equal(branch.asm.components.find(c=>c.id==='sleeve').contextIssue,undefined);
    assert.ok(Object.keys(branch.asm.topologyMates[0]).length>4,'lock zero captured');
  }
  near(assembly.components.find(c=>c.id==='sleeve').transform.x,5);
}
function workerFactory(){
  const source=`import {parentPort} from 'node:worker_threads';
    globalThis.self={postMessage:message=>parentPort.postMessage(message)};
    const ready=import(${JSON.stringify(new URL('../js/motion_playback_worker.js',import.meta.url).href)});
    parentPort.on('message',message=>ready.then(()=>self.onmessage({data:message})));`;
  const worker=new Worker(new URL('data:text/javascript,'+encodeURIComponent(source)));
  const adapter={postMessage:message=>worker.postMessage(message),terminate:()=>worker.terminate()};
  worker.on('message',data=>adapter.onmessage({data}));
  worker.on('error',error=>adapter.onerror(error));
  return adapter;
}
const playbackOptions=evaluate=>({evaluate,requestFrame:()=>1,cancelFrame(){}});

test('placement rollback retains occurrence and mate identities and unrelated document edits',()=>{
  const {assembly,driver,left}=fixture();
  const stem=left.asm.components[0],lock=left.asm.topologyMates[0],rows=left.asm.topologyMates;
  stem.def={parts:[],notes:'opening'};
  const result=applyDrivenAssemblyPlacement(assembly,driver,{x:1},options=>{
    const result=solveAssemblyMates(assembly,options);
    stem.def.notes='edited';
    left.asm.name='renamed';
    return result;
  });
  assert.equal(result.ok,false);
  near(stem.transform.x,2);
  assert.equal(stem.def.notes,'edited');
  assert.equal(left.asm.name,'renamed');
  assert.equal(left.asm.components[0],stem);
  assert.equal(left.asm.topologyMates,rows);
  assert.equal(rows[0],lock);
  assert.equal(Object.hasOwn(lock,'relativePose'),false);
});

for(const outcome of ['reject','throw','success']){
  test('typed placement restores all occurrence state on '+outcome,()=>{
    const {assembly,driver,left}=fixture(),before=structuredClone(assembly);
    const run=()=>applyDrivenAssemblyPlacement(assembly,driver,{x:outcome==='success'?0:1},options=>{
      const result=solveAssemblyMates(assembly,options);
      near(left.asm.components[0].transform.x,5);
      if(outcome==='throw')throw new Error('after nested solve');
      return result;
    });
    if(outcome==='throw')assert.throws(run,/after nested solve/);
    else assert.equal(run().ok,outcome==='success');
    if(outcome==='success')assertSolved(assembly);
    else assert.deepEqual(assembly,before);
  });
}

for(const worker of [false,true])for(const keep of [false,true]){
  test((worker?'worker':'local')+' nested preview '+(keep?'Keep and reopen':'Cancel'),async()=>{
    const {assembly,study}=fixture(),before=structuredClone(assembly);
    const executor=worker?createMotionPlaybackExecutor(assembly,{createWorker:workerFactory}):null;
    let undo;
    const playback=createMotionPlayback(assembly,study.id,{...playbackOptions(executor?.evaluate||evaluateMotionStudy),
      beforeCommit:()=>{undo=structuredClone(assembly);}});
    try{
      assert.equal(await playback.seek(.1),true);
      assertSolved(assembly);
      if(keep){
        assert.equal(playback.keep(),true);
        assert.deepEqual(undo,before);
        assertSolved(assembly);
        assembly.key='nested-playback-'+worker;
        assert.ok((await putAssemblyLibraryRecord(assembly)).ok);
        const reopened=(await loadAssemblyLibrary()).find(item=>item.key===assembly.key);
        assertSolved(reopened);
        assert.ok(solveAssemblyMates(reopened).ok);
        assertSolved(reopened);
      }else{
        playback.cancel();
        assert.deepEqual(assembly,before);
      }
    }finally{playback.cancel();executor?.dispose();}
  });
}

for(const worker of [false,true]){
  test((worker?'worker':'local')+' failed nested preview is atomic and can recover',async()=>{
    const {assembly,study,left}=fixture();
    assembly.topologyMates.push({id:'broken',type:'distance',value:1,
      a:{componentId:'missing'},b:{componentId:'driver'}});
    const executor=worker?createMotionPlaybackExecutor(assembly,{createWorker:workerFactory}):null;
    const playback=createMotionPlayback(assembly,study.id,playbackOptions(executor?.evaluate||evaluateMotionStudy));
    try{
      const before=structuredClone(assembly);
      assert.equal(await playback.seek(.1),false);
      assert.deepEqual(assembly,before);
      assert.equal(Object.hasOwn(left.asm.topologyMates[0],'relativePose'),false);
      assembly.topologyMates=[];
      assert.equal(await playback.seek(.2),true);
      assertSolved(assembly);
      const accepted=structuredClone(assembly);
      assembly.topologyMates=[before.topologyMates[0]];
      const failed=structuredClone(assembly);
      assert.equal(await playback.seek(.3),false);
      assert.deepEqual(assembly,failed);
      near(left.asm.components[0].transform.x,5);
      assembly.topologyMates=accepted.topologyMates;
      assert.equal(playback.keep(),true);
      assertSolved(assembly);
    }finally{playback.cancel();executor?.dispose();}
  });

  test((worker?'worker':'local')+' late nested result after Cancel cannot publish',async()=>{
    const {assembly,study,left}=fixture(),before=structuredClone(assembly);
    const executor=worker?createMotionPlaybackExecutor(assembly,{createWorker:workerFactory}):null;
    let finish;
    const playback=createMotionPlayback(assembly,study.id,playbackOptions(
      (...args)=>new Promise(resolve=>{finish=async()=>resolve(await (executor?.evaluate||evaluateMotionStudy)(...args));})));
    try{
      const pending=playback.seek(.1);
      playback.cancel();
      left.asm.name='independent edit';
      await finish();
      assert.equal(await pending,false);
      before.components[0].asm.components[0].asm.name='independent edit';
      assert.deepEqual(assembly,before);
    }finally{playback.cancel();executor?.dispose();}
  });
}

test('worker state follows occurrence paths through reordered parents and repeated leaf and mate IDs',async()=>{
  const {assembly,study}=fixture(),expected=structuredClone(assembly);
  const executor=createMotionPlaybackExecutor(assembly,{createWorker:workerFactory});
  try{
    assembly.components.reverse();
    assembly.components.find(c=>c.id==='outer').asm.components.reverse();
    assert.ok((await executor.evaluate(assembly,study.id,.1)).ok);
    assert.ok(evaluateMotionStudy(expected,study.id,.1).ok);
    assertSolved(assembly);
    expected.components.reverse();
    expected.components.find(c=>c.id==='outer').asm.components.reverse();
    assert.deepEqual(assembly,expected);
  }finally{executor.dispose();}
});
