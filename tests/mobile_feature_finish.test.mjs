import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
const source=modelerSource();
function fixture(callback){
 const actions={hidden:true};let listener,clicks=0;
 const button={disabled:false,addEventListener(type,fn){listener=fn;},click(){clicks++;},closest:()=>actions};
 const btn=new Function('el',sourceFunctionText(source,'btn')+';return btn;')(()=>button);
 btn('Apply',callback,'md-quick-apply');
 const finish=new Function('root','confirmationCornerState','currentCornerInput','dynHasEntry','dynCommit',sourceFunctionText(source,'finishActiveCommand')+';return finishActiveCommand;')({querySelector:()=>button},()=>({mode:'feature'}),()=>({}),()=>false,()=>false);
 return {button,actions,finish,click:()=>listener.call(button),clicks:()=>clicks};
}
test('mobile Finish invokes hidden native Apply directly, preserving its validation and failure state',async()=>{
 let valid=false,commits=0;
 const f=fixture(()=>{if(!valid)return false;commits++;return true;});
 assert.equal(await f.finish(),false);assert.equal(commits,0);
 valid=true;assert.equal(await f.finish(),true);assert.equal(commits,1);
 assert.equal(f.actions.hidden,true);assert.equal(f.clicks(),0);
});
test('Finish and visible Apply share a single pending operation and allow retry after failure',async()=>{
 let calls=0,resolve;
 const f=fixture(()=>{calls++;return new Promise(r=>resolve=r);});
 const pending=f.finish();await f.finish();await f.click();assert.equal(calls,1);
 resolve(false);assert.equal(await pending,false);
 const retry=f.click();assert.equal(calls,2);resolve(true);assert.equal(await retry,true);
});
test('disabled native Apply remains disabled through mobile Finish; rejected operations release the guard',async()=>{
 let calls=0;const f=fixture(()=>{calls++;throw new Error('native validation');});
 f.button.disabled=true;await f.finish();assert.equal(calls,0);
 f.button.disabled=false;await assert.rejects(f.finish(),/native validation/);
 await assert.rejects(f.finish(),/native validation/);assert.equal(calls,2);
});
