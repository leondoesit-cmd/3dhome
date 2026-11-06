import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {detectInterference} from '../js/cad_interference.js';
import {assemblyInterferenceScope} from '../js/core/assembly_interference_scope.js';
import {contactAuditSummary,expectedContactFor} from '../js/core/assembly_contact_audit.js';
import {hasSingleToolboxKernelRecipe} from '../js/cad_assembly_toolbox.js';
import {rotationOf} from '../js/cad_mate_model.js';

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture(exact,detect){
  const source=modelerSource();
  const interferenceCheck=['cancelInterferenceCheck','runInterferenceCheck','renderAssemblyInterferenceReport'].map(name=>sourceFunctionText(source,name)).join('\n');
  const reports=[],released=[],messages=[],card={children:[],appendChild(item){this.children.push(item);}};
  const E={docType:'assembly',assembly:{},interferenceRevision:0,interferenceChecked:false,evalCard:null};
  const context={E,AbortController,Map,rejectFlexibleSpringPreview:()=>false,assemblyInterferenceScope,contactAuditSummary,expectedContactFor,hasSingleToolboxKernelRecipe,rotationOf,
    cadWorkerAvailable:()=>false,el:(tag,className,textContent='')=>({tag,className,textContent}),btn:(label,action)=>({label,action}),t:key=>key,
    flattenAssembly:()=>[{component:{id:'a',name:'A'},path:['a'],parents:[],placement:{}},{component:{id:'b',name:'B'},path:['b'],parents:[],placement:{}}],
    occurrenceWorldBounds:()=>({x0:0,x1:1,y0:0,y1:1,z0:0,z1:1}),
    openEvalCard:owner=>{E.evalCard=owner;return card;},evalCardActions:()=>card,closeEvalCard:()=>{E.evalCard=null;},
    exactInterferenceBrep:exact,detectInterference:detect,disposeBrep:body=>released.push(body),
    flash:text=>messages.push(text),report:(...args)=>reports.push(args),syncAssemblyWorkflow:()=>{},updatePreview:()=>{},tf:()=>'',componentLabel:id=>id};
  runInNewContext(interferenceCheck+'\nthis.run=runInterferenceCheck;this.cancel=cancelInterferenceCheck;',context);
  return {context,E,reports,released,messages,card,progressText:()=>card.children.find(item=>item.textContent?.startsWith('interferenceStage'))};
}

test('a second Check cannot duplicate an active job; cancel aborts scoped work and frees already placed solids',async()=>{
  const pending=deferred(),started=deferred(),first={shape:'first'};let calls=0,signal;
  const f=fixture(async(component,placement,progress,options)=>{
    calls++;if(calls===1)return first;
    signal=options.signal;signal.addEventListener('abort',()=>pending.reject(new DOMException('cancelled','AbortError')),{once:true});started.resolve();return pending.promise;
  },()=>{throw new Error('cancelled work cannot compare');});
  const run=f.context.run();await started.promise;
  assert.equal(calls,2);assert.ok(f.E.interferenceJob);
  await f.context.run();assert.equal(calls,2,'duplicate click must not launch a third exact rebuild');
  f.context.cancel();assert.equal(signal.aborted,true);await run;
  assert.deepEqual(f.released,[first]);assert.equal(f.E.interferenceJob,null);
  assert.equal(f.E.interferenceChecked,false);assert.equal(f.reports.length,0);
  assert.ok(f.messages.includes('interferenceCancelled'));
});

test('comparison progress persists in the evaluation card and a stale result cannot publish a clean check',async()=>{
  const pending=deferred(),comparing=deferred();
  const f=fixture(async component=>({shape:component.id}),async(components,options)=>{
    options.onProgress({a:'a',b:'b',stage:'intersection'});comparing.resolve();return pending.promise;
  });
  const run=f.context.run();await comparing.promise;
  assert.equal(f.progressText().textContent,'interferenceStageintersection · A ↔ B');
  f.E.interferenceRevision++;
  pending.resolve([]);await run;
  assert.equal(f.E.interferenceChecked,false);assert.equal(f.reports.length,0);
  assert.equal(f.released.length,2);assert.equal(f.E.evalCard,null);
});

test('a completed current job publishes the exact result and releases its progress card',async()=>{
  const f=fixture(async component=>({shape:component.id}),async()=>[]);
  await f.context.run();assert.equal(f.E.interferenceChecked,true);
  assert.equal(f.E.interferenceJob,null);assert.equal(f.E.evalCard,null);
  assert.equal(f.reports[0][1],'interferenceNone');assert.equal(f.released.length,2);
});

test('worker cancellation also leaves an explicit cancelled status and never a clean result',async()=>{
  const f=fixture(async()=>{throw new DOMException('worker stopped','AbortError');},async()=>[]);
  await f.context.run();assert.equal(f.E.interferenceChecked,false);
  assert.equal(f.E.interferenceJob,null);assert.equal(f.reports.length,0);
  assert.ok(f.messages.includes('interferenceCancelled'));
});

test('browser interference remains a single scoped worker job and never restores native solids in the UI',async()=>{
  const pending=deferred();let calls=0,signal;
  const f=fixture(()=>{throw new Error('UI must not hydrate or place native solids');},()=>{throw new Error('UI must not run native intersections');});
  f.context.cadWorkerAvailable=()=>true;
  f.context.componentDef=()=>({metadata:{authoringSystem:'parametric-v1'},parts:[{}],features:[]});
  f.context.activeParts=def=>def.parts;
  f.context.interferenceDocument=def=>({features:def.features,parts:[]});
  f.context.flattenAssembly=()=>[{component:{id:'a',name:'A'},path:['a'],parents:[],placement:{x:{x:1,y:0,z:0},y:{x:0,y:1,z:0},z:{x:0,y:0,z:1},origin:{x:2,y:3,z:4}}}];
  f.context.interferenceInCadWorker=(components,options)=>{
    calls++;signal=options.signal;
    assert.equal(components[0].placement.translation.x,2);
    assert.equal(components[0].document.parts.length,0);
    options.onProgress({stage:'placement',componentId:'a',name:'A'});
    signal.addEventListener('abort',()=>pending.reject(new DOMException('stopped','AbortError')),{once:true});
    return pending.promise;
  };
  const run=f.context.run();await f.context.run();assert.equal(calls,1);
  assert.equal(f.progressText().textContent,'interferenceStageplacement · A · A');
  f.context.cancel();assert.equal(signal.aborted,true);await run;
  assert.equal(f.E.interferenceChecked,false);assert.equal(f.reports.length,0);
});

test('the detector respects cancellation before comparing the next component pair',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(detectInterference([{id:'a'},{id:'b'}],{signal:controller.signal}),{name:'AbortError'});
});
