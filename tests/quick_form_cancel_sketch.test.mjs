import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Cancel dismisses a quick form before interpreting the active sketch confirmation corner',()=>{
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const start=source.indexOf('function cancelActiveCommand()'),end=source.indexOf('\nfunction featureSelectionReady()',start);
  const E={quickAction:'point-coordinates',authoring:{phase:'sketch',sketchId:'s'}},actions={hidden:true};
  let cancelled=0;
  const button={closest:()=>actions,click(){cancelled++;E.quickAction=null;}};
  const deps={E,root:{querySelector:()=>button},cancelCadWorkerWork(){throw Error('should not end the enclosing sketch');},confirmationCornerState(){throw Error('should use the quick form cancellation handler first');}};
  new Function(...Object.keys(deps),source.slice(start,end)+';cancelActiveCommand();')(...Object.values(deps));
  assert.equal(cancelled,1);assert.equal(E.authoring.phase,'sketch');assert.equal(E.authoring.sketchId,'s');assert.equal(actions.hidden,false);
});
