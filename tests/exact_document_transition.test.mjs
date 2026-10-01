import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('document transition releases stale work without marking imported geometry as cancelled',()=>{
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const start=source.indexOf('function abandonDocumentExactWork()'),end=source.indexOf('\nfunction exactRunStamp()',start);
  const part={id:'body',exactPending:true},E={def:{parts:[part]},kernelBusy:true};
  const timers=new Map([[part,42]]),events=[];
  const deps={E,pendingCutController:{abort:()=>events.push('abort')},exactBuildTimers:timers,clearTimeout:id=>events.push(['timer',id]),exactRebuildQueue:{reset:()=>events.push('queue')},cancelCadWorkerWork:()=>events.push('worker'),releaseExactRun:()=>events.push('release')};
  new Function(...Object.keys(deps),source.slice(start,end)+';abandonDocumentExactWork();')(...Object.values(deps));
  assert.deepEqual(events,['abort',['timer',42],'queue','worker','release']);
  assert.equal(part.exactPending,false);assert.equal(part.exactBuildToken,1);assert.equal(timers.size,0);assert.equal(E.kernelBusy,false);
  assert.equal(part.exactError,undefined,'imported geometry is not diagnosed as a failed build');
});
