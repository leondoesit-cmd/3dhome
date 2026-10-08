import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let source = fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
source = source.replace(/\r\n/g,"\n");
const cancelledCheck=source.slice(source.indexOf('function exactPreviewWasCancelled()'),source.indexOf('\n\n',source.indexOf('function exactPreviewWasCancelled()')));
const cancel=source.slice(source.indexOf('function cancelExactModelRebuild()'),source.indexOf('\nfunction scheduleExactRestore()',source.indexOf('function cancelExactModelRebuild()')));
test('Cancel suppresses same-head automatic previews, clears timers and invalidates pending publication',()=>{
  const part={exactBuildToken:7,exactPending:true},E={def:{parts:[part]},kernelBusy:true};
  const timers=new WeakMap([[part,23]]);let node=4,resets=0,workerCancels=0,cleared=[];
  const actions=new Function('E','currentHistoryNode','exactBuildTimers','clearTimeout','exactRebuildQueue','cancelCadWorkerWork','retainingExactPreview',
    'var cancelledExactPreview=null,pendingCutController=null;'+cancelledCheck+cancel+';return {cancel:cancelExactModelRebuild,blocked:exactPreviewWasCancelled};')(
    E,()=>node,timers,value=>cleared.push(value),{reset(){resets++;}},()=>workerCancels++,()=>false);
  actions.cancel();assert.equal(actions.blocked(),true);assert.deepEqual(cleared,[23]);assert.equal(timers.has(part),false);
  assert.equal(part.exactBuildToken,8);assert.equal(part.exactPending,false);assert.equal(E.kernelBusy,false);
  assert.equal(resets,1);assert.equal(workerCancels,1);
  node=5;assert.equal(actions.blocked(),false,'new authored geometry permits a fresh preview');
  node=4;E.def={parts:[]};assert.equal(actions.blocked(),false,'another document is independent');
});
