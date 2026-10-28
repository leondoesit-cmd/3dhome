import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage} from '../tools/browser_harness.mjs';

test('worker BREP restore initializes the main-thread kernel before synchronous native queries', {timeout:180000}, async t=>{
  const page=await openPage({width:1280,height:800});
  if(!page){t.skip('Chrome not installed');return;}
  try{
    const result=await page.evalWithTimeout(150000,async()=>{
      const {regenerateInCadWorker,cancelCadWorkerWork}=await import('/js/core/cad_worker_client.js');
      const {disposeBrep,loadCadKernel}=await import('/js/cad_kernel.js');
      const original={Instance:WebAssembly.Instance,instantiate:WebAssembly.instantiate,compile:WebAssembly.compile,fetch:window.fetch};
      let syncInstances=0,asyncInstances=0,compiles=0,downloads=0,body;
      const errors=[];
      const error=console.error;
      console.error=(...args)=>{errors.push(args.map(String).join(' '));error.apply(console,args);};
      WebAssembly.Instance=new Proxy(original.Instance,{construct(){syncInstances++;throw new RangeError('main-thread synchronous Instance forbidden by regression test');}});
      WebAssembly.instantiate=(module,imports)=>{
        if(!(module instanceof WebAssembly.Module))throw new Error('Main thread must reuse compiled WASM');
        asyncInstances++;return original.instantiate(module,imports);
      };
      WebAssembly.compile=bytes=>{compiles++;return original.compile(bytes);};
      window.fetch=(url,...args)=>{
        if(String(url).includes('opencascade.full.wasm'))downloads++;
        return original.fetch.call(window,url,...args);
      };
      try{
        const run=await regenerateInCadWorker({features:[{id:'box',type:'box',params:{w:2,h:3,d:4},inputs:[]}]});
        body=run.finalShape;
        const lazy=typeof Object.getOwnPropertyDescriptor(body,'oc').get==='function';
        // No await between restoration and the native query: the kernel must
        // already exist, even though deserializing the BREP is still lazy.
        const oc=body.oc,props=new oc.GProp_GProps_1();
        let volume;
        try{oc.BRepGProp.VolumeProperties_1(body.shape,props,false,false,false);volume=props.Mass();}
        finally{props.delete();}
        return {ok:run.ok,lazy,volume,subshapes:body.subshapes.size,isNull:body.shape.IsNull(),sameKernel:oc===await loadCadKernel(),syncInstances,asyncInstances,compiles,downloads,errors};
      }finally{
        disposeBrep(body);cancelCadWorkerWork();
        WebAssembly.Instance=original.Instance;WebAssembly.instantiate=original.instantiate;WebAssembly.compile=original.compile;window.fetch=original.fetch;console.error=error;
      }
    });
    assert.equal(result.ok,true);assert.equal(result.lazy,true);
    assert.ok(Math.abs(result.volume-24)<1e-7);assert.ok(result.subshapes>0);
    assert.equal(result.isNull,false);assert.equal(result.sameKernel,true);
    assert.equal(result.syncInstances,0);assert.equal(result.asyncInstances,1);
    assert.equal(result.compiles,1);assert.equal(result.downloads,1);
    assert.deepEqual([...result.errors,...page.consoleErrors].filter(message=>/RangeError|WebAssembly\.Instance is disallowed/.test(message)),[]);
  }finally{await page.close();}
});
